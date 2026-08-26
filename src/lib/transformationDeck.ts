// Builds the before/after transformation deck from a character's two library
// packages plus the two shared ones (blocked 🌽 / Upshift streak).
//
// The shape is fixed, the counts are not:
//   2–3 × BEFORE   — all carrying the same hook line
//   1   × AFTER    — "<streak> clean"
//   1   × BLOCKED  — the 🌽-blocked screenshot, no caption
//   1   × STREAK   — the Upshift streak screenshot, no caption
//   1–2 × AFTER    — "<streak> clean"
// Both counts are rolled per deck, and every slot draws a fresh random image out
// of its package, so a batch never comes out as the same deck twice.
//
// No model call is involved — every line is picked from lib/transformationHooks.ts,
// so this is a pure client-side build, like lib/fixedDeck.ts.
import type { Slideshow, Slide, LibraryImage } from '../types';
import { HOOKS, fillHook } from './transformationHooks';
import { tokenMatches } from './subfolders';
import { libraryRef } from './imageSrc';
import { getBlockedToken, getStreakToken, getUsableStreaks, streakByKey, type Character, type Streak } from './characters';

// Same gradient palette the rest of the app uses, so a caption still sits on a
// real background if a package turns out to be empty.
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

// `n` random images from a pool, preferring not to repeat within one deck.
// Falls back to repeats only when the pool is smaller than `n` — two photos in
// a package still make a deck.
function pickDistinct<T>(arr: T[], n: number): T[] {
  if (!arr.length) return [];
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return Array.from({ length: n }, (_, i) => shuffled[i % shuffled.length]);
}

const randInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

// Every image in the library that a selection token covers.
export function poolFor(library: LibraryImage[], token: string): LibraryImage[] {
  return token ? library.filter((img) => tokenMatches(token, img)) : [];
}

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

// The durations that can actually be rolled: a package is assigned AND it holds
// photos. Without a library only the assignment is known.
export function usableStreaksIn(library?: LibraryImage[]): Streak[] {
  const assigned = getUsableStreaks();
  if (!library) return assigned;
  return assigned.filter((s) => poolFor(library, getStreakToken(s.key)).length > 0);
}

// Everything a deck needs before it can be built. Surfaced by the view so the
// user is told exactly which package is missing rather than getting a broken deck.
// `library` is optional: without it only the picks are checked, with it the
// packages are also checked for actually holding photos.
export function missingPieces(character: Character, library?: LibraryImage[]): string[] {
  const missing: string[] = [];
  const empty = (token: string) => !token || (library ? poolFor(library, token).length === 0 : false);
  if (empty(character.beforeToken)) missing.push('a before package');
  if (empty(character.afterToken)) missing.push('an after package');
  if (empty(getBlockedToken())) missing.push('a blocked 🌽 package');
  if (usableStreaksIn(library).length === 0) missing.push('an Upshift streak package');
  return missing;
}

export function buildTransformationShow(
  character: Character,
  library: LibraryImage[],
  opts: BuildOptions = {}
): BuildResult {
  const missing = missingPieces(character, library);
  if (missing.length) return { error: `${character.name} is missing ${missing.join(', ')}.` };

  // The streak drives BOTH the hook's {X}/{A} and the "<streak> clean" lines and
  // which screenshot package is used, so one roll keeps the deck consistent.
  const usable = usableStreaksIn(library);
  const streak: Streak = (opts.streakKey ? streakByKey(opts.streakKey) : undefined) ?? pick(usable)!;

  const beforePool = poolFor(library, character.beforeToken);
  const afterPool = poolFor(library, character.afterToken);
  const blockedShot = pick(poolFor(library, getBlockedToken()));
  const streakShot = pick(poolFor(library, getStreakToken(streak.key)));
  if (!blockedShot || !streakShot)
    return { error: `The shared packages have no photos for ${streak.label}.` };

  const hook = fillHook(opts.hookTemplate ?? pick(HOOKS)!, streak);
  const cleanLine = `${streak.label} clean`;

  const beforeShots = pickDistinct(beforePool, randInt(2, 3));
  const afterShots = pickDistinct(afterPool, 1 + randInt(1, 2));

  const stamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 7);
  const [from, to] = PALETTE[Math.floor(Math.random() * PALETTE.length)];
  let n = 0;
  const slide = (text: string, img: LibraryImage): Slide => ({
    id: `slide-${stamp}-${n++}-${rand}`,
    text,
    // Persist the stable reference, not the (session-scoped) object URL.
    imageUrl: libraryRef(img),
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
  library: LibraryImage[],
  count: number,
  opts: BuildOptions = {}
): BuildResult[] {
  return Array.from({ length: Math.max(1, count) }, () =>
    buildTransformationShow(character, library, opts)
  );
}
