// The generation-batch queue lives in the browser, keyed per project (like the
// slideshow queue in localQueue.ts). Every run that drops a group of decks on
// the queue is logged here so the Queue's Batch panel can re-select the whole
// group later for export:
//   'presets'    — a quit-preset run the App's worker processes one at a time
//                  (several can be stacked and generate progressively);
//   'photos'     — a Photo Packs run;
//   'characters' — a Characters before/after run.
// Only 'presets' runs are queued and worked; the other two are built in one go
// and land already 'done'.
import type { Gender } from './quitPresets';
import type { CaptionStyle } from './captionStyle';

export type BatchStatus = 'queued' | 'running' | 'done' | 'error';

export type BatchKind = 'presets' | 'photos' | 'characters';

export interface GenBatch {
  id: string;
  createdAt: string;
  status: BatchStatus;
  // What produced this batch. Absent on batches saved before kinds existed —
  // those were all preset runs.
  kind?: BatchKind;
  // Human label for the panel, e.g. "Men · 3 presets" — built at enqueue time.
  label: string;
  // Second line in the panel. Preset runs show their background packs; the
  // other kinds set this instead (character names, pack overrides…).
  subtitle?: string;
  // Background packs — preset runs only.
  packs: string[];
  // The preset-run config, unset on the other kinds. `presetKeys` empty → draw
  // `count` random presets; otherwise generate exactly those presets (one deck
  // each), and `count` is ignored.
  gender?: Gender;
  presetKeys?: string[];
  count?: number;
  length?: 'short' | 'long';
  captionStyle?: CaptionStyle;
  // Progress: how many decks this batch expects vs. how many have landed.
  total: number;
  done: number;
  // Ids of the slideshows this batch pushed onto the queue (may shrink over time
  // if the user removes some; the panel intersects with the live queue).
  producedIds: string[];
  error?: string;
}

// A preset run, with the config the worker needs guaranteed present.
export type PresetBatch = GenBatch & {
  gender: Gender;
  presetKeys: string[];
  count: number;
  length: 'short' | 'long';
  captionStyle: CaptionStyle;
};

export function isPresetBatch(b: GenBatch): b is PresetBatch {
  return (b.kind ?? 'presets') === 'presets' && b.gender != null && b.presetKeys != null;
}

const KEY_PREFIX = 'slidesmith:batches:';

export function loadBatches(projectId: string): GenBatch[] {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + projectId);
    if (!raw) return [];
    const batches = JSON.parse(raw) as GenBatch[];
    // A batch left 'running' when the tab closed can never resume itself — mark
    // it errored on load so the worker doesn't get wedged and the user can retry.
    return batches.map((b) => (b.status === 'running' ? { ...b, status: 'error', error: 'Interrupted' } : b));
  } catch {
    return [];
  }
}

export function saveBatches(projectId: string, batches: GenBatch[]): void {
  try {
    localStorage.setItem(KEY_PREFIX + projectId, JSON.stringify(batches));
  } catch {
    // Storage full/unavailable — nothing more we can do client-side.
  }
}
