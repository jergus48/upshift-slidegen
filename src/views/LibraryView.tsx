import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Download, Trash2, Upload } from 'lucide-react';
import type { LibraryImage } from '../types';
import { ViewHeader } from '../components/ViewHeader';
import { Button } from '../components/Button';
import { scrapePinterest } from '../lib/api';
import { getMergedLibrary } from '../lib/mergedLibrary';
import { addLocalImages, removeLocalImage } from '../lib/localLibrary';

// Read a File as a base64 data URL for shipping to the server as JSON.
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

interface LibraryViewProps {
  hasApify: boolean;
}

// Sentinel for "create a new pack" in the upload target picker.
const NEW_PACK = '__new__';

export function LibraryView({ hasApify }: LibraryViewProps) {
  const [images, setImages] = useState<LibraryImage[] | null>(null);
  const [searches, setSearches] = useState('');
  const [count, setCount] = useState(40);
  const [scraping, setScraping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [uploadTarget, setUploadTarget] = useState(NEW_PACK);
  const [uploadPack, setUploadPack] = useState('My Uploads');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = () => getMergedLibrary().then(setImages).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const scrape = async () => {
    setError(null);
    setNote(null);
    setScraping(true);
    try {
      // Pinterest searches are comma-separated phrases (each can contain spaces).
      const queries = searches.split(',').map((s) => s.trim()).filter(Boolean);
      const r = await scrapePinterest(queries, count);
      const added = await addLocalImages(r.pack, r.images, 'scraped');
      setNote(`Added ${added.length} image${added.length === 1 ? '' : 's'} from ${r.found} found.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setScraping(false);
    }
  };

  const remove = async (id: string) => {
    await removeLocalImage(id);
    await load();
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    setNote(null);
    setUploading(true);
    const pack = uploadTarget === NEW_PACK ? uploadPack.trim() || 'My Uploads' : uploadTarget;
    try {
      const dataUrls = await Promise.all([...files].map(fileToDataUrl));
      const added = await addLocalImages(pack, dataUrls, 'uploaded');
      setNote(`Added ${added.length} image${added.length === 1 ? '' : 's'} to "${pack}".`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Group by pack, scraped packs first.
  const groups = useMemo(() => {
    const map = new Map<string, LibraryImage[]>();
    for (const img of images || []) {
      if (!map.has(img.pack)) map.set(img.pack, []);
      map.get(img.pack)!.push(img);
    }
    return [...map.entries()];
  }, [images]);

  const existingPacks = useMemo(() => groups.map(([pack]) => pack), [groups]);

  return (
    <>
      <ViewHeader
        title="Library"
        subtitle="Background images for your slides. Ships with curated aesthetic packs — scrape more from Pinterest with your own Apify key."
      />

      <div className="flex-1 overflow-y-auto">
        {/* Scrape bar */}
        <div className="px-8 py-4 border-b border-line bg-surface">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-end gap-2 flex-wrap">
              <div className="flex-1 min-w-[220px]">
                <label className="text-[11px] text-ink-5 mb-1 block">Pinterest searches</label>
                <input
                  value={searches}
                  onChange={(e) => setSearches(e.target.value)}
                  placeholder="e.g. dark moody aesthetic, cozy bedroom, foggy mountain"
                  disabled={!hasApify}
                  className="w-full h-9 bg-card border border-line rounded-lg px-3 text-[13px] text-ink placeholder:text-ink-6 outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10 disabled:opacity-50"
                />
              </div>
              <div className="w-24">
                <label className="text-[11px] text-ink-5 mb-1 block">Max</label>
                <input
                  type="number"
                  value={count}
                  min={10}
                  max={200}
                  onChange={(e) => setCount(Number(e.target.value))}
                  onBlur={() => setCount((c) => Math.min(Math.max(c || 10, 10), 200))}
                  disabled={!hasApify}
                  className="w-full h-9 bg-card border border-line rounded-lg px-3 text-[13px] text-ink outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10 disabled:opacity-50"
                />
                <span className="text-[10px] text-ink-6 mt-1 block">min 10</span>
              </div>
              <Button
                variant="primary"
                size="lg"
                icon={scraping ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                onClick={scrape}
                disabled={!hasApify || scraping || !searches.trim()}
              >
                {scraping ? 'Scraping…' : 'Scrape Pinterest'}
              </Button>
            </div>
            {!hasApify && (
              <p className="text-[12px] text-ink-5 mt-2">
                Add your Apify API key in Settings to scrape Pinterest. The bundled packs below work without it.
              </p>
            )}
            {note && <p className="text-[12px] text-emerald-600 mt-2">{note}</p>}
            {error && <p className="text-[12px] text-red-600 mt-2">{error}</p>}
          </div>
        </div>

        {/* Upload own photos */}
        <div className="px-8 py-4 border-b border-line bg-surface">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-end gap-2 flex-wrap">
              <div className="flex-1 min-w-[220px]">
                <label className="text-[11px] text-ink-5 mb-1 block">Pack</label>
                <select
                  value={uploadTarget}
                  onChange={(e) => setUploadTarget(e.target.value)}
                  className="w-full h-9 bg-card border border-line rounded-lg px-3 text-[13px] text-ink outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10"
                >
                  <option value={NEW_PACK}>+ New pack…</option>
                  {existingPacks.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              {uploadTarget === NEW_PACK && (
                <div className="flex-1 min-w-[220px]">
                  <label className="text-[11px] text-ink-5 mb-1 block">New pack name</label>
                  <input
                    value={uploadPack}
                    onChange={(e) => setUploadPack(e.target.value)}
                    placeholder="e.g. My Uploads"
                    className="w-full h-9 bg-card border border-line rounded-lg px-3 text-[13px] text-ink placeholder:text-ink-6 outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10"
                  />
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => upload(e.target.files)}
                className="hidden"
              />
              <Button
                variant="primary"
                size="lg"
                icon={uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? 'Uploading…' : 'Upload photos'}
              </Button>
            </div>
            <p className="text-[12px] text-ink-5 mt-2">
              Upload your own images to use as slide backgrounds — drop them into an existing pack or start a new one.
            </p>
          </div>
        </div>

        {/* Packs */}
        <div className="p-8">
          <div className="max-w-5xl mx-auto space-y-8">
            {images === null ? (
              <div className="flex items-center justify-center py-16 text-ink-5 text-[13px] gap-2">
                <Loader2 size={14} className="animate-spin" /> Loading library…
              </div>
            ) : (
              groups.map(([pack, imgs]) => (
                <div key={pack}>
                  <div className="flex items-baseline gap-3 mb-3">
                    <h2 className="text-[13px] font-semibold text-ink uppercase tracking-widest">{pack}</h2>
                    <span className="text-[11px] text-ink-6">{imgs.length}</span>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                    {imgs.map((img) => (
                      <div key={img.id} className="group relative aspect-[9/16] rounded-lg overflow-hidden bg-raised">
                        <img src={img.url} alt="" loading="lazy" className="w-full h-full object-cover" />
                        {img.source !== 'bundled' && (
                          <button
                            onClick={() => remove(img.id)}
                            aria-label="Remove image"
                            className="absolute top-1 right-1 w-6 h-6 rounded-md bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
