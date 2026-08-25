// The generation-batch queue lives in the browser, keyed per project (like the
// slideshow queue in localQueue.ts). Each batch is one "character" run — a
// gender + a set of presets (or a random count) + background packs + caption
// look — that the App's background worker processes one at a time. A batch
// records the slideshow ids it produced so the Queue's Batch panel can
// re-select a whole finished batch for export.
import type { Gender } from './quitPresets';
import type { CaptionStyle } from './captionStyle';

export type BatchStatus = 'queued' | 'running' | 'done' | 'error';

export interface GenBatch {
  id: string;
  createdAt: string;
  status: BatchStatus;
  // Human label for the panel, e.g. "Men · 3 presets" — built at enqueue time.
  label: string;
  // The run config. `presetKeys` empty → draw `count` random presets; otherwise
  // generate exactly those presets (one deck each), and `count` is ignored.
  gender: Gender;
  presetKeys: string[];
  count: number;
  length: 'short' | 'long';
  packs: string[];
  captionStyle: CaptionStyle;
  // Progress: how many decks this batch expects vs. how many have landed.
  total: number;
  done: number;
  // Ids of the slideshows this batch pushed onto the queue (may shrink over time
  // if the user removes some; the panel intersects with the live queue).
  producedIds: string[];
  error?: string;
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
