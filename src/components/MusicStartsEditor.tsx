import { useEffect, useRef, useState } from 'react';
import { Play, Pause, Flag, RotateCcw, Music, Trash2, Plus, EyeOff, Loader2, FileJson } from 'lucide-react';
import { listAllTracks, type MusicListItem, type MusicGender } from '../lib/music';
import { getAllStarts, setStart } from '../lib/musicStarts';
import { getAllDrops, setDrop } from '../lib/musicDrops';
import { addLocalTrack, removeLocalTrack, hideTrack, type MusicScope } from '../lib/localMusic';
import { nearestBeat } from '../lib/beatDetect';
import { BeatTimeline } from './BeatTimeline';
import { parseCapCutDraft } from '../lib/capcutDraft';
import { listPlans, savePlan, deletePlan, planLength, planCuts, type BeatPlan } from '../lib/beatPlans';
import {
  getAllBeats,
  setBeats,
  setBeatList,
  addBeat,
  moveBeat,
  removeBeatNear,
  removeBeatsBetween,
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
  // Playback speed. Half speed is the point of it: at 1× the ear can tell a
  // marker is wrong but not by how much, and at 0.5× the gap between the marker
  // and the kick is twice as wide in time and plainly audible — which is how a
  // dragged marker gets placed accurately.
  const [rate, setRate] = useState(1);

  // Whether the timeline shows the whole track or only the selected range.
  const [trim, setTrim] = useState(false);
  const [plans, setPlans] = useState<BeatPlan[]>([]);
  // Why the library came up empty, when it did. Without this the editor showed
  // an empty list for a load failure and for an empty pool alike.
  const [loadError, setLoadError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const reload = () => {
    setStarts(readAll());
    setGrids(getAllBeats());
    setPlans(listPlans());
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

  // Tap the beat with the T key while the track plays — the fastest way to lay
  // a grid by ear. Ignored while typing in a field, so it can't fire from a
  // rename box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 't' && e.key !== 'T') return;
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      const audio = audioRef.current;
      if (!audio || !loaded) return;
      e.preventDefault();
      tapBeat(audio.currentTime);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const load = (t: MusicListItem, seekTo = 0) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (loaded?.file !== t.file) {
      audio.src = t.url;
      setLoaded(t);
    }
    audio.currentTime = seekTo;
    audio.playbackRate = rate;
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

  // What the last CapCut import did (or why it didn't), shown under the beat row.
  const [capcutNote, setCapcutNote] = useState<string | null>(null);
  const capcutRef = useRef<HTMLInputElement>(null);

  const grid: SavedBeats | undefined = loaded ? grids[loaded.file] : undefined;

  // The window a detection (and the timeline view) is limited to when the user
  // has chosen to work inside their selection.
  const view =
    trim && grid && grid.beats.length
      ? { start: grid.beats[grid.from ?? 0], end: grid.beats[Math.min(grid.to ?? grid.beats.length, grid.beats.length - 1)] }
      : undefined;

  // Drop a marker at a moment — the manual equivalent of what detection used
  // to do, and the reason the speed control exists: at 0.5× a person can tap
  // the beat accurately, then drag it those last few milliseconds.
  const tapBeat = (sec: number) => {
    if (!loaded) return;
    addBeat(loaded.file, sec);
    setGrids(getAllBeats());
  };

  // Throw away every marker on this track. The Clear button next to the player
  // only ever cleared the pinned start/drop — there was no way to start the
  // beats over, which read as Clear being broken.
  const clearBeats = () => {
    if (!loaded) return;
    setBeats(loaded.file, null);
    setTrim(false);
    setGrids(getAllBeats());
  };

  // ── Importing a grid from CapCut ─────────────────────────────────────────
  // An edit already cut in CapCut has a hand-marked grid sitting in its
  // draft_info.json, and marking the same song twice is work for nothing. The
  // markers replace this track's grid outright (source 'manual' — they were
  // placed by a person, not detected) and any saved range goes with them, since
  // a range is indexes into the list it was made against.
  //
  // A project CapCut beat-matched itself keeps its markers in a cache file we
  // can't read; for those the CUTS are imported instead, which is the same
  // edit's rhythm read off where it actually cut.
  const importCapCut = async (file: File | null | undefined) => {
    if (!file || !loaded) return;
    setCapcutNote(null);
    try {
      const draft = parseCapCutDraft(await file.text());
      const usedCuts = !draft.beats.length;
      const list = usedCuts ? draft.cuts : draft.beats;
      setBeatList(loaded.file, list, { source: 'manual', bpm: draft.bpm });
      setTrim(false);
      setGrids(getAllBeats());
      const song = draft.audioName ? ` from "${draft.audioName}"` : '';
      setCapcutNote(
        `${list.length} ${usedCuts ? 'cuts' : 'markers'}${song} · ${draft.bpm || '?'} BPM` +
          (usedCuts ? ' — that project had no hand-placed markers, so its cuts were used.' : '') +
          (draft.audioOffset ? ` · project starts ${fmt(draft.audioOffset)} into the song.` : ''),
      );
    } catch (e) {
      setCapcutNote(e instanceof Error ? e.message : String(e));
    }
  };

  const editBeat = (fn: (file: string, sec: number) => void) => (sec: number) => {
    if (!loaded) return;
    fn(loaded.file, sec);
    setGrids(getAllBeats());
  };

  // Snapshot the finished beats + length under a name, so this edit can be
  // recalled later instead of being re-detected and re-trimmed by hand.
  const savePlanNow = () => {
    if (!loaded || !grid) return;
    const name = window.prompt('Name this beat plan', `${prettyName(loaded)} — ${fmt(rangeDuration(grid))}`);
    if (name === null) return;
    savePlan(name, loaded.file, prettyName(loaded), grid);
    setPlans(listPlans());
  };

  // Load a plan back as the working grid for its track.
  const loadPlan = (plan: BeatPlan) => {
    setBeatList(plan.file, plan.beats, {
      source: plan.source,
      band: plan.band,
      bpm: plan.bpm,
    });
    setBeatRange(plan.file, plan.from, plan.to);
    setGrids(getAllBeats());
    const track = tracks.find((t) => t.file === plan.file);
    if (track) load(track, plan.start);
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

            {duration > 0 && (
              <div className="mb-2">
                <BeatTimeline
                  duration={duration}
                  beats={grid?.beats ?? []}
                  from={grid?.from ?? 0}
                  to={grid?.to ?? grid?.beats.length ?? 0}
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
                  onClearSpan={(from, to) => {
                    if (!loaded) return;
                    removeBeatsBetween(loaded.file, from, to);
                    setGrids(getAllBeats());
                  }}
                  onMoveBeat={(from, to) => {
                    if (!loaded) return;
                    moveBeat(loaded.file, from, to);
                    setGrids(getAllBeats());
                  }}
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
                onClick={() => tapBeat(time)}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-line text-[12px] text-ink-3 hover:bg-raised hover:text-ink-2 transition-colors"
                title="Drop a beat marker at the playhead (or press T while it plays)"
              >
                <Plus size={13} /> Beat at {fmt(time)}
              </button>
              <button
                type="button"
                onClick={() => capcutRef.current?.click()}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-line text-[12px] text-ink-3 hover:bg-raised hover:text-ink-2 transition-colors"
                title="Load the beat markers from a CapCut project's draft_info.json"
              >
                <FileJson size={13} /> From CapCut
              </button>
              <input
                ref={capcutRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => {
                  void importCapCut(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <select
                value={rate}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setRate(v);
                  if (audioRef.current) audioRef.current.playbackRate = v;
                }}
                className="h-8 px-2 rounded-lg border border-line bg-card text-[12px] text-ink-2"
                title="Slow the track down to place markers accurately"
              >
                <option value={1}>1× speed</option>
                <option value={0.75}>0.75×</option>
                <option value={0.5}>0.5×</option>
                <option value={0.25}>0.25×</option>
              </select>
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
                    <RotateCcw size={13} /> Clear {copy.verb}
                  </button>
                </>
              )}
            </div>

            {capcutNote && <p className="mt-2 text-[11px] text-ink-5">{capcutNote}</p>}

            {/* Beat summary + the slice of it a beat-cut video would use. */}
            {grid && (
              <div className="flex items-center gap-2 mt-2 flex-wrap text-[11px] text-ink-5">
                <span>{grid.beats.length} beats</span>
                <button
                  type="button"
                  onClick={clearBeats}
                  className="h-7 px-2 rounded-lg border border-line text-ink-3 hover:bg-raised hover:text-ink-2 transition-colors"
                  title="Delete every beat marker on this track"
                >
                  Clear beats
                </button>
                <span className="ml-1 text-ink-4">
                  · use {beatsInRange(grid).length} beats ({fmt(rangeDuration(grid))})
                </span>
                <button
                  type="button"
                  onClick={savePlanNow}
                  className="h-7 px-2 rounded-lg bg-ink text-bg font-medium hover:bg-ink-hover transition-colors"
                  title="Save these beats and this length under a name"
                >
                  Save plan
                </button>
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

      {/* Saved beat plans */}
      {plans.length > 0 && (
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] font-medium text-ink-3 mb-2">Saved beat plans</div>
          <div className="space-y-1">
            {plans.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-raised transition-colors"
              >
                <button
                  type="button"
                  onClick={() => loadPlan(p)}
                  className="min-w-0 flex-1 text-left"
                  title="Load these beats back onto the track"
                >
                  <div className="text-[12px] text-ink truncate">{p.name}</div>
                  <div className="text-[10px] text-ink-5 truncate">
                    {p.trackName} · {fmt(planLength(p))} · {planCuts(p)} cuts
                    {p.bpm > 0 && ` · ${p.bpm} BPM`}
                    {p.band && ` · ${p.band}`}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    deletePlan(p.id);
                    setPlans(listPlans());
                  }}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-5 hover:bg-bg hover:text-ink-2 transition-colors"
                  aria-label={`Delete ${p.name}`}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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
