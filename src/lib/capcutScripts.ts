// ── Text scripts for CapCut formats ──────────────────────────────────────────
// The words on screen, written to the shape every format shares (see the
// Luke Swan breakdown): a status loss BEFORE the drop, the turn on the last
// chopped shot, the glow-up AFTER it. Screen time is never the topic — it's the reason the
// character lost. Short lines, in quotes when someone says them.
//
//   ch   — before the drop, spread over the chopped clips, one line per stretch
//   gap  — the turn, on the last chopped shot; the black gap stays empty
//   bf   — after the drop, over the buffed clips
//   sc   — optional, over the scoreboard / rating screens
//
// None of these need a girl on screen: 'she' scripts wait for clips tagged
// for her.
//
// Three topics: screen time, 🌽 (lust) and tips. The 🌽 lines follow the
// slideshow content rule — never the literal word, always 🌽 or p*rn / g00n.
//
// Tips: the shape that carries Luke Swan's biggest posts ("3 easy ways to save
// your sideprofile"). The hook promises a number and a result and holds over
// the chopped clips; after the drop each tip gets its own cut, so the list
// changes on the beat. The tips are the payoff — short, concrete, savable.
export type ScriptTopic = 'screen' | 'culprit' | 'lust' | 'tips';

export const TOPICS: { key: ScriptTopic; label: string }[] = [
  { key: 'screen', label: 'Screen time' },
  { key: 'culprit', label: 'Culprit' },
  { key: 'lust', label: '🌽' },
  { key: 'tips', label: 'Tips' },
];

export interface TextScript {
  id: string;
  topic?: ScriptTopic; // 'screen' when left out
  ch: string[];
  // One line, or a sentence split into words — one word per cut.
  gap?: string | string[];
  bf: string[];
  sc?: string;
  // One line held over the whole video instead of ch/gap/bf ("Just the truth").
  all?: string;
  caption: string;
  // Written before the Luke Swan rewrite; kept, but no longer picked.
  old?: boolean;
}

// Stored WITHOUT the '#', the same convention decks use — the sidecar adds it.
export const HASHTAGS: Record<ScriptTopic, string[]> = {
  screen: ['lockin', 'glowup', 'ascend', 'brainrot', 'beforevsafter'],
  culprit: ['looksmaxxing', 'glowup', 'ascend', 'lockin', 'screentime'],
  lust: ['nofap', 'upshift', 'nolust', 'glowup', 'ascend'],
  tips: ['glowup', 'ascend', 'lockin', 'glowuptips', 'selfimprovement'],
};

// The post title for a script: its held line, else its first line — without
// the on-screen quote marks, which read as noise in a post title.
export function scriptTitle(script: TextScript): string {
  return (script.all ?? script.ch[0] ?? script.caption).replace(/^["“]+|["”]+$/g, '').trim();
}

export const SCRIPTS: TextScript[] = [
  // Every script has the same rhythm, so the words change every 2–3s:
  // 2 lines of the problem over the chopped clips, the turn on the last chopped
  // shot (never over the black gap), then 3 lines of payoff after the drop —
  // a real answer, never just '…', so there's a reason to watch to the end.

  // ── Screen time, in his own voice: what he tells himself, quoted.
  { id: '9to5', old: true, ch: ['"9-5 in doomscrolling…"', '"and I wonder why I\'m chopped"'], gap: '"Clock out."', bf: ['Deleted TikTok', '1h screen time', '6 months later…'], caption: 'Damn…' },
  { id: 'unpaid-intern', old: true, ch: ['"Unpaid intern at TikTok…"', '"Since 2019"'], gap: '"Resigned."', bf: ['11h → 1h', 'Gym instead of scrolling', 'Promoted myself'], caption: 'Generational save.' },
  { id: 'wont-finish', old: true, ch: ['"My attention span is 47 seconds…"', '"I won\'t even finish this video"'], gap: '"Prove me wrong"', bf: ['You made it this far', 'So you can lock in', 'Comment "day 1"'], caption: 'Prove them wrong.' },
  { id: 'rate-me', old: true, ch: ['"Rate my screen time"', '"11h 42m 💀"'], gap: '"I know…"', bf: ['Now rate this', '58 minutes', 'Rate it 1-10'], caption: 'Rate it 1-10' },
  { id: 'npc', old: true, ch: ['"Wake up. Scroll. School. Scroll."', '"Bed. Scroll."'], gap: '"…I\'m an NPC"', bf: ['Wake up. Gym.', 'Work. Read.', 'Main character now'], caption: 'Damn…' },
  { id: 'chopped', old: true, ch: ['"You\'re chopped"', '"Just get off your phone"'], gap: '"Ok…"', bf: ['Got off my phone', '1 year later…', 'Who\'s chopped now?'], caption: 'Dialed in…' },
  { id: 'nobody-asked', old: true, ch: ['"Why didn\'t they invite me?"', '*Sees their story together*'], gap: '"Oh… I get it"', bf: ['Put the phone down', 'Started showing up', 'Now they ask me'], caption: 'Damn…' },
  { id: 'moved-on', old: true, ch: ['"They got jobs. They got in shape."', '"I got 10h screen time"'], gap: '"My turn."', bf: ['10h → 1h', 'Gym 5x a week', 'Caught up in a year'], caption: 'Generational save.' },
  { id: 'mom', old: true, ch: ['"Are you even listening?"', '*Still on my phone*'], gap: '"She deserved better"', bf: ['Phone away at dinner', 'Took her out', 'She noticed'], caption: 'Call your mom.' },
  { id: 'exam', old: true, ch: ['"Exam tomorrow… one more video"', '*4 hours later*'], gap: '"Failed."', bf: ['Blocked TikTok', 'Studied 2h a day', 'Top of the class'], caption: 'Generational save.' },
  { id: 'gym', old: true, ch: ['"Gym after this video"', '*2 hours later* "Tomorrow then…"'], gap: '"No more tomorrow"', bf: ['Day 1', 'Day 100', 'Day 365'], caption: 'Dialed in…' },
  { id: 'years', old: true, ch: ['"9h a day on my phone…"', '"That\'s 28 years of my life"'], gap: '"Not anymore"', bf: ['9h → 1h', '8 hours back every day', 'Look what I did with them'], caption: 'Damn…' },
  { id: 'report', old: true, ch: ['"Screen time: 11h 42m…"', '"Up 23% from last week"'], gap: '"That\'s enough"', bf: ['Week 1: 6h', 'Week 4: 2h', 'Now: 58m'], caption: 'Generational save.' },
  { id: 'mid', old: true, ch: ['"Why am I so mid?"', '"Why am I always tired?"'], gap: '"Oh… I get it"', bf: ['Less phone', 'More sleep, more gym', 'Not mid anymore'], caption: 'Generational save.' },
  { id: '3am', old: true, ch: ['"3 AM… still scrolling"', '"Just one more…"'], gap: '"Last time."', bf: ['Phone out of the bedroom', 'Asleep by 11', 'Different face'], caption: 'Damn…' },
  { id: 'summer', old: true, ch: ['"Summer\'s over… what did I do?"', '"Screen time: 847 hours"'], gap: '"Never again"', bf: ['Next summer:', '1h screen time', 'Different person'], caption: 'It\'s tuff out there…' },

  // ── 🌽, the voice in his head, quoted. The turn is quitting; after the drop
  // the glow-up, said plainly.
  { id: 'night-again', old: true, topic: 'lust', ch: ['2:47 AM', '"You said last time was the last time"'], gap: '*Actually quits 🌽*', bf: ['Day 30', 'Day 365', 'Then ascend…'], caption: 'Think I needed it tbf' },
  { id: 'night-promise', old: true, topic: 'lust', ch: ['"Last time I swear"', '*Day 1 again*'], gap: '"I need to quit 🌽"', bf: ['Day 1 for real', '1 year clean', 'Never going back'], caption: 'Think I needed it tbf' },
  { id: 'wanted', old: true, topic: 'lust', ch: ['"Will I ever be wanted?"', '"Why can\'t I look her in the eyes?"'], gap: '"Oh… I get it"', bf: ['Quit 🌽', '1 year later…', 'Yes'], caption: 'Damn…' },
  { id: 'tired', old: true, topic: 'lust', ch: ['"Why am I always tired?"', '"Why can\'t I focus?"'], gap: '"Oh… I get it"', bf: ['Quit 🌽', 'Energy came back', 'Face came back'], caption: 'Just the truth' },
  { id: 'denial', old: true, topic: 'lust', ch: ['"Why won\'t she text me back?"', '"NO! It can\'t be the 🌽…"'], gap: '"Oh… I get it"', bf: ['Quit 🌽', 'Locked in', 'Now she texts first'], caption: 'Her loss…' },
  { id: 'age', old: true, topic: 'lust', ch: ['Age 16: g00ning every night…', 'Age 17: thinking it\'s normal…'], gap: 'Age 18: quit 🌽', bf: ['Age 19:', 'Then ascend…', 'Double ascension'], caption: 'Double ascension…' },
  { id: 'gf-caught', old: true, topic: 'lust', ch: ['"I love my gf so much"', '*She finds my search history*'], gap: '*She leaves*', bf: ['Quit 🌽', '1 year later…', 'She wants me back'], caption: 'Holy cannon event.' },
  { id: 'replaced', old: true, topic: 'lust', ch: ['"She\'ll never leave me"', '*Replaced by a guy who doesn\'t g00n*'], gap: '"Oh… I get it"', bf: ['Quit 🌽', 'Locked in', 'Prove them wrong'], caption: 'Her loss…' },
  { id: 'gf-year', old: true, topic: 'lust', ch: ['"This year I\'m getting a girlfriend"', '"Not my type, sorry"'], gap: '"Time to quit 🌽"', bf: ['6 months later…', 'Same girl', '"Are you free Friday?"'], caption: 'Damn…' },
  { id: 'prostate', old: true, topic: 'lust', ch: ['I\'d rather die of prostate cancer', 'than be a g00ner'], gap: '*Quits 🌽*', bf: ['1 year clean', 'Test went up', 'Just the truth'], caption: 'Just the truth' },
  { id: 'reminder', old: true, topic: 'lust', ch: ['Friendly reminder:', 'your face won\'t change while you\'re g00ning'], gap: '*Quits 🌽*', bf: ['90 days later…', 'It changed', 'Your turn'], caption: 'Just the truth' },
  { id: 'pov-90', old: true, topic: 'lust', ch: ['POV: You quit 🌽 for 90 days', 'Day 1:'], gap: 'Day 30:', bf: ['Day 60:', 'Day 90:', 'Same guy?'], caption: 'Holy cannon event.' },
  { id: 'pov-ex', old: true, topic: 'lust', ch: ['POV: Your ex found out you quit 🌽', 'Before:'], gap: '*Quits 🌽*', bf: ['After:', '"Can we talk?"', 'Left on read'], caption: 'Does she regret it now' },
  { id: 'goon-effect', old: true, topic: 'lust', ch: ['The g00n effect…', 'Year 1 of g00ning'], gap: 'Year 1 without 🌽', bf: ['Clear skin', 'Sharp eyes', 'Different man'], caption: 'Damn…' },
  { id: 'grandpa', old: true, topic: 'lust', ch: ['My grandpa told me quitting lust', 'will unlock infinite women....'], gap: '*Quits 🌽*', bf: ['1 year later…', 'he was damn right', 'Thanks grandpa'], caption: 'he was damn right' },

  // ── Tips, fitted to the chopped → buffed shape: the chopped clips show what
  // he was doing wrong, the turn says he changed it, and after the drop each
  // tip lands on its own cut — the tips are why he looks like that now.
  { id: 'tips-3things', old: true, topic: 'tips', ch: ['How I went from chopped to this in 1 year', '"9h screen time, 4h sleep…"'], gap: 'I changed 3 things', bf: ['1. Phone out of the bedroom', '2. Quit 🌽', '3. Lift 4x a week'], caption: 'Save this before it\'s gone' },
  { id: 'tips-face', old: true, topic: 'tips', ch: ['"Why does my face look so tired?"', '"Skincare isn\'t working…"'], gap: 'It wasn\'t skincare', bf: ['1. Quit 🌽', '2. Cut sugar', '3. Sleep before midnight'], caption: 'Number 1 is underrated' },
  { id: 'tips-eyes', old: true, topic: 'tips', ch: ['"Why are my eyes always dead?"', '*Scrolls till 3 AM*'], gap: 'Fixed it in 30 days', bf: ['1. No phone after 10pm', '2. Morning sunlight', '3. Quit 🌽'], caption: 'Try it for 30 days' },
  { id: 'tips-screen', old: true, topic: 'tips', ch: ['"9h screen time…"', '"and I wonder why I\'m chopped"'], gap: 'How I got it to 1h', bf: ['1. Phone charges outside the room', '2. Apps off the home screen', '3. Blocker after 9pm'], sc: '9h → 1h', caption: 'Step 3 did the most' },
  { id: 'tips-quit', old: true, topic: 'tips', ch: ['"I\'ll quit tomorrow"', '*Day 1 again*'], gap: 'What finally worked', bf: ['1. Phone in another room at night', '2. 20 pushups every urge', '3. App blocker on 🌽'], caption: 'Works every time' },
  { id: 'tips-test', old: true, topic: 'tips', ch: ['"Always tired, no drive…"', '"Is this just how I am?"'], gap: 'It wasn\'t', bf: ['1. Sleep 8h', '2. Lift heavy', '3. Quit 🌽'], caption: 'Save this' },
  { id: 'tips-jaw', old: true, topic: 'tips', ch: ['"Why don\'t I have a jawline?"', '*Eats junk, scrolls all day*'], gap: '1 year later…', bf: ['1. Lost 5% body fat', '2. Fixed my posture', '3. Less salt, more water'], caption: 'No surgery needed' },
  { id: 'tips-morning', old: true, topic: 'tips', ch: ['"Wake up. Scroll."', '"Scroll. Bed."'], gap: 'Then I changed my mornings', bf: ['1. No phone the first hour', '2. Cold shower', '3. Train'], caption: 'Save it for tomorrow' },
  { id: 'tips-30days', old: true, topic: 'tips', ch: ['"I\'m so mid…"', '"Nothing ever changes"'], gap: 'Did this for 30 days', bf: ['1. Bed by 11', '2. No 🌽', '3. Under 2h screen time'], caption: 'Day 1 starts today' },
  { id: 'tips-eyecontact', old: true, topic: 'tips', ch: ['"Why can\'t I look her in the eyes?"', '*g00ns every night*'], gap: 'Oh… I get it', bf: ['1. Quit 🌽', '2. Hit the gym', '3. Talk to 1 stranger a day'], caption: 'Where are you at?' },

  // ── The Luke Swan shape: what OTHER people say about him, with an emoji for
  // what he is (🪳 → 🦋), one short line before the drop. The turn is a
  // sentence split over the last chopped cuts, one word per cut, so it only
  // lands on the drop. After it: the opposite reaction, "How?", the app.
  { id: 'ls-roach', old: true, ch: ['🪳 "Ew squish it"'], gap: ['I…', 'want', 'wings'], bf: ['🦋 "Be gentle"', 'How?', 'Upshift ^'], caption: '"Squish it 🤮" ➡️ "Squish me 🥵"' },
  { id: 'ls-mom', old: true, ch: ['📱 "He\'s on his phone again"', '"He\'s ALWAYS on his phone"'], gap: ['Not', 'anymore'], bf: ['"Where\'s he going?"', '"Gym. Again."', 'Upshift ^'], caption: 'She noticed.' },
  { id: 'ls-zombie', old: true, ch: ['🧟 "Is he even awake?"'], gap: ['Woke', 'up'], bf: ['🐺 "Who is that?"', 'How?', 'Upshift ^'], caption: '"Is he ok?" ➡️ "Is he single?"' },
  { id: 'ls-year', old: true, ch: ['2025', '📱 4,200 hours'], gap: ['Never', 'again'], bf: ['2026', '🏋️ 4,200 hours back', 'Upshift ^'], caption: 'That far…' },
  { id: 'ls-who', old: true, ch: ['"Who?"', '"The guy always on his phone?"'], gap: ['Watch', 'this'], bf: ['"Wait… that\'s him?"', 'How?', 'Upshift ^'], caption: '"Who?" ➡️ "Wait… that\'s him?"' },
  { id: 'ls-npc', old: true, ch: ['🎮 NPC', '"Background character"'], gap: ['Main', 'character', 'arc'], bf: ['⚔️ "He has no weaknesses now"', 'How?', 'Upshift ^'], caption: 'Arc started.' },
  { id: 'ls-friends', old: true, ch: ['"Is he coming?"', '"Nah he\'s scrolling"'], gap: ['Last', 'time'], bf: ['"Is he coming?"', '"He\'s already there"', 'Upshift ^'], caption: 'Harsh reality.' },
  { id: 'ls-score', old: true, ch: ['📱 Screen time: 9h', 'Score: 31'], gap: ['Deleted', 'it'], bf: ['Screen time: 1h', 'Score: 89', 'Upshift ^'], caption: 'Rate the glow up 1-10' },
  { id: 'ls-sister', old: true, ch: ['"Ew, get off your phone at dinner"'], gap: ['Ok', 'fine'], bf: ['"Why do my friends keep asking about you?"', 'Upshift ^'], caption: 'Sister approved.' },
  { id: 'ls-ghost', old: true, ch: ['👻 "Was he even at the party?"'], gap: ['Not', 'invisible', 'anymore'], bf: ['👑 "Who\'s that with him?"', 'How?', 'Upshift ^'], caption: 'Damn…' },

  // ── 🌽 in the same shape. Never the word itself.
  { id: 'ls-rat', topic: 'lust', ch: ['🐀 "Why\'s he always tired?"'], gap: ['Day', '1'], bf: ['🦁 Day 90', '"Different eyes"', 'Upshift ^'], caption: 'Rat ➡️ Lion' },
  { id: 'ls-look-away', topic: 'lust', ch: ['🫣 "He can\'t even look at me"'], gap: ['Quit', '🌽'], bf: ['👁️ "Why does he stare like that"', 'How?', 'Upshift ^'], caption: '"Weird" ➡️ "Intense"' },
  { id: 'ls-fog', topic: 'lust', ch: ['🌫️ "He\'s always zoned out"'], gap: ['90', 'days', 'clean'], bf: ['⚡ "He\'s so locked in"', 'How?', 'Upshift ^'], caption: 'Fog lifted.' },
  { id: 'ls-gooner', topic: 'lust', ch: ['🧌 "Bro\'s a g00ner fr"'], gap: ['Not', 'anymore'], bf: ['🗿 "Bro\'s a different person"', 'How?', 'Upshift ^'], caption: '"G00ner" ➡️ "Gigachad"' },
  { id: 'ls-texts', topic: 'lust', ch: ['💬 Left on read', '💬 Left on read'], gap: ['Quit', '🌽'], bf: ['💬 "You up?"', '"Are you free Friday?"', 'Upshift ^'], caption: 'Her loss…' },

  // ── Tips: his biggest posts. The hook promises a number and a result and
  // holds over the chopped clips; each tip gets its own cut after the drop.
  { id: 'ls-tips-eyes', topic: 'tips', ch: ['3 easy ways to fix your dead eyes^'], gap: ['Save', 'this'], bf: ['1. No phone after 10pm', '2. Morning sun, 10 min', '3. Quit 🌽'], caption: '3 easy ways to fix your dead eyes^' },
  { id: 'ls-tips-appeal', topic: 'tips', ch: ['Exact guide from 0% to 100% appeal^'], gap: ['Step', 'by', 'step'], bf: ['1. Screen time under 2h', '2. Sleep before midnight', '3. Lift 4x a week', 'Appeal +100%'], caption: 'Exact guide from 0% to 100% appeal^' },
  { id: 'ls-tips-face', topic: 'tips', ch: ['My fastest tips to ascend^'], gap: ['Do', 'this'], bf: ['1. Phone out of the bedroom', '2. Cold water on your face', '3. Track it in Upshift'], caption: 'My fastest tips to ascend^' },
  { id: 'ls-tips-puffy', topic: 'tips', ch: ['Why your face looks puffy^'], gap: ['Fix', 'it'], bf: ['1. Less salt', '2. 8h sleep', '3. No scrolling in bed'], caption: 'Number 3 is underrated' },
  { id: 'ls-tips-screen', topic: 'tips', ch: ['How I cut 9h screen time to 1h^'], gap: ['3', 'steps'], bf: ['1. Charger outside the room', '2. Apps off the home screen', '3. Upshift blocker after 9pm'], caption: 'Step 3 did the most' },

  // ── Screen time as a story: he's chopped BECAUSE of social media, and the
  // glow-up comes from blocking and tracking it. A concrete scene, what it
  // costs him, the turn, and an ending that answers the opening.
  { id: 'st-mirror', ch: ['"Why do I look so tired?"', '*Opens TikTok*', '6 hours later'], gap: ['Blocked', 'it', 'all'], bf: ['TikTok blocked', 'Sleeping 8h', '"Why do you look so good?"'], caption: 'The mirror didn\'t lie.' },
  { id: 'st-report', ch: ['Daily average: 9h 14m', 'A full-time job', 'For nothing'], gap: ['Quit', 'the', 'job'], bf: ['TikTok + IG blocked', 'Every hour tracked', 'Daily average: 47m'], caption: 'Worst job I ever had.' },
  { id: 'st-gym', ch: ['Paid for the gym', 'Went 0 times', '312 hours on Reels'], gap: ['Blocked', 'Reels'], bf: ['Gym streak: 1', 'Gym streak: 60', 'Gym streak: 180'], caption: 'Same 312 hours. Different body.' },
  { id: 'st-story', ch: ['She posted from the party', 'I watched from bed', 'Screen time: 11h'], gap: ['Not', 'watching', 'anymore'], bf: ['Instagram blocked', 'Started going out', 'She asked who I came with'], caption: 'Stop watching. Start showing up.' },
  { id: 'st-years', ch: ['8h a day on my phone', '21 years of my life', 'Gone'], gap: ['Not', 'giving', 'them', 'that'], bf: ['Socials blocked after 8pm', 'Tracked daily', '8h → 1h'], caption: 'Do the math on yours.' },
  { id: 'st-5min', ch: ['"Just 5 minutes"', '3 hours later', 'Exam: failed'], gap: ['No', 'more', '"5', 'minutes"'], bf: ['Apps blocked while studying', 'Every session tracked', 'Top of the class'], caption: 'It\'s never 5 minutes.' },
  { id: 'st-dinner', ch: ['"How was school?"', 'I don\'t look up', 'Still scrolling'], gap: ['Blocked', 'it'], bf: ['Phone locked at dinner', 'Actually talking again', 'Mom cried. Good tears.'], caption: 'Call your mom.' },
  { id: 'st-compare', ch: ['Scrolling guys with jawlines', 'Feeling worse', 'Still scrolling'], gap: ['Stopped', 'watching', 'them'], bf: ['Feed blocked', 'Hours on myself', 'Now I\'m in the feed'], caption: 'Stop watching their glow-up.' },
  { id: 'st-3am', ch: ['3:12 AM', 'Still scrolling', 'Dark circles again'], gap: ['Phone', 'locks', 'at', '11'], bf: ['Socials blocked at 11pm', '8h sleep, tracked', 'Face woke up'], caption: 'Your skin knows your screen time.' },
  { id: 'st-streak', ch: ['Day 1 off TikTok', 'Day 3: reinstalled', 'Day 1 again'], gap: ['Then', 'I', 'blocked', 'it'], bf: ['Day 7', 'Day 30', 'Day 100. Still blocked.'], caption: 'Willpower didn\'t work. Blocking did.' },

  // ── Culprit: the first line knocks down what looksmaxxing blames (jawline,
  // debloat, genetics…) and names the real one — the screen. Uses the
  // screen-time folders.
  { id: 'cu-looksmaxx', topic: 'culprit', ch: ['Looksmaxxers lied to you', 'It\'s not your jawline', 'It\'s your screen time'], gap: ['Here\'s', 'the', 'proof'], bf: ['Socials blocked 90 days', 'Every hour tracked', 'No mewing. No debloat.'], caption: 'They sell you the fix. The problem is free.' },
  { id: 'cu-debloat', topic: 'culprit', ch: ['You don\'t need debloat', 'You need less phone', 'Puffy face = 3 AM scrolling'], gap: ['So', 'I', 'blocked', 'it'], bf: ['Phone locked at 11pm', '8h sleep, tracked', 'Debloated for free'], caption: 'Save your money.' },
  { id: 'cu-genetics', topic: 'culprit', ch: ['"It\'s genetics bro"', 'No. It\'s 10h on your phone', 'Dead eyes, no sleep'], gap: ['Fixed', 'the', 'real', 'problem'], bf: ['Socials blocked', 'Screen time: 1h', 'Same genes. Different face.'], caption: 'Stop blaming your parents.' },
  { id: 'cu-skincare', topic: 'culprit', ch: ['12-step skincare routine', 'Still look exhausted', 'Scrolling till 3 AM'], gap: ['Wrong', 'problem'], bf: ['Phone blocked after 11', 'Sleep tracked', 'Skin cleared up'], caption: 'Your skin knows your screen time.' },
  { id: 'cu-mewing', topic: 'culprit', ch: ['Mewed for a year', 'Nothing changed', 'Neck down 8h a day'], gap: ['Looked', 'up'], bf: ['Apps blocked', 'Posture came back', 'Jawline came back'], caption: 'Look up. Literally.' },
  { id: 'cu-gym', topic: 'culprit', ch: ['Gym 5x a week', 'Still chopped', '9h on TikTok'], gap: ['Did', 'the', 'math'], bf: ['TikTok blocked', 'Hours tracked', 'Now the gym shows'], caption: 'You can\'t out-train your screen time.' },
  { id: 'cu-supplements', topic: 'culprit', ch: ['Bought every supplement', 'TikTok sold me', 'On TikTok'], gap: ['Irony', 'hit'], bf: ['TikTok blocked', 'Kept the money', 'Face fixed itself'], caption: 'The app sold you the cure for the app.' },
  { id: 'cu-discipline', topic: 'culprit', ch: ['It\'s not your discipline', 'Apps are built to hook you', 'You can\'t win'], gap: ['So', 'don\'t', 'fight', 'it'], bf: ['Block it', 'Track it', 'Watch your face change'], caption: 'Willpower vs a billion-dollar algorithm.' },
];

export function pickScript(topic: ScriptTopic, avoid?: string): TextScript {
  const pool = SCRIPTS.filter((s) => !s.old && (s.topic ?? 'screen') === topic && s.id !== avoid);
  return pool[Math.floor(Math.random() * pool.length)];
}
