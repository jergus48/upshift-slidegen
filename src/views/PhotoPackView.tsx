import { useEffect, useState, useCallback } from 'react';
import { Loader2, LayoutTemplate, Shuffle, Sparkles, Check } from 'lucide-react';
import { ViewHeader } from '../components/ViewHeader';
import { Button } from '../components/Button';
import type { CaptionStyle } from '../lib/captionStyle';

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
  onGenerate: (opts: { count: number; captionStyle: CaptionStyle }) => Promise<void>;
}

export function PhotoPackView({ generating, canGenerate, onGenerate }: PhotoPackViewProps) {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [preview, setPreview] = useState<(string | undefined)[]>([]);
  const [count, setCount] = useState(1);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>('app');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-roll one random image per slot, in slot order — the same pick the server
  // makes, so the preview is a faithful sample of what "Generate" produces.
  const shuffle = useCallback((m: Manifest) => {
    setPreview(SLOTS.map((s) => {
      const file = pick(m.categories[s.category] || []);
      return file ? `${m.base}${s.category}/${file}` : undefined;
    }));
  }, []);

  useEffect(() => {
    let alive = true;
    fetch('/photo-library/manifest.json')
      .then((r) => r.json())
      .then((m: Manifest) => { if (alive) { setManifest(m); shuffle(m); } })
      .catch(() => { if (alive) setError('Could not load the photo library manifest.'); });
    return () => { alive = false; };
  }, [shuffle]);

  const total = manifest
    ? Object.values(manifest.categories).reduce((n, a) => n + a.length, 0)
    : 0;

  const submit = async () => {
    setError(null);
    setDone(false);
    try {
      await onGenerate({ count, captionStyle });
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
              {SLOTS.map((s, i) => (
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
                  </div>
                  <div className="mt-1.5 leading-tight">
                    <div className="text-[11px] font-medium text-ink truncate">{s.category}</div>
                    <div className="text-[10px] text-ink-6 truncate">{s.hint}</div>
                  </div>
                </div>
              ))}
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
        </div>
      </div>
    </>
  );
}
