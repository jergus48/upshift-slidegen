import { useState } from 'react';
import { X, Loader2, Sparkles } from 'lucide-react';
import { Button } from './Button';
import { PackPicker } from './PackPicker';
import { GENDERS, getQuitPresets, type Gender } from '../lib/quitPresets';
import type { CaptionStyle } from '../lib/captionStyle';

interface GenerateModalProps {
  defaultAudience: string;
  defaultStyleMemory: string;
  generating: boolean;
  onClose: () => void;
  onGenerate: (opts: { count: number; slidesPerShow: number; length: 'short' | 'long'; packs: string[]; audience?: string; styleMemory?: string; captionStyle: CaptionStyle }) => void;
}

const COUNT_OPTIONS = [1, 3, 5, 10];
const SLIDES_OPTIONS = [4, 5, 6, 7, 8];

const textareaClass =
  'w-full bg-card border border-line rounded-lg px-3 py-2.5 text-[13px] text-ink ' +
  'placeholder:text-ink-6 outline-none transition-colors resize-none ' +
  'focus:border-ink-7 focus:ring-2 focus:ring-ink/10 disabled:opacity-50';

export function GenerateModal({
  defaultAudience,
  defaultStyleMemory,
  generating,
  onClose,
  onGenerate,
}: GenerateModalProps) {
  const [count, setCount] = useState(3);
  const [slidesPerShow, setSlidesPerShow] = useState(6);
  const [length, setLength] = useState<'short' | 'long'>('short');
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>('app');
  const [packs, setPacks] = useState<string[]>([]);
  const [audience, setAudience] = useState('');
  const [styleMemory, setStyleMemory] = useState('');
  const [gender, setGender] = useState<Gender>('men');
  const presets = getQuitPresets(gender);

  const submit = () =>
    onGenerate({
      count,
      slidesPerShow,
      length,
      packs,
      audience: audience.trim() || undefined,
      styleMemory: styleMemory.trim() || undefined,
      captionStyle,
    });

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
          {/* Count */}
          <div>
            <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 block">How many?</label>
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
            <p className="text-[11px] text-ink-6 mt-1">1–100. Large batches take a while — they generate in chunks.</p>
          </div>

          {/* Slides per slideshow */}
          <div>
            <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 block">Slides per slideshow</label>
            <div className="flex items-center gap-2">
              {SLIDES_OPTIONS.map((n) => (
                <button
                  key={n}
                  onClick={() => setSlidesPerShow(n)}
                  disabled={generating}
                  className={`w-12 h-9 rounded-lg border text-[13px] font-medium transition-colors disabled:opacity-50 ${
                    slidesPerShow === n ? 'border-ink bg-ink text-bg' : 'border-line bg-card text-ink-5 hover:border-line-2'
                  }`}
                >
                  {n}
                </button>
              ))}
              <input
                type="number"
                min={2}
                max={12}
                value={slidesPerShow}
                disabled={generating}
                onChange={(e) => setSlidesPerShow(Math.max(2, Math.min(12, Math.round(Number(e.target.value) || 6))))}
                className="flex-1 h-9 bg-card border border-line rounded-lg px-3 text-[13px] text-ink text-center tabular-nums outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10 disabled:opacity-50"
              />
            </div>
            <p className="text-[11px] text-ink-6 mt-1">Including the hook as slide 1. Default 6.</p>
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
            <p className="text-[11px] text-ink-6 mt-1">The first slide is always a one-line hook, either way.</p>
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
                  {/* Sample rendered on a dark strip, exactly how the caption sits on a real slide */}
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
            <p className="text-[11px] text-ink-6 mt-1">Preview of how the caption text will look on your slides.</p>
          </div>

          {/* Packs */}
          <div>
            <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 block">Background packs</label>
            <PackPicker selected={packs} onChange={setPacks} disabled={generating} />
          </div>

          {/* Quick presets */}
          <div>
            <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 block">
              Quick presets <span className="normal-case font-normal text-ink-6">(optional)</span>
            </label>
            {/* Men / Women pack — gender-matched persona, hooks and hobbies */}
            <div className="inline-flex p-0.5 rounded-lg border border-line bg-card mb-1.5">
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
            <div className="flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  disabled={generating}
                  onClick={() => {
                    setAudience(p.audience);
                    setStyleMemory(p.styleMemory);
                    setSlidesPerShow(p.slides);
                  }}
                  className="text-[12px] px-3 h-8 rounded-lg border border-line text-ink-3 hover:text-ink hover:border-line-2 hover:bg-raised transition-colors disabled:opacity-50"
                >
                  {p.label} <span className="text-ink-6">({p.slides} slides)</span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-ink-6 mt-1">One click fills Audience and Style memory below.</p>
          </div>

          {/* Audience override */}
          <div>
            <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 block">
              Audience <span className="normal-case font-normal text-ink-6">(optional)</span>
            </label>
            <input
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder={defaultAudience || 'e.g. busy parents in their 30s'}
              disabled={generating}
              className="w-full h-9 bg-card border border-line rounded-lg px-3 text-[13px] text-ink placeholder:text-ink-6 outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10 disabled:opacity-50"
            />
            <p className="text-[11px] text-ink-6 mt-1">Leave blank to use the Brain default for this project.</p>
          </div>

          {/* Style memory override */}
          <div>
            <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 block">
              Style memory <span className="normal-case font-normal text-ink-6">(optional)</span>
            </label>
            <p className="text-[11px] text-ink-5 mb-1.5">
              The voice and patterns that work for you. Describe your hooks, slide structure, and CTAs — the AI
              follows this closely.
            </p>
            <textarea
              value={styleMemory}
              onChange={(e) => setStyleMemory(e.target.value)}
              placeholder={defaultStyleMemory || 'Leave blank to use your saved Style memory from Brain.'}
              rows={5}
              disabled={generating}
              className={`${textareaClass} font-mono text-[12px] leading-relaxed`}
            />
            <p className="text-[11px] text-ink-6 mt-1">Leave blank to use the Brain default for this project.</p>
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
