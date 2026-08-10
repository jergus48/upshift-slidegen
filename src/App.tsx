import { useEffect, useState, useCallback } from 'react';
import { Menu } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { ScheduleModal } from './components/ScheduleModal';
import { BulkScheduleModal } from './components/BulkScheduleModal';
import { GenerateModal } from './components/GenerateModal';
import { SlideshowEditorModal } from './components/SlideshowEditorModal';
import { LoginGate } from './components/LoginGate';
import { QueueView } from './views/QueueView';
import { CreateView } from './views/CreateView';
import { PhotoPackView } from './views/PhotoPackView';
import { LibraryView } from './views/LibraryView';
import { RedditView } from './views/RedditView';
import { ReplyView } from './views/ReplyView';
import { WriteView } from './views/WriteView';
import { SubredditView } from './views/SubredditView';
import { PromptView } from './views/PromptView';
import { ScrubView } from './views/ScrubView';
import { ScheduleView } from './views/ScheduleView';
import { ResultsView } from './views/ResultsView';
import { ChannelsView } from './views/ChannelsView';
import { BrainView } from './views/BrainView';
import { SettingsView } from './views/SettingsView';
import { renderSlideshow } from './lib/render';
import { loadQueue, saveQueue, recoverOrphanQueues } from './lib/localQueue';
import { getMergedLibrary } from './lib/mergedLibrary';
import { getHiddenPhotos } from './lib/hiddenPhotos';
import { assignBackgrounds, assignAppSlidePov } from './lib/backgrounds';
import { libraryRef } from './lib/imageSrc';
import { getQuitPresets, type Gender } from './lib/quitPresets';
import * as ws from './lib/localWorkspace';
import * as api from './lib/api';
import type {
  AppConfig,
  KeyStatus,
  KeysPatch,
  Workspace,
  Project,
  Slideshow,
  Slide,
  LibraryImage,
  SocialAccount,
  BrainState,
  ViewKey,
} from './types';
import type { CaptionStyle } from './lib/captionStyle';

export default function App() {
  // Config is assembled from two sources: API-key status (server) and the
  // workspace — projects, Brain, model (this browser's localStorage).
  const [keys, setKeys] = useState<KeyStatus | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [bundledPackNames, setBundledPackNames] = useState<string[]>([]);
  const [authStatus, setAuthStatus] = useState<{ required: boolean; authed: boolean } | null>(null);
  const [activeView, setActiveView] = useState<ViewKey>('queue');
  const [queue, setQueue] = useState<Slideshow[]>([]);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [generating, setGenerating] = useState(false);
  const [scheduling, setScheduling] = useState<Slideshow | null>(null);
  const [editing, setEditing] = useState<Slideshow | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile drawer
  const [error, setError] = useState<string | null>(null);

  const config: AppConfig | null = keys && workspace ? { keys, ...workspace } : null;
  const hasOpenrouter = !!keys?.openrouter;
  const hasPostbridge = !!keys?.postbridge;
  const hasApify = !!keys?.apify;
  const activeProject: Project | undefined = workspace?.projects.find(
    (p) => p.id === workspace.activeProjectId
  ) ?? workspace?.projects[0];

  const loadAccounts = useCallback(async () => {
    try {
      setAccounts(await api.getAccounts());
    } catch {
      setAccounts([]);
    }
  }, []);

  const loadApp = useCallback(async () => {
    const keyStatus = await api.getKeyStatus();
    setKeys(keyStatus);
    // Bundled pack names seed a fresh project's default background packs.
    const bundled = await api.getPacks().then((p) => p.map((x) => x.name)).catch(() => []);
    setBundledPackNames(bundled);
    const w = ws.loadWorkspace(bundled);
    // Rescue queues orphaned by older builds (when the project id came from the
    // server and changed on every cold start). Runs before the workspace is set,
    // so the queue-load effect below picks up the recovered items.
    recoverOrphanQueues(w.projects.map((p) => p.id), w.activeProjectId);
    setWorkspace(w);
    if (!keyStatus.openrouter && !keyStatus.postbridge) setActiveView('settings');
    if (keyStatus.postbridge) loadAccounts();
  }, [loadAccounts]);

  // On a password-protected deployment, check auth before loading anything
  // else — a missing/expired login shows the LoginGate instead of an error.
  useEffect(() => {
    (async () => {
      try {
        const auth = await api.getAuthStatus();
        setAuthStatus(auth);
        if (auth.required && !auth.authed) return;
        await loadApp();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not reach the Slidesmith server.');
      }
    })();
  }, [loadApp]);

  const handleLoggedIn = async () => {
    setError(null);
    setAuthStatus({ required: true, authed: true });
    try {
      await loadApp();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the Slidesmith server.');
    }
  };

  // The queue lives in the browser (per project) — load it whenever the active
  // project changes, and persist it back on every change. `queueProject` tracks
  // which project the current `queue` state was loaded for, so the save effect
  // can't clobber a project's stored queue with the stale (empty) state from
  // before its load effect has run.
  const activeProjectId = workspace?.activeProjectId;
  const [queueProject, setQueueProject] = useState<string | null>(null);
  useEffect(() => {
    if (!activeProjectId) return;
    setQueue(loadQueue(activeProjectId));
    setQueueProject(activeProjectId);
  }, [activeProjectId]);

  useEffect(() => {
    if (activeProjectId && queueProject === activeProjectId) saveQueue(activeProjectId, queue);
  }, [queue, queueProject, activeProjectId]);

  const generate = async (opts: { count: number; slidesPerShow: number; length: 'short' | 'long'; packs: string[]; audience?: string; styleMemory?: string; captionStyle: CaptionStyle; gender: Gender }) => {
    if (!activeProject) return;
    setError(null);
    setGenerating(true);
    try {
      // The per-batch audience/style-memory overrides win; otherwise fall back
      // to this project's saved Brain.
      const brain: BrainState = {
        ...activeProject.brain,
        audience: opts.audience?.trim() || activeProject.brain.audience,
        styleMemory: opts.styleMemory?.trim() || activeProject.brain.styleMemory,
      };
      const slideshows = await api.generate({ count: opts.count, slidesPerShow: opts.slidesPerShow, length: opts.length, model: workspace!.model, brain });
      const withBackgrounds = await decorateShows(slideshows, opts.packs, opts.gender, opts.captionStyle);
      setQueue((q) => [...withBackgrounds, ...q]);
      setGenerateOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  };

  // Assigns client-side backgrounds + the gendered POV shot on the app slide and
  // stamps the chosen caption look — shared by single-batch and all-preset runs.
  // Backgrounds are assigned client-side now — the server no longer knows about
  // scraped/uploaded images (they live in this browser's IndexedDB).
  const decorateShows = async (
    slideshows: Slideshow[],
    packs: string[],
    gender: Gender,
    captionStyle: CaptionStyle,
  ) => {
    const library = await getMergedLibrary();
    const pool = packs.length ? library.filter((i) => packs.includes(i.pack)) : [];
    // POV pack for this batch's gender — set once in Brain — a random shot from
    // it lands on the app ("Upshift") slide so it never has to be swapped by hand.
    const povPack = gender === 'women' ? activeProject!.povPackWomen : activeProject!.povPackMen;
    const povPool = povPack ? library.filter((i) => i.pack === povPack) : [];
    return assignAppSlidePov(assignBackgrounds(slideshows, pool), povPool).map((show) => ({
      ...show,
      // Stamp the chosen caption look onto every slide so the preview and the
      // baked PNG both render it.
      slides: show.slides.map((sl) => ({ ...sl, captionStyle })),
    }));
  };

  // "Generate all presets": one run per preset in the chosen gender pack, each
  // with that preset's own audience, style memory and slide count. Decks stream
  // onto the queue as each preset finishes, so progress is visible.
  const generateAll = async (opts: { count: number; length: 'short' | 'long'; packs: string[]; captionStyle: CaptionStyle; gender: Gender }) => {
    if (!activeProject) return;
    setError(null);
    setGenerating(true);
    try {
      const presets = getQuitPresets(opts.gender);
      for (const p of presets) {
        const brain: BrainState = {
          ...activeProject.brain,
          audience: p.audience,
          styleMemory: p.styleMemory,
        };
        const slideshows = await api.generate({ count: opts.count, slidesPerShow: p.slides, length: opts.length, model: workspace!.model, brain });
        const withBackgrounds = await decorateShows(slideshows, opts.packs, opts.gender, opts.captionStyle);
        setQueue((q) => [...withBackgrounds, ...q]);
      }
      setGenerateOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  };

  // Photo packs: the server returns whole slideshows with real R2 photos already
  // on every slide (no client-side background step). We only stamp the chosen
  // caption look, push them onto the queue, and jump to the Queue to review.
  const generatePhotoPacks = async (opts: { count: number; captionStyle: CaptionStyle; coverPack?: string; appPack?: string; hookStyle?: string }) => {
    if (!activeProject) return;
    setError(null);
    setGenerating(true);
    try {
      const brain: BrainState = { ...activeProject.brain };
      // Photos the user hid in the Photo Packs curation grid — the server picker
      // skips these so a bad shot never lands in a pack.
      const exclude = [...getHiddenPhotos()];
      const packs = await api.photoPack({ count: opts.count, model: workspace!.model, brain, exclude, hookStyle: opts.hookStyle });
      // The cover (slide 0) and app slide (slide 4) can be overridden with the
      // user's own library packs. Those images live in this browser, so we swap
      // them in here — a fresh random image per pack — after the server has
      // supplied the text and the default library photos.
      let coverPool: LibraryImage[] = [];
      let appPool: LibraryImage[] = [];
      if (opts.coverPack || opts.appPack) {
        const library = await getMergedLibrary();
        coverPool = opts.coverPack ? library.filter((i) => i.pack === opts.coverPack) : [];
        appPool = opts.appPack ? library.filter((i) => i.pack === opts.appPack) : [];
      }
      const rand = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
      const withStyle = packs.map((show) => ({
        ...show,
        slides: show.slides.map((sl, idx) => {
          const imageUrl =
            idx === 0 && coverPool.length ? libraryRef(rand(coverPool))
            : idx === 4 && appPool.length ? libraryRef(rand(appPool))
            : sl.imageUrl;
          return { ...sl, imageUrl, captionStyle: opts.captionStyle };
        }),
      }));
      setQueue((q) => [...withStyle, ...q]);
      setActiveView('queue');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setGenerating(false);
    }
  };

  const reject = (id: string) => {
    setQueue((q) => q.filter((s) => s.id !== id));
  };

  // Builds the same Slideshow shape /api/generate produces, entirely
  // client-side — the Create page supplies its own text + images, no AI call needed.
  const addManualSlideshow = async (payload: { caption: string; hashtags: string[]; slides: Slide[] }) => {
    const stamp = Date.now();
    const show: Slideshow = {
      id: `q-${stamp}-custom`,
      hook: payload.slides[0]?.text || payload.caption || 'Custom slideshow',
      caption: payload.caption,
      hashtags: payload.hashtags,
      rationale: 'Manually created',
      createdAt: new Date(stamp).toISOString(),
      slides: payload.slides.map((s, i) => ({
        id: `slide-${stamp}-${i}`,
        text: s.text,
        imageUrl: s.imageUrl,
        bgFrom: s.bgFrom || '#0f172a',
        bgTo: s.bgTo || '#1e293b',
      })),
    };
    setQueue((q) => [show, ...q]);
  };

  // Keep the multi-select in sync as queue items come and go.
  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => queue.some((s) => s.id === id)));
  }, [queue]);

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const bulkDone = (succeededIds: string[]) => {
    setBulkOpen(false);
    setSelectedIds([]);
    setQueue((q) => q.filter((s) => !succeededIds.includes(s.id)));
    setActiveView('schedule');
  };

  const saveEdits = async (patch: { slides: Slide[]; caption: string; hashtags: string[] }) => {
    if (!editing) return;
    const editingId = editing.id;
    setQueue((q) => q.map((s) => (s.id === editingId ? { ...s, ...patch } : s)));
    setEditing(null);
  };

  const confirmSchedule = async (opts: {
    socialAccounts: number[];
    mode: 'draft' | 'schedule';
    scheduledAt: string | null;
  }) => {
    if (!scheduling) return;
    const scheduledId = scheduling.id;
    const slides = await renderSlideshow(scheduling);
    await api.schedule({
      id: scheduledId,
      caption: `${scheduling.caption}${scheduling.hashtags.length ? ' ' + scheduling.hashtags.map((t) => `#${t}`).join(' ') : ''}`,
      slides,
      socialAccounts: opts.socialAccounts,
      scheduledAt: opts.scheduledAt,
      mode: opts.mode,
    });
    // The modal stays open showing its success state with a link to
    // post-bridge instead of us jumping to the Schedule tab.
    setQueue((q) => q.filter((s) => s.id !== scheduledId));
  };

  // API keys are saved server-side; everything else (model, actor, project
  // name/defaults/packs) is a local workspace edit.
  const saveSettings = async (patch: {
    keys?: KeysPatch;
    model?: string;
    pinterestActor?: string;
    hiddenViews?: ViewKey[];
    name?: string;
    defaults?: Project['defaults'];
    imagePacks?: string[];
  }) => {
    if (patch.keys && Object.keys(patch.keys).length) {
      setKeys(await api.saveKeys(patch.keys));
    }
    if (!workspace) return;
    let next = workspace;
    if (patch.model !== undefined || patch.pinterestActor !== undefined || patch.hiddenViews !== undefined) {
      next = ws.updateGlobal(next, {
        model: patch.model,
        pinterestActor: patch.pinterestActor,
        hiddenViews: patch.hiddenViews,
      });
    }
    if (activeProject && (patch.name !== undefined || patch.defaults || patch.imagePacks)) {
      next = ws.updateProject(next, activeProject.id, {
        name: patch.name,
        defaults: patch.defaults,
        imagePacks: patch.imagePacks,
      });
    }
    setWorkspace(next);
  };

  const saveBrain = (brain: BrainState) => {
    if (!activeProject || !workspace) return;
    setWorkspace(ws.updateProject(workspace, activeProject.id, { brain }));
  };

  const savePovPacks = (patch: { povPackMen?: string; povPackWomen?: string }) => {
    if (!activeProject || !workspace) return;
    setWorkspace(ws.updateProject(workspace, activeProject.id, patch));
  };

  const switchProject = (id: string) => {
    if (workspace) setWorkspace(ws.setActiveProject(workspace, id));
  };

  const newProject = () => {
    if (!workspace) return;
    setWorkspace(ws.createProject(workspace, bundledPackNames));
    setActiveView('settings');
  };

  const removeProject = (id: string) => {
    if (workspace) setWorkspace(ws.deleteProject(workspace, id, bundledPackNames));
  };

  // Bulk background tool (Queue selection): set slide N's background across the
  // selected slideshows. Each update targets one slideshow's slide by index.
  const applyBulkBackground = (updates: { slideshowId: string; slideIndex: number; ref: string }[]) => {
    const byShow = new Map<string, Map<number, string>>();
    for (const u of updates) {
      if (!byShow.has(u.slideshowId)) byShow.set(u.slideshowId, new Map());
      byShow.get(u.slideshowId)!.set(u.slideIndex, u.ref);
    }
    setQueue((q) =>
      q.map((s) => {
        const slideRefs = byShow.get(s.id);
        if (!slideRefs) return s;
        return {
          ...s,
          slides: s.slides.map((sl, i) =>
            slideRefs.has(i) ? { ...sl, imageUrl: slideRefs.get(i) } : sl
          ),
        };
      })
    );
  };

  if (authStatus === null) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-bg text-ink-5 text-[13px]">
        {error ? <span className="text-red-600 max-w-sm text-center">{error}</span> : 'Loading…'}
      </div>
    );
  }

  if (authStatus.required && !authStatus.authed) {
    return <LoginGate onSuccess={handleLoggedIn} />;
  }

  if (!config || !activeProject) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-bg text-ink-5 text-[13px]">
        {error ? <span className="text-red-600 max-w-sm text-center">{error}</span> : 'Loading…'}
      </div>
    );
  }

  return (
    <div className="flex h-full w-full bg-bg text-ink">
      <Sidebar
        activeView={activeView}
        onSelectView={(v) => { setActiveView(v); setSidebarOpen(false); }}
        queueCount={queue.length}
        scheduledCount={0}
        projects={config.projects}
        activeProjectId={config.activeProjectId}
        onSwitchProject={switchProject}
        onNewProject={newProject}
        hiddenViews={config.hiddenViews}
        mobileOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <main className="flex-1 h-full overflow-hidden flex flex-col min-w-0">
        {/* Mobile top bar with menu toggle (sidebar is a drawer on phones) */}
        <div className="md:hidden flex items-center gap-2.5 px-4 h-12 border-b border-line bg-bg shrink-0">
          <button onClick={() => setSidebarOpen(true)} aria-label="Open menu" className="text-ink-4 hover:text-ink -ml-1 p-1">
            <Menu size={20} />
          </button>
          <span className="text-[14px] font-semibold text-ink">Upshift SlideGen</span>
        </div>

        {error && activeView !== 'settings' && (
          <div className="px-8 py-2 bg-red-50 border-b border-red-200 text-[12px] text-red-700">
            {error}
          </div>
        )}

        {activeView === 'queue' && (
          <QueueView
            slideshows={queue}
            generating={generating}
            canGenerate={hasOpenrouter}
            onGenerate={() => setGenerateOpen(true)}
            selectedIds={selectedIds}
            onApprove={(id) => setScheduling(queue.find((s) => s.id === id) || null)}
            onReject={reject}
            onEdit={(id) => setEditing(queue.find((s) => s.id === id) || null)}
            onToggleSelect={toggleSelect}
            onSelectAll={() => setSelectedIds(queue.map((s) => s.id))}
            onClearSelection={() => setSelectedIds([])}
            onBulkSchedule={() => setBulkOpen(true)}
            onBulkSetBackground={applyBulkBackground}
          />
        )}
        {activeView === 'create' && (
          <CreateView
            onAddToQueue={addManualSlideshow}
            queue={queue}
            onApplyToSlideshow={(id, slides) =>
              setQueue((q) => q.map((s) => (s.id === id ? { ...s, slides } : s)))
            }
          />
        )}
        {activeView === 'photopack' && (
          <PhotoPackView
            generating={generating}
            canGenerate={hasOpenrouter}
            onGenerate={generatePhotoPacks}
          />
        )}
        {activeView === 'library' && <LibraryView hasApify={hasApify} pinterestActor={config.pinterestActor} />}
        {activeView === 'reddit' && <RedditView canGenerate={hasOpenrouter} model={config.model} />}
        {activeView === 'reply' && <ReplyView canGenerate={hasOpenrouter} model={config.model} />}
        {activeView === 'write' && <WriteView canGenerate={hasOpenrouter} model={config.model} />}
        {activeView === 'subreddit' && <SubredditView canGenerate={hasOpenrouter} model={config.model} />}
        {activeView === 'prompt' && <PromptView canGenerate={hasOpenrouter} model={config.model} />}
        {activeView === 'clean' && <ScrubView />}
        {activeView === 'schedule' && <ScheduleView configured={hasPostbridge} />}
        {activeView === 'results' && <ResultsView configured={hasPostbridge} />}
        {activeView === 'channels' && <ChannelsView />}
        {activeView === 'brain' && (
          <BrainView
            brain={activeProject.brain}
            onChange={saveBrain}
            povPackMen={activeProject.povPackMen}
            povPackWomen={activeProject.povPackWomen}
            onChangePovPacks={savePovPacks}
          />
        )}
        {activeView === 'settings' && (
          <SettingsView
            config={config}
            project={activeProject}
            accounts={accounts}
            canDelete={config.projects.length > 1}
            onSave={saveSettings}
            onDeleteProject={() => removeProject(activeProject.id)}
            onReloadAccounts={loadAccounts}
          />
        )}
      </main>

      {scheduling && (
        <ScheduleModal
          slideshow={scheduling}
          accounts={accounts}
          defaults={activeProject.defaults}
          onClose={() => setScheduling(null)}
          onConfirm={confirmSchedule}
        />
      )}

      {editing && (
        <SlideshowEditorModal
          slideshow={editing}
          onClose={() => setEditing(null)}
          onSave={saveEdits}
        />
      )}

      {bulkOpen && selectedIds.length > 0 && (
        <BulkScheduleModal
          slideshows={queue.filter((s) => selectedIds.includes(s.id))}
          accounts={accounts}
          defaults={activeProject.defaults}
          onClose={() => {
            setBulkOpen(false);
            setSelectedIds([]);
          }}
          onDone={bulkDone}
        />
      )}

      {generateOpen && (
        <GenerateModal
          defaultAudience={activeProject.brain.audience}
          defaultStyleMemory={activeProject.brain.styleMemory}
          generating={generating}
          onClose={() => setGenerateOpen(false)}
          onGenerate={generate}
          onGenerateAll={generateAll}
        />
      )}
    </div>
  );
}
