// Image library. Bundled aesthetic packs ship as static files in
// public/library/ and are the only images the server knows about — scraped
// (Pinterest) and uploaded images live entirely in the browser (IndexedDB,
// see src/lib/localLibrary.ts), since Slidesmith doesn't run its own
// persistent image storage. The server's only job for runtime images is
// scraping Pinterest (needs the Apify key + avoids browser CORS) and handing
// the downloaded bytes straight back to the client to save.
import { logger } from './log.js'
import manifest from '../public/library/manifest.json' with { type: 'json' }

const log = logger('scrape')

// Flatten the bundled manifest into image records the UI can render.
export function listBundled() {
  return (manifest.packs || []).flatMap((pack) =>
    (pack.images || []).map((path) => ({
      id: `bundled:${path}`,
      url: `/library/${path}`,
      pack: pack.name,
      source: 'bundled',
    }))
  )
}

// Grouped for the pack-picker UIs (Generate, Settings) — cover thumbnails only,
// same shape the client merges with its own local (scraped/uploaded) packs.
export function listBundledPacks() {
  return (manifest.packs || []).map((p) => ({
    name: p.name,
    source: 'bundled',
    count: (p.images || []).length,
    covers: (p.images || []).slice(0, 4).map((path) => `/library/${path}`),
  }))
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

// Returns the downloaded images as data URLs — the caller (browser) saves
// them into its own local library. Nothing is persisted server-side.
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

  const images = []
  let skipped = 0
  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: IMG_FETCH_HEADERS })
      if (!r.ok) { skipped++; continue }
      const buf = Buffer.from(await r.arrayBuffer())
      if (buf.length < 1024) { skipped++; continue } // skip tiny/placeholder
      const contentType = r.headers.get('content-type') || 'image/jpeg'
      images.push(`data:${contentType};base64,${buf.toString('base64')}`)
      if (images.length % 5 === 0 || images.length + skipped === urls.length) {
        log.progress(images.length, urls.length, 'downloaded')
      }
    } catch {
      skipped++ // skip individual failures
    }
  }
  if (!images.length) throw new Error('Downloaded 0 usable images — Pinterest may be blocking this server. Try again or a different search.')
  log.ok(`Downloaded ${images.length} image${images.length === 1 ? '' : 's'} for "${pack}"${skipped ? ` (${skipped} skipped)` : ''}`)
  return { pack, found: urls.length, images }
}
