import { Layers, Loader2, CheckCircle2, AlertCircle, Circle, X, Trash2, MousePointerClick } from 'lucide-react';
import type { GenBatch } from '../lib/localBatches';
import type { Slideshow } from '../types';
import { parseToken } from '../lib/subfolders';

interface BatchQueuePanelProps {
  batches: GenBatch[];
  queue: Slideshow[];
  selectedIds: string[];
  onSelectBatch: (id: string) => void;
  onRemoveBatch: (id: string) => void;
  onClearFinished: () => void;
}

// Readable "pack / subfolder" list for a batch's selection tokens.
function packLabel(packs: string[]): string {
  if (!packs.length) return 'No pack — gradients only';
  return packs
    .map((t) => {
      const { pack, subfolder } = parseToken(t);
      return subfolder ? `${pack} / ${subfolder}` : pack;
    })
    .join(', ');
}

// Right-hand log of generation batches. Running/queued batches show live
// progress; a finished batch is clickable to select all of its slideshows in the
// queue (ready to download or schedule). Only mounts when there's at least one
// batch to show.
export function BatchQueuePanel({
  batches,
  queue,
  selectedIds,
  onSelectBatch,
  onRemoveBatch,
  onClearFinished,
}: BatchQueuePanelProps) {
  if (batches.length === 0) return null;

  // How many of a batch's slideshows are still in the queue (some may have been
  // removed/approved) — that's what a click would actually select.
  const liveCount = (b: GenBatch) => b.producedIds.filter((id) => queue.some((s) => s.id === id)).length;
  const selectedSet = new Set(selectedIds);
  // A batch is "the current selection" when every one of its live shows is selected.
  const isBatchSelected = (b: GenBatch) => {
    const ids = b.producedIds.filter((id) => queue.some((s) => s.id === id));
    return ids.length > 0 && ids.every((id) => selectedSet.has(id));
  };
  const anyFinished = batches.some((b) => b.status === 'done' || b.status === 'error');

  return (
    <aside className="hidden lg:flex w-72 shrink-0 border-l border-line bg-surface flex-col">
      <div className="flex items-center justify-between px-4 h-12 border-b border-line shrink-0">
        <span className="text-[12px] font-semibold text-ink flex items-center gap-1.5">
          <Layers size={14} /> Batch queue
        </span>
        {anyFinished && (
          <button
            onClick={onClearFinished}
            className="text-[11px] text-ink-5 hover:text-ink flex items-center gap-1"
            title="Remove finished batches from this log (keeps their slideshows)"
          >
            <Trash2 size={11} /> Clear done
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {batches.map((b) => {
          const live = liveCount(b);
          const selectable = (b.status === 'done' || b.status === 'error') && live > 0;
          const selected = isBatchSelected(b);
          return (
            <div
              key={b.id}
              className={`group rounded-lg border transition-colors ${
                selected ? 'border-ink ring-1 ring-ink bg-card' : 'border-line bg-card'
              } ${selectable ? 'cursor-pointer hover:border-line-2' : ''}`}
              onClick={selectable ? () => onSelectBatch(b.id) : undefined}
              title={selectable ? 'Click to select all this batch’s slideshows' : undefined}
            >
              <div className="flex items-start gap-2 p-2.5">
                <StatusIcon status={b.status} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12px] font-medium text-ink truncate">{b.label}</span>
                  </div>
                  {/* The exact background packs this batch was enqueued with —
                      each batch draws only from these, so a mixed-looking run is
                      a mixed selection, and it's visible here per batch. */}
                  <div className="text-[10px] text-ink-6 truncate" title={packLabel(b.packs)}>
                    {packLabel(b.packs)}
                  </div>
                  <div className="text-[11px] text-ink-6 mt-0.5">
                    {b.status === 'running' && `Generating ${b.done}/${b.total}…`}
                    {b.status === 'queued' && 'Waiting to start'}
                    {b.status === 'done' && (live > 0 ? `${live} slideshow${live === 1 ? '' : 's'} ready` : 'All removed')}
                    {b.status === 'error' && (b.error ? `Failed: ${b.error}` : 'Failed')}
                  </div>
                  {b.status === 'error' && live > 0 && (
                    <div className="text-[11px] text-ink-6">{live} partial slideshow{live === 1 ? '' : 's'}</div>
                  )}
                  {b.status === 'running' && (
                    <div className="mt-1.5 h-1 rounded-full bg-raised overflow-hidden">
                      <div
                        className="h-full bg-ink transition-all"
                        style={{ width: `${b.total ? Math.round((b.done / b.total) * 100) : 0}%` }}
                      />
                    </div>
                  )}
                  {selectable && (
                    <div className="text-[10px] text-ink-5 mt-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <MousePointerClick size={10} /> {selected ? 'Selected' : 'Click to select'}
                    </div>
                  )}
                </div>
                {b.status !== 'running' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveBatch(b.id);
                    }}
                    className="text-ink-6 hover:text-ink shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove from log"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function StatusIcon({ status }: { status: GenBatch['status'] }) {
  if (status === 'running') return <Loader2 size={14} className="animate-spin text-ink-4 shrink-0 mt-0.5" />;
  if (status === 'done') return <CheckCircle2 size={14} className="text-emerald-500 shrink-0 mt-0.5" />;
  if (status === 'error') return <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />;
  return <Circle size={14} className="text-ink-6 shrink-0 mt-0.5" />;
}
