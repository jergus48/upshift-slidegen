// Reading the video formats out of CapCut.
//
// A format is a CapCut project the user cut by hand against a song, with
// PLACEHOLDER clips standing in for the character's material:
//
//   clip_chopped / clip_buffed             the character's own clips
//   scoreboard_chopped / scoreboard_buffed their scoreboard screen
//   rating_chopped / rating_buffed         their rating screen
//
// Anything else on the main video track is a REAL asset (the app's screen
// recording) and is kept exactly where it was put, with its own in-point and
// speed. Anything on a second video track is an overlay (except the Upshift
// badge, which is dropped).
//
// Projects are found by name: `<song>-<format>`, format being one of FORMATS
// below. The output is one JSON per project in public/formats/capcut/, plus the
// song and every real asset copied next to it, so a format keeps working after
// the CapCut project is edited or deleted.
//
// CapCut stores every time in MICROSECONDS; everything written here is seconds
// on the EDIT's own timeline (0 = first frame of the video).
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const US = 1_000_000
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const FORMATS = ['scoreboard', 'rating', 'rating-app']
export const ROLES = [
  'clip_chopped',
  'clip_buffed',
  'scoreboard_chopped',
  'scoreboard_buffed',
  'rating_chopped',
  'rating_buffed',
]

// Where CapCut keeps its projects on macOS. Overridable for the sandboxed
// (App Store) build or another machine.
export function draftsDir() {
  return (
    process.env.CAPCUT_DRAFTS ||
    path.join(os.homedir(), 'Movies/CapCut/User Data/Projects/com.lveditor.draft')
  )
}

// Where the formats land. `dist` too when a build exists, so a production
// server picks them up without a rebuild.
function outDirs() {
  return [path.join(ROOT, 'public/formats/capcut'), path.join(ROOT, 'dist/formats/capcut')]
}

// Effect names as CapCut shows them → what the renderer draws. An effect not
// listed here is still imported under its own name, and reported, so it can
// be added rather than silently dropped.
const EFFECTS = {
  'Subtle Shake': 'shake',
  'Negative Chaos': 'negative-chaos',
}

const r3 = (n) => Math.round(n * 1000) / 1000
const sec = (us) => r3((Number(us) || 0) / US)
const slug = (s) =>
  s
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

export function parseProjectName(name) {
  const m = /^(.+)-(scoreboard|rating-app|rating)$/.exec(name)
  return m ? { song: m[1], format: m[2] } : null
}

// Every project named like a format.
export async function scanProjects() {
  const dir = draftsDir()
  let names = []
  try {
    names = await fs.readdir(dir)
  } catch {
    throw new Error(`CapCut projects folder not found at ${dir}`)
  }
  const out = []
  for (const name of names) {
    const parsed = parseProjectName(name)
    if (!parsed) continue
    try {
      const st = await fs.stat(path.join(dir, name, 'draft_info.json'))
      out.push({ project: name, ...parsed, modified: st.mtime.toISOString() })
    } catch {
      /* a folder without a draft is not a project */
    }
  }
  return out.sort((a, b) => a.project.localeCompare(b.project))
}

const idx = (materials) => {
  const map = new Map()
  for (const [kind, list] of Object.entries(materials || {})) {
    if (!Array.isArray(list)) continue
    for (const m of list) if (m && typeof m === 'object' && m.id) map.set(m.id, { kind, m })
  }
  return map
}

function placement(seg) {
  const c = seg.clip || {}
  return {
    scale: r3(c.scale?.x ?? 1),
    x: r3(c.transform?.x ?? 0),
    y: r3(c.transform?.y ?? 0),
    rotation: r3(c.rotation ?? 0),
    alpha: r3(c.alpha ?? 1),
    flip: Boolean(c.flip?.horizontal),
  }
}

// A filter package in CapCut's cache is one or more 512×512 lookup tables
// (`Filter_*/filter/filter.png`), chained by zorder. The intensity slider only
// drives the one event.lua names; the rest are always fully on.
async function readFilterPackage(dir) {
  const config = JSON.parse(await fs.readFile(path.join(dir, 'config.json'), 'utf8'))
  // The newer single-table packages are just `filter/filter.png` beside the
  // config, the slider driving it directly.
  if (!config.effect?.Link) return [{ png: path.join(dir, 'filter/filter.png'), scaled: true }]
  const links = config.effect.Link.filter((l) => l.type === 'Filter')
  links.sort((a, b) => (a.zorder || 0) - (b.zorder || 0))
  let scaled = ''
  try {
    const lua = await fs.readFile(path.join(dir, 'event.lua'), 'utf8')
    scaled = /getFeature\("([^"]+)"\)/.exec(lua)?.[1] || ''
  } catch {
    /* no script: intensity applies to every table */
  }
  return links.map((l) => {
    const folder = l.path.replace(/\/$/, '')
    return { png: path.join(dir, folder, 'filter/filter.png'), scaled: !scaled || scaled === folder }
  })
}

// Resolve a path CapCut recorded. The Mac App Store build keeps its cache in a
// container but records the unsandboxed path, or the other way round.
async function existing(p) {
  const container = path.join(os.homedir(), 'Library/Containers/com.lemon.lvoverseas/Data')
  const alts = [p]
  if (p.startsWith(container)) alts.push(p.slice(container.length).replace(/^/, os.homedir()))
  else if (p.startsWith(os.homedir())) alts.push(container + p.slice(os.homedir().length))
  for (const a of alts) {
    try {
      await fs.access(a)
      return a
    } catch {
      /* try the next */
    }
  }
  return null
}

// A source CapCut points at that has since moved or been deleted (a song in
// Downloads cleaned out) is still fine if an earlier import already copied it.
async function sourceOf(p) {
  const found = await existing(p || '')
  if (found || !p) return found
  const kept = path.join(outDirs()[0], 'assets', slug(path.basename(p)))
  try {
    await fs.access(kept)
    return kept
  } catch {
    return null
  }
}

async function sameFileElsewhere(base) {
  const dirs = [path.join(os.homedir(), 'Documents/vids/downloaded')]
  try {
    for (const g of await fs.readdir(path.join(ROOT, 'public/music'))) dirs.push(path.join(ROOT, 'public/music', g))
  } catch {
    /* no music folder */
  }
  for (const d of dirs) {
    try {
      await fs.access(path.join(d, base))
      return path.join(d, base)
    } catch {
      /* not here */
    }
  }
  return null
}

// Copy a file into every output dir under assets/, once per content name.
async function stash(src, name, copied) {
  if (copied.has(name)) return `assets/${name}`
  for (const dir of outDirs()) {
    try {
      await fs.access(path.dirname(dir))
    } catch {
      continue
    }
    await fs.mkdir(path.join(dir, 'assets'), { recursive: true })
    if (path.resolve(src) === path.resolve(path.join(dir, 'assets', name))) continue
    try {
      await fs.copyFile(src, path.join(dir, 'assets', name))
    } catch (e) {
      // macOS keeps Desktop/Downloads behind a permission the server may not
      // have. The same file is often already in the app's own music folders.
      const alt = await sameFileElsewhere(path.basename(src))
      if (!alt) throw e
      await fs.copyFile(alt, path.join(dir, 'assets', name))
    }
  }
  copied.add(name)
  return `assets/${name}`
}

export async function importProject(project, copied = new Set()) {
  const parsed = parseProjectName(project)
  if (!parsed) throw new Error(`${project}: name is not <song>-<scoreboard|rating|rating-app>`)
  const file = path.join(draftsDir(), project, 'draft_info.json')
  const d = JSON.parse(await fs.readFile(file, 'utf8'))
  const mats = idx(d.materials)
  const tracks = Array.isArray(d.tracks) ? d.tracks : []
  const warnings = []

  const videoTracks = tracks.filter((t) => t.type === 'video' && t.segments?.length)
  if (!videoTracks.length) throw new Error(`${project}: no video on the timeline`)
  // The main track is the one carrying the edit — the most segments. Every
  // other video track is an overlay.
  const main = [...videoTracks].sort((a, b) => b.segments.length - a.segments.length)[0]

  const video = []
  for (const s of main.segments) {
    const m = mats.get(s.material_id)?.m || {}
    const src = m.path || ''
    const base = path.basename(src).replace(/\.[^.]+$/, '')
    const seg = {
      from: sec(s.target_timerange?.start),
      to: sec((s.target_timerange?.start || 0) + (s.target_timerange?.duration || 0)),
      src: sec(s.source_timerange?.start),
      speed: r3(s.speed || 1),
      ...placement(s),
    }
    if (ROLES.includes(base)) {
      video.push({ ...seg, role: base })
    } else {
      const at = await sourceOf(src)
      if (!at) {
        warnings.push(`asset missing on disk: ${src}`)
        continue
      }
      const asset = await stash(at, slug(path.basename(src)), copied)
      video.push({ ...seg, role: 'asset', asset, kind: m.type === 'photo' ? 'image' : 'video' })
    }
  }
  video.sort((a, b) => a.from - b.from)

  const overlays = []
  for (const t of videoTracks) {
    if (t === main) continue
    for (const s of t.segments) {
      const m = mats.get(s.material_id)?.m || {}
      // The Upshift badge got in the way; it's left out of every video.
      if (/^upshift_badge/i.test(path.basename(m.path || ''))) continue
      const at = await sourceOf(m.path || '')
      if (!at) {
        warnings.push(`overlay missing on disk: ${m.path}`)
        continue
      }
      const asset = await stash(at, slug(path.basename(m.path)), copied)
      overlays.push({
        from: sec(s.target_timerange?.start),
        to: sec((s.target_timerange?.start || 0) + (s.target_timerange?.duration || 0)),
        src: sec(s.source_timerange?.start),
        speed: r3(s.speed || 1),
        asset,
        kind: m.type === 'photo' ? 'image' : 'video',
        ...placement(s),
      })
    }
  }

  const filters = []
  for (const t of tracks.filter((x) => x.type === 'filter')) {
    for (const s of t.segments || []) {
      const m = mats.get(s.material_id)?.m || {}
      const pkg = await existing(m.path || '')
      if (!pkg) {
        warnings.push(`filter "${m.name}" not in the CapCut cache`)
        continue
      }
      const tables = await readFilterPackage(pkg)
      const luts = []
      for (const [i, tb] of tables.entries()) {
        const name = `lut-${slug(m.name || 'filter')}-${m.resource_id || 'x'}-${i}.png`
        luts.push({ png: await stash(tb.png, name, copied), scaled: tb.scaled })
      }
      filters.push({
        from: sec(s.target_timerange?.start),
        to: sec((s.target_timerange?.start || 0) + (s.target_timerange?.duration || 0)),
        name: m.name,
        intensity: r3(m.value ?? 1),
        luts,
      })
    }
  }

  const effects = []
  const unknown = new Set()
  for (const t of tracks.filter((x) => x.type === 'effect')) {
    for (const s of t.segments || []) {
      const m = mats.get(s.material_id)?.m || {}
      const kind = EFFECTS[m.name]
      if (!kind) unknown.add(m.name)
      effects.push({
        from: sec(s.target_timerange?.start),
        to: sec((s.target_timerange?.start || 0) + (s.target_timerange?.duration || 0)),
        effect: kind || m.name,
        params: Object.fromEntries((m.adjust_params || []).map((p) => [p.name, r3(p.value)])),
      })
    }
  }
  effects.sort((a, b) => a.from - b.from)
  for (const u of unknown) warnings.push(`effect "${u}" is not drawn by the renderer yet`)
  for (const t of tracks.filter((x) => x.type === 'text' && x.segments?.length)) {
    warnings.push(`${t.segments.length} text segment(s) not imported`)
  }

  // The song: every audio segment, each with its own in-point and speed (a
  // format can speed the intro up and drop back to 1× on the drop).
  const audioTrack = tracks.find((t) => t.type === 'audio' && t.segments?.length)
  if (!audioTrack) throw new Error(`${project}: no audio on the timeline`)
  const firstAudio = mats.get(audioTrack.segments[0].material_id)?.m || {}
  const songAt = await sourceOf(firstAudio.path || '')
  if (!songAt) throw new Error(`${project}: song not found at ${firstAudio.path}`)
  const songFile = await stash(songAt, slug(path.basename(firstAudio.path)), copied)
  const audio = audioTrack.segments.map((s) => ({
    from: sec(s.target_timerange?.start),
    to: sec((s.target_timerange?.start || 0) + (s.target_timerange?.duration || 0)),
    src: sec(s.source_timerange?.start),
    speed: r3(s.speed || 1),
    volume: r3(s.volume ?? 1),
  }))

  // The drop: where the buffed material starts.
  const firstBuffed = video.find((v) => v.role.endsWith('_buffed'))
  const duration = sec(d.duration)

  return {
    format: {
      id: project,
      song: parsed.song,
      format: parsed.format,
      project,
      importedAt: new Date().toISOString(),
      fps: d.fps || 30,
      width: d.canvas_config?.width || 1080,
      height: d.canvas_config?.height || 1920,
      duration,
      drop: firstBuffed ? firstBuffed.from : 0,
      audio: { file: songFile, name: firstAudio.name || path.basename(firstAudio.path), segments: audio },
      video,
      overlays,
      filters,
      effects,
      warnings,
    },
    warnings,
  }
}

// Import every format project, replacing the whole set: a project renamed or
// deleted in CapCut drops out here too. A project that is still there but
// fails to import keeps its previous format rather than vanishing.
export async function importAll() {
  const projects = await scanProjects()
  const copied = new Set()
  const formats = []
  const errors = []
  for (const p of projects) {
    try {
      const { format } = await importProject(p.project, copied)
      formats.push(format)
    } catch (e) {
      errors.push({ project: p.project, error: e instanceof Error ? e.message : String(e) })
    }
  }
  const failed = new Set(errors.map((e) => `${e.project}.json`))
  const kept = []
  for (const name of failed) {
    try {
      await fs.access(path.join(outDirs()[0], name))
      kept.push(name)
    } catch {
      /* never imported — nothing to keep */
    }
  }
  const index = [...formats.map((f) => `${f.id}.json`), ...kept].sort()
  for (const dir of outDirs()) {
    try {
      await fs.access(path.dirname(dir))
    } catch {
      continue
    }
    await fs.mkdir(dir, { recursive: true })
    for (const old of await fs.readdir(dir)) {
      if (old.endsWith('.json') && !failed.has(old)) await fs.rm(path.join(dir, old))
    }
    for (const f of formats) {
      await fs.writeFile(path.join(dir, `${f.id}.json`), JSON.stringify(f, null, 2) + '\n')
    }
    await fs.writeFile(path.join(dir, 'index.json'), JSON.stringify(index) + '\n')
  }
  return {
    imported: formats.map((f) => ({ id: f.id, warnings: f.warnings })),
    errors,
  }
}
