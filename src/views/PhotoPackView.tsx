import { useEffect, useState, useCallback } from 'react';
import { Loader2, LayoutTemplate, Shuffle, Sparkles, Check, EyeOff, Eye, SlidersHorizontal } from 'lucide-react';
import { ViewHeader } from '../components/ViewHeader';
import { Button } from '../components/Button';
import { getMergedPacks } from '../lib/mergedLibrary';
import { getHiddenPhotos, setPhotoHidden } from '../lib/hiddenPhotos';
import type { CaptionStyle } from '../lib/captionStyle';
import type { LibraryPack } from '../types';

// The fixed slot layout the server builds every pack from — kept in sync with
// server/photopack.js SLOTS. Shown here so the user sees exactly which category
// each slide pulls a random photo from, "in this order".
const SLOTS = [
  { slot: 'COVER', category: 'mirror', hint: 'gym mirror / physique check' },
  { slot: 'RULE 1', category: 'gym_pov', hint: 'training, chalked hands' },
  { slot: 'RULE 2', category: 'food', hint: 'nutrition, breakfast' },
  { slot: 'RULE 3', category: 'gym_action', hint: 'lifting in action' },
  { slot: 'RULE 4', category: 'phone_pov', hint: 'the app slide' },
  { slot: 'RULE 5', category: 'closer', hint: 'quiet reflective close' },
] as const;

const COUNT_OPTIONS = [1, 3, 5, 10];

// Cover hook shapes — must stay in sync with HOOK_TEMPLATES in server/photopack.js.
// `varied` rotates the shapes across a batch so covers aren't identical. All keep
// "5" because the carousel always has 5 numbered rules.
const HOOK_OPTIONS = [
  { key: 'varied', label: 'Mix it up (varied)' },
  { key: 'rules', label: '5 rules i follow for X' },
  { key: 'tips', label: '5 tips to get BIGGER at the gym' },
  { key: 'things', label: '5 things i do every day for X' },
  { key: 'habits', label: '5 habits that built my X' },
  { key: 'mistakes', label: '5 mistakes that killed my X' },
  { key: 'secrets', label: '5 things nobody tells you about X' },
  { key: 'nonnegotiables', label: '5 non-negotiables for X' },
  { key: 'lies', label: '5 lies i had to unlearn about X' },
] as const;

interface Manifest {
  base: string;
  categories: Record<string, string[]>;
}

function pick<T>(arr: T[]): T | undefined {
  return arr.length ? arr[Math.floor(Math.random() * arr.length)] : undefined;
}

interface PhotoPackViewProps {
  generating: boolean;
  canGenerate: boolean;
  onGenerate: (opts: { count: number; captionStyle: CaptionStyle; coverPack?: string; appPack?: string; hookStyle?: string }) => Promise<void>;
}

export function PhotoPackView({ generating, canGenerate, onGenerate }: PhotoPackViewProps) {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [preview, setPreview] = useState<(string | undefined)[]>([]);
  const [count, setCount] = useState(1);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>('app');
  const [hookStyle, setHookStyle] = useState<string>('varied');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The user's own library packs, and optional overrides for the two swappable
  // slots. Empty string = keep the default library category.
  const [userPacks, setUserPacks] = useState<LibraryPack[]>([]);
  const [coverPack, setCoverPack] = useState('');
  const [appPack, setAppPack] = useState('');
  // Individual library photos the user has hidden (by full URL). Hidden photos
  // are greyed out in the curation grid, skipped by the preview, and shipped to
  // the server on generate so the picker never chooses them. See lib/hiddenPhotos.
  const [hidden, setHidden] = useState<Set<string>>(() => getHiddenPhotos());
  const [curating, setCurating] = useState(false);

  // Re-roll one random image per slot, in slot order — the same pick the server
  // makes, so the preview is a faithful sample of what "Generate" produces. When
  // the cover or app slot has an override pack, preview a random cover from it
  // instead of the default library category.
  const shuffle = useCallback((m: Manifest, cover = coverPack, app = appPack, packs = userPacks, hide = hidden) => {
    const overrides: Record<number, string> = { 0: cover, 4: app };
    setPreview(SLOTS.map((s, i) => {
      const packName = overrides[i];
      if (packName) {
        const p = packs.find((up) => up.name === packName);
        return p?.covers.length ? pick(p.covers) : undefined;
      }
      // Preview only from photos the user hasn't hidden, exactly like the server
      // picker — but fall back to the full set if every photo in the slot is hidden.
      const toUrl = (file: string) => `${m.base}${s.category}/${file}`;
      const all = m.categories[s.category] || [];
      const kept = all.filter((f) => !hide.has(toUrl(f)));
      const file = pick(kept.length ? kept : all);
      return file ? toUrl(file) : undefined;
    }));
  }, [coverPack, appPack, userPacks, hidden]);

  useEffect(() => {
    let alive = true;
    fetch('/photo-library/manifest.json')
      .then((r) => r.json())
      .then((m: Manifest) => { if (alive) { setManifest(m); shuffle(m); } })
      .catch(() => { if (alive) setError('Could not load the photo library manifest.'); });
    getMergedPacks().then((p) => { if (alive) setUserPacks(p); }).catch(() => {});
    return () => { alive = false; };
    // Mount only — override changes re-preview from their select handlers instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Change an override pack and immediately re-roll its slot's preview.
  const setOverride = (slot: 'cover' | 'app', name: string) => {
    if (slot === 'cover') setCoverPack(name); else setAppPack(name);
    if (manifest) {
      shuffle(manifest, slot === 'cover' ? name : coverPack, slot === 'app' ? name : appPack);
    }
  };

  // Hide/show one photo, persist it, and re-roll the preview so a just-hidden
  // photo can't linger in the sample.
  const togglePhoto = (url: string) => {
    const next = !hidden.has(url);
    setPhotoHidden(url, next);
    const updated = getHiddenPhotos();
    setHidden(updated);
    if (manifest) shuffle(manifest, coverPack, appPack, userPacks, updated);
  };

  const total = manifest
    ? Object.values(manifest.categories).reduce((n, a) => n + a.length, 0)
    : 0;
  const hiddenCount = hidden.size;

  const submit = async () => {
    setError(null);
    setDone(false);
    try {
      await onGenerate({ count, captionStyle, coverPack: coverPack || undefined, appPack: appPack || undefined, hookStyle });
      setDone(true);
      if (manifest) shuffle(manifest);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <ViewHeader
        title="Photo Packs"
        subtitle="Six-slide “5 rules i follow for…” carousels built from real library photos — one random shot per slot, in a fixed order, with AI-written rules that match each photo."
        right={
          <Button
            variant="secondary"
            size="sm"
            icon={<Shuffle size={12} />}
            onClick={() => manifest && shuffle(manifest)}
            disabled={!manifest}
          >
            Shuffle preview
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-8">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Live preview of the fixed slot order */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold">
                The order
              </label>
              <span className="text-[11px] text-ink-6">
                {total ? `${total} photos across ${SLOTS.length} slots` : 'loading…'}
              </span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3">
              {SLOTS.map((s, i) => {
                const override = i === 0 ? coverPack : i === 4 ? appPack : '';
                return (
                <div key={s.slot} className="bg-card border border-line rounded-xl p-2">
                  <div className="relative aspect-[9/16] rounded-md overflow-hidden bg-raised">
                    {preview[i] ? (
                      <img src={preview[i]} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                      <div className="absolute inset-0 grid place-items-center text-ink-6">
                        <LayoutTemplate size={16} />
                      </div>
                    )}
                    <span className="absolute top-1 left-1 h-4 px-1 inline-flex items-center rounded-full text-[8px] font-bold uppercase bg-black/70 text-white/80">
                      {s.slot}
                    </span>
                    {override && (
                      <span className="absolute top-1 right-1 h-4 px-1 inline-flex items-center rounded-full text-[8px] font-bold uppercase bg-emerald-500/80 text-white">
                        yours
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 leading-tight">
                    <div className="text-[11px] font-medium text-ink truncate">{override || s.category}</div>
                    <div className="text-[10px] text-ink-6 truncate">{override ? 'your pack' : s.hint}</div>
                  </div>
                </div>
                );
              })}
            </div>
            <p className="text-[11px] text-ink-6 mt-2">
              Slide 1 is the cover title. Slides 2–6 are numbered rules 1–5; rule 4 is the app slide, rule 5 is the closer.
            </p>
          </div>

          {/* Controls */}
          <div className="bg-card border border-line rounded-xl p-4 space-y-5 max-w-lg">
            <div>
              <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 block">How many packs?</label>
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
              <p className="text-[11px] text-ink-6 mt-1">1–30. Each pack re-rolls its own random photos.</p>
            </div>

            {/* Cover hook — the shape of the slide-1 title. "Mix it up" varies it
                across the batch; the rest lock every cover to one shape. */}
            <div>
              <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 block">Cover hook</label>
              <select
                value={hookStyle}
                disabled={generating}
                onChange={(e) => setHookStyle(e.target.value)}
                className="w-full h-9 bg-card border border-line rounded-lg px-2.5 text-[13px] text-ink outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10 disabled:opacity-50"
              >
                {HOOK_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
              <p className="text-[11px] text-ink-6 mt-1">
                {hookStyle === 'varied'
                  ? 'Each pack gets a different hook shape. Always 5 rules underneath.'
                  : 'Every cover uses this shape. The theme word still changes per pack.'}
              </p>
            </div>

            {/* Caption font — same look options as the main generator */}
            <div>
              <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 block">Caption font</label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { key: 'app', label: 'App default', hint: 'Inter, thin outline', family: 'Inter, sans-serif', weight: 800, stroke: '0.6px black' },
                  { key: 'tiktok', label: 'TikTok', hint: 'Classic caption look', family: "'Poppins', 'Helvetica Neue', Arial, sans-serif", weight: 600, stroke: '2px black' },
                ] as const).map((o) => (
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
                        Save this
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

            {/* Swap the cover and app-slide photos for your own library pack.
                Default keeps the built-in library category. */}
            <div>
              <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 block">
                Swap slots <span className="normal-case font-normal text-ink-6">(optional)</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {([
                  { key: 'cover', label: 'Cover photo', value: coverPack, def: 'mirror' },
                  { key: 'app', label: 'App slide photo', value: appPack, def: 'phone_pov' },
                ] as const).map((row) => (
                  <div key={row.key}>
                    <div className="text-[11px] text-ink-4 mb-1">{row.label}</div>
                    <select
                      value={row.value}
                      disabled={generating}
                      onChange={(e) => setOverride(row.key, e.target.value)}
                      className="w-full h-9 bg-card border border-line rounded-lg px-2.5 text-[13px] text-ink outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10 disabled:opacity-50"
                    >
                      <option value="">Default · {row.def} (library)</option>
                      {userPacks.map((p) => (
                        <option key={p.name} value={p.name}>
                          {p.name} ({p.count})
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-ink-6 mt-1">
                {userPacks.length
                  ? 'Pick one of your own packs (from Library) for these two slots. The other four stay on the default library photos.'
                  : 'Add packs in Library to use your own photos here. For now both slots use the default library.'}
              </p>
            </div>

            {!canGenerate && (
              <p className="text-[12px] text-amber-600">
                Add your OpenRouter key in Settings to write the rules.
              </p>
            )}
            {error && <p className="text-[12px] text-red-600">{error}</p>}
            {done && (
              <p className="text-[12px] text-emerald-600 flex items-center gap-1">
                <Check size={13} /> Added to the Queue.
              </p>
            )}

            <div className="flex justify-end">
              <Button
                variant="primary"
                icon={generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                onClick={submit}
                disabled={generating || !canGenerate}
              >
                {generating ? 'Generating…' : `Generate ${count} pack${count === 1 ? '' : 's'}`}
              </Button>
            </div>
          </div>

          {/* Curate the library — browse every photo per slot and hide the bad
              ones. Hidden photos are skipped by the preview and never picked by
              the server when generating. */}
          <div className="bg-card border border-line rounded-xl">
            <button
              onClick={() => setCurating((c) => !c)}
              className="w-full flex items-center gap-2 p-4 text-left"
            >
              <SlidersHorizontal size={14} className="text-ink-5" />
              <span className="text-[13px] font-medium text-ink">Curate photos</span>
              <span className="text-[11px] text-ink-6">
                {hiddenCount ? `${hiddenCount} hidden` : 'hide the bad shots'}
              </span>
              <span className="ml-auto text-[11px] text-ink-5">{curating ? 'Hide' : 'Show'}</span>
            </button>

            {curating && (
              <div className="px-4 pb-4 space-y-6">
                <p className="text-[11px] text-ink-6">
                  Click a photo to hide it. Hidden photos are greyed out and never picked into a pack.
                  Kept per browser; the choice is applied on your next Generate.
                </p>
                {SLOTS.map((s) => {
                  const files = manifest?.categories[s.category] || [];
                  return (
                    <div key={s.slot}>
                      <div className="flex items-baseline gap-2 mb-2">
                        <h3 className="text-[12px] font-semibold text-ink uppercase tracking-widest">{s.slot}</h3>
                        <span className="text-[11px] text-ink-6">{s.category}</span>
                        <span className="text-[10px] text-ink-6">· {files.length} photos</span>
                      </div>
                      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                        {files.map((file) => {
                          const url = `${manifest!.base}${s.category}/${file}`;
                          const isHidden = hidden.has(url);
                          return (
                            <button
                              key={file}
                              onClick={() => togglePhoto(url)}
                              title={isHidden ? 'Hidden — click to show' : 'Click to hide'}
                              className="group relative aspect-[9/16] rounded-lg overflow-hidden bg-raised"
                            >
                              <img
                                src={url}
                                alt=""
                                loading="lazy"
                                className={`w-full h-full object-cover transition-opacity ${isHidden ? 'opacity-25' : ''}`}
                              />
                              <span
                                className={`absolute top-1 right-1 w-6 h-6 rounded-md flex items-center justify-center text-white transition-opacity ${
                                  isHidden ? 'bg-black/70 opacity-100' : 'bg-black/60 opacity-0 group-hover:opacity-100'
                                }`}
                              >
                                {isHidden ? <Eye size={12} /> : <EyeOff size={12} />}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
