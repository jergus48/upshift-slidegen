import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, Sparkles, Check, UserRound, ImagePlus, Shuffle } from 'lucide-react';
import { ViewHeader } from '../components/ViewHeader';
import { Button } from '../components/Button';
import { IconButton } from '../components/IconButton';
import { resolveImageSrc } from '../lib/imageSrc';
import { HOOKS, fillHook, hookUsesStreak } from '../lib/transformationHooks';
import { missingPieces } from '../lib/transformationDeck';
import {
  STREAKS,
  getCharacters,
  getBlockedShots,
  getStreakShots,
  getUsableStreaks,
  addCharacter,
  renameCharacter,
  removeCharacter,
  addCharacterPhotos,
  removeCharacterPhoto,
  addBlockedShots,
  removeBlockedShot,
  addStreakShots,
  removeStreakShot,
  isBundledShot,
  subscribeCharacters,
  loadStreakDefaults,
  type Character,
} from '../lib/characters';
import type { CaptionStyle } from '../lib/captionStyle';

const COUNT_OPTIONS = [1, 3, 5, 10];

// The fixed deck shape, shown to the user so they can see what they're getting
// before they generate. Kept in sync with lib/transformationDeck.ts.
const SHAPE = [
  { label: 'Before', hint: '2–3 slides, the hook on each' },
  { label: 'After', hint: '"<streak> clean"' },
  { label: 'Blocked 🌽', hint: 'shared screenshot, no caption' },
  { label: 'Streak', hint: 'shared screenshot, no caption' },
  { label: 'After', hint: '1–2 more, same line' },
];

// Read picked files as data URLs — the shape addLocalImages wants.
function readFiles(files: FileList | null): Promise<string[]> {
  if (!files?.length) return Promise.resolve([]);
  return Promise.all(
    [...files].map(
      (file) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        })
    )
  );
}

// One thumbnail. Image refs are either a `local:` IndexedDB id (needs an async
// object URL) or a plain `/streak-shots/…` path, so resolve before rendering.
function Shot({ refId, onRemove }: { refId: string; onRemove?: () => void }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let alive = true;
    resolveImageSrc(refId).then((s) => alive && setSrc(s));
    return () => {
      alive = false;
    };
  }, [refId]);
  return (
    <div className="group relative aspect-[9/16] rounded-lg overflow-hidden bg-raised">
      {src && <img src={src} alt="" loading="lazy" className="w-full h-full object-cover" />}
      {onRemove && (
        <button
          onClick={onRemove}
          title="Remove"
          className="absolute top-1 right-1 w-6 h-6 rounded-md flex items-center justify-center bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );
}

// A labelled photo package: a grid of thumbnails plus an upload tile.
function PhotoPackage({
  label,
  hint,
  shots,
  onAdd,
  onRemove,
}: {
  label: string;
  hint: string;
  shots: string[];
  onAdd: (dataUrls: string[]) => void;
  onRemove: (ref: string) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1.5">
        <span className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold">{label}</span>
        <span className="text-[11px] text-ink-6">
          {shots.length ? `${shots.length} photo${shots.length === 1 ? '' : 's'}` : hint}
        </span>
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
        {shots.map((ref) => (
          <Shot key={ref} refId={ref} onRemove={isBundledShot(ref) ? undefined : () => onRemove(ref)} />
        ))}
        <label className="aspect-[9/16] rounded-lg border border-dashed border-line-2 flex flex-col items-center justify-center gap-1 text-ink-6 hover:text-ink-4 hover:border-ink-7 cursor-pointer">
          <ImagePlus size={16} />
          <span className="text-[10px]">Add</span>
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={async (e) => {
              const urls = await readFiles(e.target.files);
              e.target.value = '';
              if (urls.length) onAdd(urls);
            }}
          />
        </label>
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
  const [selected, setSelected] = useState<string[]>([]);
  const [newName, setNewName] = useState('');
  const [count, setCount] = useState(1);
  const [streakKey, setStreakKey] = useState(''); // '' = random per deck
  const [hookTemplate, setHookTemplate] = useState(''); // '' = random per deck
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>('app');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Re-read on every store change, so uploads/deletes anywhere on the page
  // refresh every package at once.
  useEffect(() => {
    const sync = () => {
      setCharacters(getCharacters());
      rerender();
    };
    const unsub = subscribeCharacters(sync);
    loadStreakDefaults();
    return unsub;
  }, [rerender]);

  const blocked = getBlockedShots();
  const usableStreaks = getUsableStreaks();
  const ready = characters.filter((c) => missingPieces(c).length === 0);

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
  // the first one that has a screenshot, else "1 year" so the hook list is
  // readable before anything has been uploaded.
  const previewStreak =
    (streakKey ? STREAKS.find((s) => s.key === streakKey) : undefined) ??
    usableStreaks[0] ??
    STREAKS[STREAKS.length - 1];

  return (
    <>
      <ViewHeader
        title="Characters"
        subtitle="Before/after transformation decks. Give a character their two photo packages, upload the two shared screenshots once, and every deck is assembled from them — no model call."
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
              6–8 slides. The before/after counts are re-rolled per deck, so a batch never comes out identical.
            </p>
          </div>

          {/* Shared packages — used by every character */}
          <div className="bg-card border border-line rounded-xl p-4 space-y-5">
            <div>
              <h2 className="text-[13px] font-semibold text-ink">Shared packages</h2>
              <p className="text-[11px] text-ink-6">
                Uploaded once, reused by every character. Both are required — each deck carries one of each.
              </p>
            </div>

            <PhotoPackage
              label="Blocked 🌽"
              hint="the blocked-site screenshot"
              shots={blocked}
              onAdd={(urls) => addBlockedShots(urls)}
              onRemove={(ref) => removeBlockedShot(ref)}
            />

            <div>
              <div className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5">
                Upshift streak — filed by duration
              </div>
              <p className="text-[11px] text-ink-6 mb-3">
                File each screenshot under the streak it shows. The deck picks a random duration, then looks up a
                matching screenshot — so the hook, the “clean” lines and the screenshot always agree.
              </p>
              <div className="space-y-4">
                {STREAKS.map((s) => (
                  <PhotoPackage
                    key={s.key}
                    label={s.label}
                    hint="no screenshot yet"
                    shots={getStreakShots(s.key)}
                    onAdd={(urls) => addStreakShots(s.key, urls)}
                    onRemove={(ref) => removeStreakShot(s.key, ref)}
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
                  Add a character, then give them a before and an after package.
                </p>
              </div>
            )}

            {characters.map((c) => {
              const missing = missingPieces(c);
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

                  <PhotoPackage
                    label="Before"
                    hint="the addict shots"
                    shots={c.before}
                    onAdd={(urls) => addCharacterPhotos(c.id, 'before', urls)}
                    onRemove={(ref) => removeCharacterPhoto(c.id, 'before', ref)}
                  />
                  <PhotoPackage
                    label="After"
                    hint="the glow-up shots"
                    shots={c.after}
                    onAdd={(urls) => addCharacterPhotos(c.id, 'after', urls)}
                    onRemove={(ref) => removeCharacterPhoto(c.id, 'after', ref)}
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
                  ? 'Only durations with a screenshot can be picked. The chosen one fills the hook and the “clean” lines.'
                  : 'Upload at least one streak screenshot above — every deck needs one.'}
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
                    {previewStreak ? fillHook(h, previewStreak) : h}
                    {hookUsesStreak(h) ? ' ·  uses streak' : ''}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-ink-6 mt-1">
                The same line goes on every before slide.
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
                        {previewStreak ? `${previewStreak.label} clean` : '1 year clean'}
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
                {selected.length - runnable.length === 1 ? ' is' : 's are'} still missing photos and will be skipped.
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
                {generating ? 'Building…' : `Generate ${runnable.length * count} deck${runnable.length * count === 1 ? '' : 's'}`}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
