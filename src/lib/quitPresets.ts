// One-click Brain presets for the slideshow niches. Each fills the audience +
// style memory (niche/app fields are left untouched). The style memory encodes
// the exact voice, the real hooks, and the per-slide structure for that niche.
//
// Every preset is gender-aware: the same niche reads differently for a men's
// pack vs a women's pack (persona, pronouns, hobby examples, hooks). Pick the
// pack with `getQuitPresets(gender)`.
//
// Each preset also carries `slides`: the recommended "slides per slideshow" so
// the deck isn't cut short (hook + every step/item + app slide + CTA). It is
// derived directly from that preset's slide plan below.

export type Gender = 'men' | 'women';

export const GENDERS: { key: Gender; label: string }[] = [
  { key: 'men', label: 'Men' },
  { key: 'women', label: 'Women' },
];

export interface QuitPreset {
  key: string;
  label: string;
  niche: string;
  audience: string;
  styleMemory: string;
  slides: number; // recommended slides-per-slideshow for the full plan
}

// Shared voice block. The single most important job here is to stop the output
// sounding like AI/marketing copy — real TikTok/IG creators write blunt, first
// person, a little rough. Keep this in sync across every preset.
const VIRAL_VOICE =
  'Voice, Tone & Formatting:\n' +
  'Write like a real person telling a friend how they actually did it — NOT a brand, NOT an AI. First person, warm, honest, specific.\n' +
  'Each slide is ONE complete, natural sentence (roughly 8-16 words) with real grammar — articles, verbs, contractions. ' +
  'NEVER write clipped telegram fragments like "Lost hours, no motivation, feeling empty." Write it like a human would say it out loud: ' +
  '"I lost years of my life to this and called it a habit."\n' +
  'The slides must read as ONE connected guide top to bottom — each slide is the next sentence of the same story, not a random new thought. ' +
  'If the hook promises steps/ways, every middle slide is a real, specific, useful step (number them if the hook implies a count).\n' +
  'BANNED words/phrases (they scream AI): rediscover, embrace, unlock, journey, elevate, empower, "dive in", "in today\'s world", ' +
  'boost, foster, cultivate, nurture, "take back control", "rewire your brain", "say goodbye to", "level up your life", "game changer". ' +
  'No em-dashes. No hashtags. No markdown or bold. No emojis unless a slide explicitly calls for one. ' +
  'The app has NO community, forum, or support group — never reference an in-app community, other members, or their stories/motivation. ' +
  'Mention the app on ONE slide near the end, softly and first-person ("what finally worked for me was…"), never salesy.\n' +
  'HOOKS: any example hooks below are ONLY inspiration for the angle and tone — always write your OWN fresh, original hook. Never copy an example word for word, and vary it every time.';

// Persona block — the most important gender lever. It tells the model who is
// speaking and who they're speaking to, so examples/pronouns/hobbies land right
// (no male-coded lines in a women's pack and vice versa).
const PERSONA = (g: Gender) =>
  g === 'women'
    ? '\n\nPERSONA (non-negotiable): You are writing AS a woman, FOR women. Every pronoun, reference, example and hobby must fit a woman/girl. ' +
      'NEVER use male-coded framing (no "become a 10/10 man", no boys\'/men\'s sports framing, no beard/gym-bro clichés, nothing that only makes sense for a guy). ' +
      'Lean into what actually resonates with women (self-worth, glow-up, softness with discipline, feeling like herself again).'
    : '\n\nPERSONA (non-negotiable): You are writing AS a man, FOR men. Every pronoun, reference, example and hobby must fit a man/guy. ' +
      'NEVER use female-coded framing. Lean into what actually resonates with men (discipline, becoming who you should be, respect, getting your edge back).';

// Hard content rule for the 🌽 niche — the literal words are never allowed.
const CORN_RULE =
  '\n\nCONTENT RULE (non-negotiable): NEVER write the words "porn", "pornography", "adult content", "explicit", or "NSFW". ' +
  'Always use the 🌽 emoji instead (e.g. "quit 🌽", "🌽 sites", "watching 🌽", "🌽 addiction"). This applies to every single slide, no exceptions.';

// Each preset is a function of gender so the men's and women's packs stay a
// single source of truth. Only the gendered bits branch; the rest is shared.
type PresetBuilder = (g: Gender) => QuitPreset;

const BUILDERS: PresetBuilder[] = [
  // 🌽
  (g) => ({
    key: 'corn',
    label: '🌽',
    slides: 6,
    niche: 'quitting 🌽',
    audience: g === 'women' ? 'Women trying to quit 🌽 for good!' : 'Guys trying to quit 🌽 for good!',
    styleMemory:
      `${VIRAL_VOICE}${PERSONA(g)}${CORN_RULE}\n\n` +
      'Hook inspiration (examples of the angle ONLY — write your own original, first person, no app mention):\n' +
      '- "How I quit 🌽 after a decade"\n' +
      '- "How to quit watching 🌽 in 2026"\n' +
      '- "How I became 100 days 🌽 free in 2026"\n\n' +
      'Structure & Flow:\n' +
      'Slide 1 (Hook): Your own original hook in this spirit. Personal, no app.\n' +
      'Slide 2 (Rock bottom): Say the real cost in one blunt line (fried dopamine, no drive, dead eyes).\n' +
      'Slide 3 (The lie): Willpower alone never worked for you.\n' +
      'Slide 4 (The fix): You need a blocker you literally can\'t delete once it\'s on.\n' +
      'Slide 5 (The App): Upshift\'s 🌽 Block — a 30-day strict block on 🌽 sites that you physically can\'t remove.\n' +
      'Slide 6 (CTA): Blunt closer (e.g. "Day 1 starts now. Save this.").',
  }),

  // Hobbies — the clearest place the packs diverge (different hobby examples).
  (g) => ({
    key: 'hobbies',
    label: 'Hobbies',
    slides: 8,
    niche: 'attractive hobbies / self-improvement',
    audience:
      g === 'women'
        ? 'Girls who feel stuck and want to become a 10/10!'
        : 'Guys who feel stuck and want to become a 10/10!',
    styleMemory:
      `${VIRAL_VOICE}${PERSONA(g)}\n\n` +
      'Hook inspiration (examples of the angle ONLY — write your own original, no app mention):\n' +
      (g === 'women'
        ? '- "5 hobbies that make you a 10/10 girl"\n' +
          '- "5 hobbies that gave me my glow-up"\n' +
          '- "How to become that girl in 7 steps"\n\n'
        : '- "5 hobbies to finally become happy again"\n' +
          '- "5 hobbies that make you a 10/10 man"\n' +
          '- "How to unf*ck your life in 7 steps"\n\n') +
      'Structure & Flow:\n' +
      'Slide 1 (Hook): Your own original hook in this spirit.\n' +
      'Slide 2 (Callout): Blunt line about being glued to your phone doing nothing.\n' +
      (g === 'women'
        ? 'Slide 3 (Hobby): One that builds a body you\'re proud of (pilates, lifting, running).\n' +
          'Slide 4 (Hobby): One that builds a brain (reading, journaling, learning a language).\n' +
          'Slide 5 (Hobby): One that gets you outside/around people (a dance class, hiking, a run club).\n'
        : 'Slide 3 (Hobby): One real hobby that builds a body (lifting, running, boxing).\n' +
          'Slide 4 (Hobby): One that builds a brain (reading, an instrument, chess).\n' +
          'Slide 5 (Hobby): One that gets you outside/around people (a sport, climbing, a club).\n') +
      'Slide 6 (The catch): None of it happens while you\'re doomscrolling 5 hours a day.\n' +
      'Slide 7 (The App): Upshift\'s Quest Block — your apps only unlock after you\'ve done your real quests, so you actually have time for hobbies.\n' +
      'Slide 8 (CTA): Blunt closer (e.g. "Pick one. Start today.").',
  }),

  // Rebuild yourself
  (g) => ({
    key: 'rebuild',
    label: 'Rebuild yourself',
    slides: 8,
    niche: 'self-improvement / self-worth',
    audience:
      g === 'women'
        ? 'Girls at rock bottom who want to rebuild!'
        : 'Guys at rock bottom who want to rebuild!',
    styleMemory:
      `${VIRAL_VOICE}${PERSONA(g)}\n\n` +
      'Hook inspiration (examples of the angle ONLY — write your own original, no app mention):\n' +
      '- "7 steps to rebuild yourself"\n' +
      '- "5 ways to better yourself"\n' +
      '- "How to start loving yourself again"\n\n' +
      'Structure & Flow:\n' +
      'Slide 1 (Hook): Your own original hook in this spirit.\n' +
      'Slide 2 (Truth): Blunt line about how you let yourself go / hit rock bottom.\n' +
      'Slide 3 (Step): Fix the basics first (sleep, water, a walk, a shower).\n' +
      'Slide 4 (Step): Move your body every day, even 20 minutes.\n' +
      'Slide 5 (Step): Cut the thing that keeps you stuck (endless scrolling).\n' +
      'Slide 6 (Step): Do one hard thing a day and keep the promise to yourself.\n' +
      'Slide 7 (The App): Upshift\'s Quest Block — your apps stay locked until your daily quests are done, so momentum wins over the scroll.\n' +
      'Slide 8 (CTA): Blunt closer (e.g. "Start with step one. Today.").',
  }),

  // Walk more
  (g) => ({
    key: 'steps',
    label: 'Walk more',
    slides: 6,
    niche: 'detaching from your phone with a step-gated blocker',
    audience: 'People glued to TikTok who want to move more!',
    styleMemory:
      `${VIRAL_VOICE}${PERSONA(g)}\n\n` +
      'Hook inspiration (examples of the angle ONLY — write your own original, first person, no app mention):\n' +
      '- "My TikTok only unlocks after 5,000 steps"\n' +
      '- "How I walk 10k+ steps a day thanks to my TikTok addiction"\n\n' +
      'What Upshift actually does (be accurate on the app slide): Walk Block makes your social apps only open after you hit a step goal — or a version where every step you take converts into minutes of allowed app time. That is the whole mechanic; do not invent other features.\n\n' +
      'Structure & Flow:\n' +
      'Slide 1 (Hook): Your own original hook in this spirit.\n' +
      'Slide 2 (Before): You were locked into your phone all day, scrolling and barely moving.\n' +
      'Slide 3 (The idea): You made your phone something you have to earn with steps.\n' +
      'Slide 4 (The App): Upshift\'s Walk Block — your socials only open after you hit your step goal, or every step converts into minutes of app time.\n' +
      'Slide 5 (The result): Now you rack up 10k+ steps a day just to unlock your feed, without even thinking about it.\n' +
      'Slide 6 (CTA): Blunt closer (e.g. "Walk to unlock. Save this.").',
  }),

  // Smoking
  (g) => ({
    key: 'smoking',
    label: 'Smoking',
    slides: 6,
    niche: 'quitting smoking',
    audience: 'People trying to quit smoking for good!',
    styleMemory:
      `${VIRAL_VOICE}${PERSONA(g)}\n\n` +
      'Hook inspiration (example angle ONLY — write your own original, first person, no app): "How I quit smoking after X years".\n\n' +
      'Structure & Flow:\n' +
      'Slide 1 (Hook): Personal hook about quitting for good.\n' +
      'Slide 2 (Reality): One blunt line on what it did to your lungs/energy.\n' +
      'Slide 3 (The lie): Willpower alone never held — you have to kill the triggers.\n' +
      'Slide 4 (The move): Track every clean day so quitting feels like winning.\n' +
      'Slide 5 (The App): Name Upshift for tracking your streak and wins.\n' +
      'Slide 6 (CTA): Blunt closer (e.g. "Day 1. Save this.").',
  }),

  // Vaping
  (g) => ({
    key: 'vaping',
    label: 'Vaping',
    slides: 7,
    niche: 'quitting vaping',
    audience: 'People trying to quit vaping for good!',
    styleMemory:
      `${VIRAL_VOICE}${PERSONA(g)}\n\n` +
      'Hook inspiration (example angle ONLY — write your own original, first person, no app): "How I finally put the vape down".\n\n' +
      'Structure & Flow:\n' +
      'Slide 1 (Hook): Personal hook about quitting the vape.\n' +
      'Slide 2 (Reality): One blunt line on the anxiety spikes and wrecked lungs.\n' +
      'Slide 3 (Environment): Throw every device out — willpower won\'t save you.\n' +
      'Slide 4 (Swap): Replace the hand-to-mouth habit with something that isn\'t killing you.\n' +
      'Slide 5 (The move): Track every beaten craving.\n' +
      'Slide 6 (The App): Name Upshift for tracking your streak and wins.\n' +
      'Slide 7 (CTA): Blunt closer.',
  }),

  // Weed
  (g) => ({
    key: 'weed',
    label: 'Weed',
    slides: 6,
    niche: 'quitting weed',
    audience: 'People trying to quit smoking weed!',
    styleMemory:
      `${VIRAL_VOICE}${PERSONA(g)}\n\n` +
      'Hook inspiration (example angle ONLY — write your own original, first person, no app): "How I quit weed and got my brain back".\n\n' +
      'Structure & Flow:\n' +
      'Slide 1 (Hook): Personal hook about quitting weed.\n' +
      'Slide 2 (Reality): One blunt line on the fog and zero motivation.\n' +
      'Slide 3 (The lie): Willpower alone never held — cut the triggers.\n' +
      'Slide 4 (The move): Track every clean day so it feels like winning.\n' +
      'Slide 5 (The App): Name Upshift for tracking your streak and wins.\n' +
      'Slide 6 (CTA): Blunt closer (e.g. "Get your mind back. Save this.").',
  }),

  // Alcohol
  (g) => ({
    key: 'alcohol',
    label: 'Alcohol',
    slides: 8,
    niche: 'quitting alcohol',
    audience: 'People trying to quit drinking!',
    styleMemory:
      `${VIRAL_VOICE}${PERSONA(g)}\n\n` +
      'Hook inspiration (example angle ONLY — write your own original, first person, no app): "How I quit drinking without telling anyone".\n\n' +
      'Structure & Flow:\n' +
      'Slide 1 (Hook): Personal hook about quitting drinking.\n' +
      'Slide 2 (Reality): One blunt line on the trashed sleep, energy and body.\n' +
      'Slide 3 (Environment): Empty the house — willpower won\'t save you.\n' +
      'Slide 4 (Swap): Replace the evening drink with something that isn\'t a hangover.\n' +
      'Slide 5 (Social): Skip the events that are just an excuse to drink, for now.\n' +
      'Slide 6 (The move): Track every dry day.\n' +
      'Slide 7 (The App): Name Upshift for tracking your streak and wins.\n' +
      'Slide 8 (CTA): Blunt closer.',
  }),

  // Gambling
  (g) => ({
    key: 'gambling',
    label: 'Gambling',
    slides: 6,
    niche: 'quitting gambling',
    audience: 'People trying to quit gambling!',
    styleMemory:
      `${VIRAL_VOICE}${PERSONA(g)}\n\n` +
      'Hook inspiration (example angle ONLY — write your own original, first person, no app): "How I quit gambling after losing everything".\n\n' +
      'Structure & Flow:\n' +
      'Slide 1 (Hook): Personal hook about quitting gambling.\n' +
      'Slide 2 (Reality): One blunt line on the money and the mind it destroyed.\n' +
      'Slide 3 (Environment): Block every app and site — willpower won\'t save you.\n' +
      'Slide 4 (The move): Track every bet you didn\'t place.\n' +
      'Slide 5 (The App): Name Upshift for the strict block + streak tracking.\n' +
      'Slide 6 (CTA): Blunt closer.',
  }),

  // Doomscrolling
  (g) => ({
    key: 'doomscrolling',
    label: 'Doomscrolling',
    slides: 8,
    niche: 'quitting doomscrolling',
    audience: 'People who can\'t put their phone down!',
    styleMemory:
      `${VIRAL_VOICE}${PERSONA(g)}\n\n` +
      'Hook inspiration (example angle ONLY — write your own original, no app): "How I stopped doomscrolling without deleting everything".\n\n' +
      'Structure & Flow:\n' +
      'Slide 1 (Hook): Strong hook about quitting the scroll without going off-grid.\n' +
      'Slide 2 (Reality): How short-form feeds fried your attention span.\n' +
      'Slide 3 (Nuance): The algorithm is the problem, not talking to your friends.\n' +
      'Slide 4 (Keep chat): Keep WhatsApp and Messenger fully open.\n' +
      'What Upshift actually does (use these on the app slide, pick what fits — do not invent others): strict mode daily time limits on TikTok/Instagram; Quest Block (Instagram only unlocks after your quests like gym or homework are done); Work Schedule Block (socials locked during your work hours); Sleep Schedule Block (socials locked around bedtime).\n\n' +
      'Slide 5 (Block feed): Strict daily time limits on TikTok and Instagram that you can\'t bypass.\n' +
      'Slide 6 (The App): Upshift does this for you — Quest Block so Instagram only unlocks after the gym or homework, plus work-hours and bedtime schedule blocks.\n' +
      'Slide 7 (The result): You get the scroll back only after you\'ve earned it, so the day isn\'t gone.\n' +
      'Slide 8 (CTA): Blunt closer.',
  }),
];

// ---- Self-improvement presets ----------------------------------------------
// A second family: motivational self-improvement slideshows. Unlike the shared
// quit-habit voice, EACH of these carries its OWN topic-specific slide plan, so
// no two presets ever generate the same deck. Two hard rules for all of them:
//   1. The titles below are the user's exact titles — do not rename them.
//   2. The whole deck is about that one topic; only ONE slide (two at the very
//      most) plugs the app, branded "Upshift: #1 Productivity App".
// `slides` = hook + every step/item + the app slide + CTA, so nothing is cut.

const UPSHIFT_RULE =
  '\n\nUPSHIFT PLUG (strict, overrides the softer app-mention note above): Exactly ONE slide plugs the app — two at ' +
  'the very most — and it names it as "Upshift: #1 Productivity App". In one honest, first-person line say what it ' +
  'does: it locks your social apps and kills the mindless scroll until your real work (gym, reading, tasks) is done. ' +
  'Every other slide is 100% about the topic with ZERO app mention. Never exceed two Upshift slides and never turn ' +
  'the deck into an ad.';

interface SelfSpec {
  key: string;
  label: string; // the user's exact title — used as the button label AND the hook
  slides: number; // recommended slides-per-slideshow for the full plan
  niche: string;
  audience: string;
  body: string; // topic-specific slide plan; no two presets share one
}

const SELF_SPECS: SelfSpec[] = [
  {
    key: 'stop-wasting-8',
    label: '8 rules to stop wasting your life',
    slides: 11,
    niche: 'stop wasting your life / self-discipline',
    audience: 'People who feel their life is quietly slipping away!',
    body:
      'Slide 1 (Hook): the title, personal.\n' +
      'Slides 2-9: eight blunt, specific rules, ONE per slide, numbered 1-8: wake at the same time with no snooze; ' +
      'do the hardest thing first before your brain talks you out of it; stop waiting to feel motivated; train your ' +
      'body 4-5x a week; read instead of watching other people live; cut the people who make you smaller; kill the ' +
      'endless scroll; track your days so a week never disappears again.\n' +
      'Slide 10 (The App): your Upshift slide (Upshift: #1 Productivity App) — how you actually killed the scroll.\n' +
      'Slide 11 (CTA): blunt closer (e.g. "Screenshot this. Start rule 1 today.").',
  },
  {
    key: 'morning-ascend',
    label: 'the morning routine to ascend',
    slides: 10,
    niche: 'a morning routine that levels you up',
    audience: 'People who want mornings that set them up to win!',
    body:
      'Slide 1 (Hook): the title, personal.\n' +
      'Slides 2-8: the routine step by step in the order you do it: no phone for the first hour; make your bed; ' +
      'water before coffee; sunlight and a short walk; train or stretch; a cold shower; plan the top 3 things that ' +
      'matter before touching anything else.\n' +
      'Slide 9 is your Upshift slide (Upshift: #1 Productivity App) — how you keep the phone locked for that first ' +
      'hour so the routine actually happens.\n' +
      'Slide 10 (CTA): blunt closer.',
  },
  {
    key: 'win-20s',
    label: 'How to Win Your 20s',
    slides: 10,
    niche: 'making your twenties count',
    audience: "People in their 20s who don't want to waste them!",
    body:
      'Slide 1 (Hook): the title.\n' +
      'Slides 2-8: the real lessons, ONE per slide: your 20s are for building, not coasting; skills beat comfort; ' +
      'your body will never be easier to build than now; save and invest early even if it is tiny; pick friends who ' +
      'are going somewhere; date on purpose instead of drifting; stop trading whole years for the scroll.\n' +
      'Slide 9 (The App): your Upshift slide (Upshift: #1 Productivity App).\n' +
      'Slide 10 (CTA): blunt closer.',
  },
  {
    key: 'mental-sentences',
    label: '8 Sentences That Make You Level Up Mentally',
    slides: 11,
    niche: 'mindset shifts / one-line mental sentences',
    audience: 'People who want to think sharper and stronger!',
    body:
      'Slide 1 (Hook): the title.\n' +
      'Slides 2-9: eight short, screenshot-worthy sentences, ONE per slide, no explanation needed — true and a ' +
      'little uncomfortable: "Discipline is just self-respect in action." / "No one is coming to save you." / ' +
      '"Boredom is where discipline is built." / "You are the average of what you repeat." / "Comfort is the ' +
      'slowest way to lose." / "Your phone is spending your life for you." / "Nobody remembers the day you started, ' +
      'only that you did." / "You do not need motivation, you need to begin."\n' +
      'Slide 10 (The App): your Upshift slide (Upshift: #1 Productivity App) — one honest line on how it takes your time back.\n' +
      'Slide 11 (CTA): blunt closer.',
  },
  {
    key: 'signs-make-it',
    label: "5 signs you're going to make it",
    slides: 8,
    niche: "signs you're on the right path",
    audience: "People grinding who need to know it's working!",
    body:
      'Slide 1 (Hook): the title.\n' +
      'Slides 2-6: five quiet signs, ONE per slide: you have started saying no; boring routines feel good now; you ' +
      'are not addicted to your phone anymore; you keep the promises you make to yourself; you are fine being alone ' +
      'and working while everyone else parties.\n' +
      'Slide 7 (The App): your Upshift slide (Upshift: #1 Productivity App) — how you beat the phone addiction.\n' +
      'Slide 8 (CTA): blunt closer.',
  },
  {
    key: 'stop-wasting-7',
    label: '7 rules to stop wasting your life',
    slides: 10,
    niche: 'stop wasting your life / discipline (harder-edged take)',
    audience: 'People done wasting their potential!',
    body:
      'Slide 1 (Hook): the title.\n' +
      'Slides 2-8: seven blunt rules, ONE per slide, numbered 1-7, DIFFERENT flavor from any other list: protect ' +
      'your mornings; stop consuming and start creating; make discomfort a daily habit; audit who you spend time ' +
      'with; get the apps that eat your day off your back; measure progress every week; never break a promise to ' +
      'yourself twice.\n' +
      'Slide 9 (The App): your Upshift slide (Upshift: #1 Productivity App) — instead of relying on willpower you ' +
      'lock the apps until your work is done.\n' +
      'Slide 10 (CTA): blunt closer.',
  },
  {
    key: 'manlier-hobbies',
    label: '6 hobbies that make you noticeably manlier',
    slides: 9,
    niche: 'hobbies that build presence and character',
    audience: 'Guys who want more presence and respect!',
    body:
      'Slide 1 (Hook): the title.\n' +
      'Slides 2-7: six hobbies, ONE per slide, each with a one-line why: lifting or a combat sport (boxing/BJJ); ' +
      'learning to build or fix things with your hands; hunting, hiking or the outdoors; an instrument like guitar ' +
      'or piano; cooking real food; cold plunges or hard cardio.\n' +
      'Slide 8 is your Upshift slide (Upshift: #1 Productivity App) — none of it happens while you scroll, so you ' +
      'lock the phone until you have trained.\n' +
      'Slide 9 (CTA): blunt closer.',
  },
  {
    key: 'honor-one-life',
    label: '9 codes to honor your one life',
    slides: 12,
    niche: 'living with intention / a personal code',
    audience: 'People who want to live like their time actually matters!',
    body:
      'Slide 1 (Hook): the title.\n' +
      'Slides 2-10: nine codes to live by, ONE per slide, numbered 1-9: your word is law; train the body you were ' +
      'given; protect your attention like your life depends on it; do hard things on purpose; help without being ' +
      'asked; stop numbing and start feeling; build something that outlasts you; forgive fast and move faster; ' +
      'never waste a day you can never get back.\n' +
      'Slide 11 (The App): your Upshift slide (Upshift: #1 Productivity App) — how you guard your attention.\n' +
      'Slide 12 (CTA): blunt closer.',
  },
  {
    key: 'instead-of-scrolling',
    label: 'things to do instead of mindlessly scrolling',
    slides: 10,
    niche: 'better things to do than doomscroll',
    audience: 'People who scroll for hours and hate themselves for it!',
    body:
      'Slide 1 (Hook): the title.\n' +
      'Slides 2-8: specific things to do instead, ONE per slide: go for a walk with no phone; read 10 pages; call ' +
      'someone who matters; train; learn one thing on a real skill; cook a proper meal; write down tomorrow\'s top 3.\n' +
      'Slide 9 is your Upshift slide (Upshift: #1 Productivity App) — the thing that actually stops the scroll so ' +
      'you have time for the rest. This topic fits the app perfectly, lean into it here.\n' +
      'Slide 10 (CTA): blunt closer.',
  },
  {
    key: 'smart-hobbies',
    label: '4 hobbies to become dangerously intelligent',
    slides: 7,
    niche: 'hobbies that make you sharper',
    audience: 'People who want to actually get smarter, not just feel busy!',
    body:
      'Slide 1 (Hook): the title.\n' +
      'Slides 2-5: four hobbies, ONE per slide, each with a one-line why: reading real books every day; chess or ' +
      'strategy games; writing or journaling to think clearly; learning a language or an instrument.\n' +
      'Slide 6 is your Upshift slide (Upshift: #1 Productivity App) — you cannot get smarter while your brain is ' +
      'fried from scrolling, so you lock the feed first.\n' +
      'Slide 7 (CTA): blunt closer.',
  },
  {
    key: 'struggle-to-win',
    label: 'How to struggle to win',
    slides: 9,
    niche: 'using hard seasons to come out ahead',
    audience: 'People in a brutal season who refuse to quit!',
    body:
      'Slide 1 (Hook): the title, personal.\n' +
      'Slide 2 (Truth): one blunt line that the struggle is the point, not a detour.\n' +
      'Slides 3-7: the moves, ONE per slide: show up on the worst days; shrink the goal down to just today; use the ' +
      'pain as fuel instead of an excuse; cut every comfort keeping you soft; keep going long after everyone else ' +
      'stopped.\n' +
      'Slide 8 (The App): your Upshift slide (Upshift: #1 Productivity App) — killing the scroll was the first ' +
      'comfort you cut.\n' +
      'Slide 9 (CTA): blunt closer.',
  },
  {
    key: 'change-yourself',
    label: '5 best ways to change yourself',
    slides: 8,
    niche: 'genuinely changing yourself for the better',
    audience: 'People ready to actually change, not just talk about it!',
    body:
      'Slide 1 (Hook): the title.\n' +
      'Slides 2-6: five real ways, ONE per slide, numbered 1-5: change your environment first; build one keystone ' +
      'habit like daily training; cut the inputs frying your brain; keep one promise to yourself every single day; ' +
      'give it 90 days, not 9.\n' +
      'Slide 7 (The App): your Upshift slide (Upshift: #1 Productivity App) — how you cut the inputs frying your brain.\n' +
      'Slide 8 (CTA): blunt closer.',
  },
  {
    key: 'changed-at-21',
    label: 'How I changed my entire life in one year at 21',
    slides: 9,
    niche: 'a one-year full life turnaround at 21',
    audience: 'Young people who want a total turnaround!',
    body:
      'Slide 1 (Hook): the title, personal.\n' +
      'Slide 2 (Before): one blunt line on rock bottom at 21 — broke, unfit, scrolling all day.\n' +
      'Slides 3-7: what you actually did, in order, ONE per slide: fixed your sleep; started training every day; ' +
      'killed the 5-hour scroll; learned a skill that made money; swapped your circle for better people.\n' +
      'Slide 8 (The App): your Upshift slide (Upshift: #1 Productivity App) — how you killed the scroll.\n' +
      'Slide 9 (CTA): blunt closer.',
  },
  {
    key: 'six-month-plan',
    label: '6 month plan To become the best version of yourself',
    slides: 9,
    niche: 'a 6-month plan to become your best self',
    audience: 'People who want a real month-by-month plan, not vibes!',
    body:
      'Slide 1 (Hook): the title.\n' +
      'Slides 2-7: month by month, EXACTLY one month per slide, all six months in order — do not spend two slides on ' +
      'one month and do not stop before Month 6: Month 1 fix sleep, water and daily walks; Month 2 train 5x a week; ' +
      'Month 3 build one money skill; Month 4 dial in diet and physique; Month 5 fix your circle and social life; ' +
      'Month 6 lock it all in as identity, not effort.\n' +
      'Slide 8 (The App): your Upshift slide (Upshift: #1 Productivity App) — how you locked the scroll through those months.\n' +
      'Slide 9 (CTA): blunt closer.',
  },
  {
    key: 'change-yourself-2',
    label: 'The 5 best ways to change yourself',
    slides: 8,
    niche: 'changing yourself for good (identity-first take)',
    audience: 'People done being the old version of themselves!',
    body:
      'Slide 1 (Hook): the title.\n' +
      'Slides 2-6: five ways, ONE per slide, a DIFFERENT angle from any other change list: stop identifying with ' +
      'your old self; design your day so willpower is not even needed; remove temptation instead of resisting it; ' +
      'find people already living it; fall in love with boring consistency.\n' +
      'Slide 7 (The App): your Upshift slide (Upshift: #1 Productivity App) — you do not white-knuckle the scroll, ' +
      'you lock it.\n' +
      'Slide 8 (CTA): blunt closer.',
  },
  {
    key: 'aura-hobbies',
    label: 'Hobbies that will 10x your aura',
    slides: 9,
    niche: 'hobbies that raise your presence / aura',
    audience: 'People who want to walk into a room and feel different!',
    body:
      'Slide 1 (Hook): the title.\n' +
      'Slides 2-7: hobbies, ONE per slide, each with a one-line why: lifting or martial arts (you carry yourself ' +
      'different); reading (you speak with depth); an instrument (quiet confidence); solo travel or hiking; style ' +
      'and grooming treated as a craft; journaling for a calm, grounded presence.\n' +
      'Slide 8 is your Upshift slide (Upshift: #1 Productivity App) — nothing raises your aura while you are glued ' +
      'to a feed, so you lock it first.\n' +
      'Slide 9 (CTA): blunt closer.',
  },
  {
    key: 'confidence-habits',
    label: 'uncomfortable habits that will build extreme confidence',
    slides: 10,
    niche: 'uncomfortable habits that build real confidence',
    audience: 'People who want confidence that does not shake!',
    body:
      'Slide 1 (Hook): the title.\n' +
      'Slides 2-8: uncomfortable habits, ONE per slide — the point is they are HARD, not easy tips: hold eye ' +
      'contact; speak up first; take cold showers; train in a busy gym anyway; post the thing you are scared to; ' +
      'be the one who says the hard truth; sit with boredom instead of reaching for your phone.\n' +
      'Slide 9 (The App): your Upshift slide (Upshift: #1 Productivity App) — how you sit with boredom instead of ' +
      'grabbing your phone.\n' +
      'Slide 10 (CTA): blunt closer.',
  },
  {
    key: 'bruce-wayne',
    label: 'The Bruce Wayne Lifestyle',
    slides: 9,
    niche: 'building yourself in private, letting the results talk',
    audience: 'People who want to build in silence and let results talk!',
    body:
      'Slide 1 (Hook): the title.\n' +
      'Slide 2 (Idea): one line — become the person who trains in the shadows and shows up already finished.\n' +
      'Slides 3-7: the lifestyle, ONE per slide: train your body like it is a weapon; master your mind (read, sit ' +
      'in silence); build wealth and skills quietly; keep your goals off the internet; discipline over dopamine, ' +
      'always.\n' +
      'Slide 8 (The App): your Upshift slide (Upshift: #1 Productivity App) — you kill the scroll so you can build ' +
      'in silence.\n' +
      'Slide 9 (CTA): blunt closer.',
  },
  {
    key: 'become-great',
    label: 'How to become great',
    slides: 9,
    niche: 'what it actually takes to become great',
    audience: 'People who refuse to be average!',
    body:
      'Slide 1 (Hook): the title.\n' +
      'Slide 2 (Truth): one blunt line that great is boring, daily and lonely.\n' +
      'Slides 3-7: what it takes, ONE per slide: pick one thing and go obsessive; out-work the talented; guard your ' +
      'focus like it is sacred; embrace the reps everyone else skips; keep going when nobody claps.\n' +
      'Slide 8 (The App): your Upshift slide (Upshift: #1 Productivity App) — how you guard your focus.\n' +
      'Slide 9 (CTA): blunt closer.',
  },
  {
    key: 'rich-young',
    label: 'Rules to become rich young',
    slides: 10,
    niche: 'building wealth young through habits and skills',
    audience: 'Young people who want to build wealth early!',
    body:
      'Slide 1 (Hook): the title.\n' +
      'Slides 2-8: the rules, ONE per slide, numbered 1-7: learn a skill people actually pay for; sell before you ' +
      'feel ready; live below your means while you are broke; reinvest every early dollar into yourself; guard your ' +
      'time like it is money; surround yourself with builders; stop pouring hours into the feed and pour them into work.\n' +
      'Slide 9 (The App): your Upshift slide (Upshift: #1 Productivity App) — how you took those hours back from the feed.\n' +
      'Keep it to habits, skills, discipline and mindset — do NOT give specific investment or financial advice or ' +
      'name any investment.\n' +
      'Slide 10 (CTA): blunt closer.',
  },
  {
    key: 'fake-vs-real-rich',
    label: 'Fake Rich vs Real Rich For Men',
    slides: 8,
    niche: 'real wealth vs just looking rich',
    audience: 'Men done faking it who want the real thing!',
    body:
      'Slide 1 (Hook): the title.\n' +
      'Slides 2-6: ONE clean contrast per slide: fake rich leases the car, real rich owns his time; fake rich ' +
      'flexes online, real rich stays quiet; fake rich buys logos, real rich buys assets; fake rich looks busy, ' +
      'real rich is free; fake rich burns the night out, real rich builds in the morning.\n' +
      'Slide 7 is your Upshift slide (Upshift: #1 Productivity App) — real rich guards his attention, so he locks ' +
      'the scroll and spends the hours on what compounds.\n' +
      'Keep it about habits and mindset, not specific financial advice.\n' +
      'Slide 8 (CTA): blunt closer.',
  },
];

// ---- Viral slideshow presets (mined from top TikTok carousels) ------------
// Reverse-engineered from the accounts' actual viral photo slideshows (decks
// that hit 250k-2M views): exercise "tier lists", split ratings, contrarian
// "things to avoid", unconventional-habit lists, and "high-value" trait lists.
// These copy the STRUCTURE and the blunt, punchy, screenshot-bait voice that
// made them hit — which is deliberately DIFFERENT from the shared VIRAL_VOICE
// (complete conversational sentences). So they use their own voice block below.
//
// The single most repeated winning move in the source decks: a countdown that
// rates a POPULAR pick shockingly low (e.g. "Pull ups -1/10, waste of time")
// to bait comments, then lands on a 10/10 "no explanation needed" finisher, and
// slips ONE soft app plug into a "PRO TIP" slide near the end. Here that plug is
// Upshift, framed honestly (consistency/attention), never as a workout tracker.

const PUNCHY_VOICE =
  'Voice, Tone & Formatting (viral TikTok carousel style):\n' +
  'Blunt, confident, a little cocky, like a gym/self-improvement creator who KNOWS. Short punchy lines, not essays. ' +
  'UNLIKE a normal caption, here clipped fragments are GOOD: "Waste of time." / "No explanation needed." / ' +
  '"Trust me, I know ball." are exactly the vibe. Use gym/internet slang sparingly and naturally (cooked, ' +
  'demon, peak, S-tier, ykyk) — never forced.\n' +
  'Keep each slide skimmable in under 2 seconds: a short title line, then at most a line or two under it.\n' +
  'BANNED words/phrases (they scream AI): rediscover, embrace, unlock, journey, elevate, empower, "dive in", ' +
  '"in today\'s world", boost, foster, cultivate, nurture, "take back control", "rewire your brain", ' +
  '"say goodbye to", "level up your life", "game changer". No em-dashes. No markdown or bold. ' +
  'The app has NO community or forum — never reference other members.\n' +
  'HOOKS: any example hook below is ONLY inspiration for the angle — write your OWN fresh original hook, and vary ' +
  'it every time. Never copy an example word for word.';



// Default app-slide rule for clones whose source deck plugs a fitness tracker.
const DEFAULT_APP_NOTE =
  'THE APP SLIDE: the example plugs a fitness/tracking app (a "PRO TIP" slide, or an "[a tracking app]" line). In ' +
  'YOUR version keep that same slide in the same spot, but plug Upshift instead — one honest, first-person line that ' +
  'Upshift locks your phone and kills the mindless scroll so you actually stay consistent and show up to train. ' +
  'Brand it "Upshift". Never add an extra slide for it, never sound salesy, and name no other app.';

// A clone spec embeds a REAL viral deck (competitor app names already scrubbed
// to "[a tracking app]") and tells the model to reproduce it slide-for-slide,
// swapping only the specifics and turning the app slide into an Upshift plug.
interface CloneSpec {
  key: string;
  label: string;
  niche: string;
  audience: string | ((g: Gender) => string);
  views: string; // human view count of the source deck, for the prompt
  task: string; // what to vary vs. keep identical
  example: string[]; // the real deck, verbatim (one string per slide)
  appNote?: string; // override DEFAULT_APP_NOTE when the deck plugs differently
}

// Each CLONE_SPEC embeds a real viral deck (mined from the source accounts;
// competitor app names scrubbed to "[a tracking app]") so generations clone the
// exact hook, countdown, rating pattern and voice — only the specifics change,
// and the app slide becomes Upshift. `slides` is derived from example.length.
const CLONE_SPECS: CloneSpec[] = [
  // ---- Exercise "tier list" family (one per muscle) ----------------------
  {
    key: 'back-tierlist',
    label: 'DEMON back tier list',
    niche: 'ranking back exercises worst to best',
    audience: 'Lifters who want a bigger, thicker back!',
    views: '380k',
    task:
      'Keep it a BACK exercise tier list. Swap in a fresh mix of real back exercises and re-rank them, but keep the ' +
      'exact countdown-from-5 layout, the shock "-1/10 waste of time" on a popular pick (like pull ups), and the ' +
      '10/10 "no explanation needed" seal-rows-style finisher last.',
    example: [
      'How to build a DEMON back...',
      '5. Pull ups\n-1/10\n\nWaste of time. Hard to target the back and actually progress with weight',
      '4. Bent over rows\n3/10\n\nPretty bad unless you have PERFECT form',
      '3. Lat pulldown\n6.5/10\n\nYou need good mind-muscle connection but you can actually make good progress with these',
      '2. T-bar rows\n9/10\n\nAlmost perfect back movement, easy to progress',
      '1. SEAL ROWS\n11/10\n\nNo explanation needed... Highly effective',
      'PRO TIP\nTrack your workouts for progressive overload and consistency\n\n[a tracking app]',
    ],
  },
  {
    key: 'biceps-tierlist',
    label: 'Peak biceps tier list',
    niche: 'ranking biceps exercises worst to best',
    audience: 'Lifters who want bigger biceps!',
    views: '230k',
    task:
      'Keep it a BICEPS exercise tier list. Swap in a fresh set of real curl variations and re-rank them, keeping the ' +
      'countdown-from-5, a "-1/10 not even a bicep exercise" shock pick (like hammer curls hitting forearms), and a ' +
      '10/10 "no explanation needed" finisher.',
    example: [
      'top 5 PEAK exercises for BICEPS',
      '5. Hammer curls\n-1/10\n\nNot even a bicep exercise, gains go straight to the forearms',
      '4. Preacher curls\n3/10\n\nGood tension, but can be really dangerous',
      '3. EZ bar curls\n5.5/10\n\nThese are decent but they can give you forearm splints...',
      '2. Bayesian curls\n8.2/10\n\nNot many people know about these, but they have great ROM and stretch',
      '1. Snake curls\n10/10\n\nNo explanation needed... Highly efficient',
      'PRO TIP\nTrack your workouts for progressive overload and consistency\n\n[a tracking app]',
    ],
  },
  {
    key: 'triceps-tierlist',
    label: 'S-Tier triceps exercises',
    niche: 'ranking triceps exercises',
    audience: 'Lifters who want bigger arms!',
    views: '300k',
    task:
      'Keep it a TRICEPS exercise tier list. Swap in a fresh set of real triceps movements and re-rank, keeping the ' +
      'cocky slide 2 ("Trust me I know ball"), the ratings under each exercise, and a 10/10 finisher with a one-liner.',
    example: [
      'only S-Tier triceps exercises you need',
      'Trust me I know ball',
      '1. Triceps pushdowns\n5/10\nYou can go really heavy at this one, but unstable',
      '2. Skullcrusher\n5.5/10\nNot for beginners, can be dangerous but good movement to hit your long head',
      '3. Triceps extensions overhead\n7/10\nAlso good to hit your long head, easier to stabilize',
      '4. Weighted dips\n7.5/10\nVery good exercise to hit your full triceps, but also targets chest and shoulders, no isolation',
      '5. Katana extensions\n10/10\nDon\u2019t need to say more',
      'PRO TIP\nFind out your triceps muscle rank and track it for progressive overload\n\n[a tracking app]',
    ],
  },
  {
    key: 'calves-tierlist',
    label: 'Peak calves tier list',
    niche: 'ranking calf exercises worst to best',
    audience: 'Lifters who want to grow stubborn calves!',
    views: '1.3M',
    task:
      'Keep it a CALVES exercise tier list. Swap in a fresh set of real calf movements and re-rank, keeping the cocky ' +
      'slide 2, the joke "-1/10" pick that does not even hit calves, and the 10/10 finisher.',
    example: [
      'top 5 PEAK exercises for CALVES',
      'trust me, I know where I started...',
      '5. BENCH PRESS -1/10\n\nDoesn\u2019t hit the calves. If you\u2019re still skipping leg days you\u2019re cooked',
      '4. Seated calf raise 2/10\n\nAbsolutely horrible, trains your soleus not calves',
      '3. Dumbbell Calf Raise 6/10\n\nOnly good for beginners. impossible to progress once you\u2019re advanced',
      '2. Hack Calf Raise 8.5/10\n\nOne of the best calf exercise you can do, just 1 better option',
      '1. Donkey calf raise 10/10\n\nNo explanation needed, just train hard',
      'PRO TIP\nTrack your progress, find out your potential and weak points so you can focus on them\n\n[a tracking app]',
    ],
  },
  {
    key: 'abs-tierlist',
    label: 'Peak abs tier list (no equipment)',
    niche: 'ranking ab exercises worst to best',
    audience: 'People who want visible abs with no equipment!',
    views: '290k',
    task:
      'Keep it a bodyweight ABS exercise tier list. Swap in a fresh set of real no-equipment ab movements and re-rank, ' +
      'keeping the "-1/10" shock pick (like planks), and the 10/10 "no explanation needed" finisher.',
    example: [
      'top 5 PEAK exercises for ABS\n(NO EQUIPMENT)',
      '5. Plank\n-1/10\n\nAbsolutely horrible, trains your core not abs',
      '4. Crunches\n3/10\n\nThere\u2019s way better variants, don\u2019t waste your time with these',
      '3. Leg raises\n6/10\n\nSolid movement if done correctly, won\u2019t see results from JUST these',
      '2. V-ups\n8/10\n\nReally solid exercise, targets the abs very well',
      '1. Frog crunch\n10/10\n\nNo explanation needed... Highly efficient',
      'PRO TIP\nTrack your workouts for progressive overload and consistency\n\n[a tracking app]',
    ],
  },
  {
    key: 'chest-tierlist',
    label: 'Peak chest tier list',
    niche: 'ranking chest exercises worst to best',
    audience: 'Lifters who want a bigger chest!',
    views: '18k',
    task:
      'Keep it a CHEST exercise tier list. Swap in a fresh set of real chest movements and re-rank, keeping the "-1/10" ' +
      'shock pick (like push ups), and the 10/10 "no explanation needed" finisher.',
    example: [
      'top 5 PEAK exercises for CHEST',
      '5. Push ups\n-1/10\nIt\u2019s an OG but let\u2019s be real, it barely even hits the chest and it\u2019s hard to progress',
      '4. Cable flys\n3/10\nThere are way better fly variants, don\u2019t waste your time on these',
      '3. Dips\n6/10\nWith correct form you can achieve a decent chest from these',
      '2. Guillotine press\n8/10\nIncredible mind muscle connection if you can control the eccentric.',
      '1. Pec dec fly\n10/10\nHighly efficient, no explanation needed...',
      'PRO TIP\nTrack your workouts for progressive overload and consistency\n\n[a tracking app]',
    ],
  },
  {
    key: 'quads-tierlist',
    label: 'Key quad exercises tier list',
    niche: 'ranking quad exercises worst to best',
    audience: 'Lifters who want to build bigger legs!',
    views: '33k',
    task:
      'Keep it a QUADS exercise tier list. Swap in a fresh set of real quad movements and re-rank, keeping the cocky ' +
      'slide 2, ratings under each, and a high-rated finisher.',
    example: [
      'KEY exercises to build your QUADRICEPS',
      'trust me, I know where I started...',
      '1. Hack squat\n1/10\nVery harsh on the knees and not ideal for hypertrophy',
      '2. Leg press\n4/10\nMost of the load ends up going straight to the glutes.',
      '3. Leg extension\n6.5/10\nWe\u2019ve all done it. Great for getting an insane pump in the quadriceps.',
      '4. Pendulum squats\n8/10\nYou can literally feel the fibers stretch and contract. Crazy ROM',
      '5. Sissy squat\n9.5/10\nEvery program needs this exercise if you want dense and thick legs.',
      'PRO TIP\nThe best quad exercises won\u2019t grow your legs if you never progress them. Track your reps and weight!!\n\n[a tracking app]',
    ],
  },
  // ---- Split / program family --------------------------------------------
  {
    key: 'rating-splits',
    label: 'Rating gym splits I\u2019ve tried',
    niche: 'rating training splits worst to best',
    audience: 'Lifters trying to pick the right training split!',
    views: '2.1M',
    task:
      'Keep it a rating of training splits with a 2-3 line paragraph verdict each, building UP to the 10/10 that ' +
      '"changed everything". Swap in a fresh set of real splits and honest verdicts. Keep the cocky slide 2. This deck ' +
      'has NO app slide in the example \u2014 do not add one; instead follow the appNote below.',
    example: [
      'rating splits I\u2019ve tried as a gym rat who transformed his body',
      'yea ik what works',
      'PPL: 4/10\nThis is what almost everyone starts with. And yeah, it works at first... because literally anything works when you\u2019re new. Simple split, easy to follow, but the train-to-rest ratio is kinda trash.',
      'PPL x Arnold: 5/10\nBasically PPL with extra pump addiction. Fun? Yeah. Better pump? For sure. But the same recovery problem is still there. Looks elite on paper, feels cooked after a few weeks.',
      'FBEOD: 8/10\nFrequency is insane, results can be insane, but I personally hated training legs and upper body in the same session. Optimal? Probably. Enjoyable? Not for me.',
      'U/L: 10/10\nThis split changed everything for me. Frequency is perfect, recovery actually makes sense, and the physique progress was stupid. People say the workouts are too long, but that\u2019s because they\u2019re doing junk volume. Cut the useless sets. This is the goat split.',
    ],
    appNote:
      'This example has NO app slide. Do not add an extra slide. Instead, work ONE short honest Upshift line into the ' +
      'final winning-split slide \u2014 that none of it matters if you skip sessions, and Upshift is how you stay consistent by ' +
      'locking your phone and killing the scroll. Keep it to one sentence, never salesy, name no other app.',
  },
  {
    key: 'splits-tierlist',
    label: 'Top 5 gym splits ranked',
    niche: 'ranking training splits worst to best',
    audience: 'Lifters choosing a split that actually works!',
    views: '25k',
    task:
      'Keep it a splits tier list with short ratings (not long paragraphs). Swap in a fresh set of real splits and ' +
      're-rank, keeping the savage low rating on the bro split and the 10/10 winner that "speaks for itself".',
    example: [
      'top 5 gym splits that actually work...',
      '5. Bro split\n-100/10\n\nIf you\u2019re still doing this, you\u2019re just wasting time',
      '4. PPL\n3/10\n\nRan this when I first started lifting and never went back',
      '3. Arnold split\n5/10\n\nIt\u2019s decent, but progressing gets way harder later on',
      '2. Heavy duty split\n8/10\n\nProbably the most fun split and hits everything perfectly, but one is still better',
      '1. PHAT split\n10/10\n\nThis one speaks for itself... I\u2019ve seen crazy results running this split',
      'PRO TIP:\nTrack your lifts for progressive overload if you actually want to build muscle faster\n\n[a tracking app]',
    ],
  },
  {
    key: 'ul-routine',
    label: 'My full U/L split routine',
    niche: 'sharing a full upper/lower routine',
    audience: 'Lifters who want a proven weekly routine!',
    views: '59k',
    task:
      'Keep the exact layout: hook, cocky slide 2, a weekly overview slide, then one slide per training day listing ' +
      'exercises with sets x reps, ending on the tracking slide. Swap in a fresh but realistic routine (real exercises, ' +
      'sensible sets/reps). Keep every day on its own slide.',
    example: [
      'the best U/L split I\u2019ve tried as a gym rat who transformed his body',
      'yea, ik what I\u2019m talking',
      'here\u2019s how my week looks:\n\nMon: Upper A\nTue: Lower A\nWed: light cardio for recovery\nThu: Upper B\nFri: Lower B\nSat/Sun: rest, conditioning',
      'Upper A:\n\nBench Press: 3x6\nWeighted Pull-Up: 3x8\nOverhead Press: 2x6\nChest Supported Row: 3x8\nIncline DB Press: 2x10\nLateral Raise: 3x18\nDB Curl: 2x12',
      'Lower A:\n\nBack Squat: 3x6\nRomanian Deadlift: 3x6\nLeg Press: 2x10\nLeg Curl: 2x12\nStanding Calf Raise: 3x10\nHanging Leg Raise: 3x15',
      'Upper B:\n\nIncline Bench Press: 3x10\nBarbell Row: 3x10\nWeighted Dip: 2x10\nLat Pulldown: 2x12\nShoulder Press: 2x12\nRear Delt Fly: 2x20\nHammer Curl: 2x15',
      'Lower B:\n\nDeadlift: 3x8\nFront Squat: 3x8\nBulgarian Split Squat: 3x12\nLeg Curl: 2x12\nCalf Raise: 3x15\nAb Wheel: 3x20',
      'I track my workouts so I know exactly what I did last time and keep building on it.\n\n[a tracking app]',
    ],
  },
  // ---- Other proven gym formats ------------------------------------------
  {
    key: 'regret-exercises',
    label: 'Exercises I regret not doing earlier',
    niche: 'underrated exercises you should be doing',
    audience: 'Lifters missing out on the best exercises!',
    views: '980k',
    task:
      'Keep the format: a numbered list of underrated exercises, each with one hyped line about the results it gave ' +
      'you. Swap in a fresh set of real exercises and results. End on the tracking slide.',
    example: [
      'Exercises I REGRET not doing earlier',
      '1. Demon rows\nThese blew up my back faster than any other back exercise I\u2019ve tried',
      '2. Frog crunch\nGreatest ab movement by far, I got defined abs with these in 2 months',
      '3. JM press\nYou can literally feel every fiber in your tricep contracting, also go slow on these',
      '4. Kitty curls\nSpeaks for itself...',
      'PRO TIP\nTrack your workouts for progressive overload and consistency\n\n[a tracking app]',
    ],
  },
  {
    key: 'changed-physique',
    label: 'Exercises that changed my physique',
    niche: 'the exercises that made the biggest difference',
    audience: 'Lifters who want the highest-impact exercises!',
    views: '71k',
    task:
      'Keep the format: cocky slide 2, then a numbered list of exercises each with a 2-line why. Swap in a fresh set ' +
      'of real high-impact exercises. End on the tracking slide.',
    example: [
      'Top 5 exercises that actually changed my physique',
      'trust me, ik ball',
      '1. Cuffed rear delt flies\n\nEasy way to build that 3D shoulder look and clean up your posture. Small muscle, big difference.',
      '2. Back extensions\n\nA weak lower back causes more problems than people think. Do these every leg day. Simple, useful, stays in the rotation.',
      '3. Incline tricep pushdowns\n\nGreat for stability and easy to progressively overload. Setup takes a minute, but it\u2019s worth it.',
      '4. Chest-supported T-bar rows\n\nOne of the best moves for a thick, strong back. Lats are cool, but you need upper back thickness too.',
      '5. Heavy ab crunches\n\nHeavy abs won\u2019t give you a blocky waist. They\u2019ll make your core stronger and help your big lifts too.',
      'PRO TIP\nTrack your workouts for progressive overload\n\n[a tracking app]',
    ],
  },
  {
    key: 'get-big',
    label: 'How to actually get BIG',
    niche: 'blunt rules to build muscle',
    audience: 'Lifters who want to actually grow!',
    views: '490k',
    task:
      'Keep the blunt, half-meme numbered-tips format with very short slides. Swap in a fresh set of punchy real ' +
      '(and a couple cheeky) muscle-building tips. Keep it fast and funny, not preachy.',
    example: [
      'How to actually get BIG in the gym',
      '1. Lift heavy\n\nvery very very\nvery very very\n\nHEAVY',
      '2. Eat MORE PROTEIN',
      '3. Train to failure in each workout',
      '4. Cardio after every workout\n(ifykyk)',
      '5. Get your gym rank up\n\n[a tracking app]',
      '6. Pick a split and actually stick to it',
      '7. Remember that someone else is doing better than you',
    ],
  },
  {
    key: 'avoid-muscle',
    label: '5 things to AVOID to gain muscle',
    niche: 'mistakes that kill your gym progress',
    audience: 'Lifters whose gains are stalling!',
    views: '80k',
    task:
      'Keep the contrarian "don\u2019t do X" numbered format with short blunt slides. Swap in a fresh set of real ' +
      '"don\u2019t do this, do that" mistakes. Keep one slide as the tracking slide.',
    example: [
      '5 things to AVOID if you want to gain muscle',
      '1. Don\u2019t do 8-12 reps, just do 6-8 reps',
      '2. Don\u2019t undereat\n2.5k cals, 180g protein minimum',
      '3. Don\u2019t use PPL, use an Arnold split\nDay 1: chest/back\nDay 2: arms/shoulders\nDay 3: legs\nDay 4,5,6: repeat',
      '4. Don\u2019t guess, track your progress\n\n[a tracking app]',
      '5. Don\u2019t forget how you felt that day',
    ],
  },
  {
    key: 'wish-i-knew',
    label: '8 things I wish I knew before lifting',
    niche: 'lessons for your first year of lifting',
    audience: 'Newer lifters who want to skip the mistakes!',
    views: '480k',
    task:
      'Keep the format: hook, then one slide per body part / topic with 2-3 tight bullet-style lines of real advice, ' +
      'ending on a tracking slide. Swap in fresh, genuinely useful lines per topic. Keep the bullets punchy.',
    example: [
      '8 things I wish I knew before I started lifting',
      '1. Triceps\n\n- Train them heavy\n- You only need 2 exercises to properly train them (a tricep extension and JM press)',
      '2. Chest\n\n- All you need is 1 incline and 1 fly movement if you train hard\n- Never take bench press to failure, fatigue catches up and injury is inevitable',
      '3. Back\n\n- More reps and lower weights, technique is everything for a crazy back\n- Learn the muscles in your back and hit them all individually',
      '4. Biceps\n\n- Cable exercises are best, you need constant tension\n- Spider curls and incline curls are the only exercises you need\n- Train forearms, people always see them',
      '5. Legs\n\n- Push quads, hamstrings and calves to failure\n- Push your last set hard\n- One leg day a week is enough if you train hard',
      '6. Abs\n\n- Abs twice a week minimum, they recover fast\n- Treat them like any other muscle, push them to failure',
      '7. Shoulders\n\n- Flex your lats on any lateral raise and go high reps\n- Go heavy on shoulder press\n- Do not sleep on rear delts if you want to look 3D',
      '8. Tracking\n\n- You can\u2019t make optimal progress working out blindly\n- Use an app that tells you exactly what weight and reps to hit\n\n[a tracking app]',
    ],
  },
  {
    key: 'gym-apps-ranking',
    label: 'Gym apps ranked (worst to best)',
    niche: 'ranking gym/discipline apps worst to best',
    audience: 'Gym people looking for the app that actually helps!',
    views: '480k',
    task:
      'Keep the "apps ranked worst to best" countdown format. Rate 4 unnamed generic rival apps low to mid (describe ' +
      'them by weakness, e.g. "the one that\u2019s basically just a rep counter", "the paid one hiding everything behind a ' +
      'subscription") \u2014 DO NOT name any real competitor app. This is the ONE format where the winner IS the app: make ' +
      'the 1. slide land on Upshift at 10/10 as the free GOAT.',
    example: [
      'Gym apps ranked\n(worst to best)',
      '5. the forearm one\n-1/10\n\nsomehow only tracks one thing, useless',
      '4. the basic free one\n2/10\n\nimpossible to actually progress with, just get a plan',
      '3. the popular tracker\n7/10\n\ndecent for logging workouts but limited and it does nothing about your phone',
      '2. the paid one\n9/10\n\nmore features, but everything good is behind a subscription',
      '1. Upshift\n10/10\n\nFREE\nlocks your phone so you actually train\nkills the mindless scroll\nkeeps you consistent\n\nthe goat',
    ],
    appNote:
      'The winner slide already IS the Upshift slide (rated 10/10). Keep Upshift as number 1, free, framed as locking ' +
      'your phone and killing the scroll so you stay consistent. Do not add another app slide and name no real rival.',
  },
  // ---- Self-improvement family (jaidenfitt) ------------------------------
  {
    key: 'weird-advice',
    label: 'Weird advice that actually works',
    niche: 'unconventional self-improvement habits',
    audience: 'People who want habits that actually change something!',
    views: '260k',
    task:
      'Keep the format: a numbered list of weird-but-real habits, each with a short bold title and 2-3 tiny lines on ' +
      'why it works. Swap in a fresh set of unconventional habits. Keep the "put your phone across the room" style ' +
      'habit as the Upshift slide.',
    example: [
      'weird advice that actually works',
      '1. Brush your teeth with your non-dominant hand\n\nFeels stupid at first, but it forces you to focus.\n\nSmall way to break autopilot.',
      '2. Put your phone across the room\n\nYou have to stand up to shut it off.\n\nMakes the snooze button way less tempting.',
      '3. Talk to yourself in the mirror\n\nNot fake hype.\nJust stop speaking to yourself like you\u2019re your own enemy.',
      '4. Do something badly on purpose\n\nPost the video.\nTry the new thing.\nProgress gets easier when you stop chasing perfect.',
      '5. Write down your worries then throw them away\n\nGet it out of your head and onto paper.\nNot every thought deserves to stay all day.',
      '6. Wear the same kind of outfit every day\n\nLess time picking clothes.\nSave that energy for stuff that matters.',
      '7. Lock the mindless scroll\n\nThe endless feed eats the day you meant to use.\n\n[a tracking app]',
      '8. Micro-gratitude before you eat\n\nName one thing you\u2019re grateful for before every meal.\nKeeps you off autopilot.',
    ],
    appNote:
      'Slide 7 is the Upshift slide: keep it as a habit about killing the mindless scroll / making the phone hard to ' +
      'reach, and name Upshift as how you do it (it locks your phone and blocks the scroll). One honest line, no other app.',
  },
  {
    key: 'high-value-man',
    label: '10 traits of a high-value man',
    niche: 'traits that make you respected and high-value',
    audience: (g) =>
      g === 'women' ? 'Women who want to become genuinely high-value!' : 'Guys who want to become a genuinely high-value man!',
    views: '50k',
    task:
      'Keep the format EXACTLY: a numbered trait, then a TRIAD of three tiny concrete examples on their own lines, then ' +
      'one line on why it matters. Swap in a fresh set of grounded traits. Keep the "train your body / keep a promise ' +
      'to yourself" trait as the Upshift slide. For a women\u2019s pack, reframe it for women (still grounded, not hustle-bro).',
    example: [
      '10 traits that make you a high-value man',
      '1. Be the one people call first\n\nBroken car.\nFlat tire.\nBad day.\n\nIt\u2019s not about attention. It\u2019s about being useful when needed.',
      '2. Make your family worry less\n\nHandle your money.\nAnswer the calls.\nKeep your word.\n\nYour people should feel at peace knowing you\u2019ve got yourself together.',
      '3. Learn a skill you can\u2019t be ignored for\n\nCooking.\nMechanics.\nWoodworking.\n\nBuilding things with your hands changes the way you move.',
      '4. Get comfortable making decisions\n\nPick the place.\nChoose the route.\nMake the call.\n\nNobody needs perfect decisions, just someone willing to make one.',
      '5. Train your body with intention\n\nWork out.\nProtect your focus.\nRespect recovery.\n\nUpshift keeps your progress on track by locking the scroll. Strength builds confidence you carry anywhere.',
      '6. Know people\u2019s names\n\nThe janitor.\nThe waiter.\nThe receptionist.\n\nRemembering names earns more respect than trying to impress.',
      '7. Walk into rooms calmly\n\nOpen the door.\nSlow down.\nLook around.\n\nYou don\u2019t need to act important, just don\u2019t move like you\u2019re panicking.',
      '8. Be useful in an emergency\n\nLearn CPR.\nChange a tire.\nUse a fire extinguisher.\n\nReal confidence is knowing you can help when it matters.',
      '9. Keep one promise to yourself daily\n\nMake it small.\nA walk.\nOne chapter.\n\nSelf-respect comes from doing what you said you would.',
      '10. Be okay being the beginner\n\nTake the class.\nAsk questions.\nLook inexperienced.\n\nYour ego slows you down more than a lack of talent.',
    ],
    appNote:
      'Slide 5 is the Upshift slide (the "train your body / protect your focus" trait). Keep Upshift named there as how ' +
      'you guard your discipline by locking the phone and killing the scroll. One honest line, no other app.',
  },
  {
    key: 'love-yourself',
    label: 'How to start loving yourself again',
    niche: 'small steps back to self-respect',
    audience: 'People at a low point who want to feel like themselves again!',
    views: '345k',
    task:
      'Keep the gentle, minimal format: a few-word step per slide, ending on a quiet, almost tender sign-off (like ' +
      '"take care of yourself"), NOT a hype CTA. Swap in warm, simple steps. This deck has no app slide \u2014 follow the appNote.',
    example: [
      'How to start loving yourself again',
      '1. Train your body',
      '2. Get outside more',
      '3. Protect your time',
      '4. Eat good food',
      '5. Rest your body and mind',
      'You\u2019ll probably never see me again\n\nTake care of yourself',
    ],
    appNote:
      'No dedicated app slide. Weave ONE soft Upshift mention into the "protect your time" step \u2014 that Upshift keeps you ' +
      'off the doomscroll so the other steps actually happen. Keep it gentle and one sentence, name no other app, and ' +
      'keep the tender closer as the final slide.',
  },
];

const cloneBuilder = (s: CloneSpec): PresetBuilder => (g) => ({
  key: s.key,
  label: s.label,
  slides: s.example.length,
  niche: s.niche,
  audience: typeof s.audience === 'function' ? s.audience(g) : s.audience,
  styleMemory:
    `${PUNCHY_VOICE}${PERSONA(g)}\n\n` +
    'You are cloning ONE specific viral TikTok slideshow. Reproduce its format EXACTLY: the same number of slides, the ' +
    'same slide-by-slide structure, the same numbering/countdown, the same rating pattern, the same short line length, ' +
    `and the same blunt voice. This is a proven ~${s.views}-view deck.\n\n` +
    'REAL VIRAL EXAMPLE (study it, then make your own version just as tight):\n' +
    s.example.map((t, i) => `--- Slide ${i + 1} ---\n${t}`).join('\n') +
    `\n\nYOUR TASK: ${s.task}\n\n` +
    `Output EXACTLY ${s.example.length} slides in the same order and shape as the example. Keep the ratings, the ` +
    'shock-low pick, and the "no explanation needed" style finisher wherever the example uses them. Do NOT copy the ' +
    'example\u2019s exact words \u2014 make it a fresh version that could sit next to it as another post from the same account.\n\n' +
    (s.appNote || DEFAULT_APP_NOTE),
});


const selfBuilder = (s: SelfSpec): PresetBuilder => (g) => ({
  key: s.key,
  label: s.label,
  slides: s.slides,
  niche: s.niche,
  audience: s.audience,
  styleMemory:
    `${VIRAL_VOICE}${PERSONA(g)}${UPSHIFT_RULE}\n\n` +
    `Hook: slide 1 opens on this exact topic titled "${s.label}" — keep it almost word for word (keep any count/number). ` +
    'This overrides the "write your own hook" note above.\n\n' +
    `SLIDE BUDGET (strict): produce EXACTLY ${s.slides} slides. Every numbered item/step/month below gets its OWN ` +
    'single slide — never split one item across two slides, and never drop the later ones. The Upshift slide and the ' +
    'CTA are their own separate slides on top of the items. If space is tight, tighten the wording, do not cut items.\n\n' +
    'Structure & Flow (specific to THIS topic — never fall back to a generic template):\n' +
    s.body,
});

// Quit-habit presets first, then the self-improvement family, then the viral
// slideshow formats mined from top TikTok carousel accounts.
const ALL_BUILDERS: PresetBuilder[] = [
  ...BUILDERS,
  ...SELF_SPECS.map(selfBuilder),
  ...CLONE_SPECS.map(cloneBuilder),
];

// Build the preset list for a given pack. Defaults to the men's pack.
export function getQuitPresets(gender: Gender = 'men'): QuitPreset[] {
  return ALL_BUILDERS.map((build) => build(gender));
}

// Back-compat: the default (men's) pack.
export const QUIT_PRESETS: QuitPreset[] = getQuitPresets('men');
