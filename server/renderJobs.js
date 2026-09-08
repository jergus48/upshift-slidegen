// Server-side video rendering: a background job queue that drives a REAL
// browser on this machine instead of the user's tab.
//
// Why this exists: the whole video pipeline (canvas -> WebCodecs/MediaRecorder
// -> mp4) only runs in a browser, so an export used to hold the user's tab
// hostage — a backgrounded tab gets its timers throttled, which stalls or slows
// the render. Here the same code runs in a headless Chrome the server launches,
// so the user can close the tab, work on something else, and pick the finished
// files up out of a folder.
//
// The render page is the app's own /render.html entry (src/render-entry.ts): it
// imports the exact same lib/render.ts pipeline the in-tab export uses, so the
// output is identical rather than a second, drifting implementation.
//
// Flow, from the browser's side:
//   POST /api/render/jobs                  -> create a job, get {id, token}
//   PUT  /api/render/assets/:id/:token/:n   -> upload each photo/track once
//   POST /api/render/jobs/:id/start        -> hand over the decks, queue it
//   GET  /api/render/jobs                  -> poll status
// Assets are served back to the render page from the SAME ORIGIN it was loaded
// from, which matters: a cross-origin photo would taint the canvas and break
// toDataURL()/getImageData() in the slide renderer.
//
// Jobs live in memory (plus their assets on disk) — a server restart drops the
// queue. That is deliberate for now: a render is minutes, not hours, and a
// half-finished job is better re-run than resumed.
import express from 'express'
import { randomBytes } from 'node:crypto'
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises'
import { existsSync, createReadStream } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { join, dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DATA_DIR } from './storage.js'
import { regradeVideo, ffmpegAvailable } from './regrade.js'
import { authCookie, AUTH_REQUIRED } from './auth.js'
import { logger } from './log.js'

const log = logger('render')
const run = promisify(execFile)
const __dirname = dirname(fileURLToPath(import.meta.url))

// Serverless has no browser to drive, no writable output folder and a hard
// request timeout, so the feature is simply off there.
export const RENDER_SUPPORTED = !process.env.VERCEL

const JOBS_DIR = join(DATA_DIR, 'render-jobs')
const PORT = process.env.PORT || 8787

// Where the headless browser loads the render page from. In dev that's the Vite
// dev server (which proxies /api back here, keeping assets same-origin); with a
// built dist/ the server serves it itself.
const DEV_PAGE = `http://localhost:${process.env.VITE_PORT || 5173}/render.html`
const SELF_PAGE = `http://127.0.0.1:${PORT}/render.html`
const DIST_RENDER = join(__dirname, '..', 'dist', 'render.html')

async function reachable(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1500) })
    return res.ok
  } catch {
    return false
  }
}

async function renderPageUrl() {
  if (process.env.RENDER_PAGE_URL) return process.env.RENDER_PAGE_URL
  if (await reachable(DEV_PAGE)) return DEV_PAGE
  if (existsSync(DIST_RENDER)) return SELF_PAGE
  throw new Error(
    'No render page found. Run `npm run dev` (Vite serves /render.html) or `npm run build`, or set RENDER_PAGE_URL.',
  )
}

// ── The queue ────────────────────────────────────────────────────────────────
const jobs = new Map()
let running = false

const publicJob = (j) => ({
  id: j.id,
  name: j.name,
  status: j.status,
  done: j.done,
  total: j.total,
  outDir: j.outDir,
  error: j.error || null,
  files: j.files,
  createdAt: j.createdAt,
  finishedAt: j.finishedAt || null,
})

// Drafts are jobs whose assets are still uploading — they aren't work yet, so
// they stay out of the list the UI shows.
export function listJobs() {
  return [...jobs.values()]
    .filter((j) => j.status !== 'draft')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(publicJob)
}

// A draft whose upload was abandoned (tab closed mid-submit) would otherwise
// keep its photos on disk forever. Swept whenever a new job is created.
async function sweepDrafts() {
  const cutoff = Date.now() - 60 * 60 * 1000
  for (const j of [...jobs.values()]) {
    if (j.status !== 'draft' || Date.parse(j.createdAt) > cutoff) continue
    jobs.delete(j.id)
    await rm(jobDir(j.id), { recursive: true, force: true }).catch(() => {})
  }
}

const jobDir = (id) => join(JOBS_DIR, id)

// Filenames come from the browser; never let one climb out of the job folder.
const safeName = (n) => String(n).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)

async function createJob({ name, outDir }) {
  await sweepDrafts()
  const id = `rj-${Date.now()}-${randomBytes(4).toString('hex')}`
  const token = randomBytes(16).toString('hex')
  await mkdir(join(jobDir(id), 'assets'), { recursive: true })
  const job = {
    id,
    token,
    name: String(name || 'Render'),
    outDir: outDir ? resolvePath(String(outDir)) : '',
    status: 'draft',
    items: [],
    done: 0,
    total: 0,
    files: [],
    error: '',
    createdAt: new Date().toISOString(),
  }
  jobs.set(id, job)
  return job
}

function pump() {
  if (running) return
  const next = [...jobs.values()].find((j) => j.status === 'queued')
  if (!next) return
  running = true
  runJob(next)
    .catch((e) => {
      next.status = 'error'
      next.error = e?.message || String(e)
      log.fail(`job ${next.id}: ${next.error}`)
    })
    .finally(() => {
      next.finishedAt = new Date().toISOString()
      running = false
      pump()
    })
}

// One job: open the render page once, then render every deck in it in turn.
async function runJob(job) {
  job.status = 'running'
  log.start(`${job.name} — ${job.total} video${job.total === 1 ? '' : 's'}`)
  const { chromium } = await import('playwright-core').catch(() => {
    throw new Error(
      'playwright-core is not installed. Run `npm i playwright-core` to enable server-side rendering.',
    )
  })
  const url = await renderPageUrl()
  if (job.outDir) await mkdir(job.outDir, { recursive: true })

  // The user's real Chrome, not a bundled Chromium build: only a full Chrome
  // ships the proprietary H.264 encoder WebCodecs needs, and without it every
  // render would silently drop to the slow real-time MediaRecorder path.
  let browser = null
  const channels = [process.env.RENDER_BROWSER_CHANNEL, 'chrome', 'msedge'].filter(Boolean)
  const failures = []
  for (const channel of channels) {
    try {
      browser = await chromium.launch({
        channel,
        headless: true,
        args: [
          // Nothing here is user-visible; these just stop Chrome from throttling
          // or muting a window nobody is looking at.
          '--autoplay-policy=no-user-gesture-required',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
        ],
      })
      break
    } catch (e) {
      failures.push(`${channel}: ${e?.message || e}`)
    }
  }
  if (!browser) {
    throw new Error(`Could not launch a browser for rendering. Tried ${failures.join(' | ')}`)
  }

  const ffmpeg = await ffmpegAvailable()
  try {
    const context = await browser.newContext()
    // A password-protected server would 401 the page's own /api fetches.
    if (AUTH_REQUIRED) {
      const pair = authCookie().split(';')[0]
      const i = pair.indexOf('=')
      await context.addCookies([
        {
          name: pair.slice(0, i),
          value: decodeURIComponent(pair.slice(i + 1)),
          url: new URL(url).origin,
        },
      ])
    }
    const page = await context.newPage()
    page.on('console', (m) => {
      if (m.type() === 'error') log.warn(`page: ${m.text()}`)
    })
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 })
    await page.waitForFunction('!!window.slidesmithRender', null, { timeout: 30_000 })

    for (const item of job.items) {
      if (job.status === 'cancelled') break
      // The page renders and hands the bytes straight back as base64. It could
      // POST them here instead, but going through the return value keeps the
      // page a pure function of its input — no auth, no upload retries.
      const out = await page.evaluate(
        (payload) => window.slidesmithRender(payload),
        { show: item.show, music: item.music || null, opts: item.opts || {} },
      )
      let bytes = Buffer.from(out.base64, 'base64')
      let ext = String(out.mime || '').includes('webm') ? 'webm' : 'mp4'
      // A browser without an H.264 encoder gives us WebM; ffmpeg (already here
      // for the regrade) turns it into the mp4 every platform actually wants.
      if (ext === 'webm' && ffmpeg?.ok) {
        try {
          bytes = await toMp4(bytes)
          ext = 'mp4'
        } catch (e) {
          log.warn(`webm to mp4 failed, keeping webm: ${e?.message || e}`)
        }
      }
      if (item.opts?.regrade && ffmpeg?.ok) {
        try {
          const { video } = await regradeVideo(bytes, { strength: item.opts.regrade })
          bytes = Buffer.from(String(video).split(',').pop(), 'base64')
          ext = 'mp4'
        } catch (e) {
          log.warn(`regrade failed, keeping the clean master: ${e?.message || e}`)
        }
      }
      const base = safeName(item.filename || `video-${job.done + 1}`)
      const target = job.outDir || join(jobDir(job.id), 'out')
      await mkdir(target, { recursive: true })
      await writeFile(join(target, `${base}.${ext}`), bytes)
      if (item.meta) await writeFile(join(target, `${base}.json`), String(item.meta))
      job.files.push(join(target, `${base}.${ext}`))
      job.done += 1
      log.progress(job.done, job.total, base)
    }
  } finally {
    await browser.close().catch(() => {})
  }
  if (job.status !== 'cancelled') job.status = 'done'
  log.ok(`${job.name} — ${job.done}/${job.total} written to ${job.outDir || jobDir(job.id)}`)
  // The uploaded photos are only needed while the job runs.
  await rm(join(jobDir(job.id), 'assets'), { recursive: true, force: true }).catch(() => {})
}

// Remux/transcode a WebM master to H.264 mp4 through the same ffmpeg the
// regrade uses.
async function toMp4(bytes) {
  const base = join(tmpdir(), `slidesmith-mp4-${randomBytes(4).toString('hex')}`)
  await mkdir(base, { recursive: true })
  const src = join(base, 'in.webm')
  const dst = join(base, 'out.mp4')
  try {
    await writeFile(src, bytes)
    await run(
      process.env.FFMPEG_PATH || 'ffmpeg',
      [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-i', src,
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '192k',
        '-movflags', '+faststart',
        dst,
      ],
      { maxBuffer: 32 * 1024 * 1024, timeout: 10 * 60 * 1000 },
    )
    return await readFile(dst)
  } finally {
    await rm(base, { recursive: true, force: true }).catch(() => {})
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────
// Split in two: `internalRouter` is mounted BEFORE the password gate because the
// render page fetches its assets with no session, and is guarded by the job's
// own random token instead. Everything the user's browser calls sits behind the
// normal gate in `router`.
export const internalRouter = express.Router()

// Served by hand rather than res.sendFile: the render page needs a correct
// content-type (the audio decoder and <img> both go by it) and sendFile's own
// path handling is more trouble than it's worth for absolute Windows paths.
const ASSET_TYPES = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
}

internalRouter.get('/api/render/assets/:id/:token/:name', (req, res) => {
  const job = jobs.get(req.params.id)
  if (!job || job.token !== req.params.token) return res.status(404).end()
  const name = safeName(req.params.name)
  const file = join(jobDir(job.id), 'assets', name)
  if (!existsSync(file)) return res.status(404).end()
  res.type(ASSET_TYPES[name.split('.').pop().toLowerCase()] || 'application/octet-stream')
  createReadStream(file).pipe(res)
})

export const router = express.Router()

router.get('/api/render/status', async (_req, res) => {
  res.json({ supported: RENDER_SUPPORTED, ffmpeg: (await ffmpegAvailable())?.ok === true })
})

router.get('/api/render/jobs', (_req, res) => res.json(listJobs()))

router.post('/api/render/jobs', async (req, res) => {
  if (!RENDER_SUPPORTED) {
    return res.status(400).json({ error: 'Server rendering needs the local server.' })
  }
  const job = await createJob({ name: req.body?.name, outDir: req.body?.outDir })
  res.json({ id: job.id, token: job.token })
})

// Raw asset upload — one photo or music track, streamed in as bytes.
router.put(
  '/api/render/assets/:id/:token/:name',
  express.raw({ type: '*/*', limit: '64mb' }),
  async (req, res) => {
    const job = jobs.get(req.params.id)
    if (!job || job.token !== req.params.token) return res.status(404).json({ error: 'No such job.' })
    await writeFile(join(jobDir(job.id), 'assets', safeName(req.params.name)), req.body)
    res.json({ ok: true })
  },
)

router.post('/api/render/jobs/:id/start', (req, res) => {
  const job = jobs.get(req.params.id)
  if (!job) return res.status(404).json({ error: 'No such job.' })
  const items = Array.isArray(req.body?.items) ? req.body.items : []
  if (!items.length) return res.status(400).json({ error: 'Nothing to render.' })
  job.items = items
  job.total = items.length
  if (req.body?.outDir) job.outDir = resolvePath(String(req.body.outDir))
  job.status = 'queued'
  pump()
  res.json(publicJob(job))
})

router.post('/api/render/jobs/:id/cancel', (req, res) => {
  const job = jobs.get(req.params.id)
  if (!job) return res.status(404).json({ error: 'No such job.' })
  // A running job stops after the deck it is on — killing mid-encode would just
  // leave a truncated file behind.
  job.status = 'cancelled'
  res.json(publicJob(job))
})

router.delete('/api/render/jobs/:id', async (req, res) => {
  const job = jobs.get(req.params.id)
  if (job && job.status !== 'running') {
    jobs.delete(job.id)
    await rm(jobDir(job.id), { recursive: true, force: true }).catch(() => {})
  }
  res.json({ ok: true })
})
