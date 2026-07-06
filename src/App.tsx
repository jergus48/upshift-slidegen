import { useEffect, useState, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { ScheduleModal } from './components/ScheduleModal';
import { BulkScheduleModal } from './components/BulkScheduleModal';
import { GenerateModal } from './components/GenerateModal';
import { SlideshowEditorModal } from './components/SlideshowEditorModal';
import { LoginGate } from './components/LoginGate';
import { QueueView } from './views/QueueView';
import { CreateView } from './views/CreateView';
import { LibraryView } from './views/LibraryView';
import { ScheduleView } from './views/ScheduleView';
import { ResultsView } from './views/ResultsView';
import { BrainView } from './views/BrainView';
import { SettingsView } from './views/SettingsView';
import { renderSlideshow } from './lib/render';
import { loadQueue, saveQueue } from './lib/localQueue';
import { getMergedLibrary } from './lib/mergedLibrary';
import { assignBackgrounds } from './lib/backgrounds';
import * as api from './lib/api';
import type { AppConfig, KeysPatch, Project, Slideshow, Slide, SocialAccount, BrainState, ViewKey } from './types';

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
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
  const [error, setError] = useState<string | null>(null);

  const hasOpenrouter = !!config?.keys.openrouter;
  const hasPostbridge = !!config?.keys.postbridge;
  const hasApify = !!config?.keys.apify;
  const activeProject: Project | undefined = config?.projects.find(
    (p) => p.id === config.activeProjectId
  ) ?? config?.projects[0];

  const loadAccounts = useCallback(async () => {
    try {
      setAccounts(await api.getAccounts());
    } catch {
      setAccounts([]);
    }
  }, []);

  const loadApp = useCallback(async () => {
    const cfg = await api.getConfig();
    setConfig(cfg);
    if (!cfg.keys.openrouter && !cfg.keys.postbridge) setActiveView('settings');
    if (cfg.keys.postbridge) loadAccounts();
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

  // The queue lives in the browser (per project) — load it whenever the
  // active project changes, and persist it back on every change.
  useEffect(() => {
    if (config?.activeProjectId) setQueue(loadQueue(config.activeProjectId));
  }, [config?.activeProjectId]);

  useEffect(() => {
    if (config?.activeProjectId) saveQueue(config.activeProjectId, queue);
  }, [queue, config?.activeProjectId]);

  const generate = async (opts: { count: number; packs: string[]; audience?: string; styleMemory?: string }) => {
    setError(null);
    setGenerating(true);
    try {
      const slideshows = await api.generate({ count: opts.count, audience: opts.audience, styleMemory: opts.styleMemory });
      // Backgrounds are assigned client-side now — the server no longer knows
      // about scraped/uploaded images (they live in this browser's IndexedDB).
      const pool = opts.packs.length ? (await getMergedLibrary()).filter((i) => opts.packs.includes(i.pack)) : [];
      const withBackgrounds = assignBackgrounds(slideshows, pool);
      setQueue((q) => [...withBackgrounds, ...q]);
      setGenerateOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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

  // Global settings (keys/model) + per-project edits (name/defaults), in one call.
  const saveSettings = async (patch: {
    keys?: KeysPatch;
    model?: string;
    pinterestActor?: string;
    name?: string;
    defaults?: Project['defaults'];
    imagePacks?: string[];
  }) => {
    if (patch.keys || patch.model !== undefined || patch.pinterestActor !== undefined) {
      await api.saveConfig({ keys: patch.keys, model: patch.model, pinterestActor: patch.pinterestActor });
    }
    if (activeProject && (patch.name !== undefined || patch.defaults || patch.imagePacks)) {
      await api.updateProject(activeProject.id, {
        name: patch.name,
        defaults: patch.defaults,
        imagePacks: patch.imagePacks,
      });
    }
    setConfig(await api.getConfig());
  };

  const saveBrain = async (brain: BrainState) => {
    if (!activeProject) return;
    // Optimistic local update so typing stays snappy, then persist.
    setConfig((c) =>
      c
        ? { ...c, projects: c.projects.map((p) => (p.id === activeProject.id ? { ...p, brain } : p)) }
        : c
    );
    await api.updateProject(activeProject.id, { brain });
  };

  const switchProject = async (id: string) => {
    setConfig(await api.activateProject(id));
  };

  const newProject = async () => {
    setConfig(await api.createProject());
    setActiveView('settings');
  };

  const removeProject = async (id: string) => {
    setConfig(await api.deleteProject(id));
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
        onSelectView={setActiveView}
        queueCount={queue.length}
        scheduledCount={0}
        projects={config.projects}
        activeProjectId={config.activeProjectId}
        onSwitchProject={switchProject}
        onNewProject={newProject}
      />
      <main className="flex-1 h-full overflow-hidden flex flex-col">
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
          />
        )}
        {activeView === 'create' && <CreateView onAddToQueue={addManualSlideshow} />}
        {activeView === 'library' && <LibraryView hasApify={hasApify} />}
        {activeView === 'schedule' && <ScheduleView configured={hasPostbridge} />}
        {activeView === 'results' && <ResultsView configured={hasPostbridge} />}
        {activeView === 'brain' && <BrainView brain={activeProject.brain} onChange={saveBrain} />}
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
          defaultPacks={activeProject.imagePacks}
          defaultAudience={activeProject.brain.audience}
          defaultStyleMemory={activeProject.brain.styleMemory}
          generating={generating}
          onClose={() => setGenerateOpen(false)}
          onGenerate={generate}
        />
      )}
    </div>
  );
}
