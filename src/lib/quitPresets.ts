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
    slides: 10,
    niche: 'stop wasting your life / self-discipline',
    audience: 'People who feel their life is quietly slipping away!',
    body:
      'Slide 1 (Hook): the title, personal.\n' +
      'Slides 2-9: eight blunt, specific rules, ONE per slide, numbered 1-8: wake at the same time with no snooze; ' +
      'do the hardest thing first before your brain talks you out of it; stop waiting to feel motivated; train your ' +
      'body 4-5x a week; read instead of watching other people live; cut the people who make you smaller; kill the ' +
      'endless scroll; track your days so a week never disappears again.\n' +
      'The "kill the endless scroll" rule (rule 7) is your ONE Upshift slide (Upshift: #1 Productivity App).\n' +
      'Slide 10 (CTA): blunt closer (e.g. "Screenshot this. Start rule 1 today.").',
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
    slides: 9,
    niche: 'making your twenties count',
    audience: "People in their 20s who don't want to waste them!",
    body:
      'Slide 1 (Hook): the title.\n' +
      'Slides 2-8: the real lessons, one per slide: your 20s are for building, not coasting; skills beat comfort; ' +
      'your body will never be easier to build than now; save and invest early even if it is tiny; pick friends who ' +
      'are going somewhere; date on purpose instead of drifting; stop trading whole years for the scroll.\n' +
      'The "stop trading years for the scroll" slide is your Upshift slide (Upshift: #1 Productivity App).\n' +
      'Slide 9 (CTA): blunt closer.',
  },
  {
    key: 'mental-sentences',
    label: '8 Sentences That Make You Level Up Mentally',
    slides: 10,
    niche: 'mindset shifts / one-line mental sentences',
    audience: 'People who want to think sharper and stronger!',
    body:
      'Slide 1 (Hook): the title.\n' +
      'Slides 2-9: eight short, screenshot-worthy sentences, ONE per slide, no explanation needed — true and a ' +
      'little uncomfortable: "Discipline is just self-respect in action." / "No one is coming to save you." / ' +
      '"Boredom is where discipline is built." / "You are the average of what you repeat." / "Comfort is the ' +
      'slowest way to lose." / "Your phone is spending your life for you." / "Nobody remembers the day you started, ' +
      'only that you did." / "You do not need motivation, you need to begin."\n' +
      'The "your phone is spending your life for you" sentence is your Upshift slide (Upshift: #1 Productivity App), ' +
      'with one line under it on how the app takes that time back.\n' +
      'Slide 10 (CTA): blunt closer.',
  },
  {
    key: 'signs-make-it',
    label: "5 signs you're going to make it",
    slides: 7,
    niche: "signs you're on the right path",
    audience: "People grinding who need to know it's working!",
    body:
      'Slide 1 (Hook): the title.\n' +
      'Slides 2-6: five quiet signs, one per slide: you have started saying no; boring routines feel good now; you ' +
      'are not addicted to your phone anymore; you keep the promises you make to yourself; you are fine being alone ' +
      'and working while everyone else parties.\n' +
      'The "not addicted to your phone anymore" sign is your Upshift slide (Upshift: #1 Productivity App) — how you ' +
      'got there.\n' +
      'Slide 7 (CTA): blunt closer.',
  },
  {
    key: 'stop-wasting-7',
    label: '7 rules to stop wasting your life',
    slides: 9,
    niche: 'stop wasting your life / discipline (harder-edged take)',
    audience: 'People done wasting their potential!',
    body:
      'Slide 1 (Hook): the title.\n' +
      'Slides 2-8: seven blunt rules, ONE per slide, numbered 1-7, DIFFERENT flavor from any other list: protect ' +
      'your mornings; stop consuming and start creating; make discomfort a daily habit; audit who you spend time ' +
      'with; get the apps that eat your day off your back; measure progress every week; never break a promise to ' +
      'yourself twice.\n' +
      'The "apps that eat your day" rule is your Upshift slide (Upshift: #1 Productivity App) — instead of relying ' +
      'on willpower you lock them until your work is done.\n' +
      'Slide 9 (CTA): blunt closer.',
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
    slides: 11,
    niche: 'living with intention / a personal code',
    audience: 'People who want to live like their time actually matters!',
    body:
      'Slide 1 (Hook): the title.\n' +
      'Slides 2-10: nine codes to live by, ONE per slide, numbered 1-9: your word is law; train the body you were ' +
      'given; protect your attention like your life depends on it; do hard things on purpose; help without being ' +
      'asked; stop numbing and start feeling; build something that outlasts you; forgive fast and move faster; ' +
      'never waste a day you can never get back.\n' +
      'The "protect your attention" code is your Upshift slide (Upshift: #1 Productivity App).\n' +
      'Slide 11 (CTA): blunt closer.',
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
    slides: 8,
    niche: 'using hard seasons to come out ahead',
    audience: 'People in a brutal season who refuse to quit!',
    body:
      'Slide 1 (Hook): the title, personal.\n' +
      'Slide 2 (Truth): one blunt line that the struggle is the point, not a detour.\n' +
      'Slides 3-7: the moves, one per slide: show up on the worst days; shrink the goal down to just today; use the ' +
      'pain as fuel instead of an excuse; cut every comfort keeping you soft; keep going long after everyone else ' +
      'stopped.\n' +
      'The "cut every comfort" slide is your Upshift slide (Upshift: #1 Productivity App) — killing the scroll was ' +
      'the first comfort you cut.\n' +
      'Slide 8 (CTA): blunt closer.',
  },
  {
    key: 'change-yourself',
    label: '5 best ways to change yourself',
    slides: 7,
    niche: 'genuinely changing yourself for the better',
    audience: 'People ready to actually change, not just talk about it!',
    body:
      'Slide 1 (Hook): the title.\n' +
      'Slides 2-6: five real ways, ONE per slide, numbered 1-5: change your environment first; build one keystone ' +
      'habit like daily training; cut the inputs frying your brain; keep one promise to yourself every single day; ' +
      'give it 90 days, not 9.\n' +
      'The "cut the inputs frying your brain" way is your Upshift slide (Upshift: #1 Productivity App).\n' +
      'Slide 7 (CTA): blunt closer.',
  },
  {
    key: 'changed-at-21',
    label: 'How I changed my entire life in one year at 21',
    slides: 8,
    niche: 'a one-year full life turnaround at 21',
    audience: 'Young people who want a total turnaround!',
    body:
      'Slide 1 (Hook): the title, personal.\n' +
      'Slide 2 (Before): one blunt line on rock bottom at 21 — broke, unfit, scrolling all day.\n' +
      'Slides 3-7: what you actually did, in order, one per slide: fixed your sleep; started training every day; ' +
      'killed the 5-hour scroll; learned a skill that made money; swapped your circle for better people.\n' +
      'The "killed the scroll" slide is your Upshift slide (Upshift: #1 Productivity App).\n' +
      'Slide 8 (CTA): blunt closer.',
  },
  {
    key: 'six-month-plan',
    label: '6 month plan To become the best version of yourself',
    slides: 8,
    niche: 'a 6-month plan to become your best self',
    audience: 'People who want a real month-by-month plan, not vibes!',
    body:
      'Slide 1 (Hook): the title.\n' +
      'Slides 2-7: month by month, ONE month per slide: Month 1 fix sleep, water and daily walks; Month 2 train 5x ' +
      'a week and lock the scroll; Month 3 build one money skill; Month 4 dial in diet and physique; Month 5 fix ' +
      'your circle and social life; Month 6 lock it all in as identity, not effort.\n' +
      'The Month 2 slide names Upshift (Upshift: #1 Productivity App) as how you lock the scroll.\n' +
      'Slide 8 (CTA): blunt closer.',
  },
  {
    key: 'change-yourself-2',
    label: 'The 5 best ways to change yourself',
    slides: 7,
    niche: 'changing yourself for good (identity-first take)',
    audience: 'People done being the old version of themselves!',
    body:
      'Slide 1 (Hook): the title.\n' +
      'Slides 2-6: five ways, ONE per slide, a DIFFERENT angle from any other change list: stop identifying with ' +
      'your old self; design your day so willpower is not even needed; remove temptation instead of resisting it; ' +
      'find people already living it; fall in love with boring consistency.\n' +
      'The "remove temptation instead of resisting it" way is your Upshift slide (Upshift: #1 Productivity App) — ' +
      'you do not white-knuckle the scroll, you lock it.\n' +
      'Slide 7 (CTA): blunt closer.',
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
    slides: 9,
    niche: 'uncomfortable habits that build real confidence',
    audience: 'People who want confidence that does not shake!',
    body:
      'Slide 1 (Hook): the title.\n' +
      'Slides 2-8: uncomfortable habits, ONE per slide — the point is they are HARD, not easy tips: hold eye ' +
      'contact; speak up first; take cold showers; train in a busy gym anyway; post the thing you are scared to; ' +
      'be the one who says the hard truth; sit with boredom instead of reaching for your phone.\n' +
      'The "sit with boredom instead of your phone" habit is your Upshift slide (Upshift: #1 Productivity App).\n' +
      'Slide 9 (CTA): blunt closer.',
  },
  {
    key: 'bruce-wayne',
    label: 'The Bruce Wayne Lifestyle',
    slides: 8,
    niche: 'building yourself in private, letting the results talk',
    audience: 'People who want to build in silence and let results talk!',
    body:
      'Slide 1 (Hook): the title.\n' +
      'Slide 2 (Idea): one line — become the person who trains in the shadows and shows up already finished.\n' +
      'Slides 3-7: the lifestyle, one per slide: train your body like it is a weapon; master your mind (read, sit ' +
      'in silence); build wealth and skills quietly; keep your goals off the internet; discipline over dopamine, ' +
      'always.\n' +
      'The "discipline over dopamine" slide is your Upshift slide (Upshift: #1 Productivity App) — you kill the ' +
      'scroll so you can build in silence.\n' +
      'Slide 8 (CTA): blunt closer.',
  },
  {
    key: 'become-great',
    label: 'How to become great',
    slides: 8,
    niche: 'what it actually takes to become great',
    audience: 'People who refuse to be average!',
    body:
      'Slide 1 (Hook): the title.\n' +
      'Slide 2 (Truth): one blunt line that great is boring, daily and lonely.\n' +
      'Slides 3-7: what it takes, one per slide: pick one thing and go obsessive; out-work the talented; guard your ' +
      'focus like it is sacred; embrace the reps everyone else skips; keep going when nobody claps.\n' +
      'The "guard your focus" slide is your Upshift slide (Upshift: #1 Productivity App).\n' +
      'Slide 8 (CTA): blunt closer.',
  },
  {
    key: 'rich-young',
    label: 'Rules to become rich young',
    slides: 10,
    niche: 'building wealth young through habits and skills',
    audience: 'Young people who want to build wealth early!',
    body:
      'Slide 1 (Hook): the title.\n' +
      'Slides 2-8: the rules, ONE per slide, numbered: learn a skill people actually pay for; sell before you feel ' +
      'ready; live below your means while you are broke; reinvest every early dollar into yourself; guard your time ' +
      'like it is money; surround yourself with builders; stop pouring hours into the feed and pour them into work.\n' +
      'The "stop pouring hours into the feed" rule is your Upshift slide (Upshift: #1 Productivity App).\n' +
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
    `Recommended deck length: ${s.slides} slides (hook + every item + the app slide + CTA) so nothing gets cut.\n\n` +
    'Structure & Flow (specific to THIS topic — never fall back to a generic template):\n' +
    s.body,
});

// Quit-habit presets first, then the self-improvement family.
const ALL_BUILDERS: PresetBuilder[] = [...BUILDERS, ...SELF_SPECS.map(selfBuilder)];

// Build the preset list for a given pack. Defaults to the men's pack.
export function getQuitPresets(gender: Gender = 'men'): QuitPreset[] {
  return ALL_BUILDERS.map((build) => build(gender));
}

// Back-compat: the default (men's) pack.
export const QUIT_PRESETS: QuitPreset[] = getQuitPresets('men');
