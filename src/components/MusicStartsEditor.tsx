import { useEffect, useRef, useState } from 'react';
import { Play, Pause, Flag, RotateCcw, Music, Trash2, Plus, EyeOff, Loader2, Activity } from 'lucide-react';
import { listAllTracks, type MusicListItem, type MusicGender } from '../lib/music';
import { getAllStarts, setStart } from '../lib/musicStarts';
import { getAllDrops, setDrop } from '../lib/musicDrops';
import { addLocalTrack, removeLocalTrack, hideTrack, type MusicScope } from '../lib/localMusic';
import {
  loadTrackBuffer,
  detectBeats,
  detectOnsets,
  detectChanges,
  nearestBeat,
  type BeatBand,
} from '../lib/beatDetect';
import { BeatTimeline } from './BeatTimeline';
import {
  getAllBeats,
  setBeats,
  setBeatList,
  addBeat,
  removeBeatNear,
  setBeatRange,
  beatsInRange,
  rangeDuration,
  type SavedBeats,
} from '../lib/musicBeats';

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
  // Detected beat grids per track, and which track is being analysed right now.
  const [grids, setGrids] = useState<Record<string, SavedBeats>>({});
  const [detecting, setDetecting] = useState<string | null>(null);
  // What the next detection listens to, and whether it looks at the whole track
  // or only the selected range.
  const [band, setBand] = useState<BeatBand>('kick');
  const [source, setSource] = useState<'grid' | 'onsets' | 'changes'>('grid');
  const [trim, setTrim] = useState(false);
  // Why the library came up empty, when it did. Without this the editor showed
  // an empty list for a load failure and for an empty pool alike.
  const [loadError, setLoadError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const reload = () => {
    setStarts(readAll());
    setGrids(getAllBeats());
    return listAllTracks(scope)
      .then((t) => {
        setTracks(t);
        setLoadError(null);
      })
      .catch((e: unknown) => {
        setTracks([]);
        setLoadError(e instanceof Error ? e.message : String(e));
      });
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

  const grid: SavedBeats | undefined = loaded ? grids[loaded.file] : undefined;

  // The window a detection (and the timeline view) is limited to when the user
  // has chosen to work inside their selection.
  const view =
    trim && grid && grid.beats.length
      ? { start: grid.beats[grid.from ?? 0], end: grid.beats[Math.min(grid.to ?? grid.beats.length, grid.beats.length - 1)] }
      : undefined;

  // Analyse the loaded track with the current source/band, over the whole track
  // or just the selected window. The decoded buffer is cached, so re-running
  // with different settings is near-instant after the first pass.
  const detect = async () => {
    if (!loaded) return;
    setDetecting(loaded.file);
    try {
      const buf = await loadTrackBuffer(loaded.url);
      if (!buf) {
        setBeats(loaded.file, null);
        return;
      }
      const opts = { band, from: view?.start, to: view?.end };
      if (source === 'grid') {
        const found = detectBeats(buf, opts);
        if (found) setBeatList(loaded.file, found.beats, { source: 'grid', band, bpm: found.bpm, confidence: found.confidence });
        else setBeats(loaded.file, null);
      } else if (source === 'onsets') {
        setBeatList(loaded.file, detectOnsets(buf, opts), { source: 'onsets', band });
      } else {
        setBeatList(loaded.file, detectChanges(buf, opts), { source: 'changes', band });
      }
      setGrids(getAllBeats());
    } finally {
      setDetecting(null);
    }
  };

  const editBeat = (fn: (file: string, sec: number) => void) => (sec: number) => {
    if (!loaded) return;
    fn(loaded.file, sec);
    setGrids(getAllBeats());
  };

  // Pin the start/drop to a beat rather than to wherever the scrub landed —
  // the whole point of having a grid.
  const saveBeat = (sec: number) => {
    if (!loaded) return;
    savePoint(loaded.file, sec);
    setStarts(readAll());
    if (audioRef.current) audioRef.current.currentTime = sec;
    setTime(sec);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1200);
  };

  // Move the range edge nearest to the playhead onto the current beat, so one
  // control does both ends without a mode switch.
  const setEdge = (edge: 'from' | 'to') => {
    if (!loaded || !grid) return;
    const beat = nearestBeat(grid.beats, time);
    if (beat == null) return;
    const idx = grid.beats.indexOf(beat);
    const from = edge === 'from' ? idx : grid.from ?? 0;
    const to = edge === 'to' ? idx + 1 : grid.to ?? grid.beats.length;
    setBeatRange(loaded.file, from, to);
    setGrids(getAllBeats());
  };

  const clearRange = () => {
    if (!loaded) return;
    setTrim(false);
    setBeatRange(loaded.file, null, null);
    setGrids(getAllBeats());
  };

  // The point shown for a track: the one saved in this browser, else the
  // default pinned in the manifest (listAllTracks already merges the two into
  // start/drop, but `starts` holds the fresher value right after a save).
  const pointOf = (t: MusicListItem): number | undefined =>
    starts[t.file] ?? (mode === 'drop' ? t.drop : t.start);

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
      {(loadError || (!tracks.length && !busy)) && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700">
          {loadError
            ? `Couldn't load the music library: ${loadError}`
            : 'No tracks in this library — check /music/manifest.json, or add files below.'}
        </div>
      )}

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
                  {pointOf(loaded) != null && (
                    <span className="ml-2 text-ink-4">
                      · {copy.at} {fmt(pointOf(loaded)!)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {grid && duration > 0 && (
              <div className="mb-2">
                <BeatTimeline
                  duration={duration}
                  beats={grid.beats}
                  from={grid.from ?? 0}
                  to={grid.to ?? grid.beats.length}
                  point={pointOf(loaded)}
                  viewStart={view?.start}
                  viewEnd={view?.end}
                  getTime={() => audioRef.current?.currentTime ?? 0}
                  onSeek={(sec) => {
                    if (audioRef.current) audioRef.current.currentTime = sec;
                    setTime(sec);
                  }}
                  onPickBeat={saveBeat}
                  onAddBeat={editBeat(addBeat)}
                  onRemoveBeat={editBeat((f, sec) => removeBeatNear(f, sec))}
                />
              </div>
            )}

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
              <button
                type="button"
                onClick={detect}
                disabled={detecting === loaded.file}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-line text-[12px] text-ink-3 hover:bg-raised hover:text-ink-2 transition-colors disabled:opacity-50"
              >
                {detecting === loaded.file ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Activity size={13} />
                )}
                {grid ? 'Re-detect' : 'Detect beats'}
              </button>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value as typeof source)}
                className="h-8 px-2 rounded-lg border border-line bg-card text-[12px] text-ink-2"
                title="What the detection looks for"
              >
                <option value="grid">Beat grid</option>
                <option value="onsets">Hits</option>
                <option value="changes">Section changes</option>
              </select>
              {source !== 'changes' && (
                <select
                  value={band}
                  onChange={(e) => setBand(e.target.value as BeatBand)}
                  className="h-8 px-2 rounded-lg border border-line bg-card text-[12px] text-ink-2"
                  title="Which part of the sound to listen to"
                >
                  <option value="kick">Kick</option>
                  <option value="clap">Claps / snare</option>
                  <option value="hat">Hi-hats</option>
                  <option value="full">Everything</option>
                </select>
              )}
              {pointOf(loaded) != null && (
                <>
                  <button
                    type="button"
                    onClick={() => load(loaded, pointOf(loaded))}
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

            {/* Grid summary + the slice of it a beat-cut video would use. */}
            {grid && (
              <div className="flex items-center gap-2 mt-2 flex-wrap text-[11px] text-ink-5">
                <span className="text-ink-3 font-medium">{grid.bpm} BPM</span>
                <span>· {grid.beats.length} beats</span>
                {grid.confidence < 0.15 && (
                  <span className="text-amber-600">· weak beat — check by hand</span>
                )}
                <span className="ml-1 text-ink-4">
                  · use {beatsInRange(grid).length} beats ({fmt(rangeDuration(grid))})
                </span>
                <button
                  type="button"
                  onClick={() => setEdge('from')}
                  className="h-7 px-2 rounded-lg border border-line text-ink-3 hover:bg-raised hover:text-ink-2 transition-colors"
                >
                  From here
                </button>
                <button
                  type="button"
                  onClick={() => setEdge('to')}
                  className="h-7 px-2 rounded-lg border border-line text-ink-3 hover:bg-raised hover:text-ink-2 transition-colors"
                >
                  To here
                </button>
                {(grid.from != null || grid.to != null) && (
                  <button
                    type="button"
                    onClick={() => setTrim((v) => !v)}
                    className={`h-7 px-2 rounded-lg border transition-colors ${
                      trim
                        ? 'border-ink bg-ink text-bg'
                        : 'border-line text-ink-3 hover:bg-raised hover:text-ink-2'
                    }`}
                    title="Fill the timeline with just the selected part, and detect only inside it"
                  >
                    Zoom to selection
                  </button>
                )}
                {(grid.from != null || grid.to != null) && (
                  <button
                    type="button"
                    onClick={clearRange}
                    className="h-7 px-2 rounded-lg text-ink-5 hover:bg-raised hover:text-ink-2 transition-colors"
                  >
                    Whole track
                  </button>
                )}
              </div>
            )}
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
          pointOf={pointOf}
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
          pointOf={pointOf}
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
  pointOf,
  busy,
  onPlay,
  onRemove,
  onAdd,
}: {
  title: string;
  gender: MusicGender;
  tracks: MusicListItem[];
  loaded: MusicListItem | null;
  // Point shown per track: saved in this browser, else the manifest default.
  pointOf: (t: MusicListItem) => number | undefined;
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
          const start = pointOf(t);
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
