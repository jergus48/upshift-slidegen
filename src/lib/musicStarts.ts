// Per-track music start points, chosen by hand in the Brain "Video music" editor
// and saved in the browser (localStorage). These OVERRIDE both the manifest's
// optional "start" and the exporter's automatic drop-detection, so once you set
// a track's sweet spot every exported video opens exactly there.
//
// Keyed by the track's manifest filename/URL (the same string pickMusicTrack
// resolves from), so it stays stable regardless of gender pool.

const KEY = 'slidesmith:musicStarts';

type StartMap = Record<string, number>;

function read(): StartMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw) as StartMap;
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

function write(map: StartMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // storage full/unavailable — nothing we can do client-side
  }
}

// Saved start (seconds) for a track, or undefined if the user hasn't set one.
export function getStart(file: string): number | undefined {
  const v = read()[file];
  return typeof v === 'number' && v >= 0 ? v : undefined;
}

export function getAllStarts(): StartMap {
  return read();
}

// Save (or clear, when seconds is null) a track's start point.
export function setStart(file: string, seconds: number | null): void {
  const map = read();
  if (seconds == null) delete map[file];
  else map[file] = Math.max(0, Math.round(seconds * 10) / 10); // 0.1s precision
  write(map);
}
