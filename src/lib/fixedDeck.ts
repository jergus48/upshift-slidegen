// Turn a verbatim preset deck (see QuitPreset.deck) into queue-ready Slideshow
// objects WITHOUT calling the model — the clone presets are exact reposts of
// real viral decks, so their text is fixed. Backgrounds / the app-slide POV shot
// / caption look are still applied afterwards by decorateShows, exactly like a
// generated deck.
import type { Slideshow } from '../types';

// Same gradient palette the server uses for generated decks, so a verbatim deck
// with no background pack still renders on a real gradient.
const PALETTE: [string, string][] = [
  ['#0f172a', '#1e293b'],
  ['#1a1a2e', '#16213e'],
  ['#2d1b1b', '#1a1010'],
  ['#0a1f1c', '#0f2922'],
  ['#1f1147', '#160d33'],
  ['#26120a', '#1a0c06'],
];

// Build `count` copies of one verbatim deck. (In the preset flow count is 1 per
// randomly-picked preset, but count is supported for completeness.)
export function buildFixedShows(deck: string[], count = 1): Slideshow[] {
  const stamp = Date.now();
  return Array.from({ length: Math.max(1, count) }, (_, i) => {
    const [from, to] = PALETTE[i % PALETTE.length];
    const rand = Math.random().toString(36).slice(2, 7);
    return {
      id: `q-${stamp}-${i}-${rand}`,
      hook: deck[0] || '',
      caption: '',
      hashtags: [],
      rationale: '',
      createdAt: new Date(stamp).toISOString(),
      slides: deck.map((text, j) => ({
        id: `slide-${stamp}-${i}-${j}-${rand}`,
        text,
        bgFrom: from,
        bgTo: to,
      })),
    };
  });
}
