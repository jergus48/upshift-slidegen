// Folder presets for downloads. On Chromium browsers (Chrome/Edge) the File
// System Access API lets the app write exported files STRAIGHT into a folder the
// user picked, instead of dumping everything into the browser's Downloads folder
// to be sorted by hand. Each preset is a named directory handle, persisted in
// IndexedDB — directory handles are structured-cloneable, so IndexedDB can hold
// them; localStorage can't. The chosen default preset id lives in localStorage.
//
// Only Chromium supports showDirectoryPicker — Firefox/Safari don't — so
// supportsFolderPresets() is the single gate the whole feature hangs off. Where
// it's false, the UI is hidden and downloads fall back to the classic
// <a download> path (see lib/render.ts), landing in the browser Downloads folder.

// Standard lib.dom types (FileSystemDirectoryHandle / FileSystemFileHandle /
// FileSystemWritableFileStream) cover reading and writing, but the entry point
// (window.showDirectoryPicker) and the permission methods (query/request) aren't
// in the DOM lib yet, so we reach them through narrow local casts.
interface DirectoryPickerWindow {
  showDirectoryPicker?: (opts?: {
    id?: string;
    mode?: 'read' | 'readwrite';
    startIn?: FileSystemHandle | string;
  }) => Promise<FileSystemDirectoryHandle>;
}

interface PermissionedHandle {
  queryPermission?: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
}

export interface FolderPreset {
  id: string;
  name: string;
  handle: FileSystemDirectoryHandle;
}

// The whole feature gate: true only where the browser can pick a folder and
// write into it directly (Chromium). Everything UI-facing checks this first.
export function supportsFolderPresets(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as unknown as DirectoryPickerWindow).showDirectoryPicker === 'function'
  );
}

// ── IndexedDB store of directory handles ─────────────────────────────────────
const DB_NAME = 'slidesmith-folders';
const STORE = 'folders';
const DB_VERSION = 1;

interface StoredFolder {
  id: string;
  name: string;
  handle: FileSystemDirectoryHandle;
  addedAt: string;
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

function getAllRecords(): Promise<StoredFolder[]> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
        req.onsuccess = () => resolve(req.result as StoredFolder[]);
        req.onerror = () => reject(req.error);
      }),
  );
}

function putRecord(record: StoredFolder): Promise<void> {
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

// ── Presets ──────────────────────────────────────────────────────────────────
export async function listFolderPresets(): Promise<FolderPreset[]> {
  if (!supportsFolderPresets()) return [];
  const recs = await getAllRecords();
  return recs
    .sort((a, b) => a.addedAt.localeCompare(b.addedAt))
    .map((r) => ({ id: r.id, name: r.name, handle: r.handle }));
}

// Open the OS folder picker and save the chosen folder as a new preset. MUST be
// called from a user gesture (a click) — the picker won't open otherwise.
// Returns the new preset, or null if the user cancelled the picker.
export async function addFolderPreset(): Promise<FolderPreset | null> {
  const picker = (window as unknown as DirectoryPickerWindow).showDirectoryPicker;
  if (!picker) return null;
  let handle: FileSystemDirectoryHandle;
  try {
    handle = await picker({ id: 'slidesmith-downloads', mode: 'readwrite' });
  } catch {
    // AbortError — the user closed the picker without choosing.
    return null;
  }
  const id = `folder:${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  const preset: StoredFolder = { id, name: handle.name, handle, addedAt: new Date().toISOString() };
  await putRecord(preset);
  return { id, name: handle.name, handle };
}

export async function removeFolderPreset(id: string): Promise<void> {
  await deleteRecord(id);
  if (getDefaultFolderId() === id) setDefaultFolderId(null);
}

// ── Default preset (localStorage) ────────────────────────────────────────────
const DEFAULT_KEY = 'slidesmith:defaultFolder';

export function getDefaultFolderId(): string | null {
  try {
    return localStorage.getItem(DEFAULT_KEY) || null;
  } catch {
    return null;
  }
}

export function setDefaultFolderId(id: string | null): void {
  try {
    if (id) localStorage.setItem(DEFAULT_KEY, id);
    else localStorage.removeItem(DEFAULT_KEY);
  } catch {
    /* storage unavailable */
  }
}

// ── Permission + resolving a preset to a writable handle ─────────────────────
// Make sure we hold read-write permission on `handle`, prompting if needed.
async function ensureReadWrite(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const h = handle as unknown as PermissionedHandle;
  const opts = { mode: 'readwrite' as const };
  try {
    if (h.queryPermission && (await h.queryPermission(opts)) === 'granted') return true;
    if (h.requestPermission && (await h.requestPermission(opts)) === 'granted') return true;
  } catch {
    // Permission API not present on this handle — assume writes are allowed and
    // let the actual write surface any real error.
    return true;
  }
  return false;
}

// Resolve a preset id to a writable directory handle, prompting for permission
// if the browser has forgotten the earlier grant (it resets to "prompt" across
// reloads). MUST be called synchronously inside a user gesture — before any long
// await like a video render — so the permission prompt is allowed to appear.
// Returns null when the preset is gone or access was denied, so the caller can
// fall back to a normal browser download.
export async function resolveWritableFolder(
  id: string | null,
): Promise<FileSystemDirectoryHandle | null> {
  if (!id || !supportsFolderPresets()) return null;
  const recs = await getAllRecords();
  const rec = recs.find((r) => r.id === id);
  if (!rec) return null;
  return (await ensureReadWrite(rec.handle)) ? rec.handle : null;
}

// ── Writing files into a chosen folder ───────────────────────────────────────
// Walk/create a nested subdirectory path (["post-1"] etc.) under `root`.
async function dirForSegments(
  root: FileSystemDirectoryHandle,
  segments: string[],
): Promise<FileSystemDirectoryHandle> {
  let dir = root;
  for (const seg of segments) dir = await dir.getDirectoryHandle(seg, { create: true });
  return dir;
}

// Write one file into `root`. A "/" in `name` creates subfolders (so the same
// "folder/file" entry names used for zips work here too). Overwrites an existing
// file of the same name.
export async function writeFileToDir(
  root: FileSystemDirectoryHandle,
  name: string,
  data: Uint8Array | Blob | string,
): Promise<void> {
  const parts = name.split('/');
  const filename = parts.pop()!;
  const dir = await dirForSegments(root, parts);
  const fileHandle = await dir.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  // TS 5.7 typed Uint8Array as Uint8Array<ArrayBufferLike>, which the strict
  // write() signature rejects; the bytes here are always plain ArrayBuffer-backed,
  // so this cast is safe.
  await writable.write(data as Parameters<FileSystemWritableFileStream['write']>[0]);
  await writable.close();
}
