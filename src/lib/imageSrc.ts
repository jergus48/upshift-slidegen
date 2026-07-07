// Slides persist a *stable* image reference, not a displayable URL, because
// local (scraped/uploaded) library images are stored in IndexedDB and their
// object URLs (`blob:…`) are session-scoped — baking one into a saved slide
// leaves a dead link after the next reload. So:
//   - local library image  → persist its `local:…` id, resolve to an object
//     URL at render time
//   - bundled image        → persist its `/library/…` path (already stable)
//   - uploaded-in-place     → a `data:` URL (self-contained, already stable)
import type { LibraryImage } from '../types';
import { objectUrlForLocal } from './localLibrary';

// The stable string to store on a slide for a chosen library image.
export function libraryRef(img: LibraryImage): string {
  return img.source === 'bundled' ? img.url : img.id;
}

// Turn whatever a slide stores into a src the browser can actually load.
export async function resolveImageSrc(ref?: string): Promise<string | undefined> {
  if (!ref) return undefined;
  if (ref.startsWith('local:')) return (await objectUrlForLocal(ref)) ?? undefined;
  // `/library/…`, `http(s)://…`, `data:…` are all directly loadable.
  return ref;
}
