// Post captions + hashtags for the Characters decks.
//
// Kept short and plain on purpose: the slides carry the story, so the caption is
// one line under the post, not a second version of it. Same token substitution
// as the hooks ({X} = "100 days", {A} = "a year"), and the same content rule —
// never the literal word, always 🌽.
import { makeDealer, shuffled } from './dealer';
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

function fill(template: string, streak: Streak): string {
  return template.replace(/\{X\}/g, streak.label).replace(/\{A\}/g, streak.article);
}

export interface CaptionPicker {
  (streak: Streak): { caption: string; hashtags: string[] };
}

// One caption + 4 hashtags per deck. The returned picker deals captions out of a
// shuffled bag, so a batch works through every line before reusing one instead
// of posting the same sentence five times. Make ONE picker per batch — a fresh
// one per deck is just an independent random pick again. Hashtags are stored
// WITHOUT the '#' — the scheduler adds it (see BulkScheduleModal).
export function makeCaptionPicker(): CaptionPicker {
  const captions = makeDealer(CAPTIONS);
  return (streak) => ({
    caption: fill(captions.next() ?? CAPTIONS[0], streak),
    hashtags: [...CORE_TAGS, ...shuffled(ROTATING_TAGS).slice(0, 2)],
  });
}
