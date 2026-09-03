import { Film, Music, Square, User, UserRound, VolumeX, ZoomIn } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getRegradeStatus } from '../lib/api';
import type { MusicGender } from '../lib/music';
import { Button } from './Button';

interface MusicChoiceModalProps {
  count: number;
  onClose: () => void;
  // null → export with no music. A gender → pick a random track from that pool
  // for each video.
  onChoose: (music: MusicGender | null, zoom: boolean, regrade: 0 | 1 | 2) => void;
}

// How hard to post-process the finished video (see server/regrade.js). Off is
// the default — unlike the zoom, this one genuinely costs image quality.
const REGRADE_CHOICES: { value: 0 | 1 | 2; label: string }[] = [
  { value: 0, label: 'Off' },
  { value: 1, label: 'Subtle' },
  { value: 2, label: 'Heavy' },
];

// Whether each slide slowly pans and zooms, or is held perfectly still. Purely
// a look — the zoom only crops into the already-baked frame, so neither option
// costs any image quality.
const ZOOM_CHOICES: { value: boolean; label: string; hint: string; icon: typeof ZoomIn }[] = [
  {
    value: true,
    label: 'Zoom',
    hint: 'Slow pan and zoom on every slide',
    icon: ZoomIn,
  },
  {
    value: false,
    label: 'No zoom',
    hint: 'Every slide held perfectly still',
    icon: Square,
  },
];

// Small popup shown right before a video export: pick which soundtrack pool to
// draw from (a random track is chosen per video) or opt out of music entirely.
export function MusicChoiceModal({ count, onClose, onChoose }: MusicChoiceModalProps) {
  const [zoom, setZoom] = useState(true);
  // Heavy ffmpeg post-process. Off by default: it visibly costs quality and
  // roughly quadruples export time, so it has to be asked for.
  const [regrade, setRegrade] = useState<0 | 1 | 2>(0);
  // Only offer it when the server can actually reach ffmpeg.
  const [ffmpegOk, setFfmpegOk] = useState(false);
  useEffect(() => {
    let live = true;
    getRegradeStatus()
      .then((r) => live && setFfmpegOk(!!r?.ok))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card border border-line rounded-2xl w-full max-w-sm flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-5 py-4 border-b border-line">
          <Music size={15} className="text-ink-4" />
          <h2 className="text-[15px] font-semibold text-ink">Add music?</h2>
        </div>

        <div className="px-5 py-4">
          <p className="text-[12px] text-ink-5 leading-snug mb-4">
            Pick a soundtrack vibe for {count === 1 ? 'this video' : `these ${count} videos`}. A
            viral motivational track is chosen at random from the pool for each video.
          </p>

          <div className="grid grid-cols-2 gap-2 mb-4">
            {ZOOM_CHOICES.map(({ value, label, hint, icon: Icon }) => {
              const active = zoom === value;
              return (
                <button
                  key={String(value)}
                  type="button"
                  onClick={() => setZoom(value)}
                  aria-pressed={active}
                  className={`flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    active
                      ? 'border-ink bg-raised text-ink'
                      : 'border-line bg-transparent text-ink-3 hover:bg-raised hover:text-ink-2 hover:border-line-2'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <Icon size={13} />
                    <span className="text-[12px] font-medium">{label}</span>
                  </span>
                  <span className="text-[11px] leading-tight text-ink-5">{hint}</span>
                </button>
              );
            })}
          </div>

          {ffmpegOk && (
            <div className="mb-4">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Film size={13} className="text-ink-4" />
                <span className="text-[12px] font-medium text-ink-3">Distort + re-encode</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {REGRADE_CHOICES.map(({ value, label }) => {
                  const active = regrade === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRegrade(value)}
                      aria-pressed={active}
                      className={`rounded-xl border px-2 py-2 text-[12px] font-medium transition-colors ${
                        active
                          ? 'border-ink bg-raised text-ink'
                          : 'border-line bg-transparent text-ink-3 hover:bg-raised hover:text-ink-2 hover:border-line-2'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] leading-tight text-ink-5 mt-1.5">
                {regrade === 0
                  ? 'Off — export the clean master.'
                  : 'Rotation, warp, crop, film grain and a colour grade, then a ProRes intermediate and a second encode. Visibly softer, and roughly 4x longer to export.'}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onChoose('male', zoom, regrade)}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-line bg-transparent px-3 py-4 text-ink-3 hover:bg-raised hover:text-ink-2 hover:border-line-2 transition-colors"
            >
              <User size={20} />
              <span className="text-[12px] font-medium">Male music</span>
            </button>
            <button
              type="button"
              onClick={() => onChoose('female', zoom, regrade)}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-line bg-transparent px-3 py-4 text-ink-3 hover:bg-raised hover:text-ink-2 hover:border-line-2 transition-colors"
            >
              <UserRound size={20} />
              <span className="text-[12px] font-medium">Female music</span>
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-line">
          <Button variant="ghost" icon={<VolumeX size={13} />} onClick={() => onChoose(null, zoom, regrade)}>
            No music
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
