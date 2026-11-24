// NOTE: brain-progress is hand-curated (brain-bN-NN singles + brain-pair-NN), not scraped here.
// Fills the Brain / Meme tools' bundled packs from Pinterest, through the running
// local server (needs the Apify key saved in Settings). Files are written to
// public/library/<pack>/<keyword>-NN.<ext>; the keyword in the file name is what
// lib/listDecks.ts matches list items against, so name things by what they show.
//
//   node scripts/fetch-packs.mjs [--per 10] [--only meme-modes,brain-progress]
//   then: node scripts/build-library-manifest.mjs
import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const API = process.env.API || 'http://localhost:8787'
const args = process.argv.slice(2)
const arg = (name, def) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : def
}
const per = Math.max(10, Number(arg('per', '10')))
const only = (arg('only', '') || '').split(',').filter(Boolean)

// [pack, keyword, pinterest search]
const JOBS = [
  ['meme-modes', 'easy', 'soyjak wojak meme'],
  ['meme-modes', 'normal', 'wojak feels guy meme'],
  ['meme-modes', 'hard', 'gigachad meme'],
  ['meme-modes', 'monk', 'monk mode meme drawing'],
  ['meme-modes', 'npc', 'npc wojak meme'],
  ['meme-modes', 'cope', 'wojak crying cope meme'],
  ['meme-modes', 'gigachad', 'gigachad meme reaction'],
  ['meme-modes', 'sigma', 'sigma male meme'],
  ['meme-modes', 'chad', 'chad vs virgin meme'],
  ['meme-modes', 'soy', 'soyjak pointing meme'],
  ['meme-modes', 'wojak', 'wojak doomer meme'],
  ['monkey-memes', 'monkey-human', 'monkey acting like a human funny'],
  ['monkey-memes', 'monkey-suit', 'monkey in a suit meme'],
  ['monkey-memes', 'monkey-money', 'monkey with money sunglasses meme'],
  ['monkey-memes', 'monkey-gym', 'monkey gym meme'],
  ['monkey-memes', 'monkey-phone', 'monkey on phone meme'],
  ['monkey-memes', 'monkey-sad', 'sad monkey meme'],
  ['monkey-memes', 'monkey-cool', 'cool monkey sunglasses meme'],
  ['monkey-memes', 'monkey-work', 'monkey working at computer meme'],
  ['monkey-memes', 'monkey-sigma', 'sigma monkey meme'],
  ['monkey-memes', 'monkey-eat', 'monkey eating banana funny'],
  ['spongebob-memes', 'sponge-patrick', 'patrick star meme funny'],
  ['spongebob-memes', 'sponge-squid', 'squidward meme tired'],
  ['spongebob-memes', 'sponge-happy', 'happy spongebob meme'],
  ['spongebob-memes', 'sponge-hard', 'sigma spongebob meme'],
  ['spongebob-memes', 'sponge-krabs', 'mr krabs meme'],
  ['spongebob-memes', 'sponge-work', 'spongebob office worker tired meme'],
  ['spongebob-memes', 'sponge-rage', 'angry spongebob meme'],
  ['stage-photos', 'bored', 'bored on couch with phone'],
  ['stage-photos', 'clean', 'messy room aesthetic'],
  ['stage-photos', 'read', 'reading book aesthetic'],
  ['stage-photos', 'walk', 'walking city night bokeh aesthetic'],
  ['stage-photos', 'calm', 'sunset silhouette peaceful aesthetic'],
  ['stage-photos', 'gym', 'gym aesthetic lifting'],
  ['stage-photos', 'cook', 'cooking healthy meal aesthetic'],
  ['stage-photos', 'cold', 'cold shower ice bath'],
  ['stage-photos', 'craving', 'late night phone in dark room'],
  ['stage-photos', 'friends', 'friends laughing aesthetic'],
  ['stage-photos', 'morning', 'morning sunlight window aesthetic'],
  ['stage-photos', 'scroll', 'scrolling phone in bed'],
  ['stage-photos', 'food', 'fast food junk food'],
  ['stage-photos', 'game', 'gaming setup night'],
  ['stage-photos', 'party', 'house party friends aesthetic'],
  ['stage-photos', 'sport', 'boxing training aesthetic'],
  ['stage-photos', 'netflix', 'watching tv on couch at night'],
  ['stage-photos', 'weed', 'smoking weed aesthetic'],
  ['stage-photos', 'vape', 'vape cloud aesthetic'],
  ['stage-photos', 'drink', 'beer bar night aesthetic'],
  ['stage-photos', 'energy', 'energy drink cans'],
  ['stage-photos', 'sleep', 'sleeping in bed aesthetic'],
  ['stage-photos', 'study', 'studying at desk focus aesthetic'],
  ['stage-photos', 'meditate', 'meditation aesthetic'],
  ['stage-photos', 'journal', 'journaling aesthetic'],
  ['stage-photos', 'walk', 'person walking outdoors'],
  ['stage-photos', 'run', 'morning run aesthetic'],
  ['stage-photos', 'water', 'drinking water aesthetic'],
  ['stage-photos', 'music', 'headphones music aesthetic'],
  ['stage-photos', 'nature', 'forest nature aesthetic'],
  ['stage-photos', 'wake', 'alarm clock waking up early'],
  ['stage-photos', 'social', 'coffee with friends cafe'],
]

const extOf = (type) => (/png/.test(type) ? 'png' : /webp/.test(type) ? 'webp' : 'jpg')

for (const [pack, key, search] of JOBS) {
  if (only.length && !only.includes(pack)) continue
  const dir = join(root, 'public', 'library', pack)
  mkdirSync(dir, { recursive: true })
  const have = existsSync(dir) ? readdirSync(dir).filter((f) => f.startsWith(`${key}-`)).length : 0
  if (have >= 5) { console.log(`skip ${pack}/${key} (already ${have})`); continue }
  try {
    const res = await fetch(`${API}/api/library/scrape`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ searches: [search], count: per }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || res.status)
    let n = have
    for (const dataUrl of json.images) {
      const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl)
      if (!m) continue
      n++
      writeFileSync(join(dir, `${key}-${String(n).padStart(2, '0')}.${extOf(m[1])}`), Buffer.from(m[2], 'base64'))
    }
    console.log(`ok   ${pack}/${key}: ${json.images.length} images ("${search}")`)
  } catch (e) {
    console.log(`FAIL ${pack}/${key}: ${e.message}`)
  }
}
