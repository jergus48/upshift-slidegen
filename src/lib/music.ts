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

export type MusicGender = 'male' | 'female';

interface MusicManifest {
  base?: string;
  male?: string[];
  female?: string[];
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

// A random track URL from the pool, or null if the pool is empty/unconfigured.
export async function pickMusicTrack(gender: MusicGender): Promise<string | null> {
  const m = await loadManifest();
  const list = m[gender] ?? [];
  if (!list.length) return null;
  const file = list[Math.floor(Math.random() * list.length)];
  return trackUrl(m, gender, file);
}
