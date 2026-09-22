import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, Sparkles, Check, UserRound, Images, Shuffle, RefreshCw, Film, Folder, HardDrive, Loader2, Download } from 'lucide-react';
import { ViewHeader } from '../components/ViewHeader';
import { Button } from '../components/Button';
import { IconButton } from '../components/IconButton';
import { MusicChoiceModal } from '../components/MusicChoiceModal';
import {
  supportsFolderPresets,
  listFolderPresets,
  getDefaultFolderId,
  type FolderPreset,
} from '../lib/downloadFolders';
import type { MusicGender } from '../lib/music';
import { serverRenderStatus } from '../lib/serverRender';
import {
  listServerFolders,
  subscribeServerFolders,
  type ServerFolder,
} from '../lib/serverFolders';
import { ServerRenderQueue } from '../components/ServerRenderQueue';
import { getMergedLibrary, getMergedPacks } from '../lib/mergedLibrary';
import { makeToken, parseToken, tokenMatches } from '../lib/subfolders';
import { buildLibraryZip, fileSlug, saveZip, type ExportGroup } from '../lib/libraryExport';
import { HOOKS, fillHook, hookUsesStreak } from '../lib/transformationHooks';
import { clipPoolFor, missingPieces, poolFor, usableStreaksIn } from '../lib/transformationDeck';
import {
  STREAKS,
  SKINS,
  GENDERS,
  VARIANTS,
  variantOf,
  variantLabel,
  setCharacterLook,
  getCharacters,
  getBlockedToken,
  setBlockedToken,
  getStreakToken,
  setStreakToken,
  hideBundledPacksOnce,
  addCharacter,
  renameCharacter,
  removeCharacter,
  setCharacterToken,
  setCharacterFolder,
  setCharacterOutDir,
  subscribeCharacters,
  type Variant,
  type Character,
} from '../lib/characters';
import type { CaptionStyle } from '../lib/captionStyle';
import type { LibraryImage, LibraryPack } from '../types';

// A character's packages, in the order they read in the UI. Each one becomes a
// folder in a character download, so what unzips is the same tree Slidegen
// shows: Character / package / pack / subfolder / files.
const PACKAGE_ROLES: { label: string; tokens: (c: Character) => string[] }[] = [
  { label: 'Before', tokens: (c) => c.beforeToken },
  { label: 'After', tokens: (c) => c.afterToken },
  { label: 'With girlfriend', tokens: (c) => c.girlfriendToken },
  { label: 'Gym', tokens: (c) => c.gymToken },
  { label: 'Videos', tokens: (c) => c.videoToken },
  { label: 'Stats - into the drop', tokens: (c) => c.statsInToken },
  { label: 'Stats - closing', tokens: (c) => c.statsOutToken },
];

// Every image a package selects, whatever kind it is — a download takes the
// photos AND the clips, unlike the deck helpers which split them apart.
function packageImages(library: LibraryImage[], tokens: string[]): LibraryImage[] {
  if (!tokens.length) return [];
  return library.filter((img) => tokens.some((t) => tokenMatches(t, img)));
}

// The export tree for one character: their own packages plus the shared
// blocked/streak screenshots their variant resolves to, each split by the pack
// it came from so a package drawing on several packs keeps them apart.
function characterGroups(c: Character, library: LibraryImage[]): ExportGroup[] {
  const variant = variantOf(c);
  const roles: { label: string; tokens: string[] }[] = [
    ...PACKAGE_ROLES.map((r) => ({ label: r.label, tokens: r.tokens(c) })),
    { label: 'Blocked', tokens: getBlockedToken(variant) },
    ...STREAKS.map((s) => ({ label: `Upshift streak ${s.label}`, tokens: getStreakToken(variant, s.key) })),
  ];
  const groups: ExportGroup[] = [];
  for (const role of roles) {
    const images = packageImages(library, role.tokens);
    if (!images.length) continue;
    const byPack = new Map<string, LibraryImage[]>();
    for (const img of images) {
      if (!byPack.has(img.pack)) byPack.set(img.pack, []);
      byPack.get(img.pack)!.push(img);
    }
    for (const [pack, list] of byPack) {
      groups.push({ path: [c.name || 'Character', role.label, pack], images: list });
    }
  }
  return groups;
}

const COUNT_OPTIONS = [1, 3, 5, 10];

// The fixed deck shape, shown to the user so they can see what they're getting
// before they generate. Kept in sync with lib/transformationDeck.ts.
const SHAPE = [
  { label: 'Before', hint: '2–3 slides, the hook on each' },
  { label: 'After', hint: '"<streak> clean"' },
  { label: 'Blocked 🌽', hint: 'shared package, same line' },
  { label: 'Streak', hint: 'shared package, same line' },
  { label: 'After', hint: '0–1 more, same line' },
  { label: 'With girlfriend', hint: 'the closing slide, same line' },
];

// Picks one library pack (or one of its subfolders) as a package, and previews a
// few of the photos a deck would draw from it. Everything the app calls a
// "package" here is just a normal library pack — curate it in the Library view.
function PackageSelect({
  label,
  hint,
  tokens,
  packs,
  library,
  kinds = 'photos',
  onChange,
}: {
  label: string;
  hint: string;
  // SEVERAL folders, not one. A character's shots are usually spread across a
  // few packs/subfolders, and the alternative — merging them in the Library, or
  // picking one and losing the rest — was the reason material went unused.
  tokens: string[];
  packs: LibraryPack[];
  library: LibraryImage[];
  // What the package is counted and previewed by. 'photos' is every package
  // that feeds a slide. 'clips' is the Videos package. 'both' is Stats and
  // Chopped, which take either — the renderer decides per asset whether a slot
  // shows a still or a moving shot.
  kinds?: 'photos' | 'clips' | 'both';
  onChange: (tokens: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const photos = kinds === 'clips' ? [] : poolFor(library, tokens);
  const clipList = kinds === 'photos' ? [] : clipPoolFor(library, tokens);
  const pool = [...photos, ...clipList];
  const noun = kinds === 'clips' ? 'clip' : kinds === 'both' ? 'shot' : 'photo';

  const toggle = (token: string) =>
    onChange(tokens.includes(token) ? tokens.filter((t) => t !== token) : [...tokens, token]);

  // Every pack, and every subfolder of every pack, as one flat list of choices.
  // A pack with subfolders still offers the whole pack — picking both it and one
  // of its subfolders is harmless (an image matched twice is still one image),
  // so there is nothing to guard against.
  const choices: { token: string; label: string; count: number; indent: boolean }[] = [];
  for (const p of packs) {
    const subs = p.subfolders || [];
    const total =
      kinds === 'clips' ? p.videoCount || 0 : kinds === 'both' ? p.count : p.count - (p.videoCount || 0);
    choices.push({ token: makeToken(p.name), label: p.name, count: total, indent: false });
    for (const sub of subs) {
      choices.push({ token: makeToken(p.name, sub.name), label: sub.name, count: sub.count, indent: true });
    }
  }

  const summary =
    tokens.length === 0
      ? 'None picked'
      : tokens.length === 1
        ? (parseToken(tokens[0]).subfolder ?? parseToken(tokens[0]).pack)
        : `${tokens.length} folders`;

  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1.5">
        <span className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold">{label}</span>
        <span className={`text-[11px] ${tokens.length && !pool.length ? 'text-amber-600' : 'text-ink-6'}`}>
          {tokens.length ? `${pool.length} ${noun}${pool.length === 1 ? '' : 's'} to draw from` : hint}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="w-full h-9 bg-card border border-line rounded-lg px-2.5 text-[13px] text-ink text-left outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10 flex items-center justify-between gap-2"
          >
            <span className="truncate">{summary}</span>
            <span className="text-ink-6 shrink-0">{open ? '▴' : '▾'}</span>
          </button>
          {open && (
            <div className="mt-1 max-h-56 overflow-y-auto border border-line rounded-lg bg-card p-1">
              {choices.length === 0 && (
                <p className="text-[11px] text-ink-6 px-2 py-1.5">No packs in the library yet.</p>
              )}
              {choices.map((c) => (
                <label
                  key={c.token}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-raised ${
                    c.indent ? 'pl-6' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={tokens.includes(c.token)}
                    onChange={() => toggle(c.token)}
                    className="accent-ink"
                  />
                  <span className="text-[12px] text-ink truncate flex-1">{c.label}</span>
                  <span className="text-[11px] text-ink-6 tabular-nums">{c.count}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          {pool.slice(0, 4).map((img) =>
            img.kind === 'video' ? (
              <video key={img.id} src={img.url} muted playsInline preload="metadata" className="w-7 h-11 object-cover rounded-md bg-raised" />
            ) : (
              <img key={img.id} src={img.url} alt="" loading="lazy" className="w-7 h-11 object-cover rounded-md bg-raised" />
            )
          )}
        </div>
      </div>
    </div>
  );
}

// One of the two look dimensions (skin / gender) as a small segmented control.
// The pair decides which variant of the shared proof packages a character draws.
function LookSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div>
      <div className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5">{label}</div>
      <div className="flex gap-1.5">
        {options.map((o) => (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className={`flex-1 h-9 rounded-lg border text-[12px] font-medium transition-colors ${
              value === o.key
                ? 'border-ink bg-ink text-bg'
                : 'border-line bg-card text-ink-5 hover:border-line-2'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface CharactersViewProps {
  generating: boolean;
  onGenerate: (opts: {
    characterIds: string[];
    count: number;
    streakKey?: string;
    hookTemplate?: string;
    captionStyle: CaptionStyle;
  }) => Promise<void>;
  // Same decks, but rendered straight to video into each character's export
  // folder — nothing is put on the queue.
  onGenerateVideos: (opts: {
    characterIds: string[];
    count: number;
    streakKey?: string;
    hookTemplate?: string;
    captionStyle: CaptionStyle;
    music: MusicGender | null;
    zoom: boolean;
    regrade: 0 | 1 | 2;
    target: 'tab' | 'server';
    onProgress?: (done: number, total: number) => void;
  }) => Promise<void>;
}

export function CharactersView({ generating, onGenerate, onGenerateVideos }: CharactersViewProps) {
  const [, bump] = useState(0);
  const rerender = useCallback(() => bump((n) => n + 1), []);
  const [characters, setCharacters] = useState<Character[]>(() => getCharacters());
  const [library, setLibrary] = useState<LibraryImage[]>([]);
  const [packs, setPacks] = useState<LibraryPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [newName, setNewName] = useState('');
  const [count, setCount] = useState(1);
  const [streakKey, setStreakKey] = useState(''); // '' = random per deck
  const [hookTemplate, setHookTemplate] = useState(''); // '' = random per deck
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>('app');
  // Which variant's shared packages the panel above is editing. Purely a view
  // concern — a deck always uses its own character's variant.
  const [editVariant, setEditVariant] = useState<string>(VARIANTS[0].key);
  const [error, setError] = useState<string | null>(null);
  // Character id currently being zipped, and a note about a partial download.
  const [zipping, setZipping] = useState<string | null>(null);
  const [zipNote, setZipNote] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // Direct-to-video export: the folder presets each character can be pointed at,
  // the music/zoom popup, and live render progress.
  const [folderPresets, setFolderPresets] = useState<FolderPreset[]>([]);
  const [askMusic, setAskMusic] = useState(false);
  const [videoProgress, setVideoProgress] = useState<{ done: number; total: number } | null>(null);
  const [videosDone, setVideosDone] = useState(0);
  // Where the last export was sent — chosen in the music popup, kept only so the
  // progress and done messages can say the right thing.
  const [target, setTarget] = useState<'tab' | 'server'>('tab');
  const [serverOk, setServerOk] = useState(false);
  // Named paths on the render machine, managed in Brain - the server output
  // folder is a pick from this list, never a hand-typed path.
  const [serverFolders, setServerFolders] = useState<ServerFolder[]>(listServerFolders);

  // The packages are ordinary library packs, so pull the library once and let
  // "Reload library" pick up anything added in the Library view meanwhile.
  const loadLibrary = useCallback(
    () =>
      Promise.all([getMergedLibrary(true), getMergedPacks(true)])
        .then(([imgs, ps]) => {
          setLibrary(imgs);
          setPacks(ps);
        })
        .catch(() => setError('Could not load the library.'))
        .finally(() => setLoading(false)),
    []
  );

  useEffect(() => {
    // The bundled screenshot packs are proof slides, not backgrounds — keep them
    // out of the other tools' pickers the first time this view is opened.
    hideBundledPacksOnce();
    loadLibrary();
    if (supportsFolderPresets()) listFolderPresets().then(setFolderPresets).catch(() => undefined);
    serverRenderStatus()
      .then((st) => setServerOk(st.supported))
      .catch(() => undefined);
  }, [loadLibrary]);

  // Brain can add or drop a folder while this view is open.
  useEffect(() => subscribeServerFolders(() => setServerFolders(listServerFolders())), []);

  const reload = () => {
    setLoading(true);
    loadLibrary();
  };

  // Re-read on every store change, so a pick anywhere on the page refreshes
  // every package summary at once.
  useEffect(() => {
    const unsub = subscribeCharacters(() => {
      setCharacters(getCharacters());
      rerender();
    });
    return unsub;
  }, [rerender]);

  const blockedToken = getBlockedToken(editVariant);
  // The streak dropdown below covers whatever the selected characters can
  // actually roll; with nothing selected it falls back to the edited variant.
  const streakVariants = characters.filter((c) => selected.includes(c.id)).map(variantOf);
  const usableStreaks = usableStreaksIn(library, streakVariants[0] ?? editVariant);
  const ready = characters.filter((c) => missingPieces(c, library).length === 0);
  const defaultFolderName = folderPresets.find((p) => p.id === getDefaultFolderId())?.name || '';

  const create = () => {
    const c = addCharacter(newName);
    setNewName('');
    setSelected((s) => [...s, c.id]);
  };

  // Download every package this character uses as one zip, foldered exactly as
  // Slidegen shows it: Character / package / pack / subfolder. Clips come out as
  // real .mp4/.mov files; photos are stripped of metadata on the way out.
  const downloadCharacter = async (c: Character) => {
    if (zipping) return;
    setError(null);
    setZipNote(null);
    setZipping(c.id);
    try {
      const groups = characterGroups(c, library);
      if (!groups.length) throw new Error(`${c.name || 'This character'} has no packages with anything in them.`);
      const total = groups.reduce((n, g) => n + g.images.length, 0);
      const { blob, written, failed } = await buildLibraryZip(groups);
      saveZip(blob, `${fileSlug(c.name || 'character')}.zip`);
      if (failed.length) {
        setZipNote(`Zipped ${written} of ${total} — skipped ${failed.length}: ${failed.slice(0, 3).join(', ')}${failed.length > 3 ? '…' : ''}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setZipping(null);
    }
  };

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  // Only characters that can actually produce a deck are worth submitting.
  const runnable = selected.filter((id) => ready.some((c) => c.id === id));

  const submit = async () => {
    setError(null);
    setDone(false);
    try {
      await onGenerate({
        characterIds: runnable,
        count,
        streakKey: streakKey || undefined,
        hookTemplate: hookTemplate || undefined,
        captionStyle,
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const submitVideos = async (
    music: MusicGender | null,
    zoom: boolean,
    regrade: 0 | 1 | 2,
    where: 'tab' | 'server',
  ) => {
    setAskMusic(false);
    setTarget(where);
    setError(null);
    setDone(false);
    setVideosDone(0);
    setVideoProgress({ done: 0, total: runnable.length * count });
    try {
      await onGenerateVideos({
        characterIds: runnable,
        count,
        streakKey: streakKey || undefined,
        hookTemplate: hookTemplate || undefined,
        captionStyle,
        music,
        zoom,
        regrade,
        target: where,
        onProgress: (d, total) => setVideoProgress({ done: d, total }),
      });
      setVideosDone(runnable.length * count);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setVideoProgress(null);
    }
  };

  // What the hook/caption previews are rendered with: the locked streak, else
  // the first one with a package, else "1 year" so the hook list is readable
  // before anything has been picked.
  const previewStreak =
    (streakKey ? STREAKS.find((s) => s.key === streakKey) : undefined) ??
    usableStreaks[0] ??
    STREAKS[STREAKS.length - 1];

  return (
    <>
      <ViewHeader
        title="Characters"
        subtitle="Before/after transformation decks. Give each character a look and a before/after library pack, pick the shared proof packs once per look, and every deck draws its own random photos out of them."
        right={
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw size={12} className={loading ? 'animate-spin' : ''} />}
            onClick={reload}
            disabled={loading}
          >
            Reload library
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-8">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* The deck shape */}
          <div>
            <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-2 block">
              The order
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
              {SHAPE.map((s, i) => (
                <div key={i} className="bg-card border border-line rounded-xl px-3 py-2">
                  <div className="text-[12px] font-medium text-ink">{s.label}</div>
                  <div className="text-[10px] text-ink-6 leading-tight mt-0.5">{s.hint}</div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-ink-6 mt-2">
              6–8 slides, always ending on the girlfriend shot. The before/after counts and every photo are re-rolled per deck, so a batch never comes out
              identical.
            </p>
          </div>

          {/* Shared packages — used by every character */}
          <div className="bg-card border border-line rounded-xl p-4 space-y-5">
            <div>
              <h2 className="text-[13px] font-semibold text-ink">Shared packages</h2>
              <p className="text-[11px] text-ink-6">
                One set per skin and gender, so the hand in a proof screenshot matches the character it is shown
                with. Each character picks its own look further down. Only the variants we ship screenshots for
                come filled in — the rest read “0 photos” until you add packs under those names in the Library.
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {VARIANTS.map((v: Variant) => (
                <button
                  key={v.key}
                  onClick={() => setEditVariant(v.key)}
                  className={`h-8 px-3 rounded-lg border text-[12px] font-medium transition-colors ${
                    editVariant === v.key
                      ? 'border-ink bg-ink text-bg'
                      : 'border-line bg-card text-ink-5 hover:border-line-2'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>

            <PackageSelect
              label="Blocked 🌽"
              hint="the blocked-site screenshots"
              tokens={blockedToken}
              packs={packs}
              library={library}
              onChange={(t) => setBlockedToken(editVariant, t)}
            />

            <div>
              <div className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5">
                Upshift streak — one package per duration
              </div>
              <p className="text-[11px] text-ink-6 mb-3">
                The deck picks a random duration, then draws a screenshot from that duration's package — so the hook,
                the “clean” lines and the screenshot always agree. Each duration defaults to its bundled pack; clearing
                one takes that duration out of the roll.
              </p>
              <div className="space-y-3">
                {STREAKS.map((s) => (
                  <PackageSelect
                    key={s.key}
                    label={s.label}
                    hint="not used"
                    tokens={getStreakToken(editVariant, s.key)}
                    packs={packs}
                    library={library}
                    onChange={(t) => setStreakToken(editVariant, s.key, t)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Characters */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-[13px] font-semibold text-ink">Characters</h2>
              <span className="text-[11px] text-ink-6">
                {characters.length ? `${ready.length}/${characters.length} ready` : 'none yet'}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && create()}
                  placeholder="Name"
                  className="h-8 w-36 bg-card border border-line rounded-lg px-2.5 text-[12px] text-ink outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10"
                />
                <Button icon={<Plus size={13} />} onClick={create}>
                  Add character
                </Button>
              </div>
            </div>

            {characters.length === 0 && (
              <div className="bg-card border border-line rounded-xl p-8 text-center">
                <UserRound size={20} className="mx-auto text-ink-6" />
                <p className="text-[12px] text-ink-5 mt-2">
                  Add a character, then point them at a before and an after library pack.
                </p>
              </div>
            )}

            {packs.length === 0 && !loading && (
              <div className="bg-card border border-line rounded-xl p-4 flex items-start gap-2">
                <Images size={14} className="text-ink-5 mt-0.5" />
                <p className="text-[12px] text-ink-5">
                  The library is empty. Add packs in the Library view first — that's where the photos for these
                  packages live.
                </p>
              </div>
            )}

            {characters.map((c) => {
              const missing = missingPieces(c, library);
              const isSelected = selected.includes(c.id);
              return (
                <div
                  key={c.id}
                  className={`bg-card border rounded-xl p-4 space-y-4 transition-colors ${
                    isSelected ? 'border-ink' : 'border-line'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(c.id)}
                      className="w-4 h-4 accent-ink"
                    />
                    <input
                      defaultValue={c.name}
                      onBlur={(e) => renameCharacter(c.id, e.target.value)}
                      className="h-8 bg-transparent border border-transparent hover:border-line rounded-lg px-2 text-[13px] font-medium text-ink outline-none focus:border-ink-7"
                    />
                    <span className="text-[11px] text-ink-6">
                      {missing.length ? `missing ${missing.join(', ')}` : 'ready'}
                    </span>
                    <button
                      onClick={() => downloadCharacter(c)}
                      disabled={zipping !== null}
                      className="ml-auto flex items-center gap-1 text-[11px] text-ink-5 hover:text-ink transition-colors disabled:opacity-50"
                      title="Download every package this character uses, foldered as it is here"
                    >
                      {zipping === c.id ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                      {zipping === c.id ? 'Zipping…' : 'Download'}
                    </button>
                    <IconButton
                      variant="danger-ghost"
                      size="sm"
                      icon={<Trash2 size={13} />}
                      label={`Delete ${c.name}`}
                      onClick={() => removeCharacter(c.id)}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <LookSelect
                      label="Skin"
                      options={SKINS}
                      value={c.skin}
                      onChange={(skin) => setCharacterLook(c.id, { skin })}
                    />
                    <LookSelect
                      label="Gender"
                      options={GENDERS}
                      value={c.gender}
                      onChange={(gender) => setCharacterLook(c.id, { gender })}
                    />
                  </div>
                  <p className="text-[11px] text-ink-6 -mt-2">
                    Proof slides come from the “{variantLabel(c.skin, c.gender)}” shared packages above.
                  </p>

                  {serverOk && (
                    <div>
                      <div className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5">
                        Server output folder
                      </div>
                      <label className="flex items-center gap-2 h-9 px-2.5 rounded-lg border border-line bg-card">
                        <HardDrive size={13} className="shrink-0 text-ink-5" />
                        <select
                          value={c.outDir || ''}
                          onChange={(e) => setCharacterOutDir(c.id, e.target.value)}
                          className="flex-1 bg-transparent text-[13px] text-ink outline-none cursor-pointer"
                        >
                          <option value="">Default (~/.slidesmith/render-jobs)</option>
                          {serverFolders.map((f) => (
                            <option key={f.id} value={f.path}>
                              {f.name}
                            </option>
                          ))}
                          {/* A path saved before this was a dropdown, or one whose
                              Brain entry was deleted, stays selectable. */}
                          {c.outDir && !serverFolders.some((f) => f.path === c.outDir) && (
                            <option value={c.outDir}>{c.outDir}</option>
                          )}
                        </select>
                      </label>
                      <p className="text-[11px] text-ink-6 mt-1">
                        Where a background render job writes this character's videos, on the
                        machine running the server. Add folders in Brain.
                      </p>
                    </div>
                  )}

                  {folderPresets.length > 0 && (
                    <div>
                      <div className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5">
                        Export folder
                      </div>
                      <label className="flex items-center gap-2 h-9 px-2.5 rounded-lg border border-line bg-card">
                        <Folder size={13} className="shrink-0 text-ink-5" />
                        <select
                          value={c.folderId}
                          onChange={(e) => setCharacterFolder(c.id, e.target.value)}
                          className="flex-1 bg-transparent text-[13px] text-ink outline-none cursor-pointer"
                        >
                          <option value="">
                            Default{defaultFolderName ? ` (${defaultFolderName})` : ' (Downloads folder)'}
                          </option>
                          {folderPresets.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p className="text-[11px] text-ink-6 mt-1">
                        Where “Generate videos” writes this character's videos. Manage folders in Brain.
                      </p>
                    </div>
                  )}

                  <PackageSelect
                    label="Before"
                    hint="the addict shots"
                    tokens={c.beforeToken}
                    packs={packs}
                    library={library}
                    onChange={(t) => setCharacterToken(c.id, 'before', t)}
                  />
                  <PackageSelect
                    label="After"
                    hint="the glow-up shots"
                    tokens={c.afterToken}
                    packs={packs}
                    library={library}
                    onChange={(t) => setCharacterToken(c.id, 'after', t)}
                  />
                  <PackageSelect
                    label="With girlfriend"
                    hint="the closing shot"
                    tokens={c.girlfriendToken}
                    packs={packs}
                    library={library}
                    onChange={(t) => setCharacterToken(c.id, 'girlfriend', t)}
                  />
                  <PackageSelect
                    label="Gym"
                    hint="training shots — Video tool only"
                    tokens={c.gymToken}
                    packs={packs}
                    library={library}
                    onChange={(t) => setCharacterToken(c.id, 'gym', t)}
                  />
                  <PackageSelect
                    label="Videos"
                    hint="the clips that play after the drop — Video tool only"
                    tokens={c.videoToken}
                    packs={packs}
                    library={library}
                    kinds="clips"
                    onChange={(t) => setCharacterToken(c.id, 'video', t)}
                  />
                  <PackageSelect
                    label="Stats — into the drop"
                    hint="their own screen, held just before the drop"
                    tokens={c.statsInToken}
                    packs={packs}
                    library={library}
                    kinds="both"
                    onChange={(t) => setCharacterToken(c.id, 'statsIn', t)}
                  />
                  <PackageSelect
                    label="Stats — closing"
                    hint="their own screen, closing the video"
                    tokens={c.statsOutToken}
                    packs={packs}
                    library={library}
                    kinds="both"
                    onChange={(t) => setCharacterToken(c.id, 'statsOut', t)}
                  />
                  <p className="text-[11px] text-ink-6 -mt-2">
                    Gym, Videos and Stats are not used by a slideshow deck — they feed the Video tool, which chops the
                    photos to the beat and cuts to these clips on the drop. The shared blocked/streak screenshots are
                    added for you. The two Stats packages are this character's own — stills or short clips. They are
                    separate on purpose: one is held into the drop and one closes the video, and those aren't
                    interchangeable. Make two subfolders in their stats pack and point one at each.
                  </p>
                </div>
              );
            })}
          </div>

          {/* Generate */}
          <div className="bg-card border border-line rounded-xl p-4 space-y-5 max-w-lg">
            <div>
              <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 block">
                Decks per character
              </label>
              <div className="flex items-center gap-2">
                {COUNT_OPTIONS.map((n) => (
                  <button
                    key={n}
                    onClick={() => setCount(n)}
                    disabled={generating}
                    className={`w-12 h-9 rounded-lg border text-[13px] font-medium transition-colors disabled:opacity-50 ${
                      count === n ? 'border-ink bg-ink text-bg' : 'border-line bg-card text-ink-5 hover:border-line-2'
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={count}
                  disabled={generating}
                  onChange={(e) => setCount(Math.max(1, Math.min(30, Math.round(Number(e.target.value) || 1))))}
                  className="flex-1 h-9 bg-card border border-line rounded-lg px-3 text-[13px] text-ink text-center tabular-nums outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10 disabled:opacity-50"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 block">
                Streak
              </label>
              <select
                value={streakKey}
                disabled={generating}
                onChange={(e) => setStreakKey(e.target.value)}
                className="w-full h-9 bg-card border border-line rounded-lg px-2.5 text-[13px] text-ink outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10 disabled:opacity-50"
              >
                <option value="">Random per deck</option>
                {usableStreaks.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-ink-6 mt-1">
                {usableStreaks.length
                  ? 'Only durations with a package can be picked. The chosen one fills the hook and the “clean” lines. Left random, the longer streaks come up far more often — roughly 42% a year, 33% 100 days, 17% 60 days, 8% 30 days.'
                  : 'Give at least one duration a package above — every deck needs a streak slide.'}
              </p>
            </div>

            <div>
              <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 block">
                Hook
              </label>
              <select
                value={hookTemplate}
                disabled={generating}
                onChange={(e) => setHookTemplate(e.target.value)}
                className="w-full h-9 bg-card border border-line rounded-lg px-2.5 text-[13px] text-ink outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10 disabled:opacity-50"
              >
                <option value="">Random per deck</option>
                {HOOKS.map((h) => (
                  <option key={h} value={h}>
                    {fillHook(h, previewStreak)}
                    {hookUsesStreak(h) ? ' ·  uses streak' : ''}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-ink-6 mt-1">
                The same line goes on every before slide. Every slide after them carries “{`${previewStreak.label} clean`}”.
              </p>
            </div>

            <div>
              <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 block">
                Caption font
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { key: 'app', label: 'App default', hint: 'Inter, thin outline', family: 'Inter, sans-serif', weight: 800, stroke: '0.6px black' },
                    { key: 'tiktok', label: 'TikTok', hint: 'Classic caption look', family: "'Poppins', 'Helvetica Neue', Arial, sans-serif", weight: 600, stroke: '2px black' },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.key}
                    onClick={() => setCaptionStyle(o.key)}
                    disabled={generating}
                    className={`overflow-hidden rounded-lg border text-left transition-colors disabled:opacity-50 ${
                      captionStyle === o.key ? 'border-ink ring-2 ring-ink' : 'border-line hover:border-line-2'
                    }`}
                  >
                    <div className="h-12 flex items-center justify-center bg-neutral-800">
                      <span
                        className="text-[17px] leading-none"
                        style={{ fontFamily: o.family, fontWeight: o.weight, color: '#fff', WebkitTextStroke: o.stroke, paintOrder: 'stroke fill' }}
                      >
                        {`${previewStreak.label} clean`}
                      </span>
                    </div>
                    <div className="px-3 py-1.5 bg-card">
                      <div className="text-[13px] font-medium text-ink">{o.label}</div>
                      <div className="text-[11px] text-ink-6">{o.hint}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {selected.length > runnable.length && (
              <p className="text-[12px] text-amber-600">
                {selected.length - runnable.length} selected character
                {selected.length - runnable.length === 1 ? ' is' : 's are'} still missing a package and will be skipped.
              </p>
            )}
            {error && <p className="text-[12px] text-red-600">{error}</p>}
            {zipNote && <p className="text-[12px] text-ink-6">{zipNote}</p>}
            {done && (
              <p className="text-[12px] text-emerald-600 flex items-center gap-1">
                <Check size={13} /> Added to the Queue.
              </p>
            )}
            {videosDone > 0 && !videoProgress && (
              <p className="text-[12px] text-emerald-600 flex items-center gap-1">
                <Check size={13} />{' '}
                {target === 'server'
                  ? `${videosDone} video${videosDone === 1 ? '' : 's'} queued on the server — you can close this tab.`
                  : `${videosDone} video${videosDone === 1 ? '' : 's'} exported to the characters' folders.`}
              </p>
            )}
            {target === 'tab' && folderPresets.length === 0 && supportsFolderPresets() && (
              <p className="text-[11px] text-ink-6">
                No download folders yet — add some in Brain to send each character's videos straight
                into their own folder. Until then videos land in your browser's Downloads folder.
              </p>
            )}

            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-ink-6 flex items-center gap-1">
                <Shuffle size={11} /> {runnable.length} character{runnable.length === 1 ? '' : 's'} selected
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  icon={videoProgress ? <Loader2 size={13} className="animate-spin" /> : <Film size={13} />}
                  onClick={() => setAskMusic(true)}
                  disabled={generating || runnable.length === 0}
                  title="Build the decks and render them straight to video into each character's export folder — skipping the queue"
                >
                  {videoProgress
                    ? `${target === 'server' ? 'Uploading' : 'Rendering'} ${videoProgress.done}/${videoProgress.total}…`
                    : `Generate ${runnable.length * count} video${runnable.length * count === 1 ? '' : 's'}`}
                </Button>
                <Button
                  variant="primary"
                  icon={<Sparkles size={13} />}
                  onClick={submit}
                  disabled={generating || runnable.length === 0}
                >
                  {generating && !videoProgress
                    ? 'Building…'
                    : `Generate ${runnable.length * count} deck${runnable.length * count === 1 ? '' : 's'}`}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ServerRenderQueue enabled={serverOk} />

      {askMusic && (
        <MusicChoiceModal
          count={runnable.length * count}
          onClose={() => setAskMusic(false)}
          onChoose={submitVideos}
        />
      )}
    </>
  );
}
