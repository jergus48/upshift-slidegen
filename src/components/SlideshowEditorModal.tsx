import { useEffect, useMemo, useState } from 'react';
import { X, Loader2, ChevronLeft, ChevronRight, Trash2, Shuffle, Image as ImageIcon } from 'lucide-react';
import type { Slideshow, Slide, LibraryImage } from '../types';
import { Button } from './Button';
import { SlidePreview } from './SlidePreview';
import { getMergedLibrary } from '../lib/mergedLibrary';

interface SlideshowEditorModalProps {
  slideshow: Slideshow;
  onClose: () => void;
  onSave: (patch: { slides: Slide[]; caption: string; hashtags: string[] }) => Promise<void>;
}

type Tab = 'post' | 'slide';

export function SlideshowEditorModal({ slideshow, onClose, onSave }: SlideshowEditorModalProps) {
  const [slides, setSlides] = useState<Slide[]>(slideshow.slides.map((s) => ({ ...s })));
  const [caption, setCaption] = useState(slideshow.caption);
  const [hashtags, setHashtags] = useState(slideshow.hashtags.join(' '));
  const [index, setIndex] = useState(0);
  const [tab, setTab] = useState<Tab>('post');
  const [library, setLibrary] = useState<LibraryImage[] | null>(null);
  const [pack, setPack] = useState('all');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getMergedLibrary().then(setLibrary).catch(() => setLibrary([]));
  }, []);

  const packs = useMemo(
    () => ['all', ...Array.from(new Set((library || []).map((i) => i.pack)))],
    [library]
  );
  const filtered = useMemo(
    () => (library || []).filter((i) => pack === 'all' || i.pack === pack),
    [library, pack]
  );

  const total = slides.length;
  const current = slides[index];

  const patchSlide = (patch: Partial<Slide>) =>
    setSlides((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  const shuffleBackgrounds = () => {
    const pool = filtered;
    if (!pool.length) return;
    setSlides((prev) => prev.map((s) => ({ ...s, imageUrl: pool[Math.floor(Math.random() * pool.length)].url })));
  };

  const deleteSlide = () => {
    if (total <= 1) return;
    setSlides((prev) => prev.filter((_, i) => i !== index));
    setIndex((i) => Math.max(0, Math.min(i, total - 2)));
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave({
        slides,
        caption,
        hashtags: hashtags.split(/[\s,]+/).map((t) => t.replace(/^#/, '')).filter(Boolean),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card border border-line rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col sm:flex-row overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Preview */}
        <div className="sm:flex-1 bg-surface flex flex-col items-center justify-center p-6 gap-3 min-w-0">
          <div className="w-[200px] max-w-full">
            <SlidePreview slide={current} />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
              className="w-9 h-9 rounded-full bg-card border border-line text-ink-4 hover:text-ink disabled:opacity-30 flex items-center justify-center"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="flex gap-1.5">
              {slides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setIndex(i)}
                  className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-ink' : 'w-1.5 bg-line-2'}`}
                  aria-label={`Slide ${i + 1}`}
                />
              ))}
            </div>
            <button
              onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
              disabled={index === total - 1}
              className="w-9 h-9 rounded-full bg-card border border-line text-ink-4 hover:text-ink disabled:opacity-30 flex items-center justify-center"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <span className="text-[11px] text-ink-6 tabular-nums">{index + 1} / {total}</span>
        </div>

        {/* Editor panel */}
        <div className="w-full sm:w-96 flex flex-col border-t sm:border-t-0 sm:border-l border-line min-h-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-line">
            <div className="flex gap-1">
              {(['post', 'slide'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-colors ${
                    tab === t ? 'bg-raised text-ink' : 'text-ink-5 hover:text-ink-3'
                  }`}
                >
                  {t === 'post' ? 'Post' : `Slide ${index + 1}`}
                </button>
              ))}
            </div>
            <button onClick={onClose} className="text-ink-5 hover:text-ink">
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {tab === 'post' ? (
              <>
                <div>
                  <label className="text-[11px] text-ink-6 uppercase tracking-widest font-semibold mb-1.5 block">Caption</label>
                  <textarea
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    rows={5}
                    className="w-full bg-card border border-line rounded-lg px-3 py-2 text-[13px] text-ink resize-none outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10"
                  />
                  <span className="text-[10px] text-ink-6">{caption.length} chars</span>
                </div>
                <div>
                  <label className="text-[11px] text-ink-6 uppercase tracking-widest font-semibold mb-1.5 block">Hashtags</label>
                  <input
                    value={hashtags}
                    onChange={(e) => setHashtags(e.target.value)}
                    placeholder="finance budgeting money"
                    className="w-full h-9 bg-card border border-line rounded-lg px-3 text-[13px] text-ink outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10"
                  />
                  <span className="text-[10px] text-ink-6">Space or comma separated, no # needed.</span>
                </div>
              </>
            ) : (
              <>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] text-ink-6 uppercase tracking-widest font-semibold">Slide {index + 1} text</label>
                    {total > 1 && (
                      <button onClick={deleteSlide} className="text-[10px] text-ink-6 hover:text-red-600 flex items-center gap-1">
                        <Trash2 size={11} /> Delete slide
                      </button>
                    )}
                  </div>
                  <textarea
                    value={current.text}
                    onChange={(e) => patchSlide({ text: e.target.value })}
                    rows={3}
                    className="w-full bg-card border border-line rounded-lg px-3 py-2 text-[13px] text-ink resize-none outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] text-ink-6 uppercase tracking-widest font-semibold">Background</label>
                    <div className="flex items-center gap-2">
                      <select
                        value={pack}
                        onChange={(e) => setPack(e.target.value)}
                        className="h-7 bg-card border border-line rounded-md px-1.5 text-[11px] text-ink outline-none"
                      >
                        {packs.map((p) => (
                          <option key={p} value={p}>{p === 'all' ? 'All packs' : p}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <Button variant="ghost" size="sm" icon={<ImageIcon size={12} />} onClick={() => patchSlide({ imageUrl: undefined })}>
                      Gradient
                    </Button>
                    <Button variant="ghost" size="sm" icon={<Shuffle size={12} />} onClick={shuffleBackgrounds}>
                      Shuffle all
                    </Button>
                  </div>
                  {library === null ? (
                    <div className="flex items-center justify-center py-6 text-ink-5 text-[12px] gap-2">
                      <Loader2 size={13} className="animate-spin" /> Loading…
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-1.5 max-h-64 overflow-y-auto">
                      {filtered.map((img) => (
                        <button
                          key={img.id}
                          onClick={() => patchSlide({ imageUrl: img.url })}
                          className={`aspect-[9/16] rounded-md overflow-hidden bg-raised transition-all ${
                            current.imageUrl === img.url ? 'ring-2 ring-ink' : 'hover:ring-2 hover:ring-line-2'
                          }`}
                        >
                          <img src={img.url} alt="" loading="lazy" className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="px-4 py-3 border-t border-line flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button
              variant="primary"
              icon={saving ? <Loader2 size={13} className="animate-spin" /> : undefined}
              onClick={save}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
