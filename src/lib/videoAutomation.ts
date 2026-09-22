// The Video tool's automation: everything between "pick a character" and "hand
// the renderer a plan". Nothing here draws — it rolls the same choices a
// slideshow deck rolls (streak, hook, which photos), pairs them with a
// character track whose drop and beat grid were pinned in Brain, and lays the
// result out on that grid (lib/beatPlan.ts).
import type { LibraryImage } from '../types';
import { clipPoolFor, poolFor, usableStreaksIn, type Selection } from './transformationDeck';
import {
  getBlockedToken,
  getStreakToken,
  streakByKey,
  variantOf,
  type Character,
  type Streak,
} from './characters';
import { HOOKS, CLOSING_LINES, fillHook } from './transformationHooks';
import { makeCaptionPicker, type CaptionPicker } from './transformationCaptions';
import { listAllTracks, type MusicListItem } from './music';
import { beatsInRange, getBeats } from './musicBeats';
import { buildBeatPlan, type BeatPlan, type BeatPlanOptions } from './beatPlan';
import { fillsOf, listFormats, shapeOf, type VideoFormat } from './videoFormats';
import type { BeatVideoAssets, BeatVideoCaptions } from './beatVideo';

// A character track this tool can use: it has beat markers. The drop is taken
// from Brain when one is pinned and worked out from the markers when it isn't.
//
// Requiring a pinned drop is what this used to do, and it made the whole tool
// look broken: a track could carry a full hand-marked grid and still be
// silently dropped from the list because a SECOND, separate pin was missing,
// with nothing on screen saying so. Markers are the thing that takes work;
// the drop has a sensible answer derivable from them.
export interface ReadyTrack {
  item: MusicListItem;
  beats: number[];
  drop: number;
  // Whether that drop was pinned by hand or worked out here, so the view can
  // say which and invite a correction.
  dropSource: 'pinned' | 'auto';
  // A display name — local uploads carry one, bundled tracks are the filename.
  name: string;
  // Set when this entry came from a FORMAT (lib/videoFormats.ts) rather than
  // from a track somebody marked in Brain: the grid, the drop, the length and
  // the holes are then the format's, not the track's.
  format?: VideoFormat;
  // Windows that show one particular thing, and windows the picture goes black
  // for — both in track seconds, both from the format's own edit.
  fills?: { from: number; to: number; kind: 'app' | 'clip'; cuts?: number }[];
  gaps?: { from: number; to: number }[];
  // How long each half runs. A format is planned to ITS OWN length; a
  // hand-marked track leaves this undefined and plans the way it always did.
  shape?: { intro?: number; outro?: number };
}

// Where the glow-up should land when nobody has pinned it: the first marker far
// enough in to leave a full intro of photos, falling back to the middle of a
// grid too short for that. It always lands ON a marker, so the edit is on the
// grid either way.
const AUTO_DROP_INTRO_SECONDS = 7;

export function autoDrop(beats: number[]): number {
  const target = beats[0] + AUTO_DROP_INTRO_SECONDS;
  const found = beats.find((b) => b >= target);
  if (found !== undefined && beats[beats.length - 1] - found >= 3) return found;
  return beats[Math.floor(beats.length / 2)];
}

export async function listReadyTracks(): Promise<ReadyTrack[]> {
  const tracks = await listAllTracks('characters');
  const out: ReadyTrack[] = [];
  for (const item of tracks) {
    const saved = getBeats(item.file);
    if (!saved) continue;
    const beats = beatsInRange(saved);
    // Six markers is what buildBeatPlan needs: two either side of the drop,
    // plus the drop itself.
    if (beats.length < 6) continue;
    // A pinned drop outside the marked range can't be cut to — it would put the
    // whole edit off the grid — so fall back to a derived one rather than
    // dropping the track.
    const pinned =
      item.drop !== undefined && item.drop >= beats[0] && item.drop <= beats[beats.length - 1]
        ? item.drop
        : undefined;
    const drop = pinned ?? autoDrop(beats);
    out.push({
      item,
      beats,
      drop,
      dropSource: pinned !== undefined ? 'pinned' : 'auto',
      name: item.name || item.file,
    });
  }

  // ── Formats ──────────────────────────────────────────────────────────────
  // A format is a finished edit shipped with the app: its own grid, its own
  // drop, its own length and its own holes, cut to one track. It is listed
  // ALONGSIDE the hand-marked tracks rather than instead of them — a format is
  // one way to cut a song, not a claim that the song can't be cut another way.
  //
  // A format whose track isn't in the library is skipped: without the audio
  // there is nothing to cut to.
  for (const format of await listFormats()) {
    const item = tracks.find((t) => t.file === format.track);
    if (!item) continue;
    out.push({
      item,
      beats: format.beats,
      drop: format.drop,
      dropSource: 'pinned',
      name: `${format.label} — ${item.name || item.file}`,
      format,
      shape: shapeOf(format),
      fills: fillsOf(format),
      gaps: format.gaps?.map((g) => ({ from: g.from, to: g.to })),
    });
  }
  return out;
}

// Why a character can't be turned into a video yet — the same shape as
// missingPieces() in transformationDeck, extended with the two packages only
// this tool needs. The app screenshots are checked here too: they're automatic,
// but they still have to exist.
export function missingVideoPieces(
  character: Character,
  library: LibraryImage[],
  style?: VideoStyle | '',
): string[] {
  const missing: string[] = [];
  // Only asked for when showcase was PINNED. Rolling styles just skips it, so a
  // character without the stats packages is never reported as incomplete. Named
  // separately so the view says WHICH half is missing — with two packages,
  // "a stats package" would leave you hunting for which.
  if (style === 'showcase') {
    if (statsPool(library, character.statsInToken).length === 0) {
      missing.push('a stats package for the drop');
    }
    if (statsPool(library, character.statsOutToken).length === 0) {
      missing.push('a stats package for the close');
    }
  }
  const variant = variantOf(character);
  if (poolFor(library, character.beforeToken).length === 0) missing.push('a before package');
  if (poolFor(library, getBlockedToken(variant)).length === 0) missing.push('a blocked 🌽 package');
  if (usableStreaksIn(library, variant).length === 0) missing.push('an Upshift streak package');
  if (clipPoolFor(library, character.videoToken).length === 0) missing.push('a video package with clips');
  return missing;
}

const shuffle = <T,>(list: T[]): T[] => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

// ── What kind of edit this is ───────────────────────────────────────────────
// Three ways of using the app screenshots, so a batch can be compared against
// itself rather than guessed at:
//
//   showcase — the character's OWN stats: one package holds into the drop, a
//              second closes the video. Needs both on the character.
//   plain    — no stats. The edit this tool made before they existed, kept as
//              the control to compare showcase against.
//
// There was a third, 'appEdit', which scattered the shared blocked/streak
// screenshots through the chopped half. It is gone: the chopped half draws from
// one package now and nothing else, which is that style's entire definition
// removed. 'appEdit' is still ACCEPTED as a saved value and read as 'plain', so
// a pinned style from before doesn't throw.
export type VideoStyle = 'showcase' | 'plain';
export const VIDEO_STYLES: { key: VideoStyle; label: string; hint: string }[] = [
  { key: 'showcase', label: 'Showcase', hint: 'their stats before the drop and at the end' },
  { key: 'plain', label: 'Plain', hint: 'chopped shots, screenshots into the drop, clips' },
];

// Which styles this character can actually be cut as. Showcase needs BOTH stats
// packages, so a character with only one never rolls it — rather than the style
// being offered and then failing at render.
export function stylesFor(character: Character, library: LibraryImage[]): VideoStyle[] {
  const usable: VideoStyle[] = ['plain'];
  if (statsPool(library, character.statsInToken).length && statsPool(library, character.statsOutToken).length) {
    usable.unshift('showcase');
  }
  return usable;
}

// One stats package, stills and clips together — a stats screen works as either
// and the renderer decides per asset, so there is no reason to split them here.
function statsPool(library: LibraryImage[], sel: Selection): LibraryImage[] {
  return [...poolFor(library, sel), ...clipPoolFor(library, sel)];
}

export interface VideoBuildOptions extends BeatPlanOptions {
  streakKey?: string;   // '' / undefined = rolled per video
  hookTemplate?: string; // '' / undefined = rolled per video
  style?: VideoStyle | ''; // '' / undefined = rolled per video
  // The batch's caption dealer. Captions are dealt out of a shuffled bag so a
  // batch works through every line before reusing one, which only works if the
  // WHOLE batch shares one picker — hence passed in rather than made here.
  captions?: CaptionPicker;
}

export interface VideoBuild {
  plan: BeatPlan;
  // Which style this video rolled, so the row can label it and a batch can be
  // read back afterwards.
  style: VideoStyle;
  assets: BeatVideoAssets;
  captions: BeatVideoCaptions;
  track: ReadyTrack;
  streak: Streak;
  hook: string;
  // For the filename and the row's label.
  title: string;
  // The post text that ships beside the file, exactly as a slideshow's does:
  // the .txt sidecar is built from the hook, this caption and these hashtags.
  // Hashtags are stored WITHOUT the '#', the same convention decks use.
  caption: string;
  hashtags: string[];
}

// Assemble one video. Throws with a readable reason rather than returning a
// half-built job — the view renders these one at a time and reports per row.
export function buildVideo(
  character: Character,
  library: LibraryImage[],
  track: ReadyTrack,
  opts: VideoBuildOptions = {},
): VideoBuild {
  const missing = missingVideoPieces(character, library, opts.style);
  if (missing.length) throw new Error(`${character.name} is missing ${missing.join(', ')}.`);

  const variant = variantOf(character);
  const usable = usableStreaksIn(library, variant);
  const streak =
    (opts.streakKey ? streakByKey(opts.streakKey) : undefined) ??
    usable[Math.floor(Math.random() * usable.length)];
  const hookTemplate = opts.hookTemplate || HOOKS[Math.floor(Math.random() * HOOKS.length)];
  const hook = fillHook(hookTemplate, streak);
  const clean = `${streak.label} clean`;
  // No picker passed (a one-off build) → a private one, which is just an
  // independent random caption. Fine for one video, wrong for a batch.
  const { caption, hashtags } = (opts.captions ?? makeCaptionPicker())(streak);

  // The style, rolled out of what this character can actually do unless one was
  // pinned. A pinned style the character can't do is an error rather than a
  // silent downgrade — the whole point of pinning one is to test it.
  const usableStyles = stylesFor(character, library);
  // 'appEdit' was retired; a pinned one saved before that reads as 'plain'.
  const wanted = (opts.style as string) === 'appEdit' ? 'plain' : opts.style;
  if (wanted && !usableStyles.includes(wanted)) {
    throw new Error(`${character.name} can't be cut as ${wanted} — no stats package.`);
  }
  const style: VideoStyle = wanted || usableStyles[Math.floor(Math.random() * usableStyles.length)];

  const plan = buildBeatPlan(track.beats, track.drop, {
    shape: track.shape,
    fills: track.fills,
    gaps: track.gaps,
    ...opts,
    stats: style === 'showcase',
  });

  // The app screenshots the plan cuts in: the 🌽-blocked shots and the streak
  // shots for the duration this video rolled, interleaved so the two proofs
  // alternate as the edit accelerates. Picked automatically — the user never
  // chooses these, they come from the character's variant.
  const blocked = shuffle(poolFor(library, getBlockedToken(variant)));
  const streakShots = shuffle(poolFor(library, getStreakToken(variant, streak.key)));
  const app: LibraryImage[] = [];
  for (let i = 0; i < Math.max(blocked.length, streakShots.length); i++) {
    if (blocked[i]) app.push(blocked[i]);
    if (streakShots[i]) app.push(streakShots[i]);
  }

  // The two stats slots, each drawn from ITS OWN package — the plan's index 0 is
  // the hold into the drop and index 1 the close, so the array is built in that
  // order rather than sorted into it. Which shot comes out of a package is
  // random (a package may hold several); which package feeds which slot is not.
  const stats =
    style === 'showcase'
      ? [
          shuffle(statsPool(library, character.statsInToken))[0],
          shuffle(statsPool(library, character.statsOutToken))[0],
        ].filter((x): x is LibraryImage => !!x)
      : [];

  // The chopped half, and the ONLY thing in it: the character's chopped folder,
  // stills and clips together. Clips are included because that folder is allowed
  // to hold them — the renderer decides per asset whether a cut shows a still or
  // a moving shot, so there is no reason to throw the clips away here.
  const chopToken = character.beforeToken;
  const chop = shuffle([...poolFor(library, chopToken), ...clipPoolFor(library, chopToken)]);
  // Stills only: these are the fast cuts between clips, and a clip there would
  // be a half-second flash of something moving.
  const gymPool = shuffle(poolFor(library, character.gymToken));

  return {
    plan,
    assets: {
      chop,
      // Gym stills punctuate the clips AFTER the drop now — they are gone from
      // the chopped half entirely. Without a gym package the plan's gym slots
      // fall back to the chopped folder rather than leaving holes in the edit.
      gym: gymPool.length ? gymPool : chop,
      app,
      clips: shuffle(clipPoolFor(library, character.videoToken)),
      stats,
    },
    captions: {
      hook,
      clean,
      // The few hooks that pay themselves off keep their own closer, exactly as
      // a deck's last slide does.
      closing: CLOSING_LINES[hookTemplate] ?? clean,
    },
    track,
    streak,
    hook,
    style,
    title: `${character.name} - ${streak.label} - ${hook}`,
    caption,
    hashtags,
  };
}
