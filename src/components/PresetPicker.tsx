import { useMemo } from 'react';
import { Check } from 'lucide-react';
import { getQuitPresets, type Gender, type QuitPreset } from '../lib/quitPresets';

interface PresetPickerProps {
  gender: Gender;
  // Selected preset keys. Empty = "all presets" (the random default).
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

// Lets you narrow generation to specific presets instead of drawing from the
// whole catalog at random — pick just one, a handful, or All. An empty
// selection means "all presets" (the original random-from-everything behavior).
export function PresetPicker({ gender, selected, onChange, disabled }: PresetPickerProps) {
  const presets = useMemo(() => getQuitPresets(gender), [gender]);
  // Group by family, preserving first-seen order.
  const groups = useMemo(() => {
    const map = new Map<string, QuitPreset[]>();
    for (const p of presets) {
      const fam = p.family || 'Other';
      if (!map.has(fam)) map.set(fam, []);
      map.get(fam)!.push(p);
    }
    return [...map.entries()];
  }, [presets]);

  const allKeys = presets.map((p) => p.key);
  const sel = new Set(selected);
  const toggle = (key: string) =>
    onChange(sel.has(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  const toggleGroup = (keys: string[]) => {
    const allOn = keys.every((k) => sel.has(k));
    onChange(allOn ? selected.filter((k) => !keys.includes(k)) : [...new Set([...selected, ...keys])]);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-ink-6">
          {sel.size ? `${sel.size} of ${allKeys.length} selected` : `All ${allKeys.length} presets`}
        </span>
        <div className="flex gap-2">
          <button onClick={() => onChange(allKeys)} disabled={disabled} className="text-[11px] text-ink-5 hover:text-ink disabled:opacity-50">All</button>
          <button onClick={() => onChange([])} disabled={disabled} className="text-[11px] text-ink-5 hover:text-ink disabled:opacity-50">None</button>
        </div>
      </div>

      <div className="max-h-56 overflow-y-auto rounded-lg border border-line divide-y divide-line">
        {groups.map(([family, items]) => {
          const keys = items.map((i) => i.key);
          const allOn = keys.every((k) => sel.has(k));
          return (
            <div key={family}>
              <button
                onClick={() => toggleGroup(keys)}
                disabled={disabled}
                className="w-full flex items-center justify-between px-3 py-1.5 bg-surface text-[10px] uppercase tracking-widest font-semibold text-ink-5 hover:text-ink disabled:opacity-50"
              >
                <span>{family}</span>
                <span className="text-ink-6 normal-case tracking-normal">{allOn ? 'Clear' : 'Select all'}</span>
              </button>
              {items.map((p) => {
                const on = sel.has(p.key);
                return (
                  <button
                    key={p.key}
                    onClick={() => toggle(p.key)}
                    disabled={disabled}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-raised transition-colors disabled:opacity-50"
                  >
                    <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? 'bg-ink border-ink text-bg' : 'border-line'}`}>
                      {on && <Check size={11} />}
                    </span>
                    <span className={`text-[12px] truncate ${on ? 'text-ink' : 'text-ink-5'}`}>{p.label}</span>
                    <span className="ml-auto text-[10px] text-ink-6 shrink-0">{p.slides} slides</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-ink-6 mt-1">
        Leave empty to draw from every preset at random. Pick specific ones to generate only from those.
      </p>
    </div>
  );
}
