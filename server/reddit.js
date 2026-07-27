// Reddit helpers: best-effort post extraction from a public URL, plus the
// prompt builders for the "sound like a real person" rewrite and the viral
// comment generator. All generation goes through OpenRouter (the user's key).
import { logger } from './log.js'
import { redditApiGet } from './redditUsers.js'

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

// Structured JSON image-prompts (for Google Flow / image gen) with an
// externally-anchored character. The model adapts a fixed schema to the chosen
// subject / environment / activity while keeping the identity-lock structure.
export function buildFlowPrompt({ gender, environment, activity, aspectRatio, count }) {
  const subject = gender === 'man' ? 'man' : 'woman'
  const n = Math.min(Math.max(Number(count) || 1, 1), 5)

  return `You generate ultra-detailed JSON prompts for an AI image generator (Google Flow style). The character's identity is externally anchored to a reference image (Anchor A) and must never be invented or changed — only styling, environment, wardrobe, pose, framing and camera change.

Produce ${n} distinct prompt object(s) for a ${subject}.

INPUTS:
- Subject: ${subject}
- Environment / location: ${environment || 'a fitting everyday interior'}
- Activity / shot: ${activity || 'casual POV selfie'}
- Aspect ratio: ${aspectRatio || '4:5'}

Each prompt object MUST follow EXACTLY this schema and key structure (same keys, same nesting). Only change the string VALUES to fit the subject, environment and activity. Keep all the identity-lock, skin, realism and selfie-realism rules intact and phrased for a ${subject}:

{
  "GLOBAL_IDENTITY_LOCK": "IDENTITY IS EXTERNALLY ANCHORED VIA MASTER ANCHOR IMAGE (ANCHOR A).\\nDO NOT GENERATE, INFER, MODIFY, OR REPLACE CORE IDENTITY.\\nFACIAL STRUCTURE, BONE GEOMETRY, AND BODY PROPORTIONS MUST MATCH ANCHOR A EXACTLY.",
  "identity_constraints": {
    "integrity": "Keep the same ${subject} exactly as the reference image. Do not change face, body, or identity.",
    "facial_structure": "Preserve exact facial bone structure and proportions.",
    "prohibitions": ["no identity drift", "no reshaping"]
  },
  "skin_and_micro_details": {
    "texture": "visible pores and natural skin grain on face and body",
    "glow": "natural skin glow under the scene lighting, not airbrushed",
    "eyes": "sharp eyes with realistic wetline, iris detail, and crisp catchlights",
    "processing": "no smoothing, no beauty filters, no plastic skin"
  },
  "environment": {
    "location": "<the chosen environment, described concretely>",
    "time": "<time / ambience that suits it>",
    "details": ["<3-5 concrete props/features of this environment>"],
    "background_rule": "environment remains readable and realistic, no artificial blur"
  },
  "wardrobe": {
    "override_rule": "replace all reference clothing completely",
    "top": "<outfit top that fits the ${subject}, environment and activity>",
    "bottoms": "<outfit bottoms that fit>",
    "fit_logic": "clothing conforms naturally to the body with no compression, reshaping, or proportion changes"
  },
  "accessories_and_grooming": {
    "jewelry": "none unless already present in anchor image",
    "hair": "<a concrete hair description>"
  },
  "pose_and_expression": {
    "pose": "<pose that matches the activity>",
    "body_position": "<body position detail>",
    "head_angle": "<head angle>",
    "expression": "candid, natural, lightly confident expression",
    "framing": "<crop / framing detail>"
  },
  "camera_and_lighting": {
    "camera_style": "candid phone-camera realism",
    "camera": {
      "type": "front-facing smartphone camera",
      "angle": "<angle that matches the shot>",
      "distance": "arm's length, device fully out of frame unless a mirror shot",
      "lens_feel": "natural iPhone perspective, no wide-angle distortion"
    },
    "lighting": {
      "primary": "<primary light source for this environment>",
      "contrast": "moderate, preserving facial structure and skin texture",
      "bokeh": "none"
    }
  },
  "realism": {
    "detail_level": "high-fidelity photographic realism",
    "constraints": ["no AI artifacts", "no over-stylization", "no loss of texture", "no artificial bokeh", "no cinematic grading"]
  },
  "aspect_ratio": "${aspectRatio || '4:5'}"
}

Rules:
- If the activity is a mirror selfie, add a "mirror_rule" style note and make the phone visible in-hand in the mirror; otherwise keep the hand/forearm out of frame and add a "selfie_realism_rule" string.
- If the shot shows a phone screen (checking a streak, showing an app blocker, holding the phone toward the camera or mirror, scrolling, etc.), you MUST add a "screen_anchor" block: the on-screen content is EXTERNALLY ANCHORED to a SECOND reference image (Anchor B — a provided screenshot) and must match it exactly, never invented. Hold the phone so the screen faces the camera/mirror and is clearly readable. Example: "screen_anchor": {"source": "ANCHOR B (provided screenshot)", "rule": "phone screen content must match Anchor B exactly; do not generate or invent any UI, text, or numbers", "visibility": "phone angled so the screen is fully visible and readable toward the camera"}.
- Make the ${n} objects genuinely different from each other (pose, wardrobe, framing, lighting) while keeping identity locked.
- Output STRICT valid JSON only.

Return ONLY a JSON object of this exact shape: {"prompts": [ {<prompt object 1>}${n > 1 ? ', {<prompt object 2>}, ...' : ''} ]}.`
}

// ── Subreddit-tailored drafts ────────────────────────────────────────────────
// Turn a subreddit name (r/foo, /r/foo, foo) into just "foo", validating it
// looks like a real subreddit name (3–21 chars, letters/digits/underscore).
function normalizeSubreddit(input) {
  const name = String(input || '').trim().replace(/^\/?(r\/)?/i, '').replace(/\/.*$/, '').trim()
  if (!/^[A-Za-z0-9_]{2,21}$/.test(name)) {
    throw new Error(`"${String(input).trim()}" does not look like a subreddit name. Try something like r/getdisciplined.`)
  }
  return name
}

/**
 * Best-effort read of a subreddit's public metadata so a draft can match its
 * rules and tone: the about blurb, its posting rules, and a handful of recent
 * top post titles. Rules/top posts are best-effort — a failure there still
 * returns whatever else loaded. A failed `about` (private/banned/blocked)
 * throws, since without it we can't confirm the sub even exists.
 * @param {string} subredditRaw
 */
export async function fetchSubredditContext(subredditRaw) {
  const name = normalizeSubreddit(subredditRaw)
  log.start(`Reading r/${name}`)

  let about
  try {
    const a = await redditApiGet(`/r/${name}/about`)
    about = a?.data
  } catch (e) {
    log.fail(`r/${name} about: ${e.message}`)
    throw new Error(
      `Could not read r/${name} — it may be private, banned, or Reddit is blocking this server. ` +
      `Set REDDIT_CLIENT_ID/SECRET (+ USERNAME/PASSWORD) to use the OAuth API.`
    )
  }
  if (!about || about.dist === 0 || (!about.title && !about.display_name)) {
    throw new Error(`r/${name} does not look like an accessible subreddit.`)
  }

  // Rules — best-effort.
  let rules = []
  try {
    const r = await redditApiGet(`/r/${name}/about/rules`)
    rules = (Array.isArray(r?.rules) ? r.rules : [])
      .map((rule) => ({
        name: String(rule.short_name || '').trim(),
        description: String(rule.description || '').trim(),
      }))
      .filter((rule) => rule.name)
      .slice(0, 15)
  } catch (e) {
    log.warn?.(`r/${name} rules: ${e.message}`)
  }

  // Recent top posts (this month) — best-effort, for tone.
  let samplePosts = []
  try {
    const t = await redditApiGet(`/r/${name}/top`, { t: 'month', limit: '20' })
    samplePosts = (t?.data?.children || [])
      .map((c) => c?.data)
      .filter((d) => d && !d.stickied && !d.over_18)
      .map((d) => ({ title: String(d.title || '').trim(), score: Number(d.score) || 0 }))
      .filter((p) => p.title)
      .slice(0, 12)
  } catch (e) {
    log.warn?.(`r/${name} top: ${e.message}`)
  }

  log.ok(`r/${name}: ${rules.length} rules, ${samplePosts.length} sample posts`)
  return {
    name,
    title: String(about.title || about.display_name || name),
    publicDescription: String(about.public_description || '').trim(),
    subscribers: Number(about.subscribers) || 0,
    over18: !!about.over18,
    // 'any' | 'self' (text only) | 'link' (link only)
    submissionType: String(about.submission_type || 'any'),
    rules,
    samplePosts,
  }
}

export function buildSubredditPostPrompt({ context, topic, length = 'medium' }) {
  const lengthGuide =
    length === 'short'
      ? 'Each body is about 3 to 4 sentences.'
      : length === 'long'
      ? 'Each body is 2 to 3 short paragraphs — a real little story or reflection with a beginning, a turn, and where it left you. Roughly 8 to 12 sentences.'
      : 'Each body is a solid paragraph, about 5 to 7 sentences.'

  const rulesBlock = context.rules.length
    ? context.rules.map((r, i) => `${i + 1}. ${r.name}${r.description ? ` — ${r.description}` : ''}`).join('\n')
    : '(No rules were readable — follow normal Reddit etiquette and stay on-topic.)'

  const samplesBlock = context.samplePosts.length
    ? context.samplePosts.map((p) => `- ${p.title}`).join('\n')
    : '(No sample titles available.)'

  const typeNote =
    context.submissionType === 'link'
      ? 'NOTE: this subreddit is primarily a LINK subreddit. Still write a title and a short body, but keep the body brief since a link may be expected.'
      : ''

  return `You are a real person writing a genuine text post for the subreddit r/${context.name}. Not a marketer, not a brand, not promoting anything. Just someone with something real to share or ask that fits this community.

About the subreddit:
- Title: ${context.title}
${context.publicDescription ? `- Description: ${context.publicDescription}` : ''}
- Subscribers: ${context.subscribers.toLocaleString('en-US')}

The subreddit's rules (follow ALL of these strictly — a post that breaks a rule gets removed):
${rulesBlock}

Recent top post titles here (match this community's tone, format and vibe — do NOT copy them):
${samplesBlock}

${typeNote}

${topic ? `What the post should be about: ${topic}` : 'Pick a specific, relatable angle that genuinely fits this subreddit.'}

Write 3 different post options. Each has a title and a body.
- The title should read like the real post titles above — natural, specific, the kind of thing that fits right in. Lowercase is fine if that matches the sub.
- ${lengthGuide} Make it feel like a real experience or a real question, with concrete details — not generic advice.
- Every option MUST obey the subreddit's rules above. Do not include anything promotional, no links, no self-advertising.

${HUMAN_RULES}

Return ONLY a JSON object: {"posts": [{"title": "...", "body": "..."}, {"title": "...", "body": "..."}, {"title": "...", "body": "..."}]}.`
}

export function buildPostPrompt({ topic, length = 'long' }) {
  const lengthGuide =
    length === 'short'
      ? 'Each body is about 3 to 4 sentences.'
      : length === 'medium'
      ? 'Each body is a solid paragraph, about 5 to 7 sentences.'
      : 'Each body is 2 to 3 short paragraphs — a real little story or reflection with a beginning, a turn, and where it left you. Roughly 8 to 12 sentences.'

  return `You are a real person writing a post for social media (Reddit / X / Threads) about self improvement or productivity. Not a coach, not a brand, not selling anything. Just someone sharing a genuine story or thought.

${topic ? `What it should be about: ${topic}` : 'Pick something specific and relatable around self improvement or productivity — a small realization, a habit that actually helped, a mindset shift, an honest struggle you went through.'}

Write 3 different posts. Each has a title and a body.
- The title is a short, natural line that makes someone want to read — like a real Reddit post title, not a clickbait headline. Lowercase is fine.
- ${lengthGuide} Tell it like a real experience with specific details, not generic advice.

Write like a normal person typing it out:
- plain everyday words, casual, real
- DO NOT use the double-quote character (") or the single-quote/apostrophe (') anywhere. Write dont, im, youre, cant, thats, that way instead.
- a tiny grammar slip or lowercase start is fine — it should feel human, not polished

Never do these (this is what makes it sound like AI):
- no numbered lists of tips, no "here are 5 ways", no "game changer", no "unlock your potential"
- avoid AI/marketing words: delve, moreover, furthermore, tapestry, elevate, unleash, seamless, journey, in conclusion, boost, leverage, thrive, mindset (as a buzzword)
- no motivational-poster one-liners, no hashtags, no emojis
- never write the words porn, pornography, adult content, explicit or NSFW — if the topic needs it, use the 🌽 emoji instead (e.g. quit 🌽, 🌽 sites)

Return ONLY a JSON object: {"posts": [{"title": "...", "body": "..."}, {"title": "...", "body": "..."}, {"title": "...", "body": "..."}]}.`
}
