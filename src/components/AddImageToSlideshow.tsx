import { Fragment, useState } from 'react';
import { Upload, Images, Loader2, Check, Plus, Replace, X } from 'lucide-react';
import type { Slideshow, Slide, LibraryImage } from '../types';
import { Button } from './Button';
import { SlidePreview } from './SlidePreview';
import { getMergedLibrary } from '../lib/mergedLibrary';

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

interface AddImageToSlideshowProps {
  queue: Slideshow[];
  onApply: (slideshowId: string, slides: Slide[]) => void;
}

// Guided flow: pick an image → pick which queued slideshow it belongs in →
// place it (insert as a new slide at a chosen spot, or replace a specific
// slide). The filmstrip shows the resulting order so it's obvious where the
// image lands before committing.
export function AddImageToSlideshow({ queue, onApply }: AddImageToSlideshowProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [library, setLibrary] = useState<LibraryImage[] | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [mode, setMode] = useState<'add' | 'replace'>('add');
  const [index, setIndex] = useState(0); // add: insertion slot; replace: slide index
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const target = queue.find((s) => s.id === targetId) || null;

  const openLibrary = async () => {
    setShowLibrary((v) => !v);
    if (library === null) setLibrary(await getMergedLibrary().catch(() => []));
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setImageUrl(await fileToDataUrl(file));
    setDone(null);
  };

  const selectTarget = (s: Slideshow) => {
    setTargetId(s.id);
    setMode('add');
    setIndex(s.slides.length); // default: append to the end
    setText('');
    setDone(null);
  };

  const previewSlide: Slide = {
    id: 'preview',
    text,
    imageUrl: imageUrl ?? undefined,
    bgFrom: '#0f172a',
    bgTo: '#1e293b',
  };

  const confirm = () => {
    setError(null);
    if (!target || !imageUrl) {
      setError('Pick an image and a slideshow first.');
      return;
    }
    const built: Slide = {
      id: `custom-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
      text,
      imageUrl,
      bgFrom: '#0f172a',
      bgTo: '#1e293b',
    };
    const slides =
      mode === 'add'
        ? [...target.slides.slice(0, index), built, ...target.slides.slice(index)]
        : target.slides.map((s, i) => (i === index ? { ...built, id: s.id } : s));
    onApply(target.id, slides);
    const label = target.hook || 'slideshow';
    setDone(
      mode === 'add'
        ? `Inserted as slide ${index + 1} in "${label}".`
        : `Replaced slide ${index + 1} in "${label}".`
    );
    // Keep the target selected (likely adding several), reset the image + text.
    setImageUrl(null);
    setText('');
  };

  if (!queue.length) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <p className="text-[13px] text-ink-5">
          No slideshows in the Queue yet. Generate a batch or create one first, then come back to drop an image into it.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* 1. Image */}
      <Step n={1} title="Choose an image">
        {imageUrl ? (
          <div className="flex items-start gap-3">
            <div className="w-24 shrink-0">
              <SlidePreview slide={previewSlide} showText={false} />
            </div>
            <Button variant="secondary" icon={<X size={13} />} onClick={() => setImageUrl(null)}>
              Remove
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <label className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-ink text-bg text-[13px] font-medium cursor-pointer hover:bg-ink-hover">
              <Upload size={13} /> Upload image
              <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
            </label>
            <Button variant="secondary" icon={<Images size={13} />} onClick={openLibrary}>
              {showLibrary ? 'Hide library' : 'Choose from Library'}
            </Button>
          </div>
        )}

        {!imageUrl && showLibrary && (
          <div className="mt-3">
            {library === null ? (
              <div className="flex items-center gap-2 text-[12px] text-ink-5 py-6 justify-center">
                <Loader2 size={13} className="animate-spin" /> Loading library…
              </div>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2 max-h-64 overflow-y-auto">
                {library.map((img) => (
                  <button
                    key={img.id}
                    onClick={() => { setImageUrl(img.url); setShowLibrary(false); setDone(null); }}
                    className="aspect-[9/16] rounded-lg overflow-hidden bg-raised hover:ring-2 hover:ring-ink transition-all"
                  >
                    <img src={img.url} alt="" loading="lazy" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </Step>

      {/* 2. Target slideshow */}
      <Step n={2} title="Choose the slideshow">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {queue.map((s) => (
            <button
              key={s.id}
              onClick={() => selectTarget(s)}
              className={`text-left rounded-xl border p-3 transition-colors ${
                targetId === s.id ? 'border-ink ring-1 ring-ink bg-surface' : 'border-line hover:border-line-2'
              }`}
            >
              <div className="grid grid-cols-6 gap-1">
                {s.slides.map((slide) => (
                  <SlidePreview key={slide.id} slide={slide} />
                ))}
              </div>
              <div className="mt-2 text-[12px] font-medium text-ink truncate">{s.hook || 'Untitled slideshow'}</div>
              <div className="text-[11px] text-ink-6">{s.slides.length} slides</div>
            </button>
          ))}
        </div>
      </Step>

      {/* 3. Placement */}
      {target && imageUrl && (
        <Step n={3} title="Place it">
          <div className="flex gap-2 mb-4">
            <Button
              variant={mode === 'add' ? 'primary' : 'secondary'}
              icon={<Plus size={13} />}
              onClick={() => { setMode('add'); setIndex(target.slides.length); }}
            >
              Add as new slide
            </Button>
            <Button
              variant={mode === 'replace' ? 'primary' : 'secondary'}
              icon={<Replace size={13} />}
              onClick={() => { setMode('replace'); setIndex(0); setText(target.slides[0]?.text || ''); }}
            >
              Replace a slide
            </Button>
          </div>

          <p className="text-[12px] text-ink-5 mb-2">
            {mode === 'add'
              ? 'Click where the new slide should go — it appears highlighted in the sequence.'
              : 'Click the slide to replace — its text is copied over so you can keep or edit it.'}
          </p>

          {/* Filmstrip */}
          <div className="flex items-stretch gap-1 overflow-x-auto pb-2">
            {mode === 'add' ? (
              <>
                <InsertSlot active={index === 0} onClick={() => setIndex(0)} preview={index === 0 ? previewSlide : null} />
                {target.slides.map((slide, i) => (
                  <Fragment key={slide.id}>
                    <SlideThumb slide={slide} label={`Slide ${i + 1}`} />
                    <InsertSlot
                      active={index === i + 1}
                      onClick={() => setIndex(i + 1)}
                      preview={index === i + 1 ? previewSlide : null}
                    />
                  </Fragment>
                ))}
              </>
            ) : (
              target.slides.map((slide, i) => (
                <SlideThumb
                  key={slide.id}
                  slide={index === i ? previewSlide : slide}
                  label={index === i ? `Replaces slide ${i + 1}` : `Slide ${i + 1}`}
                  selected={index === i}
                  onClick={() => { setIndex(i); setText(slide.text); }}
                />
              ))
            )}
          </div>

          {/* New slide text */}
          <div className="mt-4 max-w-lg">
            <label className="text-[11px] text-ink-6 uppercase tracking-widest font-semibold mb-1.5 block">
              Slide text <span className="normal-case font-normal text-ink-6">(optional)</span>
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              placeholder="Text shown over this slide…"
              className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-[13px] text-ink resize-none outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10"
            />
          </div>

          {error && <p className="text-[12px] text-red-600 mt-2">{error}</p>}

          <div className="flex items-center gap-3 mt-4">
            <Button variant="primary" icon={<Check size={13} />} onClick={confirm}>
              {mode === 'add' ? `Insert as slide ${index + 1}` : `Replace slide ${index + 1}`}
            </Button>
          </div>
        </Step>
      )}

      {done && (
        <p className="text-[12px] text-emerald-600 flex items-center gap-1.5">
          <Check size={13} /> {done}
        </p>
      )}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <span className="w-5 h-5 rounded-full bg-ink text-bg text-[11px] font-bold flex items-center justify-center">
          {n}
        </span>
        <h2 className="text-[13px] font-semibold text-ink uppercase tracking-widest">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function SlideThumb({
  slide,
  label,
  selected,
  onClick,
}: {
  slide: Slide;
  label: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <div className={`w-20 rounded-md overflow-hidden ${selected ? 'ring-2 ring-ink' : ''}`}>
        <SlidePreview slide={slide} />
      </div>
      <span className={`block text-center text-[10px] mt-1 ${selected ? 'text-ink font-medium' : 'text-ink-6'}`}>
        {label}
      </span>
    </>
  );
  return onClick ? (
    <button onClick={onClick} className="shrink-0">
      {inner}
    </button>
  ) : (
    <div className="shrink-0">{inner}</div>
  );
}

// A clickable gap between slides (Add mode). When active, it shows the new
// slide's preview so the resulting order is obvious.
function InsertSlot({
  active,
  onClick,
  preview,
}: {
  active: boolean;
  onClick: () => void;
  preview: Slide | null;
}) {
  if (active && preview) {
    return (
      <div className="shrink-0">
        <div className="w-20 rounded-md overflow-hidden ring-2 ring-emerald-500">
          <SlidePreview slide={preview} />
        </div>
        <span className="block text-center text-[10px] mt-1 text-emerald-600 font-medium">New</span>
      </div>
    );
  }
  return (
    <button onClick={onClick} className="shrink-0 self-center" aria-label="Insert here">
      <div className="w-6 h-32 rounded-md border border-dashed border-line hover:border-ink hover:bg-raised flex items-center justify-center text-ink-6 hover:text-ink transition-colors">
        <Plus size={14} />
      </div>
    </button>
  );
}
