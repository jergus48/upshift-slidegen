// One-click Brain presets for the quit-habit slideshow niches. Each fills the
// audience + style memory (niche/app fields are left untouched). The style
// memory encodes the exact voice and per-slide structure for that niche.

export interface QuitPreset {
  key: string;
  label: string;
  niche: string;
  audience: string;
  styleMemory: string;
}

const MINIMAL_VOICE =
  'Voice, Tone & Formatting:\n' +
  'Write text for a highly visual social media carousel. The text must be ULTRA-MINIMALIST. ' +
  'Write exactly ONE short sentence (under 10-12 words) per slide. No paragraphs, no explanations, ' +
  'no slang. It must be punchy and direct. Do not use bold text or markdown formatting in the output.';

export const QUIT_PRESETS: QuitPreset[] = [
  {
    key: 'porn',
    label: 'Porn',
    niche: 'quitting porn',
    audience: 'People trying to quit porn!',
    styleMemory:
      `${MINIMAL_VOICE}\n\n` +
      'Structure & Flow:\n' +
      'Slide 1 (Hook): A simple hook (e.g. "5 steps to break free from porn"). Never mention an app here.\n' +
      'Slide 2 (The Effects): Mention the mental/brain damage (dopamine, drive, social skills) in one sentence.\n' +
      'Slide 3 (Willpower): State that willpower alone is not enough.\n' +
      'Slide 4 (Strict Mode): State the need for a strict mode blocker with no possibility to delete.\n' +
      'Slide 5 (The App): Explicitly mention using Upshift for strict blocking and tracking.\n' +
      'Slide 6 (CTA): End with a final motivating step or CTA (e.g. Save this, take your life back).',
  },
  {
    key: 'smoking',
    label: 'Smoking',
    niche: 'quitting smoking',
    audience: 'People trying to quit smoking!',
    styleMemory:
      `${MINIMAL_VOICE}\n\n` +
      'Structure & Flow:\n' +
      'Slide 1 (Hook): A simple hook (e.g. "5 steps to quit smoking for good"). Never mention an app here.\n' +
      'Slide 2 (The Reality): Mention the physical/health damage (lungs, energy) in one sentence.\n' +
      'Slide 3 (Willpower): State that willpower is not enough and you need to remove triggers.\n' +
      'Slide 4 (The Strategy): State the need to relentlessly track progress and celebrate small wins.\n' +
      'Slide 5 (The App): Explicitly mention using Upshift for tracking your streak and wins.\n' +
      'Slide 6 (CTA): End with a final motivating step or CTA (e.g. Save this, take your health back).',
  },
  {
    key: 'vaping',
    label: 'Vaping',
    niche: 'quitting vaping',
    audience: 'People trying to quit vaping!',
    styleMemory:
      `${MINIMAL_VOICE}\n\n` +
      'Structure & Flow:\n' +
      'Slide 1 (Hook): A simple hook (e.g. "6 steps to quit vaping for good"). Never mention an app here.\n' +
      'Slide 2 (The Reality): Mention the anxiety spikes and lung damage in one sentence.\n' +
      'Slide 3 (Environment): State that willpower is not enough and you must throw away all devices.\n' +
      'Slide 4 (Substitution): Advise replacing the constant hand-to-mouth habit with a healthier alternative.\n' +
      'Slide 5 (The Strategy): State the need to track progress and celebrate beaten cravings.\n' +
      'Slide 6 (The App): Explicitly mention using Upshift for tracking your streak and wins.\n' +
      'Slide 7 (CTA): End with a final motivating step or CTA.',
  },
  {
    key: 'weed',
    label: 'Weed',
    niche: 'quitting weed',
    audience: 'People trying to quit smoking weed!',
    styleMemory:
      `${MINIMAL_VOICE}\n\n` +
      'Structure & Flow:\n' +
      'Slide 1 (Hook): A simple hook (e.g. "5 steps to quit smoking weed"). Never mention an app here.\n' +
      'Slide 2 (The Reality): Mention the mental fog and loss of motivation in one sentence.\n' +
      'Slide 3 (Willpower): State that willpower is not enough and you need to remove triggers.\n' +
      'Slide 4 (The Strategy): State the need to relentlessly track progress and celebrate small wins.\n' +
      'Slide 5 (The App): Explicitly mention using Upshift for tracking your streak and wins.\n' +
      'Slide 6 (CTA): End with a final motivating step or CTA (e.g. Save this, get your mind back).',
  },
  {
    key: 'alcohol',
    label: 'Alcohol',
    niche: 'quitting alcohol',
    audience: 'People trying to quit drinking alcohol!',
    styleMemory:
      `${MINIMAL_VOICE}\n\n` +
      'Structure & Flow:\n' +
      'Slide 1 (Hook): A simple hook (e.g. "7 steps to quit drinking alcohol"). Never mention an app here.\n' +
      'Slide 2 (The Reality): Mention the damage to your sleep, energy and body.\n' +
      'Slide 3 (Environment): State that willpower is not enough and you must empty your home of alcohol.\n' +
      'Slide 4 (Substitution): Advise replacing the evening drink with a healthy new habit.\n' +
      'Slide 5 (Social): Advise temporarily avoiding events centered entirely around drinking.\n' +
      'Slide 6 (The Strategy): State the need to track progress and celebrate small wins.\n' +
      'Slide 7 (The App): Explicitly mention using Upshift for tracking your streak and wins.\n' +
      'Slide 8 (CTA): End with a final motivating step or CTA.',
  },
  {
    key: 'gambling',
    label: 'Gambling',
    niche: 'quitting gambling',
    audience: 'People trying to quit gambling!',
    styleMemory:
      `${MINIMAL_VOICE}\n\n` +
      'Structure & Flow:\n' +
      'Slide 1 (Hook): A simple hook (e.g. "6 steps to quit gambling for good"). Never mention an app here.\n' +
      'Slide 2 (The Reality): Mention the financial and mental destruction in one sentence.\n' +
      'Slide 3 (Environment): State that willpower is not enough and you must block access.\n' +
      'Slide 4 (The Strategy): State the need to track progress and celebrate avoided bets.\n' +
      'Slide 5 (The App): Explicitly mention using Upshift for tracking your streak and wins.\n' +
      'Slide 6 (CTA): End with a final motivating step or CTA.',
  },
  {
    key: 'hobbies',
    label: 'Hobbies',
    niche: 'self-improvement through hobbies',
    audience: 'People who feel stuck and want to be happy again!',
    styleMemory:
      `${MINIMAL_VOICE}\n\n` +
      'Structure & Flow:\n' +
      'Slide 1 (Hook): A strong hook (e.g. "5 hobbies to finally become happy again" or "5 hobbies that make you a 10/10"). Never mention an app here.\n' +
      'Slide 2 (The Problem): State that endless scrolling left you numb and unfulfilled.\n' +
      'Slide 3 (Hobby): Give one real-world hobby that rebuilds confidence (e.g. lifting, running).\n' +
      'Slide 4 (Hobby): Give a second hobby that sharpens the mind (e.g. reading, journaling).\n' +
      'Slide 5 (Hobby): Give a third hobby that builds real connection (e.g. a sport, a club).\n' +
      'Slide 6 (The Blocker): State that willpower fails and you must block the apps stealing your time.\n' +
      'Slide 7 (The App): Explicitly mention using Upshift to block distractions and free up time for hobbies.\n' +
      'Slide 8 (CTA): End with a final motivating step or CTA (e.g. Save this, start today).',
  },
  {
    key: 'steps',
    label: 'Walk more',
    niche: 'walking more using step-gated apps',
    audience: 'People addicted to TikTok who want to walk more!',
    styleMemory:
      `${MINIMAL_VOICE}\n\n` +
      'Structure & Flow:\n' +
      'Slide 1 (Hook): A strong personal hook (e.g. "My TikTok only unlocks after 5,000 steps" or "How I walk 10k+ steps a day thanks to my TikTok addiction"). Never mention an app here.\n' +
      'Slide 2 (The Problem): State that you were glued to TikTok and barely moved all day.\n' +
      'Slide 3 (The Flip): Explain the trick of turning the addiction into fuel for movement.\n' +
      'Slide 4 (The Rule): State the rule: the app stays locked until you hit your step goal.\n' +
      'Slide 5 (The Result): Describe walking 10k+ steps a day almost without noticing.\n' +
      'Slide 6 (The App): Explicitly mention using Upshift to gate TikTok behind a daily step goal.\n' +
      'Slide 7 (CTA): End with a final motivating step or CTA (e.g. Save this, move to unlock).',
  },
  {
    key: 'doomscrolling',
    label: 'Doomscrolling',
    niche: 'quitting doomscrolling',
    audience: 'People trying to quit doomscrolling!',
    styleMemory:
      'Voice, Tone & Formatting:\n' +
      'Write text for a visual social media carousel. The text should be clear and descriptive but punchy. ' +
      'Write 1-2 short sentences per slide. No slang. Do not use bold text or markdown formatting in the output.\n\n' +
      'Structure & Flow:\n' +
      'Slide 1 (Hook): A strong hook about stopping doomscrolling without isolating yourself. Never mention an app here.\n' +
      'Slide 2 (The Reality): Explain how short-form feeds destroy your attention span.\n' +
      'Slide 3 (The Nuance): Differentiate addictive algorithms from real communication.\n' +
      'Slide 4 (Keep Chat): Keep WhatsApp and Messenger fully accessible for friends.\n' +
      'Slide 5 (Block Feed): Set strict daily time limits on apps like TikTok and Instagram.\n' +
      'Slide 6 (The App): Explicitly mention using Upshift strict mode to enforce these limits.\n' +
      'Slide 7 (Quest Blocks): Explain using the Upshift quest block to force a healthy task before scrolling.\n' +
      'Slide 8 (CTA): End with a final motivating step and a Call to Action.',
  },
];
