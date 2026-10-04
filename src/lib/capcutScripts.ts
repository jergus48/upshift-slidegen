// ── Text scripts for CapCut formats ──────────────────────────────────────────
// The words on screen, written to the shape every format shares (see the
// Luke Swan breakdown): a status loss BEFORE the drop, the turn in the gap,
// the glow-up AFTER it. Screen time is never the topic — it's the reason the
// character lost. Short lines, in quotes when someone says them.
//
//   ch   — before the drop, spread over the chopped clips, one line per stretch
//   gap  — the turn: the black gap before the drop (or the last beat of chopped)
//   bf   — after the drop, over the buffed clips
//   sc   — optional, over the scoreboard / rating screens
//
// None of these need a girl on screen: 'she' scripts wait for clips tagged
// for her.
//
// Two topics: screen time, and 🌽 (lust). The 🌽 scripts follow the slideshow
// content rule — never the literal word, always 🌽 or p*rn / g00n — and carry
// more lines, so the words change every few cuts instead of twice a video.
export type ScriptTopic = 'screen' | 'lust';

export const TOPICS: { key: ScriptTopic; label: string }[] = [
  { key: 'screen', label: 'Screen time' },
  { key: 'lust', label: '🌽' },
];

export interface TextScript {
  id: string;
  topic?: ScriptTopic; // 'screen' when left out
  ch: string[];
  gap?: string;
  bf: string[];
  sc?: string;
  // One line held over the whole video instead of ch/gap/bf ("Just the truth").
  all?: string;
  caption: string;
}

export const HASHTAGS: Record<ScriptTopic, string[]> = {
  screen: ['#lockin', '#glowup', '#ascend', '#brainrot', '#beforevsafter'],
  lust: ['#nofap', '#upshift', '#nolust', '#glowup', '#ascend'],
};

export const SCRIPTS: TextScript[] = [
  // ── Screen time, in his own voice: what he tells himself, quoted, trailing
  // off; the turn is plain; after the drop almost nothing.
  { id: '9to5', ch: ['"9-5 in doomscrolling…"', '"and I wonder why I\'m chopped"'], gap: '"Clock out."', bf: ['…'], caption: 'Damn…' },
  { id: 'overtime', ch: ['"11h screen time…"', '"That\'s a full shift"', '"And nobody\'s paying me"'], gap: '"I quit."', bf: ['…'], caption: 'It\'s tuff out there…' },
  { id: 'unpaid-intern', ch: ['"Unpaid intern at TikTok…"', '"Since 2019"'], gap: '"Resigned."', bf: ['How did I do it?'], sc: '11h → 1h', caption: 'Generational save.' },
  { id: 'dont-scroll', ch: ['"If your screen time is over 6h…"', '"don\'t scroll."', '"This one\'s about you"'], gap: '"…it\'s about me"', bf: ['Then lock in…'], caption: 'Damn…' },
  { id: 'wont-finish', ch: ['"My attention span is 47 seconds…"', '"I won\'t even finish this video"'], gap: '"Prove me wrong"', bf: ['…'], caption: 'Prove them wrong.' },
  { id: 'rate-me', ch: ['"Rate my screen time"', '"11h 42m 💀"'], gap: '"I know…"', bf: ['…'], sc: '11h → 1h', caption: 'Rate it 1-10' },
  { id: 'designed', ch: ['"It was designed so I can\'t stop…"', '"It\'s not my fault"', '"But it\'s my problem"'], gap: '"Time to lock in"', bf: ['…'], caption: 'It\'s tuff out there…' },
  { id: 'npc', ch: ['"Wake up. Scroll."', '"School. Scroll."', '"Bed. Scroll."'], gap: '"…I\'m an NPC"', bf: ['Main character now'], caption: 'Damn…' },
  { id: 'boring', ch: ['"Bro you\'re always on your phone"', '"You\'re boring"', '"Bro just lock in…"'], gap: '"Ok…"', bf: ['…'], caption: 'Dialed in…' },
  { id: 'nobody-asked', ch: ['"Why didn\'t they invite me?"', '"Was it something I said?"', '*Sees their story together*'], gap: '"Oh… I get it"', bf: ['…'], caption: 'Damn…' },
  { id: 'moved-on', ch: ['"They got jobs…"', '"They got in shape…"', '"I got 10h screen time"'], gap: '"It\'s time to make a change"', bf: ['How did I do it?'], sc: '10h → 1h', caption: 'Generational save.' },
  { id: 'chopped', ch: ['"You\'re chopped"', '"Just get off your phone"', '"Bro just lock in…"'], gap: '"Ok…"', bf: ['…'], caption: 'Dialed in…' },
  { id: 'mom', ch: ['"Are you even listening?"', '*Still on my phone*'], gap: '"She deserved better"', bf: ['…'], caption: 'Damn…' },
  { id: 'dad', ch: ['"What are you doing with your life?"', '*Keeps scrolling*'], gap: '"Prove them wrong"', bf: ['…'], caption: 'Prove them wrong.' },
  { id: 'exam', ch: ['"Exam tomorrow…"', '"Just one more video"', '*4 hours later*'], gap: '"Failed."', bf: ['Never again'], sc: '9h → 1h', caption: 'Generational save.' },
  { id: 'gym', ch: ['"I\'ll go to the gym after this video"', '*2 hours later*', '"Tomorrow then…"'], gap: '"No more tomorrow"', bf: ['…'], caption: 'Dialed in…' },
  { id: 'dreams', ch: ['"I wanted to start a business…"', '"I wanted to get in shape…"', '"I watched other people do it on TikTok"'], gap: '"It\'s time to make a change"', bf: ['How did I do it?'], caption: 'Damn…' },
  { id: 'years', ch: ['"9h a day…"', '"That\'s 28 years of my life"', '"On a phone"'], gap: '"Not anymore"', bf: ['…'], sc: '9h → 1h', caption: 'Damn…' },
  { id: 'pickups', ch: ['"Picked up my phone 186 times today…"', '"For nothing"'], gap: '"Time to lock in"', bf: ['…'], caption: 'Generational save.' },
  { id: 'sleep', ch: ['"I spent more time on TikTok this year…"', '"than sleeping"'], gap: '"Oh… I get it"', bf: ['Then lock in…'], caption: 'It\'s tuff out there…' },
  { id: 'report', ch: ['"Screen time: 11h 42m…"', '"Up 23% from last week"'], gap: '"That\'s enough"', bf: ['How did I do it?'], sc: '11h 42m → 58m', caption: 'Generational save.' },
  { id: 'mid', ch: ['"Why am I so mid?"', '"Why am I always tired?"', '"Why can\'t I focus?"'], gap: '"Oh… I get it"', bf: ['How did I do it?'], caption: 'Generational save.' },
  { id: '3am', ch: ['"3 AM…"', '"Why am I still scrolling"', '"Just one more…"'], gap: '"Last time."', bf: ['…'], caption: 'Damn…' },
  { id: 'brain-fog', ch: ['"Why can\'t I read a page?"', '"Why can\'t I finish a movie?"', '"Why can\'t I think?"'], gap: '"Oh… I get it"', bf: ['Then lock in…'], caption: 'Damn…' },
  { id: 'summer', ch: ['"Summer\'s over…"', '"What did I even do?"', '"Screen time: 847 hours"'], gap: '"Never again"', bf: ['…'], caption: 'It\'s tuff out there…' },

  // ── 🌽, written the way Luke Swan's videos are: 1–4 lines in the voice in
  // his head, quoted, trailing off; the turn is quitting; after the drop
  // almost nothing — the picture is the glow-up. One format per entry, so
  // every shape gets tested.
  // Talking to himself at night
  { id: 'night-again', topic: 'lust', ch: ['2:47 AM', '"Why am I doing this again…"', '"You said last time was the last time"'], gap: '*Actually quits 🌽*', bf: ['1 year later…', 'Then ascend…'], caption: 'Think I needed it tbf' },
  { id: 'night-promise', topic: 'lust', ch: ['"Last time I swear"', '*Day 1 again*', '"I need to quit 🌽"'], bf: ['How did I do it?'], caption: 'Think I needed it tbf' },
  { id: 'night-wrong', topic: 'lust', ch: ['"What is wrong with me…"', '"Why can\'t I just stop"'], gap: 'Oh… I get it', bf: ['Then quit 🌽…'], caption: 'Just the truth' },
  // Question → answer
  { id: 'wanted', topic: 'lust', ch: ['"Will I ever be wanted"'], bf: ['Yes'], caption: 'Damn…' },
  { id: 'tired', topic: 'lust', ch: ['"Why am I always tired?"', '"Why can\'t I look her in the eyes?"', '"Oh… I get it"'], bf: ['Then quit 🌽…'], caption: 'Just the truth' },
  { id: 'denial', topic: 'lust', ch: ['"Why won\'t she text me back?"', '"Is it my looks?"', '"NO! It can\'t be the 🌽…"', '"Oh… I get it"'], bf: ['Then lock-in…', 'Prove them wrong'], caption: 'Her loss…' },
  // Timeline
  { id: 'age', topic: 'lust', ch: ['Age 16: g00ning every night…', '17 year old me thinking it\'s normal…'], bf: ['Age 18: quit 🌽…', 'Then ascend…'], caption: 'Double ascension…' },
  // Story with an action in asterisks
  { id: 'gf-caught', topic: 'lust', ch: ['"I love my gf so much"', '*She finds my search history*', '"Breaks up with me"', '"I need to quit 🌽"'], bf: ['How did I do it?'], caption: 'Holy cannon event.' },
  { id: 'replaced', topic: 'lust', ch: ['"She\'ll never leave me"', '*Gets replaced by a guy who doesn\'t goon*', '"Oh… I get it"'], bf: ['Prove them wrong'], caption: 'Her loss…' },
  { id: 'gf-year', topic: 'lust', ch: ['"This year I\'m gonna get a girlfriend"', '"Not my type, sorry"', '"Time to quit 🌽"'], bf: ['…'], caption: 'Damn…' },
  // One line over the whole video
  { id: 'prostate', topic: 'lust', all: 'I\'d rather die of prostate cancer than be a g00ner', ch: [], bf: [], caption: 'Just the truth' },
  { id: 'reminder', topic: 'lust', all: 'Friendly reminder that your face won\'t change while you\'re still g00ning', ch: [], bf: [], caption: 'Just the truth' },
  { id: 'pov-90', topic: 'lust', all: 'POV: You quit 🌽 for 90 days…', ch: [], bf: [], caption: 'Holy cannon event.' },
  { id: 'pov-ex', topic: 'lust', all: 'POV: Your ex found out you quit 🌽…', ch: [], bf: [], caption: 'Does she regret it now' },
  { id: 'goon-effect', topic: 'lust', all: 'The goon effect…', ch: [], bf: [], caption: 'Damn…' },
  { id: 'grandpa', topic: 'lust', all: 'My grandpa told me quitting lust will unlock infinite women....', ch: [], bf: [], caption: 'he was damn right' },
];

export function pickScript(topic: ScriptTopic, avoid?: string): TextScript {
  const pool = SCRIPTS.filter((s) => (s.topic ?? 'screen') === topic && s.id !== avoid);
  return pool[Math.floor(Math.random() * pool.length)];
}
