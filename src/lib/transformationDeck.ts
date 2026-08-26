// Builds the before/after transformation deck from a character's two photo
// packages plus the two shared ones (blocked 🌽 / Upshift streak).
//
// The shape is fixed, the counts are not:
//   2–3 × BEFORE   — all carrying the same hook line
//   1   × AFTER    — "<streak> clean"
//   1   × BLOCKED  — the 🌽-blocked screenshot, no caption
//   1   × STREAK   — the Upshift streak screenshot, no caption
//   1–2 × AFTER    — "<streak> clean"
// Both counts are rolled per deck, so a batch never comes out identical.
//
// No model call is involved — every line is picked from lib/transformationHooks.ts,
// so this is a pure client-side build, like lib/fixedDeck.ts.
import type { Slideshow, Slide } from '../types';
import { HOOKS, fillHook } from './transformationHooks';
import {
  getBlockedShots,
  getStreakShots,
  getUsableStreaks,
  streakByKey,
  type Character,
  type Streak,
} from './characters';

// Same gradient palette the rest of the app uses, so a slide whose pool ran dry
// still renders on a real background instead of black.
const PALETTE: [string, string][] = [
  ['#0f172a', '#1e293b'],
  ['#1a1a2e', '#16213e'],
  ['#2d1b1b', '#1a1010'],
  ['#0a1f1c', '#0f2922'],
  ['#1f1147', '#160d33'],
  ['#26120a', '#1a0c06'],
];

function pick<T>(arr: T[]): T | undefined {
  return arr.length ? arr[Math.floor(Math.random() * arr.length)] : undefined;
}

// `n` distinct random items, preferring not to repeat. Falls back to repeats
// only when the pool is smaller than `n` (2 before photos still make a deck).
function pickDistinct<T>(arr: T[], n: number): T[] {
  if (!arr.length) return [];
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return Array.from({ length: n }, (_, i) => shuffled[i % shuffled.length]);
}

const randInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

export interface BuildOptions {
  // Lock the deck to one streak. Omitted/empty = a random usable streak per deck.
  streakKey?: string;
  // Lock the hook line (an entry of HOOKS, token included). Omitted = random.
  hookTemplate?: string;
}

export interface BuildResult {
  show?: Slideshow;
  error?: string;
}

// Everything a deck needs before it can be built. Surfaced by the view so the
// user is told exactly which package is empty rather than getting a broken deck.
export function missingPieces(character: Character): string[] {
  const missing: string[] = [];
  if (character.before.length < 1) missing.push('before photos');
  if (character.after.length < 1) missing.push('after photos');
  if (getBlockedShots().length < 1) missing.push('a blocked 🌽 screenshot');
  if (getUsableStreaks().length < 1) missing.push('an Upshift streak screenshot');
  return missing;
}

export function buildTransformationShow(character: Character, opts: BuildOptions = {}): BuildResult {
  const missing = missingPieces(character);
  if (missing.length) return { error: `${character.name} is missing ${missing.join(', ')}.` };

  // The streak drives BOTH the hook's {X}/{A} and the "<streak> clean" lines, so
  // one roll keeps the whole deck internally consistent.
  const usable = getUsableStreaks();
  const streak: Streak =
    (opts.streakKey ? streakByKey(opts.streakKey) : undefined) ?? pick(usable)!;
  const streakShot = pick(getStreakShots(streak.key));
  const blockedShot = pick(getBlockedShots());
  if (!streakShot || !blockedShot) return { error: 'The shared screenshot packages are empty.' };

  const hook = fillHook(opts.hookTemplate ?? pick(HOOKS)!, streak);
  const cleanLine = `${streak.label} clean`;

  const beforeCount = randInt(2, 3);
  const tailAfterCount = randInt(1, 2);
  const beforeShots = pickDistinct(character.before, beforeCount);
  const afterShots = pickDistinct(character.after, 1 + tailAfterCount);

  const stamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 7);
  const [from, to] = PALETTE[Math.floor(Math.random() * PALETTE.length)];
  let n = 0;
  const slide = (text: string, imageUrl: string): Slide => ({
    id: `slide-${stamp}-${n++}-${rand}`,
    text,
    imageUrl,
    bgFrom: from,
    bgTo: to,
  });

  const slides: Slide[] = [
    // Every before slide repeats the hook — the viewer reads it once and it
    // stays on screen while they swipe through the addict shots.
    ...beforeShots.map((img) => slide(hook, img)),
    slide(cleanLine, afterShots[0]),
    // The two proof slides carry no caption; the screenshot IS the message.
    slide('', blockedShot),
    slide('', streakShot),
    ...afterShots.slice(1).map((img) => slide(cleanLine, img)),
  ];

  return {
    show: {
      id: `q-${stamp}-${rand}`,
      hook,
      caption: '',
      hashtags: [],
      rationale: `${character.name} · ${streak.label} · ${beforeShots.length} before / ${afterShots.length} after`,
      createdAt: new Date(stamp).toISOString(),
      slides,
    },
  };
}

// Build several decks at once. Each one re-rolls its own hook, streak, photos
// and slide counts, so a batch of five is five different decks.
export function buildTransformationShows(
  character: Character,
  count: number,
  opts: BuildOptions = {}
): BuildResult[] {
  return Array.from({ length: Math.max(1, count) }, () => buildTransformationShow(character, opts));
}
