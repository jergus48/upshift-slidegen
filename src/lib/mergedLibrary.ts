// Combines the server's bundled aesthetic packs with the browser's own
// scraped/uploaded images into one list — every UI that shows "the library"
// (Library view, pack pickers, per-slide background swaps) should go through
// this rather than calling getLibrary()/getPacks() directly. Pack grouping is
// always recomputed from the merged image list (not the server's own
// getPacks()) so local images land in the right group with correct covers.
import type { LibraryImage, LibraryPack } from '../types';
import { getLibrary } from './api';
import { listLocalImages } from './localLibrary';

export async function getMergedLibrary(): Promise<LibraryImage[]> {
  const [bundled, local] = await Promise.all([getLibrary(), listLocalImages()]);
  return [...local, ...bundled]; // local (newest) first, bundled packs after
}

export async function getMergedPacks(): Promise<LibraryPack[]> {
  const images = await getMergedLibrary();
  const map = new Map<string, LibraryPack>();
  for (const img of images) {
    if (!map.has(img.pack)) map.set(img.pack, { name: img.pack, source: img.source, count: 0, covers: [] });
    const p = map.get(img.pack)!;
    p.count++;
    if (p.covers.length < 4) p.covers.push(img.url);
  }
  return [...map.values()];
}
