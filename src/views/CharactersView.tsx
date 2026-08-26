import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, Sparkles, Check, UserRound, Images, Shuffle, RefreshCw } from 'lucide-react';
import { ViewHeader } from '../components/ViewHeader';
import { Button } from '../components/Button';
import { IconButton } from '../components/IconButton';
import { getMergedLibrary, getMergedPacks } from '../lib/mergedLibrary';
import { makeToken } from '../lib/subfolders';
import { HOOKS, fillHook, hookUsesStreak } from '../lib/transformationHooks';
import { missingPieces, poolFor } from '../lib/transformationDeck';
import {
  STREAKS,
  getCharacters,
  getBlockedToken,
  setBlockedToken,
  getStreakToken,
  setStreakToken,
  getUsableStreaks,
  addCharacter,
  renameCharacter,
  removeCharacter,
  setCharacterToken,
  subscribeCharacters,
  type Character,
} from '../lib/characters';
import type { CaptionStyle } from '../lib/captionStyle';
import type { LibraryImage, LibraryPack } from '../types';

const COUNT_OPTIONS = [1, 3, 5, 10];

// The fixed deck shape, shown to the user so they can see what they're getting
// before they generate. Kept in sync with lib/transformationDeck.ts.
const SHAPE = [
  { label: 'Before', hint: '2–3 slides, the hook on each' },
  { label: 'After', hint: '"<streak> clean"' },
  { label: 'Blocked 🌽', hint: 'shared package, no caption' },
  { label: 'Streak', hint: 'shared package, no caption' },
  { label: 'After', hint: '1–2 more, same line' },
];

// Picks one library pack (or one of its subfolders) as a package, and previews a
// few of the photos a deck would draw from it. Everything the app calls a
// "package" here is just a normal library pack — curate it in the Library view.
function PackageSelect({
  label,
  hint,
  token,
  packs,
  library,
  onChange,
}: {
  label: string;
  hint: string;
  token: string;
  packs: LibraryPack[];
  library: LibraryImage[];
  onChange: (token: string) => void;
}) {
  const pool = poolFor(library, token);
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1.5">
        <span className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold">{label}</span>
        <span className={`text-[11px] ${token && !pool.length ? 'text-amber-600' : 'text-ink-6'}`}>
          {token ? `${pool.length} photo${pool.length === 1 ? '' : 's'} to draw from` : hint}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <select
          value={token}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 h-9 bg-card border border-line rounded-lg px-2.5 text-[13px] text-ink outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10"
        >
          <option value="">— pick a library pack —</option>
          {packs.map((p) => {
            const subs = p.subfolders || [];
            if (!subs.length) {
              return (
                <option key={p.name} value={makeToken(p.name)}>
                  {p.name} ({p.count})
                </option>
              );
            }
            // A pack with subfolders offers the whole pack AND each subfolder,
            // so a single "Upshift streaks" pack can be split per duration.
            return (
              <optgroup key={p.name} label={p.name}>
                <option value={makeToken(p.name)}>Whole pack ({p.count})</option>
                {subs.map((s) => (
                  <option key={s.name} value={makeToken(p.name, s.name)}>
                    {s.name} ({s.count})
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
        <div className="flex gap-1 shrink-0">
          {pool.slice(0, 4).map((img) => (
            <img
              key={img.id}
              src={img.url}
              alt=""
              loading="lazy"
              className="w-7 h-11 object-cover rounded-md bg-raised"
            />
          ))}
        </div>
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
}

export function CharactersView({ generating, onGenerate }: CharactersViewProps) {
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
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // The packages are ordinary library packs, so pull the library once and let
  // "Reload library" pick up anything added in the Library view meanwhile.
  const loadLibrary = useCallback(
    () =>
      Promise.all([getMergedLibrary(), getMergedPacks()])
        .then(([imgs, ps]) => {
          setLibrary(imgs);
          setPacks(ps);
        })
        .catch(() => setError('Could not load the library.'))
        .finally(() => setLoading(false)),
    []
  );

  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

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

  const blockedToken = getBlockedToken();
  const usableStreaks = getUsableStreaks();
  const ready = characters.filter((c) => missingPieces(c, library).length === 0);

  const create = () => {
    const c = addCharacter(newName);
    setNewName('');
    setSelected((s) => [...s, c.id]);
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
        subtitle="Before/after transformation decks. Point each character at a before and an after library pack, pick the two shared packs once, and every deck draws its own random photos out of them."
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
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {SHAPE.map((s, i) => (
                <div key={i} className="bg-card border border-line rounded-xl px-3 py-2">
                  <div className="text-[12px] font-medium text-ink">{s.label}</div>
                  <div className="text-[10px] text-ink-6 leading-tight mt-0.5">{s.hint}</div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-ink-6 mt-2">
              6–8 slides. The before/after counts and every photo are re-rolled per deck, so a batch never comes out
              identical.
            </p>
          </div>

          {/* Shared packages — used by every character */}
          <div className="bg-card border border-line rounded-xl p-4 space-y-5">
            <div>
              <h2 className="text-[13px] font-semibold text-ink">Shared packages</h2>
              <p className="text-[11px] text-ink-6">
                Picked once, reused by every character. Both are required — each deck carries one photo from each.
              </p>
            </div>

            <PackageSelect
              label="Blocked 🌽"
              hint="the blocked-site screenshots"
              token={blockedToken}
              packs={packs}
              library={library}
              onChange={setBlockedToken}
            />

            <div>
              <div className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5">
                Upshift streak — one package per duration
              </div>
              <p className="text-[11px] text-ink-6 mb-3">
                The deck picks a random duration, then draws a screenshot from that duration's package — so the hook,
                the “clean” lines and the screenshot always agree. Durations you leave empty are never picked. A single
                streaks pack split into subfolders works well here.
              </p>
              <div className="space-y-3">
                {STREAKS.map((s) => (
                  <PackageSelect
                    key={s.key}
                    label={s.label}
                    hint="not used"
                    token={getStreakToken(s.key)}
                    packs={packs}
                    library={library}
                    onChange={(t) => setStreakToken(s.key, t)}
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
                    <IconButton
                      variant="danger-ghost"
                      size="sm"
                      className="ml-auto"
                      icon={<Trash2 size={13} />}
                      label={`Delete ${c.name}`}
                      onClick={() => removeCharacter(c.id)}
                    />
                  </div>

                  <PackageSelect
                    label="Before"
                    hint="the addict shots"
                    token={c.beforeToken}
                    packs={packs}
                    library={library}
                    onChange={(t) => setCharacterToken(c.id, 'before', t)}
                  />
                  <PackageSelect
                    label="After"
                    hint="the glow-up shots"
                    token={c.afterToken}
                    packs={packs}
                    library={library}
                    onChange={(t) => setCharacterToken(c.id, 'after', t)}
                  />
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
                  ? 'Only durations with a package can be picked. The chosen one fills the hook and the “clean” lines.'
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
              <p className="text-[11px] text-ink-6 mt-1">The same line goes on every before slide.</p>
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
            {done && (
              <p className="text-[12px] text-emerald-600 flex items-center gap-1">
                <Check size={13} /> Added to the Queue.
              </p>
            )}

            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-ink-6 flex items-center gap-1">
                <Shuffle size={11} /> {runnable.length} character{runnable.length === 1 ? '' : 's'} selected
              </span>
              <Button
                variant="primary"
                icon={<Sparkles size={13} />}
                onClick={submit}
                disabled={generating || runnable.length === 0}
              >
                {generating
                  ? 'Building…'
                  : `Generate ${runnable.length * count} deck${runnable.length * count === 1 ? '' : 's'}`}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
