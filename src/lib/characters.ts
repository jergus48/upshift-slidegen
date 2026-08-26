// Characters for the before/after transformation tool.
//
// A "character" is one face with two library packages: BEFORE shots (the addict
// look) and AFTER shots (the glow-up). On top of those, two packages are shared
// by every character: the "🌽 blocked" screenshots and the Upshift streak
// screenshots — the latter picked per streak duration, so the screenshot always
// matches the number in the text.
//
// Nothing is stored here but SELECTION TOKENS (see lib/subfolders.ts): a bare
// pack name selects the whole pack, a pack+subfolder token selects one subfolder.
// The photos themselves stay in the normal library (bundled packs from the
// server + this browser's scraped/uploaded ones), so a package is curated in the
// Library view like every other pack, and a deck draws random images out of it.
import { setPackHidden } from './hiddenPacks';

const KEY = 'slidesmith:characters';

// The blocked-🌽 and streak screenshots ship with the build as ordinary bundled
// library packs (public/library/manifest.json), so the tool works out of the box
// for every user/browser. These names are the defaults every package falls back
// to; picking anything else in the UI overrides them for good.
const DEFAULT_BLOCKED_PACK = 'Blocked 🌽';

// ── Streaks ─────────────────────────────────────────────────────────────────
// The durations a streak package can be filed under. `label` is what goes in the
// deck text ("1 year clean"); `article` is the same duration phrased for the
// hooks that read "quit lust for a year".
export interface Streak {
  key: string;
  label: string;
  article: string;
  // Bundled pack this duration falls back to when the user hasn't picked one.
  defaultPack: string;
}

// The durations we actually ship screenshots for. Adding one here only makes it
// selectable — it stays unusable until its package holds photos.
export const STREAKS: Streak[] = [
  { key: '30d', label: '30 days', article: '30 days', defaultPack: 'Upshift Streak 30' },
  { key: '60d', label: '60 days', article: '60 days', defaultPack: 'Upshift Streak 60' },
  { key: '100d', label: '100 days', article: '100 days', defaultPack: 'Upshift Streak 100' },
  { key: '365d', label: '1 year', article: 'a year', defaultPack: 'Upshift Streak 365' },
];

// Keep the bundled screenshot packs out of the background pickers — they're
// proof slides, not backgrounds, and a streak screenshot behind a caption in
// some other tool would be nonsense. Runs once per browser; a later un-hide in
// the Library view is the user's call and is not undone.
const HIDDEN_SEED_KEY = 'slidesmith:characters:packs-hidden';

export function hideBundledPacksOnce(): void {
  try {
    if (localStorage.getItem(HIDDEN_SEED_KEY)) return;
    setPackHidden(DEFAULT_BLOCKED_PACK, true);
    for (const s of STREAKS) setPackHidden(s.defaultPack, true);
    localStorage.setItem(HIDDEN_SEED_KEY, '1');
  } catch {
    /* storage unavailable — the packs just stay visible in the pickers */
  }
}

export const streakByKey = (key: string): Streak | undefined => STREAKS.find((s) => s.key === key);

export interface Character {
  id: string;
  name: string;
  beforeToken: string; // library selection token, '' = not picked yet
  afterToken: string;
}

interface Store {
  characters: Character[];
  blockedToken: string;
  streakTokens: Record<string, string>; // streak key → library selection token
}

const EMPTY: Store = { characters: [], blockedToken: '', streakTokens: {} };

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
    if (!raw) return { ...EMPTY, characters: [], streakTokens: {} };
    return {
      characters: Array.isArray(raw.characters)
        ? raw.characters.map((c) => ({
            id: String(c.id),
            name: String(c.name || ''),
            beforeToken: String(c.beforeToken || ''),
            afterToken: String(c.afterToken || ''),
          }))
        : [],
      blockedToken: String(raw.blockedToken || ''),
      streakTokens:
        raw.streakTokens && typeof raw.streakTokens === 'object'
          ? (raw.streakTokens as Record<string, string>)
          : {},
    };
  } catch {
    return { ...EMPTY, characters: [], streakTokens: {} };
  }
}

function write(store: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* storage full/unavailable — the picks just won't persist */
  }
  notify();
}

export function getCharacters(): Character[] {
  return read().characters;
}

// An explicit pick wins; otherwise the bundled pack, so the tool works before
// anyone has chosen anything.
export function getBlockedToken(): string {
  return read().blockedToken || DEFAULT_BLOCKED_PACK;
}

export function setBlockedToken(token: string): void {
  write({ ...read(), blockedToken: token });
}

export function getStreakTokens(): Record<string, string> {
  return read().streakTokens;
}

export function getStreakToken(streakKey: string): string {
  return read().streakTokens[streakKey] || streakByKey(streakKey)?.defaultPack || '';
}

export function setStreakToken(streakKey: string, token: string): void {
  const store = read();
  const next = { ...store.streakTokens };
  if (token) next[streakKey] = token;
  else delete next[streakKey];
  write({ ...store, streakTokens: next });
}

// Durations that have a package assigned — the only ones a deck can be built
// for, since every deck carries a streak slide.
export function getUsableStreaks(): Streak[] {
  const tokens = read().streakTokens;
  return STREAKS.filter((s) => !!(tokens[s.key] || s.defaultPack));
}

// ── Characters ──────────────────────────────────────────────────────────────
export function addCharacter(name: string): Character {
  const store = read();
  const character: Character = {
    id: `ch-${Date.now()}-${Math.round(Math.random() * 1e4)}`,
    name: name.trim() || `Character ${store.characters.length + 1}`,
    beforeToken: '',
    afterToken: '',
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

// Only the character is dropped — the library packs it pointed at are untouched,
// since other characters (or other tools) may be using them.
export function removeCharacter(id: string): void {
  const store = read();
  write({ ...store, characters: store.characters.filter((c) => c.id !== id) });
}

// Point one of a character's two packages at a library pack/subfolder.
export function setCharacterToken(id: string, kind: 'before' | 'after', token: string): void {
  const field = kind === 'before' ? 'beforeToken' : 'afterToken';
  const store = read();
  write({
    ...store,
    characters: store.characters.map((c) => (c.id === id ? { ...c, [field]: token } : c)),
  });
}
