// The workspace — projects (each with its Brain, posting defaults, and chosen
// background packs), the active project, the model, and the Pinterest actor —
// lives in the browser's localStorage. It used to be server-side config, but
// that doesn't survive cold starts on a serverless deployment, so it moved
// here alongside the queue and image library. API keys are the one thing that
// stays server-side (see server/store.js).
import type { Workspace, Project, BrainState, ProjectDefaults, ViewKey } from '../types';

const KEY = 'slidesmith:workspace';

const DEFAULT_MODEL = 'openai/gpt-4o-mini';
const DEFAULT_ACTOR = 'fatihtahta/pinterest-scraper-search';

const DEFAULT_BRAIN: BrainState = {
  niche: '',
  appName: '',
  appDescription: '',
  audience: '',
  styleMemory: '',
};
const DEFAULT_DEFAULTS: ProjectDefaults = { socialAccountIds: [], mode: 'draft' };

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
}

// `defaultPacks` seeds a fresh project's background packs (all bundled packs,
// so generation has images out of the box). Passed in because the caller
// knows the bundled pack names (fetched from the server).
export function makeProject(name: string, defaultPacks: string[], partial?: Partial<Project>): Project {
  return {
    id: newId('p'),
    name: name || 'Project 1',
    brain: { ...DEFAULT_BRAIN, ...partial?.brain },
    defaults: { ...DEFAULT_DEFAULTS, ...partial?.defaults },
    imagePacks: partial?.imagePacks ?? defaultPacks,
    povPackMen: partial?.povPackMen,
    povPackWomen: partial?.povPackWomen,
  };
}

function normalize(raw: Partial<Workspace> | null, defaultPacks: string[]): Workspace {
  const projects: Project[] = Array.isArray(raw?.projects) && raw!.projects.length
    ? raw!.projects.map((p) => ({
        id: p.id || newId('p'),
        name: p.name || 'Project',
        brain: { ...DEFAULT_BRAIN, ...p.brain },
        defaults: { ...DEFAULT_DEFAULTS, ...p.defaults },
        imagePacks: p.imagePacks ?? defaultPacks,
        povPackMen: p.povPackMen,
        povPackWomen: p.povPackWomen,
      }))
    : [makeProject('Project 1', defaultPacks)];

  const activeProjectId = projects.some((p) => p.id === raw?.activeProjectId)
    ? raw!.activeProjectId!
    : projects[0].id;

  return {
    model: raw?.model || DEFAULT_MODEL,
    pinterestActor: raw?.pinterestActor || DEFAULT_ACTOR,
    projects,
    activeProjectId,
    hiddenViews: Array.isArray(raw?.hiddenViews) ? raw!.hiddenViews! : [],
  };
}

// Load the workspace, creating (and persisting) a default one on first run.
export function loadWorkspace(defaultPacks: string[]): Workspace {
  let raw: Partial<Workspace> | null = null;
  try {
    const stored = localStorage.getItem(KEY);
    if (stored) raw = JSON.parse(stored) as Partial<Workspace>;
  } catch {
    raw = null;
  }
  const ws = normalize(raw, defaultPacks);
  if (!raw) saveWorkspace(ws); // persist the freshly-created default
  return ws;
}

export function saveWorkspace(ws: Workspace): Workspace {
  try {
    localStorage.setItem(KEY, JSON.stringify(ws));
  } catch {
    // Storage full/unavailable — nothing more we can do client-side.
  }
  return ws;
}

// ── Mutations — each returns the new workspace (persisted) ───────────────────
export function updateGlobal(
  ws: Workspace,
  patch: { model?: string; pinterestActor?: string; hiddenViews?: ViewKey[] }
): Workspace {
  return saveWorkspace({
    ...ws,
    model: patch.model ?? ws.model,
    pinterestActor: patch.pinterestActor ?? ws.pinterestActor,
    hiddenViews: patch.hiddenViews ?? ws.hiddenViews,
  });
}

export function createProject(ws: Workspace, defaultPacks: string[]): Workspace {
  const project = makeProject(`Project ${ws.projects.length + 1}`, defaultPacks);
  return saveWorkspace({ ...ws, projects: [...ws.projects, project], activeProjectId: project.id });
}

export function updateProject(
  ws: Workspace,
  id: string,
  patch: Partial<Pick<Project, 'name' | 'brain' | 'defaults' | 'imagePacks' | 'povPackMen' | 'povPackWomen'>>
): Workspace {
  const projects = ws.projects.map((p) =>
    p.id === id
      ? {
          ...p,
          name: patch.name ?? p.name,
          brain: patch.brain ? { ...p.brain, ...patch.brain } : p.brain,
          defaults: patch.defaults ? { ...p.defaults, ...patch.defaults } : p.defaults,
          imagePacks: patch.imagePacks ?? p.imagePacks,
          povPackMen: patch.povPackMen !== undefined ? patch.povPackMen : p.povPackMen,
          povPackWomen: patch.povPackWomen !== undefined ? patch.povPackWomen : p.povPackWomen,
        }
      : p
  );
  return saveWorkspace({ ...ws, projects });
}

export function deleteProject(ws: Workspace, id: string, defaultPacks: string[]): Workspace {
  let projects = ws.projects.filter((p) => p.id !== id);
  if (!projects.length) projects = [makeProject('Project 1', defaultPacks)];
  const activeProjectId = ws.activeProjectId === id ? projects[0].id : ws.activeProjectId;
  return saveWorkspace({ ...ws, projects, activeProjectId });
}

export function setActiveProject(ws: Workspace, id: string): Workspace {
  if (!ws.projects.some((p) => p.id === id)) return ws;
  return saveWorkspace({ ...ws, activeProjectId: id });
}
