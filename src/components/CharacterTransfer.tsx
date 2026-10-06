import { useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { Button } from './Button';
import type { Character } from '../lib/characters';
import type { LibraryImage } from '../types';
import { exportCharacter, importCharacter } from '../lib/characterTransfer';
import { saveZip } from '../lib/libraryExport';

// Copy a whole character (record, pack, subfolders, every clip and screenshot)
// out of this browser as one zip, and paste one into this browser.
export function CharacterTransfer({
  characters,
  library,
  onImported,
}: {
  characters: Character[];
  library: LibraryImage[];
  onImported: () => void;
}) {
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const chosen = characters.find((c) => c.id === (pick || characters[0]?.id));

  const doExport = async () => {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    setNote('Packing...');
    try {
      const { blob, filename, files } = await exportCharacter(chosen, library, (d, t) => setNote(`Packing ${d}/${t}...`));
      saveZip(blob, filename);
      setNote(`Saved ${filename} with ${files} file${files === 1 ? '' : 's'}.`);
    } catch (e) {
      setNote(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const doImport = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    const msgs: string[] = [];
    try {
      for (const f of [...files]) {
        setNote(`Importing ${f.name}...`);
        const r = await importCharacter(f, (d, t) => setNote(`Importing ${f.name}: ${d}/${t}...`));
        const extra = r.skipped.length ? `, ${r.skipped.length} skipped (${r.skipped[0]})` : '';
        msgs.push(`${r.name}: ${r.added} file${r.added === 1 ? '' : 's'} added${r.existed ? ' to the existing character' : ''}${extra}`);
      }
      setNote(msgs.join(' | '));
      onImported();
    } catch (e) {
      setNote(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <div className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold">Move a character</div>
      <p className="text-[12px] text-ink-5">
        Characters live in this browser only. Export one to a zip (clips, screenshots, subfolders, settings), then import
        it in the other browser. Importing the same zip twice adds the files twice.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={chosen?.id || ''}
          onChange={(e) => setPick(e.target.value)}
          disabled={busy || !characters.length}
          className="h-8 bg-card border border-line rounded-lg px-2 text-[12px] text-ink"
        >
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <Button variant="secondary" size="sm" icon={<ArrowDownToLine size={12} />} onClick={doExport} disabled={busy || !chosen}>
          Export character
        </Button>
        <Button variant="secondary" size="sm" icon={<ArrowUpFromLine size={12} />} onClick={() => fileRef.current?.click()} disabled={busy}>
          Import character
        </Button>
        <input ref={fileRef} type="file" accept=".zip" multiple className="hidden" onChange={(e) => doImport(e.target.files)} />
      </div>
      {note && <p className="text-[12px] text-ink-3">{note}</p>}
      {error && <p className="text-[12px] text-red-500">{error}</p>}
    </div>
  );
}
