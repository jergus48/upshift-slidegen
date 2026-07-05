// Config + queue persistence. Backed by local JSON files when self-hosted, or
// shared Redis when deployed (see storage.js) — same shape either way, so a
// project/queue looks identical no matter who's hitting the deployment.
//
// A "project" is one brand/account you generate for. Only the Brain and the
// default post-bridge accounts differ per project; the API keys and model are
// global. The queue (generated-but-unscheduled drafts) is per project.
import { readData, writeData, DATA_DIR } from './storage.js'
import { bundledPackNames } from './library.js'

const CONFIG_KEY = 'config'
const QUEUE_KEY = 'queue'

const DEFAULT_BRAIN = {
  niche: '',
  appName: '',
  appDescription: '',
  audience: '',
  styleMemory: '',
}
const DEFAULT_DEFAULTS = { socialAccountIds: [], mode: 'draft' }

function newId(prefix) {
  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e6)}`
}
function makeProject(name, brain, defaults, imagePacks) {
  return {
    id: newId('p'),
    name: name || 'Project 1',
    brain: { ...DEFAULT_BRAIN, ...brain },
    defaults: { ...DEFAULT_DEFAULTS, ...defaults },
    // Which background packs generation draws from. Defaults to all bundled
    // packs so a fresh project generates with images out of the box. Empty = gradients.
    imagePacks: imagePacks ?? bundledPackNames(),
  }
}

// Normalize on every read: fill defaults and migrate the old single-brain shape
// ({ brain, defaults } at top level) into projects[].
export async function getConfig() {
  const s = await readData(CONFIG_KEY, {})
  let projects = Array.isArray(s.projects) && s.projects.length
    ? s.projects.map((p) => ({
        id: p.id || newId('p'),
        name: p.name || 'Project',
        brain: { ...DEFAULT_BRAIN, ...p.brain },
        defaults: { ...DEFAULT_DEFAULTS, ...p.defaults },
        imagePacks: p.imagePacks ?? bundledPackNames(),
      }))
    : null

  if (!projects) {
    // Migrate a pre-projects config, or create the first project.
    const p = makeProject(s.brain?.appName || 'Project 1', s.brain, s.defaults)
    projects = [p]
  }

  const activeProjectId = projects.some((p) => p.id === s.activeProjectId)
    ? s.activeProjectId
    : projects[0].id

  const cfg = {
    keys: { postbridge: '', openrouter: '', apify: '', ...s.keys },
    model: s.model || 'openai/gpt-4o-mini',
    pinterestActor: s.pinterestActor || 'fatihtahta/pinterest-scraper-search',
    projects,
    activeProjectId,
  }

  // If we had to synthesize/migrate projects (no valid persisted projects array,
  // or the active id was stale), write it back once so project ids are stable
  // across subsequent reads. Otherwise every read would mint fresh ids.
  const needsPersist =
    !Array.isArray(s.projects) ||
    s.projects.length !== projects.length ||
    s.activeProjectId !== activeProjectId ||
    s.projects.some((p, i) => p.id !== projects[i].id)
  if (needsPersist) await writeData(CONFIG_KEY, cfg)

  return cfg
}

function writeConfig(cfg) {
  return writeData(CONFIG_KEY, cfg)
}

// Global settings only (keys + model). Project data is edited via the project ops.
// Blank/omitted key fields are ignored so clearing a Settings field never wipes
// an already-saved key (the UI never re-sends the real key value once set).
export async function saveGlobal(patch) {
  const c = await getConfig()
  const keyPatch = {}
  for (const k of ['postbridge', 'openrouter', 'apify']) {
    if (patch.keys?.[k]) keyPatch[k] = patch.keys[k]
  }
  return writeConfig({
    ...c,
    model: patch.model ?? c.model,
    pinterestActor: patch.pinterestActor ?? c.pinterestActor,
    keys: { ...c.keys, ...keyPatch },
  })
}

export async function getActiveProject(c) {
  const cfg = c || (await getConfig())
  return cfg.projects.find((p) => p.id === cfg.activeProjectId) || cfg.projects[0]
}

export async function createProject(name) {
  const c = await getConfig()
  const project = makeProject(name || `Project ${c.projects.length + 1}`)
  return writeConfig({ ...c, projects: [...c.projects, project], activeProjectId: project.id })
}

export async function updateProject(id, patch) {
  const c = await getConfig()
  const projects = c.projects.map((p) =>
    p.id === id
      ? {
          ...p,
          name: patch.name ?? p.name,
          brain: patch.brain ? { ...p.brain, ...patch.brain } : p.brain,
          defaults: patch.defaults ? { ...p.defaults, ...patch.defaults } : p.defaults,
          imagePacks: patch.imagePacks ?? p.imagePacks,
        }
      : p
  )
  return writeConfig({ ...c, projects })
}

export async function deleteProject(id) {
  const c = await getConfig()
  let projects = c.projects.filter((p) => p.id !== id)
  if (!projects.length) projects = [makeProject('Project 1')]
  const activeProjectId = c.activeProjectId === id ? projects[0].id : c.activeProjectId
  await removeQueueFor(id)
  return writeConfig({ ...c, projects, activeProjectId })
}

export async function setActiveProject(id) {
  const c = await getConfig()
  if (!c.projects.some((p) => p.id === id)) throw new Error('Unknown project')
  return writeConfig({ ...c, activeProjectId: id })
}

// ── Queue (per project) ───────────────────────────────────────────────────────
async function readQueueMap() {
  const m = await readData(QUEUE_KEY, {})
  return m && !Array.isArray(m) ? m : {}
}
function writeQueueMap(m) {
  return writeData(QUEUE_KEY, m).then(() => m)
}
export async function getQueue(projectId) {
  const m = await readQueueMap()
  return m[projectId] || []
}
export async function setQueue(projectId, items) {
  const m = await readQueueMap()
  m[projectId] = items
  await writeQueueMap(m)
  return items
}
export async function addToQueue(projectId, items) {
  return setQueue(projectId, [...items, ...(await getQueue(projectId))])
}
export async function removeFromQueue(projectId, id) {
  return setQueue(projectId, (await getQueue(projectId)).filter((s) => s.id !== id))
}
async function removeQueueFor(projectId) {
  const m = await readQueueMap()
  delete m[projectId]
  await writeQueueMap(m)
}

export const CONFIG_DIR = DATA_DIR
