// Builds the before/after transformation deck from a character's two library
// packages plus the two shared ones (blocked 🌽 / Upshift streak), taken from the
// set matching the character's skin/gender variant.
//
// The shape is fixed, the counts are not:
//   2–3 × BEFORE   — all carrying the same hook line
//   1   × AFTER    — "<streak> clean"
//   1   × BLOCKED  — the 🌽-blocked screenshot
//   1   × STREAK   — the Upshift streak screenshot
//   0–1 × AFTER    — "<streak> clean"
//   1   × GIRLFRIEND — the closing shot, same line
// Every slide from the first after onwards carries the same "<streak> clean"
// line, the two proof slides included, so the claim stays on screen while the
// viewer swipes through the evidence.
// Both counts are rolled per deck, and every slot draws a fresh image out of its
// package — dealt from a bag shared by the whole batch (see lib/dealer.ts), so a
// run of ten uses everything available before it reuses anything.
//
// No model call is involved — every line is picked from lib/transformationHooks.ts,
// so this is a pure client-side build, like lib/fixedDeck.ts.
import type { Slideshow, Slide, LibraryImage } from '../types';
import { HOOKS, fillHook } from './transformationHooks';
import { makeCaptionPicker, type CaptionPicker } from './transformationCaptions';
import { makeDealer, makeWeightedDealer, type Dealer } from './dealer';
import { tokenMatches } from './subfolders';
import { libraryRef } from './imageSrc';
import {
  getBlockedToken,
  getStreakToken,
  getUsableStreaks,
  streakByKey,
  variantOf,
  type Character,
  type Streak,
} from './characters';

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

const randInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

// Every image in the library that a selection token covers.
export function poolFor(library: LibraryImage[], token: string): LibraryImage[] {
  return token ? library.filter((img) => tokenMatches(token, img)) : [];
}

// ── Spreading a batch ───────────────────────────────────────────────────────
// Every "random per deck" choice is dealt out of a shuffled bag rather than
// drawn independently (see lib/dealer.ts), and the bags are held HERE, on a
// batch — so ten decks work through the hooks, the captions and the photos
// before repeating any of them, instead of landing on the same screenshot five
// times. One batch per character per run; a single deck builds a throwaway one,
// which is the old behaviour.
interface Batch {
  variant: string;
  hooks: Dealer<string>;
  streaks: Dealer<Streak>;
  before: Dealer<LibraryImage>;
  after: Dealer<LibraryImage>;
  girlfriend: Dealer<LibraryImage>;
  blocked: Dealer<LibraryImage>;
  // One bag per duration, built on first use — a deck only ever touches the
  // package of the streak it rolled.
  streakShots: Map<string, Dealer<LibraryImage>>;
  caption: CaptionPicker;
}

function makeBatch(character: Character, library: LibraryImage[]): Batch {
  const variant = variantOf(character);
  return {
    variant,
    hooks: makeDealer(HOOKS),
    // Weighted, so the long streaks still dominate — but weighted WITHOUT
    // replacement, so they dominate across the batch instead of clumping.
    streaks: makeWeightedDealer(usableStreaksIn(library, variant), (s) => s.weight),
    before: makeDealer(poolFor(library, character.beforeToken)),
    after: makeDealer(poolFor(library, character.afterToken)),
    girlfriend: makeDealer(poolFor(library, character.girlfriendToken)),
    blocked: makeDealer(poolFor(library, getBlockedToken(variant))),
    streakShots: new Map(),
    caption: makeCaptionPicker(),
  };
}

function streakShotsFor(batch: Batch, library: LibraryImage[], streakKey: string): Dealer<LibraryImage> {
  let dealer = batch.streakShots.get(streakKey);
  if (!dealer) {
    dealer = makeDealer(poolFor(library, getStreakToken(batch.variant, streakKey)));
    batch.streakShots.set(streakKey, dealer);
  }
  return dealer;
}

// `n` images off a dealer, not repeating within the one deck unless the package
// is too small to avoid it — two photos in a package still make a deck.
function deal(dealer: Dealer<LibraryImage>, n: number): LibraryImage[] {
  const out: LibraryImage[] = [];
  for (let i = 0; i < n; i++) {
    const img = dealer.next(out);
    if (img) out.push(img);
  }
  return out;
}

export interface BuildOptions {
  // Lock the deck to one streak. Omitted/empty = a random usable streak per deck.
  streakKey?: string;
  // Lock the hook line (an entry of HOOKS, token included). Omitted = random.
  hookTemplate?: string;
  // The shared bags this deck deals from. Set by buildTransformationShows for
  // every deck in a run; omitted for a one-off build, which then gets its own.
  batch?: Batch;
}

export interface BuildResult {
  show?: Slideshow;
  error?: string;
}

// The durations that can actually be rolled for one variant: a package is
// assigned AND it holds photos. Without a library only the assignment is known.
export function usableStreaksIn(library: LibraryImage[] | undefined, variant: string): Streak[] {
  const assigned = getUsableStreaks(variant);
  if (!library) return assigned;
  return assigned.filter((s) => poolFor(library, getStreakToken(variant, s.key)).length > 0);
}

// Everything a deck needs before it can be built. Surfaced by the view so the
// user is told exactly which package is missing rather than getting a broken deck.
// `library` is optional: without it only the picks are checked, with it the
// packages are also checked for actually holding photos.
export function missingPieces(character: Character, library?: LibraryImage[]): string[] {
  const missing: string[] = [];
  const empty = (token: string) => !token || (library ? poolFor(library, token).length === 0 : false);
  const variant = variantOf(character);
  if (empty(character.beforeToken)) missing.push('a before package');
  if (empty(character.afterToken)) missing.push('an after package');
  if (empty(character.girlfriendToken)) missing.push('a girlfriend package');
  if (empty(getBlockedToken(variant))) missing.push('a blocked 🌽 package');
  if (usableStreaksIn(library, variant).length === 0) missing.push('an Upshift streak package');
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
  const batch = opts.batch ?? makeBatch(character, library);
  const streak: Streak =
    (opts.streakKey ? streakByKey(opts.streakKey) : undefined) ?? batch.streaks.next()!;

  const blockedShot = batch.blocked.next();
  const streakShot = streakShotsFor(batch, library, streak.key).next();
  if (!blockedShot || !streakShot)
    return { error: `The shared packages have no photos for ${streak.label}.` };

  // The deck always closes on the girlfriend shot, so it is drawn up front —
  // missingPieces already guaranteed the package holds photos.
  const girlfriendShot = batch.girlfriend.next();
  if (!girlfriendShot) return { error: `${character.name} has no girlfriend photos.` };

  const hook = fillHook(opts.hookTemplate ?? batch.hooks.next()!, streak);
  const cleanLine = `${streak.label} clean`;
  // The post's own caption/hashtags — short, and dealt so a batch works through
  // the lines instead of publishing the same one five times.
  const { caption, hashtags } = batch.caption(streak);

  const beforeShots = deal(batch.before, randInt(2, 3));
  // One after shot before the proof slides, then 0–1 more after them; the
  // closing slide is the girlfriend shot rather than another after photo.
  const afterShots = deal(batch.after, 1 + randInt(0, 1));

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
    // The proof slides keep the same line — the screenshot backs up the claim
    // rather than replacing it.
    slide(cleanLine, blockedShot),
    slide(cleanLine, streakShot),
    ...afterShots.slice(1).map((img) => slide(cleanLine, img)),
    // The closer: same line, the payoff shot.
    slide(cleanLine, girlfriendShot),
  ];

  return {
    show: {
      id: `q-${stamp}-${rand}`,
      // Flags the deck for the video exporter: after slides hold longer and the
      // music drop is timed to the before→after cut (see lib/render.ts).
      kind: 'characters',
      beforeSlides: beforeShots.length,
      hook,
      caption,
      hashtags,
      rationale: `${character.name} · ${streak.label} · ${beforeShots.length} before / ${afterShots.length} after + girlfriend`,
      createdAt: new Date(stamp).toISOString(),
      slides,
    },
  };
}

// Build several decks at once. Each one re-rolls its own hook, streak, photos
// and slide counts — but off SHARED bags, so a batch of five is five different
// decks rather than five independent rolls that happen to collide.
export function buildTransformationShows(
  character: Character,
  library: LibraryImage[],
  count: number,
  opts: BuildOptions = {}
): BuildResult[] {
  const batch = makeBatch(character, library);
  return Array.from({ length: Math.max(1, count) }, () =>
    buildTransformationShow(character, library, { ...opts, batch })
  );
}
