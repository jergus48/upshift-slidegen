import { useEffect, useState } from 'react';
import { Check, X, Sparkles, RefreshCw, Loader2, Pencil, Download, Film, Folder, Trash2 } from 'lucide-react';
import type { Slideshow } from '../types';
import { ViewHeader } from '../components/ViewHeader';
import { SlidePreview } from '../components/SlidePreview';
import { BulkBackgroundTool } from '../components/BulkBackgroundTool';
import { BatchQueuePanel } from '../components/BatchQueuePanel';
import type { GenBatch } from '../lib/localBatches';
import { Button } from '../components/Button';
import { IconButton } from '../components/IconButton';
import { MusicChoiceModal } from '../components/MusicChoiceModal';
import { downloadSlideshow, downloadSlideshowsZip, downloadSlideshowsVideo } from '../lib/render';
import type { MusicGender } from '../lib/music';
import {
  supportsFolderPresets,
  listFolderPresets,
  getDefaultFolderId,
  setDefaultFolderId,
  resolveWritableFolder,
  type FolderPreset,
} from '../lib/downloadFolders';

interface QueueViewProps {
  slideshows: Slideshow[];
  generating: boolean;
  canGenerate: boolean;
  selectedIds: string[];
  batches: GenBatch[];
  onSelectBatch: (id: string) => void;
  onRemoveBatch: (id: string) => void;
  onClearFinishedBatches: () => void;
  onGenerate: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onBulkReject: (ids: string[]) => void;
  onEdit: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBulkSchedule: () => void;
  onBulkSetBackground: (updates: { slideshowId: string; slideIndex: number; ref: string }[]) => void;
}

export function QueueView({
  slideshows,
  generating,
  canGenerate,
  selectedIds,
  batches,
  onSelectBatch,
  onRemoveBatch,
  onClearFinishedBatches,
  onGenerate,
  onApprove,
  onReject,
  onBulkReject,
  onEdit,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onBulkSchedule,
  onBulkSetBackground,
}: QueueViewProps) {
  const selectedCount = selectedIds.length;
  const [downloadingBulk, setDownloadingBulk] = useState(false);
  const [videoProgress, setVideoProgress] = useState<{ done: number; total: number } | null>(null);
  const [askMusic, setAskMusic] = useState(false);
  // Download destination (Chromium only). `destId` is the folder preset downloads
  // save into; null → the browser's Downloads folder. Loaded from the saved
  // default; changing it here also updates that default so it sticks.
  const [folderPresets, setFolderPresets] = useState<FolderPreset[]>([]);
  const [destId, setDestId] = useState<string | null>(getDefaultFolderId());

  useEffect(() => {
    if (supportsFolderPresets()) listFolderPresets().then(setFolderPresets).catch(() => undefined);
  }, []);

  const chooseDest = (id: string | null) => {
    setDestId(id);
    setDefaultFolderId(id);
  };

  const selectedShows = () => slideshows.filter((s) => selectedIds.includes(s.id));

  const removeSelected = () => {
    // Native Chrome confirm dialog before a destructive bulk removal.
    const ok = window.confirm(
      `Remove ${selectedCount} slideshow${selectedCount === 1 ? '' : 's'} from the queue? This can't be undone.`,
    );
    if (ok) onBulkReject(selectedIds);
  };

  const downloadSelected = async () => {
    setDownloadingBulk(true);
    try {
      // Resolve the folder inside this click (a user gesture) so the permission
      // prompt is allowed; null falls back to a normal browser download.
      const dir = await resolveWritableFolder(destId);
      await downloadSlideshowsZip(selectedShows(), dir);
    } finally {
      setDownloadingBulk(false);
    }
  };

  const downloadSelectedVideo = async (music: MusicGender | null, zoom: boolean, regrade: 0 | 1 | 2) => {
    setAskMusic(false);
    setVideoProgress({ done: 0, total: selectedCount });
    try {
      const dir = await resolveWritableFolder(destId);
      await downloadSlideshowsVideo(
        selectedShows(),
        (done, total) => setVideoProgress({ done, total }),
        music,
        dir,
        { zoom, regrade },
      );
    } finally {
      setVideoProgress(null);
    }
  };

  return (
    <>
      <ViewHeader
        title="Queue"
        subtitle={`${slideshows.length} slideshows waiting for your review. Approve to send to the scheduler.`}
        right={
          <>
            {folderPresets.length > 0 && (
              <FolderDestSelect presets={folderPresets} value={destId} onChange={chooseDest} />
            )}
            {selectedCount > 0 ? (
              <>
                <span className="text-[12px] text-ink-5">{selectedCount} selected</span>
                <BulkBackgroundTool
                  slideshows={slideshows.filter((s) => selectedIds.includes(s.id))}
                  onApply={onBulkSetBackground}
                />
                <Button
                  variant="secondary"
                  icon={downloadingBulk ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                  onClick={downloadSelected}
                  disabled={downloadingBulk || videoProgress !== null}
                >
                  {downloadingBulk ? 'Zipping…' : `Download ${selectedCount}`}
                </Button>
                <Button
                  variant="secondary"
                  icon={videoProgress ? <Loader2 size={13} className="animate-spin" /> : <Film size={13} />}
                  onClick={() => setAskMusic(true)}
                  disabled={videoProgress !== null || downloadingBulk}
                  title="Turn each slideshow into a video that slides through the slides at reading speed"
                >
                  {videoProgress
                    ? videoProgress.total > 1
                      ? `Rendering ${videoProgress.done}/${videoProgress.total}…`
                      : 'Rendering…'
                    : selectedCount > 1
                      ? `Video ${selectedCount}`
                      : 'Video'}
                </Button>
                <Button variant="primary" icon={<Check size={13} />} onClick={onBulkSchedule}>
                  Schedule {selectedCount}
                </Button>
                <Button
                  variant="secondary"
                  icon={<Trash2 size={13} />}
                  onClick={removeSelected}
                  disabled={downloadingBulk || videoProgress !== null}
                >
                  Remove {selectedCount}
                </Button>
                <Button variant="ghost" onClick={onClearSelection}>Clear</Button>
              </>
            ) : (
              slideshows.length > 0 && (
                <Button variant="secondary" onClick={onSelectAll}>Select all</Button>
              )
            )}
            <Button
              variant="primary"
              icon={generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              onClick={onGenerate}
              disabled={generating || !canGenerate}
            >
              {generating ? 'Generating…' : 'Generate more'}
            </Button>
          </>
        }
      />

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 flex flex-col min-w-0">
      {slideshows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-sm">
            <div className="w-12 h-12 rounded-full bg-raised flex items-center justify-center mx-auto mb-4">
              <Check size={20} className="text-ink-5" />
            </div>
            <h2 className="text-[15px] font-semibold text-ink">
              {canGenerate ? 'Queue empty' : 'Add your OpenRouter key to start'}
            </h2>
            <p className="text-[13px] text-ink-5 mt-1">
              {canGenerate
                ? 'Generate a fresh batch of slideshows with AI.'
                : 'Head to Settings, paste your OpenRouter API key, and tune the Brain.'}
            </p>
            {canGenerate && (
              <div className="mt-4 flex justify-center">
                <Button
                  variant="secondary"
                  icon={generating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                  onClick={onGenerate}
                  disabled={generating}
                >
                  {generating ? 'Generating…' : 'Generate now'}
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 sm:p-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-5xl mx-auto">
            {slideshows.map((s) => (
              <SlideshowCard
                key={s.id}
                slideshow={s}
                selected={selectedIds.includes(s.id)}
                destId={destId}
                onToggleSelect={() => onToggleSelect(s.id)}
                onApprove={() => onApprove(s.id)}
                onReject={() => onReject(s.id)}
                onEdit={() => onEdit(s.id)}
              />
            ))}
          </div>
        </div>
      )}
        </div>
        <BatchQueuePanel
          batches={batches}
          queue={slideshows}
          selectedIds={selectedIds}
          onSelectBatch={onSelectBatch}
          onRemoveBatch={onRemoveBatch}
          onClearFinished={onClearFinishedBatches}
        />
      </div>

      {askMusic && (
        <MusicChoiceModal
          count={selectedCount}
          onClose={() => setAskMusic(false)}
          onChoose={downloadSelectedVideo}
        />
      )}
    </>
  );
}

interface CardProps {
  slideshow: Slideshow;
  selected: boolean;
  destId: string | null;
  onToggleSelect: () => void;
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
}

function SlideshowCard({ slideshow, selected, destId, onToggleSelect, onApprove, onReject, onEdit }: CardProps) {
  const [downloading, setDownloading] = useState(false);
  const [renderingVideo, setRenderingVideo] = useState(false);
  const [askMusic, setAskMusic] = useState(false);

  const download = async () => {
    setDownloading(true);
    try {
      const dir = await resolveWritableFolder(destId);
      await downloadSlideshow(slideshow, dir);
    } finally {
      setDownloading(false);
    }
  };

  const downloadVideo = async (music: MusicGender | null, zoom: boolean, regrade: 0 | 1 | 2) => {
    setAskMusic(false);
    setRenderingVideo(true);
    try {
      const dir = await resolveWritableFolder(destId);
      await downloadSlideshowsVideo([slideshow], undefined, music, dir, { zoom, regrade });
    } finally {
      setRenderingVideo(false);
    }
  };

  return (
    <div className={`bg-card border rounded-xl overflow-hidden animate-fadeIn transition-colors ${selected ? 'border-ink ring-1 ring-ink' : 'border-line'}`}>
      {/* Slide strip */}
      <div className="relative p-4 bg-surface border-b border-line">
        <label className="absolute top-2 left-2 z-10 w-6 h-6 rounded-md bg-card/90 border border-line flex items-center justify-center cursor-pointer shadow-sm">
          <input type="checkbox" checked={selected} onChange={onToggleSelect} className="cursor-pointer" />
        </label>
        {slideshow.kind === 'characters' && (
          // The exporter paces and scores these decks differently (slower after
          // slides, music drop on the cut) — worth seeing at a glance in the queue.
          <span
            title={`Characters deck — ${slideshow.beforeSlides ?? 0} before slides, after slides hold 50% longer, music drop lands on the cut`}
            className="absolute top-2 right-2 z-10 rounded-md bg-card/90 border border-line px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-ink-4 shadow-sm"
          >
            Characters
          </span>
        )}
        <div className="grid grid-cols-6 gap-1.5">
          {slideshow.slides.map((slide) => (
            <SlidePreview key={slide.id} slide={slide} />
          ))}
        </div>
      </div>

      {/* Meta */}
      <div className="p-4">
        <div className="flex items-start gap-2 mb-2">
          <Sparkles size={12} className="text-ink-6 mt-1 shrink-0" />
          <span className="text-[11px] text-ink-5 leading-snug">
            {slideshow.rationale}
          </span>
        </div>

        <h3 className="text-[14px] font-semibold text-ink leading-snug mb-1.5">
          {slideshow.hook}
        </h3>
        <p className="text-[12px] text-ink-4 leading-snug line-clamp-2">
          {slideshow.caption}
        </p>

        <div className="flex flex-wrap gap-1 mt-2">
          {slideshow.hashtags.map((tag) => (
            <span key={tag} className="text-[10px] text-ink-5 px-1.5 py-0.5 rounded bg-raised">
              #{tag}
            </span>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-line">
          <Button variant="secondary" icon={<Pencil size={13} />} onClick={onEdit}>
            Edit
          </Button>
          <Button
            variant="primary"
            icon={<Check size={13} />}
            onClick={onApprove}
            fullWidth
          >
            Approve
          </Button>
          <IconButton
            variant="secondary"
            icon={downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            label="Download slides"
            onClick={download}
            disabled={downloading}
          />
          <IconButton
            variant="secondary"
            icon={renderingVideo ? <Loader2 size={13} className="animate-spin" /> : <Film size={13} />}
            label="Download as video"
            onClick={() => setAskMusic(true)}
            disabled={renderingVideo}
          />
          <IconButton
            variant="secondary"
            icon={<X size={13} />}
            label="Reject"
            onClick={onReject}
          />
        </div>
      </div>

      {askMusic && (
        <MusicChoiceModal
          count={1}
          onClose={() => setAskMusic(false)}
          onChoose={downloadVideo}
        />
      )}
    </div>
  );
}

// Where downloads are saved: a folder preset, or the browser's Downloads folder.
// Only shown when the browser supports folder presets and at least one exists.
// Manage the list of folders in Brain → Download folders.
function FolderDestSelect({
  presets,
  value,
  onChange,
}: {
  presets: FolderPreset[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  return (
    <label
      className="flex items-center gap-1.5 h-8 pl-2 pr-1 rounded-lg border border-line bg-card text-ink-4"
      title="Where downloads are saved. Manage folders in Brain."
    >
      <Folder size={13} className="shrink-0 text-ink-5" />
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="bg-transparent text-[12px] text-ink outline-none max-w-[140px] cursor-pointer"
      >
        <option value="">Downloads folder</option>
        {presets.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}
