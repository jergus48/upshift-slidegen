// Server-side SynthID scrubbing via the `noai-watermark` CLI tool.
// Takes a base64-encoded image, runs it through noai-watermark's diffusion-based
// regeneration (which scrambles pixel-level watermarks like Google SynthID), and
// returns the cleaned image as base64.
//
// Falls back gracefully: if the tool isn't installed or fails, the endpoint
// returns `{ ok: false }` and the client keeps its browser-side scrub as a
// best-effort fallback.
import { execFile } from 'node:child_process'
import { writeFile, readFile, unlink, mkdtemp } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir, homedir } from 'node:os'
import { logger } from './log.js'

const log = logger('scrub')

// Resolve the noai-watermark executable. `uv tool install` puts it in
// ~/.local/bin which may not be on PATH, so we check there explicitly.
function findTool() {
  const uvBin = join(homedir(), '.local', 'bin', process.platform === 'win32' ? 'noai-watermark.exe' : 'noai-watermark')
  if (existsSync(uvBin)) return uvBin
  return 'noai-watermark' // hope it's on PATH
}

const TOOL_PATH = findTool()

// Check once at startup whether noai-watermark is available.
let toolAvailable = null // null = unchecked, true/false after first probe

// Shared env overrides for all execFile calls — noai-watermark's ASCII logo
// uses characters that Windows cp1250 can't encode, so force UTF-8.
const EXEC_ENV = { ...process.env, PYTHONIOENCODING: 'utf-8' }

async function checkTool() {
  if (toolAvailable !== null) return toolAvailable
  return new Promise((resolve) => {
    // Probe with -h (no --version flag). First run loads torch — can take 30s.
    execFile(TOOL_PATH, ['-h'], { timeout: 60_000, env: EXEC_ENV }, (err) => {
      toolAvailable = !err
      if (toolAvailable) log.ok(`noai-watermark is available at ${TOOL_PATH}`)
      else log.warn(`noai-watermark not found at ${TOOL_PATH} — scrub endpoint will be inactive`)
      resolve(toolAvailable)
    })
  })
}

// Run noai-watermark on a single image file. Returns the path to the cleaned
// output, or null on failure.
function runScrub(inputPath, outputPath) {
  return new Promise((resolve) => {
    // CLI: noai-watermark <source> <target> --remove-ai --strength 0.04 --steps 50 -y
    // --remove-ai: strip invisible AI watermarks (SynthID, StableSignature, etc.)
    // --strength 0.04: low enough to preserve visuals, high enough to disrupt watermark
    // --steps 50: diffusion steps (balance speed vs thoroughness)
    // -y: auto-confirm (skip interactive prompts)
    execFile(
      TOOL_PATH,
      [inputPath, outputPath, '--remove-ai', '--strength', '0.04', '--steps', '50', '-y'],
      { timeout: 120_000, env: EXEC_ENV }, // 2 min max
      (err) => {
        if (err) {
          log.warn(`scrub failed: ${err.message}`)
          resolve(null)
        } else {
          resolve(outputPath)
        }
      },
    )
  })
}

// Express handler: POST /api/scrub
// Body: { image: "data:image/png;base64,..." } or { image: "<base64>" }
// Returns: { ok: true, image: "data:image/jpeg;base64,..." } on success
//          { ok: false } if tool is unavailable or scrub fails
export async function handleScrub(req, res) {
  const available = await checkTool()
  if (!available) return res.json({ ok: false, reason: 'noai-watermark not installed' })

  const raw = req.body?.image
  if (!raw) return res.status(400).json({ ok: false, reason: 'missing image' })

  // Strip data URL prefix if present.
  const match = raw.match(/^data:image\/\w+;base64,(.+)$/)
  const b64 = match ? match[1] : raw
  const buf = Buffer.from(b64, 'base64')

  // Work in a temp directory so concurrent requests don't collide.
  const dir = await mkdtemp(join(tmpdir(), 'scrub-'))
  const inputPath = join(dir, 'input.png')
  const outputPath = join(dir, 'output.png')

  try {
    await writeFile(inputPath, buf)
    const result = await runScrub(inputPath, outputPath)
    if (!result) return res.json({ ok: false, reason: 'scrub failed' })

    const cleaned = await readFile(outputPath)
    const outB64 = `data:image/png;base64,${cleaned.toString('base64')}`
    res.json({ ok: true, image: outB64 })
  } catch (e) {
    log.warn(`scrub error: ${e.message}`)
    res.json({ ok: false, reason: e.message })
  } finally {
    // Clean up temp files.
    await unlink(inputPath).catch(() => {})
    await unlink(outputPath).catch(() => {})
  }
}

// Quick probe endpoint so the client knows whether to bother sending images.
export async function handleScrubStatus(_req, res) {
  res.json({ available: await checkTool() })
}
