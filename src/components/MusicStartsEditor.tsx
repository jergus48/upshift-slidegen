import { useEffect, useRef, useState } from 'react';
import { Play, Pause, Flag, RotateCcw, Music } from 'lucide-react';
import { listAllTracks, type MusicListItem } from '../lib/music';
import { getAllStarts, setStart } from '../lib/musicStarts';

// Strip the extension and any leading "artist -" noise for a compact label.
function prettyName(file: string): string {
  return file.replace(/\.(mp3|m4a|wav)$/i, '');
}

function fmt(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// The "Video music" dashboard: audition every track and pin the exact second
// each one should start from in exported videos. Saved per-track in the browser;
// overrides both the manifest's start and the exporter's auto-detection.
export function MusicStartsEditor() {
  const [tracks, setTracks] = useState<MusicListItem[]>([]);
  const [loaded, setLoaded] = useState<MusicListItem | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [starts, setStarts] = useState<Record<string, number>>({});
  const [savedFlash, setSavedFlash] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    listAllTracks().then(setTracks).catch(() => setTracks([]));
    setStarts(getAllStarts());
  }, []);

  const load = (t: MusicListItem, seekTo = 0) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (loaded?.file !== t.file) {
      audio.src = t.url;
      setLoaded(t);
    }
    audio.currentTime = seekTo;
    void audio.play();
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !loaded) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  };

  const saveHere = () => {
    if (!loaded) return;
    setStart(loaded.file, time);
    setStarts(getAllStarts());
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1200);
  };

  const clearStart = (file: string) => {
    setStart(file, null);
    setStarts(getAllStarts());
  };

  const male = tracks.filter((t) => t.gender === 'male');
  const female = tracks.filter((t) => t.gender === 'female');

  if (!tracks.length) {
    return (
      <p className="text-[12px] text-ink-5">
        No tracks configured yet. Add MP3s under <code className="text-ink-4">public/music/</code> and list
        them in <code className="text-ink-4">manifest.json</code>.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <audio
        ref={audioRef}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={() => setPlaying(false)}
      />

      {/* Player bar for the loaded track */}
      <div className="rounded-xl border border-line bg-card p-3">
        {loaded ? (
          <>
            <div className="flex items-center gap-2 mb-2">
              <button
                type="button"
                onClick={togglePlay}
                className="w-9 h-9 rounded-full bg-ink text-bg flex items-center justify-center shrink-0 hover:bg-ink-hover transition-colors"
                aria-label={playing ? 'Pause' : 'Play'}
              >
                {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
              </button>
              <div className="min-w-0">
                <div className="text-[12px] font-medium text-ink truncate">{prettyName(loaded.file)}</div>
                <div className="text-[11px] text-ink-5">
                  {fmt(time)} / {fmt(duration)}
                  {starts[loaded.file] != null && (
                    <span className="ml-2 text-ink-4">· starts at {fmt(starts[loaded.file])}</span>
                  )}
                </div>
              </div>
            </div>

            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={time}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (audioRef.current) audioRef.current.currentTime = v;
                setTime(v);
              }}
              className="w-full accent-ink"
            />

            <div className="flex items-center gap-2 mt-2">
              <button
                type="button"
                onClick={saveHere}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-ink text-bg text-[12px] font-medium hover:bg-ink-hover transition-colors"
              >
                <Flag size={13} />
                {savedFlash ? 'Saved!' : `Set start = ${fmt(time)}`}
              </button>
              {starts[loaded.file] != null && (
                <>
                  <button
                    type="button"
                    onClick={() => load(loaded, starts[loaded.file])}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-line text-[12px] text-ink-3 hover:bg-raised hover:text-ink-2 transition-colors"
                  >
                    <Play size={13} /> Preview from start
                  </button>
                  <button
                    type="button"
                    onClick={() => clearStart(loaded.file)}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-transparent text-[12px] text-ink-5 hover:bg-raised hover:text-ink-2 transition-colors"
                  >
                    <RotateCcw size={13} /> Clear
                  </button>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 text-[12px] text-ink-5 py-1">
            <Music size={14} /> Pick a track below, scrub to the drop, then hit “Set start”.
          </div>
        )}
      </div>

      {/* Track lists */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TrackColumn title="Male pool" tracks={male} loaded={loaded} starts={starts} onPlay={load} />
        <TrackColumn title="Female pool" tracks={female} loaded={loaded} starts={starts} onPlay={load} />
      </div>
    </div>
  );
}

function TrackColumn({
  title,
  tracks,
  loaded,
  starts,
  onPlay,
}: {
  title: string;
  tracks: MusicListItem[];
  loaded: MusicListItem | null;
  starts: Record<string, number>;
  onPlay: (t: MusicListItem, seekTo?: number) => void;
}) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-ink-5 uppercase tracking-wider mb-1.5">
        {title} <span className="text-ink-6">({tracks.length})</span>
      </div>
      <div className="rounded-xl border border-line divide-y divide-line overflow-hidden">
        {tracks.map((t) => {
          const active = loaded?.file === t.file;
          const start = starts[t.file];
          return (
            <button
              key={t.file}
              type="button"
              onClick={() => onPlay(t, start ?? 0)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                active ? 'bg-raised' : 'hover:bg-raised/60'
              }`}
            >
              <Play size={12} className="text-ink-5 shrink-0" />
              <span className="text-[12px] text-ink-3 truncate flex-1">{prettyName(t.file)}</span>
              {start != null && (
                <span className="text-[10px] text-ink-4 bg-card border border-line rounded px-1.5 py-0.5 shrink-0">
                  {fmt(start)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
