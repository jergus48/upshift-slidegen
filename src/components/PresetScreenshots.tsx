import { useEffect, useRef, useState } from 'react';
import { Upload, X, Loader2, Image as ImageIcon } from 'lucide-react';
import { getQuitPresets, GENDERS, type Gender } from '../lib/quitPresets';
import { getAppShots, setAppShot, clearAppShot, subscribeAppShots } from '../lib/presetScreenshots';
import { resolveImageSrc } from '../lib/imageSrc';

interface PresetScreenshotsProps {
  // Which presets to show screenshot slots for (the ones picked in the modal).
  presetKeys: string[];
  disabled?: boolean;
}

// Per-preset, per-gender app-slide screenshot uploader. For each chosen preset it
// shows a Men slot and a Women slot; the uploaded image lands on that preset's
// app ("Upshift") slide for that gender, overriding the random POV shot.
export function PresetScreenshots({ presetKeys, disabled }: PresetScreenshotsProps) {
  // Preset metadata is gender-agnostic for label lookup; use men's catalog.
  const catalog = getQuitPresets('men');
  const labelFor = (key: string) => catalog.find((p) => p.key === key)?.label ?? key;
  const [, force] = useState(0);
  useEffect(() => subscribeAppShots(() => force((n) => n + 1)), []);

  if (!presetKeys.length) return null;

  return (
    <div className="rounded-lg border border-line divide-y divide-line">
      {presetKeys.map((key) => (
        <div key={key} className="flex items-center gap-3 px-3 py-2">
          <span className="text-[12px] text-ink truncate flex-1 min-w-0">{labelFor(key)}</span>
          <div className="flex items-center gap-2 shrink-0">
            {GENDERS.map((g) => (
              <ShotSlot key={g.key} presetKey={key} gender={g.key} label={g.label} disabled={disabled} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ShotSlot({
  presetKey,
  gender,
  label,
  disabled,
}: {
  presetKey: string;
  gender: Gender;
  label: string;
  disabled?: boolean;
}) {
  const ref = getAppShots()[`${presetKey}:${gender}`];
  // Bundled defaults (`/app-shots/…`) ship with the build and can't be removed
  // from the UI — only a screenshot uploaded in this browser can.
  const uploaded = !!ref && ref.startsWith('local:');
  const [src, setSrc] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    if (!ref) {
      setSrc(undefined);
      return;
    }
    resolveImageSrc(ref).then((s) => alive && setSrc(s));
    return () => {
      alive = false;
    };
  }, [ref]);

  const pick = () => inputRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
      });
      await setAppShot(presetKey, gender, dataUrl);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await clearAppShot(presetKey, gender);
  };

  return (
    <div className="relative">
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      <button
        type="button"
        onClick={pick}
        disabled={disabled || busy}
        title={src ? `${label} screenshot${uploaded ? '' : ' (default)'} — click to replace` : `Upload ${label} app-slide screenshot`}
        className={`group relative w-11 h-16 rounded-md border overflow-hidden flex flex-col items-center justify-center transition-colors disabled:opacity-50 ${
          src ? 'border-ink' : 'border-dashed border-line hover:border-line-2'
        }`}
      >
        {busy ? (
          <Loader2 size={13} className="animate-spin text-ink-5" />
        ) : src ? (
          <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <>
            <Upload size={12} className="text-ink-6" />
            <span className="text-[9px] text-ink-6 mt-0.5">{label}</span>
          </>
        )}
        {src && (
          <span className="absolute bottom-0 inset-x-0 bg-black/55 text-[8px] text-white text-center leading-tight py-px flex items-center justify-center gap-0.5">
            <ImageIcon size={8} /> {label}
          </span>
        )}
      </button>
      {src && uploaded && !busy && (
        <button
          type="button"
          onClick={remove}
          disabled={disabled}
          title={`Remove ${label} screenshot`}
          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-card border border-line flex items-center justify-center text-ink-5 hover:text-ink shadow-sm"
        >
          <X size={10} />
        </button>
      )}
    </div>
  );
}
