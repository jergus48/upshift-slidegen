import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import type { LibraryPack } from '../types';
import { getMergedPacks } from '../lib/mergedLibrary';

interface PackPickerProps {
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

// Aesthetic-pack picker with cover thumbnails. Used in the Generate modal and
// Settings. Packs are bundled (server) + scraped/uploaded (this browser's IndexedDB).
export function PackPicker({ selected, onChange, disabled }: PackPickerProps) {
  const [packs, setPacks] = useState<LibraryPack[] | null>(null);

  useEffect(() => {
    getMergedPacks().then(setPacks).catch(() => setPacks([]));
  }, []);

  const toggle = (name: string) =>
    onChange(selected.includes(name) ? selected.filter((x) => x !== name) : [...selected, name]);

  const allNames = (packs || []).map((p) => p.name);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-ink-6">
          {selected.length ? `${selected.length} of ${allNames.length} selected` : 'None — plain gradients'}
        </span>
        <div className="flex gap-2">
          <button onClick={() => onChange(allNames)} disabled={disabled} className="text-[11px] text-ink-5 hover:text-ink disabled:opacity-50">All</button>
          <button onClick={() => onChange([])} disabled={disabled} className="text-[11px] text-ink-5 hover:text-ink disabled:opacity-50">None</button>
        </div>
      </div>

      {packs === null ? (
        <div className="text-[12px] text-ink-5 py-6 text-center">Loading packs…</div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {packs.map((pack) => {
            const on = selected.includes(pack.name);
            return (
              <button
                key={pack.name}
                onClick={() => toggle(pack.name)}
                disabled={disabled}
                className={`relative rounded-lg overflow-hidden border text-left transition-all disabled:opacity-50 ${
                  on ? 'border-ink ring-2 ring-ink' : 'border-line hover:border-line-2'
                }`}
              >
                {/* 2×2 cover collage */}
                <div className="aspect-[4/5] grid grid-cols-2 grid-rows-2 bg-raised">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="overflow-hidden bg-raised">
                      {pack.covers[i] && (
                        <img src={pack.covers[i]} alt="" loading="lazy" className="w-full h-full object-cover" />
                      )}
                    </div>
                  ))}
                </div>
                {/* Name + count */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pt-5 pb-1.5">
                  <div className="text-[11px] font-semibold text-white truncate leading-tight">{pack.name}</div>
                  <div className="text-[10px] text-white/70">{pack.count} images</div>
                </div>
                {/* Selected check */}
                {on && (
                  <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-ink text-bg flex items-center justify-center">
                    <Check size={12} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
