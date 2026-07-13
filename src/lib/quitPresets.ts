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
