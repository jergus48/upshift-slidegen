// User-hidden individual photo-library images. The photo packs (PhotoPackView)
// are built from real R2 photos the SERVER picks at random per slot category —
// so when a specific photo is bad, hiding the whole category isn't what you
// want. This persists a set of photo URLs in localStorage (per browser/device,
// like hiddenPacks) and the set is shipped to the server on generate as an
// exclude list, so the picker never chooses a hidden photo again. The Photo
// Packs curation grid also greys hidden photos out and offers an un-hide toggle.
//
// Keys are the full image URL exactly as it appears in the manifest-built path
// (`${base}${category}/${file}`), so it matches both the preview and the URLs
// the server assembles in photopack.js.
const KEY = 'slidesmith-hidden-photos';

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

export function getHiddenPhotos(): Set<string> {
  return read();
}

export function isPhotoHidden(url: string): boolean {
  return read().has(url);
}

export function setPhotoHidden(url: string, hidden: boolean): void {
  const set = read();
  if (hidden) set.add(url);
  else set.delete(url);
  write(set);
}

// Subscribe to changes (returns an unsubscribe fn) so views re-render when a
// photo is hidden/shown.
export function subscribeHiddenPhotos(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
