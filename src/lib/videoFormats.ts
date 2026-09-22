// ── Formats ──────────────────────────────────────────────────────────────────
// A FORMAT is one finished edit, worked out once in CapCut and then shipped as
// a preset every future video can be generated to: which song it is cut to,
// where every cut lands, where the picture goes black, and where this app's own
// renders belong in it.
//
// It is deliberately NOT a property of the song. Two formats can be cut to the
// same track with different grids, and a grid that lived on the track could
// only ever hold one of them.
//
// One JSON per format in public/formats/, listed in public/formats/index.json.
// Adding a format is dropping a file in and adding its name to that list —
// there is nothing to change in here for a new one.
//
// ── Reading the times ────────────────────────────────────────────────────────
// Every time is SECONDS INTO THE TRACK, because that is what the beat planner
// and the renderer work in. The `timecode` beside it is the same instant as
// CapCut shows it: `seconds:frames` at the format's own fps. CapCut's UI says
// 3:22 where this file says 3.733, and those are the same moment — 22 frames at
// 30fps is 0.733s. Nothing here parses the timecode. It exists so that a wrong
// number can be SEEN, by holding it against the CapCut playhead, instead of
// being caught only after a render comes out shifted.
import type { VideoStyle } from './videoAutomation';

export interface FormatWindow {
  from: number;
  to: number;
  // The same window in CapCut's seconds:frames, e.g. "3:22-5:07".
  timecode?: string;
}

// A window in the edit that something specific goes in. 'chopped' is where the
// addict cut sits, 'buffed' where the one with the good stats does.
//
// `fill` says whether THIS APP fills it or a person does:
//   'app'   — the shared blocked/streak screenshots, rendered here.
//   'clip'  — one of the character's own videos, rendered here.
//   absent  — a video this app produced separately, dropped in by whoever
//             assembles the edit. Nothing in the renderer fills those: the app
//             cannot nest its own output inside itself.
export interface FormatSlot extends FormatWindow {
  kind: 'chopped' | 'buffed';
  fill?: 'app' | 'clip';
  // The fewest shots a filled window may show. Left out it holds one.
  cuts?: number;
}

export interface VideoFormat {
  id: string;
  label: string;
  // Which of the app's cuts this format is. A format whose style a character
  // can't be rendered as is simply not offered for them.
  style: VideoStyle;
  // Free text: where this edit came from, for whoever reads the file next.
  note?: string;
  // The track it is cut to — a filename in public/music/manifest.json.
  track: string;
  // The frame rate its timecodes are written at.
  fps: number;
  // The moment the glow-up lands, in track seconds.
  drop: number;
  bpm?: number;
  // The span of the finished edit. The video is planned to this length.
  edit: FormatWindow;
  // Every cut boundary in it, ascending — the beat grid the plan cuts on.
  beats: number[];
  // The windows something specific belongs in — see FormatSlot for which of
  // them this app fills itself.
  slots?: FormatSlot[];
  // Deliberate holes: black picture, on the beat. Part of the edit, not a
  // mistake in it — filling one in is as wrong as dropping a cut.
  gaps?: FormatWindow[];
}

let cache: Promise<VideoFormat[]> | null = null;

// Load every format. A file that is missing or malformed is skipped rather than
// taking the others down with it: one bad preset must not empty the list.
export function listFormats(): Promise<VideoFormat[]> {
  if (!cache) {
    cache = fetch('/formats/index.json')
      .then((r) => (r.ok ? (r.json() as Promise<string[]>) : []))
      .then((names) =>
        Promise.all(
          names.map((name) =>
            fetch(`/formats/${name}`)
              .then((r) => (r.ok ? (r.json() as Promise<VideoFormat>) : null))
              .catch(() => null),
          ),
        ),
      )
      .then((list) => list.filter((f): f is VideoFormat => isFormat(f)))
      .catch(() => []);
  }
  return cache;
}

// The fields the planner cannot do without. A preset missing any of them is
// dropped, because a half-read format would silently reshape a video.
function isFormat(f: VideoFormat | null): boolean {
  return Boolean(
    f &&
      typeof f.id === 'string' &&
      typeof f.track === 'string' &&
      typeof f.drop === 'number' &&
      f.edit &&
      Array.isArray(f.beats) &&
      f.beats.length >= 6,
  );
}

// The two phase lengths buildBeatPlan takes, read off the format's own span.
// The windows this app fills itself, for buildBeatPlan.
export function fillsOf(f: VideoFormat): { from: number; to: number; kind: 'app' | 'clip'; cuts?: number }[] {
  return (f.slots ?? [])
    .filter((s): s is FormatSlot & { fill: 'app' | 'clip' } => s.fill === 'app' || s.fill === 'clip')
    .map((s) => ({ from: s.from, to: s.to, kind: s.fill, cuts: s.cuts }));
}

export function shapeOf(f: VideoFormat): { intro?: number; outro?: number } | undefined {
  const intro = f.drop > f.edit.from ? f.drop - f.edit.from : undefined;
  const outro = f.edit.to > f.drop ? f.edit.to - f.drop : undefined;
  return intro || outro ? { intro, outro } : undefined;
}

// Seconds as CapCut writes them, for anything this app prints back to the user.
export function timecode(seconds: number, fps: number): string {
  const f = Math.round(seconds * fps);
  return `${Math.floor(f / fps)}:${String(f % fps).padStart(2, '0')}`;
}
