// Characters for the before/after transformation tool.
//
// A "character" is one face with two photo packages: BEFORE shots (the addict
// look) and AFTER shots (the glow-up). On top of those, two packages are shared
// by every character: the "🌽 blocked" screenshot and the Upshift streak
// screenshot. A deck is assembled from those four pools — see transformationDeck.ts.
//
// Storage mirrors lib/presetScreenshots.ts: the image BYTES go into the local
// library's IndexedDB (so slides resolve them through the normal `local:` id
// path, see imageSrc.ts) under packs that are auto-hidden from the background
// pickers, while the mapping character → image ids lives in localStorage.
import { addLocalImages, removeLocalImage } from './localLibrary';
import { setPackHidden } from './hiddenPacks';

const KEY = 'slidesmith:characters';

// Pack names the bytes are filed under. Hidden from the pickers so they never
// pollute background selection; still visible/deletable in the Library view.
const packForCharacter = (id: string, kind: 'before' | 'after') => `Character ${id} · ${kind}`;
const BLOCKED_PACK = 'Blocked 🌽 screenshots';
const STREAK_PACK = 'Upshift streak screenshots';

// ── Streaks ─────────────────────────────────────────────────────────────────
// The durations a streak screenshot can be filed under. `label` is what goes in
// the deck text ("1 year clean"); `article` is the same duration phrased for the
// hooks that read "quit lust for a year".
export interface Streak {
  key: string;
  label: string;
  article: string;
}

export const STREAKS: Streak[] = [
  { key: '7d', label: '7 days', article: '7 days' },
  { key: '14d', label: '14 days', article: '14 days' },
  { key: '30d', label: '30 days', article: '30 days' },
  { key: '60d', label: '60 days', article: '60 days' },
  { key: '90d', label: '90 days', article: '90 days' },
  { key: '6mo', label: '6 months', article: '6 months' },
  { key: '1y', label: '1 year', article: 'a year' },
];

export const streakByKey = (key: string): Streak | undefined => STREAKS.find((s) => s.key === key);

export interface Character {
  id: string;
  name: string;
  before: string[]; // local image ids
  after: string[];
}

interface Store {
  characters: Character[];
  blocked: string[]; // shared "🌽 blocked" screenshots
  streaks: Record<string, string[]>; // streak key → uploaded screenshot ids
}

// ── Bundled streak screenshots ──────────────────────────────────────────────
// Shipped with the build (public/streak-shots/manifest.json), so the streak pack
// works for every user/browser without anyone uploading anything. Per-browser
// uploads are added on top, not instead.
let streakDefaults: Record<string, string[]> = {};

export async function loadStreakDefaults(): Promise<void> {
  try {
    const res = await fetch('/streak-shots/manifest.json');
    if (!res.ok) return;
    const json = (await res.json()) as { shots?: Record<string, string[]> };
    streakDefaults = Object.fromEntries(
      Object.entries(json.shots || {}).map(([k, files]) => [
        k,
        (files || []).map((f) => (f.startsWith('/') ? f : `/streak-shots/${f}`)),
      ])
    );
    notify();
  } catch {
    /* no bundled defaults — uploads still work */
  }
}

type Listener = () => void;
const listeners = new Set<Listener>();
const notify = () => listeners.forEach((l) => l());

export function subscribeCharacters(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function read(): Store {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null') as Partial<Store> | null;
    if (!raw) return { characters: [], blocked: [], streaks: {} };
    return {
      characters: Array.isArray(raw.characters)
        ? raw.characters.map((c) => ({
            id: String(c.id),
            name: String(c.name || ''),
            before: Array.isArray(c.before) ? c.before.map(String) : [],
            after: Array.isArray(c.after) ? c.after.map(String) : [],
          }))
        : [],
      blocked: Array.isArray(raw.blocked) ? raw.blocked.map(String) : [],
      streaks: raw.streaks && typeof raw.streaks === 'object' ? (raw.streaks as Record<string, string[]>) : {},
    };
  } catch {
    return { characters: [], blocked: [], streaks: {} };
  }
}

function write(store: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* storage full/unavailable — the mapping just won't persist */
  }
  notify();
}

export function getCharacters(): Character[] {
  return read().characters;
}

export function getBlockedShots(): string[] {
  return read().blocked;
}

// Bundled defaults first, then this browser's uploads.
export function getStreakShots(streakKey: string): string[] {
  const store = read();
  return [...(streakDefaults[streakKey] || []), ...(store.streaks[streakKey] || [])];
}

// Streaks that actually have at least one screenshot — the only ones a deck can
// be built for, since every deck carries a streak slide.
export function getUsableStreaks(): Streak[] {
  return STREAKS.filter((s) => getStreakShots(s.key).length > 0);
}

// ── Characters ──────────────────────────────────────────────────────────────
export function addCharacter(name: string): Character {
  const store = read();
  const character: Character = {
    id: `ch-${Date.now()}-${Math.round(Math.random() * 1e4)}`,
    name: name.trim() || `Character ${store.characters.length + 1}`,
    before: [],
    after: [],
  };
  write({ ...store, characters: [...store.characters, character] });
  return character;
}

export function renameCharacter(id: string, name: string): void {
  const store = read();
  write({
    ...store,
    characters: store.characters.map((c) => (c.id === id ? { ...c, name: name.trim() || c.name } : c)),
  });
}

// Drops the character AND its photo bytes — nothing else references them.
export async function removeCharacter(id: string): Promise<void> {
  const store = read();
  const character = store.characters.find((c) => c.id === id);
  write({ ...store, characters: store.characters.filter((c) => c.id !== id) });
  for (const imgId of [...(character?.before || []), ...(character?.after || [])]) {
    await removeLocalImage(imgId).catch(() => undefined);
  }
}

// Add photos to one of a character's two packages. `dataUrls` are base64 data
// URLs read from the files the user picked.
export async function addCharacterPhotos(
  id: string,
  kind: 'before' | 'after',
  dataUrls: string[]
): Promise<void> {
  const pack = packForCharacter(id, kind);
  const added = await addLocalImages(pack, dataUrls, 'uploaded');
  setPackHidden(pack, true);
  if (!added.length) return;
  const store = read();
  write({
    ...store,
    characters: store.characters.map((c) =>
      c.id === id ? { ...c, [kind]: [...c[kind], ...added.map((a) => a.id)] } : c
    ),
  });
}

export async function removeCharacterPhoto(
  id: string,
  kind: 'before' | 'after',
  imgId: string
): Promise<void> {
  const store = read();
  write({
    ...store,
    characters: store.characters.map((c) =>
      c.id === id ? { ...c, [kind]: c[kind].filter((x) => x !== imgId) } : c
    ),
  });
  await removeLocalImage(imgId).catch(() => undefined);
}

// ── Shared packages ─────────────────────────────────────────────────────────
export async function addBlockedShots(dataUrls: string[]): Promise<void> {
  const added = await addLocalImages(BLOCKED_PACK, dataUrls, 'uploaded');
  setPackHidden(BLOCKED_PACK, true);
  if (!added.length) return;
  const store = read();
  write({ ...store, blocked: [...store.blocked, ...added.map((a) => a.id)] });
}

export async function removeBlockedShot(imgId: string): Promise<void> {
  const store = read();
  write({ ...store, blocked: store.blocked.filter((x) => x !== imgId) });
  await removeLocalImage(imgId).catch(() => undefined);
}

export async function addStreakShots(streakKey: string, dataUrls: string[]): Promise<void> {
  const added = await addLocalImages(STREAK_PACK, dataUrls, 'uploaded');
  setPackHidden(STREAK_PACK, true);
  if (!added.length) return;
  const store = read();
  write({
    ...store,
    streaks: {
      ...store.streaks,
      [streakKey]: [...(store.streaks[streakKey] || []), ...added.map((a) => a.id)],
    },
  });
}

export async function removeStreakShot(streakKey: string, imgId: string): Promise<void> {
  const store = read();
  write({
    ...store,
    streaks: { ...store.streaks, [streakKey]: (store.streaks[streakKey] || []).filter((x) => x !== imgId) },
  });
  await removeLocalImage(imgId).catch(() => undefined);
}

// Bundled shots are files under public/, not IndexedDB rows — the view must not
// offer a delete button for them.
export const isBundledShot = (ref: string) => !ref.startsWith('local:');
