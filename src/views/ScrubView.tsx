import { useState } from 'react';
import { Upload, Loader2, Download, Trash2, Info } from 'lucide-react';
import { ViewHeader } from '../components/ViewHeader';
import { Button } from '../components/Button';
import { scrubImage } from '../lib/scrubImage';
import { downloadDataUrl } from '../lib/stripMetadata';

interface ScrubItem {
  id: string;
  name: string;
  original: string; // data URL
  cleaned: string | null;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export function ScrubView() {
  const [items, setItems] = useState<ScrubItem[]>([]);
  const [strength, setStrength] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    const added: ScrubItem[] = [];
    for (const file of files) {
      added.push({
        id: `img-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
        name: file.name.replace(/\.[^.]+$/, ''),
        original: await fileToDataUrl(file),
        cleaned: null,
      });
    }
    setItems((prev) => [...prev, ...added]);
  };

  const cleanAll = async () => {
    setBusy(true);
    try {
      const next = await Promise.all(
        items.map(async (it) => ({ ...it, cleaned: await scrubImage(it.original, { strength }).catch(() => null) }))
      );
      setItems(next);
    } finally {
      setBusy(false);
    }
  };

  const remove = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

  const downloadOne = (it: ScrubItem) => {
    if (it.cleaned) downloadDataUrl(it.cleaned, `${it.name}-clean.jpg`);
  };
  const downloadAll = () => items.forEach((it, i) => it.cleaned && setTimeout(() => downloadOne(it), i * 200));

  const cleanedCount = items.filter((i) => i.cleaned).length;

  return (
    <>
      <ViewHeader
        title="Clean"
        subtitle="Strip metadata and make tiny, near-invisible pixel changes so a photo reads as a brand-new image — handy before reposting to Reddit/TikTok."
      />

      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-4xl mx-auto space-y-5">
          {/* Controls */}
          <div className="bg-card border border-line rounded-xl p-4 flex items-end gap-3 flex-wrap">
            <label className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-ink text-bg text-[13px] font-medium cursor-pointer hover:bg-ink-hover">
              <Upload size={13} /> Add photos
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => add(e.target.files)} />
            </label>

            <div>
              <label className="text-[11px] text-ink-6 mb-1 block">Strength</label>
              <div className="flex gap-1">
                {([[1, 'Subtle'], [2, 'Stronger']] as const).map(([v, label]) => (
                  <button
                    key={v}
                    onClick={() => setStrength(v)}
                    className={`h-9 px-3 rounded-lg border text-[12px] font-medium transition-colors ${
                      strength === v ? 'border-ink bg-ink text-bg' : 'border-line bg-card text-ink-5 hover:border-line-2'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1" />
            {items.length > 0 && (
              <>
                <Button
                  variant="primary"
                  icon={busy ? <Loader2 size={13} className="animate-spin" /> : undefined}
                  onClick={cleanAll}
                  disabled={busy}
                >
                  {busy ? 'Cleaning…' : `Clean ${items.length}`}
                </Button>
                {cleanedCount > 0 && (
                  <Button variant="secondary" icon={<Download size={13} />} onClick={downloadAll}>
                    Download all
                  </Button>
                )}
              </>
            )}
          </div>

          <div className="flex items-start gap-2 p-3 rounded-lg bg-surface border border-line">
            <Info size={13} className="text-ink-5 mt-0.5 shrink-0" />
            <p className="text-[11px] text-ink-4 leading-snug">
              Metadata (EXIF, GPS, and AI/C2PA provenance) is fully removed. The pixel tweaks defeat most repost/duplicate
              detection but nothing is 100%. Invisible pixel watermarks like Google SynthID may still survive — use
              “Stronger” if a subtle pass isn’t enough.
            </p>
          </div>

          {items.length === 0 ? (
            <div className="text-center py-16 text-[13px] text-ink-5">
              Add one or more photos to clean them.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {items.map((it) => (
                <div key={it.id} className="bg-card border border-line rounded-xl p-2">
                  <div className="relative aspect-square rounded-lg overflow-hidden bg-raised">
                    <img src={it.cleaned || it.original} alt="" className="w-full h-full object-cover" />
                    {it.cleaned && (
                      <span className="absolute top-1 left-1 text-[9px] font-semibold uppercase tracking-wide bg-emerald-600 text-white px-1.5 py-0.5 rounded">
                        Clean
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <button
                      onClick={() => downloadOne(it)}
                      disabled={!it.cleaned}
                      className="text-[11px] text-ink-5 hover:text-ink disabled:opacity-40 flex items-center gap-1"
                    >
                      <Download size={11} /> Download
                    </button>
                    <button onClick={() => remove(it.id)} aria-label="Remove" className="text-ink-6 hover:text-red-600">
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
