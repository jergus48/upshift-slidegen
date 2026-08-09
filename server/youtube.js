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
  return { id, title, avatar }
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
  const { id, title, avatar } = parseChannelPage(html)
  if (!id) throw new Error('Could not find this channel — check the link.')

  const feedRes = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`, {
    headers: FETCH_HEADERS,
  })
  if (!feedRes.ok) throw new Error(`feed ${feedRes.status}`)
  const xml = await feedRes.text()

  const data = {
    id,
    title: title || decodeEntities(firstMatch(xml, /<title>([^<]*)<\/title>/)) || 'Channel',
    avatar,
    url: `https://www.youtube.com/channel/${id}`,
    videos: parseFeed(xml, limit),
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
