// Image library: the bundled aesthetic packs (shipped in public/library/) plus
// any images added at runtime — scraped from Pinterest with your own Apify
// key, or uploaded by hand. Runtime images are backed by storage.js, so they
// live on local disk when self-hosted or in Vercel Blob when deployed, with
// their index in the matching JSON/Redis store — see storage.js for why.
import { extname } from 'node:path'
import { existsSync, readdirSync } from 'node:fs'
import { logger } from './log.js'
import { CLOUD, readData, writeData, putImage, deleteImage, localMediaPath } from './storage.js'
import manifest from '../public/library/manifest.json' with { type: 'json' }

const log = logger('scrape')
const LIBRARY_KEY = 'library'

// Flatten the bundled manifest into image records the UI can render. These
// ship as static files in public/library/ and are unaffected by CLOUD vs
// local — Vite copies public/ straight into the build output either way.
function bundled() {
  return (manifest.packs || []).flatMap((pack) =>
    (pack.images || []).map((path) => ({
      id: `bundled:${path}`,
      url: `/library/${path}`,
      pack: pack.name,
      source: 'bundled',
    }))
  )
}

// Names of the bundled aesthetic packs (used as the default selection for new projects).
export function bundledPackNames() {
  return (manifest.packs || []).map((p) => p.name)
}

async function runtimeIndex() {
  const raw = await readData(LIBRARY_KEY, [])
  // Pre-refactor records stored the local filename under `file` — normalize
  // to `ref` on read so existing ~/.slidesmith/library.json data keeps working.
  return raw.map((r) => (r.ref ? r : { ...r, ref: r.file }))
}
function writeRuntimeIndex(index) {
  return writeData(LIBRARY_KEY, index)
}

// Recover local image files on disk that aren't in the index (e.g. if the
// index was emptied or drifted). Local-only: Blob has no cheap "list orphans"
// equivalent, and uploads/deletes always go through the index-writing paths
// in cloud mode, so this isn't needed there.
async function reconcileOrphans(index) {
  if (CLOUD) return index
  const mediaDir = localMediaPath('') // ~/.slidesmith/library
  if (!existsSync(mediaDir)) return index
  const known = new Set(index.map((s) => s.ref))
  let changed = false
  for (const file of readdirSync(mediaDir)) {
    if (!/\.(jpe?g|png|webp)$/i.test(file) || known.has(file)) continue
    index.push({ id: `scraped:${file.replace(/\.[^.]+$/, '')}`, ref: file, pack: 'Scraped', addedAt: new Date().toISOString(), source: 'scraped' })
    changed = true
  }
  if (changed) await writeRuntimeIndex(index)
  return index
}

// A public URL for a runtime image: the Blob URL itself in cloud mode, or our
// own id-keyed proxy route locally (decouples the served id from the on-disk
// filename, which carries the real file extension).
function publicUrl(id, ref) {
  return CLOUD ? ref : `/api/library/img/${encodeURIComponent(id)}`
}

export async function listLibrary() {
  const index = await reconcileOrphans(await runtimeIndex())
  // Only list local images whose files actually exist on disk — avoids broken
  // thumbnails / 404s if the index and files ever drift apart. Cloud (Blob)
  // entries are trusted as-is; checking each one would mean a network round
  // trip per image on every listing.
  const runtime = (CLOUD ? index : index.filter((r) => existsSync(localMediaPath(r.ref))))
    .map((r) => ({
      id: r.id,
      url: publicUrl(r.id, r.ref),
      pack: r.pack || 'Scraped',
      source: r.source || 'scraped',
    }))
  // Runtime images first (newest), then the bundled packs.
  return [...runtime, ...bundled()]
}

// Group the library into packs with a few cover thumbnails each (for the
// pack-picker UIs in Generate + Settings).
export async function listPacks() {
  const map = new Map()
  for (const img of await listLibrary()) {
    if (!map.has(img.pack)) map.set(img.pack, { name: img.pack, source: img.source, count: 0, covers: [] })
    const p = map.get(img.pack)
    p.count++
    if (p.covers.length < 4) p.covers.push(img.url)
  }
  return [...map.values()]
}

// Local-only: resolve a runtime image id to its file on disk, for the
// /api/library/img/:id route to stream. Cloud images are served straight from
// their Blob URL and never reach this route.
export async function getScrapedFile(id) {
  if (CLOUD) return null
  const rec = (await runtimeIndex()).find((r) => r.id === id)
  if (!rec) return null
  const p = localMediaPath(rec.ref)
  return existsSync(p) ? p : null
}

export async function removeScraped(id) {
  const index = await runtimeIndex()
  const rec = index.find((r) => r.id === id)
  if (rec) await deleteImage(rec.ref)
  await writeRuntimeIndex(index.filter((r) => r.id !== id))
  return listLibrary()
}

// Save user-uploaded images (sent as data URLs) into a pack of their choosing.
export async function addUploaded({ pack, images }) {
  const list = Array.isArray(images) ? images : []
  if (!list.length) throw new Error('No images provided.')
  const packName = (pack || '').trim() || 'My Uploads'

  const index = await runtimeIndex()
  const addedRecords = []
  for (const dataUrl of list) {
    const m = /^data:image\/(\w+);base64,(.+)$/i.exec(String(dataUrl))
    if (!m) continue
    const ext = (m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase()).slice(0, 5)
    const buf = Buffer.from(m[2], 'base64')
    if (buf.length < 100) continue // skip empty/corrupt uploads
    const id = `scraped:${Date.now()}-${Math.round(Math.random() * 1e6)}`
    const filename = `${id.replace('scraped:', '')}.${ext}`
    const ref = await putImage(filename, buf, `image/${ext === 'jpg' ? 'jpeg' : ext}`)
    const rec = { id, ref, pack: packName, addedAt: new Date().toISOString(), source: 'uploaded' }
    index.unshift(rec)
    addedRecords.push(rec)
  }
  if (!addedRecords.length) throw new Error('No valid images to upload.')
  await writeRuntimeIndex(index)
  return {
    // Newly added images, in the same order as the input files.
    added: addedRecords.map((r) => ({ id: r.id, url: publicUrl(r.id, r.ref), pack: r.pack, source: r.source })),
    library: await listLibrary(),
  }
}

// Pull image URLs out of whatever the Pinterest actor returns. Pinterest actors
// vary in shape between versions, so we try the structured path first (best
// quality) and fall back to scanning the whole response for pinimg.com assets,
// preferring full-size originals over thumbnails.
function pinImageUrls(items) {
  const list = Array.isArray(items) ? items : []

  // 1) Structured: media.images.{original|large|...}
  const structured = new Set()
  for (const item of list) {
    if (item && typeof item === 'object') {
      if (item.type && item.type !== 'pin') continue
      const s = item?.media?.images
      const chosen = s?.original ?? s?.orig ?? s?.large ?? s?.medium ?? s?.small
      if (chosen?.url) structured.add(String(chosen.url).replace(/&amp;/g, '&'))
    }
  }
  if (structured.size) return [...structured]

  // 2) Fallback: scan the whole blob for pinimg URLs. Prefer /originals/.
  const blob = JSON.stringify(list)
  const matches = blob.match(/https?:\\?\/\\?\/[^"'\\\s]*pinimg\.com[^"'\\\s]*/gi) || []
  const cleaned = matches
    .map((u) => u.replace(/\\\//g, '/').replace(/&amp;/g, '&'))
    .filter((u) => /\.(jpe?g|png|webp)/i.test(u))
  const originals = cleaned.filter((u) => /\/originals\//i.test(u))
  // De-dupe by the trailing filename so we don't keep both a thumb and original.
  const byName = new Map()
  for (const u of [...originals, ...cleaned]) {
    const name = u.split('/').pop()
    if (name && !byName.has(name)) byName.set(name, u)
  }
  return [...byName.values()]
}

// Pinterest's CDN 403s requests without a browser-ish User-Agent.
const IMG_FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Referer: 'https://www.pinterest.com/',
}

const APIFY = 'https://api.apify.com/v2/acts'

export async function scrapePinterest({ apiKey, actor, searches, count }) {
  if (!apiKey) throw new Error('Missing Apify API key. Add it in Settings.')
  const queries = (searches || []).map((s) => s.trim()).filter(Boolean)
  if (!queries.length) throw new Error('Enter at least one Pinterest search.')

  const actorPath = (actor || 'fatihtahta/pinterest-scraper-search').replace('/', '~')
  // This actor expects `{ queries, limit }` (NOT `searches`/`resultsLimit`), and
  // its minimum limit is 10 — anything lower returns 0 items.
  const limit = Math.min(Math.max(Number(count) || 40, 10), 200)
  const input = { queries, limit }
  const pack = queries.join(', ')

  log.start(`Scraping Pinterest → "${pack}" (up to ${limit})`)
  log.step(`running Apify actor ${actor || 'fatihtahta/pinterest-scraper-search'}…`)
  const res = await fetch(`${APIFY}/${actorPath}/run-sync-get-dataset-items?token=${apiKey}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(300_000),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    log.fail(`Apify ${res.status}`)
    throw new Error(`Apify ${res.status}: ${t.slice(0, 160)}`)
  }
  const items = await res.json()
  log.info(`actor returned ${Array.isArray(items) ? items.length : 0} item${(Array.isArray(items) ? items.length : 0) === 1 ? '' : 's'}`)
  const urls = pinImageUrls(items).slice(0, limit)
  if (!urls.length) {
    const n = Array.isArray(items) ? items.length : 0
    log.fail(`no images found (actor returned ${n} item${n === 1 ? '' : 's'})`)
    throw new Error(`No images found (actor returned ${n} item${n === 1 ? '' : 's'}). Try a different search or actor.`)
  }
  log.ok(`found ${urls.length} image${urls.length === 1 ? '' : 's'} — downloading…`)

  const index = await runtimeIndex()
  let added = 0
  let skipped = 0
  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: IMG_FETCH_HEADERS })
      if (!r.ok) { skipped++; continue }
      const buf = Buffer.from(await r.arrayBuffer())
      if (buf.length < 1024) { skipped++; continue } // skip tiny/placeholder
      const ext = (extname(new URL(url).pathname) || '.jpg').slice(0, 5)
      const id = `scraped:${Date.now()}-${Math.round(Math.random() * 1e6)}`
      const filename = `${id.replace('scraped:', '')}${ext}`
      const contentType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
      const ref = await putImage(filename, buf, contentType)
      index.unshift({ id, ref, pack, addedAt: new Date().toISOString(), source: 'scraped' })
      added++
      if (added % 5 === 0 || added === urls.length) log.progress(added, urls.length, 'downloaded')
    } catch {
      skipped++ // skip individual failures
    }
  }
  await writeRuntimeIndex(index)
  log.ok(`Added ${added} image${added === 1 ? '' : 's'} to "${pack}"${skipped ? ` (${skipped} skipped)` : ''}`)
  return { added, found: urls.length }
}
