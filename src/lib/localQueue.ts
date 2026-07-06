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

// One-time recovery. Earlier builds keyed the queue by a SERVER-generated
// project id that changed on every serverless cold start; once the workspace
// (and its now-stable ids) moved into the browser, those older queues were
// left orphaned under ids no current project uses. Adopt any such orphaned
// slideshows into `targetProjectId` so they aren't lost, then delete the stale
// keys. Idempotent — after the first run there are no orphans left to adopt.
export function recoverOrphanQueues(knownProjectIds: string[], targetProjectId: string): void {
  try {
    const known = new Set(knownProjectIds);
    const orphanKeys: string[] = [];
    const adopted: Slideshow[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(KEY_PREFIX)) continue;
      if (known.has(key.slice(KEY_PREFIX.length))) continue; // belongs to a live project
      orphanKeys.push(key);
      try {
        const items = JSON.parse(localStorage.getItem(key) || '[]') as Slideshow[];
        if (Array.isArray(items)) adopted.push(...items);
      } catch {
        // malformed entry — drop it with the rest
      }
    }
    if (adopted.length) {
      const existing = loadQueue(targetProjectId);
      const seen = new Set(existing.map((s) => s.id));
      saveQueue(targetProjectId, [...existing, ...adopted.filter((s) => s && !seen.has(s.id))]);
    }
    orphanKeys.forEach((k) => localStorage.removeItem(k));
  } catch {
    // Any failure here just means no recovery — never block app startup.
  }
}
