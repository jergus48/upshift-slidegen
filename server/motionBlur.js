// Optical-flow motion blur — the look people buy ReelSmart Motion Blur (RSMB)
// for, built out of the local ffmpeg binary instead.
//
// How it works, and why it is two stages: `minterpolate` estimates motion
// between real frames and synthesises new ones between them (the same job RSMB
// does), and `tmix` then averages those synthetic frames back down to the
// delivery rate. Averaging N sub-frames into one is literally what a camera
// shutter does, so what comes out is a real motion blur — long on fast movement,
// absent where nothing moves — rather than the ghost trail you get from blending
// finished frames.
//
// CUTS ARE PROCESSED SEPARATELY, which is the part that matters. Optical flow
// across a hard cut tries to find motion between two unrelated shots and morphs
// one into the other — a smeared mess exactly where the edit is sharpest. So the
// video is split at its cuts, each shot is blurred alone, and the pieces are
// concatenated back. RSMB has the same weakness; editors mask around it by hand.
//
// Cost used to be the catch — 42x real time. Two changes fixed it: the blend
// engine below, and blurring the shots in parallel since they are independent by
// construction. A 15-second export went from about 10 minutes to under 30
// seconds.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cpus } from 'node:os'
import { logger } from './log.js'

const run = promisify(execFile)
const log = logger('motion-blur')

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg'
const MAX_BUFFER = 32 * 1024 * 1024
const TIMEOUT_MS = 30 * 60 * 1000

// Strength is a SHUTTER ANGLE, which is the honest name for what the numbers do.
// Averaging `frames` sub-frames taken at `fps` blurs over frames/fps seconds; at
// 30fps output a 33ms span is one whole frame — a 360 degree shutter, the widest
// a real camera can open. Going past that is what produces the heavy smear
// people associate with RSMB (its "blur amount" above 1), and it is why `light`
// alone reads as subtle.
//
// Measured on a beat-cut clip, sharpness lost where the picture moves:
// light 15.7%, medium 26.7%, heavy 34.3%, extreme 42.8%. Still frames stay at
// 3-6% throughout, which is just the re-encode — this only blurs movement.
//
// The heavy end costs almost nothing extra, which is worth knowing: the
// expensive stage is `minterpolate` synthesising frames, and that is fixed by
// `fps`. Averaging more of them in `tmix` is nearly free — so 2160 degrees runs
// at the same speed as 540 and just looks far more blurred.
//
// TWO ENGINES, and the fast one is the default because it turned out to be as
// good. `flow` is the optical-flow path this started as: minterpolate invents
// intermediate frames by estimating motion, which is what RSMB does and what
// makes it expensive. `fast` asks minterpolate to BLEND between frames instead,
// with no motion estimation at all.
//
// Measured on 3 seconds of moving 1080x1920 footage at a 1080 degree shutter:
//
//   flow  126s  ·  blur 38.3% on moving frames  ·  3.7% on still ones
//   fast  2.7s  ·  blur 37.7%                   ·  13.0%
//
// 47x faster for a tenth of a percent of blur. The one real difference is that
// last column: blending softens STATIC frames too, because it mixes neighbours
// whether or not anything moved, where optical flow leaves them alone. On this
// app's videos — cutting every 0.3-0.5s with the picture always moving — that
// barely shows, which is why `fast` is the default. `flow` stays for a video
// with long held frames, where 13% softening on a still shot would be visible.
//
// Tuning the motion estimator was tried and does nothing: obmc without vsbmc
// came out SLOWER (139s), and epzs with a smaller search window saved 5%.
const ENGINES = {
  fast: (fps) => `minterpolate='mi_mode=blend:fps=${fps}'`,
  flow: (fps) => `minterpolate='mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1:fps=${fps}'`,
}

// Strength is the shutter angle: averaging `frames` sub-frames taken at `fps`
// blurs over frames/fps seconds, and at 30fps output 33ms is one whole frame —
// a 360 degree shutter, the widest a real camera opens. Going past that is what
// gives the heavy smear people associate with RSMB.
// Only `medium` is reachable from the UI — it is a switch, not a dial. The
// others stay because the endpoint takes a strength and they cost nothing to
// keep, but light is too subtle to see on a 0.3s cut and the heavy pair smear
// far enough to read as a mistake.
const STRENGTHS = {
  light: { fps: 240, frames: 8, angle: 360 },
  medium: { fps: 240, frames: 12, angle: 540 },
  heavy: { fps: 240, frames: 24, angle: 1080 },
  extreme: { fps: 240, frames: 48, angle: 2160 },
}

// Every hard cut in the file, in seconds. The same scene-score pass used to
// analyse reference videos: 0.28 is well above normal motion and well below a
// genuine shot change.
async function findCuts(path) {
  // `metadata=print:file=-` prints to STDOUT, not stderr — read both, since
  // ffmpeg's own progress chatter goes to stderr and an error path may carry
  // the useful half in either.
  const res = await run(
    FFMPEG,
    ['-v', 'info', '-i', path, '-vf', "select='gt(scene,0.28)',metadata=print:file=-", '-f', 'null', '-'],
    { maxBuffer: MAX_BUFFER, timeout: TIMEOUT_MS },
  ).catch((e) => ({ stdout: e?.stdout || '', stderr: e?.stderr || '' }))
  const printed = `${res.stdout || ''}
${res.stderr || ''}`
  const times = []
  for (const m of printed.matchAll(/pts_time:([0-9.]+)/g)) {
    const t = Number(m[1])
    // Two "cuts" inside a few frames of each other are one event; a piece
    // shorter than this has too few frames for flow to work on anyway.
    if (Number.isFinite(t) && (!times.length || t - times[times.length - 1] > 0.2)) times.push(t)
  }
  return times
}

// `cuts` — the cut times in seconds, when the caller already knows them. Our own
// renders do: the beat plan says exactly where every cut is, and passing them in
// beats detecting them. Scene detection has to infer a cut from how much the
// picture changed, and these transitions defeat that on purpose — the incoming
// shot arrives shaking and blurred, which reads as motion rather than as a cut.
// Measured on the transition showcase, detection found 3 of 5. Omit it and it
// falls back to detection, which is all a file from elsewhere allows.
// The source's real frame rate and length, so the pieces can be cut by frame.
async function probe(path, entries) {
  const { stdout } = await run(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', entries, '-of', 'csv=p=0', path],
    { maxBuffer: MAX_BUFFER, timeout: TIMEOUT_MS },
  )
  return String(stdout).trim()
}

async function sourceFps(path) {
  const [num, den] = (await probe(path, 'stream=r_frame_rate')).split('/').map(Number)
  const fps = den ? num / den : num
  return Number.isFinite(fps) && fps > 0 ? Math.round(fps) : 30
}

async function frameCount(path) {
  const n = Number(await probe(path, 'stream=nb_read_frames'))
  return Number.isFinite(n) && n > 0 ? n : 0
}

export async function motionBlur(bytes, { strength = 'medium', engine = 'fast', cuts: known } = {}) {
  const { fps, frames, angle } = STRENGTHS[strength] || STRENGTHS.medium
  const interpolate = (ENGINES[engine] || ENGINES.fast)(fps)
  const dir = await mkdtemp(join(tmpdir(), 'mblur-'))
  try {
    const src = join(dir, 'in.mp4')
    await writeFile(src, bytes)

    const cuts = known?.length ? [...known].sort((a, b) => a - b) : await findCuts(src)
    log.info(`blurring ${cuts.length + 1} shot(s) at ${strength} — ${angle} degree shutter, ${engine} engine`)

    // Pieces are cut BY FRAME NUMBER, not by timestamp. Seeking with -ss/-to
    // lands on the nearest keyframe and rounds at both ends, so the pieces
    // overlapped and the concatenated result came out 3 frames longer than the
    // source — which drifts the picture against the audio it was cut to. Frame
    // indices are exact and sum back to the original count.
    const fpsOut = await sourceFps(src)
    const frameAt = (t) => Math.round(t * fpsOut)
    const total = await frameCount(src)
    const edges = [0, ...cuts.map(frameAt).filter((f) => f > 0 && f < total), total]

    const blur = `${interpolate},tmix=frames=${frames},fps=${fpsOut}`

    // Shots are blurred IN PARALLEL. Motion estimation is single-threaded per
    // filter instance, so running one shot at a time left most of the machine
    // idle — and the shots are already independent by construction (that is why
    // they were split in the first place). On a 10-core machine a 10-shot video
    // now takes about as long as its longest shot rather than the sum of all of
    // them. One worker is held back from the core count so the box stays usable.
    const workers = Math.max(1, Math.min(edges.length - 1, cpus().length - 1))
    const jobs = []
    for (let i = 0; i < edges.length - 1; i++) jobs.push(i)
    const pieces = new Array(jobs.length)
    let next = 0
    const runOne = async () => {
      while (next < jobs.length) {
        const i = jobs[next++]
        const out = join(dir, `p${i}.mp4`)
        await run(FFMPEG, [
          '-v', 'error', '-i', src,
          '-vf', `trim=start_frame=${edges[i]}:end_frame=${edges[i + 1]},setpts=PTS-STARTPTS,${blur}`,
          '-c:v', 'libx264', '-crf', '17', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
          '-an', '-y', out,
        ], { maxBuffer: MAX_BUFFER, timeout: TIMEOUT_MS })
        pieces[i] = out
      }
    }
    log.info(`blurring ${jobs.length} shot(s) across ${workers} worker(s)`)
    await Promise.all(Array.from({ length: workers }, runOne))

    // Concat the blurred shots, then put the original audio back over the top —
    // it was never touched, so it stays in sync with the picture it was cut to.
    const list = join(dir, 'list.txt')
    await writeFile(list, pieces.map((p) => `file '${p}'`).join('\n'))
    const joined = join(dir, 'joined.mp4')
    await run(FFMPEG, ['-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-y', joined], {
      maxBuffer: MAX_BUFFER, timeout: TIMEOUT_MS,
    })

    const final = join(dir, 'out.mp4')
    await run(FFMPEG, [
      '-v', 'error', '-i', joined, '-i', src,
      '-map', '0:v:0', '-map', '1:a:0?', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
      '-shortest', '-movflags', '+faststart', '-y', final,
    ], { maxBuffer: MAX_BUFFER, timeout: TIMEOUT_MS })

    return await readFile(final)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
