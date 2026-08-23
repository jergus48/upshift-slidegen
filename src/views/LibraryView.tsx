import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Loader2, Download, Trash2, Upload, Eye, EyeOff, FolderPlus, X } from 'lucide-react';
import type { LibraryImage } from '../types';
import { ViewHeader } from '../components/ViewHeader';
import { Button } from '../components/Button';
import { scrapePinterest } from '../lib/api';
import { getMergedLibrary } from '../lib/mergedLibrary';
import { addLocalImages, removeLocalImage, setImageSubfolder, moveSubfolderImages } from '../lib/localLibrary';
import { getHiddenPacks, setPackHidden } from '../lib/hiddenPacks';
import { getSubfolders, addSubfolder, removeSubfolder } from '../lib/subfolders';
import { createZip, dataUrlToBytes, type ZipEntry } from '../lib/zip';

// Filter sentinels for the subfolder view within a pack.
const ALL_SUB = '__all__';
const UNFILED = '__unfiled__';

// File extension for a downloaded image, from its blob MIME type.
function extForImage(type: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif',
  };
  return map[type] || 'jpg';
}

// Filesystem-safe slug for a pack name, used as the zip filename.
function packSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'library';
}

// Re-encode an image blob through a canvas so the output carries NO metadata —
// EXIF, XMP, GPS, and embedded provenance chunks (C2PA / "Content Credentials",
// i.e. the AI label that Gemini/Imagen and others stamp on generated images) are
// all dropped, because the canvas is redrawn from raw pixels into a brand-new
// file. Drawing from an object URL of the blob we already fetched avoids any
// cross-origin canvas tainting. Returns clean bytes plus the matching extension.
// PNGs stay lossless PNG; everything else becomes high-quality JPEG.
async function stripBlobMetadata(blob: Blob): Promise<{ bytes: Uint8Array; ext: string }> {
  const isPng = blob.type === 'image/png';
  const objUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not load image for cleaning.'));
      el.src = objUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const type = isPng ? 'image/png' : 'image/jpeg';
    const dataUrl = canvas.toDataURL(type, isPng ? undefined : 0.95);
    return { bytes: dataUrlToBytes(dataUrl), ext: isPng ? 'png' : 'jpg' };
  } finally {
    URL.revokeObjectURL(objUrl);
  }
}

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
  pinterestActor: string;
}

// Sentinel for "create a new pack" in the upload target picker.
const NEW_PACK = '__new__';

export function LibraryView({ hasApify, pinterestActor }: LibraryViewProps) {
  const [images, setImages] = useState<LibraryImage[] | null>(null);
  const [searches, setSearches] = useState('');
  const [count, setCount] = useState(40);
  const [scraping, setScraping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [uploadTarget, setUploadTarget] = useState(NEW_PACK);
  const [uploadPack, setUploadPack] = useState('My Uploads');
  const [uploading, setUploading] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(() => getHiddenPacks());
  const [downloading, setDownloading] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Which subfolder is being viewed per pack (ALL_SUB default), the new-subfolder
  // input text per pack, and the drop target currently hovered ("pack::bin").
  const [viewSub, setViewSub] = useState<Record<string, string>>({});
  const [newSub, setNewSub] = useState<Record<string, string>>({});
  const [addingSub, setAddingSub] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  // Show every pack here (including hidden ones) so they can be un-hidden.
  const load = () => getMergedLibrary(true).then(setImages).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const toggleHidden = (pack: string) => {
    const next = !hidden.has(pack);
    setPackHidden(pack, next);
    setHidden(getHiddenPacks());
  };

  const scrape = async () => {
    setError(null);
    setNote(null);
    setScraping(true);
    try {
      // Pinterest searches are comma-separated phrases (each can contain spaces).
      const queries = searches.split(',').map((s) => s.trim()).filter(Boolean);
      const r = await scrapePinterest(queries, count, pinterestActor);
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

  // Assign a dragged image to a subfolder (or Unfiled with null), then refresh.
  const assignSub = async (id: string, subfolder: string | null) => {
    await setImageSubfolder(id, subfolder);
    await load();
  };

  // Create a subfolder in a pack from the inline input.
  const createSub = (pack: string) => {
    const name = (newSub[pack] || '').trim();
    if (!name) return;
    addSubfolder(pack, name);
    setNewSub((m) => ({ ...m, [pack]: '' }));
    setAddingSub(null);
    setViewSub((m) => ({ ...m, [pack]: name }));
    // Registry lives in localStorage; a reload isn't needed for it, but images
    // may need re-grouping, so refresh the view state.
    setImages((imgs) => (imgs ? [...imgs] : imgs));
  };

  // Delete a subfolder: move its images back to Unfiled, drop the registry name.
  const deleteSub = async (pack: string, name: string) => {
    await moveSubfolderImages(pack, name, null);
    removeSubfolder(pack, name);
    setViewSub((m) => ({ ...m, [pack]: ALL_SUB }));
    await load();
  };

  // Zip every image in a pack (fetched as bytes — works for bundled paths,
  // scraped/uploaded blob URLs and inline data URLs alike) and save it. Each
  // image is re-encoded through a canvas first, which strips ALL metadata —
  // including the C2PA "Content Credentials" AI label — from the exported files.
  const downloadPack = async (pack: string, imgs: LibraryImage[]) => {
    if (!imgs.length || downloading) return;
    setError(null);
    setNote(null);
    setDownloading(pack);
    try {
      const pad = String(imgs.length).length;
      const entries: ZipEntry[] = [];
      for (let i = 0; i < imgs.length; i++) {
        const res = await fetch(imgs[i].url);
        if (!res.ok) throw new Error(`Could not fetch image ${i + 1} of ${imgs.length}`);
        const blob = await res.blob();
        // Re-encode to drop metadata (incl. the AI label); fall back to the raw
        // bytes if a re-encode fails (e.g. an unsupported/broken image).
        let data: Uint8Array;
        let ext: string;
        try {
          const cleaned = await stripBlobMetadata(blob);
          data = cleaned.bytes;
          ext = cleaned.ext;
        } catch {
          data = new Uint8Array(await blob.arrayBuffer());
          ext = extForImage(blob.type);
        }
        const name = `${String(i + 1).padStart(pad, '0')}.${ext}`;
        entries.push({ name, data });
      }
      const url = URL.createObjectURL(createZip(entries));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${packSlug(pack)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDownloading(null);
    }
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
              groups.map(([pack, imgs]) => {
                const isHidden = hidden.has(pack);
                // Subfolders exist only for the user's own (local) images — the
                // bundled aesthetic packs are read-only and can't be re-organised.
                const isLocal = imgs.some((i) => i.source !== 'bundled');
                const present = new Set<string>();
                for (const i of imgs) if (i.subfolder) present.add(i.subfolder);
                const subNames = [...new Set([...getSubfolders(pack), ...present])].sort((a, b) => a.localeCompare(b));
                const view = viewSub[pack] || ALL_SUB;
                const shown = imgs.filter((i) => {
                  if (view === ALL_SUB) return true;
                  if (view === UNFILED) return !i.subfolder;
                  return i.subfolder === view;
                });
                const binCount = (bin: string) =>
                  bin === ALL_SUB ? imgs.length
                  : bin === UNFILED ? imgs.filter((i) => !i.subfolder).length
                  : imgs.filter((i) => i.subfolder === bin).length;

                // A subfolder chip that doubles as a filter and a drop target.
                const dropProps = (bin: string) => ({
                  onDragOver: (e: DragEvent) => { e.preventDefault(); setDragOver(`${pack}::${bin}`); },
                  onDragLeave: () => setDragOver((d) => (d === `${pack}::${bin}` ? null : d)),
                  onDrop: (e: DragEvent) => {
                    e.preventDefault();
                    setDragOver(null);
                    const id = e.dataTransfer.getData('text/plain');
                    if (id) assignSub(id, bin === UNFILED ? null : bin);
                  },
                });
                const chipCls = (bin: string, active: boolean) =>
                  `px-2 h-6 rounded-full border text-[11px] leading-none flex items-center gap-1 transition-colors ${
                    dragOver === `${pack}::${bin}` ? 'border-ink ring-2 ring-ink bg-raised'
                    : active ? 'border-ink bg-ink text-bg'
                    : 'border-line text-ink-5 hover:border-line-2'
                  }`;

                return (
                <div key={pack}>
                  <div className="flex items-baseline gap-3 mb-3">
                    <h2 className="text-[13px] font-semibold text-ink uppercase tracking-widest">{pack}</h2>
                    <span className="text-[11px] text-ink-6">{imgs.length}</span>
                    <button
                      onClick={() => downloadPack(pack, imgs)}
                      disabled={downloading !== null || !imgs.length}
                      className="flex items-center gap-1 text-[11px] text-ink-5 hover:text-ink transition-colors disabled:opacity-50"
                      title="Download this photo library as a zip"
                    >
                      {downloading === pack
                        ? <Loader2 size={13} className="animate-spin" />
                        : <Download size={13} />}
                      {downloading === pack ? 'Zipping…' : 'Download'}
                    </button>
                    {isHidden && <span className="text-[10px] text-ink-6 uppercase tracking-wider">Hidden</span>}
                    <button
                      onClick={() => toggleHidden(pack)}
                      className="ml-auto flex items-center gap-1 text-[11px] text-ink-5 hover:text-ink transition-colors"
                      title={isHidden ? 'Show this pack in generation' : 'Hide this pack from generation'}
                    >
                      {isHidden ? <Eye size={13} /> : <EyeOff size={13} />}
                      {isHidden ? 'Show' : 'Hide'}
                    </button>
                  </div>

                  {/* Subfolder bar — filter + drag-and-drop targets (local packs only) */}
                  {isLocal && (
                    <div className="flex flex-wrap items-center gap-1.5 mb-3">
                      <button
                        onClick={() => setViewSub((m) => ({ ...m, [pack]: ALL_SUB }))}
                        className={chipCls('__filter_all__', view === ALL_SUB)}
                        title="Show every image in this pack"
                      >
                        All <span className={view === ALL_SUB ? 'text-bg/70' : 'text-ink-6'}>{binCount(ALL_SUB)}</span>
                      </button>
                      <button
                        onClick={() => setViewSub((m) => ({ ...m, [pack]: UNFILED }))}
                        {...dropProps(UNFILED)}
                        className={chipCls(UNFILED, view === UNFILED)}
                        title="Images not in any subfolder — drop here to remove from a subfolder"
                      >
                        Unfiled <span className={view === UNFILED ? 'text-bg/70' : 'text-ink-6'}>{binCount(UNFILED)}</span>
                      </button>
                      {subNames.map((sub) => (
                        <div
                          key={sub}
                          role="button"
                          tabIndex={0}
                          onClick={() => setViewSub((m) => ({ ...m, [pack]: sub }))}
                          {...dropProps(sub)}
                          className={`${chipCls(sub, view === sub)} cursor-pointer`}
                          title={`Drop images here to move them into "${sub}"`}
                        >
                          {sub} <span className={view === sub ? 'text-bg/70' : 'text-ink-6'}>{binCount(sub)}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteSub(pack, sub); }}
                            aria-label={`Delete subfolder ${sub}`}
                            className="ml-0.5 -mr-0.5 hover:opacity-70"
                            title="Delete subfolder (images move back to Unfiled)"
                          >
                            <X size={11} />
                          </button>
                        </div>
                      ))}
                      {addingSub === pack ? (
                        <input
                          autoFocus
                          value={newSub[pack] || ''}
                          onChange={(e) => setNewSub((m) => ({ ...m, [pack]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter') createSub(pack); if (e.key === 'Escape') setAddingSub(null); }}
                          onBlur={() => (newSub[pack]?.trim() ? createSub(pack) : setAddingSub(null))}
                          placeholder="e.g. gym"
                          className="h-6 w-24 bg-card border border-line rounded-full px-2.5 text-[11px] text-ink placeholder:text-ink-6 outline-none focus:border-ink-7"
                        />
                      ) : (
                        <button
                          onClick={() => setAddingSub(pack)}
                          className="px-2 h-6 rounded-full border border-dashed border-line text-[11px] leading-none flex items-center gap-1 text-ink-5 hover:text-ink hover:border-line-2 transition-colors"
                          title="Create a subfolder in this pack"
                        >
                          <FolderPlus size={12} /> Subfolder
                        </button>
                      )}
                    </div>
                  )}

                  <div className={`grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2 ${isHidden ? 'opacity-40' : ''}`}>
                    {shown.map((img) => (
                      <div
                        key={img.id}
                        draggable={img.source !== 'bundled'}
                        onDragStart={(e) => { e.dataTransfer.setData('text/plain', img.id); e.dataTransfer.effectAllowed = 'move'; }}
                        className={`group relative aspect-[9/16] rounded-lg overflow-hidden bg-raised ${img.source !== 'bundled' ? 'cursor-grab active:cursor-grabbing' : ''}`}
                      >
                        <img src={img.url} alt="" loading="lazy" className="w-full h-full object-cover pointer-events-none" />
                        {view === ALL_SUB && img.subfolder && (
                          <span className="absolute bottom-1 left-1 max-w-[calc(100%-8px)] truncate px-1.5 py-0.5 rounded bg-black/60 text-white text-[9px] leading-none">
                            {img.subfolder}
                          </span>
                        )}
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
                    {!shown.length && (
                      <div className="col-span-full text-[12px] text-ink-6 py-6 text-center">
                        {view === UNFILED ? 'Every image is in a subfolder.' : 'No images here yet — drag some onto this subfolder.'}
                      </div>
                    )}
                  </div>
                </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </>
  );
}
