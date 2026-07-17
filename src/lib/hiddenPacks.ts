// User-hidden background packs. Persists a set of pack names in localStorage so
// the choice survives reloads (per browser/device, like the local library). A
// hidden pack is filtered out of everything that generates slides (Generate
// modal, pack pickers) via getMergedLibrary(); the Library view still shows it
// with a "Show" toggle so it can be brought back.
const KEY = 'slidesmith-hidden-packs';

type Listener = () => void;
const listeners = new Set<Listener>();

function read(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function write(set: Set<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...set]));
  } catch {
    /* storage full / unavailable — hiding just won't persist */
  }
  listeners.forEach((l) => l());
}

export function getHiddenPacks(): Set<string> {
  return read();
}

export function isPackHidden(name: string): boolean {
  return read().has(name);
}

export function setPackHidden(name: string, hidden: boolean): void {
  const set = read();
  if (hidden) set.add(name);
  else set.delete(name);
  write(set);
}

// Subscribe to changes (returns an unsubscribe fn) so views re-render when a
// pack is hidden/shown.
export function subscribeHiddenPacks(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
