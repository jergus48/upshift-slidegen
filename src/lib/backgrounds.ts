// Assigns a background image to every slide in a batch of slideshows,
// preferring an image not already used within the same slideshow for visual
// variety. Used to happen server-side; moved client-side once scraped/
// uploaded images stopped living on the server (see lib/localLibrary.ts).
import type { Slideshow, LibraryImage } from '../types';
import { libraryRef } from './imageSrc';

export function assignBackgrounds(slideshows: Slideshow[], pool: LibraryImage[]): Slideshow[] {
  if (!pool.length) return slideshows;
  return slideshows.map((show) => {
    const used = new Set<string>();
    const slides = show.slides.map((slide) => {
      const fresh = pool.filter((i) => !used.has(i.id));
      const choices = fresh.length ? fresh : pool;
      const pick = choices[Math.floor(Math.random() * choices.length)];
      used.add(pick.id);
      // Persist the stable reference, not the (session-scoped) object URL.
      return { ...slide, imageUrl: libraryRef(pick) };
    });
    return { ...show, slides };
  });
}

// The app slide is the one that names the product. Every preset plugs it as
// "Upshift…" on exactly one slide, so a case-insensitive text match finds it
// reliably. Free-form generations with no such slide simply match nothing.
function isAppSlide(text: string): boolean {
  return /upshift/i.test(text);
}

// Drop a random POV image onto each slideshow's app ("Upshift") slide, so the
// product slide gets a matching point-of-view shot without hand-swapping it in
// every generated deck. A different random image is picked per slideshow. Slides
// that don't mention the app are left untouched (they keep their background from
// assignBackgrounds). No pool → returns the slideshows unchanged.
export function assignAppSlidePov(slideshows: Slideshow[], pool: LibraryImage[]): Slideshow[] {
  if (!pool.length) return slideshows;
  return slideshows.map((show) => {
    if (!show.slides.some((s) => isAppSlide(s.text))) return show;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    const slides = show.slides.map((slide) =>
      isAppSlide(slide.text) ? { ...slide, imageUrl: libraryRef(pick) } : slide
    );
    return { ...show, slides };
  });
}

// Force a specific image reference onto every slideshow's app ("Upshift") slide.
// Used for a per-preset, per-gender uploaded screenshot (see lib/presetScreenshots.ts),
// which overrides the random POV shot. `ref` is a stable ref (a `local:…` id or
// a `/library/…`/`data:` URL). Empty ref → slideshows unchanged.
export function setAppSlideImage(slideshows: Slideshow[], ref?: string): Slideshow[] {
  if (!ref) return slideshows;
  return slideshows.map((show) => {
    if (!show.slides.some((s) => isAppSlide(s.text))) return show;
    const slides = show.slides.map((slide) =>
      isAppSlide(slide.text) ? { ...slide, imageUrl: ref } : slide
    );
    return { ...show, slides };
  });
}
