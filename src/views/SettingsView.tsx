import { useEffect, useState } from 'react';
import { Check, X, Loader2, KeyRound, Trash2, Info, Eye, EyeOff } from 'lucide-react';
import type { AppConfig, KeysPatch, Project, SocialAccount, ModelOption, ViewKey } from '../types';
import { ViewHeader } from '../components/ViewHeader';
import { Button } from '../components/Button';
import { SIDEBAR_TOOLS } from '../lib/sidebarNav';
import { testKeys, getModels } from '../lib/api';
import { PackPicker } from '../components/PackPicker';

interface SettingsViewProps {
  config: AppConfig;
  project: Project;
  accounts: SocialAccount[];
  canDelete: boolean;
  onSave: (patch: {
    keys?: KeysPatch;
    model?: string;
    pinterestActor?: string;
    hiddenViews?: ViewKey[];
    name?: string;
    defaults?: Project['defaults'];
    imagePacks?: string[];
  }) => Promise<void>;
  onDeleteProject: () => void;
  onReloadAccounts: () => void;
}

const POSTBRIDGE_URL = 'https://post-bridge.com?atp=clip-factory';

const PostBridgeLink = ({ children }: { children: React.ReactNode }) => (
  <a href={POSTBRIDGE_URL} target="_blank" rel="noreferrer" className="text-ink-4 underline hover:text-ink">
    {children}
  </a>
);

const inputClass =
  'w-full h-9 bg-card border border-line rounded-lg px-3 text-[13px] text-ink ' +
  'placeholder:text-ink-6 outline-none transition-colors ' +
  'focus:border-ink-7 focus:ring-2 focus:ring-ink/10';

export function SettingsView({
  config,
  project,
  accounts,
  canDelete,
  onSave,
  onDeleteProject,
  onReloadAccounts,
}: SettingsViewProps) {
  // Real key values never come back from the server (see AppConfig) — these
  // start blank and only carry a NEW value if the user types one.
  const [postbridge, setPostbridge] = useState('');
  const [openrouter, setOpenrouter] = useState('');
  const [apify, setApify] = useState('');
  const [fmp, setFmp] = useState('');
  const [pinterestActor, setPinterestActor] = useState(config.pinterestActor);
  const [model, setModel] = useState(config.model);
  const [name, setName] = useState(project.name);
  const [mode, setMode] = useState(project.defaults.mode);
  const [selected, setSelected] = useState<number[]>(project.defaults.socialAccountIds);
  const [imagePacks, setImagePacks] = useState<string[]>(project.imagePacks);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [modelFilter, setModelFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [test, setTest] = useState<{ postbridge: boolean; openrouter: boolean; apify: boolean; fmp: boolean; errors: Record<string, string> } | null>(null);

  // Re-sync editable fields when the active project changes (switching projects).
  useEffect(() => {
    setName(project.name);
    setMode(project.defaults.mode);
    setSelected(project.defaults.socialAccountIds);
    setImagePacks(project.imagePacks);
  }, [project.id, project.name, project.defaults.mode, project.defaults.socialAccountIds, project.imagePacks]);

  useEffect(() => {
    getModels().then(setModels).catch(() => setModels([]));
  }, []);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    // Only send keys the user actually typed something new for — blank
    // fields must never overwrite an already-saved key.
    const keys: KeysPatch = {};
    if (postbridge.trim()) keys.postbridge = postbridge.trim();
    if (openrouter.trim()) keys.openrouter = openrouter.trim();
    if (apify.trim()) keys.apify = apify.trim();
    if (fmp.trim()) keys.fmp = fmp.trim();
    try {
      await onSave({
        keys: Object.keys(keys).length ? keys : undefined,
        model,
        pinterestActor,
        name,
        defaults: { socialAccountIds: selected, mode },
        imagePacks,
      });
      // Clear typed values — they're saved now, and the field goes back to
      // showing "already set" via its placeholder.
      setPostbridge('');
      setOpenrouter('');
      setApify('');
      setFmp('');
      onReloadAccounts();
      setSaved(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      await save();
      setTest(await testKeys());
      onReloadAccounts();
    } finally {
      setTesting(false);
    }
  };

  const toggleAccount = (id: number) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // Sidebar visibility applies instantly (persisted straight away) — a hidden
  // tool should disappear the moment you toggle it, not wait for "Save settings".
  const toggleTool = (key: ViewKey) => {
    const next = config.hiddenViews.includes(key)
      ? config.hiddenViews.filter((k) => k !== key)
      : [...config.hiddenViews, key];
    void onSave({ hiddenViews: next });
  };

  const filtered = modelFilter
    ? models.filter(
        (m) =>
          m.id.toLowerCase().includes(modelFilter.toLowerCase()) ||
          m.name.toLowerCase().includes(modelFilter.toLowerCase())
      )
    : models;

  return (
    <>
      <ViewHeader
        title="Settings"
        subtitle="Your own API keys — stored server-side only, never sent anywhere but the services they belong to."
      />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-8 space-y-8">
          {/* Project */}
          <Section
            title="Project"
            description="A project is one brand/account. Its Brain and default posting accounts are separate — your API keys and model are shared across all projects."
          >
            <Field label="Project name">
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </Field>
            {canDelete && (
              <Button variant="danger-ghost" icon={<Trash2 size={13} />} onClick={onDeleteProject}>
                Delete this project
              </Button>
            )}
          </Section>

          {/* Sidebar visibility (global) */}
          <Section
            title="Sidebar"
            description="Hide tools you don't use from the sidebar. Changes apply instantly — toggle any back on here whenever you need them."
          >
            <div className="grid grid-cols-2 gap-1.5">
              {SIDEBAR_TOOLS.map((tool) => {
                const isHidden = config.hiddenViews.includes(tool.key);
                return (
                  <button
                    key={tool.key}
                    onClick={() => toggleTool(tool.key)}
                    aria-pressed={!isHidden}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition-colors ${
                      isHidden
                        ? 'border-line bg-surface text-ink-6'
                        : 'border-line bg-card text-ink hover:border-line-2'
                    }`}
                  >
                    {isHidden ? (
                      <EyeOff size={14} className="shrink-0 text-ink-6" />
                    ) : (
                      <Eye size={14} className="shrink-0 text-ink-4" />
                    )}
                    <span className="text-[13px] font-medium flex-1 truncate">{tool.label}</span>
                    <span className="text-[10px] uppercase tracking-wide text-ink-6">
                      {isHidden ? 'Hidden' : 'Shown'}
                    </span>
                  </button>
                );
              })}
            </div>
          </Section>

          {/* Keys (global) */}
          <Section
            title="API keys"
            description="Shared across all projects. Never sent back to the browser once saved — these fields are write-only."
          >
            <Field
              label="post-bridge API key"
              hint={<>Handles scheduling, posting &amp; analytics. Get one at <PostBridgeLink>post-bridge.com</PostBridgeLink>.</>}
            >
              <input
                value={postbridge}
                onChange={(e) => setPostbridge(e.target.value)}
                placeholder={config.keys.postbridge ? '•••• already set — leave blank to keep' : 'pb_...'}
                className={`${inputClass} font-mono`}
              />
              <TestBadge ok={test?.postbridge} error={test?.errors?.postbridge} />
            </Field>
            <Field label="OpenRouter API key" hint="Runs the AI that writes your slideshows — one key, any model. Get one at openrouter.ai/keys.">
              <input
                value={openrouter}
                onChange={(e) => setOpenrouter(e.target.value)}
                placeholder={config.keys.openrouter ? '•••• already set — leave blank to keep' : 'sk-or-...'}
                className={`${inputClass} font-mono`}
              />
              <TestBadge ok={test?.openrouter} error={test?.errors?.openrouter} />
            </Field>
            <Field label="Apify API key (optional)" hint="Only needed to scrape MORE Pinterest images. The bundled aesthetic packs work without it. Get one at console.apify.com.">
              <input
                value={apify}
                onChange={(e) => setApify(e.target.value)}
                placeholder={config.keys.apify ? '•••• already set — leave blank to keep' : 'apify_api_...'}
                className={`${inputClass} font-mono`}
              />
              <TestBadge ok={test?.apify} error={test?.errors?.apify} />
            </Field>
            <Field label="Financial Modeling Prep API key (optional)" hint="Powers the Stocks analyzer — live prices, analyst targets, earnings & news. Free key at financialmodelingprep.com/developer.">
              <input
                value={fmp}
                onChange={(e) => setFmp(e.target.value)}
                placeholder={config.keys.fmp ? '•••• already set — leave blank to keep' : 'your FMP key'}
                className={`${inputClass} font-mono`}
              />
              <TestBadge ok={test?.fmp} error={test?.errors?.fmp} />
            </Field>
            <Field label="Pinterest Apify actor" hint="The Apify actor used for scraping. Change only if you prefer a different one.">
              <input
                value={pinterestActor}
                onChange={(e) => setPinterestActor(e.target.value)}
                placeholder="fatihtahta/pinterest-scraper-search"
                className={`${inputClass} font-mono`}
              />
            </Field>
            <Field label="Model" hint={`Pick any model OpenRouter offers${models.length ? ` (${models.length} available)` : ''}.`}>
              <input
                value={modelFilter}
                onChange={(e) => setModelFilter(e.target.value)}
                placeholder="Filter models… e.g. claude, gpt, llama"
                className={`${inputClass} mb-2`}
              />
              <select value={model} onChange={(e) => setModel(e.target.value)} className={inputClass}>
                {model && !filtered.some((m) => m.id === model) && <option value={model}>{model}</option>}
                {filtered.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
          </Section>

          {/* Posting defaults (per project) */}
          <Section
            title="Posting defaults"
            description="Which connected accounts this project posts to, and whether to schedule directly or save as a draft in post-bridge."
          >
            {accounts.length === 0 ? (
              <p className="text-[12px] text-ink-5">
                No connected accounts yet. Add your post-bridge key above, hit Test, then connect
                accounts at <PostBridgeLink>post-bridge.com</PostBridgeLink> — they'll appear here.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {accounts.map((a) => (
                  <label
                    key={a.id}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-line bg-card cursor-pointer hover:border-line-2"
                  >
                    <input type="checkbox" checked={selected.includes(a.id)} onChange={() => toggleAccount(a.id)} />
                    <span className="text-[13px] text-ink font-medium">{a.username}</span>
                    <span className="text-[11px] text-ink-5 uppercase tracking-wide">{a.platform}</span>
                  </label>
                ))}
              </div>
            )}

            <Field label="Default mode">
              <div className="flex gap-2">
                <Button variant={mode === 'draft' ? 'primary' : 'secondary'} onClick={() => setMode('draft')}>
                  Save as draft
                </Button>
                <Button variant={mode === 'schedule' ? 'primary' : 'secondary'} onClick={() => setMode('schedule')}>
                  Schedule directly
                </Button>
              </div>
            </Field>
            <DraftNote />
          </Section>

          {/* Background packs (per project) */}
          <Section
            title="Background packs"
            description="Which image packs new slideshows pull backgrounds from when you hit Generate. Select none to generate with plain gradients."
          >
            <PackPicker selected={imagePacks} onChange={setImagePacks} />
          </Section>

          <div className="flex items-center gap-3 pt-2">
            <Button
              variant="primary"
              size="lg"
              icon={saving ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />}
              onClick={save}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save settings'}
            </Button>
            <Button variant="secondary" size="lg" onClick={runTest} disabled={testing || saving}>
              {testing ? <Loader2 size={13} className="animate-spin" /> : null}
              Test connection
            </Button>
            {saved && !saveError && (
              <span className="text-[12px] text-emerald-600 flex items-center gap-1">
                <Check size={13} /> Saved
              </span>
            )}
            {saveError && (
              <span className="text-[12px] text-red-600 flex items-center gap-1">
                <X size={13} /> {saveError}
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export function DraftNote() {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-surface border border-line">
      <Info size={13} className="text-ink-5 mt-0.5 shrink-0" />
      <p className="text-[12px] text-ink-4 leading-snug">
        <span className="font-medium text-ink-3">Drafts vs. scheduling:</span> drafts land in your
        post-bridge inbox to post by hand. You won't get analytics back on drafts — TikTok only
        reports on content it publishes itself — but posting manually avoids automation detection,
        so reach potential is often higher. Scheduling posts automatically and does report analytics.
      </p>
    </div>
  );
}

function TestBadge({ ok, error }: { ok?: boolean; error?: string }) {
  if (ok === undefined) return null;
  return ok ? (
    <p className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1">
      <Check size={11} /> Connected
    </p>
  ) : (
    <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1">
      <X size={11} /> {error || 'Failed'}
    </p>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-[13px] font-semibold text-ink uppercase tracking-widest">{title}</h2>
        <p className="text-[12px] text-ink-5 mt-1">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] text-ink-5 mb-1 block">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-ink-6 mt-1">{hint}</p>}
    </div>
  );
}
