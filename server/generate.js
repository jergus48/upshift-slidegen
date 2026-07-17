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
  const bodyN = slidesPerShow - 2 // slides between the hook and the CTA

  // JSON-shape placeholders. These are EXAMPLES of the format, not instructions —
  // keep them looking like real slide text so the model writes its own instead of
  // echoing them. The actual rules live in `arc`/`sentenceRule` prose below.
  const slidesSpec = long
    ? `"slides": [\n` +
      `        "The hook line, repeated",\n` +
      `        "Short Title\\n\\nTwo or three natural sentences that actually explain this point like a real person talking.",\n` +
      `        "...exactly ${slidesPerShow} items total, slides 2 to ${slidesPerShow - 1} each in that Title + body shape...",\n` +
      `        "The CTA line"\n      ]`
    : `"slides": [\n` +
      `        "The hook line, repeated",\n` +
      `        "One complete natural sentence that delivers the first real step.",\n` +
      `        "...exactly ${slidesPerShow} items total, slides 2 to ${slidesPerShow - 1} each a full sentence delivering one step...",\n` +
      `        "The CTA line"\n      ]`

  // The single most important instruction — the difference between a real guide
  // and a random-sentence generator. Middle slides must actually pay off the hook.
  const arc = `THE CAROUSEL IS ONE GUIDE, NOT A LIST OF DISCONNECTED LINES.
Return EXACTLY ${slidesPerShow} slides in this fixed layout:
- Slide 1 = the HOOK: stop the scroll. Repeat the given hook / topic almost verbatim.
- Slides 2 to ${slidesPerShow - 1} = the CONTENT (${bodyN} slide${bodyN === 1 ? '' : 's'}): DELIVER on what the hook promised. If the hook says "7 steps" / "5 ways" / "how to", each is ONE concrete, specific, actually-useful step (number them if the hook implies a count). ONE of these content slides — the last one — is where you softly name the app; that is NOT an extra slide, it replaces a content slide.
- Slide ${slidesPerShow} = the CTA: tell them what to do now (save it, start today, follow for more).
They must flow: each slide reads like the next sentence of the same story, not a fresh unrelated thought. A reader should be able to read all slides top to bottom and have it make sense as a whole.
If the hook promises more items than there are content slots, cover the best ones and let the caption say "full list below" — never add extra slides.`

  const sentenceRule = long
    ? `Slides 2+ are "Title\\n\\nBody" with a 2-3 sentence body that actually explains the point like a person talking.`
    : `EVERY slide is a COMPLETE, natural sentence a human would actually say out loud — real grammar, articles and verbs included. Do NOT write clipped telegram fragments.
BAD (banned, sounds like a caveman/AI): "Lost hours, no motivation, feeling empty." / "Trying harder never helped me win." / "Upshift gives me that strict mode."
GOOD (do this): "I lost years of my life staring at 🌽 and calling it a habit." / "Willpower alone never worked, because the urge always won at 2am." / "So I put a blocker on strict mode that I physically can't turn off."`

  const appRule = brain.appName
    ? `Mention ${brain.appName} on exactly ONE of the middle slides near the end, softly and first-person, like a tip that genuinely helped you ("what finally worked for me was ${brain.appName}…"). This is one of the ${slidesPerShow} slides, NOT an extra one. Never salesy, never more than once.`
    : `If the style memory names an app, mention it on exactly one of the middle slides near the end, softly and first-person. It counts as one of the ${slidesPerShow} slides, not an extra one. Never salesy.`

  return `You write short-form social media carousel slideshows (TikTok/Instagram). Your job is to write ${count} that read like a real person genuinely sharing advice — thoughtful, specific, and actually helpful — NOT a random sentence generator.

Account context:
- Niche: ${brain.niche || '(unspecified)'}
- App / brand: ${brain.appName || '(unspecified)'} — ${brain.appDescription || ''}
- Audience: ${brain.audience || '(unspecified)'}

What's working for this account (style memory — respect this closely):
${brain.styleMemory || '(none yet — use proven short-form patterns)'}

${arc}

Voice & rules for every slide:
- Sound like a REAL person telling a friend how they did it. First person, warm, honest, specific. Use contractions. Mention real details (times of day, real feelings, real tactics) instead of vague abstractions.
- ${sentenceRule}
- ${appRule}
- NEVER use these AI/marketing words: rediscover, embrace, unlock, journey, elevate, empower, "dive in", "in today's world", boost, foster, cultivate, nurture, "take back control", "rewire your brain", "say goodbye to", "level up your life", "game changer", "hustle". No em-dashes. No hashtags inside slides.
- Content rule: NEVER write the words "porn", "pornography", "adult content", "explicit", or "NSFW". Use the 🌽 emoji instead (e.g. "quit 🌽", "🌽 sites").
- NEVER prefix a slide with a positional label like "Slide 1:", "Slide 2 -", "1)". The slide text is only the words the viewer reads — no numbering, no labels.
- No two slides should make the same point. ${bodyN > 0 ? `You have ${bodyN} middle slides — each needs its own distinct idea.` : ''}

Respond with a JSON object of this exact shape:
{
  "slideshows": [
    {
      "hook": "slide 1 — the scroll-stopping line",
      ${slidesSpec},
      "caption": "the post caption with 1-2 emoji",
      "hashtags": ["three", "relevant", "hashtags"],
      "rationale": "one sentence on why this should perform, tied to the style memory"
    }
  ]
}

Each slideshow's "slides" array MUST contain exactly ${slidesPerShow} strings — not one more, not one less. Before you finish, re-read every slide and rewrite any that contain a banned word or a clipped fragment. Make them genuinely good and worth saving. Return ONLY the JSON object.`
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
      slides: clampSlides(s.slides || [], slidesPerShow).map((text, j) => ({
        id: `slide-${stamp}-${i}-${j}`,
        text: scrubCorn(text),
        bgFrom: from,
        bgTo: to,
      })),
    }
  }).map((show) => ({ ...show, hook: scrubCorn(show.hook), caption: scrubCorn(show.caption) }))
}

// Models occasionally return one slide too many (usually a stray app slide before
// the CTA). Force the exact count without dropping the hook (first) or CTA (last):
// trim from just before the last slide, so the closing CTA always survives.
function clampSlides(slides, want) {
  if (!Array.isArray(slides) || slides.length <= want || want < 2) return slides
  return [...slides.slice(0, want - 1), slides[slides.length - 1]]
}

// Hard guarantee for the content rule: the literal words are never allowed to
// reach the user, even if the model slips. Replace them with the 🌽 emoji. Also
// strip any positional "Slide N:" / "Slide N =" label the model leaked from the
// prompt's slot map into the actual text. Runs on every hook/slide/caption.
function scrubCorn(text) {
  if (typeof text !== 'string') return text
  return text
    .replace(/^\s*slide\s*\d+\s*[:=.\-–—)]+\s*/i, '')
    .replace(/\bpornography\b/gi, '🌽')
    .replace(/\bporn\b/gi, '🌽')
    .replace(/\badult content\b/gi, '🌽')
    .replace(/\bNSFW\b/gi, '🌽')
    .trim()
}
