import { useState } from 'react';
import { X, Plus, Sparkles, Loader2, CheckCircle2, Circle, AlertCircle, ImageDown } from 'lucide-react';
import { Button } from './Button';
import { PackPicker } from './PackPicker';
import { PresetPicker } from './PresetPicker';
import { PresetScreenshots } from './PresetScreenshots';
import { GENDERS, getQuitPresets, type Gender } from '../lib/quitPresets';
import type { CaptionStyle } from '../lib/captionStyle';
import type { GenBatch } from '../lib/localBatches';

export interface EnqueueOpts {
  count: number;
  length: 'short' | 'long';
  packs: string[];
  captionStyle: CaptionStyle;
  gender: Gender;
  presetKeys: string[];
}

interface GenerateModalProps {
  onClose: () => void;
  // Add one "character" run to the batch queue. The modal stays open so several
  // batches (different genders/presets) can be stacked; they run in the
  // background one at a time.
  onEnqueue: (opts: EnqueueOpts) => void;
  // Live batch queue, newest first — shown as a running log inside the modal.
  batches: GenBatch[];
}

const COUNT_OPTIONS = [1, 3, 5, 10];

export function GenerateModal({ onClose, onEnqueue, batches }: GenerateModalProps) {
  const [count, setCount] = useState(5);
  const [length, setLength] = useState<'short' | 'long'>('short');
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>('app');
  const [packs, setPacks] = useState<string[]>([]);
  const [gender, setGender] = useState<Gender>('men');
  const [presetKeys, setPresetKeys] = useState<string[]>([]);
  const total = getQuitPresets(gender).length;
  // How many slideshows this run will produce: one per chosen preset, or the
  // random `count` when nothing specific is picked.
  const genCount = presetKeys.length || count;

  const add = () => onEnqueue({ count, length, packs, captionStyle, gender, presetKeys });

  const active = batches.filter((b) => b.status === 'queued' || b.status === 'running');

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-line rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="text-[15px] font-semibold text-ink flex items-center gap-2">
            <Sparkles size={15} /> Generate slideshows
          </h2>
          <button onClick={onClose} className="text-ink-5 hover:text-ink"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Which presets to generate */}
          <div>
            <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 block">Presets</label>
            <PresetPicker gender={gender} selected={presetKeys} onChange={setPresetKeys} />
          </div>

          {/* Per-preset app-slide screenshots (only when specific presets picked) */}
          {presetKeys.length > 0 && (
            <div>
              <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 block flex items-center gap-1.5">
                <ImageDown size={12} /> App-slide screenshots
              </label>
              <PresetScreenshots presetKeys={presetKeys} />
              <p className="text-[11px] text-ink-6 mt-1">
                Optional. Upload the exact phone screenshot for the app (Upshift) slide, per gender. Overrides the random POV shot for that preset.
              </p>
            </div>
          )}

          {/* How many random presets — only when nothing specific is picked */}
          {presetKeys.length === 0 && (
            <div>
              <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 block">How many presets?</label>
              <div className="flex items-center gap-2">
                {COUNT_OPTIONS.map((n) => (
                  <button
                    key={n}
                    onClick={() => setCount(n)}
                    className={`w-12 h-9 rounded-lg border text-[13px] font-medium transition-colors ${
                      count === n ? 'border-ink bg-ink text-bg' : 'border-line bg-card text-ink-5 hover:border-line-2'
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={count}
                  onChange={(e) => setCount(Math.max(1, Math.min(100, Math.round(Number(e.target.value) || 1))))}
                  className="flex-1 h-9 bg-card border border-line rounded-lg px-3 text-[13px] text-ink text-center tabular-nums outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10"
                />
              </div>
              <p className="text-[11px] text-ink-6 mt-1">
                Picks {count === 1 ? 'one random preset' : `${count} random presets`} from all {total} and generates one slideshow each.
                {count > total && ' Some presets repeat.'}
              </p>
            </div>
          )}
          {presetKeys.length > 0 && (
            <p className="text-[11px] text-ink-6 -mt-2">
              Generates exactly your {presetKeys.length} chosen preset{presetKeys.length === 1 ? '' : 's'} — one slideshow each.
            </p>
          )}

          {/* Pack (persona) */}
          <div>
            <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 block">Pack</label>
            <div className="inline-flex p-0.5 rounded-lg border border-line bg-card">
              {GENDERS.map((gnd) => (
                <button
                  key={gnd.key}
                  type="button"
                  onClick={() => setGender(gnd.key)}
                  className={`text-[12px] px-3 h-7 rounded-md transition-colors ${
                    gender === gnd.key ? 'bg-raised text-ink' : 'text-ink-4 hover:text-ink'
                  }`}
                >
                  {gnd.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-ink-6 mt-1">Gender-matched persona, hooks and the POV shot on the app slide.</p>
          </div>

          {/* Slide length */}
          <div>
            <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 block">Slide length</label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { key: 'short', label: 'Short', hint: 'One-liners' },
                { key: 'long', label: 'Long', hint: 'Title + body' },
              ] as const).map((o) => (
                <button
                  key={o.key}
                  onClick={() => setLength(o.key)}
                  className={`h-auto py-2 px-3 rounded-lg border text-left transition-colors ${
                    length === o.key ? 'border-ink bg-ink text-bg' : 'border-line bg-card text-ink-5 hover:border-line-2'
                  }`}
                >
                  <div className="text-[13px] font-medium">{o.label}</div>
                  <div className={`text-[11px] ${length === o.key ? 'text-bg/70' : 'text-ink-6'}`}>{o.hint}</div>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-ink-6 mt-1">Only affects the model-written presets — verbatim viral decks keep their own length.</p>
          </div>

          {/* Caption font */}
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
                  className={`overflow-hidden rounded-lg border text-left transition-colors ${
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

          {/* Packs */}
          <div>
            <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 block">Background packs</label>
            <PackPicker selected={packs} onChange={setPacks} />
          </div>

          {/* Queued/running batches — a live log inside the modal */}
          {batches.length > 0 && (
            <div>
              <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 block">
                Batch queue {active.length > 0 && <span className="text-ink-6 normal-case tracking-normal">· {active.length} pending</span>}
              </label>
              <div className="rounded-lg border border-line divide-y divide-line max-h-40 overflow-y-auto">
                {batches.slice(0, 8).map((b) => (
                  <div key={b.id} className="flex items-center gap-2 px-3 py-1.5 text-[12px]">
                    <BatchIcon status={b.status} />
                    <span className="text-ink truncate flex-1 min-w-0">{b.label}</span>
                    <span className="text-ink-6 tabular-nums shrink-0">
                      {b.status === 'running' ? `${b.done}/${b.total}` : b.status === 'done' ? `${b.done} done` : b.status === 'error' ? 'failed' : 'queued'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-line flex justify-between items-center gap-2">
          <span className="text-[11px] text-ink-6">
            {active.length > 0 ? `${active.length} batch${active.length === 1 ? '' : 'es'} in queue` : 'Stack several characters, they run one by one'}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Close</Button>
            <Button variant="primary" icon={<Plus size={13} />} onClick={add}>
              Add {genCount} to queue
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BatchIcon({ status }: { status: GenBatch['status'] }) {
  if (status === 'running') return <Loader2 size={13} className="animate-spin text-ink-4 shrink-0" />;
  if (status === 'done') return <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />;
  if (status === 'error') return <AlertCircle size={13} className="text-red-500 shrink-0" />;
  return <Circle size={13} className="text-ink-6 shrink-0" />;
}
