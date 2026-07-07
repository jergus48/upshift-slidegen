// Scraped (Pinterest) and uploaded background images live entirely in the
// browser — IndexedDB for the actual bytes (localStorage's ~5MB quota can't
// hold real photos), object URLs for rendering. Per-browser/device, same as
// the queue: there's no shared server-side store for these anymore.
import type { LibraryImage } from '../types';

const DB_NAME = 'slidesmith-library';
const STORE = 'images';
const DB_VERSION = 1;

interface StoredImage {
  id: string;
  pack: string;
  source: 'scraped' | 'uploaded';
  addedAt: string;
  blob: Blob;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAllRecords(): Promise<StoredImage[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as StoredImage[]);
    req.onerror = () => reject(req.error);
  });
}

function putRecord(record: StoredImage): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

function deleteRecord(id: string): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

// Object URLs are cheap but must be revoked to avoid leaking — cache one per
// image id instead of minting a fresh one every time the library is listed.
const urlCache = new Map<string, string>();
function urlFor(id: string, blob: Blob): string {
  let url = urlCache.get(id);
  if (!url) {
    url = URL.createObjectURL(blob);
    urlCache.set(id, url);
  }
  return url;
}

// Cache the id→blob map so resolving many slide backgrounds at render time
// doesn't re-scan IndexedDB per image. Invalidated on any add/remove.
let blobCache: Map<string, Blob> | null = null;
async function ensureBlobCache(): Promise<Map<string, Blob>> {
  if (!blobCache) {
    const records = await getAllRecords();
    blobCache = new Map(records.map((r) => [r.id, r.blob]));
  }
  return blobCache;
}

// Resolve a stable `local:…` id to a (session-scoped) object URL for display.
// Slides persist the id, not the object URL, since object URLs die on reload —
// this mints/reuses a fresh one from the stored blob. Returns null if the
// image is no longer in the library.
export async function objectUrlForLocal(id: string): Promise<string | null> {
  const cached = urlCache.get(id);
  if (cached) return cached;
  const cache = await ensureBlobCache();
  const blob = cache.get(id);
  return blob ? urlFor(id, blob) : null;
}

export async function listLocalImages(): Promise<LibraryImage[]> {
  const records = await getAllRecords();
  return records
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt)) // newest first
    .map((r) => ({ id: r.id, url: urlFor(r.id, r.blob), pack: r.pack, source: r.source }));
}

// `dataUrls` are base64 data URLs — either read from a File the user picked,
// or downloaded server-side (Pinterest scrape) and handed back for us to save.
export async function addLocalImages(
  pack: string,
  dataUrls: string[],
  source: 'scraped' | 'uploaded'
): Promise<LibraryImage[]> {
  const packName = pack.trim() || (source === 'uploaded' ? 'My Uploads' : 'Scraped');
  const added: LibraryImage[] = [];
  for (const dataUrl of dataUrls) {
    const blob = await (await fetch(dataUrl)).blob();
    if (blob.size < 100) continue; // skip empty/corrupt
    const id = `local:${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const addedAt = new Date().toISOString();
    await putRecord({ id, pack: packName, source, addedAt, blob });
    blobCache = null; // library changed — rebuild lazily on next resolve
    added.push({ id, url: urlFor(id, blob), pack: packName, source });
  }
  return added;
}

export async function removeLocalImage(id: string): Promise<void> {
  await deleteRecord(id);
  blobCache = null;
  const url = urlCache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(id);
  }
}
