// Post captions + hashtags for the Characters decks.
//
// Kept short and plain on purpose: the slides carry the story, so the caption is
// one line under the post, not a second version of it. Same token substitution
// as the hooks ({X} = "100 days", {A} = "a year"), and the same content rule —
// never the literal word, always 🌽.
import type { Streak } from './characters';

const CAPTIONS: string[] = [
  '{X} clean. no going back.',
  '{X} without 🌽 and my whole face changed.',
  'quit lust for {A}. best decision i ever made.',
  '{X} clean and i finally look like myself again.',
  'this is what {X} of no lust actually does.',
  "{X} clean. it wasn't easy but look at me now.",
  'stopped watching 🌽 {X} ago. this is the result.',
  '{X} clean. your face tells on you.',
  'gave it up for {X} and got my life back.',
  '{X} of no lust. i wish i started sooner.',
  'the difference {X} makes when you actually stop.',
  '{X} clean and i sleep, train and talk different now.',
  'nobody told me quitting 🌽 would change my face.',
  '{X} clean. still going.',
  'this is your sign to quit. {X} in and i mean it.',
  '{X} without 🌽. same guy, different man.',
  'quit for {A}, nothing about me is the same.',
  '{X} clean. the app kept me honest.',
];

// Two tags always ride along so the account stays findable; the rest rotate.
const CORE_TAGS = ['nofap', 'upshift'];

const ROTATING_TAGS = [
  'nolust',
  'discipline',
  'selfimprovement',
  'glowup',
  'transformation',
  'motivation',
  'mindset',
  'selfcontrol',
  'habits',
  'streak',
  'quitting',
  'disciplineequalsfreedom',
  'becomingbetter',
  'godfirst',
  'faith',
  'monkmode',
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fill(template: string, streak: Streak): string {
  return template.replace(/\{X\}/g, streak.label).replace(/\{A\}/g, streak.article);
}

// One caption + 4 hashtags for a deck, rolled fresh each time so a batch doesn't
// post the same line five times. Hashtags are stored WITHOUT the '#' — the
// scheduler adds it (see BulkScheduleModal).
export function pickCaption(streak: Streak): { caption: string; hashtags: string[] } {
  const rotating = [...ROTATING_TAGS].sort(() => Math.random() - 0.5).slice(0, 2);
  return {
    caption: fill(pick(CAPTIONS), streak),
    hashtags: [...CORE_TAGS, ...rotating],
  };
}
