// Named output folders on the machine running the render server. Unlike the
// browser folder presets in lib/downloadFolders.ts — opaque directory handles
// the browser hands back, with no path attached — a server render job needs a
// real path string ("D:\Renders\Alex"), because it is Node on the other side
// that creates the folder and writes the videos.
//
// So this is a small separate store: a list of {id, name, path} kept in
// localStorage, edited once in Brain and then picked from a dropdown wherever a
// server output folder is needed. Same spirit as the download folders, just the
// server-side half of it.

export interface ServerFolder {
  id: string;
  name: string;
  path: string;
}

const KEY = 'slidesmith:serverFolders';

type Listener = () => void;
const listeners = new Set<Listener>();

export function listServerFolders(): ServerFolder[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (f): f is ServerFolder =>
        !!f && typeof f.id === 'string' && typeof f.name === 'string' && typeof f.path === 'string',
    );
  } catch {
    return [];
  }
}

function save(folders: ServerFolder[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(folders));
  } catch {
    // Storage full or blocked — nothing useful to do, the UI keeps working.
  }
  listeners.forEach((fn) => fn());
}

// Re-render every dropdown the moment Brain adds or removes a folder.
export function subscribeServerFolders(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function addServerFolder(name: string, path: string): ServerFolder | null {
  const cleanPath = path.trim();
  if (!cleanPath) return null;
  const folder: ServerFolder = {
    id: `server:${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    name: name.trim() || leafName(cleanPath),
    path: cleanPath,
  };
  save([...listServerFolders(), folder]);
  return folder;
}

export function removeServerFolder(id: string): void {
  save(listServerFolders().filter((f) => f.id !== id));
}

export function renameServerFolder(id: string, name: string): void {
  save(
    listServerFolders().map((f) =>
      f.id === id ? { ...f, name: name.trim() || leafName(f.path) } : f,
    ),
  );
}

// "D:\Renders\Alex" → "Alex". Used when a folder is saved without a name.
export function leafName(path: string): string {
  const parts = path.replace(/[\\/]+$/, '').split(/[\\/]/);
  return parts[parts.length - 1] || path;
}
