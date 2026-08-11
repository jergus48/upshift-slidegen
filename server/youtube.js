// Public YouTube channel stats — NO API key required. Everything here comes from
// two public, unauthenticated sources that anyone can see in a browser:
//
//   1. The channel page HTML — for the channel's real id (UC…), display name,
//      and avatar (profile picture). We read the <link rel="canonical"> and the
//      og:title / og:image meta tags.
//   2. The channel's RSS feed (https://www.youtube.com/feeds/videos.xml) — for
//      the latest ~15 uploads, each carrying a title, thumbnail, publish date,
//      view count (media:statistics) and like/rating count (media:starRating).
//
// This is deliberately dependency-free (regex over the markup, no XML/HTML
// parser) and quota-free. The trade-off vs. the official Data API is that these
// public surfaces can change shape without notice — hence the defensive parsing
// and per-channel error capture upstream in app.js.

// A desktop UA + consent cookie so YouTube serves the real page instead of a
// redirect to its cookie-consent interstitial (which carries none of the data).
const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  Cookie: 'CONSENT=YES+1',
}

const CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{22}$/

// Turn whatever the user pasted into a channel page URL we can fetch. Accepts a
// bare UC… id, an @handle, a plain name, or any youtube.com channel URL
// (/channel/…, /@handle, /c/…, /user/…).
function toChannelUrl(input) {
  const raw = String(input || '').trim()
  if (!raw) throw new Error('Empty channel link.')
  if (CHANNEL_ID_RE.test(raw)) return `https://www.youtube.com/channel/${raw}`
  if (raw.startsWith('@')) return `https://www.youtube.com/${raw}`
  if (/youtube\.com|youtu\.be/i.test(raw)) {
    const url = raw.startsWith('http') ? raw : `https://${raw}`
    return url.replace(/^http:/, 'https:')
  }
  // A bare word → assume it's a handle.
  return `https://www.youtube.com/@${raw.replace(/^@/, '')}`
}

function firstMatch(html, re) {
  const m = re.exec(html)
  return m ? m[1] : ''
}

// Pull channel id, display name and avatar out of the channel page HTML.
function parseChannelPage(html) {
  const id =
    firstMatch(html, /rel="canonical"\s+href="https:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})"/) ||
    firstMatch(html, /"externalId":"(UC[A-Za-z0-9_-]{22})"/) ||
    firstMatch(html, /"channelId":"(UC[A-Za-z0-9_-]{22})"/)
  const title = decodeEntities(firstMatch(html, /<meta[^>]+property="og:title"[^>]+content="([^"]*)"/))
  const avatar = firstMatch(html, /<meta[^>]+property="og:image"[^>]+content="([^"]*)"/)
  // Subscriber count is embedded in ytInitialData as a compact string like
  // "51M subscribers" / "1.23K subscribers" / "1,234 subscribers".
  const subsText =
    firstMatch(html, /"subscriberCountText":\{[^}]*"simpleText":"([^"]+)"/) ||
    firstMatch(html, /"subscriberCountText":\{[^}]*"content":"([^"]+)"/) ||
    firstMatch(html, /([\d.,]+[KMB]?)\s+subscribers?/i)
  const subscribers = subsText ? parseCompactCount(subsText) : 0
  return { id, title, avatar, subscribers }
}

// Minimal HTML/XML entity decode for the handful that show up in titles.
function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

// Parse the RSS feed XML into video records. Regex per <entry> block — the feed
// is machine-generated and stable in shape, so this stays simple.
function parseFeed(xml, limit) {
  const out = []
  const entries = xml.split('<entry>').slice(1)
  for (const entry of entries) {
    const id = firstMatch(entry, /<yt:videoId>([^<]+)<\/yt:videoId>/)
    if (!id) continue
    const title = decodeEntities(firstMatch(entry, /<title>([^<]*)<\/title>/))
    const publishedAt = firstMatch(entry, /<published>([^<]+)<\/published>/)
    const thumbnail =
      firstMatch(entry, /<media:thumbnail\s+url="([^"]+)"/) || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
    const views = Number(firstMatch(entry, /<media:statistics\s+views="(\d+)"/) || 0)
    // Since dislikes were removed, the star-rating count tracks the like count
    // closely enough to show as "likes".
    const likes = Number(firstMatch(entry, /<media:starRating[^>]*count="(\d+)"/) || 0)
    out.push({
      id,
      title,
      url: `https://www.youtube.com/watch?v=${id}`,
      thumbnail,
      views,
      likes,
      publishedAt,
    })
    if (out.length >= limit) break
  }
  return out
}

// --- Channel-page fallback --------------------------------------------------
// As of Aug 2026 YouTube's public RSS endpoint (feeds/videos.xml) started
// serving a generic "Error 404/500" page for every channel — a YouTube-side
// break, not a bad-handle problem (it fails for MrBeast too). When the feed is
// unavailable we scrape the same uploads out of the channel's /videos page,
// which still renders fine. That page embeds the uploads as `lockupViewModel`
// objects inside `ytInitialData`. This surface has no like counts and only a
// relative ("2d ago") date, so those are approximated.

const YT_INITIAL_DATA_RE = /var ytInitialData = (\{.+?\});<\/script>/s

// "51M" / "1.2M" / "934K" / "1,234" / "1.2 thousand" / "3 million" → number.
function parseCompactCount(s) {
  const t = String(s || '').trim().replace(/,/g, '')
  const m = /([\d.]+)\s*(thousand|million|billion|[KMB])?/i.exec(t)
  if (!m) return 0
  const n = Number(m[1]) || 0
  const mult =
    { K: 1e3, THOUSAND: 1e3, M: 1e6, MILLION: 1e6, B: 1e9, BILLION: 1e9 }[(m[2] || '').toUpperCase()] || 1
  return Math.round(n * mult)
}

// "2d ago" / "3 weeks ago" / "5 hours ago" / "1 year ago" → approximate ISO
// timestamp, so the frontend's date math and "time ago" labels keep working.
function relativeToIso(s) {
  const t = String(s || '').toLowerCase()
  const m = /(\d+)\s*(second|minute|hour|day|week|month|year|s|min|h|d|w|mo|y)/.exec(t)
  if (!m) return ''
  const n = Number(m[1])
  const unit = m[2]
  const secs =
    { second: 1, s: 1, minute: 60, min: 60, hour: 3600, h: 3600, day: 86400, d: 86400,
      week: 604800, w: 604800, month: 2592000, mo: 2592000, year: 31536000, y: 31536000 }[unit] || 0
  return new Date(Date.now() - n * secs * 1000).toISOString()
}

// Walk ytInitialData once, collecting each upload in document (newest-first)
// order. Long-form videos come as `lockupViewModel`; Shorts come as
// `shortsLockupViewModel` — channels that post only Shorts have just the latter.
function collectItems(node, out = []) {
  if (!node || typeof node !== 'object') return out
  if (node.lockupViewModel) out.push({ kind: 'video', v: node.lockupViewModel })
  else if (node.shortsLockupViewModel) out.push({ kind: 'short', v: node.shortsLockupViewModel })
  for (const k in node) collectItems(node[k], out)
  return out
}

// A Shorts entry: id + title from overlayMetadata, view count parsed out of the
// accessibility text ("<title>, 787 views - play Short"). No publish date is
// exposed for Shorts on this surface.
function shortToRecord(sl) {
  const id = sl.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId || sl.entityId?.replace(/^shorts-shelf-item-/, '')
  if (!id) return null
  const title = decodeEntities(sl.overlayMetadata?.primaryText?.content || '')
  const views = parseCompactCount((/,\s*([\d.,]+\s*(?:thousand|million|billion)?)\s+views?/i.exec(sl.accessibilityText || '') || [])[1] || '')
  return {
    id,
    title,
    url: `https://www.youtube.com/shorts/${id}`,
    thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    views,
    likes: 0,
    publishedAt: '',
  }
}

// Turn the channel /videos page HTML into the same video records parseFeed
// produces, so the caller doesn't care which source was used.
function parseVideosPage(html, limit) {
  const m = YT_INITIAL_DATA_RE.exec(html)
  if (!m) return []
  let data
  try {
    data = JSON.parse(m[1])
  } catch {
    return []
  }
  const out = []
  const seen = new Set()
  for (const item of collectItems(data)) {
    let rec
    if (item.kind === 'short') {
      rec = shortToRecord(item.v)
    } else {
      const lv = item.v
      const id = lv.contentId
      if (!id) continue
      const meta = lv.metadata?.lockupMetadataViewModel
      const parts = meta?.metadata?.contentMetadataViewModel?.metadataRows?.flatMap((r) => r.metadataParts || []) || []
      let views = 0
      let publishedAt = ''
      for (const p of parts) {
        const text = p?.text?.content || ''
        const label = p?.accessibilityLabel || ''
        if (/view/i.test(label) || /view/i.test(text)) views = parseCompactCount(text)
        else if (/ago|streamed|premiered/i.test(label) || /ago/i.test(text)) publishedAt = relativeToIso(text)
      }
      rec = {
        id,
        title: decodeEntities(meta?.title?.content || ''),
        url: `https://www.youtube.com/watch?v=${id}`,
        thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        views,
        likes: 0, // not exposed on the channel page
        publishedAt,
      }
    }
    if (!rec || !rec.id || seen.has(rec.id)) continue
    seen.add(rec.id)
    out.push(rec)
    if (out.length >= limit) break
  }
  return out
}

// In-memory cache so repeated dashboard loads / refreshes stay fast and don't
// hammer YouTube. Short TTL; the client's Refresh sends noCache to force fresh.
const cache = new Map() // input → { at, data }
const TTL_MS = 5 * 60 * 1000

// Fetch one channel's public profile + latest uploads. `limit` caps how many
// videos come back (the dashboard shows 5).
export async function fetchChannel(input, { limit = 5, noCache = false } = {}) {
  const key = String(input || '').trim().toLowerCase()
  if (!noCache) {
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < TTL_MS) return hit.data
  }

  const pageUrl = toChannelUrl(input)
  const pageRes = await fetch(pageUrl, { headers: FETCH_HEADERS, redirect: 'follow' })
  if (!pageRes.ok) throw new Error(`channel page ${pageRes.status}`)
  const html = await pageRes.text()
  const { id, title, avatar, subscribers } = parseChannelPage(html)
  if (!id) throw new Error('Could not find this channel — check the link.')

  // Primary: the RSS feed (exact views, likes and real publish dates). If it's
  // unavailable (YouTube has been serving error pages for this endpoint), fall
  // back to scraping the channel's /videos page for the latest uploads.
  let videos = []
  let feedTitle = ''
  let feedOk = false
  try {
    const feedRes = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`, {
      headers: FETCH_HEADERS,
    })
    if (feedRes.ok) {
      const xml = await feedRes.text()
      videos = parseFeed(xml, limit)
      feedTitle = decodeEntities(firstMatch(xml, /<title>([^<]*)<\/title>/))
      feedOk = videos.length > 0
    }
  } catch {
    // ignore — fall through to the page scrape
  }

  if (!feedOk) {
    const videosRes = await fetch(`${pageUrl.replace(/\/+$/, '')}/videos`, {
      headers: FETCH_HEADERS,
      redirect: 'follow',
    })
    if (!videosRes.ok) throw new Error(`videos page ${videosRes.status}`)
    videos = parseVideosPage(await videosRes.text(), limit)
  }

  const data = {
    id,
    title: title || feedTitle || 'Channel',
    avatar,
    subscribers,
    url: `https://www.youtube.com/channel/${id}`,
    videos,
  }
  cache.set(key, { at: Date.now(), data })
  return data
}

// Resolve a batch of channel links in parallel, capturing per-channel errors so
// one bad link never fails the whole dashboard.
export async function fetchChannels(inputs, opts = {}) {
  const list = (Array.isArray(inputs) ? inputs : []).map(String).map((s) => s.trim()).filter(Boolean)
  return Promise.all(
    list.map(async (input) => {
      try {
        return { input, ok: true, ...(await fetchChannel(input, opts)) }
      } catch (e) {
        return { input, ok: false, error: e.message || String(e) }
      }
    }),
  )
}
