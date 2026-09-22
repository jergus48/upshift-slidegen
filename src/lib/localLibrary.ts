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
  // Optional sub-group inside the pack (e.g. "gym", "lifestyle"). Absent =
  // "Unfiled". Assigned in the Library view; used to target a single subfolder
  // in generation. See src/lib/subfolders.ts.
  subfolder?: string;
  source: 'scraped' | 'uploaded';
  addedAt: string;
  blob: Blob;
  // Photos and video clips share this store — the blob's MIME type is the
  // truth, and this is only a cached read of it for records written since
  // clips were allowed. Older records have no field and are photos.
  kind?: 'image' | 'video';
}

// A record's kind, falling back to the blob for anything written before clips
// were a thing.
function kindOf(r: StoredImage): 'image' | 'video' {
  return r.kind ?? (r.blob?.type?.startsWith('video/') ? 'video' : 'image');
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
    .map((r) => ({
      id: r.id,
      url: urlFor(r.id, r.blob),
      pack: r.pack,
      subfolder: r.subfolder,
      source: r.source,
      kind: kindOf(r),
    }));
}

// Move an image into a subfolder of its pack (or back to Unfiled with null).
// Only the tag changes; the blob and pack stay put.
export async function setImageSubfolder(id: string, subfolder: string | null): Promise<void> {
  const db = await openDb();
  const record = await new Promise<StoredImage | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result as StoredImage | undefined);
    req.onerror = () => reject(req.error);
  });
  if (!record) return;
  const clean = subfolder?.trim();
  if (clean) record.subfolder = clean;
  else delete record.subfolder;
  await putRecord(record);
}

// Re-tag every image currently in `from` to `to` (used when a subfolder is
// renamed) — pass null for `to` to move them back to Unfiled (subfolder deleted).
export async function moveSubfolderImages(pack: string, from: string, to: string | null): Promise<void> {
  const records = await getAllRecords();
  for (const r of records) {
    if (r.pack !== pack || r.subfolder !== from) continue;
    const clean = to?.trim();
    if (clean) r.subfolder = clean;
    else delete r.subfolder;
    await putRecord(r);
  }
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

// Extensions we treat as video when the browser hands us no usable MIME type.
// A file dragged in from a download folder can arrive with `type: ""` (the OS
// couldn't resolve it) or with a container type that disagrees with the name —
// a .mp4 that's really a QuickTime stream, say. The name is the tiebreaker.
const VIDEO_EXTS = ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi', 'mpeg', 'mpg', 'ogv', '3gp'];
const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'heic', 'heif', 'bmp', 'tiff', 'tif'];

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i + 1).toLowerCase();
}

// Decide photo vs clip from the MIME type when there is one, falling back to
// the file extension. Returns null for anything we don't recognise as media at
// all, so the caller can say so instead of storing a junk record.
function classify(file: File): 'image' | 'video' | null {
  const type = (file.type || '').toLowerCase();
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('image/')) return 'image';
  const ext = extOf(file.name);
  if (VIDEO_EXTS.includes(ext)) return 'video';
  if (IMAGE_EXTS.includes(ext)) return 'image';
  return null;
}

// Why a file didn't make it in, so the Library view can name it rather than
// leaving the user to guess which of their selection went missing.
export interface SkippedFile {
  name: string;
  reason: string;
}

export interface AddFilesResult {
  added: LibraryImage[];
  skipped: SkippedFile[];
}

// Add files straight from a file picker, blob intact. Unlike addLocalImages
// this never round-trips through a base64 data URL — which matters for video:
// base64 is a third bigger than the bytes and would sit in memory as one giant
// string per clip.
//
// Every file is handled independently: one bad file (a zero-byte export, a
// clip that blows the storage quota) is recorded in `skipped` and the rest of
// the batch still lands. Previously a single throw aborted the loop and the
// remaining files vanished without a word.
export async function addLocalFiles(
  pack: string,
  files: File[],
  source: 'scraped' | 'uploaded'
): Promise<AddFilesResult> {
  const packName = pack.trim() || (source === 'uploaded' ? 'My Uploads' : 'Scraped');
  const added: LibraryImage[] = [];
  const skipped: SkippedFile[] = [];
  for (const file of files) {
    const kind = classify(file);
    if (!kind) {
      skipped.push({ name: file.name, reason: 'not a photo or video file' });
      continue;
    }
    // A real clip is never this small. Failed downloads and error pages saved
    // under a .mp4 name land here (e.g. a 14-byte file reading "File not found").
    if (file.size < 100) {
      skipped.push({ name: file.name, reason: `only ${file.size} bytes — the download looks broken` });
      continue;
    }
    const id = `local:${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    try {
      await putRecord({ id, pack: packName, source, addedAt: new Date().toISOString(), blob: file, kind });
    } catch (e) {
      const err = e as { name?: string };
      const reason =
        err?.name === 'QuotaExceededError'
          ? 'browser storage is full — remove some clips and retry'
          : `couldn't be saved (${err?.name || String(e)})`;
      skipped.push({ name: file.name, reason });
      continue;
    }
    blobCache = null;
    added.push({ id, url: urlFor(id, file), pack: packName, source, kind });
  }
  return { added, skipped };
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

// Rename a pack: re-tag every local image in `from` to `to`. Bundled packs
// aren't touched (they're static files, not records here), so renaming a pack
// that mixes bundled and local images only moves the local ones. Renaming onto
// an existing pack name merges into it. Returns how many images moved.
export async function renameLocalPack(from: string, to: string): Promise<number> {
  const clean = to.trim();
  if (!clean || clean === from) return 0;
  const records = await getAllRecords();
  let moved = 0;
  for (const r of records) {
    if (r.pack !== from) continue;
    r.pack = clean;
    await putRecord(r);
    moved++;
  }
  if (moved) blobCache = null;
  return moved;
}
