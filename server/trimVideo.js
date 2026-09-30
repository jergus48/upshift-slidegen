// Cut a recorded video to the music, exactly.
//
// The browser records in real time, so the file carries a little extra: the
// encoder's warm-up before the song starts, and a moment after it ends while
// the recorder stops. A video must end the instant the music does, so the
// recording is cut to [onset, onset + duration] — re-encoded, since a stream
// copy can only cut on keyframes and would leave the head on.
//
// The picture and the sound are cut SEPARATELY. Chrome's recorder does not
// keep the two tracks' heads aligned: the video track carries the warm-up
// frames drawn before the music (the caller's `start`, measured on the audio
// clock), but the audio track begins at the music, give or take a few ms. So
// the video is cut at `start`, and the audio at its onset — FOUND by decoding
// the song from where the edit starts in it and sliding it along the
// recording's audio until the two line up. Cutting both at one point put the
// music 80–120ms off the picture.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const run = promisify(execFile)
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg'
const RATE = 8000

async function pcm(args) {
  const { stdout } = await run(FFMPEG, ['-v', 'error', ...args, '-ac', '1', '-ar', String(RATE), '-f', 's16le', '-'], {
    encoding: 'buffer',
    maxBuffer: 64 * 1024 * 1024,
  })
  return new Int16Array(stdout.buffer, stdout.byteOffset, Math.floor(stdout.length / 2))
}

// Where `ref` (the song's first second or so, as the edit plays it) starts in
// `rec`, searching the first `within` seconds. Normalised cross-correlation.
function locate(rec, ref, within) {
  const n = ref.length
  let refE = 0
  for (let k = 0; k < n; k++) refE += ref[k] * ref[k]
  let best = { score: -1, at: 0 }
  const last = Math.min(rec.length - n, Math.round(within * RATE))
  for (let i = 0; i <= last; i++) {
    let dot = 0
    let e = 0
    for (let k = 0; k < n; k += 2) {
      const x = rec[i + k]
      dot += x * ref[k]
      e += x * x
    }
    const score = dot / Math.sqrt(e * refE * 0.5 + 1)
    if (score > best.score) best = { score, at: i }
  }
  return best
}

// `song`: the song file on disk, `songFrom` the second the edit starts in it,
// `speed` the rate the edit plays that opening at.
async function musicOnset(file, { song, songFrom = 0, speed = 1 }) {
  if (!song) return null
  try {
    const rec = await pcm(['-t', '4', '-i', file])
    const ref = await pcm(['-ss', songFrom.toFixed(3), '-t', (1.5 * speed).toFixed(3), '-i', song, '-af', `atempo=${speed}`])
    if (ref.length < RATE / 2) return null
    const { score, at } = locate(rec, ref, 2.5)
    return score > 0.25 ? at / RATE : null
  } catch {
    return null
  }
}

export async function trimVideo(bytes, { start = 0, duration, fps = 30, song, songFrom, speed }) {
  if (!(duration > 0)) throw new Error('No duration to cut to.')
  const dir = await mkdtemp(join(tmpdir(), 'slidegen-trim-'))
  try {
    const input = join(dir, 'in.mp4')
    const output = join(dir, 'out.mp4')
    await writeFile(input, bytes)
    const found = await musicOnset(input, { song, songFrom, speed })
    const audioAt = found ?? 0
    await run(
      FFMPEG,
      [
        '-v', 'error',
        // Input-side seeks with a re-encode are frame/sample accurate.
        '-ss', start.toFixed(4), '-i', input,
        '-ss', audioAt.toFixed(4), '-i', input,
        '-map', '0:v:0', '-map', '1:a:0',
        '-t', duration.toFixed(3),
        // Exactly the edit's frame count, and audio padded to the same length
        // so neither stream runs past the other.
        '-r', String(fps),
        '-frames:v', String(Math.round(duration * fps)),
        '-af', `apad=whole_dur=${duration.toFixed(3)}`,
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '192k',
        '-movflags', '+faststart',
        '-y', output,
      ],
      { maxBuffer: 64 * 1024 * 1024, timeout: 5 * 60 * 1000 },
    )
    return { video: await readFile(output), onset: audioAt, found: found !== null }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
