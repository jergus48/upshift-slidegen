// Background music for exported videos. Tracks live under public/music/, listed
// in public/music/manifest.json as two pools — one meant for a male-voice /
// male-audience motivational vibe, one for female. The video exporter picks a
// RANDOM track from the chosen pool for each video so a batch doesn't all share
// the same song.
//
// The manifest is intentionally simple so non-developers can drop new .mp3s in
// and add a line:
//   { "male": ["track-a.mp3", ...], "female": ["track-b.mp3", ...] }
// Files with no scheme resolve to /music/<gender>/<file>; a top-level "base"
// (e.g. an R2 URL) or an absolute http(s) file path override that.
//
// A track can also be an object to pin where playback starts — handy to skip an
// intro and open on the drop/hook:
//   { "file": "Future - Mask Off.mp3", "start": 8 }
// When "start" is omitted the exporter auto-detects the first high-energy point.

export type MusicGender = 'male' | 'female';

// A track is either a bare filename/URL or an object with an explicit start.
type MusicEntry = string | { file: string; start?: number };

interface MusicManifest {
  base?: string;
  male?: MusicEntry[];
  female?: MusicEntry[];
}

// Resolved track handed to the exporter: where to fetch it and, if pinned in the
// manifest, the second to start playback from (else undefined → auto-detect).
export interface MusicTrack {
  url: string;
  start?: number;
}

let manifestPromise: Promise<MusicManifest> | null = null;

function loadManifest(): Promise<MusicManifest> {
  if (!manifestPromise) {
    manifestPromise = fetch('/music/manifest.json')
      .then((r) => (r.ok ? (r.json() as Promise<MusicManifest>) : {}))
      .catch(() => ({}));
  }
  return manifestPromise;
}

function trackUrl(m: MusicManifest, gender: MusicGender, file: string): string {
  if (/^https?:\/\//i.test(file)) return file;
  if (file.startsWith('/')) return file;
  // Encode the filename — real tracks have spaces and non-ASCII (？ ë Ø) that
  // must be percent-encoded. Use encodeURI, NOT encodeURIComponent: the static
  // server matches literal , @ & [ ] in the path but not their %2C/%40/%26
  // forms, so those must stay unescaped (encodeURI leaves them alone).
  const enc = encodeURI(file);
  if (m.base) return `${m.base.replace(/\/?$/, '/')}${enc}`;
  return `/music/${gender}/${enc}`;
}

// True if the chosen pool has at least one track configured.
export async function hasMusic(gender: MusicGender): Promise<boolean> {
  const m = await loadManifest();
  return !!m[gender]?.length;
}

// A random track from the pool, or null if the pool is empty/unconfigured.
export async function pickMusicTrack(gender: MusicGender): Promise<MusicTrack | null> {
  const m = await loadManifest();
  const list = m[gender] ?? [];
  if (!list.length) return null;
  const entry = list[Math.floor(Math.random() * list.length)];
  const file = typeof entry === 'string' ? entry : entry.file;
  const start = typeof entry === 'string' ? undefined : entry.start;
  return { url: trackUrl(m, gender, file), start };
}
