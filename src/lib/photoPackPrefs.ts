// Remembers the user's Photo Packs override picks — the Cover photo pack
// (mirror) and the App slide photo pack (pov) — so they default back to what
// was last chosen next time the page opens. Persisted per browser/device in
// localStorage, exactly like hiddenPhotos/hiddenPacks. Empty string means "use
// the default library category" and is stored as such.
const KEY = 'slidesmith-photopack-prefs';

export interface PhotoPackPrefs {
  coverPack: string;
  appPack: string;
}

const EMPTY: PhotoPackPrefs = { coverPack: '', appPack: '' };

export function getPhotoPackPrefs(): PhotoPackPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<PhotoPackPrefs>;
    return {
      coverPack: typeof parsed.coverPack === 'string' ? parsed.coverPack : '',
      appPack: typeof parsed.appPack === 'string' ? parsed.appPack : '',
    };
  } catch {
    return { ...EMPTY };
  }
}

export function setPhotoPackPrefs(prefs: PhotoPackPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* storage full / unavailable — the pick just won't persist */
  }
}
