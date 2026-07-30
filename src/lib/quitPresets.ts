// One-click Brain presets for the slideshow niches. Each fills the audience +
// style memory (niche/app fields are left untouched). The style memory encodes
// the exact voice, the real hooks, and the per-slide structure for that niche.
//
// Every preset is gender-aware: the same niche reads differently for a men's
// pack vs a women's pack (persona, pronouns, hobby examples, hooks). Pick the
// pack with `getQuitPresets(gender)`.

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

// ---- Self-improvement / "aura" listicle presets ----------------------------
// A second family of niches: motivational self-improvement slideshows (rules,
// hobbies, glow-up stories) rather than quit-a-habit guides. They share one
// voice, persona and app tie-in, so each spec only supplies the topic, hooks
// and flow shape — one source of truth for both packs.

// Accurate app description so the model never invents features on the app slide.
const SELF_APP_NOTE =
  '\n\nWhat Upshift actually does (be accurate on the app slide): it is a screen-time app. Quest Block keeps your ' +
  'social apps locked until your real quests are done (gym, reading, work, chores); it also has strict daily time ' +
  'limits and work/sleep schedule blocks. Do not invent other features.';

// Three flow shapes cover every topic below.
type Flow = 'list' | 'story' | 'compare';

const FLOWS: Record<Flow, string> = {
  list:
    'Slide 1 (Hook): Your own original hook in this spirit (keep the count if the hook names one).\n' +
    'Slide 2 (Callout): One blunt, honest line naming the problem — stuck, wasting time, glued to your phone.\n' +
    'Middle slides: each slide is ONE item from the list, numbered, concrete and genuinely useful — never vague filler.\n' +
    'Second-to-last (The App): A dedicated slide that names Upshift — first person and soft: none of this sticks while ' +
    "you scroll all day, so what finally worked for me was Upshift's Quest Block keeping my apps locked until my real " +
    'quests (gym, reading, work) were done.\n' +
    'Last (CTA): Blunt closer (e.g. "Pick one. Start today. Save this.").',
  story:
    'Slide 1 (Hook): Your own personal hook in this spirit.\n' +
    'Slide 2 (Before): One blunt line on where you were — lost, behind, scrolling your life away.\n' +
    'Middle slides: the real moves you made, in order, one per slide — specific and doable, not motivational fluff.\n' +
    'Second-to-last (The App): A dedicated slide that names Upshift — first person and soft: the scroll was eating my ' +
    "day, so what worked was Upshift's Quest Block keeping my apps locked until my real quests were done.\n" +
    'Last (CTA): Blunt closer.',
  compare:
    'Slide 1 (Hook): Your own original hook contrasting the two.\n' +
    'Middle slides: one clean contrast per slide — fake does X, real does Y — concrete and specific.\n' +
    'Second-to-last (The App): A dedicated slide that names Upshift — first person and soft: it starts with your time, ' +
    "and mine went to the scroll until Upshift's Quest Block locked my apps behind my real work.\n" +
    'Last (CTA): Blunt closer.',
};

interface SelfSpec {
  key: string;
  label: string;
  labelWomen?: string;
  niche: string;
  audience: string;
  audienceWomen?: string;
  flow: Flow;
  hooks: string[];
  hooksWomen?: string[];
  note?: string;
}

const SELF_SPECS: SelfSpec[] = [
  {
    key: 'stop-wasting',
    label: 'Stop wasting your life',
    niche: 'self-discipline / making your time count',
    audience: 'People who feel their life is slipping away!',
    flow: 'list',
    hooks: [
      '8 rules to stop wasting your life',
      '7 rules to stop wasting your life',
      'How I stopped wasting my one life',
    ],
  },
  {
    key: 'morning-routine',
    label: 'Morning routine',
    niche: 'a morning routine that sets up your whole day',
    audience: 'People who want mornings that set them up to win!',
    flow: 'list',
    hooks: [
      'The morning routine that changed everything for me',
      'My morning routine to actually get ahead',
      'The morning routine to become who you want to be',
    ],
    note: 'Each middle slide is one real step of the routine, in the order you do it (wake time, no phone, water, movement, etc.).',
  },
  {
    key: 'win-20s',
    label: 'Win your 20s',
    niche: 'making the most of your twenties',
    audience: "People in their 20s who don't want to waste them!",
    flow: 'list',
    hooks: [
      'How to win your 20s',
      'What I wish I knew at the start of my 20s',
      'How to not waste your 20s',
    ],
  },
  {
    key: 'mindset-sentences',
    label: 'Mindset sentences',
    niche: 'mindset shifts that change how you think',
    audience: 'People who want to think sharper and stronger!',
    flow: 'list',
    hooks: [
      '8 sentences that make you level up mentally',
      '8 lines that changed how I think',
      "Sentences you'll wish you read sooner",
    ],
    note: 'Each middle slide is ONE short, punchy sentence — a line the reader could screenshot on its own. Make them true and a little uncomfortable, not cheesy.',
  },
  {
    key: 'signs-make-it',
    label: "Signs you'll make it",
    niche: "signs you're on the right path",
    audience: "People grinding who need to know it's working!",
    flow: 'list',
    hooks: [
      "5 signs you're going to make it",
      "5 signs you're closer than you think",
      'Quiet signs your life is about to change',
    ],
  },
  {
    key: 'manlier-hobbies',
    label: 'Manlier hobbies',
    labelWomen: 'Magnetic hobbies',
    niche: 'hobbies that build presence and character',
    audience: 'Guys who want more presence and respect!',
    audienceWomen: 'Girls who want more presence and magnetism!',
    flow: 'list',
    hooks: [
      '6 hobbies that make you noticeably manlier',
      '6 hobbies that give you real presence',
      'Hobbies that quietly make you more respected',
    ],
    hooksWomen: [
      '6 hobbies that make you noticeably more magnetic',
      '6 hobbies that give you real presence',
      'Hobbies that make you that girl without trying',
    ],
    note: 'Each middle slide is one hobby with a one-line why it works.',
  },
  {
    key: 'honor-one-life',
    label: 'Honor your one life',
    niche: 'living with intention / not wasting your one life',
    audience: 'People who want to live like their time matters!',
    flow: 'list',
    hooks: [
      '9 codes to honor your one life',
      '9 rules I live by to not waste this life',
      'The codes that changed how I live',
    ],
  },
  {
    key: 'instead-of-scrolling',
    label: 'Instead of scrolling',
    niche: 'better things to do than doomscroll',
    audience: 'People who scroll for hours and hate it!',
    flow: 'list',
    hooks: [
      'Things to do instead of mindlessly scrolling',
      'What to do instead of picking up your phone',
      'Replace the scroll with these',
    ],
    note: 'Each middle slide is one specific thing to do instead of scrolling. This niche fits the app perfectly — lean into it on the app slide.',
  },
  {
    key: 'smart-hobbies',
    label: 'Smarter hobbies',
    niche: 'hobbies that make you sharper',
    audience: 'People who want to actually get smarter!',
    flow: 'list',
    hooks: [
      '4 hobbies to become dangerously intelligent',
      '4 hobbies that made me noticeably smarter',
      'Hobbies that build a sharper mind',
    ],
    note: 'Each middle slide is one hobby (reading, chess, writing, learning an instrument) with a one-line why.',
  },
  {
    key: 'struggle-to-win',
    label: 'Struggle to win',
    niche: 'using hard times to come out ahead',
    audience: 'People in a hard season who refuse to quit!',
    flow: 'story',
    hooks: [
      'How to struggle to win',
      'How my worst year became the turning point',
      'How to use the struggle instead of drowning in it',
    ],
  },
  {
    key: 'change-yourself',
    label: 'Change yourself',
    niche: 'genuinely changing yourself for the better',
    audience: 'People ready to actually change!',
    flow: 'list',
    hooks: [
      '5 best ways to change yourself',
      'The 5 things that actually changed me',
      'How to become a different person in a year',
    ],
  },
  {
    key: 'changed-at-21',
    label: 'Changed my life at 21',
    niche: 'a one-year full life turnaround',
    audience: 'Young people who want a total turnaround!',
    flow: 'story',
    hooks: [
      'How I changed my entire life in one year at 21',
      'One year of change that fixed everything',
      'What I did at 21 that changed my life',
    ],
  },
  {
    key: 'six-month-plan',
    label: '6-month plan',
    niche: 'a 6-month plan to become your best self',
    audience: 'People who want a real plan, not vibes!',
    flow: 'list',
    hooks: [
      'My 6 month plan to become the best version of myself',
      'How to change everything in 6 months',
      'The 6 month plan that actually works',
    ],
    note: 'Middle slides walk month by month (or phase by phase) in order — what you focus on first, next, and last.',
  },
  {
    key: 'aura-hobbies',
    label: '10x your aura',
    niche: 'hobbies that raise your presence',
    audience: 'People who want to walk into a room different!',
    flow: 'list',
    hooks: [
      'Hobbies that will 10x your aura',
      'Hobbies that quietly raise your aura',
      'What actually gives someone presence',
    ],
    note: 'Each middle slide is one hobby with a one-line why it changes how people read you.',
  },
  {
    key: 'confidence-habits',
    label: 'Confidence habits',
    niche: 'uncomfortable habits that build real confidence',
    audience: 'People who want unshakeable confidence!',
    flow: 'list',
    hooks: [
      'Uncomfortable habits that build extreme confidence',
      'The awkward habits that made me confident',
      'Do these uncomfortable things and watch your confidence change',
    ],
    note: "Each middle slide is one uncomfortable habit — the point is they're hard, not easy tips.",
  },
  {
    key: 'bruce-wayne',
    label: 'Bruce Wayne lifestyle',
    labelWomen: 'Build in silence',
    niche: 'building yourself in private, letting results talk',
    audience: 'Guys who want to build in silence and let results talk!',
    audienceWomen: 'Girls who want to build in silence and let results talk!',
    flow: 'story',
    hooks: [
      'The Bruce Wayne lifestyle',
      'How to build yourself in private like Bruce Wayne',
      'Become the guy who trains in silence',
    ],
    hooksWomen: [
      'The build-in-silence lifestyle',
      'How to become her in private and let the results talk',
      'Train in silence, let them find out later',
    ],
  },
  {
    key: 'become-great',
    label: 'Become great',
    niche: 'what it actually takes to become great',
    audience: 'People who refuse to be average!',
    flow: 'story',
    hooks: [
      'How to become great',
      'What separates great people from average ones',
      'How greatness is actually built',
    ],
  },
  {
    key: 'rich-young',
    label: 'Rich young',
    niche: 'building wealth young through habits and skills',
    audience: 'Young people who want to build wealth early!',
    flow: 'list',
    hooks: [
      'Rules to become rich young',
      'How to build wealth in your 20s',
      'What got me out of being broke young',
    ],
    note: 'Keep it to habits, skills, discipline and mindset. Do NOT give specific investment or financial advice or name any investment.',
  },
  {
    key: 'fake-vs-real-rich',
    label: 'Fake vs real rich',
    niche: 'real wealth vs just looking rich',
    audience: 'People done faking it who want the real thing!',
    flow: 'compare',
    hooks: [
      'Fake rich vs real rich for men',
      'Fake rich vs real rich',
      'The difference between looking rich and being rich',
    ],
    hooksWomen: [
      'Fake rich vs real rich',
      'The difference between looking rich and being rich',
      'Stop faking rich and build the real thing',
    ],
    note: 'Keep it about habits and mindset, not specific investment or financial advice.',
  },
];

const selfBuilder = (s: SelfSpec): PresetBuilder => (g) => ({
  key: s.key,
  label: g === 'women' ? s.labelWomen ?? s.label : s.label,
  niche: s.niche,
  audience: g === 'women' ? s.audienceWomen ?? s.audience : s.audience,
  styleMemory:
    `${VIRAL_VOICE}${PERSONA(g)}${SELF_APP_NOTE}\n\n` +
    'Hook inspiration (angle ONLY — write your own original, first person, no app mention):\n' +
    (g === 'women' ? s.hooksWomen ?? s.hooks : s.hooks).map((h) => `- "${h}"\n`).join('') +
    (s.note ? `\n${s.note}\n` : '') +
    '\nStructure & Flow:\n' +
    FLOWS[s.flow],
});

// Quit-habit presets first, then the self-improvement family.
const ALL_BUILDERS: PresetBuilder[] = [...BUILDERS, ...SELF_SPECS.map(selfBuilder)];

// Build the preset list for a given pack. Defaults to the men's pack.
export function getQuitPresets(gender: Gender = 'men'): QuitPreset[] {
  return ALL_BUILDERS.map((build) => build(gender));
}

// Back-compat: the default (men's) pack.
export const QUIT_PRESETS: QuitPreset[] = getQuitPresets('men');
