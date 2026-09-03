import { useCallback, useEffect, useState } from 'react';
import { Eye, ThumbsUp, RefreshCw, Loader2, Plus, X, Flame, MonitorPlay, ExternalLink, Users, Heart, Grid3x3, MessageSquare, Sparkles, Copy, Check, Reply } from 'lucide-react';
import type { YtChannel, YtVideo, SocialProfile, YtComment } from '../types';
import { ViewHeader } from '../components/ViewHeader';
import { getYoutubeChannels, getSocialProfiles, getYoutubeComments, getYoutubeCommentCounts, generateComments } from '../lib/api';
import { loadChannels, saveChannels, PLATFORMS, PLATFORM_LABELS, type Platform } from '../lib/localChannels';

// Per-platform copy for the add bar. Only YouTube fetches live stats; the rest
// just persist the account links the user pastes.
const PLATFORM_PLACEHOLDER: Record<Platform, string> = {
  youtube: 'Paste a channel link — youtube.com/@handle, /channel/UC…, or @handle',
  instagram: 'Paste an Instagram profile link or @handle',
  facebook: 'Paste a Facebook page link',
  threads: 'Paste a Threads profile link or @handle',
  x: 'Paste an X profile link or @handle',
  tiktok: 'Paste a TikTok profile link or @handle',
};

function formatNumber(n: number) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

// "3h", "2d", "just now" — compact age from an ISO date.
function timeAgo(iso: string) {
  const t = new Date(iso).getTime();
  if (!t) return '';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  const m = s / 60;
  if (m < 60) return `${Math.floor(m)}m`;
  const h = m / 60;
  if (h < 24) return `${Math.floor(h)}h`;
  const d = h / 24;
  if (d < 30) return `${Math.floor(d)}d`;
  const mo = d / 30;
  if (mo < 12) return `${Math.floor(mo)}mo`;
  return `${Math.floor(d / 365)}y`;
}

const sumViews = (vids: YtVideo[]) => vids.reduce((s, v) => s + v.views, 0);

// Real views a video gained inside the active window, as measured server-side
// against snapshot history. null for the 'all' view or before tracking has run.
function gainedFor(v: YtVideo, filter: TimeFilter): { value: number; exact: boolean } | null {
  if (filter === 'all') return null;
  return v.gained?.[filter] ?? null;
}

// A channel's total real gained views in the window across every fetched video,
// plus whether all contributing figures had enough history to be exact (if any
// lacked a baseline old enough, the total is a partial lower bound).
function channelGained(c: YtChannel, filter: TimeFilter): { value: number; exact: boolean } {
  let value = 0;
  let exact = true;
  for (const v of c.videos ?? []) {
    const g = gainedFor(v, filter);
    if (!g) continue;
    value += g.value;
    if (!g.exact) exact = false;
  }
  return { value, exact };
}

// Time-window filter for the dashboard. 'all' = no filter (latest 5 uploads).
type TimeFilter = 'all' | '24h' | 'week' | 'month' | 'year';
const DAY = 24 * 60 * 60 * 1000;
const WINDOW_MS: Record<TimeFilter, number> = {
  all: 0,
  '24h': DAY,
  week: 7 * DAY,
  month: 30 * DAY,
  year: 365 * DAY,
};
const FILTER_LABELS: Record<TimeFilter, string> = { all: 'All', '24h': '24h', week: 'Week', month: 'Month', year: 'Year' };
const WINDOW_NOUN: Record<TimeFilter, string> = {
  all: '',
  '24h': 'the last 24 hours',
  week: 'the last week',
  month: 'the last month',
  year: 'the last year',
};

// Videos to show for a channel under `filter`: 'all' → latest 5; otherwise every
// upload published within the window, measured from `now` (the last-fetch time,
// so the result is stable across re-renders — pure, unlike calling Date.now()).
function shownVideos(c: YtChannel, filter: TimeFilter, now: number): YtVideo[] {
  const vids = c.videos ?? [];
  if (filter === 'all') return vids.slice(0, 5);
  const cutoff = now - WINDOW_MS[filter];
  return vids.filter((v) => new Date(v.publishedAt).getTime() >= cutoff);
}

interface ChannelsViewProps {
  // Reply drafting reuses the Reply view's generator, so it needs the same
  // model + "is the OpenRouter key set" flag.
  canGenerate: boolean;
  model: string;
}

export function ChannelsView({ canGenerate, model }: ChannelsViewProps) {
  const [platform, setPlatform] = useState<Platform>('youtube');
  const [links, setLinks] = useState<string[]>(() => loadChannels('youtube'));
  const [data, setData] = useState<YtChannel[] | null>(null);
  const [social, setSocial] = useState<SocialProfile[] | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [filter, setFilter] = useState<TimeFilter>('all');

  const isYoutube = platform === 'youtube';

  const fetchAll = useCallback(async (targets: string[], noCache = false) => {
    if (!targets.length) {
      setData([]);
      setUpdatedAt(Date.now());
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setData(await getYoutubeChannels(targets, noCache));
      setUpdatedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Best-effort public stats for a non-YouTube platform.
  const fetchSocial = useCallback(async (p: Platform, targets: string[], noCache = false) => {
    if (!targets.length) {
      setSocial([]);
      setUpdatedAt(Date.now());
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setSocial(await getSocialProfiles(p, targets, noCache));
      setUpdatedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh whichever platform is active (used by the header Refresh button).
  const refresh = () => {
    if (isYoutube) void fetchAll(links, true);
    else void fetchSocial(platform, links, true);
  };

  // Switch platforms: swap in that platform's saved accounts and fetch its
  // best-effort public stats.
  const switchPlatform = (p: Platform) => {
    if (p === platform) return;
    setPlatform(p);
    setInput('');
    setError(null);
    setData(null);
    setSocial(null);
    setUpdatedAt(null);
    const saved = loadChannels(p);
    setLinks(saved);
    if (p === 'youtube') void fetchAll(saved);
    else void fetchSocial(p, saved);
  };

  // Initial load (YouTube only). Set state only inside the async callbacks
  // (never synchronously in the effect body) — the first render already shows
  // Loading via data===null.
  useEffect(() => {
    const initial = loadChannels('youtube');
    if (!initial.length) return;
    getYoutubeChannels(initial)
      .then((d) => {
        setData(d);
        setUpdatedAt(Date.now());
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const addChannel = () => {
    const link = input.trim();
    if (!link) return;
    if (links.some((l) => l.toLowerCase() === link.toLowerCase())) {
      setInput('');
      return;
    }
    const next = [...links, link];
    setLinks(next);
    saveChannels(platform, next);
    setInput('');
    if (isYoutube) void fetchAll(next);
    else void fetchSocial(platform, next);
  };

  const removeChannel = (link: string) => {
    const next = links.filter((l) => l !== link);
    setLinks(next);
    saveChannels(platform, next);
    setData((d) => (d ? d.filter((c) => c.input !== link) : d));
    setSocial((s) => (s ? s.filter((p) => p.input !== link) : s));
  };

  // Reference "now" for windowing = when the data was last fetched (stable, so
  // filtering stays pure across re-renders).
  const now = updatedAt ?? 0;
  const shownFor = (c: YtChannel): YtVideo[] => shownVideos(c, filter, now);

  // The metric a channel is ranked/summed by: real gained views under a window
  // filter, lifetime views of the latest uploads under 'all'.
  const metric = (c: YtChannel): number =>
    filter === 'all' ? sumViews(shownFor(c)) : channelGained(c, filter).value;

  // Sort channels so the best-performing (most views in the window) float to the top.
  const sorted = data ? [...data].sort((a, b) => metric(b) - metric(a)) : null;
  const okChannels = sorted?.filter((c) => c.ok) ?? [];
  const totalViews = okChannels.reduce((s, c) => s + metric(c), 0);
  // Partial when any channel lacks a baseline old enough to fill the window —
  // the number is still accumulating as tracking history builds up.
  const totalExact = filter === 'all' || okChannels.every((c) => channelGained(c, filter).exact);

  // The single best-performing video in the window across every channel — scored
  // by real gained views when filtered, lifetime views under 'all'.
  let top: { video: YtVideo; channel: YtChannel; score: number } | null = null;
  for (const c of okChannels) {
    const pool = filter === 'all' ? shownFor(c) : c.videos ?? [];
    for (const v of pool) {
      const score = filter === 'all' ? v.views : gainedFor(v, filter)?.value ?? 0;
      if (!top || score > top.score) top = { video: v, channel: c, score };
    }
  }

  return (
    <>
      <ViewHeader
        title="Channels"
        subtitle={
          isYoutube
            ? 'Latest uploads and their views across all your YouTube channels — open any upload to read its newest comments and draft replies. No API key needed.'
            : `Your ${PLATFORM_LABELS[platform]} accounts — saved per platform.`
        }
        right={
          links.length > 0 && (
            <>
              {/* Time-window filter — YouTube only (the others have no per-post dates). */}
              {isYoutube && (
                <div className="flex items-center rounded-lg border border-line p-0.5 bg-card">
                  {(['all', '24h', 'week', 'month', 'year'] as TimeFilter[]).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`h-7 px-2.5 rounded-md text-[12px] font-medium transition-colors ${filter === f ? 'bg-raised text-ink' : 'text-ink-5 hover:text-ink'
                        }`}
                    >
                      {FILTER_LABELS[f]}
                    </button>
                  ))}
                </div>
              )}
              {updatedAt && !loading && (
                <span className="text-[11px] text-ink-6 mr-1">updated {timeAgo(new Date(updatedAt).toISOString())} ago</span>
              )}
              <button
                onClick={refresh}
                disabled={loading}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-line text-[12px] text-ink-4 hover:text-ink hover:border-line-2 disabled:opacity-50"
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                {loading ? 'Refreshing…' : 'Refresh'}
              </button>
            </>
          )
        }
      />

      <div className="flex-1 overflow-y-auto">
        {/* Platform switcher — default YouTube; each platform keeps its own accounts. */}
        <div className="px-4 sm:px-8 pt-4 border-b border-line bg-surface">
          <div className="max-w-4xl mx-auto flex flex-wrap gap-1.5 pb-3">
            {PLATFORMS.map((p) => (
              <button
                key={p}
                onClick={() => switchPlatform(p)}
                className={`h-8 px-3 rounded-lg text-[12px] font-medium transition-colors border ${platform === p
                    ? 'bg-ink text-bg border-ink'
                    : 'bg-card text-ink-4 border-line hover:text-ink hover:border-line-2'
                  }`}
              >
                {PLATFORM_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        {/* Add-channel bar */}
        <div className="px-4 sm:px-8 py-4 border-b border-line bg-surface">
          <div className="max-w-4xl mx-auto flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addChannel()}
              placeholder={PLATFORM_PLACEHOLDER[platform]}
              className="flex-1 h-9 px-3 rounded-lg bg-card border border-line text-[13px] text-ink placeholder:text-ink-6 outline-none focus-visible:ring-2 focus-visible:ring-ink/10"
            />
            <button
              onClick={addChannel}
              className="flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-ink text-bg text-[13px] font-medium hover:opacity-90"
            >
              <Plus size={14} /> Add
            </button>
          </div>
        </div>

        {/* Top-strip totals */}
        {isYoutube && okChannels.length > 0 && (
          <div className="px-4 sm:px-8 py-4 border-b border-line bg-surface">
            <div className="max-w-4xl mx-auto grid grid-cols-2 sm:grid-cols-3 gap-6">
              <Stat label="Channels" value={String(okChannels.length)} />
              <Stat
                label={filter === 'all' ? 'Recent views' : `Views gained · ${FILTER_LABELS[filter]}`}
                value={`${totalExact ? '' : '~'}${formatNumber(totalViews)}`}
                note={
                  filter === 'all'
                    ? undefined
                    : totalExact
                      ? 'real views earned in this window'
                      : 'still building history — partial so far'
                }
              />
              {top && (
                <div className="min-w-0">
                  <div className="text-[11px] text-ink-6 uppercase tracking-widest flex items-center gap-1">
                    <Flame size={11} className="text-orange-500" /> Top performer
                  </div>
                  <div className="text-[14px] font-semibold text-ink leading-tight mt-1 truncate">
                    {formatNumber(top.score)} · {top.channel.title}
                  </div>
                  <div className="text-[11px] text-ink-6 truncate">{top.video.title}</div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="p-4 sm:p-8">
          <div className="max-w-4xl mx-auto flex flex-col gap-4">
            {!isYoutube ? (
              links.length === 0 ? (
                <Empty text={`Add your ${PLATFORM_LABELS[platform]} accounts above — they're saved per platform in this browser.`} />
              ) : social === null ? (
                <Loading />
              ) : (
                [...social]
                  .sort((a, b) => (b.followers ?? -1) - (a.followers ?? -1))
                  .map((p) => (
                    <SocialCard key={p.input} profile={p} onRemove={() => removeChannel(p.input)} />
                  ))
              )
            ) : links.length === 0 ? (
              <Empty text="Add your YouTube channel links above to see each one's latest uploads and views in a single dashboard." />
            ) : error && !data ? (
              <Empty text={error} />
            ) : data === null ? (
              <Loading />
            ) : (
              sorted!.map((c) => (
                <ChannelCard
                  key={c.input}
                  channel={c}
                  videos={shownFor(c)}
                  filter={filter}
                  emptyNote={filter === 'all' ? '' : `No uploads in ${WINDOW_NOUN[filter]}.`}
                  onRemove={() => removeChannel(c.input)}
                  canGenerate={canGenerate}
                  model={model}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <div className="text-[11px] text-ink-6 uppercase tracking-widest">{label}</div>
      <div className="text-[22px] font-semibold text-ink leading-none mt-1">{value}</div>
      {note && <div className="text-[10px] text-ink-6 mt-1">{note}</div>}
    </div>
  );
}

function ChannelCard({
  channel,
  videos,
  filter,
  emptyNote,
  onRemove,
  canGenerate,
  model,
}: {
  channel: YtChannel;
  videos: YtVideo[];
  filter: TimeFilter;
  emptyNote: string;
  onRemove: () => void;
  canGenerate: boolean;
  model: string;
}) {
  // Which upload's comment thread is expanded under the grid (one at a time).
  const [openId, setOpenId] = useState<string | null>(null);
  const open = videos.find((v) => v.id === openId) ?? null;
  const commentCounts = useCommentCounts(videos);

  return (
    <div className="bg-card border border-line rounded-xl p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full overflow-hidden bg-raised shrink-0">
          {channel.avatar ? (
            <img src={channel.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-ink-6">
              <MonitorPlay size={18} />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {channel.ok ? (
            <a
              href={channel.url}
              target="_blank"
              rel="noreferrer"
              className="text-[14px] font-semibold text-ink hover:underline truncate block"
            >
              {channel.title}
            </a>
          ) : (
            <span className="text-[14px] font-semibold text-ink truncate block">{channel.input}</span>
          )}
          <span className="text-[11px] text-ink-6 truncate block">
            {channel.ok
              ? `${channel.subscribers ? `${formatNumber(channel.subscribers)} subscribers · ` : ''}${formatNumber(sumViews(videos))} views · ${videos.length} ${videos.length === 1 ? 'upload' : 'uploads'}`
              : channel.error}
          </span>
        </div>
        <button
          onClick={onRemove}
          aria-label="Remove channel"
          className="text-ink-6 hover:text-ink shrink-0 p-1"
        >
          <X size={15} />
        </button>
      </div>

      {channel.ok &&
        (videos.length > 0 ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {videos.map((v) => (
                <VideoCard
                  key={v.id}
                  video={v}
                  gained={gainedFor(v, filter)}
                  commentCount={commentCounts.get(v.id)}
                  open={v.id === openId}
                  onToggleComments={() => setOpenId((id) => (id === v.id ? null : v.id))}
                />
              ))}
            </div>
            {open && (
              <CommentsPanel
                key={open.id}
                video={open}
                canGenerate={canGenerate}
                model={model}
                onClose={() => setOpenId(null)}
              />
            )}
          </>
        ) : (
          emptyNote && <div className="text-[12px] text-ink-6 py-2">{emptyNote}</div>
        ))}
    </div>
  );
}

function VideoCard({
  video,
  gained,
  commentCount,
  open,
  onToggleComments,
}: {
  video: YtVideo;
  gained?: { value: number; exact: boolean } | null;
  // undefined while the counts are still loading, null when YouTube wouldn't
  // tell us — a number only when we actually know.
  commentCount?: number | null;
  open: boolean;
  onToggleComments: () => void;
}) {
  return (
    <div className="group">
      <a href={video.url} target="_blank" rel="noreferrer" className="block">
        <div className="relative aspect-video rounded-md overflow-hidden bg-raised">
          <img
            src={video.thumbnail}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
          />
          {video.publishedAt && (
            <span className="absolute bottom-1 right-1 text-[10px] font-medium text-white bg-black/70 px-1 rounded">
              {timeAgo(video.publishedAt)}
            </span>
          )}
        </div>
        <div className="mt-1.5 text-[11px] text-ink-4 line-clamp-2 leading-snug group-hover:text-ink">{video.title}</div>
      </a>
      <div className="mt-1 flex items-center gap-3 text-[11px] text-ink-5">
        <span className="flex items-center gap-1">
          <Eye size={11} className="text-ink-6" />
          {formatNumber(video.views)}
        </span>
        <span className="flex items-center gap-1">
          <ThumbsUp size={11} className="text-ink-6" />
          {formatNumber(video.likes)}
        </span>
        {gained && (
          <span className="text-accent">
            +{gained.exact ? '' : '~'}
            {formatNumber(gained.value)}
          </span>
        )}
      </div>
      <button
        onClick={onToggleComments}
        aria-expanded={open}
        className={`mt-1 flex items-center gap-1 text-[11px] ${open ? 'text-ink' : 'text-ink-5 hover:text-ink'}`}
      >
        <MessageSquare size={11} className={open ? '' : 'text-ink-6'} />
        {open ? 'Hide comments' : commentCount == null ? 'Comments' : `${formatNumber(commentCount)} comments`}
      </button>
    </div>
  );
}

// How many comments each upload in this grid has, so a card can say "12
// comments" instead of a bare "Comments" and you can see at a glance which ones
// need replying to. One cheap watch-page read per video server-side (capped
// concurrency, 5-minute cache), fired once the grid has rendered.
//
// Counts are YouTube's own abbreviated figures ("53K" -> 53000), so they're
// approximate for big videos and exact for small ones — which is the right way
// round for a "what needs a reply" list.
function useCommentCounts(videos: YtVideo[]): Map<string, number | null> {
  const [counts, setCounts] = useState<Map<string, number | null>>(new Map());
  // Refetch only when the actual set of uploads changes, not on every render.
  const key = videos.map((v) => v.id).join(',');

  useEffect(() => {
    if (!videos.length) return;
    let live = true;
    getYoutubeCommentCounts(videos.map((v) => v.url))
      .then((rows) => {
        if (!live) return;
        const next = new Map<string, number | null>();
        for (const r of rows) {
          if (r.ok && r.videoId) next.set(r.videoId, r.count ?? null);
        }
        setCounts(next);
      })
      .catch(() => {
        // A failed count is not worth surfacing — the cards just keep saying
        // "Comments" and opening one still works.
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return counts;
}

// The recent comments on one upload, with a per-comment "draft a reply" helper.
// Posting a reply needs a logged-in YouTube session, so each comment deep-links
// straight to itself on YouTube — draft here, paste there.
function CommentsPanel({
  video,
  canGenerate,
  model,
  onClose,
}: {
  video: YtVideo;
  canGenerate: boolean;
  model: string;
  onClose: () => void;
}) {
  const [comments, setComments] = useState<YtComment[] | null>(null);
  const [sort, setSort] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Bumped by the reload button; the fetch effect re-runs on every change and
  // any value past the first means "skip the cache".
  const [nonce, setNonce] = useState(0);

  // Fetch only — state is set inside the async callbacks, never synchronously in
  // the effect body (the first render already shows Loading via comments===null).
  useEffect(() => {
    let live = true;
    getYoutubeComments([video.url], { limit: 25, noCache: nonce > 0 })
      .then(([r]) => {
        if (!r || !r.ok) throw new Error(r?.error || 'Could not load comments.');
        if (!live) return;
        setSort(r.sort || '');
        setComments(r.comments ?? []);
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [video.url, nonce]);

  const reload = () => {
    setError(null);
    setComments(null);
    setNonce((n) => n + 1);
  };

  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="flex items-center gap-2 mb-2">
        <MessageSquare size={13} className="text-ink-6 shrink-0" />
        <span className="text-[12px] font-medium text-ink truncate flex-1">{video.title}</span>
        {comments && (
          <span className="text-[11px] text-ink-6 shrink-0">
            {sort === 'newest' ? 'newest first' : sort === 'top' ? 'top comments' : ''}
          </span>
        )}
        <button onClick={reload} className="text-ink-6 hover:text-ink shrink-0 p-1" aria-label="Reload comments">
          <RefreshCw size={13} />
        </button>
        <button onClick={onClose} className="text-ink-6 hover:text-ink shrink-0 p-1" aria-label="Close comments">
          <X size={14} />
        </button>
      </div>

      {error ? (
        <div className="text-[12px] text-ink-6 py-2">{error}</div>
      ) : comments === null ? (
        <div className="flex items-center gap-2 text-[12px] text-ink-5 py-3">
          <Loader2 size={13} className="animate-spin" /> Loading comments…
        </div>
      ) : comments.length === 0 ? (
        <div className="text-[12px] text-ink-6 py-2">No comments on this one yet.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {comments.map((c) => (
            <CommentRow key={c.id} comment={c} videoTitle={video.title} canGenerate={canGenerate} model={model} />
          ))}
        </div>
      )}
    </div>
  );
}

function CommentRow({
  comment,
  videoTitle,
  canGenerate,
  model,
}: {
  comment: YtComment;
  videoTitle: string;
  canGenerate: boolean;
  model: string;
}) {
  const [drafts, setDrafts] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  // Reuses the Reply view's generator: hand it the video title + this comment as
  // the "post", so the drafts answer this specific person.
  const draft = async () => {
    setBusy(true);
    setError(null);
    try {
      const text = [
        `My video is titled: ${videoTitle}`,
        '',
        'A viewer commented:',
        comment.text,
        '',
        'Reply to that viewer, as the creator of the video.',
      ].join('\n');
      const r = await generateComments({ text, model });
      setDrafts(r.comments);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const copy = async (i: number, value: string) => {
    await navigator.clipboard.writeText(value).catch(() => {});
    setCopied(i);
    setTimeout(() => setCopied(null), 1200);
  };

  return (
    <div className="bg-surface border border-line rounded-lg p-2.5">
      <div className="flex items-start gap-2.5">
        <div className="w-6 h-6 rounded-full overflow-hidden bg-raised shrink-0">
          {comment.avatar && (
            <img src={comment.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11px] text-ink-6">
            <span className="font-medium text-ink-4 truncate">{comment.author}</span>
            <span className="shrink-0">{comment.publishedText}</span>
            {comment.likes > 0 && (
              <span className="flex items-center gap-1 shrink-0">
                <ThumbsUp size={10} /> {formatNumber(comment.likes)}
              </span>
            )}
            {comment.replyCount > 0 && (
              <span className="flex items-center gap-1 shrink-0">
                <MessageSquare size={10} /> {formatNumber(comment.replyCount)}
              </span>
            )}
            {comment.isHearted && <Heart size={10} className="text-red-500 shrink-0" />}
          </div>
          <p className="text-[13px] text-ink leading-snug mt-0.5 whitespace-pre-wrap break-words">{comment.text}</p>

          <div className="mt-1.5 flex items-center gap-3">
            <a
              href={comment.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-[11px] text-ink-5 hover:text-ink"
            >
              <Reply size={11} /> Reply on YouTube
            </a>
            <button
              onClick={draft}
              disabled={busy || !canGenerate}
              title={canGenerate ? undefined : 'Add your OpenRouter key in Settings.'}
              className="flex items-center gap-1 text-[11px] text-ink-5 hover:text-ink disabled:opacity-40"
            >
              {busy ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
              {busy ? 'Writing…' : drafts.length ? 'Redraft' : 'Draft reply'}
            </button>
          </div>

          {error && <p className="text-[11px] text-red-600 mt-1">{error}</p>}

          {drafts.length > 0 && (
            <div className="mt-2 flex flex-col gap-1.5">
              {drafts.map((d, i) => (
                <div key={i} className="flex items-start gap-2 bg-card border border-line rounded-md px-2 py-1.5">
                  <p className="flex-1 text-[12px] text-ink leading-snug">{d}</p>
                  <button
                    onClick={() => copy(i, d)}
                    className="shrink-0 text-[11px] text-ink-5 hover:text-ink flex items-center gap-1"
                  >
                    {copied === i ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
                    {copied === i ? 'Copied' : 'Copy'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// A saved account on a non-YouTube platform, with whatever public stats we could
// scrape. Login-walled platforms may expose only some fields (or none) — those
// just don't render, and a hard failure shows the pasted link with an error.
function SocialCard({ profile, onRemove }: { profile: SocialProfile; onRemove: () => void }) {
  const p = profile;
  const label = p.title || (p.handle ? `@${p.handle}` : p.input);
  const hasStats = p.followers != null || p.posts != null || p.likes != null;
  return (
    <div className="bg-card border border-line rounded-xl p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-full overflow-hidden bg-raised shrink-0">
        {p.avatar ? (
          <img src={p.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-ink-6">
            <Users size={16} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {p.ok && p.url ? (
          <a
            href={p.url}
            target="_blank"
            rel="noreferrer"
            className="text-[14px] font-semibold text-ink hover:underline truncate block"
          >
            {label}
          </a>
        ) : (
          <span className="text-[14px] font-semibold text-ink truncate block">{label}</span>
        )}
        {p.ok ? (
          hasStats ? (
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-5">
              {p.followers != null && (
                <span className="flex items-center gap-1">
                  <Users size={12} className="text-ink-6" />
                  {formatNumber(p.followers)} followers
                </span>
              )}
              {p.posts != null && (
                <span className="flex items-center gap-1">
                  <Grid3x3 size={12} className="text-ink-6" />
                  {formatNumber(p.posts)} posts
                </span>
              )}
              {p.likes != null && (
                <span className="flex items-center gap-1">
                  <Heart size={12} className="text-ink-6" />
                  {formatNumber(p.likes)} likes
                </span>
              )}
            </div>
          ) : (
            <span className="text-[11px] text-ink-6 truncate block">
              No public stats — this platform blocks logged-out access.
            </span>
          )
        ) : (
          <span className="text-[11px] text-ink-6 truncate block">{p.error}</span>
        )}
      </div>
      {p.ok && p.url && (
        <a
          href={p.url}
          target="_blank"
          rel="noreferrer"
          aria-label="Open account"
          className="text-ink-6 hover:text-ink shrink-0 p-1"
        >
          <ExternalLink size={15} />
        </a>
      )}
      <button onClick={onRemove} aria-label="Remove account" className="text-ink-6 hover:text-ink shrink-0 p-1">
        <X size={15} />
      </button>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-16 text-ink-5 text-[13px] gap-2">
      <Loader2 size={14} className="animate-spin" /> Loading channels…
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="text-center py-16 text-[13px] text-ink-5 max-w-md mx-auto">{text}</div>;
}
