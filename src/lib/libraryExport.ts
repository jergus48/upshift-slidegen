// Zipping library material for download.
//
// Everything that exports photos/clips out of the library goes through here, so
// a download always unzips into the SAME tree the app shows: a folder per pack,
// a folder per subfolder inside it, and (for a character export) a folder per
// package role on top. Photos are re-encoded through a canvas on the way out,
// which strips every scrap of metadata — EXIF, XMP, GPS and the C2PA "Content
// Credentials" AI label. Clips are copied byte-for-byte: a canvas can't read a
// video, and re-encoding one in the browser isn't on the table anyway.
import type { LibraryImage } from '../types';
import { createZip, dataUrlToBytes, type ZipEntry } from './zip';

// Where loose images go when their pack uses subfolders, so they never sit in
// the pack root next to the folders.
export const UNFILED_DIR = 'Unfiled';

// File extension from a blob's MIME type. Clips matter as much as photos here:
// an .mp4 written out as .jpg (what an image-only map returns for every video
// type) won't open in anything.
export function extForBlob(type: string, kind: 'image' | 'video'): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/x-m4v': 'm4v',
    'video/webm': 'webm',
    'video/x-matroska': 'mkv',
    'video/mpeg': 'mpeg',
    'video/ogg': 'ogv',
  };
  return map[(type || '').toLowerCase().split(';')[0]] || (kind === 'video' ? 'mp4' : 'jpg');
}

// Filesystem-safe slug for the zip's own filename.
export function fileSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'library';
}

// One path segment inside the zip. Folder names are kept as they read in the
// app (pack name, subfolder name, character name) — only characters a
// filesystem can't hold are swapped out, so the unzipped tree mirrors Slidegen.
export function folderName(name: string): string {
  return (
    name
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
      .replace(/^\.+/, '')
      .replace(/[. ]+$/, '')
      .trim()
      .slice(0, 60) || 'Unnamed'
  );
}

// Re-encode an image blob through a canvas so the output carries NO metadata.
// Drawing from an object URL of the blob we already fetched avoids any
// cross-origin canvas tainting. PNGs stay lossless PNG; the rest become JPEG.
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

// Fetch one library item and turn it into bytes plus the extension it should
// be written under.
async function fetchItem(img: LibraryImage): Promise<{ data: Uint8Array; ext: string }> {
  const res = await fetch(img.url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const kind: 'image' | 'video' =
    img.kind === 'video' || (blob.type || '').toLowerCase().startsWith('video/') ? 'video' : 'image';
  if (kind === 'video') {
    return { data: new Uint8Array(await blob.arrayBuffer()), ext: extForBlob(blob.type, 'video') };
  }
  try {
    const cleaned = await stripBlobMetadata(blob);
    return { data: cleaned.bytes, ext: cleaned.ext };
  } catch {
    // An unsupported/broken image still ships — as its original bytes.
    return { data: new Uint8Array(await blob.arrayBuffer()), ext: extForBlob(blob.type, 'image') };
  }
}

// A slice of the library to write under one path prefix (e.g. a character's
// "Before" package, or a whole pack).
export interface ExportGroup {
  // Path segments the group's files live under, already in display form — they
  // are made filesystem-safe here.
  path: string[];
  images: LibraryImage[];
}

export interface ExportResult {
  blob: Blob;
  written: number;
  // Items that couldn't be read, named by folder and position.
  failed: string[];
}

// Build the archive. Files are numbered within their own folder, so every
// folder reads 01, 02, … — and one unreadable item is skipped and named rather
// than aborting the whole zip.
export async function buildLibraryZip(groups: ExportGroup[]): Promise<ExportResult> {
  // Folder path -> the images landing directly in it, in order.
  const byDir = new Map<string, LibraryImage[]>();
  const seen = new Set<string>(); // dir + image id, so one image isn't written twice
  for (const g of groups) {
    const prefix = g.path.map(folderName);
    const usesSubfolders = g.images.some((i) => i.subfolder);
    for (const img of g.images) {
      const dir = [...prefix, ...(usesSubfolders ? [folderName(img.subfolder || UNFILED_DIR)] : [])].join('/');
      const key = `${dir}\u0000${img.id}`;
      if (seen.has(key)) continue; // a pack picked alongside one of its own subfolders
      seen.add(key);
      if (!byDir.has(dir)) byDir.set(dir, []);
      byDir.get(dir)!.push(img);
    }
  }

  const entries: ZipEntry[] = [];
  const failed: string[] = [];
  for (const [dir, list] of byDir) {
    const pad = String(list.length).length;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      try {
        const { data, ext } = await fetchItem(list[i]);
        n++;
        const file = `${String(n).padStart(pad, '0')}.${ext}`;
        entries.push({ name: dir ? `${dir}/${file}` : file, data });
      } catch (e) {
        failed.push(`${dir || '.'}/#${i + 1} (${e instanceof Error ? e.message : String(e)})`);
      }
    }
  }
  if (!entries.length) throw new Error('Nothing here could be read.');
  return { blob: createZip(entries), written: entries.length, failed };
}

// Hand a built archive to the browser as a download.
export function saveZip(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
