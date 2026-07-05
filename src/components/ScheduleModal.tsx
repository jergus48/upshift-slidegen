import { useEffect, useState } from 'react';
import { X, Loader2, CalendarClock, Info, CheckCircle2, ExternalLink, Download } from 'lucide-react';
import type { Slideshow, SocialAccount } from '../types';
import { getScheduledPosts } from '../lib/api';
import { downloadSlideshow } from '../lib/render';
import { Button } from './Button';
import { SlidePreview } from './SlidePreview';

// Default gap after the last thing already scheduled (or after now, if nothing
// is queued) so the user isn't forced to pick a time from a blank field.
const DEFAULT_GAP_HOURS = 3;

// post-bridge dashboard — where the user reviews what we just sent over.
const PB_SCHEDULED_URL = 'https://www.post-bridge.com/dashboard/posts/scheduled';
const PB_DRAFTS_URL = 'https://www.post-bridge.com/dashboard/posts/drafts';

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface ScheduleModalProps {
  slideshow: Slideshow;
  accounts: SocialAccount[];
  defaults: { socialAccountIds: number[]; mode: 'draft' | 'schedule' };
  onClose: () => void;
  onConfirm: (opts: {
    socialAccounts: number[];
    mode: 'draft' | 'schedule';
    scheduledAt: string | null;
  }) => Promise<void>;
}

export function ScheduleModal({ slideshow, accounts, defaults, onClose, onConfirm }: ScheduleModalProps) {
  const [selected, setSelected] = useState<number[]>(defaults.socialAccountIds);
  const [mode, setMode] = useState<'draft' | 'schedule'>(defaults.mode);
  // Seed with now + gap immediately so the field is never blank; refine to
  // "after the last scheduled post" once post-bridge responds.
  const [when, setWhen] = useState(() =>
    toLocalInput(new Date(Date.now() + DEFAULT_GAP_HOURS * 3600_000))
  );
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which mode succeeded, or null while still on the form. Drives the success screen.
  const [doneMode, setDoneMode] = useState<'draft' | 'schedule' | null>(null);

  useEffect(() => {
    getScheduledPosts()
      .then((posts) => {
        const future = posts
          .map((p) => (p.scheduledAt ? new Date(p.scheduledAt).getTime() : 0))
          .filter((t) => t > Date.now());
        const base = future.length ? Math.max(...future) : Date.now();
        setWhen(toLocalInput(new Date(base + DEFAULT_GAP_HOURS * 3600_000)));
      })
      .catch(() => {});
  }, []);

  const toggle = (id: number) =>
    setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const download = async () => {
    setDownloading(true);
    try {
      await downloadSlideshow(slideshow);
    } finally {
      setDownloading(false);
    }
  };

  const confirm = async () => {
    setError(null);
    if (!selected.length) return setError('Pick at least one account.');
    if (mode === 'schedule' && !when) return setError('Pick a date & time, or save as a draft.');
    setBusy(true);
    try {
      await onConfirm({
        socialAccounts: selected,
        mode,
        scheduledAt: mode === 'schedule' ? new Date(when).toISOString() : null,
      });
      setBusy(false);
      setDoneMode(mode); // show the success screen instead of closing
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  if (doneMode) {
    const scheduled = doneMode === 'schedule';
    return (
      <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
        <div
          className="bg-card border border-line rounded-2xl w-full max-w-sm p-6 text-center"
          onClick={(e) => e.stopPropagation()}
        >
          <CheckCircle2 size={32} className="text-emerald-600 mx-auto" />
          <h2 className="text-[16px] font-semibold text-ink mt-3">
            {scheduled ? 'Scheduled' : 'Saved as draft'}
          </h2>
          <p className="text-[13px] text-ink-5 mt-1.5 leading-snug">
            {scheduled
              ? 'post-bridge will publish it at the time you picked.'
              : 'It’s waiting in your post-bridge drafts to post by hand.'}
          </p>
          <div className="flex flex-col gap-2 mt-5">
            <a
              href={scheduled ? PB_SCHEDULED_URL : PB_DRAFTS_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-1.5 h-9 rounded-lg bg-ink text-bg text-[13px] font-medium hover:opacity-90"
            >
              View on post-bridge <ExternalLink size={13} />
            </a>
            <Button variant="secondary" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card border border-line rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="text-[15px] font-semibold text-ink">Schedule slideshow</h2>
          <button onClick={onClose} className="text-ink-5 hover:text-ink">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Preview */}
          <div>
            <div className="grid grid-cols-6 gap-1.5">
              {slideshow.slides.map((s) => (
                <SlidePreview key={s.id} slide={s} />
              ))}
            </div>
            <div className="flex items-start justify-between gap-2 mt-2">
              <p className="text-[12px] text-ink-4 line-clamp-2">{slideshow.caption}</p>
              <Button
                variant="ghost"
                size="sm"
                icon={downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                onClick={download}
                disabled={downloading}
                className="shrink-0"
              >
                Download
              </Button>
            </div>
          </div>

          {/* Accounts */}
          <div>
            <label className="text-[11px] text-ink-5 mb-1.5 block uppercase tracking-widest font-semibold">
              Post to
            </label>
            {accounts.length === 0 ? (
              <p className="text-[12px] text-ink-5">
                No connected accounts. Add your post-bridge key in Settings and connect accounts at{' '}
                <a
                  href="https://post-bridge.com?atp=clip-factory"
                  target="_blank"
                  rel="noreferrer"
                  className="text-ink-4 underline hover:text-ink"
                >
                  post-bridge.com
                </a>
                .
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {accounts.map((a) => (
                  <label
                    key={a.id}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-line cursor-pointer hover:border-line-2"
                  >
                    <input type="checkbox" checked={selected.includes(a.id)} onChange={() => toggle(a.id)} />
                    <span className="text-[13px] text-ink font-medium">{a.username}</span>
                    <span className="text-[11px] text-ink-5 uppercase tracking-wide">{a.platform}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Mode */}
          <div>
            <label className="text-[11px] text-ink-5 mb-1.5 block uppercase tracking-widest font-semibold">
              When
            </label>
            <div className="flex gap-2 mb-2">
              <Button variant={mode === 'draft' ? 'primary' : 'secondary'} onClick={() => setMode('draft')}>
                Save as draft
              </Button>
              <Button variant={mode === 'schedule' ? 'primary' : 'secondary'} onClick={() => setMode('schedule')}>
                Schedule
              </Button>
            </div>
            {mode === 'schedule' && (
              <input
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                className="w-full h-9 bg-card border border-line rounded-lg px-3 text-[13px] text-ink outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10"
              />
            )}

            <div className="flex items-start gap-2 mt-2 p-2.5 rounded-lg bg-surface border border-line">
              <Info size={13} className="text-ink-5 mt-0.5 shrink-0" />
              <p className="text-[11px] text-ink-4 leading-snug">
                {mode === 'draft' ? (
                  <>
                    Saves to your post-bridge inbox to post by hand. No analytics come back on
                    drafts (TikTok only reports content it posts itself) — but posting manually
                    avoids automation detection, so reach potential is often higher.
                  </>
                ) : (
                  <>post-bridge publishes this automatically at the chosen time and reports its analytics back to Results.</>
                )}
              </p>
            </div>
          </div>

          {error && <p className="text-[12px] text-red-600">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-line flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={busy ? <Loader2 size={13} className="animate-spin" /> : <CalendarClock size={13} />}
            onClick={confirm}
            disabled={busy}
          >
            {busy ? 'Uploading…' : mode === 'schedule' ? 'Schedule it' : 'Save draft'}
          </Button>
        </div>
      </div>
    </div>
  );
}
