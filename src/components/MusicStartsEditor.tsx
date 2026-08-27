import { useEffect, useRef, useState } from 'react';
import { Play, Pause, Flag, RotateCcw, Music, Trash2, Plus, EyeOff, Loader2 } from 'lucide-react';
import { listAllTracks, type MusicListItem, type MusicGender } from '../lib/music';
import { getAllStarts, setStart } from '../lib/musicStarts';
import { getAllDrops, setDrop } from '../lib/musicDrops';
import { addLocalTrack, removeLocalTrack, hideTrack, type MusicScope } from '../lib/localMusic';

// Strip the extension and any leading "artist -" noise for a compact label.
function prettyName(t: MusicListItem): string {
  return (t.name ?? t.file).replace(/\.(mp3|m4a|wav|ogg)$/i, '');
}

function fmt(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// What a pinned second means, and how it reads in the UI. 'start' is the normal
// exporter behaviour (playback opens there); 'drop' is the Characters mode,
// where the second is the moment that has to be HEARD on the before→after cut —
// the exporter starts the track that far ahead of it (see lib/musicDrops.ts).
export type PointMode = 'start' | 'drop';

const COPY = {
  start: {
    verb: 'start',
    at: 'starts at',
    hint: 'Pick a track below, scrub to the drop, then hit “Set start”.',
    preview: 'Preview from start',
  },
  drop: {
    verb: 'drop',
    at: 'drop at',
    hint: 'Pick a track below, scrub to the drop, then hit “Set drop”.',
    preview: 'Preview from drop',
  },
} as const;

// The "Video music" dashboard: audition every track, pin the exact second each
// starts from in exported videos, and add/remove tracks locally. Saved per-track
// in the browser; overrides the manifest start and the exporter's auto-detection.
// With mode="drop" the same UI pins Characters drop points instead.
export function MusicStartsEditor({ mode = 'start' }: { mode?: PointMode } = {}) {
  const copy = COPY[mode];
  // Each editor is its own library: hiding a song here must not touch the other.
  const scope: MusicScope = mode === 'drop' ? 'characters' : 'video';
  const readAll = mode === 'drop' ? getAllDrops : getAllStarts;
  const savePoint = mode === 'drop' ? setDrop : setStart;
  const [tracks, setTracks] = useState<MusicListItem[]>([]);
  const [loaded, setLoaded] = useState<MusicListItem | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [starts, setStarts] = useState<Record<string, number>>({});
  const [savedFlash, setSavedFlash] = useState(false);
  const [busy, setBusy] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const reload = () => {
    setStarts(readAll());
    return listAllTracks(scope).then(setTracks).catch(() => setTracks([]));
  };

  useEffect(() => {
    void reload();
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
    savePoint(loaded.file, time);
    setStarts(readAll());
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1200);
  };

  const clearStart = (file: string) => {
    savePoint(file, null);
    setStarts(readAll());
  };

  const addFiles = async (gender: MusicGender, files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        try {
          await addLocalTrack(gender, file);
        } catch {
          /* skip non-audio */
        }
      }
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const removeTrack = async (t: MusicListItem) => {
    // Only the video library deletes an upload for real; everywhere else the
    // track is just hidden from THIS library, in this browser.
    if (t.local && scope === 'video') await removeLocalTrack(t.file);
    else hideTrack(t.file, scope);
    clearStart(t.file);
    if (loaded?.file === t.file) {
      audioRef.current?.pause();
      setLoaded(null);
    }
    await reload();
  };

  const male = tracks.filter((t) => t.gender === 'male');
  const female = tracks.filter((t) => t.gender === 'female');

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
                <div className="text-[12px] font-medium text-ink truncate">{prettyName(loaded)}</div>
                <div className="text-[11px] text-ink-5">
                  {fmt(time)} / {fmt(duration)}
                  {starts[loaded.file] != null && (
                    <span className="ml-2 text-ink-4">
                      · {copy.at} {fmt(starts[loaded.file])}
                    </span>
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

            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <button
                type="button"
                onClick={saveHere}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-ink text-bg text-[12px] font-medium hover:bg-ink-hover transition-colors"
              >
                <Flag size={13} />
                {savedFlash ? 'Saved!' : `Set ${copy.verb} = ${fmt(time)}`}
              </button>
              {starts[loaded.file] != null && (
                <>
                  <button
                    type="button"
                    onClick={() => load(loaded, starts[loaded.file])}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-line text-[12px] text-ink-3 hover:bg-raised hover:text-ink-2 transition-colors"
                  >
                    <Play size={13} /> {copy.preview}
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
            <Music size={14} /> {copy.hint}
          </div>
        )}
      </div>

      {/* Track lists */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TrackColumn
          title="Male pool"
          gender="male"
          tracks={male}
          loaded={loaded}
          starts={starts}
          busy={busy}
          onPlay={load}
          onRemove={removeTrack}
          onAdd={addFiles}
        />
        <TrackColumn
          title="Female pool"
          gender="female"
          tracks={female}
          loaded={loaded}
          starts={starts}
          busy={busy}
          onPlay={load}
          onRemove={removeTrack}
          onAdd={addFiles}
        />
      </div>
    </div>
  );
}

function TrackColumn({
  title,
  gender,
  tracks,
  loaded,
  starts,
  busy,
  onPlay,
  onRemove,
  onAdd,
}: {
  title: string;
  gender: MusicGender;
  tracks: MusicListItem[];
  loaded: MusicListItem | null;
  starts: Record<string, number>;
  busy: boolean;
  onPlay: (t: MusicListItem, seekTo?: number) => void;
  onRemove: (t: MusicListItem) => void;
  onAdd: (gender: MusicGender, files: FileList | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[11px] font-semibold text-ink-5 uppercase tracking-wider">
          {title} <span className="text-ink-6">({tracks.length})</span>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-1 h-6 px-2 rounded-md border border-line text-[11px] text-ink-4 hover:bg-raised hover:text-ink-2 transition-colors disabled:opacity-50"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Add MP3
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*,.mp3,.m4a,.wav,.ogg"
          multiple
          hidden
          onChange={(e) => {
            onAdd(gender, e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      <div className="rounded-xl border border-line divide-y divide-line overflow-hidden">
        {tracks.length === 0 && (
          <div className="px-3 py-3 text-[11px] text-ink-6">No tracks. Add an MP3 to this pool.</div>
        )}
        {tracks.map((t) => {
          const active = loaded?.file === t.file;
          const start = starts[t.file];
          return (
            <div
              key={t.file}
              className={`flex items-center gap-2 px-2 pl-3 transition-colors ${active ? 'bg-raised' : 'hover:bg-raised/60'}`}
            >
              <button
                type="button"
                onClick={() => onPlay(t, start ?? 0)}
                className="flex items-center gap-2 py-2 text-left min-w-0 flex-1"
              >
                <Play size={12} className="text-ink-5 shrink-0" />
                <span className="text-[12px] text-ink-3 truncate">{prettyName(t)}</span>
                {t.local && (
                  <span className="text-[9px] text-ink-5 bg-card border border-line rounded px-1 py-0.5 shrink-0">
                    local
                  </span>
                )}
              </button>
              {start != null && (
                <span className="text-[10px] text-ink-4 bg-card border border-line rounded px-1.5 py-0.5 shrink-0">
                  {fmt(start)}
                </span>
              )}
              <button
                type="button"
                onClick={() => onRemove(t)}
                title={t.local ? 'Delete this uploaded track' : 'Hide this track in this browser'}
                aria-label="Remove track"
                className="w-6 h-6 rounded-md flex items-center justify-center text-ink-6 hover:text-red-600 hover:bg-raised transition-colors shrink-0"
              >
                {t.local ? <Trash2 size={13} /> : <EyeOff size={13} />}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
