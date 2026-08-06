// Locally-added soundtrack tracks. The bundled tracks live in public/music and
// the manifest, but a user can also drop their own .mp3s in from the Brain
// editor — those are stored in the browser (IndexedDB for the bytes, since
// localStorage can't hold audio) and merged into the pools by lib/music.ts.
//
// Removing works two ways: a locally-added track is deleted from IndexedDB; a
// bundled (manifest) track is "hidden" via a small localStorage set so it stops
// showing up in this browser without touching the shipped files.
import type { MusicGender } from './music';

const DB_NAME = 'slidesmith-music';
const STORE = 'tracks';
const DB_VERSION = 1;

interface StoredTrack {
  id: string;
  gender: MusicGender;
  name: string;
  addedAt: string;
  blob: Blob;
}

export interface LocalTrack {
  id: string;
  gender: MusicGender;
  name: string;
  url: string;
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

function getAllRecords(): Promise<StoredTrack[]> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
        req.onsuccess = () => resolve(req.result as StoredTrack[]);
        req.onerror = () => reject(req.error);
      }),
  );
}

function putRecord(record: StoredTrack): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }),
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
      }),
  );
}

// One object URL per track id, reused (and revoked on removal) to avoid leaks.
const urlCache = new Map<string, string>();
function urlFor(id: string, blob: Blob): string {
  let url = urlCache.get(id);
  if (!url) {
    url = URL.createObjectURL(blob);
    urlCache.set(id, url);
  }
  return url;
}

export async function listLocalTracks(): Promise<LocalTrack[]> {
  const records = await getAllRecords();
  return records
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
    .map((r) => ({ id: r.id, gender: r.gender, name: r.name, url: urlFor(r.id, r.blob) }));
}

// Resolve a stored track id to a fresh object URL (object URLs die on reload,
// so the exporter mints one at pick time from the persisted blob).
export async function objectUrlForLocalTrack(id: string): Promise<string | null> {
  const cached = urlCache.get(id);
  if (cached) return cached;
  const records = await getAllRecords();
  const rec = records.find((r) => r.id === id);
  return rec ? urlFor(rec.id, rec.blob) : null;
}

export async function addLocalTrack(gender: MusicGender, file: File): Promise<LocalTrack> {
  if (!/audio\//.test(file.type) && !/\.(mp3|m4a|wav|ogg)$/i.test(file.name)) {
    throw new Error('That file is not an audio track.');
  }
  const id = `local:${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  const rec: StoredTrack = { id, gender, name: file.name, addedAt: new Date().toISOString(), blob: file };
  await putRecord(rec);
  return { id, gender, name: file.name, url: urlFor(id, file) };
}

export async function removeLocalTrack(id: string): Promise<void> {
  await deleteRecord(id);
  const url = urlCache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(id);
  }
}

// ── Hidden bundled tracks (localStorage) ─────────────────────────────────────
const HIDDEN_KEY = 'slidesmith:musicHidden';

export function getHidden(): Set<string> {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function writeHidden(set: Set<string>): void {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...set]));
  } catch {
    /* storage unavailable */
  }
}

export function hideTrack(file: string): void {
  const set = getHidden();
  set.add(file);
  writeHidden(set);
}

export function unhideTrack(file: string): void {
  const set = getHidden();
  set.delete(file);
  writeHidden(set);
}
