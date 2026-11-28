// Which mode (EASY, HARD, NPC...) each meme / monkey / spongebob picture belongs to.
// The starting point is guessed from the file name; moves made on the Sort Memes page
// are saved as overrides (server/library.js -> public/library/meme-sort.json).

export const SORT_MODES: { key: string; label: string }[] = [
  { key: 'easy', label: 'EASY' },
  { key: 'normal', label: 'NORMAL' },
  { key: 'hard', label: 'HARD' },
  { key: 'monk', label: 'MONK' },
  { key: 'locked', label: 'LOCKED IN' },
  { key: 'sigma', label: 'SIGMA' },
  { key: 'npc', label: 'NPC' },
  { key: 'cope', label: 'COPE' },
  { key: 'brainrot', label: 'BRAIN ROT' },
  { key: 'overlord', label: 'GOON OVERLORD' },
  { key: 'simp', label: 'SIMP' },
  { key: 'mogged', label: 'MOGGER' },
  { key: 'cooked', label: 'COOKED' },
  { key: 'trash', label: 'TRASH (never used)' },
];

export const SORT_PACKS: { slug: string; label: string }[] = [
  { slug: 'meme-modes', label: 'Memes' },
  { slug: 'monkey-memes', label: 'Monkeys' },
  { slug: 'spongebob-memes', label: 'Spongebob' },
];

const MONKEY: Record<string, string> = {
  eat: 'easy', human: 'normal', work: 'normal', gym: 'hard', sigma: 'sigma', suit: 'monk',
  cool: 'locked', phone: 'npc', sad: 'cope', money: 'mogged',
};
const SPONGE: Record<string, string> = {
  easy: 'easy', patrick: 'easy', happy: 'normal', work: 'npc', hard: 'hard', squid: 'monk', krabs: 'overlord', rage: 'locked',
};

export const pathOfUrl = (url: string) => decodeURIComponent(url.replace(/^.*\/library\//, ''));

// Starting mode, guessed from the pack + file name.
export function defaultMode(path: string): string {
  const [pack, file = ''] = path.split('/');
  const name = file.toLowerCase();
  if (pack === 'monkey-memes') return MONKEY[name.split('-')[1]] ?? 'unsorted';
  if (pack === 'spongebob-memes') return SPONGE[name.split('-')[1]] ?? 'unsorted';
  if (pack === 'meme-modes') {
    const k = name.split(/[-.]/)[0];
    if (k === 'goon') return 'overlord';
    return SORT_MODES.some((m) => m.key === k) ? k : 'unsorted';
  }
  return 'unsorted';
}

export function modeOfImage(url: string, overrides: Record<string, string>): string {
  const p = pathOfUrl(url);
  return overrides[p] ?? defaultMode(p);
}
