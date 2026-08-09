import { useCallback, useEffect, useState } from 'react';
import { Eye, ThumbsUp, RefreshCw, Loader2, Plus, X, Flame, MonitorPlay } from 'lucide-react';
import type { YtChannel, YtVideo } from '../types';
import { ViewHeader } from '../components/ViewHeader';
import { getYoutubeChannels } from '../lib/api';
import { loadChannels, saveChannels } from '../lib/localChannels';

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

const recentViews = (c: YtChannel) => (c.videos ?? []).reduce((s, v) => s + v.views, 0);

export function ChannelsView() {
  const [links, setLinks] = useState<string[]>(() => loadChannels());
  const [data, setData] = useState<YtChannel[] | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

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

  // Initial load. Set state only inside the async callbacks (never synchronously
  // in the effect body) — the first render already shows Loading via data===null.
  useEffect(() => {
    const initial = loadChannels();
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
    saveChannels(next);
    setInput('');
    void fetchAll(next);
  };

  const removeChannel = (link: string) => {
    const next = links.filter((l) => l !== link);
    setLinks(next);
    saveChannels(next);
    setData((d) => (d ? d.filter((c) => c.input !== link) : d));
  };

  // Sort channels so the best-performing (most recent views) float to the top.
  const sorted = data ? [...data].sort((a, b) => recentViews(b) - recentViews(a)) : null;
  const okChannels = sorted?.filter((c) => c.ok) ?? [];
  const totalViews = okChannels.reduce((s, c) => s + recentViews(c), 0);

  // The single best-performing recent Short across every channel.
  let top: { video: YtVideo; channel: YtChannel } | null = null;
  for (const c of okChannels) {
    for (const v of c.videos ?? []) {
      if (!top || v.views > top.video.views) top = { video: v, channel: c };
    }
  }

  return (
    <>
      <ViewHeader
        title="Channels"
        subtitle="Latest uploads and their views across all your YouTube channels — no API key needed."
        right={
          links.length > 0 && (
            <>
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
        {/* Add-channel bar */}
        <div className="px-4 sm:px-8 py-4 border-b border-line bg-surface">
          <div className="max-w-4xl mx-auto flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addChannel()}
              placeholder="Paste a channel link — youtube.com/@handle, /channel/UC…, or @handle"
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
        {okChannels.length > 0 && (
          <div className="px-4 sm:px-8 py-4 border-b border-line bg-surface">
            <div className="max-w-4xl mx-auto grid grid-cols-2 sm:grid-cols-3 gap-6">
              <Stat label="Channels" value={String(okChannels.length)} />
              <Stat label="Recent views" value={formatNumber(totalViews)} />
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
            {links.length === 0 ? (
              <Empty text="Add your YouTube channel links above to see each one's latest uploads and views in a single dashboard." />
            ) : error && !data ? (
              <Empty text={error} />
            ) : data === null ? (
              <Loading />
            ) : (
              sorted!.map((c) => (
                <ChannelCard key={c.input} channel={c} onRemove={() => removeChannel(c.input)} />
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

function ChannelCard({ channel, onRemove }: { channel: YtChannel; onRemove: () => void }) {
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
            {channel.ok ? `${formatNumber(recentViews(channel))} views across last ${channel.videos?.length ?? 0}` : channel.error}
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

      {channel.ok && (channel.videos?.length ?? 0) > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {channel.videos!.map((v) => (
            <VideoCard key={v.id} video={v} />
          ))}
        </div>
      )}
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
