import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import type { LibraryPack } from '../types';
import { getMergedPacks } from '../lib/mergedLibrary';
import { makeToken, parseToken } from '../lib/subfolders';

// "Pack / subfolder" for the single-choice summary line.
function subLabel(token: string): string {
  const { pack, subfolder } = parseToken(token);
  return subfolder ? `${pack} / ${subfolder}` : pack;
}

interface PackPickerProps {
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  // Single-choice mode: picking a pack (or subfolder) REPLACES the selection
  // instead of adding to it. Used by the Generate modal, where a leftover pack
  // from a previous batch silently mixed two personas into one run.
  single?: boolean;
}

// Aesthetic-pack picker with cover thumbnails. Used in the Generate modal and
// Settings. Packs are bundled (server) + scraped/uploaded (this browser's
// IndexedDB). Selection values are TOKENS (lib/subfolders.ts): a bare pack name
// selects the whole pack; a pack+subfolder token selects one subfolder. A pack
// with subfolders shows sub-chips under its tile so you can target e.g. just
// "gym" instead of the whole pack.
export function PackPicker({ selected, onChange, disabled, single }: PackPickerProps) {
  const [packs, setPacks] = useState<LibraryPack[] | null>(null);

  useEffect(() => {
    getMergedPacks().then(setPacks).catch(() => setPacks([]));
  }, []);

  const toggle = (token: string) => {
    if (selected.includes(token)) return onChange(selected.filter((x) => x !== token));
    onChange(single ? [token] : [...selected, token]);
  };

  // "All" selects every whole-pack token (not the subfolder tokens, which would
  // be redundant); "None" clears everything.
  const allTokens = (packs || []).map((p) => makeToken(p.name));
  const selectedCount = selected.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-ink-6">
          {selectedCount
            ? single
              ? subLabel(selected[0])
              : `${selectedCount} selected`
            : 'None — plain gradients'}
        </span>
        <div className="flex gap-2">
          {!single && (
            <button onClick={() => onChange(allTokens)} disabled={disabled} className="text-[11px] text-ink-5 hover:text-ink disabled:opacity-50">All</button>
          )}
          <button onClick={() => onChange([])} disabled={disabled} className="text-[11px] text-ink-5 hover:text-ink disabled:opacity-50">None</button>
        </div>
      </div>

      {packs === null ? (
        <div className="text-[12px] text-ink-5 py-6 text-center">Loading packs…</div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {packs.map((pack) => {
            const packToken = makeToken(pack.name);
            const on = selected.includes(packToken);
            const subs = pack.subfolders || [];
            return (
              <div key={pack.name} className="flex flex-col gap-1">
                <button
                  onClick={() => toggle(packToken)}
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

                {/* Subfolder chips — target a single subfolder instead of the pack */}
                {subs.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {subs.map((sub) => {
                      const subToken = makeToken(pack.name, sub.name);
                      const subOn = selected.includes(subToken);
                      return (
                        <button
                          key={sub.name}
                          onClick={() => toggle(subToken)}
                          disabled={disabled}
                          title={`Use only the "${sub.name}" subfolder (${sub.count} image${sub.count === 1 ? '' : 's'})`}
                          className={`px-1.5 h-5 rounded-full border text-[10px] leading-none flex items-center gap-1 transition-colors disabled:opacity-50 ${
                            subOn ? 'border-ink bg-ink text-bg' : 'border-line text-ink-5 hover:border-line-2'
                          }`}
                        >
                          {subOn && <Check size={9} />}
                          <span className="truncate max-w-[72px]">{sub.name}</span>
                          <span className={subOn ? 'text-bg/70' : 'text-ink-6'}>{sub.count}</span>
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
  );
}
