// Assigns a background image to every slide in a batch of slideshows,
// preferring an image not already used within the same slideshow for visual
// variety. Used to happen server-side; moved client-side once scraped/
// uploaded images stopped living on the server (see lib/localLibrary.ts).
import type { Slideshow, LibraryImage } from '../types';

export function assignBackgrounds(slideshows: Slideshow[], pool: LibraryImage[]): Slideshow[] {
  if (!pool.length) return slideshows;
  return slideshows.map((show) => {
    const used = new Set<string>();
    const slides = show.slides.map((slide) => {
      const fresh = pool.filter((i) => !used.has(i.url));
      const choices = fresh.length ? fresh : pool;
      const pick = choices[Math.floor(Math.random() * choices.length)];
      used.add(pick.url);
      return { ...slide, imageUrl: pick.url };
    });
    return { ...show, slides };
  });
}
