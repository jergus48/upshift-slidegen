// The Video tool's renderer: executes a beat plan (lib/beatPlan.ts) as a real
// 1080x1920 video — chopped photos cutting on every beat, app screenshots
// accelerating into the drop, then the character's own clips cut to the beat,
// all under the character track whose drop and grid were pinned in Brain.
//
// Why real time (MediaRecorder) rather than the slideshow exporter's WebCodecs
// path: half of this edit is other people's video files. Pulling exact frames
// out of those in the browser would mean demuxing containers ourselves, so
// instead the clips are PLAYED and the composite canvas is recorded. The audio
// is the clock — everything is drawn against the AudioContext's own time, so a
// dropped frame shifts the picture, never the sync.
import type { LibraryImage } from '../types';
import { captionStyleSpec, type CaptionStyle } from './captionStyle';
import { drawCaption, loadCaptionFont } from './drawCaption';
import { statsRate, segmentAt, type BeatPlan, type Segment } from './beatPlan';
import { extForMime, pickVideoMime } from './render';
import { motionBlurVideo } from './api';

const W = 1080;
const H = 1920;
const FPS = 30;
const BITRATE = 8_000_000;

// How dark the frame goes under the caption. Photos take the same 45% the baked
// slides use; clips are the payoff and get a lighter hand.
const PHOTO_DIM = 0.45;
const CLIP_DIM = 0.25;

// One more black pass over the WHOLE frame, on top of the per-kind dims above.
// Those two exist to even out the sources — library photos come back brighter
// than filmed clips — so they cannot be raised together to darken the video
// without also breaking that balance. This is the grade: it applies equally to
// photos, clips and stats, and moving it moves the whole video's brightness.
//
// Drawn after the shot and BEFORE the caption, so the text keeps its contrast
// instead of being dimmed along with the picture it sits on.
const GRADE_DIM = 0.22;

// NOTHING IN THIS RENDERER SCALES. Photos used to land at 1.12 on the beat and
// settle to 1 — the "beat punch" — and that was the last zoom left in the Video
// tool. It is gone: in this tab a shot is drawn at cover size and stays there,
// and the only movement is the transition between cuts. Zooming belongs to the
// slideshow exporter's Ken Burns (lib/render.ts), which is a different tool for
// still photo decks.

// ── The cut ──────────────────────────────────────────────────────────────────
// One transition, and it is barely one: the cut is instant and the incoming
// shot shakes itself still over the next fifth of a second.
//
// There were five before this — a whip either way, a flash, a push, and a
// harder shake — rotating by segment index. They were removed because at a cut
// every 0.3-0.5s anything with travel or a flash in it fights the music instead
// of riding it. What is left is what a handheld camera does when something hits
// it, which is enough to make the change feel landed rather than merely shown.
const SHAKE_MS = 200;

// ── The dissolve ─────────────────────────────────────────────────────────────
// Between two CLIPS the cut is a cross-fade instead: the outgoing shot stays on
// screen at falling opacity while the incoming one rises through it. Nothing
// scales, blurs or deforms — the whole effect is opacity.
//
// The reason it reads as a morph rather than a fade is the framing. When two
// selfies are shot at about the same distance and angle, the eye tracks the
// features through the blend and sees one face becoming another. Mismatched
// shots just look like a dissolve. That is a shooting decision, not a setting.
//
// Photos keep the hard cut and the shake: at a marker every 0.3-0.5s, fading
// everything would turn the first half into mush.
const DISSOLVE_MS = 180;

// How far the frame is thrown at the cut. 14px on a 1080-wide frame is about
// 1.3% — visible as a knock, small enough that nobody reads it as an effect.
const SHAKE_PX = 14;

// Where the frame sits `q` of the way through the shake. The two axes run at
// different frequencies so it traces a small figure rather than a straight
// line, and it decays quickly: front-loaded movement reads as an impact, even
// decay reads as a wobble.
function shakeAt(q: number): { dx: number; dy: number } {
  const decay = (1 - q) ** 2;
  return {
    dx: Math.sin(q * Math.PI * 5) * SHAKE_PX * decay,
    dy: Math.cos(q * Math.PI * 4) * SHAKE_PX * 0.7 * decay,
  };
}

export interface BeatVideoAssets {
  // Photo pools, in the order the plan's `index` deals from them.
  chop: LibraryImage[];
  gym: LibraryImage[];
  app: LibraryImage[];
  clips: LibraryImage[];
  // The character's own stats package — stills and clips mixed, exactly as the
  // library holds them. Dealt by the plan's `index`: 0 is the hold before the
  // drop, 1 is the close. Empty when this video isn't a showcase, in which case
  // the plan carries no 'stats' segments either.
  stats: LibraryImage[];
}

export interface BeatVideoCaptions {
  // On every shot before the drop.
  hook: string;
  // From the drop onwards.
  clean: string;
  // On the last clip only.
  closing: string;
}

// ── The drop sound effect ───────────────────────────────────────────────────
// A one-shot stinger mixed OVER the music so it lands just before the drop —
// the "mogged" hit. It is a fixed asset rather than a library pool: there is
// one of it, every video uses the same one, and nothing about it is per
// character or per track.
export const SFX_URL = '/sfx/mogged.mp3';

// How far AHEAD of the drop the effect is HEARD. 0 lands it exactly on the cut,
// which is what this is set to: the effect's own impact is at its very first
// sample, so it hits with the drop rather than announcing it.
//
// Raise it to lead into the drop instead — the value is in seconds of AUDIBLE
// sound, not of file, so it means the same thing whatever effect is loaded.
export const SFX_LEAD = 0;

// Mixed under the music rather than over it. The music is already mastered
// loud, and a stinger at full scale clips the mix on the one frame that matters.
const SFX_GAIN = 0.7;

// Where the audible part of an effect actually begins. The bundled file has had
// its dead air trimmed off, so this returns ~0 for it — but an effect dropped in
// later will not have been, and even 90ms of head silence is enough to make a
// hit cued to the drop land visibly after it. Measured off the decoded buffer
// rather than hardcoded, so SFX_LEAD keeps meaning seconds of SOUND whatever
// file is loaded.
//
// The threshold is deliberately low (about -34dB): it is looking for the end of
// digital silence, not for the impact.
function firstAudibleOffset(buffer: AudioBuffer): number {
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    if (Math.abs(data[i]) > 0.02) return i / buffer.sampleRate;
  }
  return 0;
}

export interface BeatVideoOptions {
  captionStyle?: CaptionStyle;
  // The drop stinger. Defaults to the bundled one; pass `false` for a silent
  // drop, or a url to swap it.
  sfx?: string | false;
  // Optical-flow motion blur over the finished video (the RSMB look), run by
  // the local ffmpeg. Slow — budget roughly 15x the video's length at 'light'
  // and double that at 'medium' — so it is off unless asked for.
  motionBlur?: 'light' | 'medium' | 'heavy' | 'extreme';
  // 0..1 of the render, for a progress bar.
  onProgress?: (p: number) => void;
  // Called once per phase so the view can say what it's doing during the wait.
  onStage?: (stage: string) => void;
}

// Draw a source to cover the whole 9:16 canvas — plain object-fit: cover. There
// is deliberately no scale parameter: the beat punch that used it is gone, and
// leaving the knob would only let a zoom back in.
function drawCover(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  sw: number,
  sh: number,
): void {
  const fit = Math.max(W / sw, H / sh);
  const w = sw * fit;
  const h = sh * fit;
  ctx.drawImage(src, (W - w) / 2, (H - h) / 2, w, h);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load an image from the library.`));
    img.src = /^https?:\/\//i.test(url) ? `/api/photo?u=${encodeURIComponent(url)}` : url;
  });
}

// A clip, loaded far enough to be drawn the instant its slot starts. Seeking to
// 0 up front means the first frame is already decoded, so a cut never opens on
// black.
function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const el = document.createElement('video');
    el.src = url;
    el.muted = true; // the music is the soundtrack; clips play silent
    el.playsInline = true;
    el.preload = 'auto';
    el.onloadeddata = () => resolve(el);
    el.onerror = () => reject(new Error('Could not load a clip from the library.'));
  });
}

// ── The rewind ───────────────────────────────────────────────────────────────
// The last piece of a chopped clip can play BACKWARDS, and when it does it is
// also taken from near the clip's START rather than continuing forward. The two
// go together: the run walks forward through the shot, then the final cut snaps
// back to the beginning and rewinds into it. Forwards-forwards-forwards-back is
// a shape; four forward jumps is just a fast edit.
//
// Only on runs of REVERSE_MIN_PIECES or more — a clip covering one or two
// markers has no forward run to snap back from, so a rewind there reads as a
// mistake — and only on some of them, because a rewind on every long run stops
// being punctuation.
const REVERSE_MIN_PIECES = 3;
const REVERSE_CHANCE = 0.5;

// Where a rewound piece is taken from, as a fraction of the clip: the first
// tenth, i.e. back where the run began.
const REVERSE_HEAD = 0.1;

// Frames are pre-decoded rather than played: a video element cannot run at a
// negative rate in any browser, and seeking it backwards frame by frame during
// a REAL-TIME capture drops frames, which on the closing shot is the worst
// place to lose them. A rewound piece is a fifth of a second, so this is a
// handful of bitmaps decoded before recording starts and drawn off the clock.
//
// Capped so a long piece can't eat memory: at the cap the piece plays back at
// whatever rate spreads REVERSE_MAX_FRAMES over its length, which on a short
// piece is every frame and on a long one is a slightly steppy rewind — which is
// what a rewind looks like anyway.
const REVERSE_MAX_FRAMES = 24;

// Decode `len` seconds from `from` into bitmaps, in play order. The element is
// the caller's to discard: it is seeked all over and left wherever it ended.
async function extractFrames(
  el: HTMLVideoElement,
  from: number,
  len: number,
  seek: (el: HTMLVideoElement, t: number) => Promise<void>,
): Promise<ImageBitmap[]> {
  const count = Math.max(2, Math.min(REVERSE_MAX_FRAMES, Math.round(len * FPS)));
  const frames: ImageBitmap[] = [];
  for (let i = 0; i < count; i++) {
    await seek(el, from + (len * i) / (count - 1));
    try {
      frames.push(await createImageBitmap(el));
    } catch {
      // A frame that won't decode is skipped; the rewind just plays one shorter.
    }
  }
  return frames;
}

// Fetch + decode the track. A failure is fatal here (unlike the slideshow
// exporter's silent fallback): without audio there is no beat to cut to, so a
// silent render would be the wrong output rather than a lesser one.
async function loadAudio(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Could not load the music track.');
  return ctx.decodeAudioData(await res.arrayBuffer());
}

// Deal pool entries by plan index, wrapping when the plan asks for more shots
// than the pack holds.
function pick<T>(pool: T[], index: number): T | undefined {
  return pool.length ? pool[index % pool.length] : undefined;
}

export async function renderBeatVideo(
  plan: BeatPlan,
  assets: BeatVideoAssets,
  captions: BeatVideoCaptions,
  music: { url: string },
  { captionStyle, sfx = SFX_URL, motionBlur: blurStrength, onProgress, onStage: rawOnStage }: BeatVideoOptions = {},
): Promise<Blob> {
  // Every stage label carries how long the PREVIOUS stage took. A render is
  // minutes of waiting with no way to tell which part is the wait — the
  // recording itself cannot go faster than real time, but everything around it
  // can, and this is what says which is which.
  const t00 = performance.now();
  let stageStart = t00;
  let lastStage = '';
  const timings: string[] = [];
  const onStage = (stage: string) => {
    const now = performance.now();
    if (lastStage) timings.push(`${lastStage} ${((now - stageStart) / 1000).toFixed(1)}s`);
    lastStage = stage.replace(/…$/, '');
    stageStart = now;
    rawOnStage?.(timings.length ? `${stage}  (${timings.join(' · ')})` : stage);
  };
  const report = () => {
    if (lastStage) timings.push(`${lastStage} ${((performance.now() - stageStart) / 1000).toFixed(1)}s`);
    console.info(`[beat video] ${((performance.now() - t00) / 1000).toFixed(1)}s total — ${timings.join(' · ')}`);
  };

  await loadCaptionFont(captionStyleSpec(captionStyle));

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // ── Preload every asset the plan names ───────────────────────────────────
  // All of it, before recording starts: a decode stall mid-render would show up
  // as a frozen frame in the finished file.
  onStage('Loading photos…');
  // What each segment shows. Every kind but 'stats' resolves to a still; a
  // stats slot resolves to whatever its package dealt, which may be either —
  // so the still/clip decision below is made on the RESOLVED ASSET's kind, not
  // on the segment's.
  const assetFor = (s: Segment): LibraryImage | undefined =>
    pick(
      s.kind === 'chop' ? assets.chop
      : s.kind === 'gym' ? assets.gym
      : s.kind === 'stats' ? assets.stats
      : assets.app,
      s.index,
    );
  // A slot shows a clip whenever the asset it dealt IS one — which is true of
  // any kind but 'clip' (those have their own machinery below). The chopped
  // folder is allowed to hold clips as well as stills, so a cut in the first
  // half can be either, and the decision belongs to the asset, never to the
  // segment.
  const isOneShotClip = (s: Segment) => s.kind !== 'clip' && s.kind !== 'gap' && assetFor(s)?.kind === 'video';
  const photoSegments = plan.segments.filter(
    (s) => s.kind !== 'clip' && s.kind !== 'gap' && !isOneShotClip(s),
  );
  const photoFor = (s: Segment) => assetFor(s);
  // Loaded ALL AT ONCE, not one after another. These were awaited in a loop,
  // which is fine when every source is a blob: URL out of IndexedDB and very
  // much not fine when any of them is a remote image going through the server's
  // /api/photo proxy: twenty of those in series is twenty round trips end to
  // end, and it was pure waiting — nothing in the loop depends on the previous
  // image having arrived.
  const photos = new Map<string, HTMLImageElement>();
  const photoUrls = new Map<string, string>();
  for (const s of photoSegments) {
    const img = photoFor(s);
    if (img) photoUrls.set(img.id, img.url);
  }
  await Promise.all(
    [...photoUrls].map(async ([id, url]) => {
      photos.set(id, await loadImage(url));
    }),
  );

  // ── Stats clips ──────────────────────────────────────────────────────────
  // Kept apart from the post-drop clips on purpose. Those share one element per
  // source so a reused clip carries its playhead from piece to piece; a stats
  // slot is a single continuous shot played from its start, so it gets its own
  // element and none of that machinery.
  //
  // Where the clip's own length is close to the slot's, playbackRate stretches
  // it to fit exactly (see statsRate). Clips render muted, so speed costs
  // nothing. Where it isn't close, rate stays 1 and the slot simply shows the
  // clip's first N seconds — stats past ~1.6x are unreadable, and a readable
  // trim beats an unreadable fit.
  const statsSegments = plan.segments.filter(isOneShotClip);
  const statsVideos = new Map<Segment, HTMLVideoElement>();
  await Promise.all(
    statsSegments.map(async (s) => {
      const asset = assetFor(s);
      if (!asset) return;
      const el = await loadVideo(asset.url);
      if (s.kind === 'stats') {
        // A stats slot is the whole shot, stretched to fill its slot exactly.
        el.playbackRate = s.rate ?? statsRate(el.duration || 0, s.to - s.from);
      } else {
        // A chopped slot is a GLIMPSE — one marker, often half a second. Fitting
        // a 4-second clip into that would mean playing it at 8x, so it runs at
        // normal speed from a random point instead, the same way the clips after
        // the drop are chopped. Different every render, like those.
        const len = s.to - s.from;
        el.currentTime = Math.random() * Math.max(0, (el.duration || len) - len);
      }
      statsVideos.set(s, el);
    }),
  );

  onStage('Loading clips…');
  const clipSegments = plan.segments.filter((s) => s.kind === 'clip');
  const videos = new Map<string, HTMLVideoElement>();
  const clipUrls = new Map<string, string>();
  for (const s of clipSegments) {
    const clip = pick(assets.clips, s.index);
    if (clip) clipUrls.set(clip.id, clip.url);
  }
  // In parallel for the same reason as the photos above.
  await Promise.all(
    [...clipUrls].map(async ([id, url]) => {
      videos.set(id, await loadVideo(url));
    }),
  );
  // Element -> its source URL, so a piece that needs its own copy of a clip
  // (the rewind below) can load one without re-deriving where it came from.
  const urlOfVideo = new Map<HTMLVideoElement, string>();
  for (const [id, el] of videos) {
    const url = clipUrls.get(id);
    if (url) urlOfVideo.set(el, url);
  }
  // Every slot showing the same clip shares ONE element, deliberately. An
  // earlier version gave each repeat its own copy so two slots could hold
  // different moments at once — but only one clip is ever on screen now (the
  // renderer pauses the outgoing one), and sharing is what carries the playhead
  // from a clip's piece to its next piece. Separate elements would each start
  // at zero, which is the replay-the-same-second problem the chop exists to fix.
  const slotVideos = new Map<Segment, HTMLVideoElement>();
  for (const s of clipSegments) {
    const clip = pick(assets.clips, s.index);
    const el = clip ? videos.get(clip.id) : undefined;
    if (el) slotVideos.set(s, el);
  }

  // ── Where each piece of a clip starts ────────────────────────────────────
  // A clip used for several markers is SPACED ACROSS ITS WHOLE LENGTH, not
  // played front-to-back. Four markers spanning 3s of a 4-second clip give four
  // pieces at 0s, ~1s, ~2s and ~3s of the source rather than one continuous
  // 3-second run — the first piece opens the clip, the last piece ends it, and
  // the rest are evenly spread between. It is `justify-content: space-between`
  // applied to time, and it is why a reused clip reads as a chopped edit rather
  // than as the same shot cut up.
  //
  // Two things fall out of it for free: the whole clip gets seen however many
  // markers it has to cover, and each cut jumps forward, which is what makes
  // the change visible on the beat.
  const piecesOf = new Map<HTMLVideoElement, Segment[]>();
  for (const seg of clipSegments) {
    const el = slotVideos.get(seg);
    if (!el) continue;
    const list = piecesOf.get(el) ?? [];
    list.push(seg);
    piecesOf.set(el, list);
  }

  // ── …and WHERE in the clip that run begins ───────────────────────────────
  // The even spacing above is the shape; this is the part that moves. Two
  // renders of the same character used to produce the same moments of the same
  // clips, because every offset was derived from the piece count alone — a
  // 4-second clip filling a single slot always opened at 0:00 and never showed
  // its second half at all.
  //
  // So each piece is jittered inside the gap it owns. Order and coverage are
  // preserved (piece k still sits between k-1 and k+1, the run still spans the
  // clip), but which exact second each cut lands on differs every render.
  //
  // A clip covering ONE slot is the case that matters most and the one that had
  // no variation whatsoever: there is no gap to jitter within, so it takes a
  // random start anywhere it fits — the whole point being that a 4-second clip
  // used for 1.8 seconds should not always be the same 1.8 seconds.
  const offsetOf = new Map<Segment, number>();
  for (const [el, pieces] of piecesOf) {
    pieces.forEach((seg, k) => {
      const len = seg.to - seg.from;
      // The last piece has to END on the clip's end, so the furthest any piece
      // may start is `duration - len`. A clip shorter than its own piece has no
      // room to travel and simply plays from the top.
      const travel = Math.max(0, (el.duration || len) - len);
      if (pieces.length === 1) {
        offsetOf.set(seg, Math.random() * travel);
        return;
      }
      const gap = travel / (pieces.length - 1);
      // ±half a gap, so a piece can never cross into its neighbour's territory
      // and the pieces stay in clip order.
      const jitter = (Math.random() - 0.5) * gap;
      offsetOf.set(seg, Math.min(travel, Math.max(0, gap * k + jitter)));
    });
  }

  // ── …and which piece rewinds ─────────────────────────────────────────────
  // The last piece of a long enough run, some of the time (see REVERSE_*). Its
  // offset is moved off the spaced grid and back to the head of the clip: a
  // rewind that starts where the run ended would just retrace the last cut.
  const reversed = new Set<Segment>();
  for (const [el, pieces] of piecesOf) {
    if (pieces.length < REVERSE_MIN_PIECES) continue;
    if (Math.random() >= REVERSE_CHANCE) continue;
    const seg = pieces[pieces.length - 1];
    const len = seg.to - seg.from;
    const travel = Math.max(0, (el.duration || len) - len);
    reversed.add(seg);
    offsetOf.set(seg, Math.min(travel, Math.random() * REVERSE_HEAD * (el.duration || len)));
  }

  // ── Prime every clip to its first frame ──────────────────────────────────
  // Setting `currentTime` starts an ASYNCHRONOUS seek, and until it finishes the
  // element has no new frame to give. Drawing it then paints whatever was on the
  // canvas before — which is why the clips appeared a beat or two after the
  // drop: the first clip was still seeking while its slot was already on screen,
  // so the last photo stayed up.
  //
  // Seeking each element to its first piece here, and waiting for it, means the
  // frame is decoded and ready before recording starts.
  onStage('Preparing clips…');
  const seekTo = (el: HTMLVideoElement, t: number) =>
    new Promise<void>((resolve) => {
      if (Math.abs(el.currentTime - t) < 0.01 && el.readyState >= 2) return resolve();
      const done = () => { el.removeEventListener('seeked', done); resolve(); };
      el.addEventListener('seeked', done);
      el.currentTime = t;
      // A seek that never lands must not hang the whole render.
      setTimeout(done, 2000);
    });
  const firstPieceOf = new Map<HTMLVideoElement, Segment>();
  for (const seg of clipSegments) {
    const el = slotVideos.get(seg);
    if (el && !firstPieceOf.has(el)) firstPieceOf.set(el, seg);
  }
  // Also in parallel: each seek is an independent wait on its own element, and
  // the 2s timeout below means a batch of clips whose seeks never land used to
  // cost 2 SECONDS EACH in series.
  await Promise.all([...firstPieceOf].map(([el, seg]) => seekTo(el, offsetOf.get(seg) ?? 0)));

  // The rewound pieces, decoded to bitmaps now so the draw loop never waits on
  // a seek. Each uses its OWN element: the shared one carries the playhead from
  // piece to piece, and seeking it across the clip here would undo the priming
  // above.
  const reverseFrames = new Map<Segment, ImageBitmap[]>();
  if (reversed.size) {
    onStage('Reversing clips…');
    await Promise.all(
      [...reversed].map(async (seg) => {
        const shared = slotVideos.get(seg);
        const url = shared ? urlOfVideo.get(shared) : undefined;
        if (!shared || !url) return;
        const own = await loadVideo(url);
        const from = offsetOf.get(seg) ?? 0;
        const frames = await extractFrames(own, from, seg.to - seg.from, seekTo);
        own.removeAttribute('src');
        if (frames.length) reverseFrames.set(seg, frames);
      }),
    );
  }

  onStage('Loading music…');
  const audioCtx = new AudioContext();
  const buffer = await loadAudio(audioCtx, music.url);

  // The stinger, decoded up front like everything else — a fetch mid-render
  // would land it late, which for a one-shot cued to a single moment means it
  // may as well not be there. A failure to load is NOT fatal: the video is
  // still the video without it, unlike the music, which is the timeline.
  let sfxBuffer: AudioBuffer | null = null;
  if (sfx) {
    try {
      sfxBuffer = await loadAudio(audioCtx, sfx);
    } catch {
      sfxBuffer = null;
    }
  }

  const stream = canvas.captureStream(FPS);
  const dest = audioCtx.createMediaStreamDestination();
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(dest);
  for (const track of dest.stream.getAudioTracks()) stream.addTrack(track);

  const mime = pickVideoMime();
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: BITRATE });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const finished = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
  });

  // The caption: the hook, on screen for the whole video. It used to switch to
  // the clean line at the drop and a closing line on the final shot; one line
  // held throughout reads better than three swapped under the viewer.
  const captionAt = (_t: number, _seg: Segment | undefined): string => captions.hook;

  onStage('Recording…');
  try {
    // ── Starting the two streams together ────────────────────────────────────
    // Everything runs off the audio clock, so the picture cannot drift from the
    // beat it was cut to. Getting the two streams to BEGIN together is a
    // separate problem, and it was the reason the clips landed late.
    //
    // What this used to do: schedule the audio 100ms out, then call
    // recorder.start() immediately. MediaRecorder needs a moment to spin up its
    // encoder, and the canvas track only emits a frame when the canvas is drawn
    // to — so the first frames could be dropped while the audio track, coming
    // from the audio graph, was captured from its first sample. Picture lost
    // frames that audio kept, and everything in the picture arrived late.
    //
    // What it does now: start the recorder, draw a lead-in, and only start the
    // audio once frames are provably flowing — with t0 taken at that instant.
    // Any encoder warm-up now lands in the lead-in instead of in the edit.
    await audioCtx.resume();
    recorder.start();

    // Draw the opening frame for a few ticks so the encoder is warm and the
    // canvas track is emitting. LEAD_IN_FRAMES at 30fps is ~200ms.
    const LEAD_IN_FRAMES = 6;
    await new Promise<void>((resolve) => {
      let n = 0;
      const warm = () => {
        const seg = plan.segments[0];
        if (seg && seg.kind !== 'clip') {
          const img = photoFor(seg);
          const el = img ? photos.get(img.id) : undefined;
          if (el) {
            drawCover(ctx, el, el.naturalWidth, el.naturalHeight);
            ctx.fillStyle = `rgba(0,0,0,${PHOTO_DIM})`;
            ctx.fillRect(0, 0, W, H);
          }
        }
        if (++n >= LEAD_IN_FRAMES) { resolve(); return; }
        requestAnimationFrame(warm);
      };
      requestAnimationFrame(warm);
    });

    const t0 = audioCtx.currentTime;
    source.start(t0, plan.audioFrom, plan.duration);

    // ── The stinger, cued off the same t0 as the music ──────────────────────
    // Scheduled here, not played from the draw loop: everything in this render
    // runs on the audio clock precisely so the picture can't drift from the
    // beat, and a sound cued off requestAnimationFrame would drift by exactly
    // the amount the clock exists to prevent.
    //
    if (sfxBuffer) {
      const at = plan.dropAt - SFX_LEAD;
      const head = firstAudibleOffset(sfxBuffer);
      const sfxSource = audioCtx.createBufferSource();
      sfxSource.buffer = sfxBuffer;
      const gain = audioCtx.createGain();
      gain.gain.value = SFX_GAIN;
      sfxSource.connect(gain);
      gain.connect(dest);
      // Playing from `head` skips any dead air, so the first thing heard is at
      // `at` — SFX_LEAD seconds before the drop, which at the current 0 means
      // on it.
      //
      // A drop closer to the start of the video than the lead can't be led into
      // by the whole effect, so it starts immediately and plays from however
      // far in it would have been by then. The rest still lands where it should.
      if (at >= 0) sfxSource.start(t0 + at, head);
      else sfxSource.start(t0, head - at);
    }

    // Each slot seeks to its own piece's offset (computed above) and plays for
    // exactly as long as the marker interval lasts. The outgoing clip is paused
    // on the way out so it can't run on off-screen and land the next piece
    // somewhere other than where it was placed.
    const started = new Set<Segment>();
    let onScreen: HTMLVideoElement | null = null;
    // The stats clip currently showing, paused the moment its slot ends so it
    // isn't left running off-screen for the rest of the render.
    let statsOnScreen: HTMLVideoElement | null = null;
    // Clips whose seek has already been kicked off for a slot still to come, so
    // the same one is not requested every frame.
    const primed = new Set<Segment>();

    await new Promise<void>((resolve) => {
      const frame = () => {
        const t = audioCtx.currentTime - t0;
        if (t >= plan.duration) { resolve(); return; }
        const seg = t < 0 ? plan.segments[0] : segmentAt(plan, t);

        // Off the stats slot: stop its clip before drawing anything else.
        if (statsOnScreen && (!seg || statsVideos.get(seg) !== statsOnScreen)) {
          statsOnScreen.pause();
          statsOnScreen = null;
        }

        // The shake, while we're inside its window. Skipped on the very first
        // segment: there is nothing to have cut away from.
        const segIdx = seg ? plan.segments.indexOf(seg) : 0;
        const into = seg ? (t - seg.from) * 1000 : Infinity;
        const shake =
          seg && into >= 0 && into < SHAKE_MS && segIdx > 0 ? shakeAt(into / SHAKE_MS) : null;

        ctx.save();
        if (shake) ctx.translate(shake.dx, shake.dy);

        // The outgoing shot under a dissolve. A rewind has no live element to
        // blend from — it was drawn from bitmaps — so its LAST frame (the one
        // still on screen at the cut, i.e. the first of the reversed run) is
        // what the incoming clip fades up over.
        const drawOutgoing = (prevSeg: Segment | undefined) => {
          if (!prevSeg || prevSeg.kind !== 'clip') return;
          const frozen = reverseFrames.get(prevSeg)?.[0];
          if (frozen) { drawCover(ctx, frozen, frozen.width, frozen.height); return; }
          const prevEl = slotVideos.get(prevSeg);
          if (prevEl) drawCover(ctx, prevEl, prevEl.videoWidth, prevEl.videoHeight);
        };

        if (seg && seg.kind === 'gap') {
          // A hole in the picture: black, and whatever was playing stops so it
          // doesn't run on unseen and land its next piece somewhere else.
          if (onScreen) { onScreen.pause(); onScreen = null; }
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, W, H);
        } else if (seg && reverseFrames.has(seg)) {
          // A rewind: drawn from the pre-decoded bitmaps, LAST frame first, off
          // the audio clock. The shared element is stopped — this piece is the
          // end of its run, so nothing downstream needs its playhead, and
          // leaving it running would burn through the clip off-screen.
          if (onScreen) { onScreen.pause(); onScreen = null; }
          const frames = reverseFrames.get(seg)!;
          const q = Math.min(1, Math.max(0, (t - seg.from) / Math.max(0.001, seg.to - seg.from)));
          const f = frames[Math.min(frames.length - 1, Math.floor((1 - q) * frames.length))];
          // The dissolve still applies: a rewind off another clip cross-fades
          // like any other clip-to-clip cut.
          const prevSeg = plan.segments[plan.segments.indexOf(seg) - 1];
          const fade =
            prevSeg && prevSeg.kind === 'clip' && into >= 0 && into < DISSOLVE_MS
              ? into / DISSOLVE_MS
              : 1;
          if (fade < 1) drawOutgoing(prevSeg);
          ctx.save();
          ctx.globalAlpha = fade;
          drawCover(ctx, f, f.width, f.height);
          ctx.restore();
          ctx.fillStyle = `rgba(0,0,0,${CLIP_DIM})`;
          ctx.fillRect(0, 0, W, H);
        } else if (seg && seg.kind === 'clip') {
          const el = slotVideos.get(seg);
          if (el) {
            // How far through the dissolve this frame is: 0 at the cut, 1 once
            // the incoming clip stands alone. Only between two clips.
            const prevSeg = plan.segments[plan.segments.indexOf(seg) - 1];
            const fade =
              prevSeg && prevSeg.kind === 'clip' && into >= 0 && into < DISSOLVE_MS
                ? into / DISSOLVE_MS
                : 1;
            if (!started.has(seg)) {
              started.add(seg);
              // Primed above (or on the previous segment), so this seek is
              // usually a no-op and the first frame is already decoded.
              if (Math.abs(el.currentTime - (offsetOf.get(seg) ?? 0)) > 0.05) {
                el.currentTime = offsetOf.get(seg) ?? 0;
              }
              // The previous clip is NOT paused here any more: it has to keep
              // running under the dissolve. It is paused once the fade is done,
              // below.
              onScreen = el;
              void el.play().catch(() => {});
            }
            // The outgoing clip underneath, still running, so the blend is
            // between two live shots rather than a frozen frame and a moving one.
            if (fade < 1 && slotVideos.get(prevSeg!) !== el) drawOutgoing(prevSeg);
            ctx.save();
            ctx.globalAlpha = fade;
            drawCover(ctx, el, el.videoWidth, el.videoHeight);
            ctx.restore();
            ctx.fillStyle = `rgba(0,0,0,${CLIP_DIM})`;
            ctx.fillRect(0, 0, W, H);
          }
        } else if (seg && statsVideos.has(seg)) {
          // A stats slot showing a clip. Like a photo slot it stops whatever
          // post-drop clip was running, so that clip's next piece resumes from
          // this exact frame — the stats hold sits between pieces rather than
          // running one of them off-screen.
          if (onScreen) { onScreen.pause(); onScreen = null; }
          const el = statsVideos.get(seg)!;
          if (!started.has(seg)) {
            started.add(seg);
            void el.play().catch(() => {});
          }
          statsOnScreen = el;
          drawCover(ctx, el, el.videoWidth, el.videoHeight);
          ctx.fillStyle = `rgba(0,0,0,${CLIP_DIM})`;
          ctx.fillRect(0, 0, W, H);
        } else if (seg) {
          // A photo slot: whatever clip was playing stops here, so its next
          // piece picks up from this exact frame.
          if (onScreen) { onScreen.pause(); onScreen = null; }
          const img = photoFor(seg);
          const el = img ? photos.get(img.id) : undefined;
          if (el) {
            drawCover(ctx, el, el.naturalWidth, el.naturalHeight);
            ctx.fillStyle = `rgba(0,0,0,${PHOTO_DIM})`;
            ctx.fillRect(0, 0, W, H);
          }
        }

        ctx.restore();

        // Once the dissolve is over, stop whatever was fading out underneath.
        if (seg && seg.kind === 'clip') {
          const prevSeg = plan.segments[plan.segments.indexOf(seg) - 1];
          const prevEl = prevSeg && prevSeg.kind === 'clip' ? slotVideos.get(prevSeg) : undefined;
          if (prevEl && prevEl !== onScreen && into >= DISSOLVE_MS && !prevEl.paused) prevEl.pause();
        }

        // Get the NEXT clip ready while this segment is still on screen. Only
        // an element that isn't currently being shown can be seeked — seeking
        // the on-screen one would jump the picture.
        if (seg) {
          const idx = plan.segments.indexOf(seg);
          for (let k = idx + 1; k < plan.segments.length && k <= idx + 2; k++) {
            const next = plan.segments[k];
            if (next.kind !== 'clip' || primed.has(next)) continue;
            const el = slotVideos.get(next);
            if (!el || el === onScreen || reverseFrames.has(next)) continue;
            primed.add(next);
            el.currentTime = offsetOf.get(next) ?? 0;
          }
        }

        // The grade, outside the shake transform so it covers the frame edge to
        // edge even on the frames the shake has pushed off-centre.
        ctx.fillStyle = `rgba(0,0,0,${GRADE_DIM})`;
        ctx.fillRect(0, 0, W, H);

        const line = captionAt(Math.max(0, t), seg);
        if (line) drawCaption(ctx, line, W, H, captionStyle);
        onProgress?.(Math.min(1, Math.max(0, t / plan.duration)));
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });

    recorder.stop();
    onProgress?.(1);
    const master = await finished;
    if (!blurStrength) {
      report();
      return master;
    }

    // The plan knows exactly where every cut is, which beats the server
    // detecting them — flow across a cut morphs two unrelated shots together,
    // and these transitions are built to look like motion rather than a cut.
    onStage('Motion blur…');
    const blurred = await applyMotionBlur(
      master,
      blurStrength,
      plan.segments.map((seg) => seg.from).filter((f) => f > 0),
      rawOnStage,
    );
    report();
    return blurred;
  } finally {
    try { source.stop(); } catch { /* already ended */ }
    for (const el of slotVideos.values()) {
      el.pause();
      el.removeAttribute('src');
    }
    // The rewind bitmaps hold decoded frames — a handful of megabytes each —
    // until they are closed, and the browser will not collect them on its own
    // while the map is alive.
    for (const frames of reverseFrames.values()) for (const f of frames) f.close();
    await audioCtx.close().catch(() => {});
  }
}

// Hand the recording to the server's ffmpeg for optical-flow motion blur. A
// failure is not fatal: the sharp master is still a good export, so it warns and
// returns that rather than losing a render that has already been made.
async function applyMotionBlur(
  master: Blob,
  strength: 'light' | 'medium' | 'heavy' | 'extreme',
  cuts: number[],
  onStage?: (stage: string) => void,
): Promise<Blob> {
  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error || new Error('Could not read the rendered video.'));
      r.readAsDataURL(master);
    });
    const { video } = await motionBlurVideo(dataUrl, strength, cuts);
    const b64 = video.slice(video.indexOf(',') + 1);
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes.buffer], { type: 'video/mp4' });
  } catch (err) {
    // Loudly, not silently. This used to warn to the console and hand back the
    // sharp master, which looks identical to "motion blur is broken" from the
    // outside — a render would finish after minutes with no blur and nothing
    // saying why. The usual cause is the local server not running, since the
    // blur is ffmpeg on this machine and the browser cannot do it alone.
    const reason = err instanceof Error ? err.message : String(err);
    console.warn('Motion blur failed; keeping the sharp master.', err);
    onStage?.(`No motion blur — ${reason}. Is the local server running?`);
    await new Promise((r) => setTimeout(r, 4000)); // leave it on screen to be read
    return master;
  }
}

// Filename for a finished video, matching the container the recorder produced.
export function beatVideoFileName(base: string, blob: Blob): string {
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'video';
  return `${slug}.${extForMime(blob.type)}`;
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
