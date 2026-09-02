// Public YouTube comments — NO API key required, same spirit as youtube.js.
//
// YouTube doesn't put comments in the watch-page HTML any more; the page ships
// a continuation token and the browser then calls YouTube's own internal
// endpoint (`/youtubei/v1/next`) to fill the section in. We do exactly what the
// page does, logged out:
//
//   1. GET the watch page — pull `INNERTUBE_API_KEY`, the client version, and
//      the comments-section continuation token out of the embedded config/JSON.
//   2. POST that token to /youtubei/v1/next — the first page of comments.
//   3. That response carries the sort menu (Top / Newest). Since this powers a
//      "what do I need to reply to" list, re-request with the Newest token when
//      it's there, and fall back to Top when it isn't.
//
// Comments come back in two shapes depending on which rollout the response
// uses: the older `commentRenderer` and the newer `commentEntityPayload`
// (framework entity mutations). Both are parsed. As with youtube.js this is
// deliberately dependency-free regex + JSON walking, and defensive: an
// unparseable surface yields an empty list rather than an exception.

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  Cookie: 'CONSENT=YES+1',
}

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/

// Accept a bare id, a watch/shorts/youtu.be URL, or an embed link.
export function toVideoId(input) {
  const raw = String(input || '').trim()
  if (!raw) throw new Error('Empty video link.')
  if (VIDEO_ID_RE.test(raw)) return raw
  const m =
    /[?&]v=([A-Za-z0-9_-]{11})/.exec(raw) ||
    /youtu\.be\/([A-Za-z0-9_-]{11})/.exec(raw) ||
    /\/shorts\/([A-Za-z0-9_-]{11})/.exec(raw) ||
    /\/embed\/([A-Za-z0-9_-]{11})/.exec(raw)
  if (!m) throw new Error('Could not read a video id from that link.')
  return m[1]
}

function firstMatch(s, re) {
  const m = re.exec(s)
  return m ? m[1] : ''
}

// Depth-first walk collecting every value stored under `key`.
function collect(node, key, out = []) {
  if (!node || typeof node !== 'object') return out
  if (Object.prototype.hasOwnProperty.call(node, key)) out.push(node[key])
  for (const k in node) collect(node[k], key, out)
  return out
}

// "1.2K" / "934" / "1,234" -> number. Blank/absent -> 0.
function parseCount(s) {
  const t = String(s || '').trim().replace(/,/g, '')
  const m = /([\d.]+)\s*([KMB])?/i.exec(t)
  if (!m) return 0
  const n = Number(m[1]) || 0
  return Math.round(n * ({ K: 1e3, M: 1e6, B: 1e9 }[(m[2] || '').toUpperCase()] || 1))
}

// Runs of text ({runs:[{text}]}) or a plain {simpleText} — both show up.
function textOf(node) {
  if (!node) return ''
  if (typeof node === 'string') return node
  if (node.simpleText) return String(node.simpleText)
  if (Array.isArray(node.runs)) return node.runs.map((r) => r?.text || '').join('')
  if (node.content) return String(node.content)
  return ''
}

// The watch page's ytInitialData blob (same shape youtube.js relies on).
function parseInitialData(html) {
  const m = /var ytInitialData = (\{.+?\});<\/script>/s.exec(html)
  if (!m) return null
  try {
    return JSON.parse(m[1])
  } catch {
    return null
  }
}

// The continuation token that loads the comments section: the one whose item
// section is tagged as the comments section.
function findCommentsToken(data) {
  for (const section of collect(data, 'itemSectionRenderer')) {
    const id = section?.sectionIdentifier || section?.targetId || ''
    if (!/comment/i.test(id)) continue
    const token = collect(section, 'continuationCommand')[0]?.token
    if (token) return token
  }
  // Newer pages hang the token off the comments engagement panel instead.
  for (const panel of collect(data, 'engagementPanelSectionListRenderer')) {
    if (!/comment/i.test(panel?.targetId || panel?.panelIdentifier || '')) continue
    const token = collect(panel, 'continuationCommand')[0]?.token
    if (token) return token
  }
  return ''
}

// The "Newest first" entry of the Top/Newest sort menu, when the response has one.
function findNewestToken(json) {
  for (const menu of collect(json, 'sortFilterSubMenuRenderer')) {
    const items = menu?.subMenuItems || []
    const newest = items.find((i) => /new/i.test(i?.title || ''))
    const token = newest && collect(newest, 'continuationCommand')[0]?.token
    if (token) return token
  }
  return ''
}

async function innertubeNext({ apiKey, clientVersion, token }) {
  const res = await fetch(`https://www.youtube.com/youtubei/v1/next?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { ...FETCH_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      context: { client: { clientName: 'WEB', clientVersion, hl: 'en', gl: 'US' } },
      continuation: token,
    }),
  })
  if (!res.ok) throw new Error(`comments ${res.status}`)
  return res.json()
}

// --- Comment extraction -----------------------------------------------------

// Newer surface: comment bodies live in `frameworkUpdates` entity mutations.
function fromEntityPayloads(json) {
  const out = []
  for (const p of collect(json, 'commentEntityPayload')) {
    const props = p?.properties || {}
    const author = p?.author || {}
    const id = props.commentId || ''
    if (!id) continue
    out.push({
      id,
      author: author.displayName || '',
      authorUrl: author.channelId ? `https://www.youtube.com/channel/${author.channelId}` : '',
      avatar: author.avatarThumbnailUrl || '',
      text: textOf(props.content),
      publishedText: props.publishedTime || '',
      likes: parseCount(p?.toolbar?.likeCountNotliked),
      replyCount: parseCount(p?.toolbar?.replyCount),
      isOwner: !!author.isCreator,
      isHearted: !!p?.toolbar?.heartActive,
    })
  }
  return out
}

// Older surface: fully-rendered commentRenderer objects.
function fromRenderers(json) {
  const out = []
  for (const c of collect(json, 'commentRenderer')) {
    const id = c?.commentId || ''
    if (!id) continue
    out.push({
      id,
      author: textOf(c.authorText),
      authorUrl: c?.authorEndpoint?.browseEndpoint?.canonicalBaseUrl
        ? `https://www.youtube.com${c.authorEndpoint.browseEndpoint.canonicalBaseUrl}`
        : '',
      avatar: c?.authorThumbnail?.thumbnails?.slice(-1)[0]?.url || '',
      text: textOf(c.contentText),
      publishedText: textOf(c.publishedTimeText).replace(/\s*\(edited\)$/, ''),
      likes: parseCount(c.voteCount ? textOf(c.voteCount) : ''),
      replyCount: Number(c.replyCount || 0),
      isOwner: !!c.authorIsChannelOwner,
      isHearted: !!c.isLiked,
    })
  }
  return out
}

// In-memory cache, mirroring youtube.js: repeated opens of the same video stay
// instant and we don't hammer YouTube. Refresh sends noCache.
const cache = new Map() // videoId -> { at, data }
const TTL_MS = 5 * 60 * 1000

// Fetch the most recent public comments on one video. Returns at most `limit`.
export async function fetchComments(input, { limit = 20, noCache = false } = {}) {
  const videoId = toVideoId(input)
  if (!noCache) {
    const hit = cache.get(videoId)
    if (hit && Date.now() - hit.at < TTL_MS) return hit.data
  }

  const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: FETCH_HEADERS,
    redirect: 'follow',
  })
  if (!pageRes.ok) throw new Error(`watch page ${pageRes.status}`)
  const html = await pageRes.text()

  const apiKey = firstMatch(html, /"INNERTUBE_API_KEY":"([^"]+)"/)
  const clientVersion =
    firstMatch(html, /"INNERTUBE_CONTEXT_CLIENT_VERSION":"([^"]+)"/) ||
    firstMatch(html, /"clientVersion":"([\d.]+)"/) ||
    '2.20240101.00.00'
  const data = parseInitialData(html)
  if (!apiKey || !data) throw new Error('Could not read this video page.')

  const token = findCommentsToken(data)
  if (!token) {
    // Comments genuinely off (or age/region gated) — an empty list, not an error.
    const empty = { videoId, sort: 'none', comments: [] }
    cache.set(videoId, { at: Date.now(), data: empty })
    return empty
  }

  let json = await innertubeNext({ apiKey, clientVersion, token })
  let sort = 'top'
  const newest = findNewestToken(json)
  if (newest) {
    try {
      json = await innertubeNext({ apiKey, clientVersion, token: newest })
      sort = 'newest'
    } catch {
      // keep the Top page we already have
    }
  }

  const seen = new Set()
  const comments = []
  for (const c of [...fromEntityPayloads(json), ...fromRenderers(json)]) {
    if (!c.text || seen.has(c.id)) continue
    seen.add(c.id)
    comments.push({ ...c, url: `https://www.youtube.com/watch?v=${videoId}&lc=${c.id}` })
    if (comments.length >= limit) break
  }

  const result = { videoId, sort, comments }
  cache.set(videoId, { at: Date.now(), data: result })
  return result
}

// Comments for a batch of videos in parallel, capturing per-video errors so one
// dead video never fails the panel.
export async function fetchCommentsBatch(inputs, opts = {}) {
  const list = (Array.isArray(inputs) ? inputs : []).map(String).map((s) => s.trim()).filter(Boolean)
  return Promise.all(
    list.map(async (input) => {
      try {
        return { input, ok: true, ...(await fetchComments(input, opts)) }
      } catch (e) {
        return { input, ok: false, error: e.message || String(e) }
      }
    }),
  )
}
