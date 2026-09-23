// The Video tool's EDIT — worked out as pure data before a single frame is
// drawn, so the view can show the structure (the same way the Characters tab
// shows a deck's shape) and the renderer only has to execute it.
//
// The music is the timeline, not the slides. Everything is cut on the beat grid
// the user detected/corrected in Brain (lib/musicBeats.ts), anchored to the drop
// they pinned there (lib/musicDrops.ts):
//
//   … chopped shots, one per MARKER …  app screenshots, twice per marker
//   ─────────────────────────── DROP ───────────────────────────
//   their clips, each held across markers, punctuated by gym stills
//
// A showcase (opts.stats) replaces the app screenshots with the character's own
// stats and closes on a second one:
//
//   … chopped photos, one per MARKER …  [ their stats, holding ]
//   ─────────────────────────── DROP ───────────────────────────
//   their clips, each cut on a marker …  [ their stats, closing ]
//
// Every cut in the video is one of the markers the user placed by hand — the
// phases are carved out of that grid, never laid over the top of it. Two songs
// marked differently therefore produce two genuinely different videos, which is
// the point.
//
// Segment times are seconds ON THE TRACK, plus the same times rebased to the
// exported video (`from`/`to`), because the export starts partway into the song.

// What a segment shows. The renderer maps these onto real assets; the view uses
// them for the structure strip.
// 'gap' is a deliberate HOLE: black picture, for as long as the markers give
// it. It shows nothing at all, which is the point — a hole on the beat reads as
// part of the rhythm, and an edit that has one is wrong without it. Gaps are
// never invented here; they come from the track's own edit (lib/music.ts).
export type SegmentKind = 'chop' | 'gym' | 'app' | 'clip' | 'stats' | 'gap';

export interface Segment {
  kind: SegmentKind;
  // Seconds into the EXPORTED video.
  from: number;
  to: number;
  // Which asset out of that kind's pool — the renderer deals them in order.
  index: number;
  // Dead field, kept so saved plans still parse. It used to drive the photo
  // "beat punch" — the renderer no longer scales anything, so it is ignored.
  punch: boolean;
  // 'stats' only, and only when that slot deals a CLIP: how fast to play it so
  // it fills the slot exactly. Unset everywhere else (and on a stats slot that
  // deals a still, where there is nothing to speed up). See statsRate().
  rate?: number;
}

// The four phase COUNTS plus the showcase flag — the part of the options a plan
// reports back about itself (`BeatPlan.shape`). Kept apart from the rest of the
// options because a plan can report every one of these, and cannot report a
// format's windows: those are inputs, not results.
export interface BeatPlanCounts {
  // How many beats of chopped photos run before the drop.
  introBeats?: number;
  // How many of those closing beats are app screenshots (blocked 🌽 / streak),
  // and are cut at double speed — two shots per beat — as the drop approaches.
  appBeats?: number;
  // Kept for the saved-plan format only. Clips now change on EVERY marker, so
  // there is no per-clip beat count to set; buildBeatPlan ignores this.
  clipBeats?: number;
  // How many beats of clips run after the drop.
  outroBeats?: number;
  // Cut the character's own stats package in twice — once holding into the
  // drop, once closing the video. Off by default: a plan built without it is
  // byte-for-byte the edit this tool made before stats existed.
  stats?: boolean;
}

export interface BeatPlanOptions extends BeatPlanCounts {
  // How many SECONDS the two halves run for, when the track ships with its own
  // split (lib/music.ts `sections`). SHAPE_SECONDS below is the generic answer
  // — 7s of chopped photos, 9s of clips, which is right for a song nobody has
  // cut by hand. A track that HAS been cut by hand knows better: its hook is
  // however long its hook is. These override the two windows and nothing else,
  // so every other rule (every marker is a cut, the app phase, the stats slots)
  // still applies.
  shape?: { intro?: number; outro?: number };
  // Windows, in TRACK seconds, that show one particular thing wherever they
  // fall, rather than wherever this planner would otherwise have put it. A
  // format puts its material where its edit puts it: in the plain cut of
  // "addiction" the 1.5s window early in the first half is app screenshots,
  // and in the showcase cut the 1.5s window at the end is one of the
  // character's own clips.
  //
  // `cuts` is the FEWEST shots the window may show. A window that falls between
  // two markers is one long hold otherwise — a single screenshot up for a
  // second and a half, which in an edit cutting twice a second reads as the
  // video having stopped. When the markers inside don't already give that many
  // cuts, the window is divided evenly into `cuts` of them. The markers are not
  // touched: this is the one place a cut is made without one, and it is made
  // because the window's own content demands it.
  //
  // A window that no marker lines up with SPLITS whatever segment contains it,
  // so the edit gets its cut where the format says it is, and the material
  // either side of it keeps what it was.
  fills?: { from: number; to: number; kind: 'app' | 'clip'; cuts?: number }[];
  // Windows, in TRACK seconds, that the picture goes black for — again from the
  // track's own edit. A segment that falls inside one becomes a 'gap' instead
  // of being dealt an asset. The markers on either side of a gap are what give
  // it its edges, so a gap between two markers survives every other rule here.
  gaps?: { from: number; to: number }[];
}

// Fallback shape, used only when a track's tempo can't be read. Every real
// track gets its shape from derivePlanShape() below instead.
export const PLAN_DEFAULTS: Required<BeatPlanCounts> = {
  introBeats: 16,
  appBeats: 4,
  clipBeats: 4,
  outroBeats: 16,
  stats: false,
};

// ── Shaping the edit to the song ────────────────────────────────────────────
// A fixed beat count is the wrong unit, and it was what made every export feel
// the same. 16 beats is 12 seconds of a 80 BPM slowed edit and 6 seconds of a
// 160 BPM trap beat — the same number, two completely different videos, one of
// them far too long before anything happens.
//
// A viewer experiences SECONDS. So the shape is specified in seconds and each
// phase takes WHATEVER MARKERS FALL INSIDE ITS WINDOW — which is the only thing
// that works on the real grids in this app. Those are marked by hand, one per
// hard kick, and they are deliberately irregular: measured across the 11 saved
// grids, tracks carry 13-32 markers over 11-21 seconds with gaps anywhere from
// 0.14s to 3.8s. Counting "16 beats" into a grid like that means something
// different on every song and nothing musical on any of them. Counting seconds
// means the same thing everywhere, and every marker the user placed still gets
// its cut.
const SHAPE_SECONDS = {
  // Chopped photos before the drop. Long enough to build, short enough that the
  // drop still arrives before a scroll.
  intro: 7,
  // App screenshots running into the drop, cut twice a beat.
  app: 1.6,
  // How long one clip holds after the drop.
  clip: 1.8,
  // Clips after the drop — the payoff, and the longest phase.
  outro: 9,
  // The stats slots. Both are taken out of the intro's 7s and the outro's 9s
  // rather than added to them, so turning stats on doesn't make the video
  // longer.
  //
  // 1.6s because the stats clips themselves are about 1.5s. The slot's real
  // length is whatever the nearest markers give (see below), and the clip is
  // then stretched or squeezed to fill it exactly — so aiming the window at the
  // source's own length keeps that adjustment small. Asking for 2.4s from a
  // 1.5s clip would mean playing everything at 0.6x.
  statsIn: 1.6,
  statsOut: 1.6,
};

// How many gym stills run between two clips after the drop. Two is a beat of
// punctuation; more and the clips stop being the point of the second half.
const GYM_BURST = 2;

// ── Fitting a stats CLIP to its slot ────────────────────────────────────────
// The slot's length comes from the markers; the clip's length is whatever was
// filmed. The clip is ALWAYS stretched or squeezed to fill the slot exactly —
// the renderer sets playbackRate, and since clips render muted (the music is
// the soundtrack) speed costs nothing.
//
// It always fits rather than sometimes trimming, because a stats clip is one
// continuous shot of a number going up: cut it short and it stops mid-count,
// leave it short and the slot freezes on the last frame for the remainder.
// Both are worse than playing it a bit off-speed. Keeping SHAPE_SECONDS.statsIn
// and .statsOut near the clips' own length is what keeps "a bit" honest.
//
// The clamp is not a style choice — it is the range browsers will actually play
// a media element at. Outside it playbackRate is ignored or throws, so a slot
// that far off its clip gets the closest speed that works and holds the last
// frame for what's left.
const RATE_MIN = 0.0625;
const RATE_MAX = 16;

export function statsRate(clipSeconds: number, slotSeconds: number): number {
  if (!(clipSeconds > 0) || !(slotSeconds > 0)) return 1;
  return Math.min(RATE_MAX, Math.max(RATE_MIN, clipSeconds / slotSeconds));
}

// The beat period at the drop, in seconds: the median gap over the 16 beats
// around it. Median, not mean, so one mis-detected marker doesn't skew it, and
// local rather than track-wide so a grid that was hand-corrected in one section
// still reads its own tempo.
function periodAt(beats: number[], idx: number): number {
  const a = Math.max(1, idx - 8);
  const b = Math.min(beats.length - 1, idx + 8);
  const gaps: number[] = [];
  for (let i = a; i <= b; i++) gaps.push(beats[i] - beats[i - 1]);
  if (!gaps.length) return 0;
  gaps.sort((x, y) => x - y);
  return gaps[Math.floor(gaps.length / 2)];
}

// How many markers a track puts inside each phase. Purely informational — the
// plan itself selects by TIME (see below), and this reports what that came to,
// so the view can show real numbers on the sliders.
export function derivePlanShape(beats: number[], drop: number): Required<BeatPlanCounts> {
  const d = nearestBeat(beats, drop);
  const t = beats[d];
  const countBetween = (a: number, b: number) => beats.filter((x) => x >= a && x < b).length;
  return {
    introBeats: countBetween(t - SHAPE_SECONDS.intro, t),
    appBeats: countBetween(t - SHAPE_SECONDS.app, t),
    clipBeats: Math.max(1, countBetween(t, t + SHAPE_SECONDS.clip)),
    outroBeats: countBetween(t, t + SHAPE_SECONDS.outro),
    stats: false,
  };
}

export interface BeatPlan {
  // Where in the TRACK the export starts and ends.
  audioFrom: number;
  audioTo: number;
  // Where the drop lands in the exported video — the PINNED second, rebased.
  //
  // This used to be the nearest marker instead, and that was wrong in exactly
  // the way buildBeatPlan goes out of its way to avoid for the picture: on a
  // real grid the nearest marker sits 0.5-1.3s AFTER a pinned drop, because a
  // drop lands at the end of a build where the grid is sparse. Everything cued
  // off this — the caption switch, the stinger — therefore arrived a beat late
  // while the picture cut on time. It is the moment the drop is heard, and it
  // is the same instant the first clip begins.
  dropAt: number;
  duration: number;
  segments: Segment[];
  // How many distinct clips the plan asks for, so the view can warn when the
  // pack holds fewer (they get reused rather than leaving a gap).
  clipCount: number;
  // The beat counts this plan actually ran with, derived from the track unless
  // the caller overrode them — so the view can show what the song produced.
  shape: Required<BeatPlanCounts>;
  // The tempo those counts were derived from, for the same reason.
  bpm: number;
}

// The beat closest to `t`. Beat grids are dense, so a plain scan is fine and
// keeps this dependency-free.
function nearestBeat(beats: number[], t: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < beats.length; i++) {
    const d = Math.abs(beats[i] - t);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

// Build the edit. Throws with a readable message when the grid can't carry the
// requested shape — the view surfaces it instead of rendering something broken.
export function buildBeatPlan(beats: number[], drop: number, opts: BeatPlanOptions = {}): BeatPlan {
  if (beats.length < 6) {
    throw new Error('This track has too few beat markers — mark some more in Brain first.');
  }

  // THE DROP IS NOT SNAPPED TO A MARKER. It used to be — nearestBeat() moved it
  // to whichever marker sat closest — and that is what made the clips arrive a
  // beat or two after the drop. Measured on the tracks in this app, the nearest
  // marker to a pinned drop was 514-1263ms LATER in every case, because a drop
  // lands after a build where the grid is sparse, so the closest marker is the
  // first kick of the new section rather than the moment the drop hits.
  //
  // The pinned second is a person saying "here". It is used exactly.
  const snapIdx = nearestBeat(beats, drop);
  // Unless a marker is close enough to BE the drop — within 80ms nobody can
  // hear the difference, and using it avoids leaving a sliver of a segment.
  const snapped = Math.abs(beats[snapIdx] - drop) <= 0.08;
  const dropT = snapped ? beats[snapIdx] : drop;
  // Where the clips start counting markers from: the first one at or after the
  // drop, so every cut AFTER the first still lands on a marker.
  const dropIdx = snapped ? snapIdx : beats.findIndex((b) => b >= dropT);
  const period = periodAt(beats, dropIdx);

  // ── Phase boundaries, chosen by TIME ─────────────────────────────────────
  // Each edge is the marker nearest the window's edge, so every boundary still
  // lands exactly on one of the user's own markers — the phases are cut out of
  // their grid, never laid over the top of it.
  //
  // An explicit option still wins, and is read as a MARKER COUNT, which is what
  // the sliders hand over when someone pins one.
  const firstAtOrAfter = (t: number) => {
    const i = beats.findIndex((b) => b >= t);
    return i < 0 ? beats.length - 1 : i;
  };
  const lastAtOrBefore = (t: number) => {
    let i = beats.length - 1;
    while (i > 0 && beats[i] > t) i--;
    return i;
  };

  // The track's own halves win over the generic windows; an explicit marker
  // count (a slider someone moved) still wins over both.
  const introSecs = opts.shape?.intro ?? SHAPE_SECONDS.intro;
  const outroSecs = opts.shape?.outro ?? SHAPE_SECONDS.outro;
  const startIdx =
    opts.introBeats != null
      ? Math.max(0, dropIdx - opts.introBeats)
      : Math.min(dropIdx, firstAtOrAfter(dropT - introSecs));
  const endIdx =
    opts.outroBeats != null
      ? Math.min(beats.length - 1, dropIdx + opts.outroBeats)
      : Math.max(dropIdx, lastAtOrBefore(dropT + outroSecs));
  // The app screenshots are a COUNT OF MARKERS, not a time window, and this is
  // the one phase that has to be. On a sparse hand-marked grid the last 1.6s
  // before the drop can hold no markers at all, and a purely time-based window
  // then produced no screenshots whatsoever — measured on the saved grids, that
  // was 4 tracks out of 11 silently losing the phase. At least two markers, at
  // most six, and never more than the intro can spare.
  //
  // A SHOWCASE has no app phase at all. The only app screenshots in that edit
  // are the character's own paired stats, so the shared blocked/streak shots —
  // which is what this phase cuts — have no place in it. Those markers go back
  // to the chopped rotation and the stats hold runs straight into the drop.
  const appWindow = dropIdx - firstAtOrAfter(dropT - SHAPE_SECONDS.app);
  const appCount = opts.stats ? 0 : (opts.appBeats ?? Math.max(2, Math.min(6, appWindow)));
  const appFrom = Math.max(startIdx, dropIdx - appCount);

  // ── The two stats slots ──────────────────────────────────────────────────
  // This is the one segment that deliberately SPANS markers. Everything else
  // cuts on every marker the user placed; a stats screen needs 2-3 seconds to
  // be read, which on these grids is several markers. So it holds — but both
  // its edges are still snapped to markers, so the slot is cut OUT OF the grid
  // exactly like every other phase, and the cut into it and out of it both land
  // on a beat.
  //
  // Both windows are carved out of phases that already exist rather than added
  // to them, so switching stats on does not lengthen the video:
  //
  //   chop … [ STATS ] app app app ─ DROP ─ clip clip clip … [ STATS ]
  //
  // The pre-drop one sits BEFORE the screenshots, not after. The screenshots
  // accelerate into the drop, and an acceleration only reads as one if
  // something held still first — putting the hold last would flatten it.
  //
  // -1 means "no slot": either it wasn't asked for, or the grid is too tight to
  // give one up without eating a phase whole.
  let statsInFrom = -1;
  let statsOutFrom = -1;
  if (opts.stats) {
    // NEAREST marker to the window's edge, not the first one past it. Snapping
    // forwards only would shorten the slot by up to a whole gap — on the grids
    // in this app that turned a 2.0s hold into 1.4s — and a stats screen that
    // is half a second short is the difference between reading the number and
    // not.
    //
    // At least two markers of chopped photos have to survive in front of it,
    // otherwise the video opens on the stats instead of building to them.
    const want = nearestBeat(beats, beats[appFrom] - SHAPE_SECONDS.statsIn);
    if (want >= startIdx + 2 && want < appFrom) statsInFrom = want;
    // Same on the other side: at least two markers of clips have to land after
    // the drop before the video closes on the stats.
    // …unless the format fills the end itself. A closing stats screen and a
    // format that says the video closes on a clip are the same slot claimed
    // twice, and the format wins: it is a finished edit, this is a default.
    const wantOut = nearestBeat(beats, beats[endIdx] - SHAPE_SECONDS.statsOut);
    const tailFilled = (opts.fills ?? []).some((f) => f.to > beats[wantOut] && f.from < beats[endIdx]);
    if (wantOut >= dropIdx + 2 && wantOut < endIdx && !tailFilled) statsOutFrom = wantOut;
  }

  // Two markers a side is the real floor: one cut of photos into the drop, and
  // one clip out of it. Below that there is no edit to build.
  if (dropIdx - startIdx < 2 || endIdx - dropIdx < 2) {
    throw new Error(
      'The drop sits too close to the start or the end of the marked beats — mark more of the track in Brain, or move the drop.'
    );
  }

  const audioFrom = beats[startIdx];
  const audioTo = beats[endIdx];
  if (!(dropIdx > startIdx)) {
    throw new Error('The drop sits at or before the first marked beat — mark more of the track before it in Brain.');
  }
  const rebase = (t: number) => t - audioFrom;

  const segments: Segment[] = [];
  // ── Before the drop ──────────────────────────────────────────────────────
  // EVERY MARKER IS A CUT. The gaps are whatever the user marked, so a stretch
  // they marked densely cuts fast and a sparse one holds — which is the whole
  // point of marking them by hand.
  let chop = 0;
  let app = 0;
  for (let i = startIdx; i < dropIdx; i++) {
    const a = beats[i];
    // The last photo/screenshot before the drop is trimmed to END on the drop,
    // so the picture changes exactly there rather than at the next marker.
    const b = Math.min(beats[i + 1], dropT);
    if (b <= a) continue;
    if (statsInFrom >= 0 && i >= statsInFrom && i < appFrom) {
      // Inside the hold: one segment covering the whole window, emitted on the
      // marker it starts at and then skipped over.
      if (i === statsInFrom) {
        segments.push({
          kind: 'stats',
          from: rebase(beats[statsInFrom]),
          // Trimmed to END on the drop, exactly as the last photo before it is.
          // Without this a showcase — which has no app phase, so the hold runs
          // right up to the drop — would overlap the first clip by however far
          // the pinned drop sits ahead of its marker.
          to: rebase(Math.min(beats[appFrom], dropT)),
          index: 0,
          punch: false,
        });
      }
    } else if (i < appFrom) {
      // ONE package feeds the chopped half — the character's own chopped
      // folder, nothing else. This used to put a gym shot on every third
      // marker, which meant the run before the drop was two packages
      // interleaved and you could not tell by looking which folder a given
      // shot had come from. The 'gym' kind stays in SegmentKind so saved plans
      // still parse; nothing emits it any more.
      segments.push({ kind: 'chop', from: rebase(a), to: rebase(b), index: chop++, punch: true });
    } else {
      // The app screenshots cut twice per marker, so the edit visibly
      // accelerates into the drop however the markers are spaced.
      const mid = (a + b) / 2;
      segments.push({ kind: 'app', from: rebase(a), to: rebase(mid), index: app++, punch: true });
      segments.push({ kind: 'app', from: rebase(mid), to: rebase(b), index: app++, punch: true });
    }
  }

  // ── On and after the drop ────────────────────────────────────────────────
  // ONE CUT PER MARKER, exactly like the photo half. The clips do not get a
  // longer slot than anything else: if the user marked a beat, the picture
  // changes there.
  //
  // With more markers than clips, a clip is CHOPPED — its next appearance
  // resumes where its last piece stopped rather than restarting, so a 4-second
  // clip becomes several consecutive pieces spread across the drop instead of
  // the same opening second over and over. The renderer owns that playhead
  // (it's the only thing that knows a clip's real duration); the plan just says
  // which clip each marker interval belongs to.
  // A CLIP HOLDS; PHOTOS SNAP. After the drop the two alternate, and they are
  // given different amounts of time on purpose:
  //
  //   clip ──────────  gym gym  clip ──────────  gym gym  clip ─────────
  //
  // A clip spans however many markers it takes to reach CLIP_HOLD seconds, so a
  // moving shot gets long enough to read as a shot rather than a flash. A gym
  // photo takes exactly one marker, because a still has nothing to develop and
  // holding it just stops the edit dead. Giving both a single marker — which is
  // what this did before — wasted the clips and made the second half uniform.
  //
  // Every boundary is still a marker, so the alternation rides the grid; a
  // denser stretch simply fits more of both.
  let clip = 0;
  let gym = 0;
  const clipsTo = statsOutFrom >= 0 ? statsOutFrom : endIdx;
  let i = dropIdx;
  while (i < clipsTo) {
    // ── one clip, held across markers ──────────────────────────────────────
    // The first begins ON the drop; every later one on its marker.
    const from = clip === 0 ? dropT : beats[i];
    // A last slot too short to be a shot is given to whatever came before it
    // instead of being pushed as a runt — the loop ends on the markers it has,
    // and without this the video closed on a third of a clip.
    const last = segments[segments.length - 1];
    if (beats[clipsTo] - from < SHAPE_SECONDS.clip / 2 && last && clip > 0) {
      last.to = rebase(beats[clipsTo]);
      break;
    }
    let j = i + 1;
    while (j < clipsTo && beats[j] - from < SHAPE_SECONDS.clip) j++;
    segments.push({ kind: 'clip', from: rebase(from), to: rebase(beats[j]), index: clip++, punch: false });
    i = j;

    // ── then a burst of gym stills, one marker each ────────────────────────
    // Skipped when the run would reach the end: the video should go out on a
    // clip (or the stats close), not on a photo.
    for (let n = 0; n < GYM_BURST && i < clipsTo - 1; n++, i++) {
      segments.push({ kind: 'gym', from: rebase(beats[i]), to: rebase(beats[i + 1]), index: gym++, punch: true });
    }
  }

  if (statsOutFrom >= 0) {
    segments.push({
      kind: 'stats',
      from: rebase(beats[statsOutFrom]),
      to: rebase(beats[endIdx]),
      index: 1,
      punch: false,
    });
  }

  // ── The holes ────────────────────────────────────────────────────────────
  // Applied LAST, over the finished segments: a gap is not a phase, it is a
  // window the picture is taken out of, and whatever phase the planner put
  // there keeps its place in the deal — the photo that would have shown simply
  // isn't shown. Matching on the segment's own window (not on overlap) means a
  // gap whose edges aren't markers changes nothing rather than half-blanking a
  // cut it doesn't line up with.
  // ── The app-screenshot windows ───────────────────────────────────────────
  // Same idea as the holes below, and applied before them: the window keeps its
  // cuts, only what fills them changes. Indexes are re-dealt afterwards so each
  // pool is handed out in playback order with nothing skipped — a chopped photo
  // that was going to show here must go to the next chopped slot instead of
  // being dropped on the floor.
  for (const win of opts.fills ?? []) {
    const winFrom = win.from - audioFrom;
    const winTo = win.to - audioFrom;
    let inside: number[] = [];
    segments.forEach((seg, i) => {
      if (seg.kind === 'gap' || seg.kind === 'stats') return;
      if (seg.from >= winFrom - 0.01 && seg.to <= winTo + 0.01) inside.push(i);
    });

    // Nothing lies inside it: the window sits within a single longer segment,
    // so that segment is cut at the window's edges. What is left either side
    // keeps its own kind and simply becomes shorter.
    if (!inside.length) {
      const host = segments.findIndex(
        (seg) => seg.kind !== 'gap' && seg.from <= winFrom + 0.01 && seg.to >= winTo - 0.01,
      );
      if (host < 0) continue;
      const seg = segments[host];
      const pieces: Segment[] = [];
      if (winFrom - seg.from > 0.01) pieces.push({ ...seg, to: winFrom });
      const mid = pieces.length;
      pieces.push({ ...seg, from: winFrom, to: winTo });
      if (seg.to - winTo > 0.01) pieces.push({ ...seg, from: winTo, to: seg.to });
      segments.splice(host, 1, ...pieces);
      inside = [host + mid];
    }

    const want = Math.max(1, win.cuts ?? 1);
    if (inside.length >= want) {
      for (const i of inside) segments[i].kind = win.kind;
      continue;
    }
    // Too few markers in there to carry the window: divide it evenly instead.
    // The window's own edges are kept exactly, so what sits either side of it —
    // the cut in front, the hole behind — is untouched.
    const from = segments[inside[0]].from;
    const to = segments[inside[inside.length - 1]].to;
    const made: Segment[] = [];
    for (let k = 0; k < want; k++) {
      made.push({
        kind: win.kind,
        from: from + ((to - from) * k) / want,
        to: from + ((to - from) * (k + 1)) / want,
        index: k,
        punch: true,
      });
    }
    segments.splice(inside[0], inside.length, ...made);
  }

  for (const gap of opts.gaps ?? []) {
    const gapFrom = gap.from - audioFrom;
    const gapTo = gap.to - audioFrom;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (seg.from >= gapFrom - 0.01 && seg.to <= gapTo + 0.01) {
        seg.kind = 'gap';
        continue;
      }
      // A longer segment the hole sits across — a stats hold running into the
      // drop — is cut at the hole's edges, the same way a fill window cuts its
      // host above. Without this the hold swallowed the hole whole.
      const cutFrom = Math.max(seg.from, gapFrom);
      const cutTo = Math.min(seg.to, gapTo);
      if (cutTo - cutFrom <= 0.01) continue;
      const pieces: Segment[] = [];
      if (cutFrom - seg.from > 0.01) pieces.push({ ...seg, to: cutFrom });
      pieces.push({ ...seg, kind: 'gap', from: cutFrom, to: cutTo });
      if (seg.to - cutTo > 0.01) pieces.push({ ...seg, from: cutTo });
      segments.splice(i, 1, ...pieces);
      i += pieces.length - 1;
    }
  }

  // Re-deal every pool in playback order. A segment that changed kind above (or
  // became a hole) would otherwise leave a number unused, which shows up as a
  // photo that never appears while another is used twice.
  const dealt: Partial<Record<SegmentKind, number>> = {};
  for (const seg of segments) {
    if (seg.kind === 'gap' || seg.kind === 'stats') continue;
    dealt[seg.kind] = dealt[seg.kind] ?? 0;
    seg.index = dealt[seg.kind]!++;
  }

  const shape: Required<BeatPlanCounts> = {
    introBeats: dropIdx - startIdx,
    appBeats: dropIdx - appFrom,
    clipBeats: 1,
    outroBeats: endIdx - dropIdx,
    stats: statsInFrom >= 0 || statsOutFrom >= 0,
  };

  return {
    audioFrom,
    audioTo,
    dropAt: rebase(dropT),
    duration: rebase(audioTo),
    segments,
    clipCount: clip,
    shape,
    bpm: period > 0 ? Math.round((60 / period) * 10) / 10 : 0,
  };
}

// The segment on screen at `t` seconds — the renderer's per-frame lookup and
// the view's preview both go through it.
export function segmentAt(plan: BeatPlan, t: number): Segment | undefined {
  for (const s of plan.segments) if (t >= s.from && t < s.to) return s;
  return plan.segments[plan.segments.length - 1];
}

// Human-readable phases for the structure strip, mirroring the Characters tab's
// "The order" row: one card per phase, not per cut.
export interface PlanPhase {
  label: string;
  hint: string;
  from: number;
  to: number;
  cuts: number;
}

export function planPhases(plan: BeatPlan): PlanPhase[] {
  const of = (kinds: SegmentKind[]) => plan.segments.filter((s) => kinds.includes(s.kind));
  const span = (list: Segment[]) => ({ from: list[0]?.from ?? 0, to: list[list.length - 1]?.to ?? 0, cuts: list.length });
  const chopped = of(['chop']);
  const gym = of(['gym']);
  const app = of(['app']);
  const clips = of(['clip']);
  const stats = of(['stats']);
  const secs = (list: Segment[]) => {
    const s = span(list);
    return Math.round((s.to - s.from) * 10) / 10;
  };
  const phases: PlanPhase[] = [
    { label: 'Chopped', hint: `their chopped folder only, one cut per beat · ${secs(chopped)}s`, ...span(chopped) },
  ];
  // The stats slots are listed where they actually fall, so the strip reads in
  // playback order rather than grouping both ends of the video together.
  const statsIn = stats.find((x) => x.index === 0);
  const statsOut = stats.find((x) => x.index === 1);
  if (statsIn) {
    phases.push({
      label: 'Stats',
      hint: `their own screen, holding into the drop · ${Math.round((statsIn.to - statsIn.from) * 10) / 10}s`,
      from: statsIn.from,
      to: statsIn.to,
      cuts: 1,
    });
  }
  // A showcase has no app phase — the card is left out rather than shown at 0s.
  if (app.length) {
    phases.push({ label: 'App screenshots', hint: `blocked 🌽 + streak, twice a beat · ${secs(app)}s`, ...span(app) });
  }
  phases.push({
    label: 'Clips + gym',
    hint: `${clips.length} clip${clips.length === 1 ? '' : 's'} held on the beat, ${gym.length} gym still${
      gym.length === 1 ? '' : 's'
    } between them · ${secs([...clips, ...gym].sort((a, b) => a.from - b.from))}s`,
    ...span(clips),
  });
  if (statsOut) {
    phases.push({
      label: 'Stats',
      hint: `their own screen, closing · ${Math.round((statsOut.to - statsOut.from) * 10) / 10}s`,
      from: statsOut.from,
      to: statsOut.to,
      cuts: 1,
    });
  }
  return phases;
}
