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
  return `You are just a random person leaving a reply in the comments. Not a brand, not a copywriter, not trying to be clever or go viral. You are reacting like a normal person scrolling on their phone.

${text ? `The post says:\n${text}` : 'The post is in the attached screenshot — read it carefully first.'}

Write 3 different replies. They should read like real top comments — the kind that get upvotes because they feel genuinely human, not because they are "witty".

How real comments actually read:
- mostly lowercase, casual, often just a fragment instead of a full sentence
- dry, deadpan, understated — real people almost never use exclamation marks
- usually they react to ONE specific detail or quote from the post (so it's clear you actually read it)
- sometimes they just add their own dumb little observation or continue the bit
- loose punctuation is normal: a missing apostrophe or a lowercase start is fine

NEVER do these — this is exactly what makes a comment sound like AI:
- no exclamation marks at all
- no puns or wordplay built on the topic (do NOT write things like "sleep scriptwriter" or "sleep wisdom anthology")
- never use these templates: "X should be a podcast", "X deserves an award", "we need a X", "this is everything", "I'm here for it", "the way that…", "not me…", "tell me X without telling me", "living rent free"
- no generic hype: no "this is gold", "iconic", "legend", "underrated", "chef's kiss"
- no double-quote character, no emojis, no hashtags

Make the 3 replies clearly different in vibe from each other. If the post (or its title) asks a question, actually answer it, casually.

Example of BAD (sounds like AI):
- sleep talking should honestly be a podcast. this guy deserves an award for best sleep scriptwriter!
Example of GOOD (sounds like a real person):
- when is there balls for alls got me
- man's writing better material asleep than i manage awake
- ok but i need to know what the rocks were about

Return ONLY a JSON object: {"comments": ["reply one", "reply two", "reply three"]}.`
}
