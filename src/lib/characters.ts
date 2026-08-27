// Characters for the before/after transformation tool.
//
// A "character" is one face with two library packages: BEFORE shots (the addict
// look) and AFTER shots (the glow-up), plus a skin/gender variant. On top of
// those, two packages are shared: the "🌽 blocked" screenshots and the Upshift
// streak screenshots — the latter picked per streak duration, so the screenshot
// always matches the number in the text. Both shared ones are kept PER VARIANT,
// so the hand in the proof screenshot matches the character it is shown with.
//
// Nothing is stored here but SELECTION TOKENS (see lib/subfolders.ts): a bare
// pack name selects the whole pack, a pack+subfolder token selects one subfolder.
// The photos themselves stay in the normal library (bundled packs from the
// server + this browser's scraped/uploaded ones), so a package is curated in the
// Library view like every other pack, and a deck draws random images out of it.
import { setPackHidden } from './hiddenPacks';

const KEY = 'slidesmith:characters';

// ── Variants ─────────────────────────────────────────────────────────────────
// The hand holding the phone in a proof screenshot has to match the character in
// the before/after shots, so the shared packages are not one set but one set PER
// VARIANT — skin × gender. Each character carries its variant, and the blocked/
// streak packages are resolved through it when a deck is built.
export interface Skin {
  key: string;
  label: string;
}
export interface Gender {
  key: string;
  label: string;
}

export const SKINS: Skin[] = [
  { key: 'white', label: 'White' },
  { key: 'black', label: 'Black' },
];

export const GENDERS: Gender[] = [
  { key: 'male', label: 'Male' },
  { key: 'female', label: 'Female' },
];

export const DEFAULT_SKIN = 'white';
export const DEFAULT_GENDER = 'male';

export const variantKey = (skin: string, gender: string): string => `${skin}-${gender}`;

// "White male" — the suffix on every bundled pack name, and the label in the UI.
export function variantLabel(skin: string, gender: string): string {
  const s = SKINS.find((x) => x.key === skin)?.label || skin;
  const g = GENDERS.find((x) => x.key === gender)?.label || gender;
  return `${s} ${g.toLowerCase()}`;
}

export interface Variant {
  key: string;
  skin: string;
  gender: string;
  label: string;
}

// Every skin × gender combination, in a fixed order.
export const VARIANTS: Variant[] = SKINS.flatMap((s) =>
  GENDERS.map((g) => ({
    key: variantKey(s.key, g.key),
    skin: s.key,
    gender: g.key,
    label: variantLabel(s.key, g.key),
  }))
);

export const variantOf = (c: { skin?: string; gender?: string }): string =>
  variantKey(c.skin || DEFAULT_SKIN, c.gender || DEFAULT_GENDER);

// ── Streaks ──────────────────────────────────────────────────────────────────
// The durations a streak package can be filed under. `label` is what goes in the
// deck text ("1 year clean"); `article` is the same duration phrased for the
// hooks that read "quit lust for a year"; `packBase` is the bundled pack name
// before the variant suffix.
export interface Streak {
  key: string;
  label: string;
  article: string;
  packBase: string;
}

// The durations we actually ship screenshots for. Adding one here only makes it
// selectable — it stays unusable until its package holds photos.
export const STREAKS: Streak[] = [
  { key: '30d', label: '30 days', article: '30 days', packBase: 'Upshift Streak 30' },
  { key: '60d', label: '60 days', article: '60 days', packBase: 'Upshift Streak 60' },
  { key: '100d', label: '100 days', article: '100 days', packBase: 'Upshift Streak 100' },
  { key: '365d', label: '1 year', article: 'a year', packBase: 'Upshift Streak 365' },
];

// The blocked-🌽 and streak screenshots ship with the build as ordinary bundled
// library packs (public/library/manifest.json), one set per variant, so the tool
// works out of the box for every user/browser. These names are the defaults every
// package falls back to; picking anything else in the UI overrides them for good.
// Only the variants we have actually shot are bundled — the rest resolve to a
// name with nothing behind it, which the UI reports as an empty package until
// photos are filed under that name.
export const defaultBlockedPack = (skin: string, gender: string): string =>
  `Blocked 🌽 (${variantLabel(skin, gender)})`;

export const defaultStreakPack = (streakKey: string, skin: string, gender: string): string => {
  const s = STREAKS.find((x) => x.key === streakKey);
  return s ? `${s.packBase} (${variantLabel(skin, gender)})` : '';
};

const defaultBlockedFor = (variant: string): string => {
  const v = VARIANTS.find((x) => x.key === variant);
  return v ? defaultBlockedPack(v.skin, v.gender) : '';
};

const defaultStreakFor = (variant: string, streakKey: string): string => {
  const v = VARIANTS.find((x) => x.key === variant);
  return v ? defaultStreakPack(streakKey, v.skin, v.gender) : '';
};

// Keep the bundled screenshot packs out of the background pickers — they're
// proof slides, not backgrounds, and a streak screenshot behind a caption in
// some other tool would be nonsense. Runs once per browser; a later un-hide in
// the Library view is the user's call and is not undone. The key is versioned so
// adding a variant's packs re-runs it once.
const HIDDEN_SEED_KEY = 'slidesmith:characters:packs-hidden:v2';

export function hideBundledPacksOnce(): void {
  try {
    if (localStorage.getItem(HIDDEN_SEED_KEY)) return;
    for (const v of VARIANTS) {
      setPackHidden(defaultBlockedPack(v.skin, v.gender), true);
      for (const s of STREAKS) setPackHidden(defaultStreakPack(s.key, v.skin, v.gender), true);
    }
    localStorage.setItem(HIDDEN_SEED_KEY, '1');
  } catch {
    /* storage unavailable — the packs just stay visible in the pickers */
  }
}

export const streakByKey = (key: string): Streak | undefined => STREAKS.find((s) => s.key === key);

export interface Character {
  id: string;
  name: string;
  skin: string;
  gender: string;
  beforeToken: string; // library selection token, '' = not picked yet
  afterToken: string;
}

interface Store {
  characters: Character[];
  // variant key → library selection token
  blockedTokens: Record<string, string>;
  // variant key → (streak key → library selection token)
  streakTokens: Record<string, Record<string, string>>;
}

const EMPTY: Store = { characters: [], blockedTokens: {}, streakTokens: {} };

type Listener = () => void;
const listeners = new Set<Listener>();
const notify = () => listeners.forEach((l) => l());

export function subscribeCharacters(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Stores written before variants existed held a single blockedToken and a flat
// streakTokens map. Those picks were all of the white-male set, so they are read
// back under that variant and everything else starts on its bundled default.
interface LegacyStore {
  blockedToken?: unknown;
  streakTokens?: unknown;
}

const LEGACY_VARIANT = variantKey(DEFAULT_SKIN, DEFAULT_GENDER);

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

function readTokenMap(v: unknown): Record<string, string> {
  if (!v || typeof v !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'string' && val) out[k] = val;
  }
  return out;
}

function read(): Store {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null') as
      | (Partial<Store> & LegacyStore)
      | null;
    if (!raw) return { ...EMPTY, characters: [], blockedTokens: {}, streakTokens: {} };

    const characters: Character[] = Array.isArray(raw.characters)
      ? raw.characters.map((c) => ({
          id: String(c.id),
          name: String(c.name || ''),
          skin: str(c.skin) || DEFAULT_SKIN,
          gender: str(c.gender) || DEFAULT_GENDER,
          beforeToken: String(c.beforeToken || ''),
          afterToken: String(c.afterToken || ''),
        }))
      : [];

    const blockedTokens = readTokenMap(raw.blockedTokens);
    const legacyBlocked = str(raw.blockedToken);
    if (legacyBlocked && !blockedTokens[LEGACY_VARIANT]) blockedTokens[LEGACY_VARIANT] = legacyBlocked;

    const streakTokens: Record<string, Record<string, string>> = {};
    const rawStreaks = raw.streakTokens as Record<string, unknown> | undefined;
    if (rawStreaks && typeof rawStreaks === 'object') {
      for (const [k, val] of Object.entries(rawStreaks)) {
        // Flat legacy map: streak key → token. Nested current map: variant → map.
        if (typeof val === 'string') {
          if (val) {
            streakTokens[LEGACY_VARIANT] = { ...(streakTokens[LEGACY_VARIANT] || {}), [k]: val };
          }
        } else {
          const nested = readTokenMap(val);
          if (Object.keys(nested).length) {
            streakTokens[k] = { ...nested, ...(streakTokens[k] || {}) };
          }
        }
      }
    }

    return { characters, blockedTokens, streakTokens };
  } catch {
    return { ...EMPTY, characters: [], blockedTokens: {}, streakTokens: {} };
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

// ── Shared packages, per variant ────────────────────────────────────────────
// An explicit pick wins; otherwise the variant's bundled pack, so the tool works
// before anyone has chosen anything.
export function getBlockedToken(variant: string): string {
  return read().blockedTokens[variant] || defaultBlockedFor(variant);
}

export function setBlockedToken(variant: string, token: string): void {
  const store = read();
  const next = { ...store.blockedTokens };
  if (token) next[variant] = token;
  else delete next[variant];
  write({ ...store, blockedTokens: next });
}

export function getStreakToken(variant: string, streakKey: string): string {
  return read().streakTokens[variant]?.[streakKey] || defaultStreakFor(variant, streakKey);
}

export function setStreakToken(variant: string, streakKey: string, token: string): void {
  const store = read();
  const forVariant = { ...(store.streakTokens[variant] || {}) };
  if (token) forVariant[streakKey] = token;
  else delete forVariant[streakKey];
  write({ ...store, streakTokens: { ...store.streakTokens, [variant]: forVariant } });
}

// Durations that have a package assigned for this variant — the only ones a deck
// can be built for, since every deck carries a streak slide.
export function getUsableStreaks(variant: string): Streak[] {
  return STREAKS.filter((s) => !!getStreakToken(variant, s.key));
}

// ── Characters ──────────────────────────────────────────────────────────────
export function addCharacter(name: string): Character {
  const store = read();
  const character: Character = {
    id: `ch-${Date.now()}-${Math.round(Math.random() * 1e4)}`,
    name: name.trim() || `Character ${store.characters.length + 1}`,
    skin: DEFAULT_SKIN,
    gender: DEFAULT_GENDER,
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

// The character's skin/gender — decides which variant of the shared blocked and
// streak packages their decks draw the proof screenshots from.
export function setCharacterLook(id: string, look: { skin?: string; gender?: string }): void {
  const store = read();
  write({
    ...store,
    characters: store.characters.map((c) =>
      c.id === id
        ? { ...c, skin: look.skin ?? c.skin, gender: look.gender ?? c.gender }
        : c
    ),
  });
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
