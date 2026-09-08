import { useEffect, useState, useCallback, useRef } from 'react';
import { Server, X } from 'lucide-react';
import { IconButton } from './IconButton';
import {
  listRenderJobs,
  listRenderJobFiles,
  fetchRenderJobFile,
  cancelRenderJob,
  deleteRenderJob,
  type RenderJob,
} from '../lib/serverRender';
import {
  listFolderPresets,
  resolveGrantedFolder,
  resolveWritableFolder,
  pickFolderOnce,
  writeFileToDir,
} from '../lib/downloadFolders';

// Live view of the local server's background render queue, shown under any view
// that can submit to it. The jobs belong to the server, not to this tab, so this
// is also how you check on a batch you left running and came back to.
//
// It also finishes the delivery. A job can name a browser folder preset instead
// of a server path (job.folderId) — the videos then land in the job's own folder
// under ~/.slidesmith, because Node has no path for a File System Access handle
// and cannot write there itself. Collecting them is the one part only a tab can
// do, so as soon as this component sees such a job done it pulls the files back
// over /files and writes them into that folder. The copy is remembered per job
// id, so reopening the app doesn't redo hundreds of megabytes of work.

const SAVED_KEY = 'slidesmith:renderJobsSaved';

function readSaved(): Record<string, string> {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVED_KEY) || '{}');
    return raw && typeof raw === 'object' ? (raw as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeSaved(map: Record<string, string>): void {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(map));
  } catch {
    /* storage full or blocked — the copy itself still happened */
  }
}

interface Copy {
  done: number;
  total: number;
  error?: string;
}

export function ServerRenderQueue({ enabled }: { enabled: boolean }) {
  const [jobs, setJobs] = useState<RenderJob[]>([]);
  const [folderNames, setFolderNames] = useState<Record<string, string>>({});
  // job id → the folder it was copied into. Persisted: a done job stays listed.
  const [saved, setSaved] = useState<Record<string, string>>(readSaved);
  const [copying, setCopying] = useState<Record<string, Copy>>({});
  // Copies in flight, so a poll tick can't start the same one twice.
  const busy = useRef(new Set<string>());

  const refresh = useCallback(() => listRenderJobs().then(setJobs).catch(() => undefined), []);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    listFolderPresets()
      .then((ps) => live && setFolderNames(Object.fromEntries(ps.map((p) => [p.id, p.name]))))
      .catch(() => undefined);
    const tick = () =>
      listRenderJobs()
        .then((js) => live && setJobs(js))
        .catch(() => undefined);
    tick();
    const t = setInterval(tick, 2500);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [enabled]);

  // Pull one job's videos off the server and into its browser folder.
  // `prompting` is true when a click is driving this, which is the only moment
  // the browser will re-ask for a folder permission it has forgotten.
  const collect = useCallback(
    async (job: RenderJob, prompting: boolean, into?: FileSystemDirectoryHandle) => {
      if (busy.current.has(job.id)) return;
      busy.current.add(job.id);
      try {
        const dir =
          into ??
          (prompting
            ? await resolveWritableFolder(job.folderId)
            : await resolveGrantedFolder(job.folderId));
        // No permission yet (or the preset is gone): leave it to the button.
        if (!dir) return;
        const files = await listRenderJobFiles(job.id);
        if (!files.length) return;
        setCopying((c) => ({ ...c, [job.id]: { done: 0, total: files.length } }));
        let done = 0;
        for (const f of files) {
          const blob = await fetchRenderJobFile(job.id, f.name);
          await writeFileToDir(dir, f.name, blob);
          setCopying((c) => ({ ...c, [job.id]: { done: ++done, total: files.length } }));
        }
        setSaved((s) => {
          const next = { ...s, [job.id]: into ? into.name : folderNames[job.folderId] || 'the folder' };
          writeSaved(next);
          return next;
        });
        setCopying((c) => {
          const next = { ...c };
          delete next[job.id];
          return next;
        });
      } catch (e) {
        setCopying((c) => ({
          ...c,
          [job.id]: {
            done: c[job.id]?.done ?? 0,
            total: c[job.id]?.total ?? 0,
            error: e instanceof Error ? e.message : String(e),
          },
        }));
      } finally {
        busy.current.delete(job.id);
      }
    },
    [folderNames],
  );

  // Anything finished, bound for a browser folder, not yet delivered.
  useEffect(() => {
    for (const j of jobs) {
      if (j.status !== 'done' || !j.folderId) continue;
      if (saved[j.id] || copying[j.id]) continue;
      void collect(j, false);
    }
  }, [jobs, saved, copying, collect]);

  const clear = (id: string) =>
    deleteRenderJob(id).then(() => {
      setSaved((s) => {
        const next = { ...s };
        delete next[id];
        writeSaved(next);
        return next;
      });
      return refresh();
    });

  if (!enabled || jobs.length === 0) return null;

  const statusOf = (j: RenderJob): { text: string; bad?: boolean } => {
    if (j.status === 'error') return { text: j.error || 'failed', bad: true };
    if (j.status === 'running') return { text: `rendering ${j.done}/${j.total}` };
    if (j.status !== 'done') return { text: j.status };
    const copy = copying[j.id];
    const folder = folderNames[j.folderId] || 'folder';
    if (copy?.error) return { text: `still on the server — ${copy.error}`, bad: true };
    if (copy) return { text: `saving ${copy.done}/${copy.total} to ${folder}` };
    if (saved[j.id]) return { text: `done · ${j.done} file${j.done === 1 ? '' : 's'} in ${saved[j.id]}` };
    if (j.folderId) return { text: `rendered ${j.done} · not saved yet` };
    // No folder of any kind was set, so the videos are sitting in the job's own
    // folder under ~/.slidesmith where nobody will think to look.
    if (!j.outDir) return { text: `rendered ${j.done} · still on the server` };
    return { text: `done · ${j.done} file${j.done === 1 ? '' : 's'}` };
  };

  return (
    <div className="border-t border-line bg-surface px-4 sm:px-8 py-3">
      <div className="max-w-5xl mx-auto space-y-1.5">
        <div className="flex items-center gap-2">
          <Server size={13} className="text-ink-5" />
          <span className="text-[12px] font-semibold text-ink">Server render queue</span>
          <span className="text-[11px] text-ink-6">keeps going with this tab closed</span>
        </div>
        {jobs.slice(0, 6).map((j) => {
          const status = statusOf(j);
          // A finished job whose files are still on the server: the folder
          // permission has lapsed, and only a click can win it back.
          const undelivered = j.status === 'done' && !saved[j.id] && !copying[j.id]?.total;
          const needsClick = undelivered && !!j.folderId;
          // Rendered before any folder was chosen: offer to move it out now,
          // rather than leaving it stranded under ~/.slidesmith.
          const needsRescue = undelivered && !j.folderId && !j.outDir;
          return (
            <div
              key={j.id}
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-line bg-card"
            >
              <span className="text-[12px] text-ink font-medium truncate flex-1">{j.name}</span>
              <span
                className={`text-[11px] tabular-nums ${status.bad ? 'text-red-600' : 'text-ink-5'}`}
                title={j.error || j.outDir}
              >
                {status.text}
              </span>
              {needsClick && (
                <button
                  onClick={() => collect(j, true)}
                  className="text-[11px] font-medium text-ink hover:underline px-1.5"
                  title={`Copy the videos into ${folderNames[j.folderId] || 'the folder'}`}
                >
                  Save to {folderNames[j.folderId] || 'folder'}
                </button>
              )}
              {needsRescue && (
                <button
                  onClick={async () => {
                    const dir = await pickFolderOnce();
                    if (dir) await collect(j, true, dir);
                  }}
                  className="text-[11px] font-medium text-ink hover:underline px-1.5"
                  title="Copy these videos out of the server's own folder"
                >
                  Save to…
                </button>
              )}
              {j.status === 'running' || j.status === 'queued' ? (
                <button
                  onClick={() => cancelRenderJob(j.id).then(refresh)}
                  className="text-[11px] text-ink-6 hover:text-ink px-1.5"
                  title="Stop after the video it's on"
                >
                  Stop
                </button>
              ) : (
                <IconButton
                  variant="ghost"
                  size="sm"
                  icon={<X size={12} />}
                  // Clearing deletes the job folder, which for a job that hasn't
                  // been collected is where the only copy of the videos lives.
                  label={
                    needsClick || needsRescue
                      ? 'Save the videos first — clearing deletes them'
                      : 'Clear'
                  }
                  onClick={() => clear(j.id)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
