// Reading a CapCut project into Slidegen.
//
// A CapCut desktop project is a folder of JSON, and the one worth having is
// `draft_info.json`:
//
//   ~/Movies/CapCut/User Data/Projects/com.lveditor.draft/<project>/draft_info.json
//
// What we take from it is the BEAT GRID — the markers placed by hand against
// the song in CapCut's own editor, which is the same job Brain's music editor
// does and the same thing lib/musicBeats.ts stores. An edit already cut in
// CapCut therefore carries its grid over instead of being marked twice.
//
// Nothing else is imported. Transitions, filters and the clip layout are
// CapCut's engine, not ours, and the parts of that edit worth having (pieces
// spaced across a clip, the last one rewound) already live in lib/beatVideo.ts.
//
// The file is treated as untrusted input throughout: it is user data from
// another program, every field is optional in practice, and a draft that does
// not parse must say so rather than half-import.

// CapCut stores every time in MICROSECONDS.
const US = 1_000_000;

export interface CapCutImport {
  // Beat markers in seconds from the START OF THE SONG, ascending.
  beats: number[];
  // Where each cut in the CapCut edit lands, same units. Usually the beats plus
  // a few off-grid ones (the long hero shots) — kept so the import can fall
  // back to them when a project was cut without a beat grid at all.
  cuts: number[];
  // Median tempo across the markers, for the grid we save.
  bpm: number;
  // The audio file the grid belongs to, so the user can be told when they are
  // about to put one song's markers on another.
  audioName: string;
  // Where the project starts in that song. CapCut's markers are relative to the
  // TIMELINE, so this is added to them to get song time.
  audioOffset: number;
}

interface Json {
  [k: string]: unknown;
}

const asObj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {});
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number => (typeof v === 'number' && isFinite(v) ? v : 0);

// The median gap between markers, as BPM. Median rather than mean because a
// hand-marked grid always has a couple of long gaps (a breakdown, a hero shot)
// and those would drag an average well off the real tempo.
function bpmOf(beats: number[]): number {
  if (beats.length < 3) return 0;
  const gaps: number[] = [];
  for (let i = 1; i < beats.length; i++) gaps.push(beats[i] - beats[i - 1]);
  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  return median > 0 ? Math.round((60 / median) * 10) / 10 : 0;
}

// Parse a draft_info.json. Throws with a readable message on anything that
// isn't one, or on one with no markers in it.
export function parseCapCutDraft(text: string): CapCutImport {
  let root: Json;
  try {
    root = asObj(JSON.parse(text));
  } catch {
    throw new Error('That file is not JSON — pick draft_info.json from the project folder.');
  }
  const materials = asObj(root.materials);
  const tracks = asArr(root.tracks).map(asObj);
  if (!tracks.length || !Object.keys(materials).length) {
    throw new Error('That JSON is not a CapCut project (no tracks in it).');
  }

  // The audio track tells us which song the markers belong to and where in it
  // the project starts.
  const audioTrack = tracks.find((t) => t.type === 'audio');
  const audioSeg = asObj(asArr(audioTrack?.segments)[0]);
  const audioOffset = num(asObj(audioSeg.source_timerange).start) / US;
  const audioName = String(asObj(asArr(materials.audios)[0]).name || '');

  // `user_beats` are the markers placed by hand; `ai_beats` is CapCut's own
  // detection, which it keeps in a separate cache file we can't read — so a
  // project beat-matched by CapCut rather than by hand imports nothing here and
  // is told to use the cuts instead.
  const beatsMat = asObj(asArr(materials.beats)[0]);
  const raw = asArr(beatsMat.user_beats)
    .map((b) => (typeof b === 'number' ? b : num(asObj(b).offset)))
    .filter((n) => n > 0);
  const beats = [...new Set(raw.map((us) => Math.round((us / US + audioOffset) * 1000) / 1000))].sort(
    (a, b) => a - b,
  );

  // Every cut in the edit: the start of each segment on the main video track.
  const videoTrack = tracks
    .filter((t) => t.type === 'video')
    .sort((a, b) => asArr(b.segments).length - asArr(a.segments).length)[0];
  const cuts = [
    ...new Set(
      asArr(videoTrack?.segments)
        .map(asObj)
        .map((s) => num(asObj(s.target_timerange).start) / US + audioOffset)
        .map((t) => Math.round(t * 1000) / 1000),
    ),
  ].sort((a, b) => a - b);

  if (!beats.length && !cuts.length) {
    throw new Error('That project has no beat markers and no cuts to read.');
  }

  return { beats, cuts, bpm: bpmOf(beats.length ? beats : cuts), audioName, audioOffset };
}
