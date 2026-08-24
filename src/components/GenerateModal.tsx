import { useState } from 'react';
import { X, Loader2, Sparkles } from 'lucide-react';
import { Button } from './Button';
import { PackPicker } from './PackPicker';
import { PresetPicker } from './PresetPicker';
import { GENDERS, getQuitPresets, type Gender } from '../lib/quitPresets';
import type { CaptionStyle } from '../lib/captionStyle';

interface GenerateModalProps {
  generating: boolean;
  onClose: () => void;
  // Generate N presets — one deck each. `presetKeys` narrows the pool to those
  // specific presets (empty = draw from every preset at random). Verbatim clone
  // presets are dropped on verbatim; the rest are written by the model.
  onGenerate: (opts: { count: number; length: 'short' | 'long'; packs: string[]; captionStyle: CaptionStyle; gender: Gender; presetKeys: string[] }) => void;
}

const COUNT_OPTIONS = [1, 3, 5, 10];

export function GenerateModal({ generating, onClose, onGenerate }: GenerateModalProps) {
  const [count, setCount] = useState(5);
  const [length, setLength] = useState<'short' | 'long'>('short');
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>('app');
  const [packs, setPacks] = useState<string[]>([]);
  const [gender, setGender] = useState<Gender>('men');
  const [presetKeys, setPresetKeys] = useState<string[]>([]);
  const total = getQuitPresets(gender).length;
  // How many presets we're actually drawing from — the selected subset, or all.
  const pool = presetKeys.length || total;

  const submit = () => onGenerate({ count, length, packs, captionStyle, gender, presetKeys });

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={generating ? undefined : onClose}>
      <div className="bg-card border border-line rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="text-[15px] font-semibold text-ink flex items-center gap-2">
            <Sparkles size={15} /> Generate slideshows
          </h2>
          {!generating && <button onClick={onClose} className="text-ink-5 hover:text-ink"><X size={18} /></button>}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* How many random presets */}
          <div>
            <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 block">How many presets?</label>
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
                max={100}
                value={count}
                disabled={generating}
                onChange={(e) => setCount(Math.max(1, Math.min(100, Math.round(Number(e.target.value) || 1))))}
                className="flex-1 h-9 bg-card border border-line rounded-lg px-3 text-[13px] text-ink text-center tabular-nums outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10 disabled:opacity-50"
              />
            </div>
            <p className="text-[11px] text-ink-6 mt-1">
              {presetKeys.length
                ? `Generates ${count} ${count === 1 ? 'slideshow' : 'slideshows'} drawn from your ${presetKeys.length} chosen preset${presetKeys.length === 1 ? '' : 's'}.`
                : `Picks ${count === 1 ? 'one random preset' : `${count} random presets`} from all ${total} and generates one slideshow each.`}
              {count > pool && ' Some presets repeat.'}
            </p>
          </div>

          {/* Which presets to draw from */}
          <div>
            <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 block">Presets</label>
            <PresetPicker gender={gender} selected={presetKeys} onChange={setPresetKeys} disabled={generating} />
          </div>

          {/* Pack (persona) */}
          <div>
            <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 block">Pack</label>
            <div className="inline-flex p-0.5 rounded-lg border border-line bg-card">
              {GENDERS.map((gnd) => (
                <button
                  key={gnd.key}
                  type="button"
                  disabled={generating}
                  onClick={() => setGender(gnd.key)}
                  className={`text-[12px] px-3 h-7 rounded-md transition-colors disabled:opacity-50 ${
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
                  disabled={generating}
                  className={`h-auto py-2 px-3 rounded-lg border text-left transition-colors disabled:opacity-50 ${
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

          {/* Packs */}
          <div>
            <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 block">Background packs</label>
            <PackPicker selected={packs} onChange={setPacks} disabled={generating} />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-line flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={generating}>Cancel</Button>
          <Button
            variant="primary"
            icon={generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            onClick={submit}
            disabled={generating}
          >
            {generating ? 'Generating…' : `Generate ${count}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
