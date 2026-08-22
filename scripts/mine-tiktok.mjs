// Mine viral TikTok photo-slideshow text from a set of accounts, so their
// hooks/structure can seed new Brain presets. Entirely free + no auth: it uses
// TikTok's PUBLIC embed endpoints (no login, no cookies, no paid API).
//
//   1. /embed/@handle      -> the account's ~11 most recent posts, each with a
//                             playCount (views) and a cover URL. Photo posts are
//                             the ones whose cover URL contains "photomode".
//   2. /embed/v2/<id>      -> for one post: EVERY slide image, the full caption,
//                             views + likes + comments.
//   3. a vision model      -> OCR each slideshow's images into slide text, in ONE
//      (via OpenRouter)       call per post. This is the only paid step, and it
//                             runs on cheap tokens because images -> tiny text.
//
// Token-efficient by design: the expensive model (me) never reads the images;
// the script's cheap vision calls do the OCR and emit compact JSON I then read.
//
// Usage:
//   node scripts/mine-tiktok.mjs discover                 # step 1 only, no key
//   node scripts/mine-tiktok.mjs mine --min 40000 --top 6 # full run w/ OCR
//   node scripts/mine-tiktok.mjs mine --model google/...  # pick vision model
//
// Output: scripts/.tiktok/corpus.json  (+ raw/ dumps for debugging)

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, '.tiktok')
const RAW = join(OUT, 'raw')

const HANDLES = [
  'comp.research',
  'vancedeltoid',
  'hans_kruger_',
  'livegoodphysique',
  'von..lifts',
  'never_giveup_109',
  'zaaayd0',
  'jaidenfitt_',
  'loganhayeslifts',
]

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt
}

async function getText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

// Pull every <script type="application/json"> blob and return the largest that
// parses — the embed pages ship their state in the biggest one.
function jsonBlobs(html) {
  const re = /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g
  const out = []
  let m
  while ((m = re.exec(html))) {
    try { out.push(JSON.parse(m[1])) } catch { /* skip non-JSON */ }
  }
  return out.sort((a, b) => JSON.stringify(b).length - JSON.stringify(a).length)
}

// --- step 1: an account's recent posts -------------------------------------
async function listPosts(handle) {
  const html = await getText(`https://www.tiktok.com/embed/@${handle}`)
  writeFileSync(join(RAW, `embed_${handle}.html`), html)
  const data = jsonBlobs(html).find((d) => JSON.stringify(d).includes('playCount'))
  if (!data) return []
  // videoList lives somewhere under the state; find the first array of items.
  let list = null
  const walk = (o) => {
    if (!o || typeof o !== 'object' || list) return
    for (const k of Object.keys(o)) {
      const v = o[k]
      if (Array.isArray(v) && v[0] && typeof v[0] === 'object' && 'playCount' in v[0]) { list = v; return }
      walk(v)
    }
  }
  walk(data)
  return (list || []).map((it) => ({
    handle,
    id: String(it.id),
    desc: it.desc || '',
    views: it.playCount || 0,
    cover: (it.coverUrl || '').split('?')[0],
    isPhoto: /photomode/.test(it.coverUrl || ''),
    url: `https://www.tiktok.com/@${handle}/photo/${it.id}`,
  }))
}

// --- step 2: one post's slides + caption + stats ---------------------------
async function getPost(id) {
  const html = await getText(`https://www.tiktok.com/embed/v2/${id}`)
  writeFileSync(join(RAW, `v2_${id}.html`), html)
  const data = jsonBlobs(html)[0]
  const src = data?.source?.data || {}
  const key = Object.keys(src).find((k) => k.startsWith('/embed/v2/'))
  const vd = key && src[key]?.videoData
  if (!vd) return null
  const info = vd.itemInfos || {}
  const images = (vd.imagePostInfo?.displayImages || [])
    .map((im) => im?.urlList?.[0])
    .filter(Boolean)
  return {
    id,
    caption: info.text || '',
    views: info.playCount || 0,
    likes: info.diggCount || 0,
    comments: info.commentCount || 0,
    createTime: info.createTime ? Number(info.createTime) * 1000 : 0,
    slideImages: images,
  }
}

function fmt(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return Math.round(n / 1e3) + 'k'
  return String(n)
}

async function discover() {
  const all = []
  for (const h of HANDLES) {
    try {
      const posts = await listPosts(h)
      const photos = posts.filter((p) => p.isPhoto)
      all.push(...posts)
      console.log(
        `${h.padEnd(20)} posts=${String(posts.length).padStart(2)} ` +
          `photos=${String(photos.length).padStart(2)} ` +
          `topViews=${fmt(Math.max(0, ...posts.map((p) => p.views)))}`,
      )
    } catch (e) {
      console.log(`${h.padEnd(20)} ERROR ${e.message}`)
    }
  }
  const photos = all.filter((p) => p.isPhoto).sort((a, b) => b.views - a.views)
  console.log(`\nTotal photo posts: ${photos.length}. Top by views:`)
  for (const p of photos.slice(0, 25)) {
    console.log(`  ${fmt(p.views).padStart(6)}  @${p.handle}  ${p.desc.slice(0, 50)}  ${p.id}`)
  }
  writeFileSync(join(OUT, 'discover.json'), JSON.stringify({ all, photos }, null, 2))
  console.log(`\nWrote ${join(OUT, 'discover.json')}`)
}

// --- OCR one slideshow via a vision model on OpenRouter --------------------
function openrouterKey() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY
  try {
    const cfg = JSON.parse(readFileSync(join(homedir(), '.slidesmith', 'config.json'), 'utf8'))
    return cfg?.keys?.openrouter || ''
  } catch { return '' }
}

async function ocrSlides(apiKey, model, post) {
  const prompt =
    'These images are the slides of ONE TikTok carousel, in order. For EACH image, ' +
    'transcribe ONLY the overlaid text a viewer reads (ignore watermarks, usernames, ' +
    'stray UI, and the background photo). Keep the reading order. Return strict JSON: ' +
    '{"slides":["slide 1 text","slide 2 text", ...]} with one string per image. If an ' +
    'image has no text, use an empty string.'
  const content = [
    { type: 'text', text: prompt },
    ...post.slideImages.map((url) => ({ type: 'image_url', image_url: { url } })),
  ]
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      'HTTP-Referer': 'https://github.com/slidesmith',
      'X-Title': 'Slidesmith',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content }],
    }),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${body?.error?.message || res.statusText}`)
  const txt = body?.choices?.[0]?.message?.content || '{}'
  const start = txt.indexOf('{')
  const parsed = JSON.parse(txt.slice(start, txt.lastIndexOf('}') + 1))
  return Array.isArray(parsed.slides) ? parsed.slides : []
}

async function mine() {
  const min = Number(arg('min', '40000'))
  const top = Number(arg('top', '6'))
  const model = arg('model', 'google/gemini-3.5-flash-lite')
  const apiKey = openrouterKey()
  if (!apiKey) throw new Error('No OpenRouter key (env OPENROUTER_API_KEY or ~/.slidesmith/config.json).')

  // Reuse discovery if present, else run it.
  let photos
  if (existsSync(join(OUT, 'discover.json'))) {
    photos = JSON.parse(readFileSync(join(OUT, 'discover.json'), 'utf8')).photos
  } else {
    await discover()
    photos = JSON.parse(readFileSync(join(OUT, 'discover.json'), 'utf8')).photos
  }

  // Take, per account, the top-N photo posts above the view floor.
  const byHandle = {}
  for (const p of photos) (byHandle[p.handle] ||= []).push(p)
  const picks = []
  for (const h of Object.keys(byHandle)) {
    picks.push(...byHandle[h].filter((p) => p.views >= min).slice(0, top))
  }
  console.log(`Selected ${picks.length} slideshows (>= ${fmt(min)} views, top ${top}/account) using ${model}\n`)

  const corpus = []
  for (const p of picks) {
    try {
      const post = await getPost(p.id)
      if (!post || !post.slideImages.length) { console.log(`  skip @${p.handle} ${p.id} (no images)`); continue }
      const slides = await ocrSlides(apiKey, model, post)
      corpus.push({
        handle: p.handle,
        url: p.url,
        views: post.views,
        likes: post.likes,
        caption: post.caption,
        slideCount: post.slideImages.length,
        slides,
      })
      console.log(`  ok @${p.handle} ${fmt(post.views)}v ${slides.length} slides — "${(slides[0] || '').slice(0, 60)}"`)
    } catch (e) {
      console.log(`  ERR @${p.handle} ${p.id}: ${e.message}`)
    }
  }
  corpus.sort((a, b) => b.views - a.views)
  writeFileSync(join(OUT, 'corpus.json'), JSON.stringify(corpus, null, 2))
  console.log(`\nWrote ${join(OUT, 'corpus.json')} (${corpus.length} slideshows)`)
}

mkdirSync(RAW, { recursive: true })
const cmd = process.argv[2] || 'discover'
if (cmd === 'discover') await discover()
else if (cmd === 'mine') await mine()
else { console.log('usage: node scripts/mine-tiktok.mjs [discover|mine]'); process.exit(1) }
