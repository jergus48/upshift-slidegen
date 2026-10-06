// Move a whole Video-tool character between browsers.
//
// Everything a character is lives in the browser it was made in: the record in
// localStorage, its pack's photos/clips in IndexedDB, the pack's subfolders in
// localStorage again. So a character does not follow you to another browser or
// profile. This bundles all of it into ONE zip - character.json plus the pack's
// files, each in its subfolder, byte for byte (clips are not re-encoded) - and
// reads such a zip back in on the other side.
//
// Pack names are what tie a character to its clips (the role folders are
// "<character>/clip_chopped" and so on), so the character and its pack keep the
// same name on import. Folder presets and server output paths are NOT carried:
// they point at one machine's folders.
import type { LibraryImage } from '../types';
import { addCharacter, getCharacters, setCharacterLook, setCharacterToken, type Character } from './characters';
import { addLocalFiles } from './localLibrary';
import { createZip, readZip, type ZipEntry } from './zip';
import { addSubfolder, getSubfolders } from './subfolders';
import { extForBlob, folderName, fileSlug } from './libraryExport';

const FORMAT = 'slidegen-character';
const UNFILED = '_unfiled';
const ROLE_KINDS = ['before', 'after', 'girlfriend', 'gym', 'video', 'statsIn', 'statsOut'] as const;

interface Manifest {
  format: typeof FORMAT;
  version: 1;
  name: string;
  skin: string;
  gender: string;
  tokens: Record<string, string[]>;
  subfolders: string[];
  files: number;
}

export type TransferProgress = (done: number, total: number) => void;

// Build the zip for one character. `library` is the merged library; only this
// browser's own uploads (id "local:...") are exported - bundled packs are the
// same in every browser.
export async function exportCharacter(
  character: Character,
  library: LibraryImage[],
  onProgress?: TransferProgress,
): Promise<{ blob: Blob; filename: string; files: number }> {
  const mine = library.filter((i) => i.pack === character.name && i.id.startsWith('local:'));
  const tokens: Record<string, string[]> = {};
  for (const kind of ROLE_KINDS) tokens[kind] = (character[`${kind}Token` as keyof Character] as string[]) || [];
  const entries: ZipEntry[] = [];
  const counters = new Map<string, number>();
  for (let i = 0; i < mine.length; i++) {
    const img = mine[i];
    const res = await fetch(img.url);
    if (!res.ok) throw new Error(`Could not read a file of "${character.name}" (HTTP ${res.status}).`);
    const blob = await res.blob();
    const kind = img.kind === 'video' || (blob.type || '').startsWith('video/') ? 'video' : 'image';
    const dir = folderName(img.subfolder || UNFILED);
    const n = (counters.get(dir) || 0) + 1;
    counters.set(dir, n);
    entries.push({
      name: `files/${dir}/${String(n).padStart(3, '0')}.${extForBlob(blob.type, kind)}`,
      data: new Uint8Array(await blob.arrayBuffer()),
    });
    onProgress?.(i + 1, mine.length);
  }
  const manifest: Manifest = {
    format: FORMAT,
    version: 1,
    name: character.name,
    skin: character.skin,
    gender: character.gender,
    tokens,
    subfolders: getSubfolders(character.name),
    files: entries.length,
  };
  entries.unshift({ name: 'character.json', data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) });
  return { blob: createZip(entries), filename: `${fileSlug(character.name)}.character.zip`, files: entries.length - 1 };
}

const MIME: Record<string, string> = {
  mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v', webm: 'video/webm', mkv: 'video/x-matroska',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif',
};

export interface ImportResult {
  name: string;
  added: number;
  skipped: string[];
  existed: boolean;
}

// Read a zip made by exportCharacter. A character with that name that is already
// here is kept (its tokens are left alone) and the files are added to its pack;
// files already present are not detected, so importing the same zip twice
// doubles the clips - the UI says so.
export async function importCharacter(file: File, onProgress?: TransferProgress): Promise<ImportResult> {
  const entries = await readZip(file);
  const head = entries.find((e) => e.name === 'character.json');
  if (!head) throw new Error('This zip has no character.json - it was not made by "Export character".');
  const manifest = JSON.parse(new TextDecoder().decode(await head.read())) as Manifest;
  if (manifest.format !== FORMAT) throw new Error('This zip is not a SlideGen character export.');

  let character = getCharacters().find((c) => c.name.toLowerCase() === manifest.name.toLowerCase());
  const existed = !!character;
  if (!character) {
    character = addCharacter(manifest.name);
    setCharacterLook(character.id, { skin: manifest.skin, gender: manifest.gender });
    for (const kind of ROLE_KINDS) {
      const t = manifest.tokens?.[kind];
      if (t?.length) setCharacterToken(character.id, kind, t);
    }
  }
  const pack = character.name;
  for (const s of manifest.subfolders || []) addSubfolder(pack, s);

  const media = entries.filter((e) => e.name.startsWith('files/'));
  const skipped: string[] = [];
  let added = 0;
  for (let i = 0; i < media.length; i++) {
    const e = media[i];
    const parts = e.name.split('/'); // files / <subfolder> / <file>
    const sub = parts[1] === UNFILED ? undefined : parts[1];
    if (sub) addSubfolder(pack, sub);
    const ext = (e.name.split('.').pop() || '').toLowerCase();
    const bytes = await e.read();
    const f = new File([bytes as BlobPart], parts[parts.length - 1], { type: MIME[ext] || '' });
    const res = await addLocalFiles(pack, [f], 'uploaded', () => sub);
    added += res.added.length;
    for (const s of res.skipped) skipped.push(`${e.name}: ${s.reason}`);
    onProgress?.(i + 1, media.length);
  }
  return { name: pack, added, skipped, existed };
}
