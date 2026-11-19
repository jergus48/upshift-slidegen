// Builds the Brain and Meme slideshows (views/ListDeckView.tsx). No model call —
// every line comes from the pools below and every picture from the user's own
// library packs, so a batch is free and instant (like lib/transformationDeck.ts).
//
//   Brain Lists → the "article" look: a white page, "day 1 to 3: everything is
//     boring", underlined phrases, a Pinterest photo that matches each stage
//     (a book, a street, a messy room…), a brain-scan cover, and an Upshift slide.
//   Meme Lists  → the "mode" look: pastel square, "EASY MODE:" / "HARD MODE:",
//     a dash list on the right, a meme (or brain) picture bottom-left, small
//     pictures of the listed things under the list, Upshift inside the lists.
//
// Colour, wording, the stages / modes shown, the items, the pictures and the
// caption all roll per deck, off shared shuffled bags (lib/dealer.ts), so a batch
// of ten works through everything before repeating.
import type { Slideshow, Slide, LibraryImage, CardSpec, ArticleBlock } from '../types';
import { makeDealer, shuffled, type Dealer } from './dealer';
import { libraryRef } from './imageSrc';

export type ListTool = 'brain' | 'meme';

export const FORMATS: Record<ListTool, { key: string; label: string; hint: string }[]> = {
  brain: [
    { key: 'scroll', label: 'Quit socials', hint: 'day 1 to day 30 without tiktok / instagram / reels' },
    { key: 'porn', label: 'Quit p*rn', hint: 'day 1 to day 30 without p*rn' },
  ],
  meme: [
    { key: 'ladder', label: 'Mode ladder', hint: 'easy / normal / hard / monk mode' },
    { key: 'duo', label: 'Easy vs hard', hint: 'easy / hard / locked in / sigma, 5 modes' },
    { key: 'rage', label: 'Ragebait', hint: 'npc mode, cope mode, then hard mode' },
  ],
};

// ── Colours ─────────────────────────────────────────────────────────────────
export interface ThemeDef {
  name: string;
  bg: string;
  ink: string;
}
export const THEMES: Record<ListTool, ThemeDef[]> = {
  brain: [
    { name: 'White', bg: '#ffffff', ink: '#111111' },
    { name: 'Paper', bg: '#fbf7ee', ink: '#1a1a1a' },
    { name: 'Grey', bg: '#f1f1f1', ink: '#111111' },
    { name: 'Sky', bg: '#eaf3fb', ink: '#0c1f33' },
    { name: 'Mint', bg: '#eaf6ee', ink: '#10261a' },
    { name: 'Blush', bg: '#fbeaee', ink: '#2a1015' },
    { name: 'Night', bg: '#0e0e0e', ink: '#f4f4f4' },
  ],
  meme: [
    { name: 'Peach', bg: '#fddcb8', ink: '#000000' },
    { name: 'Mint', bg: '#cdebd6', ink: '#000000' },
    { name: 'Lilac', bg: '#e1d3f5', ink: '#000000' },
    { name: 'Sky', bg: '#cfe6f7', ink: '#000000' },
    { name: 'Lemon', bg: '#fff2a6', ink: '#000000' },
    { name: 'Pink', bg: '#f9cfdb', ink: '#000000' },
    { name: 'Sand', bg: '#efe5d6', ink: '#000000' },
    { name: 'White', bg: '#ffffff', ink: '#000000' },
    { name: 'Concrete', bg: '#dcdcdc', ink: '#000000' },
    { name: 'Night', bg: '#101010', ink: '#f2f2f2' },
  ],
};

const rand = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
const randInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

// ── Brain Lists: stage text ─────────────────────────────────────────────────
// [[double brackets]] underline a phrase. `keys` are matched against the SUBFOLDER
// names of the picture pack (e.g. a "reading" subfolder feeds the book stage).
interface Stage {
  title: string;
  p1: string;
  side?: string; // when set, the picture sits beside this paragraph
  p2?: string;
  p3?: string;
  keys: string[];
  upshift?: boolean;
}

const ARCS: Record<string, { hooks: string[]; things: string[]; stages: Stage[] }> = {
  scroll: {
    hooks: [
      'what 30 days without {thing} does to your brain',
      'your brain after 30 days without {thing}',
      'quit {thing} for 30 days: what actually changes',
      'day by day: your brain without {thing}',
    ],
    things: ['tiktok', 'instagram', 'reels', 'youtube shorts', 'social media'],
    stages: [
      {
        title: 'day 1 to 3: everything feels [[boring]]',
        p1: 'your thumb keeps reaching for {thing} and [[finds nothing]], the whole world feels muted',
        side: 'your reward bar got set by 8 second clips, so normal life [[can\'t clear it yet]]',
        p3: 'this is where most people quit. don\'t, it\'s withdrawal, not boredom',
        keys: ['bored', 'couch', 'phone', 'day1'],
      },
      {
        title: 'day 4 to 7: you [[notice time]] again',
        p1: 'an evening is suddenly [[4 hours long]] and you don\'t know what to do with it',
        side: 'the hours you fed {thing} every day [[come back all at once]]',
        p3: 'i cleaned my whole room on day 5 because i had nothing else to do',
        keys: ['clean', 'room', 'evening', 'day5'],
      },
      {
        title: 'day 8 to 14: a book [[works]] again',
        p1: 'you read a page and [[actually remember it]], it feels like a superpower',
        p2: 'your attention span comes back [[faster than you expect]] once the competition is gone',
        p3: 'i finished my first book in a long time on day 13',
        keys: ['read', 'book', 'library'],
      },
      {
        title: 'day 15 to 25: boredom turns into [[ideas]]',
        p1: 'waiting in line, showering, walking, your brain starts [[thinking again]] instead of waiting for input',
        side: 'that quiet is where ideas show up, and it only happens [[when nothing is coming in]]',
        p3: 'i use Upshift to keep {thing} blocked, because willpower got me to day 3 and [[the block got me to day 30]]',
        keys: ['walk', 'city', 'street', 'shower', 'ideas'],
        upshift: true,
      },
      {
        title: 'day 30: you [[don\'t want it back]]',
        p1: 'you open it once to check and it feels [[loud and stupid]], like a casino',
        p2: 'the app that used to feel like relief now [[feels like noise]]',
        p3: 'if you make it to 30, it just stops being a thing you want',
        keys: ['calm', 'sunset', 'meditat', 'peace', 'day30'],
      },
    ],
  },
  porn: {
    hooks: [
      'what 30 days without p*rn does to your brain',
      'day by day: your brain after quitting p*rn',
      'quit p*rn for 30 days: what actually changes',
      'your brain on day 30 without p*rn',
    ],
    things: ['p*rn'],
    stages: [
      {
        title: 'day 1 to 3: the urges are [[everywhere]]',
        p1: 'every ad, every thumbnail, every story pulls at you and you [[feel it physically]]',
        side: 'your brain is asking for the old reward and [[you just don\'t give it]]',
        p3: 'this is the hardest part. it passes, you just have to not open the tab',
        keys: ['craving', 'urge', 'night', 'day1'],
      },
      {
        title: 'day 4 to 7: the fog starts to [[lift]]',
        p1: 'you wake up and your head feels [[less heavy]], like someone cleaned a window',
        side: 'mornings stop being a fight and you actually [[feel awake]]',
        p3: 'i did my first full workout in weeks on day 6',
        keys: ['morning', 'gym', 'sun'],
      },
      {
        title: 'day 8 to 14: you can [[look people in the eye]]',
        p1: 'conversations feel [[easier]] and you stop zoning out halfway through',
        p2: 'you realise how much attention was going into something that gave you [[nothing back]]',
        p3: 'someone laughed at my joke and i didn\'t spiral about it afterwards',
        keys: ['friends', 'social', 'talk', 'eye'],
      },
      {
        title: 'day 15 to 25: you have [[energy]] for things',
        p1: 'you start the things you kept putting off, [[cooking, lifting, reading]]',
        side: 'the time and focus you got back is [[bigger than you think]]',
        p3: 'i use Upshift to keep p*rn sites blocked, because willpower got me to day 3 and [[the block got me to day 30]]',
        keys: ['cook', 'gym', 'read'],
        upshift: true,
      },
      {
        title: 'day 30: you [[feel like yourself]]',
        p1: 'the urge doesn\'t scream anymore, it\'s a [[quiet thought]] you can ignore',
        p2: 'your focus, your mood and your standards all [[went up together]]',
        p3: 'if you make it to 30, it stops running your life',
        keys: ['calm', 'confident', 'sunset', 'day30'],
      },
    ],
  },
};

const COVER_CAPTIONS = ['(day 1 vs day 30)', '(swipe, it gets better)', '(watch it recover)'];
// ── Meme Lists: modes ───────────────────────────────────────────────────────
// Everything uses Title Case like the originals. Entries with a second dash on
// the same line ("Discipline -Meditation") are intentional.
interface ModeDef {
  title: string;
  keys: string[]; // subfolder names to match for the big picture
  pool: string[];
  count: [number, number];
  upshift?: boolean; // drop an Upshift line into the list
}

const MODES: Record<string, ModeDef> = {
  easy: {
    title: 'EASY MODE:',
    keys: ['easy', 'soy', 'npc', 'wojak'],
    pool: ['No Sport', 'No Social Life', 'Social Media', 'Video Games', 'Porn', 'Fap', 'Junk-Food', 'Doomscrolling', 'Sleeping Till 2pm', 'Vaping', 'Energy Drinks', 'Gooning'],
    count: [6, 7],
  },
  normal: {
    title: 'NORMAL MODE:',
    keys: ['normal', 'average'],
    pool: ['Gym / Sport', 'Social Life', 'Friends', 'Social Media', 'Video Games', 'Porn', 'Fap', 'Party', 'Netflix', 'Fast Food', 'Weed'],
    count: [6, 8],
  },
  hard: {
    title: 'HARD MODE:',
    keys: ['hard', 'chad', 'gigachad', 'sigma'],
    pool: ['Gym / Sport / Combat Sport', 'Discipline', 'Focus', 'Reading', 'No Porn', 'No Fap', 'Social Media (low)', 'Friends (close circle)', 'Cold Shower', 'Journaling', 'Early Wake Up', 'Cooking', 'Walks', 'No Doomscrolling'],
    count: [7, 9],
    upshift: true,
  },
  monk: {
    title: 'MONK MODE:\n(EXTREME)',
    keys: ['monk'],
    pool: ['Ascetism', 'Discipline -Meditation', 'Dopamine Detox', 'No Porn -No Fap', 'No Social Media', 'Low Social Life', 'Silence', 'Fasting', 'No Music'],
    count: [6, 7],
    upshift: true,
  },
  npc: {
    title: 'NPC MODE:',
    keys: ['npc', 'easy', 'soy'],
    pool: ['Scrolls 6 Hours', '"I\'m Not Addicted"', '"I\'ll Start Monday"', 'Checks Phone In The Shower', 'Opens The App "Just To Check"', 'Watches "One Video"', 'Replies To Rage Comments', 'Calls It A Hobby'],
    count: [6, 7],
  },
  cope: {
    title: 'COPE MODE:',
    keys: ['cope', 'cry', 'npc'],
    pool: ['"Everyone Does It"', '"I Have No Time"', '"It\'s Just Content"', '"I\'ll Quit When I\'m Ready"', '"My Brain Is Just Like That"', '"I\'m Not Like Them"', 'Blames The Algorithm', 'Blames Their Parents'],
    count: [6, 7],
  },
  locked: {
    title: 'LOCKED IN MODE:',
    keys: ['locked', 'hard', 'chad'],
    pool: ['Phone Out Of The Room', 'Gym Before Noon', 'Deep Work Blocks', 'No Porn', 'No Fap', 'Socials Limited', 'Sleep 8 Hours', 'Read 10 Pages', 'Cold Shower'],
    count: [7, 8],
    upshift: true,
  },
  sigma: {
    title: 'SIGMA MODE:',
    keys: ['sigma', 'chad', 'hard'],
    pool: ['Trains Alone', 'Cold Shower', 'Reads Daily', 'No Doomscrolling', 'Early Wake Up', 'Walks Alone', 'Journaling', 'Fasting', 'No Porn', 'Gym / Sport'],
    count: [6, 7],
    upshift: true,
  },
  brainrot: {
    title: 'BRAIN ROT MODE:',
    keys: ['brainrot', 'npc', 'easy', 'soy'],
    pool: ['Reels Till 3am', 'Phone In Bed', 'Comment Section Arguments', 'Video Games', 'Energy Drinks', 'Junk-Food', 'Doomscrolling', 'Netflix Binge', 'Sleeping Till 2pm'],
    count: [6, 7],
  },
};

// The subtle Upshift mention: one line inside a positive mode's list.
// `topic` decides which screenshots go with the line (matched against the file
// names in the Upshift screenshots pack: porn-*, socials-*).
type UpshiftTopic = 'porn' | 'socials' | 'both';
const UPSHIFT_ITEMS: { text: string; topic: UpshiftTopic }[] = [
  { text: 'Blocked P*rn (Upshift productivity app)', topic: 'porn' },
  { text: 'No P*rn (Blocked With The Upshift Productivity App)', topic: 'porn' },
  { text: 'Blocked P*rn Sites (Upshift productivity app)', topic: 'porn' },
  { text: 'Blocked Socials (Upshift productivity app)', topic: 'socials' },
  { text: 'Limited Socials (Upshift productivity app)', topic: 'socials' },
  { text: 'Blocked Socials + P*rn (Upshift productivity app)', topic: 'both' },
];

// 5–6 modes per deck, so 5–6 slides.
const LADDERS: Record<string, string[][]> = {
  ladder: [
    ['easy', 'normal', 'hard', 'monk', 'locked'],
    ['normal', 'easy', 'hard', 'sigma', 'monk'],
    ['easy', 'normal', 'hard', 'monk', 'sigma'],
    ['monk', 'normal', 'hard', 'easy', 'locked'],
  ],
  duo: [
    ['easy', 'hard', 'normal', 'locked', 'sigma'],
    ['brainrot', 'easy', 'hard', 'sigma', 'locked'],
    ['easy', 'hard', 'normal', 'monk', 'sigma'],
  ],
  rage: [
    ['npc', 'cope', 'brainrot', 'easy', 'hard'],
    ['cope', 'npc', 'easy', 'normal', 'locked'],
    ['npc', 'cope', 'easy', 'hard', 'sigma'],
  ],
};

// What picture to look for per list line (subfolder names), for the small
// pictures under the list.
// Substring of a list line -> words to look for in picture file names / subfolders.
const ITEM_KEYS: [string, string[]][] = [
  ['porn', ['nofap']],
  ['gooning', ['nofap']],
  ['social media', ['scroll', 'social']],
  ['doomscroll', ['scroll', 'craving']],
  ['reels', ['scroll', 'craving']],
  ['comment section', ['scroll']],
  ['phone', ['craving', 'scroll', 'wake']],
  ['gym', ['gym']],
  ['sport', ['sport', 'run', 'gym']],
  ['trains', ['gym', 'sport']],
  ['read', ['read']],
  ['cold shower', ['cold']],
  ['junk', ['food']],
  ['fast food', ['food']],
  ['game', ['game']],
  ['friend', ['friends', 'social']],
  ['social life', ['friends', 'party', 'social']],
  ['party', ['party']],
  ['meditat', ['meditate', 'calm']],
  ['dopamine detox', ['nature', 'calm', 'meditate']],
  ['ascet', ['nature', 'calm']],
  ['silence', ['nature', 'meditate']],
  ['focus', ['study']],
  ['deep work', ['study']],
  ['discipline', ['gym', 'study', 'wake']],
  ['walk', ['walk', 'nature']],
  ['cook', ['cook']],
  ['journal', ['journal']],
  ['vap', ['vape']],
  ['weed', ['weed']],
  ['energy', ['energy']],
  ['netflix', ['netflix']],
  ['sleeping', ['sleep']],
  ['sleep', ['sleep']],
  ['early wake', ['wake', 'morning']],
  ['fasting', ['water', 'food']],
  ['music', ['music']],
  ['alcohol', ['drink']],
  ['beer', ['drink']],
];

const CAPTIONS: Record<ListTool, string[]> = {
  brain: [
    'your brain heals faster than you think. blocking the stuff that fries it is step one.',
    'brain rot is reversible. i used Upshift to block p*rn sites and limit socials.',
    'day by day your brain comes back. what would you block first?',
    'comment what you are quitting first 👇',
  ],
  meme: [
    'which mode are you on? be honest.',
    'tag the friend who is stuck on easy mode 😭',
    'hard mode is easier when your phone blocks the p*rn for you (Upshift)',
    'comment "again" if you have been here before',
  ],
};
const HASHTAGS = ['quitporn', 'nofap', 'brainrot', 'dopamine', 'selfimprovement', 'upshift', 'digitaldetox', 'discipline', 'fyp', 'noscroll', 'glowup', 'hardmode'];

// ── Pictures ────────────────────────────────────────────────────────────────
// Dealt off shuffled bags so a batch uses everything before repeating. Rows ask
// for a picture by key; a pack whose SUBFOLDERS are named after the things in it
// ("reading", "gym", "scrolling") gives pictures that match, anything else gives
// a random one from the pack.
class PicturePool {
  private images: LibraryImage[];
  private all: Dealer<LibraryImage>;
  private byKey = new Map<string, Dealer<LibraryImage> | null>();
  constructor(images: LibraryImage[]) {
    this.images = images;
    this.all = makeDealer(images);
  }
  get size() {
    return this.images.length;
  }
  // `strict`: only a picture that really matches a key (no random fallback) —
  // used for the small "this is the thing on the list" pictures, where a random
  // photo would be the wrong picture.
  pick(keys: string[] = [], avoid: string[] = [], strict = false): string | undefined {
    if (!this.images.length) return undefined;
    const id = keys.join('|');
    let d = this.byKey.get(id);
    if (d === undefined) {
      // A key matches the image's subfolder name OR its file name ("read-03.jpg").
      const hay = (i: LibraryImage) => `${i.subfolder ?? ''} ${decodeURIComponent(i.url.split('/').pop() ?? '')}`.toLowerCase();
      const hits = keys.length ? this.images.filter((i) => keys.some((k) => hay(i).includes(k))) : [];
      d = hits.length ? makeDealer(hits) : null;
      this.byKey.set(id, d);
    }
    if (!d && strict) return undefined;
    const avoidImgs = this.images.filter((i) => avoid.includes(libraryRef(i)));
    const img = (d ?? this.all).next(avoidImgs);
    return img ? libraryRef(img) : undefined;
  }
}

export interface ListDeckOptions {
  tool: ListTool;
  count: number;
  // Locks the format / colour; omitted = random per deck.
  format?: string;
  themeName?: string;
  // Meme lists: the @handle printed bottom-left (nothing is printed if empty).
  handle?: string;
  // Meme lists: small pictures of the listed things under the list.
  smallPics: boolean;
  // brain: brain-scan pictures; meme: meme / troll (or brain) pictures.
  hero: LibraryImage[];
  // Small pinterest pictures (activities, things from the lists).
  thumbs: LibraryImage[];
  // Mention Upshift (a line in the lists + a closing app slide). Off by default.
  upshift?: boolean;
  // Upshift screenshots; ctaFallback is used when none is picked.
  cta: LibraryImage[];
  ctaFallback?: string;
}

interface Batch {
  opts: ListDeckOptions;
  themes: Dealer<ThemeDef>;
  formats: Dealer<string>;
  hooks: Record<string, Dealer<string>>;
  captions: Dealer<string>;
  hero: PicturePool;
  thumbs: PicturePool;
  cta: PicturePool;
  upshift: Dealer<{ text: string; topic: UpshiftTopic }>;
}

function makeBatch(opts: ListDeckOptions): Batch {
  const themeList = THEMES[opts.tool];
  const themes = opts.themeName ? themeList.filter((t) => t.name === opts.themeName) : themeList;
  return {
    opts,
    themes: makeDealer(themes.length ? themes : themeList),
    formats: makeDealer(FORMATS[opts.tool].map((f) => f.key)),
    hooks: Object.fromEntries(Object.entries(ARCS).map(([k, v]) => [k, makeDealer(v.hooks)])),
    captions: makeDealer(CAPTIONS[opts.tool].filter((c) => opts.upshift || !/upshift/i.test(c))),
    hero: new PicturePool(opts.hero),
    thumbs: new PicturePool(opts.thumbs),
    cta: new PicturePool(opts.cta),
    upshift: makeDealer(UPSHIFT_ITEMS),
  };
}

// The Upshift screenshots for a line: both p*rn ones for the p*rn line, the socials
// ones for the socials line, one of each for "both". Falls back to whatever the
// pack holds, then to the bundled blocked screenshot.
function upshiftShots(batch: Batch, topic: UpshiftTopic): string[] {
  const topics = topic === 'both' ? ['porn', 'socials'] : [topic];
  const perTopic = topic === 'both' ? 1 : 2;
  const out: string[] = [];
  for (const t of topics) {
    for (let i = 0; i < perTopic; i++) {
      const s = batch.cta.pick([t], out, true);
      if (s && !out.includes(s)) out.push(s);
    }
  }
  if (!out.length) {
    const any = batch.cta.pick() ?? batch.opts.ctaFallback;
    if (any) out.push(any);
  }
  return out;
}

const plain = (s: string) => s.replace(/\[\[|\]\]/g, '');
const fill = (s: string, thing: string) => s.replace(/\{thing\}/g, thing);

// ── Brain Lists builder ─────────────────────────────────────────────────────
function buildBrainDeck(batch: Batch, theme: ThemeDef, arcKey: string): { hook: string; cards: CardSpec[] } {
  const arc = ARCS[arcKey];
  const thing = rand(arc.things);
  const hook = fill(batch.hooks[arcKey].next()!, thing);
  const base = { layout: 'article' as const, bg: theme.bg, ink: theme.ink };
  const used: string[] = [];

  // Cover: two brain scans side by side, own labels: bad-thing brain vs normal brain.
  const pair = batch.hero.pick(['brain-pair'], [], true);
  // Half of a side-by-side scan is the dimmest (left) / brightest (right) single brain.
  const lowRef = pair && Math.random() < 0.6 ? `${pair}#left` : batch.hero.pick(['brain-b1'], used);
  if (lowRef) used.push(lowRef);
  const highRef = pair && Math.random() < 0.3 ? `${pair}#right` : batch.hero.pick(['brain-b3'], used);
  if (highRef) used.push(highRef);
  const flipCover = Math.random() < 0.5;
  const badLabel = `${thing[0].toUpperCase()}${thing.slice(1)} brain`;
  const coverBlock: ArticleBlock = Math.random() < 0.8 && lowRef && highRef && lowRef !== highRef
    ? {
        kind: 'img', side: 'solo',
        ref: flipCover ? highRef : lowRef, ref2: flipCover ? lowRef : highRef,
        label: flipCover ? 'Normal brain' : badLabel, label2: flipCover ? badLabel : 'Normal brain',
        caption: rand(COVER_CAPTIONS),
      }
    : { kind: 'img', ref: highRef ?? batch.hero.pick(['brain', 'scan'], used), side: 'solo', wide: true, label: `Normal brain after quitting ${thing}`, caption: rand(COVER_CAPTIONS) };
  const cover: CardSpec = { ...base, title: hook, blocks: [coverBlock] };

  // 4–5 of the 5 stages (never the first), so decks differ in length.
  const drop = Math.random() < 0.4 ? randInt(1, arc.stages.length - 2) : -1;
  const stages = arc.stages.filter((_, i) => i !== drop);
  let flip = Math.random() < 0.5;
  const stageCards: CardSpec[] = stages.map((st, si) => {
    const photo = batch.thumbs.pick(st.keys, used);
    if (photo) used.push(photo);
    // Big picture = a brain scan whose colours improve with the stage.
    const prog = stages.length > 1 ? si / (stages.length - 1) : 1;
    const band = prog < 0.34 ? 'brain-b1' : prog < 0.67 ? 'brain-b2' : 'brain-b3';
    const ref = (band === 'brain-b1' && pair && Math.random() < 0.5 ? `${pair}#left` : undefined) ?? batch.hero.pick([band], used) ?? photo;
    if (ref) used.push(ref);
    const blocks: ArticleBlock[] = [{ kind: 'p', text: fill(st.p1, thing) }];
    if (st.side) {
      flip = !flip;
      blocks.push({ kind: 'img', ref, side: flip ? 'left' : 'right', sideText: fill(st.side, thing) });
    } else {
      blocks.push({ kind: 'img', ref, side: 'solo' });
    }
    if (st.p2) blocks.push({ kind: 'p', text: fill(st.p2, thing) });
    if (st.p3) {
      // Without the Upshift option the line talks about blocking, with no brand.
      const p3 = batch.opts.upshift ? st.p3 : st.p3.replace(/i use Upshift to keep (.+?) blocked,/, 'i blocked $1 on my phone,');
      blocks.push({ kind: 'p', text: fill(p3, thing) });
    }
    // Small pictures around the text: things from this stage first, then filler.
    const thumbs: string[] = photo && photo !== ref ? [photo] : [];
    for (const key of st.keys) {
      const t = batch.thumbs.pick([key], [...used, ...thumbs], true);
      if (t && !thumbs.includes(t) && t !== ref) thumbs.push(t);
    }
    while (batch.thumbs.size && thumbs.length < 5) {
      const t = batch.thumbs.pick([], [...used, ...thumbs]);
      if (!t || thumbs.includes(t) || t === ref) break;
      thumbs.push(t);
    }
    thumbs.forEach((t) => used.push(t));
    const shown = batch.opts.smallPics ? thumbs.slice(0, 5) : [];
    // The stage that mentions Upshift also gets its screenshot as one of the mini pictures.
    if (st.upshift && batch.opts.upshift) {
      shown.unshift(...upshiftShots(batch, arcKey === 'porn' ? 'porn' : 'socials'));
    }
    return { ...base, title: fill(st.title, thing), blocks, thumbs: shown.length ? shown : undefined };
  });

  return { hook, cards: [cover, ...stageCards] };
}

// ── Meme Lists builder ──────────────────────────────────────────────────────
function itemKeys(item: string): string[] {
  const low = item.toLowerCase();
  return ITEM_KEYS.find(([k]) => low.includes(k))?.[1] ?? [];
}

function buildMemeDeck(batch: Batch, theme: ThemeDef, format: string): { hook: string; cards: CardSpec[] } {
  const order = rand(LADDERS[format] ?? LADDERS.ladder);
  const used: string[] = [];
  const thumbUsed: string[] = [];
  const base = { layout: 'mode' as const, bg: theme.bg, ink: theme.ink, handle: batch.opts.handle || undefined };

  let upshiftModes = 0;
  const cards: CardSpec[] = order.map((key) => {
    const def = MODES[key];
    const n = randInt(def.count[0], def.count[1]);
    let items = shuffled(def.pool).slice(0, n);
    let upshiftTopic: UpshiftTopic = 'porn';
    const withUpshift = !!def.upshift && !!batch.opts.upshift && upshiftModes < 2;
    if (withUpshift) {
      upshiftModes++;
      const up = batch.upshift.next()!;
      items = [...items.slice(0, n - 1), up.text];
      upshiftTopic = up.topic;
    }
    const image = batch.hero.pick(def.keys, used);
    if (image) used.push(image);
    let thumbs: string[] | undefined;
    if (batch.opts.smallPics && batch.thumbs.size) {
      thumbs = [];
      // One picture per list line that has a matching one…
      for (const it of items) {
        if (thumbs.length >= 9) break;
        const keys = itemKeys(it);
        if (!keys.length) continue;
        const t = batch.thumbs.pick(keys, thumbUsed, true);
        if (t && !thumbs.includes(t)) { thumbs.push(t); thumbUsed.push(t); }
      }
      // …and a few extras so the card is never bare.
      while (thumbs.length < 5) {
        const t = batch.thumbs.pick([], thumbUsed);
        if (!t || thumbs.includes(t)) break;
        thumbs.push(t);
        thumbUsed.push(t);
      }
    }
    if (withUpshift) {
      thumbs = [...upshiftShots(batch, upshiftTopic), ...(thumbs ?? [])];
    }
    return { ...base, title: def.title, items, image, thumbs };
  });

  const hook = `${order.slice(0, 3).map((k) => MODES[k].title.split('\n')[0].replace(':', '').toLowerCase()).join(' vs ')}: which one are you?`;
  return { hook, cards };
}

// ── Public API ──────────────────────────────────────────────────────────────
const summary = (c: CardSpec): string =>
  [plain(c.title), ...(c.blocks || []).flatMap((b) => (b.kind === 'p' ? [plain(b.text)] : b.sideText ? [plain(b.sideText)] : [])), ...(c.items || [])].join('\n');

export function buildListDecks(opts: ListDeckOptions): { shows: Slideshow[] } {
  const batch = makeBatch(opts);
  const shows: Slideshow[] = [];
  const stampBase = Date.now();

  for (let d = 0; d < Math.max(1, opts.count); d++) {
    const format = opts.format || batch.formats.next()!;
    const theme = batch.themes.next()!;
    const { hook, cards } =
      opts.tool === 'brain' ? buildBrainDeck(batch, theme, format) : buildMemeDeck(batch, theme, format);
    const stamp = stampBase + d;
    const rnd = Math.random().toString(36).slice(2, 7);
    const slides: Slide[] = cards.map((card, i) => ({
      id: `slide-${stamp}-${i}-${rnd}`,
      text: summary(card),
      card,
    }));
    shows.push({
      id: `q-${stamp}-${rnd}`,
      hook,
      caption: batch.captions.next()!,
      hashtags: shuffled(HASHTAGS.filter((h) => opts.upshift || h !== 'upshift')).slice(0, 5),
      rationale: `${opts.tool === 'brain' ? 'Brain' : 'Meme'} · ${format} · ${theme.name}`,
      createdAt: new Date(stamp).toISOString(),
      slides,
    });
  }
  return { shows };
}
