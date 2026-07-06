// The Slidesmith Express app. Exported without calling .listen() so it can be
// used two ways: run directly with a real HTTP server for local dev / self-
// hosting (see index.js), or wrapped as a Vercel serverless function (see
// api/index.js) when deployed for a small team to share.
import express from 'express'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getConfig,
  saveGlobal,
  getActiveProject,
  createProject,
  updateProject,
  deleteProject,
  setActiveProject,
} from './store.js'
import { listAccounts, listPosts, listAnalytics, syncAnalytics, uploadMedia, createPost } from './postbridge.js'
import { generateSlideshows } from './generate.js'
import { listModels, validateKey } from './openrouter.js'
import { listBundled, listBundledPacks, scrapePinterest } from './library.js'
import { logger } from './log.js'
import { authGate, checkPassword, authCookie, clearAuthCookie, isAuthed, AUTH_REQUIRED } from './auth.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const schedLog = logger('schedule')

export const app = express()
app.use(express.json({ limit: '50mb' })) // base64 slide images can be large

// DNS-rebinding guard: a malicious website can point its own domain at
// 127.0.0.1 and read API responses from the visitor's browser, bypassing
// same-origin policy. Only matters for the local, loopback-bound server —
// on Vercel the host is whatever domain Vercel/your custom domain assigns.
const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', process.env.HOST].filter(Boolean))
app.use((req, res, next) => {
  if (process.env.VERCEL) return next()
  const host = String(req.headers.host || '').replace(/:\d+$/, '')
  if (!ALLOWED_HOSTS.has(host)) return res.status(403).json({ error: `Forbidden host: ${host}` })
  next()
})

// Shared-password gate (no-op unless APP_PASSWORD is set — see auth.js).
app.use(authGate)

// Wrap async handlers so thrown errors become clean 500 JSON instead of crashes.
const h = (fn) => (req, res) => fn(req, res).catch((e) => {
  console.error(e)
  res.status(500).json({ error: e.message || String(e) })
})

// ── Auth ────────────────────────────────────────────────────────────────────
app.get('/api/auth', h(async (req, res) => res.json({ required: AUTH_REQUIRED, authed: isAuthed(req) })))
app.post('/api/login', h(async (req, res) => {
  if (!checkPassword(req.body?.password)) return res.status(401).json({ error: 'Incorrect password.' })
  res.setHeader('Set-Cookie', authCookie())
  res.json({ ok: true })
}))
app.post('/api/logout', h(async (_req, res) => {
  res.setHeader('Set-Cookie', clearAuthCookie())
  res.json({ ok: true })
}))

// Never send real key values to the browser — only whether each is set.
function maskConfig(cfg) {
  return {
    ...cfg,
    keys: { postbridge: !!cfg.keys.postbridge, openrouter: !!cfg.keys.openrouter, apify: !!cfg.keys.apify },
  }
}

// ── Config ──────────────────────────────────────────────────────────────────
app.get('/api/config', h(async (_req, res) => res.json(maskConfig(await getConfig()))))
// Global settings only: keys + model. Project data goes through /api/projects.
app.put('/api/config', h(async (req, res) => res.json(maskConfig(await saveGlobal(req.body || {})))))

// ── Projects (each = a Brain + default post-bridge accounts) ──────────────────
app.post('/api/projects', h(async (req, res) => res.json(maskConfig(await createProject(req.body?.name)))))
app.put('/api/projects/:id', h(async (req, res) => res.json(maskConfig(await updateProject(req.params.id, req.body || {})))))
app.delete('/api/projects/:id', h(async (req, res) => res.json(maskConfig(await deleteProject(req.params.id)))))
app.post('/api/projects/:id/activate', h(async (req, res) => res.json(maskConfig(await setActiveProject(req.params.id)))))

// Validate that the saved keys actually work, so Settings can show a green check.
app.post('/api/config/test', h(async (_req, res) => {
  const { keys } = await getConfig()
  const result = { postbridge: false, openrouter: false, apify: false, errors: {} }
  if (keys.postbridge) {
    try { await listAccounts(keys.postbridge); result.postbridge = true }
    catch (e) { result.errors.postbridge = e.message }
  }
  if (keys.openrouter) {
    try { await validateKey(keys.openrouter); result.openrouter = true }
    catch (e) { result.errors.openrouter = e.message }
  }
  if (keys.apify) {
    try {
      const r = await fetch(`https://api.apify.com/v2/users/me?token=${keys.apify}`)
      if (!r.ok) throw new Error(`invalid key (${r.status})`)
      result.apify = true
    } catch (e) { result.errors.apify = e.message }
  }
  res.json(result)
}))

// Public model catalog for the Settings dropdown.
app.get('/api/models', h(async (_req, res) => res.json(await listModels())))

// Generate a batch of slideshows. The queue itself lives client-side now (see
// App.tsx) — this just returns the AI-written text. Backgrounds are NOT
// assigned here either: the server no longer knows about scraped/uploaded
// images (they live in the browser's IndexedDB), so the client assigns
// backgrounds itself after this returns — see src/lib/backgrounds.ts.
app.post('/api/generate', h(async (req, res) => {
  const { keys, model } = await getConfig()
  const project = await getActiveProject()
  const count = Math.min(Math.max(Math.round(Number(req.body?.count) || 4), 1), 100)

  // Per-batch audience/style-memory override (from the Generate modal) wins;
  // an empty/missing override falls back to the project's saved Brain values.
  const audience = String(req.body?.audience || '').trim() || project.brain.audience
  const styleMemory = String(req.body?.styleMemory || '').trim() || project.brain.styleMemory
  const brain = { ...project.brain, audience, styleMemory }

  const slideshows = await generateSlideshows({ apiKey: keys.openrouter, model, brain, count })
  res.json(slideshows)
}))

// ── Image library ──────────────────────────────────────────────────────────────
// Bundled aesthetic packs only — scraped/uploaded images live in the browser's
// IndexedDB (src/lib/localLibrary.ts) and never touch the server except to be
// scraped in the first place (below).
app.get('/api/library', h(async (_req, res) => res.json(listBundled())))
app.get('/api/library/packs', h(async (_req, res) => res.json(listBundledPacks())))

// Scrapes Pinterest (needs the Apify key + avoids browser CORS) and returns
// the downloaded images as data URLs — the client saves them into its own
// local library. Nothing is persisted server-side.
app.post('/api/library/scrape', h(async (req, res) => {
  const { keys, pinterestActor } = await getConfig()
  const { searches, count } = req.body || {}
  res.json(await scrapePinterest({ apiKey: keys.apify, actor: pinterestActor, searches, count }))
}))

// ── post-bridge ───────────────────────────────────────────────────────────────
app.get('/api/accounts', h(async (_req, res) => {
  const { keys } = await getConfig()
  res.json(await listAccounts(keys.postbridge))
}))

app.get('/api/posts', h(async (_req, res) => {
  const { keys } = await getConfig()
  res.json(await listPosts(keys.postbridge))
}))

app.get('/api/results', h(async (_req, res) => {
  const { keys } = await getConfig()
  res.json(await listAnalytics(keys.postbridge))
}))

// Pull fresh metrics from the platforms, then hand back the updated analytics.
// post-bridge rate-limits sync (429) — swallow that so the refresh still returns
// whatever's already there.
app.post('/api/results/sync', h(async (_req, res) => {
  const { keys } = await getConfig()
  try { await syncAnalytics(keys.postbridge) } catch (e) { console.warn('[results] sync skipped:', e.message) }
  res.json(await listAnalytics(keys.postbridge))
}))

// Schedule a slideshow: upload each rendered slide image to post-bridge, then
// create the post. `slides` are data URLs (PNG) rendered in the browser.
app.post('/api/schedule', h(async (req, res) => {
  const { keys } = await getConfig()
  const { id, caption, slides, socialAccounts, scheduledAt, mode } = req.body || {}
  if (!socialAccounts?.length) throw new Error('Pick at least one social account.')
  if (!slides?.length) throw new Error('No slide images to upload.')

  const when = mode === 'schedule' ? (scheduledAt ? `scheduled for ${scheduledAt}` : 'scheduled') : 'draft'
  schedLog.start(`Posting ${id || 'slideshow'} → ${when} · ${socialAccounts.length} account${socialAccounts.length === 1 ? '' : 's'}`)

  // Upload all slides concurrently — post-bridge handles them independently, so
  // there's no reason to wait for each. Results stay in slide order (the index
  // into the array) so the carousel keeps its sequence.
  let done = 0
  const mediaIds = await Promise.all(
    slides.map(async (slide, i) => {
      const buffer = Buffer.from(String(slide).replace(/^data:image\/\w+;base64,/, ''), 'base64')
      const mediaId = await uploadMedia(keys.postbridge, {
        buffer,
        mimeType: 'image/png',
        name: `${id || 'slide'}-${i + 1}.png`,
      })
      schedLog.progress(++done, slides.length, 'slides uploaded')
      return mediaId
    })
  )

  schedLog.step(`creating post on post-bridge…`)
  const post = await createPost(keys.postbridge, {
    caption,
    mediaIds,
    socialAccounts,
    scheduledAt: mode === 'schedule' ? scheduledAt : null,
    isDraft: mode !== 'schedule', // "save as draft" leaves it unprocessed in post-bridge
  })

  // The queue lives client-side now — the caller removes `id` from its own
  // local state on success.
  schedLog.ok(`Done — ${mode === 'schedule' ? 'scheduled' : 'saved as draft'}`)
  res.json(post)
}))

// ── Static (production / `npm start`; not used on Vercel, which serves the
// build output directly) ──────────────────────────────────────────────────────
const dist = join(__dirname, '..', 'dist')
if (!process.env.VERCEL && existsSync(dist)) {
  app.use(express.static(dist))
  // SPA fallback: any non-API GET serves index.html. (Express 5 dropped the
  // bare '*' route string, so use a middleware instead of app.get('*').)
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next()
    res.sendFile(join(dist, 'index.html'))
  })
}
