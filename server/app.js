// The Slidesmith Express app. Exported without calling .listen() so it can be
// used two ways: run directly with a real HTTP server for local dev / self-
// hosting (see index.js), or wrapped as a Vercel serverless function (see
// api/index.js) when deployed for a small team to share.
import express from 'express'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getKeys, saveKeys } from './store.js'
import { listAccounts, listPosts, listAnalytics, syncAnalytics, uploadMedia, createPost } from './postbridge.js'
import { generateSlideshows } from './generate.js'
import { generatePhotoPacks } from './photopack.js'
import { listModels, validateKey, chatJSON, chatJSONVision } from './openrouter.js'
import { fetchRedditPost, buildRewritePrompt, buildCommentPrompt, buildPostPrompt, buildFlowPrompt, buildSubredditPostPrompt, normalizeSubreddit } from './reddit.js'
import { listBundled, listBundledPacks, scrapePinterest } from './library.js'
import { fetchChannels } from './youtube.js'
import { fetchCommentsBatch } from './ytComments.js'
import { withViewDeltas } from './viewSnapshots.js'
import { fetchProfiles } from './social.js'
import { fetchQuotes, fetchFxRates, analyzeSymbol, fetchNews, searchSymbols, rankIdeaCandidates, buildPortfolioPrompt, buildIdeasPrompt, buildWhyPrompt } from './stocks.js'
import { logger } from './log.js'
import { authGate, checkPassword, authCookie, clearAuthCookie, isAuthed, AUTH_REQUIRED } from './auth.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const schedLog = logger('schedule')

export const app = express()
app.use(express.json({ limit: '200mb' })) // base64 slide images — and full MP4 videos — can be large

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

// Never send real key values to the browser — only whether each is set. The
// rest of "config" (projects, Brain, model choice) lives in the browser now
// (src/lib/localWorkspace.ts), so this endpoint is just key status.
const maskKeys = (keys) => ({
  postbridge: !!keys.postbridge,
  openrouter: !!keys.openrouter,
  apify: !!keys.apify,
  fmp: !!keys.fmp,
})

// ── Keys ──────────────────────────────────────────────────────────────────
app.get('/api/config', h(async (_req, res) => res.json({ keys: maskKeys(await getKeys()) })))
app.put('/api/config', h(async (req, res) => res.json({ keys: maskKeys(await saveKeys(req.body?.keys || {})) })))

// Validate that the saved keys actually work, so Settings can show a green check.
app.post('/api/config/test', h(async (_req, res) => {
  const keys = await getKeys()
  const result = { postbridge: false, openrouter: false, apify: false, fmp: false, errors: {} }
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
  if (keys.fmp) {
    try { await fetchQuotes(['AAPL'], keys.fmp); result.fmp = true }
    catch (e) { result.errors.fmp = e.message }
  }
  res.json(result)
}))


// Public model catalog for the Settings dropdown.
app.get('/api/models', h(async (_req, res) => res.json(await listModels())))

// Generate a batch of slideshows. The Brain, model choice, and the queue all
// live client-side now (src/lib/localWorkspace.ts / localQueue.ts), so the
// client sends the Brain + model to use; this just returns the AI-written
// text. Backgrounds aren't assigned here either — the server doesn't know
// about scraped/uploaded images (they're in the browser's IndexedDB), so the
// client assigns them after this returns; see src/lib/backgrounds.ts.
app.post('/api/generate', h(async (req, res) => {
  const keys = await getKeys()
  const count = Math.min(Math.max(Math.round(Number(req.body?.count) || 4), 1), 100)
  const slidesPerShow = Math.min(Math.max(Math.round(Number(req.body?.slidesPerShow) || 6), 2), 12)
  const length = req.body?.length === 'long' ? 'long' : 'short'
  const model = String(req.body?.model || '').trim() || 'openai/gpt-4o-mini'
  const brain = {
    niche: '',
    appName: '',
    appDescription: '',
    audience: '',
    styleMemory: '',
    ...(req.body?.brain || {}),
  }

  const slideshows = await generateSlideshows({ apiKey: keys.openrouter, model, brain, count, slidesPerShow, length })
  res.json(slideshows)
}))

// Photo packs — real photos from the Upshift photo library, one random image per
// slot in a fixed category order, with AI-written per-slide rules (server/photopack.js).
app.post('/api/photopack', h(async (req, res) => {
  const keys = await getKeys()
  const count = Math.min(Math.max(Math.round(Number(req.body?.count) || 1), 1), 30)
  const model = String(req.body?.model || '').trim() || 'openai/gpt-4o-mini'
  const brain = {
    niche: '',
    appName: '',
    appDescription: '',
    audience: '',
    styleMemory: '',
    ...(req.body?.brain || {}),
  }

  // Full image URLs the user hid in the Photo Packs curation grid — the picker
  // skips these per slot (server/photopack.js).
  const exclude = Array.isArray(req.body?.exclude) ? req.body.exclude.map(String) : []
  // Cover hook shape; 'varied' (default) rotates shapes across the batch.
  const hookStyle = String(req.body?.hookStyle || 'varied').trim() || 'varied'
  const packs = await generatePhotoPacks({ apiKey: keys.openrouter, model, brain, count, exclude, hookStyle })
  res.json(packs)
}))

// Same-origin image proxy for the R2 photo library. The client renderer bakes
// slides onto a <canvas> and calls toDataURL — a cross-origin image (R2 sends no
// CORS header) would taint the canvas and break PNG/ZIP/video export. Fetching
// the bytes through our own origin sidesteps that. Locked to the photo-library
// host + path prefix so it can't be used as an open proxy (SSRF).
const PHOTO_HOST = 'pub-bfc81603fd4b4df8ac0e06b2eb1e364b.r2.dev'
const PHOTO_PREFIX = '/tools/upshift/photo_library/'
app.get('/api/photo', h(async (req, res) => {
  let target
  try { target = new URL(String(req.query.u || '')) } catch { return res.status(400).send('bad url') }
  if (target.protocol !== 'https:' || target.hostname !== PHOTO_HOST || !target.pathname.startsWith(PHOTO_PREFIX)) {
    return res.status(403).send('forbidden')
  }
  const upstream = await fetch(target.href)
  if (!upstream.ok) return res.status(upstream.status).send('upstream error')
  res.set('Content-Type', upstream.headers.get('content-type') || 'image/jpeg')
  res.set('Cache-Control', 'public, max-age=86400')
  res.send(Buffer.from(await upstream.arrayBuffer()))
}))

// ── Image library ──────────────────────────────────────────────────────────────
// Bundled aesthetic packs only — scraped/uploaded images live in the browser's
// IndexedDB (src/lib/localLibrary.ts) and never touch the server except to be
// scraped in the first place (below).
app.get('/api/library', h(async (_req, res) => res.json(listBundled())))
app.get('/api/library/packs', h(async (_req, res) => res.json(listBundledPacks())))

// Scrapes Pinterest (needs the Apify key + avoids browser CORS) and returns
// the downloaded images as data URLs — the client saves them into its own
// local library. Nothing is persisted server-side. The actor is a client-side
// setting (localWorkspace), so it's passed in the request.
app.post('/api/library/scrape', h(async (req, res) => {
  const keys = await getKeys()
  const { searches, count, actor } = req.body || {}
  res.json(await scrapePinterest({ apiKey: keys.apify, actor, searches, count }))
}))

// ── Reddit tools (standalone — nothing to do with slideshows) ────────────────
// Best-effort extract of title/body/images from a public Reddit post link.
app.post('/api/reddit/fetch', h(async (req, res) => {
  const { url } = req.body || {}
  if (!url) throw new Error('Paste a Reddit post link.')
  res.json(await fetchRedditPost(url))
}))

// Rewrite a post so it reads like a different real person wrote it.
app.post('/api/reddit/rewrite', h(async (req, res) => {
  const keys = await getKeys()
  const model = String(req.body?.model || '').trim() || 'openai/gpt-4o-mini'
  const { title, body } = req.body || {}
  const out = await chatJSON({ apiKey: keys.openrouter, model, prompt: buildRewritePrompt({ title, body }) })
  res.json({ title: String(out.title || ''), body: String(out.body || '') })
}))

// Viral reply comments for a post (text and/or a screenshot).
app.post('/api/comment', h(async (req, res) => {
  const keys = await getKeys()
  const model = String(req.body?.model || '').trim() || 'openai/gpt-4o-mini'
  const { text, image } = req.body || {}
  if (!text && !image) throw new Error('Paste some text or upload a screenshot.')
  const prompt = buildCommentPrompt({ text })
  // Crank temperature + penalties so replies don't collapse into the model's
  // safe, clichéd "AI comment" voice.
  const sampling = { temperature: 1.05, frequency_penalty: 0.5, presence_penalty: 0.4 }
  const out = image
    ? await chatJSONVision({ apiKey: keys.openrouter, model, prompt, images: [image], sampling })
    : await chatJSON({ apiKey: keys.openrouter, model, prompt, sampling })
  const comments = Array.isArray(out.comments) ? out.comments.map(String).filter(Boolean).slice(0, 3) : []
  res.json({ comments })
}))

// Strip every kind of quote/apostrophe (straight + smart) — a hard guarantee
// on top of the prompt, since the post generator must never use " or '.
const stripQuotes = (s) => String(s).replace(/["'‘’“”′″`]/g, '')

// Generate human-sounding self-improvement / productivity posts (title + body).
app.post('/api/post/generate', h(async (req, res) => {
  const keys = await getKeys()
  const model = String(req.body?.model || '').trim() || 'openai/gpt-4o-mini'
  const { topic } = req.body || {}
  const length = ['short', 'medium', 'long'].includes(req.body?.length) ? req.body.length : 'long'
  const sampling = { temperature: 1.05, frequency_penalty: 0.5, presence_penalty: 0.4 }
  const out = await chatJSON({ apiKey: keys.openrouter, model, prompt: buildPostPrompt({ topic, length }), sampling })
  const posts = (Array.isArray(out.posts) ? out.posts : [])
    .map((p) => ({ title: stripQuotes(p?.title || '').trim(), body: stripQuotes(p?.body || '').trim() }))
    .filter((p) => p.title || p.body)
    .slice(0, 3)
  res.json({ posts })
}))

// Draft 3 post options tailored to a subreddit, from just the name + an
// optional topic — the model uses what it knows about a sub with that name.
// No Reddit API call, so it needs no Reddit credentials and never 403s.
app.post('/api/subreddit/draft', h(async (req, res) => {
  const keys = await getKeys()
  const model = String(req.body?.model || '').trim() || 'openai/gpt-4o-mini'
  const name = normalizeSubreddit(req.body?.subreddit) // validates + strips "r/"
  const length = ['short', 'medium', 'long'].includes(req.body?.length) ? req.body.length : 'medium'
  const topic = String(req.body?.topic || '').trim()

  const sampling = { temperature: 1.0, frequency_penalty: 0.4, presence_penalty: 0.3 }
  const out = await chatJSON({
    apiKey: keys.openrouter,
    model,
    prompt: buildSubredditPostPrompt({ name, topic, length }),
    sampling,
  })
  const posts = (Array.isArray(out.posts) ? out.posts : [])
    .map((p) => ({ title: String(p?.title || '').trim(), body: String(p?.body || '').trim() }))
    .filter((p) => p.title || p.body)
    .slice(0, 3)
  res.json({ subreddit: name, posts })
}))

// Structured JSON image-prompts (Google Flow) with an anchored character.
app.post('/api/flow/generate', h(async (req, res) => {
  const keys = await getKeys()
  const model = String(req.body?.model || '').trim() || 'openai/gpt-4o-mini'
  const { gender, environment, activity, aspectRatio, count } = req.body || {}
  const sampling = { temperature: 0.9 }
  const out = await chatJSON({
    apiKey: keys.openrouter,
    model,
    prompt: buildFlowPrompt({ gender, environment, activity, aspectRatio, count }),
    sampling,
  })
  const prompts = (Array.isArray(out.prompts) ? out.prompts : []).filter((p) => p && typeof p === 'object')
  res.json({ prompts })
}))

// ── YouTube channel dashboard (public data, no API key) ─────────────────────
// Resolve a batch of channel links to their public profile + latest uploads
// (views/likes/thumbnails) via the channel page + RSS feed. `noCache` forces a
// fresh fetch (the Refresh button). Per-channel errors are captured, not thrown,
// so one bad link doesn't blank the whole dashboard.
app.post('/api/youtube/channels', h(async (req, res) => {
  const channels = Array.isArray(req.body?.channels) ? req.body.channels : []
  const noCache = !!req.body?.noCache
  // Return the full feed (~15) so the client can filter by time window (24h /
  // week) without a refetch; the default "no filter" view shows the latest 5.
  const result = await fetchChannels(channels, { limit: 15, noCache })
  // Record each video's current view count and attach real per-window gained
  // views (`video.gained`), measured against our own snapshot history.
  res.json(await withViewDeltas(result))
}))

// Recent public comments on a batch of videos, so the dashboard can show what
// needs replying to. No API key — this reads the same public surface the watch
// page itself loads (see ytComments.js). Per-video errors are captured.
app.post('/api/youtube/comments', h(async (req, res) => {
  const videos = Array.isArray(req.body?.videos) ? req.body.videos : []
  const noCache = !!req.body?.noCache
  const limit = Math.min(Math.max(Number(req.body?.limit) || 20, 1), 100)
  res.json(await fetchCommentsBatch(videos, { limit, noCache }))
}))

// ── Social profiles (Instagram / TikTok / X / Threads / Facebook) ───────────
// Best-effort PUBLIC follower/post counts scraped from each profile's Open Graph
// tags + embedded JSON (no API key). Login-walled platforms may come back with
// just the account; per-account errors are captured, not thrown.
app.post('/api/social/profiles', h(async (req, res) => {
  const platform = String(req.body?.platform || '')
  const accounts = Array.isArray(req.body?.accounts) ? req.body.accounts : []
  const noCache = !!req.body?.noCache
  res.json(await fetchProfiles(platform, accounts, { noCache }))
}))

// ── Stock analyzer (Financial Modeling Prep + AI summaries) ─────────────────
// Live quotes for a batch of tickers — the cheap call the dashboard runs on
// load/refresh (today's move + price per holding). Bad tickers drop out.
app.post('/api/stocks/quotes', h(async (req, res) => {
  const keys = await getKeys()
  const symbols = Array.isArray(req.body?.symbols) ? req.body.symbols : []
  res.json(await fetchQuotes(symbols, keys.fmp))
}))

// FX spot rates for the portfolio display-currency toggle (no key needed).
app.post('/api/stocks/fx', h(async (req, res) => {
  res.json(await fetchFxRates(req.body?.base || 'USD'))
}))

// Symbol search for the "add holding" flow, so the user picks a ticker FMP has.
app.get('/api/stocks/search', h(async (req, res) => {
  const keys = await getKeys()
  res.json(await searchSymbols(String(req.query.q || ''), keys.fmp))
}))

// Full enrichment for one symbol (detail panel): profile, analyst target &
// rating consensus, earnings, news. Expensive-ish → the client calls it on
// demand (opening a holding), not for the whole list at once.
app.post('/api/stocks/analyze', h(async (req, res) => {
  const keys = await getKeys()
  const symbol = String(req.body?.symbol || '').trim()
  if (!symbol) throw new Error('No symbol.')
  res.json(await analyzeSymbol(symbol, keys.fmp))
}))

// News for one symbol (the "why did it move" feed / news tab).
app.post('/api/stocks/news', h(async (req, res) => {
  const keys = await getKeys()
  const symbol = String(req.body?.symbol || '').trim()
  if (!symbol) throw new Error('No symbol.')
  res.json(await fetchNews(symbol, keys.fmp))
}))

// AI: explain today's move from the stock's own headlines. Fetches fresh news
// server-side so the client just sends the symbol + today's %.
app.post('/api/stocks/why', h(async (req, res) => {
  const keys = await getKeys()
  const model = String(req.body?.model || '').trim() || 'openai/gpt-4o-mini'
  const symbol = String(req.body?.symbol || '').trim()
  if (!symbol) throw new Error('No symbol.')
  const news = await fetchNews(symbol, keys.fmp)
  const out = await chatJSON({
    apiKey: keys.openrouter,
    model,
    prompt: buildWhyPrompt({ symbol, name: req.body?.name, changePct: req.body?.changePct, news }),
    sampling: { temperature: 0.3 },
  })
  res.json({
    explanation: String(out.explanation || ''),
    drivers: Array.isArray(out.drivers) ? out.drivers.map(String).slice(0, 6) : [],
    disclaimer: String(out.disclaimer || ''),
    news,
  })
}))

// AI: whole-portfolio summary + a stance per holding. The client sends holdings
// already enriched with quote/target/rating/gain so the model reasons over real
// numbers (and we don't re-fetch everything here).
app.post('/api/stocks/summary', h(async (req, res) => {
  const keys = await getKeys()
  const model = String(req.body?.model || '').trim() || 'openai/gpt-4o-mini'
  const holdings = Array.isArray(req.body?.holdings) ? req.body.holdings : []
  if (!holdings.length) throw new Error('No holdings to summarize.')
  const out = await chatJSON({
    apiKey: keys.openrouter,
    model,
    prompt: buildPortfolioPrompt(holdings),
    sampling: { temperature: 0.3, max_tokens: 3000 },
  })
  res.json({
    overview: String(out.overview || ''),
    positions: Array.isArray(out.positions) ? out.positions : [],
    watch: Array.isArray(out.watch) ? out.watch.map(String) : [],
    disclaimer: String(out.disclaimer || ''),
  })
}))

// New-stock ideas, screened on REAL data (analyst upside, rating, 52-week
// position, last earnings) then given a fact-based thesis by the model. The
// numbers come from FMP/the screener — the model only phrases them, so it can't
// invent a rationale. Research, not a buy directive.
app.post('/api/stocks/ideas', h(async (req, res) => {
  const keys = await getKeys()
  const model = String(req.body?.model || '').trim() || 'openai/gpt-4o-mini'
  const held = Array.isArray(req.body?.holdings)
    ? req.body.holdings.map((x) => (typeof x === 'string' ? x : x?.symbol)).filter(Boolean)
    : []

  const candidates = await rankIdeaCandidates(held, keys.fmp)
  if (!candidates.length) {
    return res.json({ ideas: [], disclaimer: 'No candidates with analyst data were available to screen right now.' })
  }

  const out = await chatJSON({
    apiKey: keys.openrouter,
    model,
    prompt: buildIdeasPrompt(candidates),
    sampling: { temperature: 0.3, max_tokens: 2000 },
  })
  const thesisBy = new Map(
    (Array.isArray(out.ideas) ? out.ideas : []).map((i) => [String(i.symbol || '').toUpperCase(), String(i.thesis || '')])
  )

  // Merge the model's thesis back onto the hard facts, so the UI can show both
  // the figures (as chips) and the rationale.
  const ideas = candidates.map((c) => ({
    symbol: c.symbol,
    name: c.name,
    price: c.price,
    currency: c.currency,
    targetConsensus: c.consensus,
    upsidePct: c.upsidePct,
    rating: c.rating,
    pos52: c.pos52,
    epsBeat: c.epsBeat,
    theme: c.theme,
    marketCap: c.marketCap,
    headline: c.headline,
    headlineUrl: c.headlineUrl,
    headlineSite: c.headlineSite,
    thesis: thesisBy.get(c.symbol.toUpperCase()) || '',
  }))
  res.json({ ideas, disclaimer: String(out.disclaimer || '') })
}))

// ── post-bridge ───────────────────────────────────────────────────────────────
app.get('/api/accounts', h(async (_req, res) => {
  const keys = await getKeys()
  res.json(await listAccounts(keys.postbridge))
}))

app.get('/api/posts', h(async (_req, res) => {
  const keys = await getKeys()
  res.json(await listPosts(keys.postbridge))
}))

app.get('/api/results', h(async (_req, res) => {
  const keys = await getKeys()
  res.json(await listAnalytics(keys.postbridge))
}))

// Pull fresh metrics from the platforms, then hand back the updated analytics.
// post-bridge rate-limits sync (429) — swallow that so the refresh still returns
// whatever's already there.
app.post('/api/results/sync', h(async (_req, res) => {
  const keys = await getKeys()
  try { await syncAnalytics(keys.postbridge) } catch (e) { console.warn('[results] sync skipped:', e.message) }
  res.json(await listAnalytics(keys.postbridge))
}))

// Schedule a slideshow: upload its media to post-bridge, then create the post.
// Two shapes of media, mutually exclusive:
//   • `slides` — data URLs (PNG) rendered in the browser → a carousel post.
//   • `video`  — a single data URL (MP4) rendered in the browser → a video post
//     (YouTube Short / Reel / TikTok). Prefer this for a channel-per-character
//     video pipeline.
app.post('/api/schedule', h(async (req, res) => {
  const keys = await getKeys()
  const { id, caption, slides, video, socialAccounts, scheduledAt, mode } = req.body || {}
  if (!socialAccounts?.length) throw new Error('Pick at least one social account.')
  if (!video && !slides?.length) throw new Error('No media to upload (need slides or a video).')

  const when = mode === 'schedule' ? (scheduledAt ? `scheduled for ${scheduledAt}` : 'scheduled') : 'draft'
  schedLog.start(`Posting ${id || 'slideshow'} → ${when} · ${socialAccounts.length} account${socialAccounts.length === 1 ? '' : 's'}`)

  let mediaIds
  if (video) {
    // Single video → one media upload. The data URL's mime (e.g. video/mp4 or
    // video/webm) is carried through so post-bridge stores the right type.
    const m = /^data:(video\/[\w.+-]+);base64,/.exec(String(video))
    const mimeType = m ? m[1] : 'video/mp4'
    const ext = mimeType.includes('webm') ? 'webm' : 'mp4'
    const buffer = Buffer.from(String(video).replace(/^data:video\/[\w.+-]+;base64,/, ''), 'base64')
    schedLog.step(`uploading video (${(buffer.length / 1e6).toFixed(1)} MB)…`)
    const mediaId = await uploadMedia(keys.postbridge, { buffer, mimeType, name: `${id || 'video'}.${ext}` })
    mediaIds = [mediaId]
  } else {
    // Upload all slides concurrently — post-bridge handles them independently, so
    // there's no reason to wait for each. Results stay in slide order (the index
    // into the array) so the carousel keeps its sequence.
    let done = 0
    mediaIds = await Promise.all(
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
  }

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
