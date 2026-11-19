// Thin client for Exposure (https://app.exposure.gg), which runs a cloud phone
// per user and posts to TikTok/Instagram from it. We talk to its MCP server
// (Streamable HTTP, JSON-RPC over POST) with a Bearer key from Settings.
//
// Exposure hosts the media (library), schedules the post and publishes it from
// the phone, so Slidesmith needs no storage or posting integrations of its own.
import { randomUUID } from 'node:crypto'

const URL_MCP = 'https://app.exposure.gg/api/mcp'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Serial queue with a small gap so bulk scheduling can't trip rate limits.
let chain = Promise.resolve()
const MIN_GAP_MS = 150
function enqueue(fn) {
  const result = chain.then(fn)
  chain = result.then(() => sleep(MIN_GAP_MS), () => sleep(MIN_GAP_MS))
  return result
}

// A response is either plain JSON or an SSE stream ("data: {...}" lines).
function parseRpc(text) {
  const t = text.trim()
  if (t.startsWith('{')) return JSON.parse(t)
  const data = t
    .split('\n')
    .filter((l) => l.startsWith('data:'))
    .map((l) => l.slice(5).trim())
    .filter(Boolean)
    .pop()
  if (!data) throw new Error(`Unexpected Exposure response: ${t.slice(0, 200)}`)
  return JSON.parse(data)
}

function problemText(body) {
  const problems = body?.error?.problems || body?.problems
  if (Array.isArray(problems) && problems.length) {
    return problems.map((p) => (typeof p === 'string' ? p : p.message || p.reason || p.code || JSON.stringify(p))).join('; ')
  }
  return body?.error?.message || (typeof body?.error === 'string' ? body.error : '') || body?.summary || ''
}

async function rpc(key, name, args = {}) {
  if (!key) throw new Error('Missing Exposure API key. Add it in Settings.')
  const MAX_ATTEMPTS = 4
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await enqueue(() =>
      fetch(URL_MCP, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
      })
    )
    if (res.status === 429 && attempt < MAX_ATTEMPTS) {
      const retryAfter = Number(res.headers.get('retry-after'))
      await sleep(retryAfter > 0 ? retryAfter * 1000 : 800 * 2 ** (attempt - 1))
      continue
    }
    const text = await res.text()
    if (res.status === 401 || res.status === 403) throw new Error(`Exposure ${res.status}: the API key was rejected.`)
    if (!res.ok) throw new Error(`Exposure ${res.status}: ${text.slice(0, 300)}`)
    const msg = parseRpc(text)
    if (msg.error) throw new Error(`Exposure: ${msg.error.message || JSON.stringify(msg.error)}`)
    const out = msg.result?.content?.find((c) => c.type === 'text')?.text
    let body
    try {
      body = out ? JSON.parse(out) : {}
    } catch {
      body = { summary: out }
    }
    if (msg.result?.isError || body.ok === false) {
      throw new Error(`Exposure: ${problemText(body) || `${name} failed`}`)
    }
    return body
  }
}

// Paged list tools put their rows in `untrusted_content` and a cursor in page.next_cursor.
async function listAll(key, name, args = {}, maxPages = 10) {
  const rows = []
  let cursor
  for (let i = 0; i < maxPages; i++) {
    const body = await rpc(key, name, { ...args, limit: 50, ...(cursor ? { cursor } : {}) })
    const part = body.untrusted_content
    if (Array.isArray(part)) rows.push(...part)
    cursor = body.page?.next_cursor
    if (!cursor) break
  }
  return rows
}

const handleOf = (a) => String(a?.handle || a?.username || a?.account || a?.name || '').replace(/^@/, '')

// Accounts on your phones. `id` is the handle, which is what the post tools take.
export async function listAccounts(key) {
  const rows = await listAll(key, 'list_accounts', { detail: true })
  return rows
    .map((a) => ({
      id: handleOf(a),
      platform: String(a.platform || ''),
      username: handleOf(a),
      pad: a.pad || a.phone || null,
      ready: a.ready ?? a.ready_to_post ?? null,
    }))
    .filter((a) => a.id)
}

// Posts, normalised to the shape the client already maps.
export async function listPosts(key) {
  const rows = await listAll(key, 'list_posts', { which: 'all', detail: true })
  return rows.map((p) => ({
    id: p.id ?? p.post_id,
    caption: p.caption || '',
    status: String(p.status || 'scheduled'),
    scheduled_at: p.scheduled_at || p.when || p.scheduled_for || p.time || null,
    media_urls: [p.thumbnail_url, p.media_url].filter(Boolean),
    social_accounts: [handleOf(p)].filter(Boolean),
    is_draft: false,
    platform: p.platform || '',
    link: p.link || p.url || p.share_url || null,
    views: Number(p.views ?? p.view_count ?? 0),
    likes: Number(p.likes ?? p.like_count ?? 0),
    comments: Number(p.comments ?? p.comment_count ?? 0),
    shares: Number(p.shares ?? p.share_count ?? 0),
  }))
}

// Analytics = your published posts with the numbers Exposure tracks for them.
export async function listAnalytics(key) {
  const posts = await listPosts(key)
  return posts
    .filter((p) => /publish|posted|live|done/i.test(p.status))
    .map((p) => ({
      id: p.id,
      platform: p.platform,
      view_count: p.views,
      like_count: p.likes,
      comment_count: p.comments,
      share_count: p.shares,
      cover_image_url: p.media_urls[0] || null,
      share_url: p.link,
      video_description: p.caption,
      last_synced_at: null,
    }))
}

// Exposure refreshes stats itself; kept so the Results "Refresh" button still works.
export async function syncAnalytics() {}

// Upload one library item. Several files = one carousel (slide order is kept);
// a single mp4 = a video. Returns the library media_id once it is ready.
export async function uploadMedia(key, files, title) {
  const created = await rpc(key, 'create_upload_link', {
    files: files.map((f) => ({ content_type: f.mimeType, size: f.buffer.length, filename: f.name })),
    title: String(title || '').slice(0, 120) || undefined,
    idempotency_key: `up-${randomUUID()}`,
  })
  const mediaId = created.data?.media_id
  const uploads = created.data?.uploads || []
  if (!mediaId || uploads.length !== files.length) throw new Error('Exposure did not return upload links.')

  await Promise.all(
    uploads.map(async (u) => {
      const f = files[u.index ?? 0]
      let lastErr
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const put = await fetch(u.put_url, { method: 'PUT', headers: { 'content-type': f.mimeType }, body: f.buffer })
          if (put.ok) return
          lastErr = new Error(`Media upload failed (${put.status}) for ${f.name}`)
        } catch (e) {
          lastErr = e
        }
        await sleep(400 * attempt)
      }
      throw lastErr
    })
  )

  // Processing takes a moment; posting needs status "ready".
  for (let i = 0; i < 60; i++) {
    const m = await rpc(key, 'get_media', { media_id: mediaId })
    const status = String(m.data?.status ?? m.untrusted_content?.status ?? m.status ?? '')
    if (status === 'ready') return mediaId
    if (/fail|error/i.test(status)) throw new Error(`Exposure could not process the upload (${status}).`)
    await sleep(1500)
  }
  throw new Error('Exposure is still processing the upload. Try again in a minute.')
}

// Schedule one library item on one or more accounts at `scheduledAt` (ISO).
// With several accounts, Exposure spaces them out (>= 20 min on the same phone).
export async function createPost(key, { caption, mediaId, accounts, scheduledAt }) {
  const when = scheduledAt || 'now'
  const idempotency_key = `post-${randomUUID()}`
  if (accounts.length === 1) {
    return rpc(key, 'create_post', { media_id: mediaId, account: accounts[0], caption, when, idempotency_key })
  }
  const body = await rpc(key, 'create_posts_bulk', {
    media_id: mediaId,
    targets: accounts.map((account) => ({ account })),
    caption,
    when,
    idempotency_key,
  })
  const scheduled = body.data?.scheduled ?? body.scheduled ?? []
  const failed = body.data?.failed ?? body.failed ?? []
  if (failed.length && !scheduled.length) {
    throw new Error(`Exposure: ${failed.map((f) => `${f.account || ''} ${f.reason || f.code || ''}`.trim()).join('; ')}`)
  }
  return body
}
