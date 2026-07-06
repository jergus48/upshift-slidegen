import { useState } from 'react';
import { Plus, Trash2, ImagePlus, Loader2, Check } from 'lucide-react';
import type { Slide, Slideshow } from '../types';
import { ViewHeader } from '../components/ViewHeader';
import { Button } from '../components/Button';
import { SlidePreview } from '../components/SlidePreview';
import { AddImageToSlideshow } from '../components/AddImageToSlideshow';

// Read a File as a base64 data URL — kept client-side, sent straight to the
// server as part of the slideshow (same as scheduling already does for
// rendered PNGs), no separate library upload needed.
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function emptySlide(): Slide {
  return {
    id: `custom-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    text: '',
    bgFrom: '#0f172a',
    bgTo: '#1e293b',
  };
}

interface CreateViewProps {
  onAddToQueue: (payload: { caption: string; hashtags: string[]; slides: Slide[] }) => Promise<void>;
  queue: Slideshow[];
  onApplyToSlideshow: (slideshowId: string, slides: Slide[]) => void;
}

type Mode = 'new' | 'existing';

export function CreateView({ onAddToQueue, queue, onApplyToSlideshow }: CreateViewProps) {
  const [mode, setMode] = useState<Mode>('new');
  const [slides, setSlides] = useState<Slide[]>([emptySlide()]);
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const patchSlide = (id: string, patch: Partial<Slide>) =>
    setSlides((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const addSlide = () => setSlides((prev) => [...prev, emptySlide()]);
  const removeSlide = (id: string) =>
    setSlides((prev) => (prev.length > 1 ? prev.filter((s) => s.id !== id) : prev));

  const pickImage = async (id: string, file: File | undefined) => {
    if (!file) return;
    patchSlide(id, { imageUrl: await fileToDataUrl(file) });
  };

  const canSubmit = slides.some((s) => s.text.trim() || s.imageUrl);

  const submit = async () => {
    setError(null);
    setDone(false);
    if (!canSubmit) {
      setError('Add text or an image to at least one slide.');
      return;
    }
    setSaving(true);
    try {
      await onAddToQueue({
        caption,
        hashtags: hashtags.split(/[\s,]+/).map((t) => t.replace(/^#/, '')).filter(Boolean),
        slides,
      });
      setSlides([emptySlide()]);
      setCaption('');
      setHashtags('');
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ViewHeader
        title="Create"
        subtitle="Build a slideshow from your own photos and text, or drop an image into a slideshow that's already in the Queue."
      />

      <div className="px-8 pt-4">
        <div className="max-w-5xl mx-auto flex gap-1">
          {([['new', 'New slideshow'], ['existing', 'Add to a slideshow']] as const).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3.5 h-9 text-[13px] font-medium rounded-lg transition-colors ${
                mode === m ? 'bg-raised text-ink' : 'text-ink-5 hover:text-ink-3'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'existing' ? (
        <div className="flex-1 overflow-y-auto p-8">
          <AddImageToSlideshow queue={queue} onApply={onApplyToSlideshow} />
        </div>
      ) : (
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {slides.map((slide, i) => (
              <div key={slide.id} className="bg-card border border-line rounded-xl p-3">
                <div className="relative">
                  <SlidePreview slide={slide} />
                  <label className="absolute inset-x-2 bottom-2 flex items-center justify-center gap-1.5 h-8 rounded-lg bg-black/60 text-white text-[11px] font-medium cursor-pointer hover:bg-black/75 transition-colors">
                    <ImagePlus size={12} />
                    {slide.imageUrl ? 'Change image' : 'Add image'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => pickImage(slide.id, e.target.files?.[0])}
                    />
                  </label>
                </div>
                <textarea
                  value={slide.text}
                  onChange={(e) => patchSlide(slide.id, { text: e.target.value })}
                  placeholder={`Slide ${i + 1} text`}
                  rows={2}
                  className="w-full mt-2 bg-surface border border-line rounded-lg px-2 py-1.5 text-[12px] text-ink resize-none outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10"
                />
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[10px] text-ink-6">Slide {i + 1}</span>
                  {slides.length > 1 && (
                    <button
                      onClick={() => removeSlide(slide.id)}
                      aria-label="Remove slide"
                      className="text-ink-6 hover:text-red-600"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            <button
              onClick={addSlide}
              className="border border-dashed border-line rounded-xl flex flex-col items-center justify-center gap-1.5 text-ink-5 hover:text-ink hover:border-line-2 transition-colors min-h-[220px]"
            >
              <Plus size={18} />
              <span className="text-[12px]">Add slide</span>
            </button>
          </div>

          <div className="bg-card border border-line rounded-xl p-4 space-y-3 max-w-lg">
            <div>
              <label className="text-[11px] text-ink-6 uppercase tracking-widest font-semibold mb-1.5 block">
                Caption
              </label>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={3}
                placeholder="Post caption…"
                className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-[13px] text-ink resize-none outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10"
              />
            </div>
            <div>
              <label className="text-[11px] text-ink-6 uppercase tracking-widest font-semibold mb-1.5 block">
                Hashtags
              </label>
              <input
                value={hashtags}
                onChange={(e) => setHashtags(e.target.value)}
                placeholder="finance budgeting money"
                className="w-full h-9 bg-surface border border-line rounded-lg px-3 text-[13px] text-ink outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10"
              />
              <span className="text-[10px] text-ink-6">Space or comma separated, no # needed.</span>
            </div>

            {error && <p className="text-[12px] text-red-600">{error}</p>}
            {done && (
              <p className="text-[12px] text-emerald-600 flex items-center gap-1">
                <Check size={13} /> Added to the Queue.
              </p>
            )}

            <div className="flex justify-end">
              <Button
                variant="primary"
                icon={saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                onClick={submit}
                disabled={saving}
              >
                {saving ? 'Adding…' : 'Add to Queue'}
              </Button>
            </div>
          </div>
        </div>
      </div>
      )}
    </>
  );
}
