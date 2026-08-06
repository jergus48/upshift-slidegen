import { Music, User, UserRound, VolumeX } from 'lucide-react';
import type { MusicGender } from '../lib/music';
import { Button } from './Button';

interface MusicChoiceModalProps {
  count: number;
  onClose: () => void;
  // null → export with no music. A gender → pick a random track from that pool
  // for each video.
  onChoose: (music: MusicGender | null) => void;
}

// Small popup shown right before a video export: pick which soundtrack pool to
// draw from (a random track is chosen per video) or opt out of music entirely.
export function MusicChoiceModal({ count, onClose, onChoose }: MusicChoiceModalProps) {
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

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onChoose('male')}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-line bg-transparent px-3 py-4 text-ink-3 hover:bg-raised hover:text-ink-2 hover:border-line-2 transition-colors"
            >
              <User size={20} />
              <span className="text-[12px] font-medium">Male music</span>
            </button>
            <button
              type="button"
              onClick={() => onChoose('female')}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-line bg-transparent px-3 py-4 text-ink-3 hover:bg-raised hover:text-ink-2 hover:border-line-2 transition-colors"
            >
              <UserRound size={20} />
              <span className="text-[12px] font-medium">Female music</span>
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-line">
          <Button variant="ghost" icon={<VolumeX size={13} />} onClick={() => onChoose(null)}>
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
