// Best-effort PUBLIC profile stats for the non-YouTube platforms — NO API key,
// NO Apify. Everything here comes from public surfaces a logged-out browser can
// reach: the profile page's Open Graph meta tags, a handful of embedded JSON
// blobs, and (for X) the public follow-button widget endpoint.
//
// The trade-off vs. an official API is that these surfaces are increasingly
// login-walled and change shape without notice — so parsing is defensive and
// every field is optional. When a platform blocks us we still return the account
// (ok:true) with whatever we found; a hard failure returns ok:false + error, and
// the dashboard renders it as a plain link either way.

// A full logged-out-browser header set. This matters a lot: with only a
// User-Agent, Instagram / Facebook / Threads serve a bare JS shell (or a 400 /
// 429) with none of the data. Sending the Accept + sec-fetch-* headers a real
// navigation carries makes them return the actual profile HTML (Open Graph tags
// and embedded follower counts), no login required.
const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Upgrade-Insecure-Requests': '1',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
}

// "51M" / "1.2m" / "934K" / "1,234" / "1.2 thousand" → number, or null if none.
function parseCompactCount(s) {
  const t = String(s || '').trim().replace(/,/g, '')
  const m = /([\d.]+)\s*(thousand|million|billion|mil|mird|tis|[kmb])?/i.exec(t)
  if (!m) return null
  const n = Number(m[1])
  if (!Number.isFinite(n)) return null
  const mult =
    { K: 1e3, THOUSAND: 1e3, TIS: 1e3, M: 1e6, MIL: 1e6, MILLION: 1e6, B: 1e9, MIRD: 1e9, BILLION: 1e9 }[
      (m[2] || '').toUpperCase()
    ] || 1
  return Math.round(n * mult)
}

function firstMatch(html, re) {
  const m = re.exec(html)
  return m ? m[1] : ''
}

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#x27;/gi, "'")
    .replace(/\\u0026/g, '&')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
}

// Pull the common Open Graph tags every platform renders.
function ogTags(html) {
  const pick = (prop) =>
    decodeEntities(
      firstMatch(html, new RegExp(`<meta[^>]+property="${prop}"[^>]+content="([^"]*)"`, 'i')) ||
        firstMatch(html, new RegExp(`<meta[^>]+content="([^"]*)"[^>]+property="${prop}"`, 'i')),
    )
  return { title: pick('og:title'), description: pick('og:description'), image: pick('og:image') }
}

// Strip a leading @ and any profile-URL wrapper down to a bare handle.
function toHandle(input, host) {
  let raw = String(input || '').trim()
  if (!raw) return ''
  const urlMatch = new RegExp(`${host}/([^/?#]+)`, 'i').exec(raw)
  if (urlMatch) raw = urlMatch[1]
  return raw.replace(/^@/, '').replace(/\/+$/, '')
}

async function getHtml(url) {
  const res = await fetch(url, { headers: FETCH_HEADERS, redirect: 'follow' })
  if (!res.ok) throw new Error(`${res.status}`)
  return res.text()
}

// Fetch via the system `curl`. Some hosts (notably twitter's syndication CDN)
// fingerprint and block Node's HTTP client (undici) with a 429 regardless of
// headers, while a real curl sails through. curl ships with Windows 10+, macOS
// and virtually every Linux server, so this is a safe fallback for those hosts.
let curlModules = null
async function getHtmlViaCurl(url, extraHeaders = {}) {
  if (!curlModules) {
    const [{ execFile }, { promisify }] = await Promise.all([
      import('node:child_process'),
      import('node:util'),
    ])
    curlModules = { run: promisify(execFile) }
  }
  const headers = { ...FETCH_HEADERS, ...extraHeaders }
  const args = ['-s', '-L', '--compressed', '--max-time', '15', url]
  for (const [k, v] of Object.entries(headers)) args.push('-H', `${k}: ${v}`)
  try {
    const { stdout } = await curlModules.run('curl', args, { maxBuffer: 30 * 1024 * 1024 })
    return stdout
  } catch (e) {
    if (e.code === 'ENOENT') throw new Error('curl is not installed on this server.')
    throw new Error(e.message || String(e))
  }
}

// ── Instagram ────────────────────────────────────────────────────────────────
// og:description reads "1,234 Followers, 56 Following, 78 Posts - See Instagram
// photos and videos from Name (@handle)". og:title carries the display name.
async function fetchInstagram(input) {
  const handle = toHandle(input, 'instagram\\.com')
  if (!handle) throw new Error('Empty handle.')
  const url = `https://www.instagram.com/${handle}/`
  const html = await getHtml(url)
  const { title, description, image } = ogTags(html)
  // og:description reads "104M Followers, 96 Following, 4,879 Posts - …" — a
  // rounded but always-present summary. The page also embeds exact counts in
  // JSON, so prefer those and fall back to the rounded og values.
  const m = /([\d.,]+[KMB]?)\s+Followers?,\s*([\d.,]+[KMB]?)\s+Following,\s*([\d.,]+[KMB]?)\s+Posts?/i.exec(
    description,
  )
  const exact = (re) => {
    const v = firstMatch(html, re)
    return v ? Number(v) : null
  }
  // og:title is "NASA (@nasa) • Instagram photos and videos" → keep just "NASA".
  return {
    title: title.split(/\s*[•·]|\s*\(@/)[0].trim() || `@${handle}`,
    avatar: image,
    url,
    followers: exact(/"edge_followed_by":\{"count":(\d+)\}/) ?? (m ? parseCompactCount(m[1]) : null),
    following: exact(/"edge_follow":\{"count":(\d+)\}/) ?? (m ? parseCompactCount(m[2]) : null),
    posts: exact(/"edge_owner_to_timeline_media":\{"count":(\d+)/) ?? (m ? parseCompactCount(m[3]) : null),
    handle,
  }
}

// ── TikTok ───────────────────────────────────────────────────────────────────
// The profile page embeds a big JSON blob with exact follower / like / video
// counts under webapp.user-detail → userInfo.
async function fetchTiktok(input) {
  const handle = toHandle(input, 'tiktok\\.com')
  if (!handle) throw new Error('Empty handle.')
  const url = `https://www.tiktok.com/@${handle}`
  const html = await getHtml(url)
  const blob = firstMatch(
    html,
    /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/,
  )
  let stats = null
  let statsV2 = null
  let user = null
  if (blob) {
    try {
      const detail = JSON.parse(blob)?.__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo
      stats = detail?.stats || null
      // statsV2 carries the same counts as strings — use it for large accounts
      // where stats.heartCount/followerCount overflow a signed 32-bit int.
      statsV2 = detail?.statsV2 || null
      user = detail?.user || null
    } catch {
      /* fall through to og tags */
    }
  }
  // Prefer the string statsV2 value; fall back to the numeric stats field.
  const stat = (name) => {
    const v2 = statsV2?.[name]
    if (v2 != null && v2 !== '') {
      const n = Number(v2)
      if (Number.isFinite(n)) return n
    }
    const v1 = stats?.[name]
    return typeof v1 === 'number' ? v1 : null
  }
  const og = ogTags(html)
  return {
    title: decodeEntities(user?.nickname || og.title.replace(/\s*[(|].*$/, '').trim()) || `@${handle}`,
    avatar: user?.avatarLarger || user?.avatarMedium || og.image,
    url,
    followers: stat('followerCount'),
    following: stat('followingCount'),
    posts: stat('videoCount'),
    likes: stat('heartCount') ?? stat('heart'),
    handle,
  }
}

// ── X (Twitter) ──────────────────────────────────────────────────────────────
// The profile page is fully login-walled, but the public syndication endpoint
// (the one that powers embedded timelines) still serves the profile's user
// object — name, avatar, and exact follower / following / tweet counts — to a
// logged-out request.
async function fetchX(input) {
  const handle = toHandle(input, '(?:x|twitter)\\.com')
  if (!handle) throw new Error('Empty handle.')
  const url = `https://x.com/${handle}`
  // The syndication host blocks Node's HTTP client outright (see getHtmlViaCurl),
  // so go straight through curl, presenting as the embedded-timeline widget.
  const html = await getHtmlViaCurl(
    `https://syndication.twitter.com/srv/timeline-profile/screen-name/${handle}`,
    { Referer: 'https://platform.twitter.com/' },
  )
  const num = (re) => {
    const v = firstMatch(html, re)
    return v ? Number(v) : null
  }
  const followers = num(/"followers_count":(\d+)/)
  // The timeline also embeds tweet authors, so anchor the display name to the
  // user object whose screen_name is this handle (name precedes screen_name in
  // Twitter's user JSON).
  const nameRe = new RegExp(`"name":"((?:[^"\\\\]|\\\\.)*)","screen_name":"${handle}"`, 'i')
  const name = decodeEntities(firstMatch(html, nameRe) || firstMatch(html, /"name":"((?:[^"\\]|\\.)*)"/))
  const avatar = firstMatch(html, /"profile_image_url_https":"([^"]+)"/).replace(/\\\//g, '/').replace(/_normal(\.\w+)$/, '$1')
  if (followers == null && !name) throw new Error('X did not return profile data.')
  return {
    title: name || `@${handle}`,
    avatar,
    url,
    followers,
    following: num(/"friends_count":(\d+)/),
    posts: num(/"statuses_count":(\d+)/),
    handle,
  }
}

// ── Threads ──────────────────────────────────────────────────────────────────
// og:description reads "5.7M Followers • 155 Threads • …" and the page embeds an
// exact "follower_count":N. og:title is "Name (@handle) • Threads, …".
async function fetchThreads(input) {
  const handle = toHandle(input, 'threads\\.(?:net|com)')
  if (!handle) throw new Error('Empty handle.')
  const url = `https://www.threads.com/@${handle}`
  const html = await getHtml(url)
  const { title, description, image } = ogTags(html)
  const followerStr = firstMatch(description, /([\d.,]+[KMB]?)\s+Followers?/i)
  const exactFollowers = firstMatch(html, /"follower_count":(\d+)/)
  const postsStr = firstMatch(description, /([\d.,]+[KMB]?)\s+Threads?\b/i)
  return {
    title: title.replace(/\s*[(（]@.*$/, '').replace(/\s*[•·]\s*Threads.*$/i, '').trim() || `@${handle}`,
    avatar: image,
    url,
    followers: exactFollowers ? Number(exactFollowers) : followerStr ? parseCompactCount(followerStr) : null,
    following: null,
    posts: postsStr ? parseCompactCount(postsStr) : null,
    handle,
  }
}

// ── Facebook ─────────────────────────────────────────────────────────────────
// A public Page's HTML carries "28M followers" and "28,691,981 likes" strings
// plus the usual og:title / og:image. Needs the full browser header set (above)
// or Facebook returns a 400 to logged-out requests.
async function fetchFacebook(input) {
  const handle = toHandle(input, 'facebook\\.com')
  if (!handle) throw new Error('Empty handle.')
  const url = `https://www.facebook.com/${handle}`
  const html = await getHtml(url)
  const { title, image } = ogTags(html)
  const followStr = firstMatch(html, /([\d.,]+[KMB]?)\s+followers?/i)
  const likeStr = firstMatch(html, /([\d.,]+[KMB]?)\s+(?:people\s+)?likes?/i)
  return {
    title: title.replace(/\s*[|].*$/, '').trim() || handle,
    avatar: image,
    url,
    followers: followStr ? parseCompactCount(followStr) : null,
    likes: likeStr ? parseCompactCount(likeStr) : null,
    following: null,
    posts: null,
    handle,
  }
}

const FETCHERS = {
  instagram: fetchInstagram,
  tiktok: fetchTiktok,
  x: fetchX,
  threads: fetchThreads,
  facebook: fetchFacebook,
}

// In-memory cache — same shape/TTL as the YouTube dashboard.
const cache = new Map() // `${platform}:${input}` → { at, data }
const TTL_MS = 5 * 60 * 1000

async function fetchProfile(platform, input, { noCache = false } = {}) {
  const key = `${platform}:${String(input || '').trim().toLowerCase()}`
  if (!noCache) {
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < TTL_MS) return hit.data
  }
  const fetcher = FETCHERS[platform]
  if (!fetcher) throw new Error(`Unsupported platform: ${platform}`)
  const data = await fetcher(input)
  cache.set(key, { at: Date.now(), data })
  return data
}

// Resolve a batch of accounts in parallel, capturing per-account errors so one
// blocked profile never fails the whole platform view.
export async function fetchProfiles(platform, inputs, opts = {}) {
  const list = (Array.isArray(inputs) ? inputs : []).map(String).map((s) => s.trim()).filter(Boolean)
  return Promise.all(
    list.map(async (input) => {
      try {
        return { input, ok: true, platform, ...(await fetchProfile(platform, input, opts)) }
      } catch (e) {
        return { input, ok: false, platform, error: e.message || String(e) }
      }
    }),
  )
}
