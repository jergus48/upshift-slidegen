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
export interface TextScript {
  id: string;
  ch: string[];
  gap?: string;
  bf: string[];
  sc?: string;
  caption: string;
}

export const HASHTAGS = ['#lockin', '#glowup', '#ascend', '#brainrot', '#beforevsafter'];

export const SCRIPTS: TextScript[] = [
  // ── Ragebait: the job you didn't apply for ──
  { id: '9to5', ch: ['You work a 9-5 in scrolling', 'and wonder why you\'re chopped'], gap: 'Clock out.', bf: ['…'], caption: 'Damn…' },
  { id: 'overtime', ch: ['11h screen time', 'That\'s a full shift', 'And nobody\'s paying you'], gap: 'Quit.', bf: ['…'], caption: 'It\'s tuff out there…' },
  { id: 'unpaid-intern', ch: ['Unpaid intern at TikTok', 'Since 2019'], gap: 'Resigned.', bf: ['How did I do it?'], sc: '11h → 1h', caption: 'Generational save.' },
  { id: 'ceo', ch: ['They\'re building companies', 'You\'re building a For You page'], gap: 'Time to lock in', bf: ['…'], caption: 'Damn…' },
  { id: 'dont-scroll', ch: ['If your screen time is over 6h', 'don\'t scroll.', 'This one\'s about you'], gap: 'You know it is', bf: ['Then lock in…'], caption: 'Damn…' },
  { id: 'wont-finish', ch: ['Your attention span is 47 seconds', 'You won\'t finish this video'], gap: 'Prove me wrong', bf: ['…'], caption: 'Prove them wrong.' },
  { id: 'rate-me', ch: ['Rate my screen time', '11h 42m 💀'], gap: 'I know.', bf: ['Rate it now'], sc: '11h → 1h', caption: 'Rate it 1-10' },
  { id: 'while-you-scroll', ch: ['While you scroll', 'someone else is taking your spot'], gap: 'Prove them wrong', bf: ['How did I do it?'], caption: 'Damn…' },
  { id: 'designed', ch: ['It was designed so you can\'t stop', 'It\'s not your fault', 'But it\'s your problem'], gap: 'Time to lock in', bf: ['…'], caption: 'It\'s tuff out there…' },
  { id: 'npc', ch: ['Wake up. Scroll.', 'School. Scroll.', 'Bed. Scroll.'], gap: 'NPC behaviour.', bf: ['Main character now'], caption: 'Damn…' },
  { id: 'thumb', ch: ['Your thumb ran a marathon today', 'Your legs didn\'t'], gap: 'Time to lock in', bf: ['…'], caption: 'Dialed in…' },

  // ── Friends, being left out ──
  { id: 'boring', ch: ['"Bro you\'re always on your phone"', '"You\'re boring"', '"Bro just lock in…"'], gap: 'Ok…', bf: ['…'], caption: 'Dialed in…' },
  { id: 'nobody-asked', ch: ['They all went out', 'Nobody asked me', 'Because I\'m always home scrolling'], gap: 'It\'s time to make a change', bf: ['Now they ask'], caption: 'Damn…' },
  { id: 'group-pic', ch: ['Everyone\'s in the group pic', 'I\'m in the corner on my phone'], gap: 'Never again', bf: ['…'], caption: 'It\'s tuff out there…' },
  { id: 'moved-on', ch: ['They got jobs', 'They got in shape', 'I got 10h screen time'], gap: 'It\'s time to make a change', bf: ['How did I do it?'], sc: '10h → 1h', caption: 'Generational save.' },
  { id: 'chopped', ch: ['"You\'re chopped"', '"Just get off your phone"', '"Bro just lock in…"'], gap: 'Ok…', bf: ['…'], caption: 'Dialed in…' },

  // ── Family ──
  { id: 'mom', ch: ['"Are you even listening?"', 'Me: 📱'], gap: 'She deserved better', bf: ['Now I listen'], caption: 'Damn…' },
  { id: 'dad', ch: ['"What are you doing with your life?"', 'Me: scrolling'], gap: 'Prove them wrong', bf: ['…'], caption: 'Prove them wrong.' },
  { id: 'brother', ch: ['My little brother asked me to play', 'I said "later"', 'Later never came'], gap: 'Time to lock in', bf: ['Now I\'m there'], caption: 'Damn…' },

  // ── School, ambition ──
  { id: 'exam', ch: ['Exam tomorrow', 'Just one more video', '4 hours later'], gap: 'Failed.', bf: ['Never again'], sc: '9h → 1h', caption: 'Generational save.' },
  { id: 'gym', ch: ['"I\'ll go to the gym after this video"', '2 hours later', '"Tomorrow then"'], gap: 'No more tomorrow', bf: ['…'], caption: 'Dialed in…' },
  { id: 'dreams', ch: ['Wanted to start a business', 'Wanted to get in shape', 'Watched other people do it on TikTok'], gap: 'It\'s time to make a change', bf: ['How did I do it?'], caption: 'Damn…' },

  // ── Numbers ──
  { id: 'years', ch: ['9h a day', 'That\'s 28 years of my life', 'On a phone'], gap: 'Not anymore', bf: ['…'], sc: '9h → 1h', caption: 'Damn…' },
  { id: 'pickups', ch: ['Picked up my phone 186 times today', 'For nothing'], gap: 'Time to lock in', bf: ['Now it\'s 12'], caption: 'Generational save.' },
  { id: 'sleep', ch: ['Spent more time on TikTok this year', 'than sleeping'], gap: 'Oh… I get it', bf: ['Then lock in…'], caption: 'It\'s tuff out there…' },
  { id: 'report', ch: ['Screen time: 11h 42m', 'Up 23% from last week'], gap: 'That\'s enough', bf: ['How did I do it?'], sc: '11h 42m → 58m', caption: 'Generational save.' },

  // ── How it feels ──
  { id: 'mid', ch: ['"Why am I so mid?"', '"Why am I always tired?"', '"Why can\'t I focus?"'], gap: 'It\'s time to make a change', bf: ['How did I do it?'], caption: 'Generational save.' },
  { id: '3am', ch: ['3 AM', 'Still scrolling', 'Hating myself'], gap: 'Last time.', bf: ['Asleep by 11 now'], caption: 'Damn…' },
  { id: 'brain-fog', ch: ['Can\'t read a page', 'Can\'t finish a movie', 'Can\'t think'], gap: 'Brain rot is real', bf: ['Then lock in…'], caption: 'Damn…' },
  { id: 'summer', ch: ['Summer\'s over', 'What did I do?', 'Screen time: 847 hours'], gap: 'Never again', bf: ['…'], caption: 'It\'s tuff out there…' },
];

export function pickScript(avoid?: string): TextScript {
  const pool = SCRIPTS.filter((s) => s.id !== avoid);
  return pool[Math.floor(Math.random() * pool.length)];
}
