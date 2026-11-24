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
    { key: 'rage', label: 'Ragebait', hint: 'npc mode, cope mode, goon overlord, simp, mogged...' },
    { key: 'sponge', label: 'Spongebob modes', hint: 'Patrick, Squidward, office fish and real Spongebob as the modes' },
    { key: 'monkey', label: 'Monkey modes', hint: 'the same lists, but the pictures are monkeys doing human stuff' },
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

const BAIT_HOOKS: Record<string, string[]> = {
  porn: [
    'if you watch p*rn you will never have a real relationship. fight me',
    'p*rn is why you cannot talk to girls. day by day proof',
    'the reason you feel dead inside is on your phone. 30 days without it',
  ],
  scroll: [
    'your attention span is cooked and you know it. 30 days without tiktok',
    'tiktok made you dumber. day by day proof',
    'if you scroll in the bathroom this is for you',
  ],
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

// Always on GOON OVERLORD lists — specific names + widely-known facts that expose the gooner.
const OVERLORD_SIGNATURES = [
  'Knows Lana Rhoades Just By Her Tattoo',
  'Can Name Every Mia Khalifa Video In Order',
  'Recognized Riley Reid From 10 Feet Away At The Mall',

  'Knows Sasha Grey\'s Exact Retirement Date',
  'Has Brazzers Premium Since 2014',
  'Can Rank Every Lana Rhoades Video By Length',
];

const MODES: Record<string, ModeDef> = {
  easy: {
    title: 'EASY MODE:',
    keys: ['easy-', 'soy-'],
    pool: [
      'Gym Is On The Vision Board', 'Cardio = Walking To The Fridge', '3am To Bed, 2pm Up',
      'Motivation Reel, Back To Sleep', '7 Books, 0 Started', 'Diet Starts Monday',
      'Watched Tate, Still On The Couch', 'Energy Drink Personality', 'P*rn',
      'Phone Battery Anxiety', 'Vapes Outside The Gym', 'Fap',
    ],
    count: [6, 7],
  },
  normal: {
    title: 'NORMAL MODE:',
    keys: ['normal-'],
    pool: [
      'Gym 3x (Skips The 4th)', 'Joe Rogan Fan, Reads Nothing', 'Has Goals. Posts Goals',
      'Beer Every Friday', 'Language App. Used Twice', 'P*rn',
      'Cardio = Walk To The Car', 'Knows About Testosterone. Never Tested',
      'Netflix After 10pm', 'Fast Food Fridays', 'Weed On Weekends', 'Party Life',
    ],
    count: [6, 8],
  },
  hard: {
    title: 'HARD MODE:',
    keys: ['hard-'],
    pool: [
      'Gym + Combat Sport', 'Phone Off After 9pm', 'Reads 10 Pages Daily',
      'No P*rn', 'No Fap', 'Cold Shower Daily', 'Journaling', 'Up At 6am',
      'Cooks Every Meal', 'No Doomscrolling', 'Close Circle Only', 'Walks Daily',
      'Huberman Stack (Actually Does It)',
    ],
    count: [7, 9],
    upshift: true,
  },
  monk: {
    title: 'MONK MODE:\n(EXTREME)',
    keys: ['monk-'],
    pool: [
      'No Social Media', 'No P*rn, No Fap', 'Fasting',
      'Dopamine Detox', 'Silence', 'No Music', 'No Parties', 'Meditates Daily',
      'Reads Philosophy', 'Trains Alone At 5am',
    ],
    count: [6, 7],
    upshift: true,
  },
  npc: {
    title: 'NPC MODE:',
    keys: ['npc-'],
    pool: [
      'Screen Time: 8h 42m', 'His Reel Mid-Yours',
      'Stanley Cup (TikTok Made Him)', 'Opinion: Formed In 11 Sec',
      'Same Reel 6 Times Today', 'Phone Dying. Full Panic',
      'Liked A Post At Dinner', 'Mouth Breathing While Scrolling',
      'Meme Instead Of A Reply', 'Tags Friend. Back To Scrolling',
      'Bought It Because TikTok', 'Walks While Scrolling',
    ],
    count: [6, 7],
  },
  cope: {
    title: 'COPE MODE:',
    keys: ['cope-'],
    pool: [
      '"Starting Monday"', 'Day 1 Again',
      'She Left. Sigma Reels Help', 'Deleted App. Back In 3 Min',
      'Electrolytes. Skips Gym',
      'Still Texts Her (She\'s Engaged)', 'Cold Plunge Once, Still No Job',
      'Bought The Course. Unopened', 'Streak: 2 Days',
      'Is Just Wired Different', 'Watches Tate. Orders DoorDash',
    ],
    count: [6, 7],
  },
  locked: {
    title: 'LOCKED IN MODE:',
    keys: ['locked-', 'hard-'],
    pool: [
      'Phone In Another Room', 'Gym Before 8am', 'Deep Work: 90 Min Blocks',
      'No P*rn', 'No Fap', 'Socials: 20 Min Max', '8 Hours Sleep', 'Reads 10 Pages',
      'Cold Shower', 'No Notifications', 'Huberman Routine (Actually)',
    ],
    count: [7, 8],
    upshift: true,
  },
  sigma: {
    title: 'SIGMA MODE:',
    keys: ['sigma-', 'hard-'],
    pool: [
      'Trains Alone At 5am', 'Cold Shower Daily', 'Reads Daily',
      'No Doomscrolling', 'Never Explains Himself', 'Walks Alone, No Headphones',
      'Journaling', 'Intermittent Fasting', 'No P*rn', 'Replies When He Wants',
      'Gym 5x A Week', 'Turned Down The Party',
    ],
    count: [6, 7],
    upshift: true,
  },
  overlord: {
    title: 'GOON OVERLORD MODE:',
    keys: ['goon-'],
    pool: [
      'Gooned 9 Hours Straight', '47 Tabs Closed At 4am', 'Cleared History 3x Today',
      '"It\'s Just Research"', 'Knows Every Site By Heart', 'Dopamine Receptors: Gone',
      'Cannot Talk To Real Girls', 'Sleeps At 6am', 'Phone At 1% On Purpose',
      'Incognito Out Of Habit', 'Favourite Site Has A Loyalty Program',
      'Has A Type (The Whole Catalogue)',
    ],
    count: [6, 7],
  },
  simp: {
    title: 'SIMP MODE:',
    keys: ['cope-', 'easy-'],
    pool: [
      'Liked Her Post From 2018', '4 Paragraphs. Gets "Lol"',
      'Pays For Her OnlyFans', 'Watched Her Story 11x Today',
      'Defends Her Online', 'Left On Read. Texts Again',
      'She Posted A Guy. Spiral', 'Bought A Gift. Got Blocked',
      'Calls Her Mid. Texts Tomorrow', 'Different Ringtone For Her',
    ],
    count: [6, 7],
  },
  mogged: {
    title: 'GET MOGGED MODE:',
    keys: ['npc-', 'cope-'],
    pool: [
      'Same Height As His GF', 'She Left For His Gym Partner',
      'No Legs (2 Years)', 'Voice Cracks Talking To Her',
      'Mogged The Second He Walked In', 'Jawline By Chips',
      'Sat Next To A 6\'2" Guy', 'She\'s With The Guy He Bullied',
      'Posture Of A Shrimp', 'Hairline On A Gap Year',
    ],
    count: [6, 7],
  },
  cooked: {
    title: 'YOU ARE COOKED MODE:',
    keys: ['cope-', 'npc-'],
    pool: [
      'Opens TikTok. Closes. Reopens', 'Read 2 Lines. Checked Phone',
      'Screen Time Report: Deleted', '11 Productivity Tabs, 0 Read',
      'Cannot Eat Without Phone', 'YouTube Autoplay Since 7pm',
      'Checks Phone Every 2 Min', 'Cooked Since 2019',
      'Brain Fog At 2pm Daily', 'Remembers Reels, Not Convos',
    ],
    count: [6, 7],
  },
  monkey: {
    title: 'MONKEY MODE:',
    keys: ['monkey-cool', 'monkey-human', 'monkey'],
    pool: [
      'Scrolls With Both Thumbs', 'Banana At 3am', 'Flings Phone At The Wall',
      'Swings Between 7 Apps', 'Same Reel 6 Times', '"It\'s Just Research"',
      'Fridge Every 5 Minutes', 'Doomscrolling Since 11pm', 'Woke Up At 2pm',
      'Screamed At A Loading Screen', 'Zero Impulse Control',
    ],
    count: [6, 7],
  },
  bizmonkey: {
    title: 'BUSINESS MONKEY MODE:',
    keys: ['monkey-suit', 'monkey-work', 'monkey'],
    pool: [
      'Suit To Take Out The Trash', 'Every Chat Is A Meeting',
      '"Per My Last Email"', 'Stock Tips From TikTok', '4 Podcasts, Zero Progress',
      'Planner Full. Progress Zero', 'Posts Ls As Lessons', 'Morning Routine Reel',
      'Course Bought. Unopened', 'Voice Notes At 11pm',
    ],
    count: [6, 7],
  },
  gymmonkey: {
    title: 'GYM MONKEY MODE:',
    keys: ['monkey-gym', 'monkey-sigma', 'monkey'],
    pool: [
      'Phone + Shaker, Both Hands', 'Rests 11 Min Between Sets',
      'Mirror Selfie Before Every Set', 'Curls In The Squat Rack', 'No Legs (Ever)',
      'Pre-Workout At 11pm', 'Scrolls 20 Min Between Sets', 'Leaves After 25 Min',
      'Never Counts Reps Right', 'Gym Pic Posted, Gains Not Visible',
    ],
    count: [6, 7],
  },
  richmonkey: {
    title: 'RICH MONKEY MODE:',
    keys: ['monkey-money', 'monkey-cool', 'monkey'],
    pool: [
      'Sells Discipline Course (Still Broke)', 'Rented The Lambo For The Reel',
      '200 Dollars. Full Personality', 'Buys Pre-Workout, Not A Membership',
      'Crypto Bro Since 2021', 'Money Selfies, No Source Disclosed',
      '"Mindset" Reel Every Friday', 'Business Partner Is His Cousin',
    ],
    count: [6, 7],
  },
  gonemonkey: {
    title: 'GOONER MONKEY MODE:',
    keys: ['monkey-phone', 'monkey-sad', 'monkey'],
    pool: [
      'Phone At 1% On Purpose', '47 Tabs Closed At 4am', 'Incognito Out Of Habit',
      'Cleared History 3x Today', '"It\'s Just Research"',
      'Left On Read By Everyone', 'Sleeps At 6am', 'Dopamine Receptors: Gone',
      'Cannot Talk To Real Girls', 'Knows Lana By Her Tattoo',
    ],
    count: [6, 7],
  },
  sadmonkey: {
    title: 'RELAPSE MONKEY MODE:',
    keys: ['monkey-sad', 'monkey'],
    pool: [
      '"Just One Video"', 'Day 3. Caved', 'Deleted App. Back In 4 Min',
      'Starts Monday (Never Monday)', 'Streak: 2 Days', 'Blames The Algorithm',
      'She Left. He Relapsed', '"Reset Tomorrow"',
    ],
    count: [6, 7],
  },
  lockedmonkey: {
    title: 'LOCKED IN MONKEY MODE:',
    keys: ['monkey-sigma', 'monkey-gym', 'monkey-suit', 'monkey'],
    pool: [
      'Phone In Another Room', 'Gym Before 8am', 'Deep Work: 90 Min',
      'No P*rn', 'Socials: 20 Min Max', '8 Hours Sleep', 'Reads 10 Pages',
      'Cold Shower', 'No Notifications', 'Huberman Routine (Actually)',
    ],
    count: [7, 8],
    upshift: true,
  },
  patrick: {
    title: 'PATRICK MODE:',
    keys: ['sponge-easy', 'sponge-patrick'],
    pool: [
      'Opens Reels. Forgets Why', 'Brain: Empty. Vibes: There',
      'Is Mayonnaise An Instrument?', 'Drools On The Couch',
      'Screen Time: 9h (Personal Best)', 'Heard Of Focus. Not A Fan',
      'Doomscrolling Since Dinner', 'Woke Up At 2pm',
      'Same Reel 7 Times', '"One More Episode"',
    ],
    count: [6, 7],
  },
  squidward: {
    title: 'SQUIDWARD MODE:',
    keys: ['sponge-squid', 'sponge-work'],
    pool: [
      'Hates Mon And Tue', 'Clocks In. Opens TikTok',
      'Dead Inside By 9am', 'Dreams Of Quitting. Never Quits',
      'Opens App. Closes. Reopens', 'Judges Everyone. Does Nothing',
      'Sad Music Alone At 2am', '"I\'m Fine" (He\'s Not)',
      'Sighs For The Whole Office', 'Unmotivated Since 2018',
    ],
    count: [6, 7],
  },
  officefish: {
    title: 'OFFICE FISH MODE:',
    keys: ['sponge-work', 'sponge-squid'],
    pool: [
      'Clocks In, Scrolls 20 Min', '"Per My Last Email"',
      'Slack Open. TikTok Also Open', 'Meeting That Could Be A Text',
      'Pretends To Type', 'Lunch Break = Doomscroll',
      '400 Unread Emails', 'Left Early. "WFH"',
      'Planner Used As A Coaster', 'Teams Status: Away',
    ],
    count: [6, 7],
  },
  krabs: {
    title: 'KRABS MODE:',
    keys: ['sponge-krabs', 'sponge-hard'],
    pool: [
      'Charges You For Breathing', 'Counts Money At 3am',
      'Sells Discipline Course (Undisciplined)', 'Never Takes A Day Off',
      'Pre-Workout Dropshipping', 'Loves Money, Hates Sleep',
      'Fiver Into A Personality', '"Business About To Pop Off"',
      'Everything Is An Investment',
    ],
    count: [6, 7],
  },
  spongebob: {
    title: 'SPONGEBOB MODE:',
    keys: ['sponge-happy', 'sponge-hard'],
    pool: [
      'Up At 5am, Actually Happy', 'Phone Blocked, Mind Clear',
      'Reads 10 Pages Before Breakfast', 'No Doomscrolling',
      'Walks With No Headphones', 'Makes The Bed Daily',
      'Gym Before Most People Wake Up', 'Smiles At 6am (For Real)',
    ],
    count: [6, 7],
    upshift: true,
  },
  realsponge: {
    title: 'REAL SPONGEBOB MODE:\n(HARD)',
    keys: ['sponge-hard', 'sponge-rage'],
    pool: [
      'Trains Alone At 5am', 'No P*rn', 'Cold Shower Daily',
      'Replies When He Wants', 'Deep Work: 90 Min Blocks',
      'Intermittent Fasting', 'Zero Doomscrolling', 'Up Before The Alarm',
      'Huberman Routine (Actually)',
    ],
    count: [6, 7],
    upshift: true,
  },
  brainrot: {
    title: 'BRAIN ROT MODE:',
    keys: ['brainrot-'],
    pool: ['Sleeps At 5am', 'Reels Till 3am', 'Skibidi Brain', 'Talks In Memes', 'Cannot Watch A Movie', 'Forgets Why He Walked Here', 'Energy Drink Breakfast', 'Fried By 22', 'Talks To The Algorithm', 'Goon Tabs Open'],
    count: [6, 7],
  },
};

// The subtle Upshift mention: one line inside a positive mode's list.
// `topic` decides which screenshots go with the line (matched against the file
// names in the Upshift screenshots pack: porn-*, socials-*).
type UpshiftTopic = 'porn' | 'socials' | 'both';
const UPSHIFT_ITEMS: { text: string; topic: UpshiftTopic }[] = [
  { text: 'Blocked P*rn (Upshift productivity app)', topic: 'porn' },
  { text: 'Blocked Socials (Upshift productivity app)', topic: 'socials' },
];

// 5–6 modes per deck, so 5–6 slides. Every sequence goes strictly worst → best.
// ladder: positive modes only (easy < normal < hard < sigma/monk)
// duo: mix positive modes, same strict order
// rage: shock/bad modes first, one good mode last (no easy/normal mixed between bad modes)
const LADDERS: Record<string, string[][]> = {
  ladder: [
    ['easy', 'normal', 'hard', 'locked', 'sigma'],
    ['easy', 'normal', 'hard', 'monk', 'sigma'],
    ['easy', 'normal', 'hard', 'sigma', 'monk'],
    ['easy', 'normal', 'locked', 'sigma', 'monk'],
  ],
  duo: [
    ['easy', 'normal', 'hard', 'locked', 'sigma'],
    ['easy', 'normal', 'hard', 'monk', 'sigma'],
    ['easy', 'normal', 'locked', 'monk', 'sigma'],
  ],
  rage: [
    ['overlord', 'npc', 'cope', 'hard', 'sigma'],
    ['mogged', 'npc', 'cope', 'hard', 'locked'],
    ['simp', 'overlord', 'npc', 'hard', 'sigma'],
    ['cooked', 'npc', 'cope', 'hard', 'monk'],
    ['overlord', 'mogged', 'npc', 'locked', 'sigma'],
    ['simp', 'mogged', 'cope', 'hard', 'monk'],
    ['brainrot', 'npc', 'cope', 'hard', 'sigma'],
  ],
};

// What picture to look for per list line (subfolder names), for the small
// pictures under the list.
// Substring of a list line -> words to look for in picture file names / subfolders.
const ITEM_KEYS: [string, string[]][] = [
  ['p*rn', ['nofap']],
  ['porn', ['nofap']],
  ['gooning', ['nofap']],
  ['gooned', ['nofap']],
  ['🌽', ['nofap']],
  ['tattoo', ['nofap']],
  ['her ', ['nofap', 'friends']],
  ['tabs', ['scroll']],
  ['simp', ['craving']],
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
const BAIT_CAPTIONS: Record<ListTool, string[]> = {
  brain: [
    'most of you will relapse by day 9. prove me wrong in the comments',
    'if you still open it "just to check" you are not on day 1, you are on day 0',
    'comment your day count. i will know who is lying',
    'she knows. she just does not say it. comment "day 1" if you are done',
    'nobody is coming to save your brain. do it or keep scrolling',
  ],
  meme: [
    'comment your mode so i can judge you. no lying',
    'if you are on goon overlord mode you already know',
    'tag the one friend who is stuck on npc mode',
    'be honest which one are you. i will reply to every liar',
    'number 1 is most of you and you know it',
  ],
};
const HASHTAGS = ['nofap', 'brainrot', 'dopamine', 'selfimprovement', 'upshift', 'digitaldetox', 'discipline', 'fyp', 'noscroll', 'glowup', 'hardmode'];

// ── Pictures ────────────────────────────────────────────────────────────────
// Dealt off shuffled bags so a batch uses everything before repeating. Rows ask
// for a picture by key; a pack whose SUBFOLDERS are named after the things in it
// ("reading", "gym", "scrolling") gives pictures that match, anything else gives
// a random one from the pack.
class PicturePool {
  private images: LibraryImage[];
  private all: Dealer<LibraryImage>;
  private byKey = new Map<string, Dealer<LibraryImage> | null>();
  private tagOf?: (img: LibraryImage) => string | undefined;
  constructor(images: LibraryImage[], tagOf?: (img: LibraryImage) => string | undefined) {
    this.tagOf = tagOf;
    this.images = images;
    this.all = makeDealer(images);
  }
  get size() {
    return this.images.length;
  }
  // `strict`: only a picture that really matches a key (no random fallback) —
  // used for the small "this is the thing on the list" pictures, where a random
  // photo would be the wrong picture.
  hasTag(mode: string): boolean {
    return this.images.some((i) => this.tagOf?.(i) === mode);
  }
  pick(keys: string[] = [], avoid: string[] = [], strict = false): string | undefined {
    if (!this.images.length) return undefined;
    const id = keys.join('|');
    let d = this.byKey.get(id);
    if (d === undefined) {
      // A key matches the image's subfolder name OR its file name ("read-03.jpg").
      // A sorted picture also carries its mode tag, written "@mode@" (see lib/memeSort.ts).
      const hay = (i: LibraryImage) => `${i.subfolder ?? ''} ${decodeURIComponent(i.url.split('/').pop() ?? '')} @${this.tagOf?.(i) ?? ''}@`.toLowerCase();
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
  // Brain lists: add the brain comparison cover slide (default off).
  cover?: boolean;
  // Ragebait / engagement bait: spicy modes + captions, comment-bait last slide, odd small pictures.
  bait?: boolean;
  // Odd / shocking small pictures (the viral resources pack).
  viral?: LibraryImage[];
  // Meme lists: the mode a big picture was sorted into (lib/memeSort.ts).
  heroTag?: (img: LibraryImage) => string | undefined;
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
  viral: PicturePool;
  upshift: Dealer<{ text: string; topic: UpshiftTopic }>;
  thumbsViral: (avoid: string[]) => string | undefined;
}

function makeBatch(opts: ListDeckOptions): Batch {
  const viralPool = new PicturePool(opts.viral ?? []);
  const themeList = THEMES[opts.tool];
  const themes = opts.themeName ? themeList.filter((t) => t.name === opts.themeName) : themeList;
  return {
    opts,
    themes: makeDealer(themes.length ? themes : themeList),
    // Monkey / spongebob formats only run when asked for (their own sidebar entries).
    formats: makeDealer(FORMATS[opts.tool].map((f) => f.key).filter((k) => k !== 'monkey' && k !== 'sponge')),
    hooks: Object.fromEntries(Object.entries(ARCS).map(([k, v]) => [k, makeDealer(v.hooks)])),
    captions: makeDealer([...CAPTIONS[opts.tool], ...(opts.bait ? BAIT_CAPTIONS[opts.tool] : [])].filter((c) => opts.upshift || !/upshift/i.test(c))),
    hero: new PicturePool(opts.hero, opts.heroTag),
    thumbs: new PicturePool(opts.thumbs),
    cta: new PicturePool(opts.cta),
    viral: viralPool,
    upshift: makeDealer(UPSHIFT_ITEMS),
    thumbsViral: (avoid: string[]) => (opts.bait ? viralPool.pick([], avoid) : undefined),
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
  // The Upshift stage always stays, so the CTA is never dropped.
  const droppable = arc.stages.map((st, i) => (i > 0 && !st.upshift ? i : -1)).filter((i) => i > 0);
  const drop = Math.random() < 0.4 ? rand(droppable) : -1;
  const stages = arc.stages.filter((_, i) => i !== drop);
  let flip = Math.random() < 0.5;
  const stageCards: CardSpec[] = stages.map((st, si) => {
    const photo = batch.thumbs.pick(st.keys, used);
    if (photo) used.push(photo);
    // Big picture = a brain scan whose colours improve with the stage.
    const prog = stages.length > 1 ? si / (stages.length - 1) : 1;
    const band = prog < 0.34 ? 'brain-b1' : prog < 0.67 ? 'brain-b2' : 'brain-b3';
    // Never the same scan twice in a deck: the nearest brightness band with an unused scan wins.
    const bands = band === 'brain-b1' ? ['brain-b1', 'brain-b2', 'brain-b3'] : band === 'brain-b2' ? ['brain-b2', 'brain-b1', 'brain-b3'] : ['brain-b3', 'brain-b2', 'brain-b1'];
    let ref: string | undefined = band === 'brain-b1' && pair && Math.random() < 0.5 && !used.includes(`${pair}#left`) ? `${pair}#left` : undefined;
    for (const b of bands) {
      if (ref) break;
      const r = batch.hero.pick([b], used, true);
      if (r && !used.includes(r)) ref = r;
    }
    ref ??= photo;
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
    // Ragebait: an odd little picture (WTF food, burnt chicken...) among the mini ones.
    if (batch.opts.bait && batch.opts.smallPics && Math.random() < 0.6) {
      const v = batch.thumbsViral(used);
      if (v) { shown.push(v); used.push(v); }
    }
    // The stage that mentions Upshift also gets its screenshot as one of the mini pictures.
    if (st.upshift && batch.opts.upshift) {
      shown.unshift(...upshiftShots(batch, arcKey === 'porn' ? 'porn' : 'socials'));
    }
    return { ...base, title: fill(st.title, thing), blocks, thumbs: shown.length ? shown : undefined };
  });

  const cards = batch.opts.cover ? [cover, ...stageCards] : stageCards;
  return { hook: batch.opts.bait && Math.random() < 0.5 ? rand(BAIT_HOOKS[arcKey] ?? BAIT_HOOKS.scroll) : hook, cards };
}

// ── Meme Lists builder ──────────────────────────────────────────────────────
function itemKeys(item: string): string[] {
  const low = item.toLowerCase();
  return ITEM_KEYS.find(([k]) => low.includes(k))?.[1] ?? [];
}

// Monkey / Spongebob lists run the SAME modes and lists as Meme Lists; only the big picture
// changes. Per mode: which file-name prefixes of that pack to take the picture from.
const THEMED_PICS: Record<string, Record<string, string[]>> = {
  sponge: {
    easy: ['sponge-easy', 'sponge-patrick'], normal: ['sponge-happy', 'sponge-work'], hard: ['sponge-hard'], monk: ['sponge-squid'],
    npc: ['sponge-work', 'sponge-squid'], cope: ['sponge-squid', 'sponge-easy'], locked: ['sponge-hard', 'sponge-rage'],
    sigma: ['sponge-hard'], brainrot: ['sponge-easy', 'sponge-patrick'], overlord: ['sponge-krabs', 'sponge-easy'],
    simp: ['sponge-easy', 'sponge-squid'], mogged: ['sponge-squid', 'sponge-work'], cooked: ['sponge-work', 'sponge-easy'],
  },
  monkey: {
    easy: ['monkey-eat', 'monkey-human'], normal: ['monkey-human', 'monkey-work'], hard: ['monkey-gym', 'monkey-sigma'],
    monk: ['monkey-suit', 'monkey-cool'], npc: ['monkey-phone', 'monkey-eat'], cope: ['monkey-sad'],
    locked: ['monkey-gym', 'monkey-sigma'], sigma: ['monkey-sigma', 'monkey-cool'], brainrot: ['monkey-phone'],
    overlord: ['monkey-phone', 'monkey-sad'], simp: ['monkey-sad', 'monkey-phone'], mogged: ['monkey-money', 'monkey-cool'],
    cooked: ['monkey-sad', 'monkey-work'],
  },
};

function buildMemeDeck(batch: Batch, theme: ThemeDef, format: string): { hook: string; cards: CardSpec[] } {
  const themed = THEMED_PICS[format];
  let order = rand(themed ? [...LADDERS.ladder, ...LADDERS.duo, ...LADDERS.rage] : LADDERS[format] ?? LADDERS.ladder);
  // Themed packs: a mode with no picture sorted into it is dropped instead of borrowing a wrong one.
  if (themed) {
    const sorted = order.filter((k) => batch.hero.hasTag(k));
    if (sorted.length >= 4) order = sorted;
  }
  // One global ranking, worst first, so no deck can come out in a different order.
  const RANK = ['overlord', 'brainrot', 'cooked', 'mogged', 'simp', 'cope', 'npc', 'easy', 'normal', 'hard', 'locked', 'sigma', 'monk'];
  order = [...order].sort((a, b) => RANK.indexOf(a) - RANK.indexOf(b));
  // Single avoid list shared across hero and thumbs — no image ever appears twice in one deck.
  const used: string[] = [];
  const base = { layout: 'mode' as const, bg: theme.bg, ink: theme.ink, handle: batch.opts.handle || undefined };

  // Upshift appears ONCE per deck, only in the last or second-to-last mode (a positive one).
  const upshiftAt = [order.length - 1, order.length - 2].find((i) => i >= 0 && MODES[order[i]].upshift) ?? -1;
  const cards: CardSpec[] = order.map((key, idx) => {
    const def = MODES[key];
    const n = randInt(def.count[0], def.count[1]);
    let items = shuffled(def.pool).slice(0, n);
    if (key === 'overlord') items = [rand(OVERLORD_SIGNATURES), ...items.slice(0, n - 1)];
    let upshiftTopic: UpshiftTopic = 'porn';
    const withUpshift = idx === upshiftAt && !!batch.opts.upshift;
    if (withUpshift) {
      const up = batch.upshift.next()!;
      items = [...items.slice(0, n - 1), up.text];
      upshiftTopic = up.topic;
    }
    // Pictures sorted into this mode first; the old file-name guess only when none is sorted.
    const image = batch.hero.pick([`@${key}@`], used, true) ?? batch.hero.pick(themed?.[key] ?? def.keys, used);
    if (image) used.push(image);
    let thumbs: string[] | undefined;
    if (batch.opts.smallPics && batch.thumbs.size) {
      thumbs = [];
      // One picture per list line that has a matching one…
      for (const it of items) {
        if (thumbs.length >= 9) break;
        const keys = itemKeys(it);
        if (!keys.length) continue;
        const t = batch.thumbs.pick(keys, used, true);
        if (t && !used.includes(t)) { thumbs.push(t); used.push(t); }
      }
      // Ragebait: odd little pictures (WTF food, burnt chicken...) first.
      for (let i = 0; i < 2; i++) {
        const v = batch.thumbsViral(used);
        if (v && !used.includes(v)) { thumbs.push(v); used.push(v); }
      }
      // …and a few extras so the card is never bare.
      while (thumbs.length < 5) {
        const t = batch.thumbs.pick([], used);
        if (!t || used.includes(t)) break;
        thumbs.push(t);
        used.push(t);
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
