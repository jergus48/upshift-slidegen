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
// between slots, so there's nothing to de-dupe within a single pack. `exclude`
// is a Set of full image URLs the user has hidden in the Photo Packs curation
// grid — those are filtered out per slot. If every photo in a category is
// hidden we fall back to the full set rather than fail the whole pack.
function pickImages(exclude) {
  return SLOTS.map((s) => {
    const all = CATS[s.category] || []
    if (!all.length) throw new Error(`Photo library has no images for "${s.category}".`)
    const kept = all.filter((f) => !exclude.has(`${BASE}${s.category}/${f}`))
    const files = kept.length ? kept : all
    return `${BASE}${s.category}/${pick(files)}`
  })
}

// Cover hook shapes. The carousel ALWAYS has 5 numbered lines, so every hook
// keeps the "5" and a ONE-word CAPS <THEME> — only the phrasing varies. `title`
// is the cover shape; `frame` is how the FIVE body lines should read so they
// match the hook (a "tips" cover wants tactical advice, a "rules" cover wants
// first-person "i ..." lines). Keyed by the value the UI sends; `varied` (the
// default) rotates the shapes across a batch so covers aren't all identical. Add
// an entry here + an option in PhotoPackView to expose a new hook.
const HOOK_TEMPLATES = {
  rules:          { title: '5 rules i follow for <THEME>',            frame: 'first-person rules you personally follow ("i never...", "i always...")' },
  tips:           { title: '5 tips to get <THEME> at the gym',        frame: 'direct, tactical advice to the viewer ("stop doing 3x12, switch to 4x6", "eat a full meal 90 mins before you train")' },
  things:         { title: '5 things i do every day for <THEME>',     frame: 'first-person daily habits ("i ...")' },
  habits:         { title: '5 habits that built my <THEME>',          frame: 'first-person habits you built ("i started...", "i stopped...")' },
  mistakes:       { title: '5 mistakes that killed my <THEME>',       frame: 'mistakes to avoid, phrased as a warning ("stop...", "quit...", "don\'t...")' },
  secrets:        { title: '5 things nobody tells you about <THEME>', frame: 'insider truths revealed to the viewer' },
  nonnegotiables: { title: '5 non-negotiables for <THEME>',           frame: 'firm first-person non-negotiables' },
  lies:           { title: '5 lies i had to unlearn about <THEME>',   frame: 'a myth then the truth, short ("the lie: carbs are bad. the truth: ...")' },
}

const THEME_NOTE = `<THEME> is ONE word in CAPS that fits the niche AND these gym/discipline photos — a noun like STREAKS, DISCIPLINE, GAINS, FOCUS, or an adjective like BIGGER, STRONGER, LEANER when the shape ("get <THEME> at the gym") calls for it. Lowercase everything except <THEME>.`

// The cover-title instruction for slide 1, given the chosen hook style. Any
// unknown/empty style falls back to "varied": pick a different shape per pack.
function hookInstruction(style) {
  if (style && HOOK_TEMPLATES[style]) {
    return `write the cover TITLE only, in the EXACT shape "${HOOK_TEMPLATES[style].title}" — copy this shape word-for-word, only swapping <THEME>. Do NOT fall back to "5 rules i follow for X"; the required shape is "${HOOK_TEMPLATES[style].title}". ${THEME_NOTE}`
  }
  const list = Object.values(HOOK_TEMPLATES).map((t) => `   - "${t.title}"`).join('\n')
  return `write the cover TITLE only. Pick ONE of these proven shapes and use a DIFFERENT shape for each pack in the batch so the covers don't all look the same:\n${list}\n${THEME_NOTE}`
}

// How the five body lines should be phrased so they match the cover hook. For
// "varied" the model matches whatever cover shape it picked for that pack.
function lineFrame(style) {
  if (style && HOOK_TEMPLATES[style]) return HOOK_TEMPLATES[style].frame
  return 'match the phrasing to the cover shape you picked for this pack — a "rules"/"habits" cover wants first-person "i ..." lines, a "tips" cover wants direct tactical advice to the viewer, a "mistakes" cover wants "stop ..." warnings'
}

function buildPrompt(brain, count, hookStyle) {
  const appName = brain.appName || 'Upshift'
  // The cover shape to use as the JSON example, so the model copies THIS shape
  // rather than defaulting to "5 rules i follow". `varied` shows a neutral one.
  const exampleTitle = (HOOK_TEMPLATES[hookStyle]?.title || '5 things i do every day for <THEME>')
    .replace('<THEME>', /at the gym/.test(HOOK_TEMPLATES[hookStyle]?.title || '') ? 'BIGGER' : 'DISCIPLINE')
  return `You write the words for a 6-slide TikTok photo carousel — the "5 rules / 5 tips / 5 things i do for X" family of hooks. The photos are ALREADY chosen — you only write the text. Each slide's photo has a LOCKED theme, and your line for that slide MUST match its photo. The order never changes: slide 2 = GYM, slide 3 = FOOD, slide 4 = TRACKING THE WORK.

Account context:
- Niche: ${brain.niche || '(discipline / self-improvement)'}
- App / brand: ${appName}${brain.appDescription ? ` — ${brain.appDescription}` : ''}
- Audience: ${brain.audience || '(young men trying to stay disciplined)'}

What's working for this account (style memory — respect it):
${brain.styleMemory || '(none yet — use proven short-form patterns)'}

The carousel is ONE real person sharing the rules that keep them disciplined. It reads top to bottom as one story. The six photos, in order:
1. COVER (gym mirror / physique check): ${hookInstruction(hookStyle)}
2. RULE 1 (first-person gym shot — chalk, grip, showing up): ONE concrete GYM / TRAINING rule — showing up, never skipping a session, the daily lift, training even when tired. It MUST be about training. Do NOT write about food, sleep, reading, journaling, phones, or mindset here — this slide is the GYM.
3. RULE 2 (food / nutrition shot — protein, the same breakfast): ONE concrete FOOD / NUTRITION rule — what you eat, hitting your protein, the fixed breakfast, cooking at home, cutting the junk. It MUST be about eating so it matches the food photo. Do NOT write about the gym, reading a book, sleep, or mindset here — this slide is FOOD.
4. RULE 3 (lifting-in-action shot): ONE concrete rule about DOING THE WORK and TRACKING it — logging every set, tracking your lifts, progressive overload, counting the reps, beating last week's numbers. It MUST be about the training effort / tracking. Do NOT write about food, reading, or generic mindset here.

CRITICAL — each rule MUST match its slide's photo. The order is locked: slide 2 = GYM, slide 3 = FOOD, slide 4 = TRACKING THE WORK. A food line on the gym slide, a gym line on the food slide, or a generic self-improvement line like "read a book", "journal every morning", "wake up at 5am", or "meditate" on ANY of these three slides is WRONG. If a line doesn't obviously match its photo's theme, rewrite it before you answer.

PHRASING — write the five body lines in the voice of the cover hook: ${lineFrame(hookStyle)}. The SUBJECT of each line is still locked (slide 2 gym, slide 3 food, slide 4 tracking) and slides 5–6 keep their own rules below — only the wording flexes to fit the hook. Keep every line concrete and specific like a real creator (numbers, sets, reps, foods, times), never vague.
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
      "coverTitle": "${exampleTitle}",
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

export async function generatePhotoPacks({ apiKey, model, brain, count = 1, exclude = [], hookStyle = 'varied' }) {
  const hidden = new Set(exclude)
  log.start(`Generating ${count} photo pack${count === 1 ? '' : 's'} with ${model}`)
  const raw = []
  let safety = 0
  while (raw.length < count && safety < count + 5) {
    safety++
    const n = Math.min(BATCH, count - raw.length)
    log.step(`asking model for ${n} more (${raw.length}/${count} so far)…`)
    const parsed = await chatJSON({ apiKey, model, prompt: buildPrompt(brain, n, hookStyle) })
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
    const images = pickImages(hidden)
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
