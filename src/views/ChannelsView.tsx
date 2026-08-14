import { useCallback, useEffect, useState } from 'react';
import { Eye, ThumbsUp, RefreshCw, Loader2, Plus, X, Flame, MonitorPlay, ExternalLink } from 'lucide-react';
import type { YtChannel, YtVideo } from '../types';
import { ViewHeader } from '../components/ViewHeader';
import { getYoutubeChannels } from '../lib/api';
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

export function ChannelsView() {
  const [platform, setPlatform] = useState<Platform>('youtube');
  const [links, setLinks] = useState<string[]>(() => loadChannels('youtube'));
  const [data, setData] = useState<YtChannel[] | null>(null);
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

  // Switch platforms: swap in that platform's saved accounts. Only YouTube
  // fetches live stats; the other platforms just render their stored links.
  const switchPlatform = (p: Platform) => {
    if (p === platform) return;
    setPlatform(p);
    setInput('');
    setError(null);
    setData(null);
    setUpdatedAt(null);
    const saved = loadChannels(p);
    setLinks(saved);
    if (p === 'youtube') void fetchAll(saved);
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
  };

  const removeChannel = (link: string) => {
    const next = links.filter((l) => l !== link);
    setLinks(next);
    saveChannels(platform, next);
    setData((d) => (d ? d.filter((c) => c.input !== link) : d));
  };

  // Reference "now" for windowing = when the data was last fetched (stable, so
  // filtering stays pure across re-renders).
  const now = updatedAt ?? 0;
  const shownFor = (c: YtChannel): YtVideo[] => shownVideos(c, filter, now);

  // Sort channels so the best-performing (most views in the window) float to the top.
  const sorted = data
    ? [...data].sort((a, b) => sumViews(shownFor(b)) - sumViews(shownFor(a)))
    : null;
  const okChannels = sorted?.filter((c) => c.ok) ?? [];
  const totalViews = okChannels.reduce((s, c) => s + sumViews(shownFor(c)), 0);

  // The single best-performing Short in the window across every channel.
  let top: { video: YtVideo; channel: YtChannel } | null = null;
  for (const c of okChannels) {
    for (const v of shownFor(c)) {
      if (!top || v.views > top.video.views) top = { video: v, channel: c };
    }
  }

  return (
    <>
      <ViewHeader
        title="Channels"
        subtitle={
          isYoutube
            ? 'Latest uploads and their views across all your YouTube channels — no API key needed.'
            : `Your ${PLATFORM_LABELS[platform]} accounts — saved per platform.`
        }
        right={
          isYoutube &&
          links.length > 0 && (
            <>
              {/* Time-window filter — default is All (no filter). */}
              <div className="flex items-center rounded-lg border border-line p-0.5 bg-card">
                {(['all', '24h', 'week', 'month', 'year'] as TimeFilter[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`h-7 px-2.5 rounded-md text-[12px] font-medium transition-colors ${
                      filter === f ? 'bg-raised text-ink' : 'text-ink-5 hover:text-ink'
                    }`}
                  >
                    {FILTER_LABELS[f]}
                  </button>
                ))}
              </div>
              {updatedAt && !loading && (
                <span className="text-[11px] text-ink-6 mr-1">updated {timeAgo(new Date(updatedAt).toISOString())} ago</span>
              )}
              <button
                onClick={() => void fetchAll(links, true)}
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
                className={`h-8 px-3 rounded-lg text-[12px] font-medium transition-colors border ${
                  platform === p
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
                label={filter === 'all' ? 'Recent views' : `Views · ${FILTER_LABELS[filter]}`}
                value={formatNumber(totalViews)}
              />
              {top && (
                <div className="min-w-0">
                  <div className="text-[11px] text-ink-6 uppercase tracking-widest flex items-center gap-1">
                    <Flame size={11} className="text-orange-500" /> Top performer
                  </div>
                  <div className="text-[14px] font-semibold text-ink leading-tight mt-1 truncate">
                    {formatNumber(top.video.views)} · {top.channel.title}
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
              ) : (
                links.map((link) => (
                  <AccountCard key={link} link={link} onRemove={() => removeChannel(link)} />
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
                  emptyNote={filter === 'all' ? '' : `No uploads in ${WINDOW_NOUN[filter]}.`}
                  onRemove={() => removeChannel(c.input)}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-ink-6 uppercase tracking-widest">{label}</div>
      <div className="text-[22px] font-semibold text-ink leading-none mt-1">{value}</div>
    </div>
  );
}

function ChannelCard({
  channel,
  videos,
  emptyNote,
  onRemove,
}: {
  channel: YtChannel;
  videos: YtVideo[];
  emptyNote: string;
  onRemove: () => void;
}) {
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
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {videos.map((v) => (
              <VideoCard key={v.id} video={v} />
            ))}
          </div>
        ) : (
          emptyNote && <div className="text-[12px] text-ink-6 py-2">{emptyNote}</div>
        ))}
    </div>
  );
}

function VideoCard({ video }: { video: YtVideo }) {
  return (
    <a href={video.url} target="_blank" rel="noreferrer" className="group block">
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
      <div className="mt-1 flex items-center gap-3 text-[11px] text-ink-5">
        <span className="flex items-center gap-1">
          <Eye size={11} className="text-ink-6" />
          {formatNumber(video.views)}
        </span>
        <span className="flex items-center gap-1">
          <ThumbsUp size={11} className="text-ink-6" />
          {formatNumber(video.likes)}
        </span>
      </div>
    </a>
  );
}

// A saved account for a non-YouTube platform. We don't fetch stats there, so
// the card just shows the pasted link (or handle) with a link out and remove.
function AccountCard({ link, onRemove }: { link: string; onRemove: () => void }) {
  const isUrl = /^https?:\/\//i.test(link);
  const label = link.replace(/^https?:\/\/(www\.)?/i, '');
  return (
    <div className="bg-card border border-line rounded-xl p-4 flex items-center gap-3">
      <div className="min-w-0 flex-1">
        {isUrl ? (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="text-[14px] font-semibold text-ink hover:underline truncate block"
          >
            {label}
          </a>
        ) : (
          <span className="text-[14px] font-semibold text-ink truncate block">{link}</span>
        )}
      </div>
      {isUrl && (
        <a
          href={link}
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
