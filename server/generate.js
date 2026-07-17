// Slideshow generation. Given the "Brain" (niche, audience, style memory,
// reference patterns), the chosen model writes N carousel slideshows: a hook,
// caption, hashtags, a rationale, and the per-slide text. Images are rendered
// later, client-side — the model only writes the words.
import { chatJSON } from './openrouter.js'
import { logger } from './log.js'

const log = logger('generate')

// Background gradients assigned per slide so rendering needs no image-gen API.
const PALETTE = [
  ['#0f172a', '#1e293b'],
  ['#1a1a2e', '#16213e'],
  ['#2d1b1b', '#1a1010'],
  ['#0a1f1c', '#0f2922'],
  ['#1f1147', '#160d33'],
  ['#26120a', '#1a0c06'],
]

function buildPrompt(brain, count, slidesPerShow, length = 'short') {
  const long = length === 'long'

  // Slide-format spec differs by length. Slide 1 (the hook) is ALWAYS a single
  // punchy one-liner in both modes — only slides 2+ get the title+body treatment.
  const slidesSpec = long
    ? `"slides": [` +
      `"slide 1 = the HOOK: one punchy line only, max ~8 words, NO title/body format", ` +
      `"slide 2..N = a short bold TITLE (2-5 words), then a blank line, then a BODY of 2-3 natural sentences. ` +
      `Format each as \\"Title\\n\\nBody\\". Exactly ${slidesPerShow} items total including the hook. ` +
      `The last slide is the CTA and can be a short line."]`
    : `"slides": ["the hook again as slide 1", "slide 2", "...exactly ${slidesPerShow} lines total (including the hook as slide 1), each max ~8 words, the last is a CTA like 'Save this'"]`

  const slidesRule = long
    ? `Slide 1 MUST be a single one-liner hook (no title/body). Slides 2+ MUST be "Title\\n\\nBody" with a 2-3 sentence body. ` +
      `If the account has an app, mention it softly and first-person on one slide (e.g. "I use X for tracking mine.") — never salesy.`
    : `Each slide is ONE short line, max ~8 words.`

  return `You write short-form social media carousel slideshows (TikTok/Instagram).

Account context:
- Niche: ${brain.niche || '(unspecified)'}
- App / brand: ${brain.appName || '(unspecified)'} — ${brain.appDescription || ''}
- Audience: ${brain.audience || '(unspecified)'}

What's working for this account (style memory — respect this closely):
${brain.styleMemory || '(none yet — use proven short-form patterns)'}

Non-negotiable rules for every slide:
- Sound like a REAL person posting to TikTok/IG, not a brand or an AI. First person, casual, blunt, confident. Use contractions.
- NEVER use these AI/marketing words: rediscover, embrace, unlock, journey, elevate, empower, "dive in", "in today's world", boost, foster, cultivate, nurture, "take back control", "rewire your brain", "say goodbye to", "level up your life". No em-dashes.
- Content rule: NEVER write the words "porn", "pornography", "adult content", "explicit", or "NSFW". Use the 🌽 emoji instead (e.g. "quit 🌽", "🌽 sites").

Write ${count} distinct slideshows. Respond with a JSON object of this exact shape:
{
  "slideshows": [
    {
      "hook": "the first slide — a scroll-stopping line, max ~8 words",
      ${slidesSpec},
      "caption": "the post caption with 1-2 emoji",
      "hashtags": ["three", "relevant", "hashtags"],
      "rationale": "one sentence on why this should perform, tied to the style memory"
    }
  ]
}

Slide format: ${slidesRule}
Each slideshow's "slides" array MUST contain exactly ${slidesPerShow} strings. Keep them on-brand, varied, and genuinely good. Do not write generic filler. Return ONLY the JSON object.`
}

// Generate in small batches so big counts don't overflow the model's output /
// truncate the JSON. Each call asks for a handful; we loop until we hit `count`.
const BATCH = 6

export async function generateSlideshows({ apiKey, model, brain, count = 4, slidesPerShow = 6, length = 'short' }) {
  log.start(`Generating ${count} slideshow${count === 1 ? '' : 's'} (${slidesPerShow} slides each) with ${model}`)
  if (brain?.niche) log.info(`niche: ${brain.niche}${brain.appName ? ` · ${brain.appName}` : ''}`)
  const raw = []
  let safety = 0
  while (raw.length < count && safety < count + 5) {
    safety++
    const n = Math.min(BATCH, count - raw.length)
    log.step(`asking model for ${n} more (${raw.length}/${count} so far)…`)
    const parsed = await chatJSON({ apiKey, model, prompt: buildPrompt(brain, n, slidesPerShow, length) })
    const batch = parsed.slideshows || []
    if (!batch.length) {
      log.warn('model returned no slideshows — stopping early')
      break // model returned nothing — stop rather than loop forever
    }
    raw.push(...batch)
    log.progress(Math.min(raw.length, count), count, 'written')
  }
  log.ok(`Generated ${Math.min(raw.length, count)} slideshow${raw.length === 1 ? '' : 's'}`)

  const stamp = Date.now()
  return raw.slice(0, count).map((s, i) => {
    const [from, to] = PALETTE[i % PALETTE.length]
    return {
      id: `q-${stamp}-${i}`,
      hook: s.hook || (s.slides && s.slides[0]) || '',
      caption: s.caption || '',
      hashtags: s.hashtags || [],
      rationale: s.rationale || '',
      createdAt: new Date(stamp).toISOString(),
      slides: (s.slides || []).map((text, j) => ({
        id: `slide-${stamp}-${i}-${j}`,
        text,
        bgFrom: from,
        bgTo: to,
      })),
    }
  })
}
