import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Clapperboard, Download, RefreshCw, Sparkles } from 'lucide-react';
import { ViewHeader } from '../components/ViewHeader';
import { Button } from '../components/Button';
import { FormatStrip } from '../components/FormatStrip';
import { CharacterSetupChecklist } from '../components/CharacterSetupChecklist';
import { CharacterTransfer } from '../components/CharacterTransfer';
import { getMergedLibrary } from '../lib/mergedLibrary';
import { getCharacters, subscribeCharacters, type Character } from '../lib/characters';
import {
  FORMAT_LABEL,
  formatLabel,
  listCapcutFormats,
  folderFor,
  missingFor,
  poolsFor,
  ROLES,
  ROLE_COLOR,
  type CapcutFormat,
} from '../lib/capcutFormats';
import { dealPieces, renderCapcutVideo } from '../lib/capcutVideo';
import { HASHTAGS, TOPICS, pickScript, type ScriptTopic } from '../lib/capcutScripts';
import { beatVideoFileName, downloadBlob } from '../lib/beatVideo';
import {
  addFolderPreset,
  listFolderPresets,
  resolveWritableFolder,
  supportsFolderPresets,
  writeFileToDir,
  characterFolderIn,
  type FolderPreset,
} from '../lib/downloadFolders';
import { videoMetaJsonFrom } from '../lib/render';
import { addQueuedVideo } from '../lib/localVideos';
import { createZip, type ZipEntry } from '../lib/zip';
import type { LibraryImage } from '../types';

// A batch bigger than this is a mistake rather than an intent: every video is
// recorded in real time.
// 0 = keep going until a character runs out of new combinations (or Stop).
const COUNT_OPTIONS = [1, 3, 5, 10, 25, 50, 0];
// Videos rendered at the same time.
const PARALLEL_OPTIONS = [1, 2, 3, 4, 6];
// Dealing the same clips into the same format this many times in a row means
// the character's pools are used up.
const MAX_DUPLICATE_TRIES = 8;
// This many renders failing back to back means something is down (the dev
// server, the library), not that one cut is bad. Stop instead of failing
// every remaining combination.
const MAX_FAIL_STREAK = 5;
// Which cuts have already been made, per character, so a rerun (or a restart
// after a crash) carries on with new ones instead of repeating itself.
const HISTORY_KEY = 'slidesmith:videoHistory';
const loadHistory = (): Record<string, string[]> => {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}');
  } catch {
    return {};
  }
};
const saveHistory = (h: Record<string, string[]>) => {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
  } catch {
    /* full or blocked: the history just won't stick */
  }
};
const safeDir = (n: string) => n.replace(/[\/:*?"<>|]+/g, '-').trim().replace(/[. ]+$/, '') || 'character';

interface Job {
  id: string;
  label: string;
  stage?: string;
  progress?: number;
  error?: string;
  result?: Blob;
  resultUrl?: string;
  name?: string;
}

// The Video tab renders characters into the formats collected from CapCut
// (Brain → Video formats) — nothing else. Pick formats in the sidebar, pick
// characters, and each video is one format, filled with one character's clips.
export function VideoView({ onQueued }: { onQueued?: () => void }) {
  const [characters, setCharacters] = useState<Character[]>(() => getCharacters());
  const [library, setLibrary] = useState<LibraryImage[]>([]);
  const [formats, setFormats] = useState<CapcutFormat[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickedFormats, setPickedFormats] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [count, setCount] = useState(1);
  const [parallel, setParallel] = useState(3);
  const [topic, setTopic] = useState<ScriptTopic>('screen');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [rendering, setRendering] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [presets, setPresets] = useState<FolderPreset[]>([]);
  const [presetId, setPresetId] = useState('');
  const stopRef = useRef(false);
  const [historyCount, setHistoryCount] = useState(() => Object.values(loadHistory()).reduce((n, l) => n + l.length, 0));

  const load = useCallback(
    () =>
      Promise.all([getMergedLibrary(true), listCapcutFormats()])
        .then(([imgs, fs]) => {
          setLibrary(imgs);
          setFormats(fs);
          // Every format starts picked; untick the ones to leave out.
          setPickedFormats((p) => (p.length ? p : fs.map((f) => f.id)));
        })
        .catch(() => setError('Could not load the library or the formats.'))
        .finally(() => setLoading(false)),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (supportsFolderPresets()) listFolderPresets().then(setPresets).catch(() => undefined);
  }, []);
  useEffect(() => subscribeCharacters(() => setCharacters(getCharacters())), []);

  const bySong = useMemo(() => {
    const m = new Map<string, CapcutFormat[]>();
    for (const f of formats) m.set(f.song, [...(m.get(f.song) || []), f]);
    return [...m.entries()];
  }, [formats]);

  const chosen = formats.filter((f) => pickedFormats.includes(f.id));
  const pools = useMemo(() => new Map(characters.map((c) => [c.id, poolsFor(c, library, topic)])), [characters, library, topic]);

  // Per character, which of the chosen formats it can fill.
  const fits = (c: Character) => chosen.filter((f) => missingFor(f, pools.get(c.id) || {}).length === 0);
  const runnable = characters.filter((c) => selected.includes(c.id) && fits(c).length > 0);
  const plannedTotal = runnable.length * (count || 1);

  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const finished = jobs.filter((j) => j.result && j.name);

  const downloadAll = async () => {
    setZipping(true);
    try {
      const entries: ZipEntry[] = [];
      const seen = new Map<string, number>();
      for (const j of finished) {
        const n = seen.get(j.name!) ?? 0;
        seen.set(j.name!, n + 1);
        const name = n ? j.name!.replace(/(\.[^.]+)$/, `-${n + 1}$1`) : j.name!;
        entries.push({ name, data: new Uint8Array(await j.result!.arrayBuffer()) });
      }
      const url = URL.createObjectURL(createZip(entries));
      const a = document.createElement('a');
      a.href = url;
      a.download = `slidegen-videos-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } finally {
      setZipping(false);
    }
  };

  const run = async () => {
    setError(null);
    setDone(false);
    setRendering(true);
    stopRef.current = false;
    // Must be asked inside the click, before any long await.
    const dir = presetId ? await resolveWritableFolder(presetId) : null;
    if (presetId && !dir) {
      setError('No write access to that folder. Pick it again.');
      setRendering(false);
      return;
    }
    let n = 0;
    let queued = 0;
    let failStreak = 0;
    let lastFail = '';
    const patch = (id: string, p: Partial<Job>) => setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...p } : j)));
    // One state per character; workers take turns claiming the next video so
    // several render at once (the time is mostly seeking and encoding, not CPU).
    const history = loadHistory();
    const states = runnable.map((character) => ({
      character,
      usable: fits(character),
      deck: [] as CapcutFormat[],
      lastScript: undefined as string | undefined,
      seen: new Set<string>(history[character.id] || []),
      stuck: 0,
      issued: 0,
      exhausted: false,
    }));
    let rr = 0;
    const claim = () => {
      for (let k = 0; k < states.length; k++) {
        const st = states[rr++ % states.length];
        if (!st.exhausted && (count === 0 || st.issued < count)) {
          st.issued++;
          return st;
        }
      }
      return null;
    };
    const remember = (id: string, sig: string) => {
      const h = loadHistory();
      h[id] = [...(h[id] || []), sig];
      saveHistory(h);
    };
    const makeOne = async (st: (typeof states)[number]) => {
      const { character, usable, seen } = st;
      const pool = pools.get(character.id) || {};
      let format: CapcutFormat;
      let sigOf = '';
      let plans: Awaited<ReturnType<typeof dealPieces>>;
      for (;;) {
        // A random format each video, drawn from a shuffled deck so none
        // comes round again before every picked one has been used.
        if (!st.deck.length) st.deck = [...usable].sort(() => Math.random() - 0.5);
        format = st.deck.pop()!;
        plans = await dealPieces(format, pool);
        // format + which clips went where, so no two videos are the same cut.
        const sig = `${format.id}|${plans.map((p) => `${p.item?.id ?? '-'}@${Math.round(p.offset * 10)}`).join(',')}`;
        if (!seen.has(sig)) {
          st.stuck = 0;
          seen.add(sig);
          sigOf = sig;
          break;
        }
        if (++st.stuck >= MAX_DUPLICATE_TRIES * usable.length) {
          st.exhausted = true;
          return;
        }
      }
      const jobId = `job-${Date.now()}-${n++}`;
      const label = `${character.name} · ${formatLabel(format)}`;
      // Videos saved to the folder keep nothing but a line; only the last few
      // stay listed, so a long Max run doesn't grow (and re-render) forever.
      setJobs((js) => {
        const saved = js.filter((j) => j.stage === 'Saved to folder');
        const drop = new Set(saved.slice(0, Math.max(0, saved.length - 8)).map((j) => j.id));
        return [...js.filter((j) => !drop.has(j.id)), { id: jobId, label, stage: 'Starting…' }];
      });
      const script = pickScript(topic, st.lastScript);
      st.lastScript = script.id;
      try {
        const blob = await renderCapcutVideo(format, pool, {
          script,
          plans,
          onStage: (stage) => patch(jobId, { stage }),
          onProgress: (progress) => patch(jobId, { progress }),
        });
        const title = `${character.name} - ${format.id}`;
        const name = beatVideoFileName(title, blob).replace(/(\.[^.]+)$/, `-${Date.now().toString(36)}$1`);
        if (dir) {
          // Straight into the folder (e.g. Google Drive for desktop), one
          // subfolder per character; nothing kept in memory.
          try {
            const sub = `${await characterFolderIn(dir, safeDir(character.name))}/`;
            await writeFileToDir(dir, `${sub}${name}`, blob);
            await writeFileToDir(
              dir,
              `${sub}${name.replace(/\.[^.]+$/, '')}.json`,
              new TextEncoder().encode(videoMetaJsonFrom(script.ch[0] ?? script.all ?? '', script.caption, HASHTAGS[topic].map((t) => t.replace(/^#/, '')))),
            );
            patch(jobId, { name, stage: 'Saved to folder', progress: undefined });
            queued++;
            failStreak = 0;
            remember(character.id, sigOf);
          } catch (e) {
            lastFail = `Could not write to the folder: ${e instanceof Error ? e.message : String(e)}`;
            failStreak++;
            patch(jobId, { stage: undefined, error: lastFail });
          }
          return;
        }
        patch(jobId, { result: blob, resultUrl: URL.createObjectURL(blob), name, stage: undefined });
        try {
          await addQueuedVideo(
            {
              name,
              title,
              characterId: character.id,
              characterName: character.name,
              trackName: format.audio.name,
              style: format.id,
              duration: format.duration,
              folderId: character.folderId || '',
              hook: script.ch[0],
              caption: script.caption,
              hashtags: HASHTAGS[topic],
            },
            blob,
          );
          queued++;
          failStreak = 0;
          remember(character.id, sigOf);
        } catch (e) {
          patch(jobId, {
            error: `Rendered, but couldn't be added to the Queue — ${e instanceof Error ? e.message : String(e)}. Save it here instead.`,
          });
        }
      } catch (e) {
        lastFail = e instanceof Error ? e.message : String(e);
        failStreak++;
        patch(jobId, { stage: undefined, error: lastFail });
      }
    };
    const worker = async () => {
      while (!stopRef.current && failStreak < MAX_FAIL_STREAK) {
        const st = claim();
        if (!st) break;
        await makeOne(st);
      }
    };
    try {
      await Promise.all(Array.from({ length: parallel }, worker));
      setHistoryCount(Object.values(loadHistory()).reduce((n, l) => n + l.length, 0));
      if (failStreak >= MAX_FAIL_STREAK) {
        setError(`Stopped after ${MAX_FAIL_STREAK} failed renders in a row (${lastFail}). Check the dev server is running and run again: finished cuts are remembered and skipped.`);
      } else {
        setDone(true);
      }
      if (queued && !dir) onQueued?.();
    } finally {
      setRendering(false);
    }
  };

  return (
    <>
      <ViewHeader
        title="Video"
        subtitle="Characters rendered into the formats you cut in CapCut. Every cut, speed, filter and effect is the one in the CapCut project — only the clips change."
        right={
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw size={12} className={loading ? 'animate-spin' : ''} />}
            onClick={() => {
              setLoading(true);
              void load();
            }}
            disabled={loading || rendering}
          >
            Reload
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col lg:flex-row min-h-full">
          {/* Sidebar: the formats, and how to set a character up for them */}
          <aside className="lg:w-80 shrink-0 border-b lg:border-b-0 lg:border-r border-line p-4 space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold">Formats</h2>
                {formats.length > 0 && (
                  <button
                    className="text-[11px] text-ink-5 hover:text-ink"
                    onClick={() =>
                      setPickedFormats(pickedFormats.length === formats.length ? [] : formats.map((f) => f.id))
                    }
                  >
                    {pickedFormats.length === formats.length ? 'None' : 'All'}
                  </button>
                )}
              </div>
              {formats.length === 0 && !loading && (
                <p className="text-[12px] text-ink-5">
                  No formats yet — import them in Brain → Video formats.
                </p>
              )}
              {bySong.map(([song, list]) => (
                <div key={song} className="space-y-1.5">
                  <div className="text-[12px] font-semibold text-ink">{song}</div>
                  {list.map((f) => (
                    <label key={f.id} className="block cursor-pointer select-none space-y-1">
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={pickedFormats.includes(f.id)}
                          onChange={() => toggle(pickedFormats, setPickedFormats, f.id)}
                          disabled={rendering}
                          className="w-3.5 h-3.5 accent-ink"
                        />
                        <span className="text-[12px] text-ink-2">{FORMAT_LABEL[f.format] ?? f.format}</span>
                        <span className="text-[10px] text-ink-6 tabular-nums ml-auto">{f.duration.toFixed(1)}s</span>
                      </span>
                      <FormatStrip format={f} height={8} />
                    </label>
                  ))}
                </div>
              ))}
            </div>

          </aside>

          {/* Main: characters, batch, renders */}
          <div className="flex-1 p-4 sm:p-8 space-y-6 max-w-4xl">
            <div className="bg-card border border-line rounded-xl p-4">
              <CharacterSetupChecklist characters={characters} library={library} formats={formats} />
            </div>

            <div className="bg-card border border-line rounded-xl p-4">
              <CharacterTransfer characters={characters} library={library} onImported={() => void load()} />
            </div>

            <div className="space-y-3">
              <h2 className="text-[13px] font-semibold text-ink">Characters</h2>
              {characters.length === 0 && (
                <p className="text-[12px] text-ink-5">Add a character in the Characters tab first.</p>
              )}
              {characters.map((c) => {
                const p = pools.get(c.id) || {};
                const ok = fits(c);
                const missing = [...new Set(chosen.flatMap((f) => missingFor(f, p)))].map((r) => folderFor(r, topic));
                return (
                  <label
                    key={c.id}
                    className="flex flex-wrap items-center gap-3 bg-card border border-line rounded-xl px-4 py-3 cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(c.id)}
                      onChange={() => toggle(selected, setSelected, c.id)}
                      disabled={rendering}
                      className="w-4 h-4 accent-ink"
                    />
                    <span className="text-[13px] font-medium text-ink">{c.name}</span>
                    <span className="flex gap-1">
                      {ROLES.map((r) => (
                        <span
                          key={r}
                          title={`${folderFor(r, topic)}: ${p[r]?.length || 0}`}
                          className={`text-[10px] tabular-nums px-1.5 rounded text-white ${p[r]?.length ? '' : 'opacity-25'}`}
                          style={{ background: ROLE_COLOR[r] }}
                        >
                          {p[r]?.length || 0}
                        </span>
                      ))}
                    </span>
                    <span className={`text-[11px] ml-auto ${chosen.length && !ok.length ? 'text-amber-600' : 'text-ink-6'}`}>
                      {!chosen.length
                        ? 'pick formats'
                        : ok.length === chosen.length
                          ? 'ready'
                          : ok.length
                            ? `${ok.length}/${chosen.length} formats · missing ${missing.join(', ')}`
                            : `missing ${missing.join(', ')}`}
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="bg-card border border-line rounded-xl p-4 space-y-4">
              <div>
                <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 block">
                  Text
                </label>
                <div className="flex items-center gap-2">
                  {TOPICS.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setTopic(t.key)}
                      disabled={rendering}
                      className={`px-3 h-9 rounded-lg border text-[13px] font-medium disabled:opacity-50 ${
                        topic === t.key ? 'border-ink bg-ink text-bg' : 'border-line bg-card text-ink-5 hover:border-line-2'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                  <span className="text-[11px] text-ink-6">a random script of this topic per video</span>
                </div>
              </div>
              <div>
                <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 block">
                  Videos per character
                </label>
                <div className="flex items-center gap-2">
                  {COUNT_OPTIONS.map((k) => (
                    <button
                      key={k}
                      onClick={() => setCount(k)}
                      disabled={rendering}
                      className={`w-12 h-9 rounded-lg border text-[13px] font-medium disabled:opacity-50 ${
                        count === k ? 'border-ink bg-ink text-bg' : 'border-line bg-card text-ink-5 hover:border-line-2'
                      }`}
                    >
                      {k === 0 ? 'Max' : k}
                    </button>
                  ))}
                  <span className="text-[11px] text-ink-6">
                    {count === 0 ? 'until no new combination is left, or Stop' : 'a random picked format per video'}
                  </span>
                </div>
              </div>
              <div>
                <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 block">
                  At the same time
                </label>
                <div className="flex items-center gap-2">
                  {PARALLEL_OPTIONS.map((k) => (
                    <button
                      key={k}
                      onClick={() => setParallel(k)}
                      disabled={rendering}
                      className={`w-12 h-9 rounded-lg border text-[13px] font-medium disabled:opacity-50 ${
                        parallel === k ? 'border-ink bg-ink text-bg' : 'border-line bg-card text-ink-5 hover:border-line-2'
                      }`}
                    >
                      {k}
                    </button>
                  ))}
                  <span className="text-[11px] text-ink-6">more is faster until the PC runs out of memory</span>
                </div>
              </div>
              {supportsFolderPresets() && (
                <div>
                  <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 block">
                    Save to folder
                  </label>
                  <div className="flex items-center gap-2">
                    <select
                      value={presetId}
                      onChange={(e) => setPresetId(e.target.value)}
                      disabled={rendering}
                      className="h-9 rounded-lg border border-line bg-card px-2 text-[13px]"
                    >
                      <option value="">Queue (no folder)</option>
                      {presets.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={rendering}
                      onClick={async () => {
                        const p = await addFolderPreset();
                        if (p) {
                          setPresets(await listFolderPresets());
                          setPresetId(p.id);
                        }
                      }}
                    >
                      Pick folder…
                    </Button>
                    <span className="text-[11px] text-ink-6">a subfolder per character; point it at your Google Drive folder</span>
                  </div>
                </div>
              )}
              {error && <p className="text-[12px] text-red-600">{error}</p>}
              {done && (
                <p className="text-[12px] text-emerald-600 flex items-center gap-1">
                  <Check size={13} /> Finished — they're in the Queue too.
                </p>
              )}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-ink-6">
                  Keep this tab in front while it renders. {historyCount} cuts remembered, none will be repeated.{' '}
                  {historyCount > 0 && !rendering && (
                    <button
                      className="underline hover:text-ink"
                      onClick={() => {
                        saveHistory({});
                        setHistoryCount(0);
                      }}
                    >
                      Forget them
                    </button>
                  )}
                </span>
                <Button
                  variant="primary"
                  icon={<Sparkles size={13} />}
                  onClick={run}
                  disabled={rendering || plannedTotal === 0}
                >
                  {rendering ? 'Rendering…' : count === 0 ? 'Make as many as possible' : `Make ${plannedTotal} video${plannedTotal === 1 ? '' : 's'}`}
                </Button>
                {rendering && (
                  <Button variant="secondary" onClick={() => (stopRef.current = true)}>
                    Stop
                  </Button>
                )}
              </div>
            </div>

            {jobs.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-[13px] font-semibold text-ink flex-1">Renders</h2>
                  {finished.length > 0 && (
                    <Button size="sm" variant="secondary" icon={<Download size={12} />} onClick={downloadAll} disabled={zipping}>
                      {zipping ? 'Zipping…' : `Download ${finished.length} as zip`}
                    </Button>
                  )}
                </div>
                {jobs.map((j) => (
                  <div key={j.id} className="bg-card border border-line rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <Clapperboard size={14} className="text-ink-5 shrink-0" />
                      <span className="text-[13px] text-ink truncate flex-1">{j.label}</span>
                      {j.stage && <span className="text-[11px] text-ink-6 shrink-0">{j.stage}</span>}
                      {j.result && (
                        <Button size="sm" variant="secondary" icon={<Download size={12} />} onClick={() => downloadBlob(j.result!, j.name!)}>
                          Save
                        </Button>
                      )}
                    </div>
                    {j.error && <p className="text-[12px] text-red-600">{j.error}</p>}
                    {j.progress !== undefined && !j.result && (
                      <div className="h-1.5 bg-raised rounded-full overflow-hidden">
                        <div className="h-full bg-ink transition-[width]" style={{ width: `${j.progress * 100}%` }} />
                      </div>
                    )}
                    {j.resultUrl && <video src={j.resultUrl} controls className="w-full max-w-[220px] rounded-lg bg-black" />}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

