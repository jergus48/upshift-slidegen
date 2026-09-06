// Finished beat plans, saved by name.
//
// musicBeats.ts holds the ONE working grid per track — whatever you last
// detected or edited there, overwritten the next time you re-detect. That's the
// wrong shape for finished work: once the beats and the length are right for a
// particular edit, that combination is worth keeping, and you usually want more
// than one per song (a 15s hook cut on claps, a 30s version cut on the kick).
//
// A plan is that snapshot: the beats, the slice, and how they were produced,
// under a name you chose. Saving one doesn't touch the working grid, and loading
// one replaces it — so plans are a library, not an undo history.

import type { BeatBand } from './beatDetect';
import type { SavedBeats } from './musicBeats';

const KEY = 'slidesmith:beatPlans';

export interface BeatPlan {
  id: string;
  name: string;
  // The track this was built from: the same key musicBeats/musicStarts use,
  // plus a readable name so the list stays legible if a file is renamed.
  file: string;
  trackName: string;
  beats: number[];
  // Absolute seconds of the selected slice, kept alongside the indexes because
  // the seconds are what a video actually needs.
  start: number;
  end: number;
  from: number;
  to: number;
  bpm: number;
  source?: SavedBeats['source'];
  band?: BeatBand;
  createdAt: number;
}

function read(): BeatPlan[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as BeatPlan[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function write(plans: BeatPlan[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(plans));
  } catch {
    // storage full — the working grid is still saved, only the snapshot is lost
  }
}

// Newest first, optionally only the plans built from one track.
export function listPlans(file?: string): BeatPlan[] {
  const all = read().sort((a, b) => b.createdAt - a.createdAt);
  return file ? all.filter((p) => p.file === file) : all;
}

// Snapshot the current working grid under a name. Returns the saved plan.
export function savePlan(
  name: string,
  file: string,
  trackName: string,
  grid: SavedBeats
): BeatPlan {
  const from = grid.from ?? 0;
  const to = grid.to ?? grid.beats.length;
  const slice = grid.beats.slice(from, to);
  const plan: BeatPlan = {
    id: `plan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim() || trackName,
    file,
    trackName,
    beats: [...grid.beats],
    start: slice[0] ?? grid.beats[0] ?? 0,
    end: slice[slice.length - 1] ?? grid.beats[grid.beats.length - 1] ?? 0,
    from,
    to,
    bpm: grid.bpm,
    source: grid.source,
    band: grid.band,
    createdAt: Date.now(),
  };
  write([plan, ...read()]);
  return plan;
}

export function deletePlan(id: string): void {
  write(read().filter((p) => p.id !== id));
}

// How long the plan's slice runs, and how many cuts it makes — the two numbers
// that decide whether a plan fits the video you're making.
export function planLength(plan: BeatPlan): number {
  return Math.max(0, plan.end - plan.start);
}

export function planCuts(plan: BeatPlan): number {
  return Math.max(0, plan.to - plan.from - 1);
}
