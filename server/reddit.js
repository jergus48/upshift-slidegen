// Reddit helpers: best-effort post extraction from a public URL, plus the
// prompt builders for the "sound like a real person" rewrite and the viral
// comment generator. All generation goes through OpenRouter (the user's key).
import { logger } from './log.js'

const log = logger('reddit')

// Reddit wants a descriptive, unique User-Agent; generic browser UAs get 403'd
// faster. This still won't get past Reddit's datacenter-IP blocking (so it
// fails on Vercel — hence the manual fallback), but works from a home IP when
// self-hosting.
const UA = 'web:slidesmith:v1.0 (personal content tool)'

// Turn any Reddit post URL into its public .json endpoint.
function toJsonUrl(url) {
  const clean = String(url).trim().split('?')[0].replace(/\/$/, '')
  if (!/reddit\.com\//i.test(clean)) throw new Error('That does not look like a Reddit post link.')
  return `${clean}.json?raw_json=1`
}

// Pull image URLs out of a post's data (galleries, single image, preview).
function extractImages(data) {
  const out = new Set()
  const add = (u) => {
    if (typeof u === 'string' && /^https?:\/\//.test(u)) out.add(u.replace(/&amp;/g, '&'))
  }
  // Gallery
  if (data.is_gallery && data.media_metadata) {
    for (const m of Object.values(data.media_metadata)) {
      const src = m?.s?.u || m?.s?.gif
      if (src) add(src)
    }
  }
  // Direct image / preview
  if (/\.(jpe?g|png|webp|gif)$/i.test(data.url_overridden_by_dest || data.url || '')) {
    add(data.url_overridden_by_dest || data.url)
  }
  const preview = data?.preview?.images?.[0]?.source?.url
  if (preview && !out.size) add(preview)
  return [...out]
}

export async function fetchRedditPost(url) {
  const jsonUrl = toJsonUrl(url)
  log.start(`Fetching ${jsonUrl}`)
  let res
  try {
    res = await fetch(jsonUrl, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) })
  } catch (e) {
    throw new Error(`Could not reach Reddit (${e.message}). Paste the title & body manually instead.`)
  }
  if (!res.ok) {
    log.fail(`Reddit ${res.status}`)
    throw new Error(`Reddit returned ${res.status}. It may be blocking this — paste the title & body manually instead.`)
  }
  const json = await res.json().catch(() => null)
  const data = json?.[0]?.data?.children?.[0]?.data
  if (!data) throw new Error('Could not read that post. Paste the title & body manually instead.')
  log.ok(`Got "${(data.title || '').slice(0, 60)}"`)
  return {
    title: data.title || '',
    body: data.selftext || '',
    images: extractImages(data),
  }
}

// A shared set of instructions that make output read like a real person.
const HUMAN_RULES = `Write like a normal person typing casually on their phone. Rules:
- Plain everyday words, contractions, short sentences.
- Do NOT use the double-quote character (") anywhere.
- Avoid AI/marketing words and phrases (delve, moreover, furthermore, tapestry, elevate, unleash, seamless, in conclusion, "as an AI", etc.).
- No corporate or overly polished tone. A tiny grammar slip or lowercase here and there is fine — it should feel human, not perfect.
- No emojis unless it genuinely fits. No hashtags.`

export function buildRewritePrompt({ title, body }) {
  return `You are rewriting a Reddit post so it reads like a DIFFERENT real person wrote it from scratch about the same thing.

Original title:
${title || '(none)'}

Original body:
${body || '(none)'}

Keep the same topic, meaning and rough structure of both the title and the body, but change the wording enough that it is clearly not a copy. Match the original's length and vibe.

${HUMAN_RULES}

Return ONLY a JSON object: {"title": "the rewritten title", "body": "the rewritten body"}. If the original had no body, return an empty string for body.`
}

export function buildCommentPrompt({ text }) {
  return `You are writing short viral reply comments to a social media post (Reddit / TikTok / X), like a witty human that gets tons of likes.

${text ? `The post says:\n${text}` : 'The post is in the attached screenshot — read it.'}

Write 3 DIFFERENT short comments reacting to it. Make them punchy and natural — the kind that go viral. If the post (or its title) asks a question, actually answer it. Each comment max ~2 sentences.

${HUMAN_RULES}

Return ONLY a JSON object: {"comments": ["comment one", "comment two", "comment three"]}.`
}
