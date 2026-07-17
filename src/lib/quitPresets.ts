// One-click Brain presets for the slideshow niches. Each fills the audience +
// style memory (niche/app fields are left untouched). The style memory encodes
// the exact voice, the real hooks, and the per-slide structure for that niche.

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

// Hard content rule for the 🌽 niche — the literal words are never allowed.
const CORN_RULE =
  '\n\nCONTENT RULE (non-negotiable): NEVER write the words "porn", "pornography", "adult content", "explicit", or "NSFW". ' +
  'Always use the 🌽 emoji instead (e.g. "quit 🌽", "🌽 sites", "watching 🌽", "🌽 addiction"). This applies to every single slide, no exceptions.';

export const QUIT_PRESETS: QuitPreset[] = [
  {
    key: 'corn',
    label: '🌽',
    niche: 'quitting 🌽',
    audience: 'Guys trying to quit 🌽 for good!',
    styleMemory:
      `${VIRAL_VOICE}${CORN_RULE}\n\n` +
      'Hook inspiration (examples of the angle ONLY — write your own original, first person, no app mention):\n' +
      '- "How I quit gooning after a decade"\n' +
      '- "How to quit watching 🌽 in 2026"\n' +
      '- "How I became 100 days 🌽 free in 2026"\n\n' +
      'Structure & Flow:\n' +
      'Slide 1 (Hook): Your own original hook in this spirit. Personal, no app.\n' +
      'Slide 2 (Rock bottom): Say the real cost in one blunt line (fried dopamine, no drive, dead eyes).\n' +
      'Slide 3 (The lie): Willpower alone never worked for you.\n' +
      'Slide 4 (The fix): You need a blocker you literally can\'t delete once it\'s on.\n' +
      'Slide 5 (The App): Upshift\'s 🌽 Block — a 30-day strict block on 🌽 sites that you physically can\'t remove.\n' +
      'Slide 6 (CTA): Blunt closer (e.g. "Day 1 starts now. Save this.").',
  },
  {
    key: 'hobbies',
    label: 'Hobbies',
    niche: 'attractive hobbies / self-improvement',
    audience: 'Guys who feel stuck and want to become a 10/10!',
    styleMemory:
      `${VIRAL_VOICE}\n\n` +
      'Hook inspiration (examples of the angle ONLY — write your own original, no app mention):\n' +
      '- "5 hobbies to finally become happy again"\n' +
      '- "5 hobbies that make you a 10/10 man"\n' +
      '- "How to unf*ck your life in 7 steps"\n\n' +
      'Structure & Flow:\n' +
      'Slide 1 (Hook): Your own original hook in this spirit.\n' +
      'Slide 2 (Callout): Blunt line about being glued to your phone doing nothing.\n' +
      'Slide 3 (Hobby): One real hobby that builds a body (lifting, running, boxing).\n' +
      'Slide 4 (Hobby): One that builds a brain (reading, an instrument, chess).\n' +
      'Slide 5 (Hobby): One that gets you outside/around people (a sport, climbing, a club).\n' +
      'Slide 6 (The catch): None of it happens while you\'re doomscrolling 5 hours a day.\n' +
      'Slide 7 (The App): Upshift\'s Quest Block — your apps only unlock after you\'ve done your real quests, so you actually have time for hobbies.\n' +
      'Slide 8 (CTA): Blunt closer (e.g. "Pick one. Start today.").',
  },
  {
    key: 'rebuild',
    label: 'Rebuild yourself',
    niche: 'self-improvement / self-worth',
    audience: 'People at rock bottom who want to rebuild!',
    styleMemory:
      `${VIRAL_VOICE}\n\n` +
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
  },
  {
    key: 'steps',
    label: 'Walk more',
    niche: 'detaching from your phone with a step-gated blocker',
    audience: 'People glued to TikTok who want to move more!',
    styleMemory:
      `${VIRAL_VOICE}\n\n` +
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
  },
  {
    key: 'smoking',
    label: 'Smoking',
    niche: 'quitting smoking',
    audience: 'People trying to quit smoking for good!',
    styleMemory:
      `${VIRAL_VOICE}\n\n` +
      'Hook inspiration (example angle ONLY — write your own original, first person, no app): "How I quit smoking after X years".\n\n' +
      'Structure & Flow:\n' +
      'Slide 1 (Hook): Personal hook about quitting for good.\n' +
      'Slide 2 (Reality): One blunt line on what it did to your lungs/energy.\n' +
      'Slide 3 (The lie): Willpower alone never held — you have to kill the triggers.\n' +
      'Slide 4 (The move): Track every clean day so quitting feels like winning.\n' +
      'Slide 5 (The App): Name Upshift for tracking your streak and wins.\n' +
      'Slide 6 (CTA): Blunt closer (e.g. "Day 1. Save this.").',
  },
  {
    key: 'vaping',
    label: 'Vaping',
    niche: 'quitting vaping',
    audience: 'People trying to quit vaping for good!',
    styleMemory:
      `${VIRAL_VOICE}\n\n` +
      'Hook inspiration (example angle ONLY — write your own original, first person, no app): "How I finally put the vape down".\n\n' +
      'Structure & Flow:\n' +
      'Slide 1 (Hook): Personal hook about quitting the vape.\n' +
      'Slide 2 (Reality): One blunt line on the anxiety spikes and wrecked lungs.\n' +
      'Slide 3 (Environment): Throw every device out — willpower won\'t save you.\n' +
      'Slide 4 (Swap): Replace the hand-to-mouth habit with something that isn\'t killing you.\n' +
      'Slide 5 (The move): Track every beaten craving.\n' +
      'Slide 6 (The App): Name Upshift for tracking your streak and wins.\n' +
      'Slide 7 (CTA): Blunt closer.',
  },
  {
    key: 'weed',
    label: 'Weed',
    niche: 'quitting weed',
    audience: 'People trying to quit smoking weed!',
    styleMemory:
      `${VIRAL_VOICE}\n\n` +
      'Hook inspiration (example angle ONLY — write your own original, first person, no app): "How I quit weed and got my brain back".\n\n' +
      'Structure & Flow:\n' +
      'Slide 1 (Hook): Personal hook about quitting weed.\n' +
      'Slide 2 (Reality): One blunt line on the fog and zero motivation.\n' +
      'Slide 3 (The lie): Willpower alone never held — cut the triggers.\n' +
      'Slide 4 (The move): Track every clean day so it feels like winning.\n' +
      'Slide 5 (The App): Name Upshift for tracking your streak and wins.\n' +
      'Slide 6 (CTA): Blunt closer (e.g. "Get your mind back. Save this.").',
  },
  {
    key: 'alcohol',
    label: 'Alcohol',
    niche: 'quitting alcohol',
    audience: 'People trying to quit drinking!',
    styleMemory:
      `${VIRAL_VOICE}\n\n` +
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
  },
  {
    key: 'gambling',
    label: 'Gambling',
    niche: 'quitting gambling',
    audience: 'People trying to quit gambling!',
    styleMemory:
      `${VIRAL_VOICE}\n\n` +
      'Hook inspiration (example angle ONLY — write your own original, first person, no app): "How I quit gambling after losing everything".\n\n' +
      'Structure & Flow:\n' +
      'Slide 1 (Hook): Personal hook about quitting gambling.\n' +
      'Slide 2 (Reality): One blunt line on the money and the mind it destroyed.\n' +
      'Slide 3 (Environment): Block every app and site — willpower won\'t save you.\n' +
      'Slide 4 (The move): Track every bet you didn\'t place.\n' +
      'Slide 5 (The App): Name Upshift for the strict block + streak tracking.\n' +
      'Slide 6 (CTA): Blunt closer.',
  },
  {
    key: 'doomscrolling',
    label: 'Doomscrolling',
    niche: 'quitting doomscrolling',
    audience: 'People who can\'t put their phone down!',
    styleMemory:
      `${VIRAL_VOICE}\n\n` +
      'Hook inspiration (example angle ONLY — write your own original, no app): "How I stopped doomscrolling without deleting everything".\n\n' +
      'Structure & Flow:\n' +
      'Slide 1 (Hook): Strong hook about quitting the scroll without going off-grid.\n' +
      'Slide 2 (Reality): How short-form feeds fried your attention span.\n' +
      'Slide 3 (Nuance): The algorithm is the problem, not talking to your friends.\n' +
      'Slide 4 (Keep chat): Keep WhatsApp and Messenger fully open.\n' +
      'Slide 5 (Block feed): Hard daily limits on TikTok and Instagram.\n' +
      'Slide 6 (The App): Upshift\'s Quest Block — your apps only unlock once your chosen daily quests (gym, work, reading) are done.\n' +
      'Slide 7 (The result): You get the scroll back only after you\'ve earned it, so the day isn\'t gone.\n' +
      'Slide 8 (CTA): Blunt closer.',
  },
];
