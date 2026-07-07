import { useEffect, useMemo, useState } from 'react';
import { Images, Loader2, Check } from 'lucide-react';
import type { Slideshow, LibraryImage } from '../types';
import { Button } from './Button';
import { getMergedLibrary } from '../lib/mergedLibrary';
import { libraryRef } from '../lib/imageSrc';

interface BulkBackgroundToolProps {
  // The currently-selected slideshows.
  slideshows: Slideshow[];
  onApply: (updates: { slideshowId: string; slideIndex: number; ref: string }[]) => void;
}

// Fisher–Yates — used so each selected slideshow gets a *different* random
// image from the pack (as far as the pack size allows) rather than repeats.
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Queue selection tool: pick a slide number + a pack, and it drops a different
// random image from that pack onto slide N of every selected slideshow — a
// fast way to background a whole batch without opening each editor.
export function BulkBackgroundTool({ slideshows, onApply }: BulkBackgroundToolProps) {
  const [open, setOpen] = useState(false);
  const [lib, setLib] = useState<LibraryImage[] | null>(null);
  const [slideNumber, setSlideNumber] = useState(1);
  const [pack, setPack] = useState('');
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (open && lib === null) getMergedLibrary().then(setLib).catch(() => setLib([]));
  }, [open, lib]);

  const maxSlides = useMemo(
    () => slideshows.reduce((m, s) => Math.max(m, s.slides.length), 0),
    [slideshows]
  );

  const packs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const img of lib || []) counts.set(img.pack, (counts.get(img.pack) || 0) + 1);
    return [...counts.entries()];
  }, [lib]);

  // The chosen pack, defaulting to the first available until the user picks one.
  const selectedPack = pack || packs[0]?.[0] || '';

  // slideNumber 0 == "All slides". How many of the selected slideshows are affected.
  const allSlides = slideNumber === 0;
  const affected = allSlides
    ? slideshows.filter((s) => s.slides.length > 0).length
    : slideshows.filter((s) => s.slides.length >= slideNumber).length;

  const apply = () => {
    const pool = (lib || []).filter((i) => i.pack === selectedPack);
    if (!pool.length) return;
    const updates: { slideshowId: string; slideIndex: number; ref: string }[] = [];
    if (allSlides) {
      // Fill every slide of each selected slideshow with a fresh shuffle, so
      // images are distinct within a slideshow (and re-used across slideshows).
      for (const s of slideshows) {
        const bag = shuffle(pool);
        s.slides.forEach((_, i) => {
          updates.push({ slideshowId: s.id, slideIndex: i, ref: libraryRef(bag[i % bag.length]) });
        });
      }
    } else {
      // One slide position across the selection — distinct picks while the pack lasts.
      const bag = shuffle(pool);
      let n = 0;
      for (const s of slideshows) {
        if (s.slides.length < slideNumber) continue;
        updates.push({ slideshowId: s.id, slideIndex: slideNumber - 1, ref: libraryRef(bag[n % bag.length]) });
        n++;
      }
    }
    onApply(updates);
    setFlash(true);
    setTimeout(() => setFlash(false), 1500);
    setOpen(false);
  };

  return (
    <div className="relative">
      <Button variant="secondary" icon={<Images size={13} />} onClick={() => setOpen((o) => !o)}>
        Backgrounds
      </Button>
      {flash && (
        <span className="absolute -bottom-5 right-0 text-[11px] text-emerald-600 flex items-center gap-1 whitespace-nowrap">
          <Check size={11} /> Applied
        </span>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 z-40 w-64 bg-card border border-line rounded-xl shadow-lg p-3 space-y-3">
            <p className="text-[11px] text-ink-5 leading-snug">
              Drops a different random image from a pack onto {allSlides ? 'every slide' : 'the chosen slide'} of all{' '}
              {slideshows.length} selected slideshows.
            </p>

            <div>
              <label className="text-[11px] text-ink-6 mb-1 block">Slide</label>
              <select
                value={slideNumber}
                onChange={(e) => setSlideNumber(Number(e.target.value))}
                className="w-full h-9 bg-surface border border-line rounded-lg px-2 text-[13px] text-ink outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10"
              >
                <option value={0}>All slides</option>
                {Array.from({ length: Math.max(maxSlides, 1) }).map((_, i) => (
                  <option key={i} value={i + 1}>Slide {i + 1}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] text-ink-6 mb-1 block">Pack</label>
              {lib === null ? (
                <div className="flex items-center gap-1.5 text-[12px] text-ink-5 h-9">
                  <Loader2 size={12} className="animate-spin" /> Loading packs…
                </div>
              ) : (
                <select
                  value={selectedPack}
                  onChange={(e) => setPack(e.target.value)}
                  className="w-full h-9 bg-surface border border-line rounded-lg px-2 text-[13px] text-ink outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10"
                >
                  {packs.length === 0 && <option value="">No packs available</option>}
                  {packs.map(([name, count]) => (
                    <option key={name} value={name}>{name} ({count})</option>
                  ))}
                </select>
              )}
            </div>

            <Button
              variant="primary"
              fullWidth
              onClick={apply}
              disabled={!selectedPack || !lib?.length || affected === 0}
            >
              Apply to {affected} {allSlides ? 'slideshow' : 'slide'}{affected === 1 ? '' : 's'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
