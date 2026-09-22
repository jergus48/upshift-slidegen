// Finished beat videos waiting in the Queue.
//
// The Queue's other half holds Slideshows — recipes, in localStorage, from
// which a video is rendered on demand. A beat video cannot work that way. It is
// recorded in real time from a canvas, and since the clip offsets are rolled
// per render (see beatVideo.ts), rendering the same build twice produces two
// different videos. So what gets queued is the FILE, not the recipe: approving
// a video in the Queue has to approve the one that was actually watched.
//
// The bytes therefore live in IndexedDB, exactly like the image library —
// localStorage's ~5MB would not hold one of these, let alone a batch. Same
// store shape as localLibrary.ts, deliberately: one object store keyed by id,
// blobs in the record, object URLs minted on read and cached per id.
import type { VideoStyle } from './videoAutomation';

const DB_NAME = 'slidesmith-videos';
const STORE = 'videos';
const DB_VERSION = 1;

// What the Queue card needs to describe a video without decoding it. Everything
// here is known at build time — none of it is read back out of the file.
export interface QueuedVideoMeta {
  id: string;
  // The filename the download should use, extension included.
  name: string;
  // The build's own title: "Marcus - 30d clean - <hook>".
  title: string;
  characterId: string;
  characterName: string;
  trackName: string;
  style: VideoStyle;
  // Seconds, from the plan rather than the file.
  duration: number;
  // Where this video should be written — a download folder preset id, or ''
  // for the global default. Taken from the character, changeable on the card.
  folderId: string;
  // The post text that ships beside the file as a .txt, exactly as a slideshow
  // folder carries one: the hook as the first line, then the caption, then the
  // hashtags. Optional because videos queued before this existed carry none —
  // those export with an empty sidecar rather than failing.
  hook?: string;
  caption?: string;
  hashtags?: string[];
  createdAt: string;
  size: number;
  mime: string;
}

interface StoredVideo extends QueuedVideoMeta {
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

async function getAllRecords(): Promise<StoredVideo[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as StoredVideo[]);
    req.onerror = () => reject(req.error);
  });
}

// Object URLs die when revoked and leak when not, so one is minted per id and
// kept — the Queue renders the same cards repeatedly as it re-renders.
const urlCache = new Map<string, string>();
function urlFor(id: string, blob: Blob): string {
  let url = urlCache.get(id);
  if (!url) {
    url = URL.createObjectURL(blob);
    urlCache.set(id, url);
  }
  return url;
}

function forget(id: string): void {
  const url = urlCache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(id);
  }
}

type Listener = () => void;
const listeners = new Set<Listener>();
const notify = () => listeners.forEach((l) => l());

export function subscribeQueuedVideos(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// A queued video ready to show: the metadata plus a playable url.
export interface QueuedVideo extends QueuedVideoMeta {
  url: string;
  blob: Blob;
}

// Newest first, the same order the Queue puts fresh slideshows in.
export async function listQueuedVideos(): Promise<QueuedVideo[]> {
  const records = await getAllRecords();
  return records
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((r) => ({ ...r, url: urlFor(r.id, r.blob) }));
}

// Put a finished render on the queue. Throws on a full quota rather than
// failing quietly — a video the user watched being rendered and then silently
// not arriving is the one outcome worse than an error.
export async function addQueuedVideo(
  meta: Omit<QueuedVideoMeta, 'id' | 'createdAt' | 'size' | 'mime'>,
  blob: Blob,
): Promise<QueuedVideo> {
  const record: StoredVideo = {
    ...meta,
    id: `qv-${Date.now()}-${Math.round(Math.random() * 1e4)}`,
    createdAt: new Date().toISOString(),
    size: blob.size,
    mime: blob.type,
    blob,
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  notify();
  return { ...record, url: urlFor(record.id, record.blob) };
}

export async function removeQueuedVideo(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  forget(id);
  notify();
}

// Change where one video will be written, without touching its bytes.
export async function setQueuedVideoFolder(id: string, folderId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const get = store.get(id);
    get.onsuccess = () => {
      const rec = get.result as StoredVideo | undefined;
      if (rec) store.put({ ...rec, folderId });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  notify();
}

// What the queue is costing in storage, for the Queue's header. Videos are big
// enough that this is worth showing rather than leaving the user to find out
// when a write starts failing.
export async function queuedVideoBytes(): Promise<number> {
  const records = await getAllRecords();
  return records.reduce((n, r) => n + (r.size || r.blob?.size || 0), 0);
}
