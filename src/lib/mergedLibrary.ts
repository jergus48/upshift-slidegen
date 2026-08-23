// Combines the server's bundled aesthetic packs with the browser's own
// scraped/uploaded images into one list — every UI that shows "the library"
// (Library view, pack pickers, per-slide background swaps) should go through
// this rather than calling getLibrary()/getPacks() directly. Pack grouping is
// always recomputed from the merged image list (not the server's own
// getPacks()) so local images land in the right group with correct covers.
import type { LibraryImage, LibraryPack } from '../types';
import { getLibrary } from './api';
import { listLocalImages } from './localLibrary';
import { getHiddenPacks } from './hiddenPacks';
import { getSubfolders } from './subfolders';

// `includeHidden` keeps user-hidden packs in the result — only the Library view
// (which offers a "Show" toggle) passes true. Everything that generates slides
// uses the default so hidden packs never contribute backgrounds.
export async function getMergedLibrary(includeHidden = false): Promise<LibraryImage[]> {
  const [bundled, local] = await Promise.all([getLibrary(), listLocalImages()]);
  const merged = [...local, ...bundled]; // local (newest) first, bundled packs after
  if (includeHidden) return merged;
  const hidden = getHiddenPacks();
  return merged.filter((img) => !hidden.has(img.pack));
}

export async function getMergedPacks(includeHidden = false): Promise<LibraryPack[]> {
  const images = await getMergedLibrary(includeHidden);
  const map = new Map<string, LibraryPack>();
  // Per-pack subfolder accumulators, keyed by subfolder name.
  const subAcc = new Map<string, Map<string, { count: number; covers: string[] }>>();
  const unfiled = new Map<string, number>();
  for (const img of images) {
    if (!map.has(img.pack)) {
      map.set(img.pack, { name: img.pack, source: img.source, count: 0, covers: [] });
      subAcc.set(img.pack, new Map());
      unfiled.set(img.pack, 0);
    }
    const p = map.get(img.pack)!;
    p.count++;
    if (p.covers.length < 4) p.covers.push(img.url);
    if (img.subfolder) {
      const subs = subAcc.get(img.pack)!;
      if (!subs.has(img.subfolder)) subs.set(img.subfolder, { count: 0, covers: [] });
      const s = subs.get(img.subfolder)!;
      s.count++;
      if (s.covers.length < 4) s.covers.push(img.url);
    } else {
      unfiled.set(img.pack, (unfiled.get(img.pack) || 0) + 1);
    }
  }
  // Merge in declared-but-empty subfolders from the registry so a freshly
  // created (still empty) subfolder still shows in the picker/library.
  for (const [name, pack] of map) {
    const subs = subAcc.get(name)!;
    for (const declared of getSubfolders(name)) {
      if (!subs.has(declared)) subs.set(declared, { count: 0, covers: [] });
    }
    const list = [...subs.entries()].map(([sName, v]) => ({ name: sName, count: v.count, covers: v.covers }));
    if (list.length) {
      pack.subfolders = list;
      pack.unfiledCount = unfiled.get(name) || 0;
    }
  }
  return [...map.values()];
}
