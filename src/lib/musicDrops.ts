// Per-track DROP points, chosen by hand in the Brain "Characters music" editor
// and saved in the browser (localStorage). Unlike the start points in
// musicStarts.ts, a drop is not where playback begins — it's the second of the
// song that must be HEARD at a specific moment in the video.
//
// The Characters video exporter uses it for before/after decks: it counts the
// before slides' on-screen time and starts the track that far ahead of the drop,
// so the drop hits exactly on the cut from the before half to the after half.
//
// Keyed by the track's manifest filename / `local:…` id — the same key
// musicStarts.ts uses — so both settings can coexist for one track.

const KEY = 'slidesmith:musicDrops';

type DropMap = Record<string, number>;

function read(): DropMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw) as DropMap;
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

function write(map: DropMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // storage full/unavailable — nothing we can do client-side
  }
}

// Saved drop (seconds) for a track, or undefined if the user hasn't set one.
export function getDrop(file: string): number | undefined {
  const v = read()[file];
  return typeof v === 'number' && v >= 0 ? v : undefined;
}

export function getAllDrops(): DropMap {
  return read();
}

// Save (or clear, when seconds is null) a track's drop point.
export function setDrop(file: string, seconds: number | null): void {
  const map = read();
  if (seconds == null) delete map[file];
  else map[file] = Math.max(0, Math.round(seconds * 10) / 10); // 0.1s precision
  write(map);
}
