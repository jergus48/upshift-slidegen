// Per-track BEAT GRIDS, detected by lib/beatDetect.ts and cached in the browser
// (localStorage), plus the slice of that grid a video should use.
//
// Detection costs a full decode + FFT pass over the track, so it runs once in
// the Brain "music" editor and the result is saved here — every later use is a
// lookup. It's also the place a hand correction lands, since a detected grid is
// only ever a starting point.
//
// Keyed by the track's manifest filename / `local:…` id, the same key
// musicStarts.ts and musicDrops.ts use, so all three settings coexist per track.

import type { BeatGrid, BeatBand } from './beatDetect';

const KEY = 'slidesmith:musicBeats';

// A saved grid: what was detected, plus the optional range the video cuts from.
// `from`/`to` are INDEXES into `beats` — an inclusive first beat and exclusive
// last — so the slice survives a re-detect that shifts the seconds slightly.
export interface SavedBeats extends BeatGrid {
  from?: number;
  to?: number;
  // What produced this list, so the editor can say so and re-run it the same
  // way: a steady tempo grid, raw transients, or section changes.
  source?: 'grid' | 'onsets' | 'changes' | 'manual';
  band?: BeatBand;
}

type BeatMap = Record<string, SavedBeats>;

function read(): BeatMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw) as BeatMap;
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

function write(map: BeatMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // storage full/unavailable — the grid just isn't cached; detection can rerun
  }
}

// Saved grid for a track, or undefined if it's never been analysed.
export function getBeats(file: string): SavedBeats | undefined {
  const v = read()[file];
  return v && Array.isArray(v.beats) && v.beats.length ? v : undefined;
}

export function getAllBeats(): BeatMap {
  return read();
}

// Save (or clear, when grid is null) a track's beat grid. Clearing drops the
// range with it — a range means nothing without the grid it indexes into.
export function setBeats(file: string, grid: BeatGrid | null): void {
  const map = read();
  if (!grid) delete map[file];
  else map[file] = { ...map[file], ...grid };
  write(map);
}

// Replace a track's beats with an arbitrary list — what the onset and section
// detectors return, since neither produces a tempo. A range that pointed into
// the old list is dropped: its indexes mean nothing against new beats.
export function setBeatList(
  file: string,
  beats: number[],
  meta: { source: SavedBeats['source']; band?: BeatBand; bpm?: number; confidence?: number }
): void {
  const map = read();
  map[file] = {
    bpm: meta.bpm ?? 0,
    confidence: meta.confidence ?? 0,
    beats: [...beats].sort((a, b) => a - b),
    source: meta.source,
    band: meta.band,
  };
  write(map);
}

// Add one beat by hand, keeping the list sorted. Ignored if it would land on top
// of an existing beat (within 20ms), which would only produce a zero-length cut.
export function addBeat(file: string, seconds: number): void {
  const map = read();
  const entry = map[file];
  const t = Math.round(seconds * 1000) / 1000;
  if (!entry) {
    map[file] = { bpm: 0, confidence: 0, beats: [t], source: 'manual' };
    write(map);
    return;
  }
  if (entry.beats.some((b) => Math.abs(b - t) < 0.02)) return;
  entry.beats = [...entry.beats, t].sort((a, b) => a - b);
  // Hand edits invalidate a range expressed as indexes into the old list.
  delete entry.from;
  delete entry.to;
  write(map);
}

// Remove the beat nearest `seconds`, when one is close enough to have been the
// intended target.
export function removeBeatNear(file: string, seconds: number, tolerance = 0.25): void {
  const map = read();
  const entry = map[file];
  if (!entry?.beats.length) return;
  let idx = -1;
  let best = tolerance;
  entry.beats.forEach((b, i) => {
    const d = Math.abs(b - seconds);
    if (d <= best) {
      best = d;
      idx = i;
    }
  });
  if (idx < 0) return;
  entry.beats = entry.beats.filter((_, i) => i !== idx);
  delete entry.from;
  delete entry.to;
  write(map);
}

// Save the beat range a video should cut from. Indexes are clamped to the saved
// grid and ordered, so a backwards drag can't produce a negative-length slice.
// Passing null for both clears the range back to "use the whole track".
export function setBeatRange(file: string, from: number | null, to: number | null): void {
  const map = read();
  const entry = map[file];
  if (!entry) return;
  if (from == null && to == null) {
    delete entry.from;
    delete entry.to;
  } else {
    const last = entry.beats.length;
    const a = Math.max(0, Math.min(last - 1, from ?? 0));
    const b = Math.max(a + 1, Math.min(last, to ?? last));
    entry.from = a;
    entry.to = b;
  }
  write(map);
}

// The beats a video actually cuts on: the saved range, or the whole grid.
export function beatsInRange(saved: SavedBeats): number[] {
  return saved.beats.slice(saved.from ?? 0, saved.to ?? saved.beats.length);
}

// How long the selected slice runs, in seconds — the length of the video a
// beat-cut export from this track would produce.
export function rangeDuration(saved: SavedBeats): number {
  const b = beatsInRange(saved);
  return b.length < 2 ? 0 : b[b.length - 1] - b[0];
}
