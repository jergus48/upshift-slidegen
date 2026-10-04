// ── CapCut formats ───────────────────────────────────────────────────────────
// A format is one edit the user cut by hand in CapCut against a song, with
// placeholder clips standing in for a character's material. The server reads
// those projects (server/capcutImport.js) into public/formats/capcut/, and the
// Video tab renders a character into one frame for frame (lib/capcutVideo.ts).
//
// Nothing about a format is decided here. Every cut, every in-point, every
// speed, every filter and effect is where the CapCut project put it; the only
// thing that changes between two videos of the same format is WHICH of the
// character's clips fill the placeholders.
import type { LibraryImage } from '../types';
import type { Character } from './characters';
import { addSubfolder, getSubfolders, removeSubfolder } from './subfolders';

// The placeholder names, which are also the subfolder names a character's
// library pack must use. The pair is always chopped (before) and buffed (after).
export const ROLES = [
  'clip_chopped',
  'clip_buffed',
  'scoreboard_chopped',
  'scoreboard_buffed',
  'rating_chopped',
  'rating_buffed',
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  clip_chopped: 'Clips, chopped',
  clip_buffed: 'Clips, buffed',
  scoreboard_chopped: 'Scoreboard, chopped',
  scoreboard_buffed: 'Scoreboard, buffed',
  rating_chopped: 'Rating, chopped',
  rating_buffed: 'Rating, buffed',
};

// The same colours the placeholder clips are painted in, so the strip in the
// app reads like the CapCut timeline it came from.
export const ROLE_COLOR: Record<Role | 'asset' | 'gap', string> = {
  clip_chopped: '#4A4A4A',
  clip_buffed: '#6A2A8B',
  scoreboard_chopped: '#8B1E1E',
  scoreboard_buffed: '#1E6B2E',
  rating_chopped: '#7A3E0A',
  rating_buffed: '#1E3F8B',
  asset: '#0EA5E9',
  gap: '#000000',
};

export const FORMAT_KINDS = ['scoreboard', 'rating', 'rating-app'] as const;
export const FORMAT_LABEL: Record<string, string> = {
  scoreboard: 'Scoreboard',
  rating: 'Rating',
  'rating-app': 'Rating + app',
};

// Where a piece sits on the 1080×1920 canvas, exactly as CapCut records it:
// `scale` is relative to the source fitted inside the canvas, `x`/`y` are the
// centre's offset in half-canvas units with +y UP.
export interface Placement {
  scale: number;
  x: number;
  y: number;
  rotation: number;
  alpha: number;
  flip: boolean;
}

export interface FormatPiece extends Placement {
  from: number;
  to: number;
  // In-point in the source, and the speed it plays at.
  src: number;
  speed: number;
  // A placeholder, filled from the character — or 'asset', a real file that
  // ships with the format and is shown exactly as it was cut.
  role: Role | 'asset';
  asset?: string;
  kind?: 'image' | 'video';
}

export interface FormatOverlay extends Placement {
  from: number;
  to: number;
  src: number;
  speed: number;
  asset: string;
  kind: 'image' | 'video';
}

export interface FormatFilter {
  from: number;
  to: number;
  name: string;
  intensity: number;
  // Lookup tables, applied in order; `scaled` ones follow the intensity.
  luts: { png: string; scaled: boolean }[];
}

export interface FormatEffect {
  from: number;
  to: number;
  effect: string;
  params: Record<string, number>;
}

export interface CapcutFormat {
  id: string;
  song: string;
  format: string;
  project: string;
  importedAt: string;
  fps: number;
  width: number;
  height: number;
  duration: number;
  drop: number;
  audio: {
    file: string;
    name: string;
    segments: { from: number; to: number; src: number; speed: number; volume: number }[];
  };
  video: FormatPiece[];
  overlays: FormatOverlay[];
  filters: FormatFilter[];
  effects: FormatEffect[];
  warnings: string[];
}

const BASE = '/formats/capcut/';

// A path inside a format ('assets/…') as a URL the page can load.
export const assetUrl = (p: string): string => BASE + p.split('/').map(encodeURIComponent).join('/');

// Every imported format. Not cached: an import in Brain must show up in the
// Video tab without a reload.
export async function listCapcutFormats(): Promise<CapcutFormat[]> {
  try {
    const r = await fetch(`${BASE}index.json`, { cache: 'no-store' });
    if (!r.ok) return [];
    const names = (await r.json()) as string[];
    const list = await Promise.all(
      names.map((n) =>
        fetch(BASE + n, { cache: 'no-store' })
          .then((x) => (x.ok ? (x.json() as Promise<CapcutFormat>) : null))
          .catch(() => null),
      ),
    );
    return list
      .filter((f): f is CapcutFormat => Boolean(f && f.id && Array.isArray(f.video) && f.audio?.file))
      .sort((a, b) => a.song.localeCompare(b.song) || a.format.localeCompare(b.format));
  } catch {
    return [];
  }
}

export const formatLabel = (f: CapcutFormat): string => `${f.song} · ${FORMAT_LABEL[f.format] ?? f.format}`;

// The placeholders a format needs filled.
export function rolesOf(f: CapcutFormat): Role[] {
  const used = new Set(f.video.map((v) => v.role).filter((r): r is Role => r !== 'asset'));
  return ROLES.filter((r) => used.has(r));
}

// The black holes in the edit: stretches of the timeline with no piece on it.
export function gapsOf(f: CapcutFormat): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  let at = 0;
  for (const v of [...f.video].sort((a, b) => a.from - b.from)) {
    if (v.from - at > 0.02) out.push({ from: at, to: v.from });
    at = Math.max(at, v.to);
  }
  if (f.duration - at > 0.02) out.push({ from: at, to: f.duration });
  return out;
}

// ── A character's material ───────────────────────────────────────────────────
// A character's material is ONE library pack named exactly like the character,
// with one subfolder per placeholder: "Marcus" › clip_chopped, clip_buffed, …
// That is the whole contract — nothing to pick per character, so a folder
// uploaded with the right names is ready the moment it lands.
export type RolePools = Partial<Record<Role, LibraryImage[]>>;

const norm = (s: string) => s.trim().toLowerCase();

export function characterPack(c: Character, library: LibraryImage[]): string | null {
  const hit = library.find((i) => norm(i.pack) === norm(c.name));
  if (hit) return hit.pack;
  // A pack with its folders created but nothing uploaded yet still exists.
  return getSubfolders(c.name.trim()).length ? c.name.trim() : null;
}

// The 🌽 videos show their own scoreboard and rating screens, kept in
// lust_-prefixed folders next to the usual ones; the clips are shared. No
// fallback to the screen-time folders: an empty lust_ folder shows as missing.
export type FolderTopic = 'screen' | 'lust';
const LUST_ROLES: Role[] = ['scoreboard_chopped', 'scoreboard_buffed', 'rating_chopped', 'rating_buffed'];
export const folderFor = (r: Role, topic: FolderTopic = 'screen'): string =>
  topic === 'lust' && LUST_ROLES.includes(r) ? `lust_${r}` : r;

export function poolsFor(c: Character, library: LibraryImage[], topic: FolderTopic = 'screen'): RolePools {
  const pack = characterPack(c, library);
  const pools: RolePools = {};
  if (!pack) return pools;
  for (const img of library) {
    if (img.pack !== pack || !img.subfolder) continue;
    const role = ROLES.find((r) => norm(folderFor(r, topic)) === norm(img.subfolder!));
    if (role) (pools[role] ||= []).push(img);
  }
  return pools;
}

// What's missing before a character can be rendered into this format.
export function missingFor(f: CapcutFormat, pools: RolePools): Role[] {
  return rolesOf(f).filter((r) => !pools[r]?.length);
}

// Every character gets its pack with all six placeholder subfolders created up
// front, so uploading is dropping files into folders that are already there.
// Only adds what's missing; never renames or removes anything.
export function ensureRoleFolders(pack: string): void {
  const name = pack.trim();
  if (!name) return;
  // The short-lived scoreboard *_profile folders: dropped from the list. Any
  // file already filed there stays and still shows in the Library.
  for (const old of ['scoreboard_chopped_profile', 'scoreboard_buffed_profile']) removeSubfolder(name, old);
  const have = getSubfolders(name).map((s) => s.toLowerCase());
  for (const r of ROLES) if (!have.includes(r)) addSubfolder(name, r);
  for (const r of LUST_ROLES) if (!have.includes(folderFor(r, 'lust'))) addSubfolder(name, folderFor(r, 'lust'));
}
