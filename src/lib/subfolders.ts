// Per-pack subfolders. A subfolder is a sub-group INSIDE a background pack — e.g.
// a "My Uploads" pack split into "gym", "lifestyle", "food". The assignment of a
// given image to a subfolder lives on the image record itself (localLibrary,
// `subfolder` field); THIS module only keeps the registry of subfolder NAMES per
// pack in localStorage, so an empty subfolder can be created (and dropped into)
// before any image lives in it. Both together let the Library view organise
// photos and the Generate pack-picker target a single subfolder instead of the
// whole pack.
const KEY = 'slidesmith-subfolders';

type Listener = () => void;
const listeners = new Set<Listener>();

// Registry shape in localStorage: { [packName]: string[] } — the declared
// subfolder names for each pack, in creation order.
type Registry = Record<string, string[]>;

function read(): Registry {
  try {
    const raw = localStorage.getItem(KEY);
    const obj = raw ? (JSON.parse(raw) as Registry) : {};
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

function write(reg: Registry): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(reg));
  } catch {
    /* storage full / unavailable — subfolder list just won't persist */
  }
  listeners.forEach((l) => l());
}

// Declared subfolder names for a pack (may include ones with no images yet).
export function getSubfolders(pack: string): string[] {
  return read()[pack] || [];
}

// Add a subfolder name to a pack. Trimmed; no-op on blank or duplicate.
export function addSubfolder(pack: string, name: string): void {
  const clean = name.trim();
  if (!clean) return;
  const reg = read();
  const list = reg[pack] || [];
  if (list.some((s) => s.toLowerCase() === clean.toLowerCase())) return;
  reg[pack] = [...list, clean];
  write(reg);
}

// Remove a subfolder name from a pack's registry. Images still tagged with it
// are handled by the caller (moved back to Unfiled) — this only drops the name.
export function removeSubfolder(pack: string, name: string): void {
  const reg = read();
  const list = reg[pack];
  if (!list) return;
  reg[pack] = list.filter((s) => s !== name);
  if (!reg[pack].length) delete reg[pack];
  write(reg);
}

// Rename a pack's subfolder entry in the registry (image records are updated by
// the caller). No-op if the new name is blank or collides.
export function renameSubfolder(pack: string, from: string, to: string): void {
  const clean = to.trim();
  if (!clean || clean === from) return;
  const reg = read();
  const list = reg[pack];
  if (!list || !list.includes(from)) return;
  if (list.some((s) => s.toLowerCase() === clean.toLowerCase())) return;
  reg[pack] = list.map((s) => (s === from ? clean : s));
  write(reg);
}

export function subscribeSubfolders(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ── Selection tokens ─────────────────────────────────────────────────────────
// The pack-picker and generation select packs by a flat list of string tokens.
// A token is either a bare pack name (the whole pack) or `pack<US>subfolder`
// (one subfolder). The separator is the ASCII Unit Separator (0x1F), which can't
// appear in a pack or subfolder name typed by the user, so tokens round-trip
// unambiguously.
const SEP = '';

export function makeToken(pack: string, subfolder?: string | null): string {
  return subfolder ? `${pack}${SEP}${subfolder}` : pack;
}

export interface ParsedToken {
  pack: string;
  subfolder: string | null;
}

export function parseToken(token: string): ParsedToken {
  const i = token.indexOf(SEP);
  if (i === -1) return { pack: token, subfolder: null };
  return { pack: token.slice(0, i), subfolder: token.slice(i + 1) };
}

// Does an image satisfy a selection token? A bare-pack token matches every image
// in the pack (any subfolder or none); a subfolder token matches only images
// tagged with that exact subfolder.
export function tokenMatches(token: string, img: { pack: string; subfolder?: string | null }): boolean {
  const t = parseToken(token);
  if (t.pack !== img.pack) return false;
  if (t.subfolder === null) return true;
  return (img.subfolder || null) === t.subfolder;
}
