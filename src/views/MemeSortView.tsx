import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ViewHeader } from '../components/ViewHeader';
import { deleteMemeImages, getLibrary, getMemeSort, saveMemeSort } from '../lib/api';
import { SORT_MODES, SORT_PACKS, defaultMode, modeOfImage, pathOfUrl } from '../lib/memeSort';
import type { LibraryImage } from '../types';

const PACK_BADGE: Record<string, string> = { 'meme-modes': 'M', 'monkey-memes': '🐒', 'spongebob-memes': 'S' };

export function MemeSortView() {
  const [images, setImages] = useState<LibraryImage[] | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [packFilter, setPackFilter] = useState<string>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([getLibrary(), getMemeSort()])
      .then(([lib, sort]) => {
        if (!alive) return;
        setImages(lib.filter((i) => SORT_PACKS.some((p) => i.url.includes(`/library/${p.slug}/`))));
        setOverrides(sort.overrides || {});
      })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, []);

  const visible = useMemo(
    () => (images ?? []).filter((i) => packFilter === 'all' || i.url.includes(`/library/${packFilter}/`)),
    [images, packFilter],
  );

  const columns = useMemo(() => {
    const map = new Map<string, LibraryImage[]>();
    for (const m of SORT_MODES) map.set(m.key, []);
    map.set('unsorted', []);
    for (const img of visible) {
      const k = modeOfImage(img.url, overrides);
      (map.get(k) ?? map.get('unsorted')!).push(img);
    }
    return map;
  }, [visible, overrides]);

  // Moves pictures into a mode (only the differences from the file-name guess are saved).
  const move = (urls: string[], mode: string) => {
    setOverrides((cur) => {
      const next = { ...cur };
      for (const u of urls) {
        const p = pathOfUrl(u);
        if (defaultMode(p) === mode) delete next[p];
        else next[p] = mode;
      }
      saveMemeSort(next).catch((e) => setError(e instanceof Error ? e.message : String(e)));
      return next;
    });
    setSelected(new Set());
  };

  // Permanent delete: the files, their manifest entries and their saved sorting.
  const destroy = async (urls: string[]) => {
    if (!urls.length) return;
    if (!window.confirm(`Delete ${urls.length} picture${urls.length === 1 ? '' : 's'} forever? The files are removed and cannot be restored.`)) return;
    try {
      const { deleted } = await deleteMemeImages(urls.map(pathOfUrl));
      const gone = new Set(deleted);
      setImages((cur) => (cur ?? []).filter((i) => !gone.has(pathOfUrl(i.url))));
      setOverrides((cur) => {
        const next = { ...cur };
        for (const k of gone) delete next[k];
        return next;
      });
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const toggle = (url: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });

  const onDrop = (mode: string, e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    const url = e.dataTransfer.getData('text/plain');
    if (!url) return;
    move(selected.has(url) ? [...selected] : [url], mode);
  };

  const sections = [...SORT_MODES, { key: 'unsorted', label: 'UNSORTED (no mode yet)' }];

  return (
    <>
      <ViewHeader
        title="Sort Memes"
        subtitle="Every meme, monkey and spongebob picture by mode. Drag a picture onto another mode (or click pictures to select several, then use the Move bar). Trash = never used. Changes save instantly and apply to new decks."
      />
      <div className="flex-1 overflow-y-auto p-4 sm:p-8">
        {!images && !error && <div className="h-40 grid place-items-center text-ink-6"><Loader2 size={16} className="animate-spin" /></div>}
        {error && <p className="text-[12px] text-red-600 mb-3">{error}</p>}
        {images && (
          <div className="max-w-6xl mx-auto space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {[{ slug: 'all', label: 'All' }, ...SORT_PACKS].map((p) => (
                <button
                  key={p.slug}
                  onClick={() => setPackFilter(p.slug)}
                  className={`h-8 px-3 rounded-lg border text-[12px] font-medium ${packFilter === p.slug ? 'border-ink bg-ink text-bg' : 'border-line bg-card text-ink-5 hover:border-line-2'}`}
                >
                  {p.label}
                </button>
              ))}
              <span className="text-[11px] text-ink-6 ml-1">{visible.length} pictures</span>
            </div>

            {/* Always-visible drop bar: drag a picture onto any mode (no matter how far down it is),
                or select pictures and click a mode. With nothing selected a click jumps to that section. */}
            <div className="sticky top-0 z-20 bg-bg/95 backdrop-blur border border-line rounded-xl p-2.5 shadow-sm">
              <div className="flex items-center gap-2 mb-1.5 min-h-[18px]">
                <span className="text-[12px] font-medium text-ink">
                  {selected.size > 0 ? `${selected.size} selected: click a mode to move them` : 'Drag a picture onto a mode here, or click a mode to jump to it'}
                </span>
                {selected.size > 0 && (
                  <>
                    <button onClick={() => destroy([...selected])} className="text-[11px] text-red-600 underline ml-auto">delete forever</button>
                    <button onClick={() => setSelected(new Set())} className="text-[11px] text-ink-5 underline">clear</button>
                  </>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[...SORT_MODES, { key: 'unsorted', label: 'UNSORTED' }].map((m) => (
                  <button
                    key={m.key}
                    onClick={() => {
                      if (selected.size > 0) { if (m.key !== 'unsorted') move([...selected], m.key); }
                      else document.getElementById(`sort-${m.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(`bar-${m.key}`); }}
                    onDragLeave={() => setDragOver((d) => (d === `bar-${m.key}` ? null : d))}
                    onDrop={(e) => { if (m.key !== 'unsorted') onDrop(m.key, e); else setDragOver(null); }}
                    className={`h-8 px-2.5 rounded-md border text-[11px] font-medium ${dragOver === `bar-${m.key}` ? 'border-ink bg-ink text-bg' : 'border-line bg-card text-ink-3 hover:border-ink'}`}
                  >
                    {m.label} <span className="opacity-60">{(columns.get(m.key) ?? []).length}</span>
                  </button>
                ))}
              </div>
            </div>

            {sections.map((sec) => {
              const list = columns.get(sec.key) ?? [];
              if (sec.key === 'unsorted' && !list.length) return null;
              return (
                <div
                  key={sec.key}
                  id={`sort-${sec.key}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(sec.key); }}
                  onDragLeave={() => setDragOver((d) => (d === sec.key ? null : d))}
                  onDrop={(e) => onDrop(sec.key, e)}
                  style={{ scrollMarginTop: 110 }}
                  className={`rounded-xl border p-3 ${dragOver === sec.key ? 'border-ink bg-ink/5' : 'border-line bg-card'}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[12px] font-semibold text-ink tracking-wide">{sec.label}</span>
                    <span className="text-[11px] text-ink-6">{list.length}</span>
                    {sec.key === 'trash' && list.length > 0 && (
                      <button onClick={() => destroy(list.map((i) => i.url))} className="ml-auto h-7 px-2.5 rounded-md border border-red-300 text-[11px] font-medium text-red-600 hover:bg-red-50">
                        Delete all {list.length} forever
                      </button>
                    )}
                  </div>
                  {list.length === 0 ? (
                    <p className="text-[11px] text-ink-6">Drop pictures here.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {list.map((img) => {
                        const sel = selected.has(img.url);
                        return (
                          <button
                            key={img.url}
                            draggable
                            onDragStart={(e) => { e.dataTransfer.setData('text/plain', img.url); e.dataTransfer.effectAllowed = 'move'; }}
                            onClick={() => toggle(img.url)}
                            title={pathOfUrl(img.url)}
                            style={{ width: 84, height: 84, background: '#e9e9e9' }}
                            className={`relative rounded-md overflow-hidden border-2 ${sel ? 'border-ink' : 'border-transparent'}`}
                          >
                            <img src={img.url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'contain' }} draggable={false} />
                            <span className="absolute left-0.5 top-0.5 text-[9px] bg-black/60 text-white rounded px-1">
                              {PACK_BADGE[img.url.split('/')[2]] ?? ''}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
