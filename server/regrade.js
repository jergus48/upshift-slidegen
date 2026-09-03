// Heavy content-aware transformation + a second encoder chain, run through the
// local ffmpeg binary.
//
// This is deliberately SEPARATE from the browser render. The browser always
// produces a clean master (full-fidelity resample, caption, optional Ken Burns,
// invisible dither); this pass is an opt-in post-process that takes that master
// and rewrites it hard:
//
//   1. Geometry - overscan, rotation, perspective warp, non-uniform scale and a
//      random crop, so the frame no longer lines up pixel-for-pixel with the
//      source and the spatial statistics shift.
//   2. Photometry - a per-channel curve grade (not a brightness/contrast
//      slider), a selective hue/saturation push, and temporal film grain.
//   3. Encoder chain - the graded frames go out to a ProRes intermediate first,
//      then that intermediate is encoded again to H.264 or H.265 with settings
//      unrelated to the browser's. Two different codec families, two different
//      quantiser layouts.
//
// Every parameter is randomised per call within the ranges below, so two runs
// of the same deck never produce the same transform.
//
// Honest limits, so nobody over-trusts this: it is a strong perceptual-hash and
// re-upload-detection breaker, and it genuinely costs image quality (that is
// the point of it, and why it is opt-in). It is NOT a guaranteed defeat of a
// trained provenance watermark such as SynthID, which is built to survive
// exactly this class of transform. And it has no effect at all on a platform
// label that was self-declared at upload time.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { logger } from './log.js'

const run = promisify(execFile)
const log = logger('regrade')

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg'

// ffmpeg writes progress to stderr and a long filter graph makes that chatty,
// so give it room rather than letting execFile kill the process.
const MAX_BUFFER = 32 * 1024 * 1024
const TIMEOUT_MS = 10 * 60 * 1000

const rand = (min, max) => min + Math.random() * (max - min)
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
const r3 = (n) => Number(n.toFixed(3))

// Is ffmpeg actually callable? Cached after the first probe so the status
// endpoint is cheap.
let available = null
export async function ffmpegAvailable() {
  if (available !== null) return available
  try {
    const { stdout } = await run(FFMPEG, ['-hide_banner', '-version'], { maxBuffer: MAX_BUFFER })
    available = { ok: true, version: String(stdout).split('\n')[0] || 'ffmpeg' }
  } catch (e) {
    available = { ok: false, error: e?.message || String(e) }
  }
  return available
}

// Build the randomised filter graph. `strength` 1 = subtle, 2 = heavy.
// Returned alongside the numbers actually used, so an export can be explained
// (and a bad-looking one diagnosed) instead of being a black box.
export function buildFilters(strength = 1) {
  const k = strength === 2 ? 1.8 : 1

  // Rotation, degrees. Small - past ~3 the caption visibly tilts.
  const angle = rand(1, 3) * k * pick([1, -1])

  // Perspective corner displacement, as a fraction of width/height. The filter
  // takes explicit corners; nudging them slightly fakes a camera that is not
  // quite square to the subject.
  const px = rand(0.004, 0.012) * k
  const py = rand(0.004, 0.012) * k

  // Non-uniform scale: x and y stretched by different amounts, so the aspect
  // ratio is fractionally off and no dimension matches the source.
  const sx = rand(1.004, 1.02) * k
  const sy = rand(1.004, 1.02) * k

  // Random crop, 3-8% total off each axis.
  const cx = rand(0.015, 0.04) * k
  const cy = rand(0.015, 0.04) * k

  const W = 1080
  const H = 1920

  // --- Overscan, derived from the angle rather than guessed -----------------
  // `rotate` grows the canvas to fit the turned image, which means black
  // wedges in every corner. To crop them away cleanly, the frame has to be
  // scaled UP first by enough that a centred, axis-aligned box still lands
  // entirely inside the rotated rectangle. For a w x h box inside a rotated
  // W' x H' frame that needs both:
  //     w*cos + h*sin <= W'   and   w*sin + h*cos <= H'
  // With W' = W*S and H' = H*S the binding one on a 9:16 frame is the first,
  // giving S >= cos + (H/W)*sin. `margin` keeps extra material beyond that so
  // the random crop below still has something to eat, and 1.02 is slack for
  // the perspective warp pulling an edge in.
  const rad = (Math.abs(angle) * Math.PI) / 180
  const margin = 1 + 2 * Math.max(cx, cy)
  const fit = Math.cos(rad) + (H / W) * Math.sin(rad)
  const overscan = fit * margin * 1.02

  const ow = Math.round(W * overscan)
  const oh = Math.round(H * overscan)
  // The clean box to take back out of the rotated frame.
  const kw = Math.round(W * margin)
  const kh = Math.round(H * margin)

  // Per-channel curve grade. Each channel gets its own lift/gamma/gain shaped
  // control points, which is what separates a film look from a brightness
  // slider - shadows and highlights move in different directions per channel.
  const lift = () => r3(rand(0.008, 0.03) * k)
  const mid = (base) => r3(base + rand(-0.035, 0.035) * k)
  const gain = () => r3(1 - rand(0.006, 0.025) * k)
  const curve = (c) => c + "='0/" + lift() + ' 0.25/' + mid(0.24) + ' 0.5/' + mid(0.5) + ' 0.75/' + mid(0.76) + ' 1/' + gain() + "'"

  // Selective hue rotation + a small saturation push.
  const hue = r3(rand(2, 9) * k * pick([1, -1]))
  const sat = r3(1 + rand(0.02, 0.09) * k * pick([1, -1]))

  // Temporal grain. `allf=t` makes it vary per frame (film), not a fixed
  // pattern welded to every frame (digital sensor noise). Kept modest: grain is
  // by far the most expensive thing here for the encoder to carry, and every
  // extra level costs real bitrate.
  const grain = Math.round(rand(4, 9) * k)

  const a = r3(angle)

  const filters = [
    // 1. overscan so the rotation has material to give back
    'scale=' + ow + ':' + oh + ':flags=bicubic',
    // 2. geometry - rotate, then take the clean centred box back out
    'rotate=' + a + '*PI/180:c=black@0:ow=rotw(' + a + '*PI/180):oh=roth(' + a + '*PI/180)',
    'crop=' + kw + ':' + kh,
    'perspective=x0=' + r3(px) + '*W:y0=' + r3(py) + '*H' +
      ':x1=W-' + r3(px) + '*W:y1=' + r3(py * 0.6) + '*H' +
      ':x2=' + r3(px * 0.6) + '*W:y2=H-' + r3(py) + '*H' +
      ':x3=W-' + r3(px * 0.8) + '*W:y3=H-' + r3(py * 0.7) + '*H' +
      ':sense=destination',
    // 3. non-uniform stretch, then the random crop
    'scale=iw*' + r3(sx) + ':ih*' + r3(sy) + ':flags=bicubic',
    'crop=iw*' + r3(1 - 2 * cx) + ':ih*' + r3(1 - 2 * cy),
    // 4. back to the delivery size - the one resample worth doing well
    'scale=' + W + ':' + H + ':flags=lanczos',
    // 5. photometry
    'curves=' + curve('r') + ':' + curve('g') + ':' + curve('b'),
    'hue=h=' + hue + ':s=' + sat,
    'noise=alls=' + grain + ':allf=t+u',
  ]

  return {
    filter: filters.join(','),
    params: {
      strength,
      overscan: r3(overscan),
      angle: a,
      perspective: { x: r3(px), y: r3(py) },
      scale: { x: r3(sx), y: r3(sy) },
      crop: { x: r3(cx), y: r3(cy) },
      hue,
      saturation: sat,
      grain,
    },
  }
}

// The final encode. Deliberately unlike the browser's WebCodecs/MediaRecorder
// output: a different codec family, or at minimum a different rate-control,
// preset and GOP, so the bitstream structure is not the one we shipped in.
function finalArgs(codec) {
  if (codec === 'h265') {
    return [
      '-c:v', 'libx265',
      '-pix_fmt', 'yuv420p',
      '-preset', pick(['medium', 'slow']),
      '-crf', String(Math.round(rand(22, 26))),
      '-maxrate', '10M', '-bufsize', '20M',
      '-x265-params', 'keyint=' + Math.round(rand(48, 96)) + ':bframes=' + Math.round(rand(3, 6)),
      // Drop the encoder's SEI user-data NALs (prefix 39 / suffix 40 in HEVC),
      // which carry a version string inside the bitstream where container
      // metadata stripping can't reach.
      '-bsf:v', 'filter_units=remove_types=39|40',
      '-tag:v', 'hvc1',
    ]
  }
  return [
    '-c:v', 'libx264',
    // ProRes 422 HQ is 4:2:2 10-bit; x264's high profile is 4:2:0 8-bit only,
    // so the chroma downconvert has to happen here, not in the pass-1 filter
    // graph (doing it there would round-trip the chroma twice for nothing).
    '-pix_fmt', 'yuv420p',
    '-preset', pick(['medium', 'slow']),
    // Grain is expensive to carry: at CRF 18 this came out at 26 Mbps from a
    // 3.2 Mbps master. Cap the rate so an export stays uploadable.
    '-crf', String(Math.round(rand(21, 24))),
    '-maxrate', '12M', '-bufsize', '24M',
    '-profile:v', 'high',
    '-x264-params',
    'keyint=' + Math.round(rand(48, 96)) + ':bframes=' + Math.round(rand(3, 5)) + ':aq-mode=' + pick([2, 3]),
    // x264 stamps its version into an SEI user-data NAL (type 6) inside the
    // bitstream itself, which -map_metadata cannot touch. Strip it.
    '-bsf:v', 'filter_units=remove_types=6',
  ]
}

// Transform + re-encode one video. Takes and returns a Buffer.
export async function regradeVideo(input, { strength = 1, codec = 'h264' } = {}) {
  const probe = await ffmpegAvailable()
  if (!probe.ok) throw new Error('ffmpeg is not available: ' + probe.error)

  const dir = await mkdtemp(join(tmpdir(), 'slidesmith-regrade-'))
  const inPath = join(dir, 'in.mp4')
  const midPath = join(dir, 'mid.mov')
  const outPath = join(dir, 'out.mp4')

  try {
    await writeFile(inPath, input)
    const { filter, params } = buildFilters(strength)
    const t0 = Date.now()

    // Pass 1 - every filter runs here, straight out to a ProRes 422 HQ
    // intermediate. ProRes is visually lossless and intra-only, so the grade
    // and the grain survive into pass 2 instead of being half-eaten by an
    // inter-frame codec's quantiser before the final encode ever sees them.
    await run(
      FFMPEG,
      [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-i', inPath,
        '-map_metadata', '-1',
        '-vf', filter,
        '-c:v', 'prores_ks', '-profile:v', '2', '-vendor', 'apl0',
        '-c:a', 'pcm_s16le',
        midPath,
      ],
      { maxBuffer: MAX_BUFFER, timeout: TIMEOUT_MS },
    )
    const tMid = Date.now()

    // Pass 2 - intermediate down to the delivery codec with its own settings.
    await run(
      FFMPEG,
      [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-i', midPath,
        // Left alone, ffmpeg makes the file MORE identifiable than the clean
        // master it replaces: it stamps encoder=Lavf.../Lavc... libx264 tags and
        // carries the browser muxer's handler_name straight through. The master
        // has no metadata at all (canvas re-encode), so this pass must not
        // reintroduce any. -map_metadata -1 drops what came in, the bitexact
        // flags stop ffmpeg writing its own version strings, and
        // +empty_hdlr_name blanks the track handler.
        '-map_metadata', '-1',
        '-fflags', '+bitexact',
        '-flags:v', '+bitexact',
        '-flags:a', '+bitexact',
        // bitexact strips the version numbers but the encoder still writes its
        // own name into the video stream's tags; blank it explicitly.
        '-metadata:s:v:0', 'encoder=',
        ...finalArgs(codec),
        '-c:a', 'aac', '-b:a', '192k',
        '-movflags', '+faststart',
        // A separate muxer boolean, NOT a movflag — passing it inside -movflags
        // makes ffmpeg fail to parse the whole option.
        '-empty_hdlr_name', '1',
        outPath,
      ],
      { maxBuffer: MAX_BUFFER, timeout: TIMEOUT_MS },
    )

    const out = await readFile(outPath)
    log.info(
      'regraded ' + input.length + ' -> ' + out.length + ' bytes (prores ' +
        (tMid - t0) + 'ms, ' + codec + ' ' + (Date.now() - tMid) + 'ms)',
    )
    return { video: out, params: { ...params, codec } }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
