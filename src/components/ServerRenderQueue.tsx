import { useEffect, useState, useCallback } from 'react';
import { Server, X } from 'lucide-react';
import { IconButton } from './IconButton';
import {
  listRenderJobs,
  cancelRenderJob,
  deleteRenderJob,
  type RenderJob,
} from '../lib/serverRender';

// Live view of the local server's background render queue, shown under any view
// that can submit to it. The jobs belong to the server, not to this tab, so this
// is also how you check on a batch you left running and came back to.
export function ServerRenderQueue({ enabled }: { enabled: boolean }) {
  const [jobs, setJobs] = useState<RenderJob[]>([]);

  const refresh = useCallback(
    () => listRenderJobs().then(setJobs).catch(() => undefined),
    [],
  );

  useEffect(() => {
    if (!enabled) return;
    let live = true;
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

  if (!enabled || jobs.length === 0) return null;

  return (
    <div className="border-t border-line bg-surface px-4 sm:px-8 py-3">
      <div className="max-w-5xl mx-auto space-y-1.5">
        <div className="flex items-center gap-2">
          <Server size={13} className="text-ink-5" />
          <span className="text-[12px] font-semibold text-ink">Server render queue</span>
          <span className="text-[11px] text-ink-6">keeps going with this tab closed</span>
        </div>
        {jobs.slice(0, 6).map((j) => (
          <div
            key={j.id}
            className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-line bg-card"
          >
            <span className="text-[12px] text-ink font-medium truncate flex-1">{j.name}</span>
            <span
              className={`text-[11px] tabular-nums ${
                j.status === 'error' ? 'text-red-600' : 'text-ink-5'
              }`}
              title={j.error || j.outDir}
            >
              {j.status === 'error'
                ? j.error || 'failed'
                : j.status === 'running'
                  ? `rendering ${j.done}/${j.total}`
                  : j.status === 'done'
                    ? `done · ${j.done} file${j.done === 1 ? '' : 's'}`
                    : j.status}
            </span>
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
                label="Clear"
                onClick={() => deleteRenderJob(j.id).then(refresh)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
