import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Clapperboard, Download, Music, RefreshCw, Sparkles, UserRound } from 'lucide-react';
import { ViewHeader } from '../components/ViewHeader';
import { Button } from '../components/Button';
import { getMergedLibrary } from '../lib/mergedLibrary';
import { getCharacters, STREAKS, subscribeCharacters, variantOf, type Character } from '../lib/characters';
import { HOOKS, fillHook, hookUsesStreak } from '../lib/transformationHooks';
import { usableStreaksIn } from '../lib/transformationDeck';
import { buildBeatPlan, planPhases, type BeatPlan, type BeatPlanOptions, type PlanPhase } from '../lib/beatPlan';
import {
  buildVideo,
  listReadyTracks,
  missingVideoPieces,
  VIDEO_STYLES,
  type ReadyTrack,
  type VideoStyle,
} from '../lib/videoAutomation';
import { beatVideoFileName, downloadBlob, renderBeatVideo, SFX_LEAD } from '../lib/beatVideo';
import { addQueuedVideo } from '../lib/localVideos';
import { createZip, type ZipEntry } from '../lib/zip';
import { makeCaptionPicker } from '../lib/transformationCaptions';
import { videoMetaJsonFrom } from '../lib/render';
import type { CaptionStyle } from '../lib/captionStyle';
import type { LibraryImage } from '../types';

const COUNT_OPTIONS = [1, 3, 5, 10];

// A batch bigger than this is a mistake rather than an intent: every video is
// recorded in real time, so 30 of them is already the better part of an hour.
// This is the cap on the WHOLE batch, not on one character's share of it —
// "30 each" across four characters is 120 videos and most of a working day,
// which is never what anyone meant by picking 30.
const MAX_PER_BATCH = 30;

// One queued render.
interface Job {
  id: string;
  label: string;
  stage?: string;
  progress?: number;
  error?: string;
  result?: Blob;
  resultUrl?: string;
  name?: string;
  // The .json metadata sidecar that goes out beside the file — built once,
  // when the video is.
  sidecar?: string;
}

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// The caption font picker — the same two looks the Characters generator offers.
const FONT_OPTIONS = [
  { key: 'app', label: 'App default', hint: 'Inter, thin outline', family: 'Inter, sans-serif', weight: 800, stroke: '0.6px black' },
  { key: 'tiktok', label: 'TikTok', hint: 'Classic caption look', family: "'Poppins', 'Helvetica Neue', Arial, sans-serif", weight: 600, stroke: '2px black' },
] as const;

// The four numbers that shape the edit, as a compact row of steppers.

// `onQueued` is how the Video tab hands over: the same move the Characters tab
// makes after a generation, jumping to the Queue with the new work already in
// it rather than leaving the user to go looking for it.
export function VideoView({ onQueued }: { onQueued?: () => void }) {
  const [characters, setCharacters] = useState<Character[]>(() => getCharacters());
  const [library, setLibrary] = useState<LibraryImage[]>([]);
  const [tracks, setTracks] = useState<ReadyTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [count, setCount] = useState(1);
  const [streakKey, setStreakKey] = useState('');
  const [hookTemplate, setHookTemplate] = useState('');
  // '' = rolled per video, the same convention as the streak and hook pickers.
  // Rolling is the default deliberately: a batch then spreads itself over the
  // styles, which is the only way to compare them on the same characters and
  // the same songs.
  const [style, setStyle] = useState<VideoStyle | ''>('');
  // A track's name, or '' to roll one per video. Names are unique across the
  // ready pool — a format's carries its label — so they double as the key.
  const [trackName, setTrackName] = useState('');
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>('app');
  // Motion blur, on or off — nothing in between. The four strengths that used
  // to be here were a false choice: light is too subtle to see on a 0.3s cut,
  // and the two heavy settings smear far enough to read as a mistake. It is on
  // by default because with the blend engine it adds only seconds to a render.
  const [motionBlur, setMotionBlur] = useState(true);
  const [dropSfx, setDropSfx] = useState(true);
  // Always the automatic shape now: the sliders that used to override these
  // counts are gone. buildBeatPlan sizes every phase from the markers.
  const plan: BeatPlanOptions = {};
  const [jobs, setJobs] = useState<Job[]>([]);
  const [rendering, setRendering] = useState(false);
  // Which finished renders are ticked for a bulk save — the same move the Queue
  // offers on slideshows.
  const [pickedJobs, setPickedJobs] = useState<string[]>([]);
  const [zipping, setZipping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const load = useCallback(
    () =>
      Promise.all([getMergedLibrary(true), listReadyTracks()])
        .then(([imgs, ts]) => {
          setLibrary(imgs);
          setTracks(ts);
        })
        .catch(() => setError('Could not load the library.'))
        .finally(() => setLoading(false)),
    []
  );

  useEffect(() => { load(); }, [load]);

  useEffect(() => subscribeCharacters(() => setCharacters(getCharacters())), []);

  const reload = () => {
    setLoading(true);
    load();
  };

  // Which characters can actually be rendered — the same "ready" idea the
  // Characters tab uses, extended with the clips this tool needs.
  const readiness = useMemo(
    () => new Map(characters.map((c) => [c.id, missingVideoPieces(c, library, style)])),
    [characters, library]
  );
  const runnable = selected.filter((id) => (readiness.get(id) || ['unknown']).length === 0);
  // What the batch will actually render: the cap bites on the total, so asking
  // for 30 each across three characters renders 30, not 90.
  const plannedTotal = Math.min(runnable.length * count, MAX_PER_BATCH);
  const cappedBatch = runnable.length * count > MAX_PER_BATCH;

  // The structure strip: the real plan for the first ready track, so the cards
  // show the actual cut counts and timings rather than a guess.
  type Preview = { plan: BeatPlan; phases: PlanPhase[] } | { error: string } | null;
  const preview = useMemo((): Preview => {
    if (!tracks.length) return null;
    try {
      // A rolled style can't be previewed — it differs per video — so the strip
      // shows the showcase shape, which is the only one that changes the plan.
      // The other two produce the plan already on screen.
      const built = buildBeatPlan(tracks[0].beats, tracks[0].drop, {
        shape: tracks[0].shape,
        fills: tracks[0].fills,
        gaps: tracks[0].gaps,
        ...plan,
        stats: style === '' || style === 'showcase',
      });
      return { plan: built, phases: planPhases(built) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [tracks, plan, style]);

  const previewStreak =
    (streakKey ? STREAKS.find((s) => s.key === streakKey) : undefined) ?? STREAKS[STREAKS.length - 1];

  // Every streak with a package for at least one selected character — the same
  // rule the Characters tab applies.
  const usableStreaks = useMemo(() => {
    const variant = characters.find((c) => selected.includes(c.id));
    return usableStreaksIn(library, variant ? variantOf(variant) : '');
  }, [characters, selected, library]);

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  // The finished renders, and the subset ticked for a bulk save.
  const finishedJobs = jobs.filter((j) => j.result && j.name);
  const pickedFinished = finishedJobs.filter((j) => pickedJobs.includes(j.id));
  const allPicked = finishedJobs.length > 0 && pickedFinished.length === finishedJobs.length;

  const toggleJob = (id: string) =>
    setPickedJobs((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const toggleAllJobs = () =>
    setPickedJobs(allPicked ? [] : finishedJobs.map((j) => j.id));

  // One zip of every ticked render. Stored, not deflated — the video is already
  // compressed, so squeezing it again would only cost time.
  const downloadPicked = async () => {
    setZipping(true);
    try {
      const entries: ZipEntry[] = [];
      const seen = new Map<string, number>();
      for (const j of pickedFinished) {
        // Two videos of the same character in the same style land on the same
        // filename; a zip with duplicate names loses all but one of them.
        const dot = j.name!.lastIndexOf('.');
        const stem = dot > 0 ? j.name!.slice(0, dot) : j.name!;
        const ext = dot > 0 ? j.name!.slice(dot) : '';
        const seenCount = seen.get(j.name!) ?? 0;
        seen.set(j.name!, seenCount + 1);
        const name = seenCount ? `${stem}-${seenCount + 1}${ext}` : j.name!;
        entries.push({ name, data: new Uint8Array(await j.result!.arrayBuffer()) });
        // The metadata sidecar beside it, same stem — the same pairing a
        // slideshow video export ships. JSON, not .txt: the genScript uploaders
        // read a video's caption ONLY from a like-named .json.
        if (j.sidecar) {
          entries.push({
            name: `${seenCount ? `${stem}-${seenCount + 1}` : stem}.json`,
            data: new TextEncoder().encode(j.sidecar),
          });
        }
      }
      const url = URL.createObjectURL(createZip(entries));
      const a = document.createElement('a');
      a.href = url;
      a.download = `slidesmith-videos-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setZipping(false);
    }
  };

  const run = async () => {
    setError(null);
    setDone(false);
    setRendering(true);
    // Each video gets its own track out of the ready pool, so a batch isn't all
    // cut to one song.
    let n = 0;
    let queued = 0;
    // One dealer for the whole batch, so thirty videos work through every
    // caption line instead of rolling the same one repeatedly.
    const captionPicker = makeCaptionPicker();
    try {
      outer: for (const id of runnable) {
        const character = characters.find((c) => c.id === id)!;
        for (let i = 0; i < count; i++) {
          // The cap is on the batch, so it has to be checked here, where the
          // videos are actually counted — `count` alone can't see how many
          // characters are selected.
          if (n >= MAX_PER_BATCH) break outer;
          const jobId = `job-${Date.now()}-${n++}`;
          const track =
            tracks.find((t) => t.name === trackName) ?? tracks[Math.floor(Math.random() * tracks.length)];
          setJobs((js) => [...js, { id: jobId, label: `${character.name} · ${track.name}`, stage: 'Building…' }]);
          try {
            const build = buildVideo(character, library, track, {
              ...plan,
              streakKey,
              hookTemplate,
              style,
              captions: captionPicker,
            });
            const styleLabel = VIDEO_STYLES.find((x) => x.key === build.style)?.label ?? build.style;
            setJobs((js) =>
              js.map((j) => (j.id === jobId ? { ...j, label: `${build.title} · ${styleLabel}` } : j))
            );
            const blob = await renderBeatVideo(build.plan, build.assets, build.captions, { url: track.item.url }, {
              captionStyle,
              motionBlur: motionBlur ? 'medium' : undefined,
              sfx: dropSfx ? undefined : false,
              onStage: (stage) => setJobs((js) => js.map((j) => (j.id === jobId ? { ...j, stage } : j))),
              onProgress: (p) => setJobs((js) => js.map((j) => (j.id === jobId ? { ...j, progress: p } : j))),
            });
            const name = beatVideoFileName(build.title, blob);
            const resultUrl = URL.createObjectURL(blob);
            const sidecar = videoMetaJsonFrom(build.hook, build.caption, build.hashtags);
            setJobs((js) =>
              js.map((j) => (j.id === jobId ? { ...j, result: blob, resultUrl, name, sidecar, stage: undefined } : j))
            );
            // Ticked as it lands, so a finished batch is already staged for one
            // zip — untick the few you don't want rather than tick the 29 you do.
            setPickedJobs((p) => [...p, jobId]);
            // Onto the Queue, where it is reviewed and approved like anything
            // else. The row here stays too — it is the render log, not the
            // deliverable, and it is useful to see what a batch did while the
            // batch is still running.
            //
            // A storage failure is reported ON THE ROW rather than thrown: the
            // video exists, the render was not wasted, and the row's own
            // Download still works. Losing the rest of the batch over a full
            // disk would be the worse outcome.
            try {
              await addQueuedVideo(
                {
                  name,
                  title: build.title,
                  characterId: character.id,
                  characterName: character.name,
                  trackName: track.name,
                  style: build.style,
                  duration: build.plan.duration,
                  folderId: character.folderId || '',
                  hook: build.hook,
                  caption: build.caption,
                  hashtags: build.hashtags,
                },
                blob,
              );
              queued++;
            } catch (e) {
              setJobs((js) =>
                js.map((j) =>
                  j.id === jobId
                    ? { ...j, error: `Rendered, but couldn't be added to the Queue — ${e instanceof Error ? e.message : String(e)}. Download it here instead.` }
                    : j
                )
              );
            }
          } catch (e) {
            setJobs((js) =>
              js.map((j) =>
                j.id === jobId ? { ...j, stage: undefined, error: e instanceof Error ? e.message : String(e) } : j
              )
            );
          }
        }
      }
      setDone(true);
      // Only hand over if something actually landed — a batch where every
      // render failed should leave the user on the errors, not on an empty
      // Queue.
      if (queued) onQueued?.();
    } finally {
      setRendering(false);
    }
  };

  return (
    <>
      <ViewHeader
        title="Video"
        subtitle="The same characters, cut to music instead of swiped. Photos chop on every marker, the app screenshots punch twice a marker into the drop, and on the drop it switches to that character's own clips — all on the beats you marked in Brain. Pin a drop there too if you want to choose where the clips start; otherwise it lands about 7s in."
        right={
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw size={12} className={loading ? 'animate-spin' : ''} />}
            onClick={reload}
            disabled={loading || rendering}
          >
            Reload
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-8">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* The structure */}
          <div>
            <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-2 block">
              The order
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(preview && 'phases' in preview ? preview.phases : []).map((p, i) => (
                <div key={`${p.label}-${i}`} className="bg-card border border-line rounded-xl px-3 py-2">
                  <div className="text-[12px] font-medium text-ink">{p.label}</div>
                  <div className="text-[10px] text-ink-6 leading-tight mt-0.5">{p.hint}</div>
                  <div className="text-[10px] text-ink-5 tabular-nums mt-1">
                    {fmtTime(p.from)} – {fmtTime(p.to)} · {p.cuts} cut{p.cuts === 1 ? '' : 's'}
                  </div>
                </div>
              ))}
              {!preview &&
                ['Chopped', 'App screenshots', 'Clips'].map((label) => (
                  <div key={label} className="bg-card border border-line rounded-xl px-3 py-2">
                    <div className="text-[12px] font-medium text-ink">{label}</div>
                    <div className="text-[10px] text-ink-6 leading-tight mt-0.5">
                      timings appear once a track has a drop and a beat grid
                    </div>
                  </div>
                ))}
            </div>
            {preview && 'plan' in preview && (
              <p className="text-[11px] text-ink-6 mt-2">
                {fmtTime(preview.plan.duration)} long, the drop at {fmtTime(preview.plan.dropAt)}, {preview.plan.segments.length} cuts,{' '}
                {preview.plan.clipCount} clip slot{preview.plan.clipCount === 1 ? '' : 's'}. Every cut lands on a beat, so
                the length comes from the track — not from how many photos a pack holds.
              </p>
            )}
            {preview && 'error' in preview && <p className="text-[12px] text-amber-600 mt-2">{preview.error}</p>}
          </div>

          {/* Music readiness */}
          <div className="bg-card border border-line rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Music size={14} className="text-ink-5" />
              <h2 className="text-[13px] font-semibold text-ink">Character music</h2>
              <span className="text-[11px] text-ink-6">
                {tracks.length ? `${tracks.length} track${tracks.length === 1 ? '' : 's'} ready` : 'none ready'}
              </span>
            </div>
            {tracks.length === 0 ? (
              <p className="text-[12px] text-ink-5">
                A track is usable here once it has BOTH a drop and a beat grid saved in Brain → Characters music. The drop
                is where the clips take over; the grid is what every cut lands on.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {tracks.map((t) => (
                  <span
                    key={t.item.file}
                    className="text-[11px] text-ink-5 bg-raised border border-line rounded-lg px-2 py-1 tabular-nums"
                  >
                    {t.name} · drop {t.drop.toFixed(1)}s · {t.beats.length} beats
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Characters */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-[13px] font-semibold text-ink">Characters</h2>
              <span className="text-[11px] text-ink-6">
                {characters.length ? `${runnable.length}/${selected.length || characters.length} ready` : 'none yet'}
              </span>
            </div>

            {characters.length === 0 && (
              <div className="bg-card border border-line rounded-xl p-8 text-center">
                <UserRound size={20} className="mx-auto text-ink-6" />
                <p className="text-[12px] text-ink-5 mt-2">
                  Add a character in the Characters tab first — this tool renders the packages picked there, clips
                  included.
                </p>
              </div>
            )}

            {characters.map((c) => {
              const missing = readiness.get(c.id) || [];
              const isSelected = selected.includes(c.id);
              return (
                <label
                  key={c.id}
                  className={`bg-card border rounded-xl p-4 flex items-center gap-3 cursor-pointer transition-colors ${
                    isSelected ? 'border-ink' : 'border-line'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={rendering}
                    onChange={() => toggle(c.id)}
                    className="w-4 h-4 accent-ink"
                  />
                  <span className="text-[13px] font-medium text-ink">{c.name}</span>
                  <span className={`text-[11px] ${missing.length ? 'text-amber-600' : 'text-ink-6'}`}>
                    {missing.length ? `missing ${missing.join(', ')}` : 'ready'}
                  </span>
                </label>
              );
            })}
          </div>

          {/* The edit */}
          <div className="bg-card border border-line rounded-xl p-4 space-y-5">
            <div>
              <h2 className="text-[13px] font-semibold text-ink">Motion blur</h2>
              <p className="text-[11px] text-ink-6">
                The edit itself is built from the beats you marked in Brain — photos on every
                marker, screenshots into the drop, clips from the drop on. Nothing to set.
              </p>
            </div>
            <label className="flex items-center gap-2.5 pt-1 cursor-pointer select-none">
              <button
                type="button"
                role="switch"
                aria-checked={motionBlur}
                disabled={rendering}
                onClick={() => setMotionBlur((v) => !v)}
                className={`relative w-9 h-5 rounded-full transition-colors disabled:opacity-50 ${
                  motionBlur ? 'bg-ink' : 'bg-line-2'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-bg transition-[left] ${
                    motionBlur ? 'left-[18px]' : 'left-0.5'
                  }`}
                />
              </button>
              <span className="text-[12px] text-ink-2">Motion blur</span>
              <span className="text-[11px] text-ink-6">
                {motionBlur ? 'on — 540° shutter' : 'off'}
              </span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <button
                type="button"
                role="switch"
                aria-checked={dropSfx}
                disabled={rendering}
                onClick={() => setDropSfx((v) => !v)}
                className={`relative w-9 h-5 rounded-full transition-colors disabled:opacity-50 ${
                  dropSfx ? 'bg-ink' : 'bg-line-2'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-bg transition-[left] ${
                    dropSfx ? 'left-[18px]' : 'left-0.5'
                  }`}
                />
              </button>
              <span className="text-[12px] text-ink-2">Drop sound</span>
              <span className="text-[11px] text-ink-6">
                {dropSfx
                  ? SFX_LEAD > 0
                    ? `on — ${SFX_LEAD}s before the drop`
                    : 'on — lands on the drop'
                  : 'off'}
              </span>
            </label>

          </div>

          {/* Generate */}
          <div className="bg-card border border-line rounded-xl p-4 space-y-5 max-w-lg">
            <div>
              <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 block">
                Videos per character
              </label>
              <div className="flex items-center gap-2">
                {COUNT_OPTIONS.map((n) => (
                  <button
                    key={n}
                    onClick={() => setCount(n)}
                    disabled={rendering}
                    className={`w-12 h-9 rounded-lg border text-[13px] font-medium transition-colors disabled:opacity-50 ${
                      count === n ? 'border-ink bg-ink text-bg' : 'border-line bg-card text-ink-5 hover:border-line-2'
                    }`}
                  >
                    {n}
                  </button>
                ))}
                {/* Any number up to the cap, for the batches the presets don't
                    cover. Clamped on blur rather than on every keystroke, so
                    typing "12" doesn't fight you after the "1". */}
                <input
                  type="number"
                  min={1}
                  max={MAX_PER_BATCH}
                  value={count}
                  disabled={rendering}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n)) setCount(Math.min(MAX_PER_BATCH, Math.max(0, Math.floor(n))));
                  }}
                  onBlur={() => setCount((c) => Math.min(MAX_PER_BATCH, Math.max(1, c || 1)))}
                  aria-label={`Videos per character, up to ${MAX_PER_BATCH}`}
                  className={`w-16 h-9 rounded-lg border bg-card px-2 text-[13px] font-medium text-center outline-none transition-colors disabled:opacity-50 focus:border-ink-7 focus:ring-2 focus:ring-ink/10 ${
                    COUNT_OPTIONS.includes(count) ? 'border-line text-ink-5' : 'border-ink text-ink'
                  }`}
                />
                <span className="text-[11px] text-ink-6">max {MAX_PER_BATCH}</span>
              </div>
              {cappedBatch && (
                <p className="text-[11px] text-amber-600 mt-1.5">
                  {runnable.length} characters × {count} is {runnable.length * count} videos — capped at{' '}
                  {MAX_PER_BATCH} for this batch. Run it again for the rest.
                </p>
              )}
            </div>

            <div>
              <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 block">
                Style
              </label>
              <select
                value={style}
                disabled={rendering}
                onChange={(e) => setStyle(e.target.value as VideoStyle | '')}
                className="w-full h-9 bg-bg border border-line rounded-lg px-2.5 text-[13px] text-ink outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10 disabled:opacity-50"
              >
                <option value="">Random per video</option>
                {VIDEO_STYLES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label} — {s.hint}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-ink-6 mt-1">
                {style === 'showcase'
                  ? 'Needs both Stats packages on the character — one held into the drop, one closing. Stills or short clips.'
                  : style
                    ? VIDEO_STYLES.find((x) => x.key === style)?.hint
                    : 'Each video rolls its own, out of the styles that character can do. Showcase only comes up for characters that have both Stats packages.'}
              </p>
            </div>

            <div>
              <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 block">
                Song
              </label>
              <select
                value={trackName}
                disabled={rendering}
                onChange={(e) => setTrackName(e.target.value)}
                className="w-full h-9 bg-bg border border-line rounded-lg px-2.5 text-[13px] text-ink outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10 disabled:opacity-50"
              >
                <option value="">Random per video</option>
                {tracks.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-ink-6 mt-1">
                Out of the character tracks with a drop and a beat grid, and the formats cut to them.
              </p>
            </div>

            <div>
              <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 block">
                Streak
              </label>
              <select
                value={streakKey}
                disabled={rendering}
                onChange={(e) => setStreakKey(e.target.value)}
                className="w-full h-9 bg-bg border border-line rounded-lg px-2.5 text-[13px] text-ink outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10 disabled:opacity-50"
              >
                <option value="">Random per video</option>
                {usableStreaks.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-ink-6 mt-1">
                Picks the streak screenshots and fills the “{previewStreak.label} clean” line the clips carry.
              </p>
            </div>

            <div>
              <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 block">
                Hook
              </label>
              <select
                value={hookTemplate}
                disabled={rendering}
                onChange={(e) => setHookTemplate(e.target.value)}
                className="w-full h-9 bg-bg border border-line rounded-lg px-2.5 text-[13px] text-ink outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10 disabled:opacity-50"
              >
                <option value="">Random per video</option>
                {HOOKS.map((h) => (
                  <option key={h} value={h}>
                    {fillHook(h, previewStreak)}
                    {hookUsesStreak(h) ? ' ·  uses streak' : ''}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-ink-6 mt-1">
                On screen for the whole video.
              </p>
            </div>

            <div>
              <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 block">
                Caption font
              </label>
              <div className="grid grid-cols-2 gap-2">
                {FONT_OPTIONS.map((o) => (
                  <button
                    key={o.key}
                    onClick={() => setCaptionStyle(o.key)}
                    disabled={rendering}
                    className={`overflow-hidden rounded-lg border text-left transition-colors disabled:opacity-50 ${
                      captionStyle === o.key ? 'border-ink ring-2 ring-ink' : 'border-line hover:border-line-2'
                    }`}
                  >
                    <div className="h-12 flex items-center justify-center bg-neutral-800">
                      <span
                        className="text-[17px] leading-none"
                        style={{ fontFamily: o.family, fontWeight: o.weight, color: '#fff', WebkitTextStroke: o.stroke, paintOrder: 'stroke fill' }}
                      >
                        {`${previewStreak.label} clean`}
                      </span>
                    </div>
                    <div className="px-3 py-1.5 bg-card">
                      <div className="text-[13px] font-medium text-ink">{o.label}</div>
                      <div className="text-[11px] text-ink-6">{o.hint}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="text-[12px] text-red-600">{error}</p>}
            {done && (
              <p className="text-[12px] text-emerald-600 flex items-center gap-1">
                <Check size={13} /> Finished — save them below.
              </p>
            )}

            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-ink-6">
                Rendered in real time, one at a time — a 20s video takes about 20s. Keep this tab in front.
              </span>
              <Button
                variant="primary"
                icon={<Sparkles size={13} />}
                onClick={run}
                disabled={rendering || runnable.length === 0 || tracks.length === 0}
              >
                {rendering ? 'Rendering…' : `Make ${plannedTotal} video${plannedTotal === 1 ? '' : 's'}`}
              </Button>
            </div>
          </div>

          {/* Results */}
          {jobs.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <h2 className="text-[13px] font-semibold text-ink flex-1">Renders</h2>
                {finishedJobs.length > 0 && (
                  <>
                    <label className="flex items-center gap-1.5 text-[12px] text-ink-5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={allPicked}
                        onChange={toggleAllJobs}
                        className="accent-ink w-3.5 h-3.5"
                      />
                      Select all
                    </label>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Download size={12} />}
                      onClick={downloadPicked}
                      disabled={zipping || pickedFinished.length === 0}
                    >
                      {zipping ? 'Zipping…' : `Download ${pickedFinished.length} as zip`}
                    </Button>
                  </>
                )}
              </div>
              {jobs.map((j) => (
                <div key={j.id} className="bg-card border border-line rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    {j.result ? (
                      <input
                        type="checkbox"
                        checked={pickedJobs.includes(j.id)}
                        onChange={() => toggleJob(j.id)}
                        aria-label={`Include ${j.label} in the zip`}
                        className="accent-ink w-3.5 h-3.5 shrink-0"
                      />
                    ) : (
                      <Clapperboard size={14} className="text-ink-5 shrink-0" />
                    )}
                    <span className="text-[13px] text-ink truncate flex-1">{j.label}</span>
                    {j.stage && <span className="text-[11px] text-ink-6 shrink-0">{j.stage}</span>}
                    {j.result && (
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<Download size={12} />}
                        onClick={() => downloadBlob(j.result!, j.name!)}
                      >
                        Save
                      </Button>
                    )}
                  </div>
                  {j.error && <p className="text-[12px] text-red-600">{j.error}</p>}
                  {j.progress !== undefined && !j.result && (
                    <div className="h-1.5 bg-raised rounded-full overflow-hidden">
                      <div className="h-full bg-ink transition-[width]" style={{ width: `${j.progress * 100}%` }} />
                    </div>
                  )}
                  {j.resultUrl && (
                    <video src={j.resultUrl} controls className="w-full max-w-[220px] rounded-lg bg-black" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
