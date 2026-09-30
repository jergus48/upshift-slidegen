import { useState, type ReactNode } from 'react';
import { Check, FolderTree } from 'lucide-react';
import type { Character } from '../lib/characters';
import { characterPack, FORMAT_LABEL, missingFor, poolsFor, ROLES, type CapcutFormat } from '../lib/capcutFormats';
import { getSubfolders } from '../lib/subfolders';
import type { LibraryImage } from '../types';

// The Video tab's setup checklist: pick a character and every box is ticked
// off the Library live — what's set up right, what's missing, what's misnamed.
export function CharacterSetupChecklist({
  characters,
  library,
  formats,
}: {
  characters: Character[];
  library: LibraryImage[];
  formats: CapcutFormat[];
}) {
  // Anything that could be a character: every character, plus every uploaded
  // pack with subfolders — a folder can be uploaded before its character exists.
  const packs = [...new Set(library.filter((i) => i.subfolder).map((i) => i.pack))];
  const norm = (x: string) => x.trim().toLowerCase();
  const names = [
    ...characters.map((x) => x.name),
    ...packs.filter((p) => !characters.some((x) => norm(x.name) === norm(p))),
  ];
  const [picked, setPicked] = useState('');
  const name = names.find((n) => n === picked) ?? names[0];

  if (!name) {
    return (
      <div className="space-y-2">
        <Title />
        <Row ok={false} label="Upload a character's folder in the Library" hint="Library → Upload a folder" />
      </div>
    );
  }
  const character = characters.find((x) => norm(x.name) === norm(name));
  const c = character ?? ({ name } as Character);

  const pack = characterPack(c, library);
  const pools = poolsFor(c, library);
  const packFiles = pack ? library.filter((i) => i.pack === pack) : [];
  // Subfolders that aren't placeholder names — almost always a typo.
  const stray = [
    ...new Set([
      ...(pack ? getSubfolders(pack) : []),
      ...packFiles.map((i) => i.subfolder).filter((x): x is string => Boolean(x)),
    ]),
  ].filter((s) => !ROLES.some((r) => r === s.trim().toLowerCase()));
  const unfiled = packFiles.filter((i) => !i.subfolder).length;
  const kinds = [...new Set(formats.map((f) => f.format))];

  return (
    <div className="space-y-3">
      <Title />
      <select
        value={name}
        onChange={(e) => setPicked(e.target.value)}
        className="w-full h-8 bg-bg border border-line rounded-lg px-2 text-[12px] text-ink outline-none"
      >
        {names.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>

      <div className="space-y-1.5">
        <Row
          ok={Boolean(character)}
          label={
            <>
              Character <b>{name}</b> in the Characters tab
            </>
          }
          hint={character ? undefined : 'add it there with exactly this name'}
        />
        <Row
          ok={Boolean(pack)}
          label={
            <>
              Library pack named <b>{c.name}</b>
            </>
          }
          hint={
            pack
              ? `${packFiles.length} file${packFiles.length === 1 ? '' : 's'}`
              : 'Library → Upload a folder — the folder named exactly like the character'
          }
        />
        {ROLES.map((r) => {
          const list = pools[r] || [];
          const clips = r.startsWith('clip_');
          const photos = clips && list.some((i) => i.kind !== 'video');
          return (
            <Row
              key={r}
              ok={list.length > 0 && !photos}
              warn={photos}
              label={<code className="text-[11px]">{r}/</code>}
              hint={
                list.length
                  ? `${list.length} file${list.length === 1 ? '' : 's'}${photos ? ' — photos here, clips expected' : ''}`
                  : clips
                    ? 'empty — add 9:16 clips'
                    : 'empty — add a screenshot or a short clip'
              }
            />
          );
        })}
        {stray.length > 0 && (
          <Row ok={false} warn label="Unknown subfolders" hint={`${stray.join(', ')} — rename to one of the names above`} />
        )}
        {unfiled > 0 && (
          <Row ok={false} warn label="Files outside a subfolder" hint={`${unfiled} — not used by any format`} />
        )}
      </div>

      {kinds.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-line">
          <div className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold">Ready for</div>
          {kinds.map((k) => {
            const miss = missingFor(formats.find((x) => x.format === k)!, pools);
            const songs = formats.filter((x) => x.format === k).length;
            return (
              <Row
                key={k}
                ok={miss.length === 0}
                label={FORMAT_LABEL[k] ?? k}
                hint={miss.length ? `needs ${miss.join(', ')}` : `${songs} song${songs === 1 ? '' : 's'}`}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function Title() {
  return (
    <h2 className="flex items-center gap-1.5 text-[11px] text-ink-5 uppercase tracking-widest font-semibold">
      <FolderTree size={12} /> Character setup
    </h2>
  );
}

function Row({ ok, warn, label, hint }: { ok: boolean; warn?: boolean; label: ReactNode; hint?: string }) {
  return (
    <div className="flex items-start gap-2">
      <span
        className={`mt-0.5 w-4 h-4 shrink-0 rounded border flex items-center justify-center ${
          ok ? 'bg-emerald-600 border-emerald-600 text-white' : warn ? 'border-amber-500' : 'border-line-2'
        }`}
      >
        {ok && <Check size={11} strokeWidth={3} />}
      </span>
      <div className="min-w-0">
        <div className="text-[12px] text-ink-2">{label}</div>
        {hint && <div className={`text-[11px] ${warn ? 'text-amber-600' : 'text-ink-6'}`}>{hint}</div>}
      </div>
    </div>
  );
}
