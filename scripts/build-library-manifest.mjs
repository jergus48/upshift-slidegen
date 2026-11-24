// Adds the Brain / Meme packs found in public/library/ to manifest.json (keeps
// the existing packs untouched). Run after scripts/fetch-packs.mjs.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const lib = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'library')
const manifestPath = join(lib, 'manifest.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

const PACKS = [
  { slug: 'brain-progress', name: 'Brain progress', description: 'Brain scans / a brain getting better. The cover of the Brain Lists slideshows.' },
  { slug: 'meme-modes', name: 'Meme modes', description: 'Wojak / chad / monk memes. File names (easy, normal, hard, monk, npc, cope) pick the meme for each mode.' },
  { slug: 'upshift-shots', name: 'Upshift screenshots', description: 'Upshift app screenshots (blocked p*rn site, quests). Shown as one of the small pictures where Upshift is mentioned.' },
  { slug: 'monkey-memes', name: 'Monkey memes', description: 'Monkeys (and a dog) doing human stuff. File names (monkey-gym, monkey-suit, monkey-money, monkey-phone, monkey-sad, monkey-cool...) pick the monkey for each Monkey mode.' },
  { slug: 'spongebob-memes', name: 'Spongebob memes', description: 'Spongebob / Patrick / Squidward memes. File names (sponge-patrick, sponge-squid, sponge-happy, sponge-hard, sponge-krabs, sponge-work) pick the picture for each Spongebob mode.' },
  { slug: 'viral-resources', name: 'Viral resources', description: 'Odd / shocking small pictures (WTF food, burnt chicken, cursed kitchen). Scattered among the mini pictures when ragebait is on.' },
  { slug: 'stage-photos', name: 'Stage photos', description: 'Aesthetic photos for the Brain Lists stages. File names (bored, clean, read, walk, calm, gym, cook…) match the text.' },
]

for (const p of PACKS) {
  const images = readdirSync(join(lib, p.slug))
    .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
    .sort()
    .map((f) => `${p.slug}/${f}`)
  const entry = { slug: p.slug, name: p.name, description: p.description, images }
  const i = manifest.packs.findIndex((x) => x.slug === p.slug)
  if (i >= 0) manifest.packs[i] = entry
  else manifest.packs.push(entry)
  console.log(`${p.name}: ${images.length} images`)
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
