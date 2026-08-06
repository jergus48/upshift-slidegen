// Photo-pack generation. Unlike the gradient generator (server/generate.js),
// these carousels are built from REAL photos in the Upshift photo library
// (hosted on R2). Each pack is a fixed 6-slide "N rules i follow for X" format:
// one random photo is chosen per slot in a fixed category order, and the model
// writes the words for each slide so the text actually relates to its photo.
import { chatJSON } from './openrouter.js'
import { scrubCorn } from './generate.js'
import { logger } from './log.js'
import manifest from '../public/photo-library/manifest.json' with { type: 'json' }

const log = logger('photopack')

// The fixed slot layout, in order. Each slot pulls one random image from its
// category. `slot` is the role; `theme` is the hint the model writes toward so
// the line matches the photo. This IS the "in this order" the pack follows:
// mirror (cover) → gym_pov → food → gym_action → phone_pov (app) → closer.
const SLOTS = [
  { slot: 'cover', category: 'mirror', theme: 'a gym mirror / physique check — the cover' },
  { slot: 'rule', category: 'gym_pov', theme: 'a first-person gym shot (chalked hands, showing up to train) — a training/consistency rule' },
  { slot: 'rule', category: 'food', theme: 'a food / nutrition shot (protein, the same breakfast) — a nutrition/routine rule' },
  { slot: 'rule', category: 'gym_action', theme: 'a lifting-in-action shot — a rule about doing the work / logging the effort' },
  { slot: 'app', category: 'phone_pov', theme: 'a phone-on-lap shot — the app slide' },
  { slot: 'closer', category: 'closer', theme: 'a quiet closing photo (dead roses / thrown-out flowers) — remembering how you felt when she left or ignored you' },
]

const BASE = manifest.base
const CATS = manifest.categories

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

// One random image URL per slot, in slot order. Categories don't overlap
// between slots, so there's nothing to de-dupe within a single pack.
function pickImages() {
  return SLOTS.map((s) => {
    const files = CATS[s.category] || []
    if (!files.length) throw new Error(`Photo library has no images for "${s.category}".`)
    return `${BASE}${s.category}/${pick(files)}`
  })
}

function buildPrompt(brain, count) {
  const appName = brain.appName || 'Upshift'
  return `You write the words for a 6-slide TikTok photo carousel in the "5 rules i follow for X" format. The photos are ALREADY chosen — you only write the text. Each slide's photo has a theme, and your line for that slide MUST relate to its photo.

Account context:
- Niche: ${brain.niche || '(discipline / self-improvement)'}
- App / brand: ${appName}${brain.appDescription ? ` — ${brain.appDescription}` : ''}
- Audience: ${brain.audience || '(young men trying to stay disciplined)'}

What's working for this account (style memory — respect it):
${brain.styleMemory || '(none yet — use proven short-form patterns)'}

The carousel is ONE real person sharing the rules that keep them disciplined. It reads top to bottom as one story. The six photos, in order:
1. COVER (gym mirror / physique check): write the cover TITLE only, in the exact shape "5 rules i follow for <THEME>" where <THEME> is ONE word in CAPS that fits the niche AND these gym/discipline photos (e.g. STREAKS, DISCIPLINE, MORNINGS, FOCUS, CONSISTENCY). Lowercase everything except <THEME>, like "5 rules i follow for STREAKS".
2. RULE 1 (first-person gym shot — chalk, grip, showing up): one concrete rule about training consistency / never skipping.
3. RULE 2 (food / nutrition shot — protein, same breakfast): one concrete rule about eating / a fixed food routine.
4. RULE 3 (lifting-in-action shot): one concrete rule about doing the actual work / logging or tracking the effort.
5. RULE 4 (phone-on-lap shot — the app slide): softly name ${appName}, first person, as the tool that keeps you consistent. Mirror the showcased line "Stay consistent with ${appName}: #1 productivity app" but write your own. One line, never salesy.
6. RULE 5 (quiet closing photo — dead roses thrown out on the street): the emotional gut-punch closer. It MUST be about the HEARTBREAK that started all of this — the night SHE left, walked out, stopped texting back, or looked at you like you weren't enough. That specific pain is what the dead roses mean and what still fuels the discipline. Second or first person, raw, short, a little vulnerable — it should sting.
GOOD (this is the target — write your OWN in this vein): "never forget how you felt the night she walked out." / "do it for the guy she left crying at 2am." / "remember how small you felt when she stopped texting back." / "she left, and you swore you'd never feel that small again."
BANNED — do NOT write a generic motivation line. If your closer doesn't clearly reference HER / the breakup / that night, it is wrong and you must rewrite it. Never write anything like: "remember why you started", "I always remember why I started", "remember how it felt to realize I was treading water", "never give up", "keep pushing yourself", or anything about "your goals" / "your why". Those are banned.

Voice & rules for every line:
- Sound like a REAL person telling a friend, first person, warm and specific. Use contractions. Real details, not vague abstractions.
- Each rule is ONE short complete line a human would say — no clipped caveman fragments.
- Do NOT number the lines or write "Rule 1:" / "Slide 2" — the app adds the "1." "2." itself. Give the sentence only.
- NEVER use these AI/marketing words: rediscover, embrace, unlock, journey, elevate, empower, "dive in", boost, foster, cultivate, nurture, "take back control", "rewire your brain", "say goodbye to", "level up your life", "game changer", "hustle". No em-dashes. No hashtags inside lines. No markdown characters (no ** __ * _ backticks #). Plain text only.
- Content rule: NEVER write "porn", "pornography", "adult content", "explicit", or "NSFW" — use the 🌽 emoji instead.

Respond with a JSON object of this exact shape:
{
  "packs": [
    {
      "coverTitle": "5 rules i follow for STREAKS",
      "rule1": "the training-consistency rule, one line",
      "rule2": "the nutrition/routine rule, one line",
      "rule3": "the do-the-work rule, one line",
      "appLine": "Stay consistent with ${appName}: ...",
      "closer": "never forget how you felt the night she walked out (one raw line about HER, not a generic motivation line)",
      "caption": "the post caption with 1-2 emoji",
      "hashtags": ["three", "relevant", "hashtags"]
    }
  ]
}

Return EXACTLY ${count} pack${count === 1 ? '' : 's'}, each with a DIFFERENT <THEME> and different rules. Return ONLY the JSON object.`
}

const BATCH = 6

export async function generatePhotoPacks({ apiKey, model, brain, count = 1 }) {
  log.start(`Generating ${count} photo pack${count === 1 ? '' : 's'} with ${model}`)
  const raw = []
  let safety = 0
  while (raw.length < count && safety < count + 5) {
    safety++
    const n = Math.min(BATCH, count - raw.length)
    log.step(`asking model for ${n} more (${raw.length}/${count} so far)…`)
    const parsed = await chatJSON({ apiKey, model, prompt: buildPrompt(brain, n) })
    const batch = parsed.packs || []
    if (!batch.length) {
      log.warn('model returned no packs — stopping early')
      break
    }
    raw.push(...batch)
    log.progress(Math.min(raw.length, count), count, 'written')
  }
  log.ok(`Generated ${Math.min(raw.length, count)} photo pack${raw.length === 1 ? '' : 's'}`)

  const stamp = Date.now()
  return raw.slice(0, count).map((p, i) => {
    const images = pickImages()
    // Assemble the six slide texts. The cover keeps its title unnumbered; the
    // five rules are numbered 1–5 across the remaining slides (rule 4 is the
    // app slide, rule 5 is the closer) — exactly like the showcased pack.
    const lines = [
      p.coverTitle || '5 rules i follow',
      `1. ${p.rule1 || ''}`,
      `2. ${p.rule2 || ''}`,
      `3. ${p.rule3 || ''}`,
      `4. ${p.appLine || `Stay consistent with ${brain.appName || 'Upshift'}`}`,
      `5. ${p.closer || ''}`,
    ]
    return {
      id: `q-${stamp}-p${i}`,
      hook: scrubCorn(p.coverTitle || '5 rules i follow'),
      caption: scrubCorn(p.caption || ''),
      hashtags: p.hashtags || [],
      rationale: 'Photo pack — real photos in fixed order, AI-written rules.',
      createdAt: new Date(stamp).toISOString(),
      slides: images.map((imageUrl, j) => ({
        id: `slide-${stamp}-${i}-${j}`,
        text: scrubCorn(lines[j] || ''),
        imageUrl,
        // A dark fallback gradient in case an image ever fails to load.
        bgFrom: '#0f172a',
        bgTo: '#000000',
      })),
    }
  })
}
