// The queue (generated + manually-created slideshows, pre-approval) lives in
// the browser, keyed per project — there's no shared server-side store for
// it, so it's inherently per-browser/device.
import type { Slideshow } from '../types';

const KEY_PREFIX = 'slidesmith:queue:';

export function loadQueue(projectId: string): Slideshow[] {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + projectId);
    return raw ? (JSON.parse(raw) as Slideshow[]) : [];
  } catch {
    return [];
  }
}

export function saveQueue(projectId: string, queue: Slideshow[]): void {
  try {
    localStorage.setItem(KEY_PREFIX + projectId, JSON.stringify(queue));
  } catch {
    // Storage full/unavailable (private browsing, quota) — nothing more we can do client-side.
  }
}
