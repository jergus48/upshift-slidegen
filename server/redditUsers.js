// Scrape the usernames of everyone who commented on a Reddit post.
//
// Reddit blocks most anonymous `.json` requests with 403 (especially from
// datacenter IPs like Vercel). The reliable, serverless-friendly path is
// Reddit's OAuth API — no browser, just two HTTPS calls:
//   1. Exchange app credentials for a short-lived bearer token.
//   2. Hit oauth.reddit.com for the comment tree with that token.
//
// Setup (one-time): create a "script" app at https://www.reddit.com/prefs/apps
// then set these env vars:
//   REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET
//   REDDIT_USERNAME, REDDIT_PASSWORD   (the account that owns the app)
//   REDDIT_USER_AGENT                  (e.g. "SlideSmith/1.0 by /u/yourname")
//
// The function falls back to the anonymous `.json` endpoint when no
// credentials are configured, so it still works locally on a residential IP.

const UA = process.env.REDDIT_USER_AGENT || 'SlideSmith:reddit-commenter-scraper:1.0'

// --- URL helpers ------------------------------------------------------------

// Pull the base-36 post id out of any Reddit link, e.g. .../comments/1e3g8fq/...
function extractPostId(postUrl) {
  const m = new URL(postUrl).pathname.match(/\/comments\/([a-z0-9]+)/i)
  if (!m) throw new Error(`Could not find a post id in URL: ${postUrl}`)
  return m[1]
}

// Anonymous JSON endpoint (fallback path).
function toJsonUrl(postUrl) {
  const u = new URL(postUrl)
  u.hostname = 'www.reddit.com'
  u.search = ''
  u.pathname = u.pathname.replace(/\/+$/, '').replace(/\.json$/, '') + '.json'
  u.searchParams.set('raw_json', '1')
  return u.toString()
}

// --- OAuth ------------------------------------------------------------------

let cachedToken = null // { token, expiresAt }

async function getAccessToken() {
  const { REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD } = process.env
  if (!REDDIT_CLIENT_ID || !REDDIT_CLIENT_SECRET) return null // no creds → use fallback

  // Reuse a still-valid token (tokens last ~1h) to avoid needless auth calls.
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.token

  const basic = Buffer.from(`${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`).toString('base64')
  // Password grant for "script" apps; if no username/password, fall back to
  // application-only (userless) client_credentials grant.
  const body = REDDIT_USERNAME && REDDIT_PASSWORD
    ? new URLSearchParams({ grant_type: 'password', username: REDDIT_USERNAME, password: REDDIT_PASSWORD })
    : new URLSearchParams({ grant_type: 'client_credentials' })

  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': UA,
    },
    body,
  })
  if (!res.ok) throw new Error(`Reddit auth failed: ${res.status} ${await res.text()}`)

  const json = await res.json()
  cachedToken = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 }
  return cachedToken.token
}

// --- Fetching the comment tree ---------------------------------------------

async function fetchListing(postUrl) {
  const token = await getAccessToken()

  if (token) {
    // OAuth path — reliable from serverless / datacenter IPs.
    const id = extractPostId(postUrl)
    const res = await fetch(`https://oauth.reddit.com/comments/${id}?raw_json=1&limit=500`, {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': UA },
    })
    if (!res.ok) throw new Error(`Reddit API returned ${res.status} ${res.statusText}`)
    return res.json()
  }

  // Fallback: anonymous JSON (works locally, often 403s on Vercel).
  const res = await fetch(toJsonUrl(postUrl), { headers: { 'User-Agent': UA } })
  if (!res.ok) {
    throw new Error(
      `Reddit returned ${res.status} ${res.statusText}. ` +
      `Set REDDIT_CLIENT_ID/SECRET (+ USERNAME/PASSWORD) to use the OAuth API.`
    )
  }
  return res.json()
}

// --- Parsing ----------------------------------------------------------------

// Some comment threads are truncated with "more" nodes; fetch those children
// via the morechildren API so deep threads aren't silently dropped.
async function expandMore(linkId, moreIds, token, out) {
  if (!token || moreIds.length === 0) return
  // morechildren takes up to 100 ids per call.
  for (let i = 0; i < moreIds.length; i += 100) {
    const chunk = moreIds.slice(i, i + 100)
    const params = new URLSearchParams({
      api_type: 'json', link_id: linkId, children: chunk.join(','), limit_children: 'false',
    })
    const res = await fetch(`https://oauth.reddit.com/api/morechildren?${params}`, {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': UA },
    })
    if (!res.ok) continue // best-effort; skip a failed batch rather than abort
    const json = await res.json()
    for (const thing of json?.json?.data?.things || []) {
      if (thing.kind === 't1' && thing.data?.author && thing.data.author !== '[deleted]') {
        out.add(thing.data.author)
      }
    }
  }
}

// Walk the comment listing, collecting authors and any "more" ids encountered.
function collectAuthors(node, out, moreIds) {
  const children = node?.data?.children
  if (!Array.isArray(children)) return
  for (const child of children) {
    if (child.kind === 'more') {
      if (Array.isArray(child.data?.children)) moreIds.push(...child.data.children)
      continue
    }
    if (child.kind !== 't1') continue
    const author = child.data?.author
    if (author && author !== '[deleted]') out.add(author)
    collectAuthors(child.data?.replies, out, moreIds)
  }
}

// --- Public API -------------------------------------------------------------

/**
 * Return the unique usernames of commenters on a Reddit post.
 * @param {string} postUrl - Link to the Reddit post.
 * @param {object} [opts]
 * @param {boolean} [opts.expandCollapsed=true] - Also fetch "load more comments"
 *        branches (OAuth only; costs extra API calls on very large threads).
 * @returns {Promise<string[]>} sorted, de-duplicated usernames.
 */
export async function scrapeCommenters(postUrl, { expandCollapsed = true } = {}) {
  const json = await fetchListing(postUrl)
  const commentsListing = Array.isArray(json) ? json[1] : null

  const authors = new Set()
  const moreIds = []
  collectAuthors(commentsListing, authors, moreIds)

  if (expandCollapsed) {
    const token = await getAccessToken()
    const linkId = 't3_' + extractPostId(postUrl)
    await expandMore(linkId, moreIds, token, authors)
  }

  return [...authors].sort((a, b) => a.localeCompare(b))
}
