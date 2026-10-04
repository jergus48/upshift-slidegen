// Renders a character into a CapCut format (lib/capcutFormats.ts).
//
// The format IS the edit: every piece plays from the in-point, at the speed
// and at the size and position the CapCut project gave it, and the filters
// and effects run over exactly the stretches they covered there. The only
// decision made here is which of the character's clips fills each placeholder.
//
// Rendering is OFFLINE, frame by frame: for frame n every video on screen is
// seeked to exactly the time CapCut shows there, drawn, and encoded with
// WebCodecs; the music is mixed offline from the CapCut segments. No clock,
// no play() latency — frame n is at n/fps, 1:1 with the CapCut timeline.
//
// ── Dealing the clips ────────────────────────────────────────────────────────
// The cuts in a CapCut format are there for VARIETY: a run of clip pieces is
// not one clip playing through, it's several clips taking turns.
//
// Clips (clip_chopped / clip_buffed): each back-to-back run is split at random
// into groups of 1–3 pieces, and every group gets its own clip. Inside a group
// the pieces are laid across the clip like `justify-content: space-between` —
// the first starts at the clip's first frame, the last ends on its last, the
// ones between are spaced evenly — so a 4s clip cut into two shows its start
// and its end side by side. A lone piece is taken from a random spot. A clip
// is never shown twice in one video while the pool has one not yet used; with
// a small pool the groups grow so fewer clips are needed.
//
// Screens (scoreboard / rating): a run is one screen, continuing where the
// CapCut placeholder continued, so a zoom across four pieces stays on one.
import type { LibraryImage } from '../types';
import {
  assetUrl,
  type CapcutFormat,
  type FormatFilter,
  type FormatPiece,
  type Placement,
  type Role,
  type RolePools,
} from './capcutFormats';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import type { TextScript } from './capcutScripts';

const BITRATE = 10_000_000;

// How far the frame is thrown by CapCut's "Subtle Shake".
const SHAKE_PX = 18;

type Media =
  | { kind: 'image'; el: HTMLImageElement; w: number; h: number }
  | { kind: 'video'; el: HTMLVideoElement; w: number; h: number };

interface Shot {
  piece: FormatPiece;
  media: Media | null;
  // Where in the media the piece starts.
  offset: number;
  // Character material fills the frame; format assets keep CapCut's fit.
  cover: boolean;
}

export interface CapcutRenderOptions {
  // The words on screen; none when left out.
  script?: TextScript;
  onStage?: (stage: string) => void;
  onProgress?: (p: number) => void;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${url}`));
    img.src = url;
  });
}

function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const el = document.createElement('video');
    el.muted = true;
    el.playsInline = true;
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';
    el.onloadeddata = () => resolve(el);
    el.onerror = () => reject(new Error(`Could not load a clip (${url.slice(0, 60)})`));
    el.src = url;
  });
}

function seek(el: HTMLVideoElement, t: number): Promise<void> {
  const to = Math.max(0, Math.min(t, (el.duration || t) - 0.04));
  if (Math.abs(el.currentTime - to) < 0.01) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      el.removeEventListener('seeked', done);
      resolve();
    };
    el.addEventListener('seeked', done);
    el.currentTime = to;
    setTimeout(done, 3000);
  });
}

async function loadMedia(url: string, kind: 'image' | 'video'): Promise<Media> {
  if (kind === 'image') {
    const el = await loadImage(url);
    return { kind, el, w: el.naturalWidth, h: el.naturalHeight };
  }
  const el = await loadVideo(url);
  return { kind, el, w: el.videoWidth, h: el.videoHeight };
}

// Clip lengths, read off metadata only, so dealing can tell when a run has
// used a clip up.
function durationOf(url: string): Promise<number> {
  return new Promise((resolve) => {
    const el = document.createElement('video');
    el.preload = 'metadata';
    el.muted = true;
    el.onloadedmetadata = () => {
      resolve(isFinite(el.duration) ? el.duration : 0);
      el.removeAttribute('src');
    };
    el.onerror = () => resolve(0);
    el.src = url;
  });
}

function shuffle<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

interface Plan {
  item: LibraryImage | null;
  offset: number;
}

const isClipRole = (r: Role) => r === 'clip_chopped' || r === 'clip_buffed';

// Pieces cut back to back on the same placeholder.
function runsOf(video: FormatPiece[]): number[][] {
  const runs: number[][] = [];
  video.forEach((p, i) => {
    const prev = runs[runs.length - 1];
    const last = prev ? video[prev[prev.length - 1]] : undefined;
    if (last && p.role !== 'asset' && last.role === p.role && Math.abs(p.from - last.to) < 0.02) prev.push(i);
    else runs.push([i]);
  });
  return runs;
}

// Which clip fills each piece, and from where in it.
export async function dealPieces(format: CapcutFormat, pools: RolePools): Promise<Plan[]> {
  const lengths = new Map<string, number>();
  const lengthOf = async (img: LibraryImage) => {
    if (img.kind !== 'video') return Infinity;
    if (!lengths.has(img.id)) lengths.set(img.id, await durationOf(img.url));
    return lengths.get(img.id) || Infinity;
  };
  // How often each item has been used, per placeholder — the least used goes
  // next, ties broken at random, so nothing repeats while something's unused.
  const uses = new Map<string, number>();
  const next = (pool: LibraryImage[], avoid?: string): LibraryImage => {
    const ranked = shuffle(pool).sort((a, b) => (uses.get(a.id) || 0) - (uses.get(b.id) || 0));
    const pick = ranked.find((x) => x.id !== avoid) ?? ranked[0];
    uses.set(pick.id, (uses.get(pick.id) || 0) + 1);
    return pick;
  };

  const video = format.video;
  const out: Plan[] = video.map((p) => ({ item: null, offset: p.src }));
  const runs = runsOf(video);

  // Pieces still to deal per clip placeholder, so group sizes can grow when
  // the pool is too small to give every group a fresh clip.
  const left = new Map<Role, number>();
  for (const p of video) if (p.role !== 'asset' && isClipRole(p.role)) left.set(p.role, (left.get(p.role) || 0) + 1);

  const lastOf = new Map<Role, string>();
  for (const run of runs) {
    const role = video[run[0]].role;
    if (role === 'asset') continue;
    const pool = pools[role];
    if (!pool?.length) throw new Error(`Nothing in ${role} for this character.`);

    if (!isClipRole(role)) {
      // A screen: one item for the whole run, following the placeholder.
      const item = next(pool, lastOf.get(role));
      lastOf.set(role, item.id);
      const base = video[run[0]].src;
      for (const i of run) out[i] = { item, offset: item.kind === 'video' ? Math.max(0, video[i].src - base) : 0 };
      continue;
    }

    let k = 0;
    while (k < run.length) {
      const remaining = left.get(role) || 1;
      const fresh = pool.filter((x) => !uses.get(x.id)).length;
      const minSize = fresh ? Math.min(3, Math.ceil(remaining / fresh)) : 2;
      const roll = [1, 2, 2, 3][Math.floor(Math.random() * 4)];
      let size = Math.min(run.length - k, Math.max(minSize, roll));
      const item = next(pool, lastOf.get(role));
      lastOf.set(role, item.id);
      const L = await lengthOf(item);
      // Shrink the group until its pieces fit in the clip.
      const need = (n: number) => run.slice(k, k + n).reduce((t, i) => t + (video[i].to - video[i].from) * video[i].speed, 0);
      while (size > 1 && need(size) > L) size--;
      const group = run.slice(k, k + size);
      const used = need(size);
      if (item.kind !== 'video' || !isFinite(L)) {
        for (const i of group) out[i] = { item, offset: 0 };
      } else if (group.length === 1) {
        out[group[0]] = { item, offset: Math.random() * Math.max(0, L - used) };
      } else {
        // space-between: first at 0, last ending on the clip's end.
        const gap = Math.max(0, L - used) / (group.length - 1);
        let at = 0;
        for (const i of group) {
          out[i] = { item, offset: at };
          at += (video[i].to - video[i].from) * video[i].speed + gap;
        }
      }
      left.set(role, remaining - size);
      k += size;
    }
  }
  return out;
}

// ── The filter pass ──────────────────────────────────────────────────────────
// CapCut's filters are 512×512 lookup tables (64 levels of blue in an 8×8 grid
// of red×green squares). The composite is drawn in 2D, then run through the
// active filter's tables in WebGL on its way to the recorder.
const VERT = `attribute vec2 p;varying vec2 uv;void main(){uv=vec2((p.x+1.)/2.,(1.-p.y)/2.);gl_Position=vec4(p,0.,1.);}`;
const FRAG = `precision mediump float;varying vec2 uv;uniform sampler2D frame;uniform sampler2D lut0;uniform sampler2D lut1;
uniform float mix0;uniform float mix1;
vec3 look(sampler2D l,vec3 c){float b=c.b*63.;vec2 q1;q1.y=floor(floor(b)/8.);q1.x=floor(b)-q1.y*8.;
vec2 q2;q2.y=floor(ceil(b)/8.);q2.x=ceil(b)-q2.y*8.;
vec2 t1=(q1*64.+.5+c.rg*63.)/512.;vec2 t2=(q2*64.+.5+c.rg*63.)/512.;
return mix(texture2D(l,t1).rgb,texture2D(l,t2).rgb,fract(b));}
void main(){vec3 c=texture2D(frame,uv).rgb;
if(mix0>0.)c=mix(c,look(lut0,c),mix0);
if(mix1>0.)c=mix(c,look(lut1,c),mix1);
gl_FragColor=vec4(c,1.);}`;

interface FilterPass {
  canvas: HTMLCanvasElement;
  draw: (src: HTMLCanvasElement, filter: FormatFilter | undefined) => void;
}

async function filterPass(w: number, h: number, filters: FormatFilter[]): Promise<FilterPass | null> {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, premultipliedAlpha: false });
  if (!gl) return null;
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const tex = (unit: number) => {
    const t = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  const frameTex = tex(0);
  const lutTex = new Map<string, WebGLTexture>();
  for (const f of filters) {
    for (const l of f.luts) {
      if (lutTex.has(l.png)) continue;
      const img = await loadImage(assetUrl(l.png));
      const t = tex(1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      lutTex.set(l.png, t);
    }
  }
  const u = (n: string) => gl.getUniformLocation(prog, n);
  gl.uniform1i(u('frame'), 0);
  gl.uniform1i(u('lut0'), 1);
  gl.uniform1i(u('lut1'), 2);
  gl.viewport(0, 0, w, h);

  return {
    canvas,
    draw(src, filter) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, frameTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      const luts = filter?.luts ?? [];
      for (let i = 0; i < 2; i++) {
        const l = luts[i];
        const t = l && lutTex.get(l.png);
        gl.activeTexture(gl.TEXTURE1 + i);
        if (t) gl.bindTexture(gl.TEXTURE_2D, t);
        gl.uniform1f(u(`mix${i}`), t ? (l.scaled ? filter!.intensity : 1) : 0);
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
  };
}

// Draw a source the way CapCut places it. At scale 1 a source is FITTED
// inside the canvas (CapCut's default); `cover` fills it instead, which is
// what a character's clips should do whatever shape they were shot in.
function place(
  ctx: CanvasRenderingContext2D,
  el: CanvasImageSource,
  sw: number,
  sh: number,
  p: Placement,
  cover: boolean,
  W: number,
  H: number,
) {
  if (!sw || !sh) return;
  const fit = (cover ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh)) * (p.scale || 1);
  const w = sw * fit;
  const h = sh * fit;
  ctx.save();
  ctx.globalAlpha = p.alpha ?? 1;
  ctx.translate(W / 2 + (p.x * W) / 2, H / 2 - (p.y * H) / 2);
  if (p.rotation) ctx.rotate((p.rotation * Math.PI) / 180);
  if (p.flip) ctx.scale(-1, 1);
  ctx.drawImage(el, -w / 2, -h / 2, w, h);
  ctx.restore();
}

export async function renderCapcutVideo(
  format: CapcutFormat,
  pools: RolePools,
  { script, onStage = () => {}, onProgress = () => {} }: CapcutRenderOptions = {},
): Promise<Blob> {
  const W = format.width;
  const H = format.height;
  const FPS = format.fps || 30;

  onStage('Dealing clips…');
  const plans = await dealPieces(format, pools);

  onStage('Loading clips…');
  // Every video piece gets its OWN element, parked on its in-point before
  // recording starts, so a cut is a swap rather than a seek. Stills are shared.
  const images = new Map<string, Promise<Media>>();
  const shots: Shot[] = await Promise.all(
    format.video.map(async (piece, i): Promise<Shot> => {
      const plan = plans[i];
      const url = plan.item ? plan.item.url : piece.asset ? assetUrl(appRecording(piece.asset, script)) : '';
      const kind = plan.item ? (plan.item.kind === 'video' ? 'video' : 'image') : piece.kind || 'video';
      if (!url) return { piece, media: null, offset: 0, cover: false };
      let media: Media;
      if (kind === 'image') {
        if (!images.has(url)) images.set(url, loadMedia(url, 'image'));
        media = await images.get(url)!;
      } else {
        media = await loadMedia(url, 'video');
        await seek(media.el as HTMLVideoElement, plan.offset);
      }
      return { piece, media, offset: plan.offset, cover: Boolean(plan.item) };
    }),
  );

  const overlays = await Promise.all(
    format.overlays.map(async (o) => {
      const media = await loadMedia(assetUrl(o.asset), o.kind);
      if (media.kind === 'video') await seek(media.el, o.src);
      return { o, media };
    }),
  );

  onStage('Loading filters…');
  const comp = document.createElement('canvas');
  comp.width = W;
  comp.height = H;
  const ctx = comp.getContext('2d')!;
  let pass: FilterPass | null = null;
  try {
    pass = await filterPass(W, H, format.filters);
  } catch {
    pass = null;
  }
  if (!pass && format.filters.length) onStage('No WebGL — rendering without the colour filter');

  onStage('Loading music…');
  const decodeCtx = new AudioContext();
  const res = await fetch(assetUrl(format.audio.file));
  if (!res.ok) throw new Error('Could not load the song.');
  const song = await decodeCtx.decodeAudioData(await res.arrayBuffer());
  void decodeCtx.close();

  // The soundtrack, mixed offline exactly as the CapCut segments lay it out.
  const channels = Math.min(2, song.numberOfChannels);
  const sampleRate = song.sampleRate;
  const oac = new OfflineAudioContext(channels, Math.ceil(format.duration * sampleRate), sampleRate);
  for (const a of format.audio.segments) {
    const src = oac.createBufferSource();
    src.buffer = song;
    src.playbackRate.value = a.speed || 1;
    const gain = oac.createGain();
    gain.gain.value = a.volume ?? 1;
    src.connect(gain).connect(oac.destination);
    src.start(a.from, a.src, (a.to - a.from) * (a.speed || 1));
  }
  const audio = await oac.startRendering();

  const cues = script ? cuesFor(format, script) : [];
  const shotAt = (t: number) => shots.find((s) => t >= s.piece.from && t < s.piece.to);
  const filterAt = (t: number) => format.filters.find((f) => t >= f.from && t < f.to);
  const effectsAt = (t: number) => format.effects.filter((e) => t >= e.from && t < e.to);

  // Every video on screen at `t` is seeked to exactly the frame CapCut shows
  // there — nothing plays, so nothing can start late.
  // (+1ms so float rounding never lands on the frame before.)
  const settle = async (t: number) => {
    t += 0.001;
    const waits: Promise<void>[] = [];
    const shot = shotAt(t);
    if (shot?.media?.kind === 'video') {
      waits.push(seek(shot.media.el, shot.offset + (t - shot.piece.from) * (shot.piece.speed || 1)));
    }
    for (const { o, media } of overlays) {
      if (media.kind === 'video' && t >= o.from && t < o.to) {
        waits.push(seek(media.el, o.src + (t - o.from) * (o.speed || 1)));
      }
    }
    await Promise.all(waits);
  };

  const drawFrame = (t: number) => {
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    const fx = effectsAt(t);
    const shake = fx.find((e) => e.effect === 'shake');
    if (shake) {
      const q = (t - shake.from) / Math.max(0.001, shake.to - shake.from);
      const decay = 1 - q;
      ctx.translate(Math.sin(q * 31) * SHAKE_PX * decay, Math.cos(q * 23) * SHAKE_PX * decay);
    }

    const shot = shotAt(t);
    if (shot?.media) {
      const m = shot.media;
      place(ctx, m.el, m.w, m.h, shot.piece, shot.cover, W, H);
    }
    for (const { o, media } of overlays) {
      if (t >= o.from && t < o.to) place(ctx, media.el, media.w, media.h, o, false, W, H);
    }
    ctx.restore();

    // "Negative Chaos": the picture flips to its negative and back every
    // couple of frames, knocked sideways each time it does.
    const chaos = fx.find((e) => e.effect === 'negative-chaos');
    if (chaos) {
      const f = Math.floor((t - chaos.from) * FPS);
      if (f % 4 < 2) {
        const dx = ((f * 37) % 21) - 10;
        ctx.drawImage(comp, dx * 2, 0);
        ctx.globalCompositeOperation = 'difference';
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    const cue = cues.find((c) => t >= c.from && t < c.to);
    if (cue) drawText(ctx, cue.text, W, H);

    pass?.draw(comp, filterAt(t));
  };

  onStage('Rendering…');
  const videoConfig = await pickAvc(W, H, FPS);
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: W, height: H, frameRate: FPS },
    audio: { codec: 'aac', numberOfChannels: channels, sampleRate },
    fastStart: 'in-memory',
  });
  let encodeError: unknown = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encodeError = e;
    },
  });
  videoEncoder.configure(videoConfig);

  const out = pass ? pass.canvas : comp;
  const frameUs = 1_000_000 / FPS;
  const frames = Math.round(format.duration * FPS);
  try {
    for (let f = 0; f < frames; f++) {
      if (encodeError) throw encodeError;
      const t = f / FPS;
      await settle(t);
      drawFrame(t);
      const frame = new VideoFrame(out, { timestamp: Math.round(f * frameUs), duration: Math.round(frameUs) });
      videoEncoder.encode(frame, { keyFrame: f % (FPS * 2) === 0 });
      frame.close();
      while (videoEncoder.encodeQueueSize > 20) await new Promise((r) => setTimeout(r, 4));
      onProgress((f + 1) / frames);
    }
    await videoEncoder.flush();
  } finally {
    if (videoEncoder.state !== 'closed') videoEncoder.close();
    for (const s of shots) if (s.media?.kind === 'video') s.media.el.removeAttribute('src');
  }

  onStage('Encoding the music…');
  const description = aacConfig(sampleRate, channels);
  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) =>
      muxer.addAudioChunk(chunk, {
        ...meta,
        decoderConfig: { ...(meta?.decoderConfig ?? {}), codec: 'mp4a.40.2', sampleRate, numberOfChannels: channels, description },
      }),
    error: (e) => {
      encodeError = e;
    },
  });
  audioEncoder.configure({ codec: 'mp4a.40.2', numberOfChannels: channels, sampleRate, bitrate: 192_000 });
  const data = Array.from({ length: channels }, (_, c) => audio.getChannelData(c));
  const BLOCK = 4096;
  for (let i = 0; i < audio.length; i += BLOCK) {
    const n = Math.min(BLOCK, audio.length - i);
    const buf = new Float32Array(n * channels);
    for (let c = 0; c < channels; c++) buf.set(data[c].subarray(i, i + n), c * n);
    const ad = new AudioData({
      format: 'f32-planar',
      sampleRate,
      numberOfFrames: n,
      numberOfChannels: channels,
      timestamp: Math.round((i / sampleRate) * 1_000_000),
      data: buf,
    });
    audioEncoder.encode(ad);
    ad.close();
  }
  await audioEncoder.flush();
  audioEncoder.close();
  if (encodeError) throw encodeError;

  muxer.finalize();
  onProgress(1);
  return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}

async function pickAvc(width: number, height: number, framerate: number): Promise<VideoEncoderConfig> {
  if (typeof VideoEncoder === 'undefined') throw new Error('This browser has no WebCodecs — use Chrome.');
  for (const codec of ['avc1.640033', 'avc1.64002A', 'avc1.4D4033', 'avc1.420033']) {
    const cfg: VideoEncoderConfig = { codec, width, height, bitrate: BITRATE, framerate, avc: { format: 'avc' } };
    try {
      if ((await VideoEncoder.isConfigSupported(cfg)).supported) return cfg;
    } catch {
      /* next */
    }
  }
  throw new Error('No H.264 encoder for this size.');
}

// AAC-LC AudioSpecificConfig, built by hand: Safari's encoder reports a broken
// one (see render.ts).
function aacConfig(sampleRate: number, channels: number): Uint8Array {
  const RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
  let idx = RATES.indexOf(sampleRate);
  if (idx < 0) idx = 4;
  return new Uint8Array([(2 << 3) | (idx >> 1), ((idx & 1) << 7) | (channels << 3)]);
}

// The app screen-record a format was cut with shows screen time; a 🌽 video
// gets the recording with the 🌽 apps blocked instead. Same length and size,
// so it drops into the same pieces.
const LUST_RECORDING = 'assets/upshift-pov-lust.mp4';
function appRecording(asset: string, script?: TextScript): string {
  if (script?.topic !== 'lust') return asset;
  return /\/upshift-pov(\.old)?\.mp4$/.test(asset) ? LUST_RECORDING : asset;
}

// ── On-screen text ───────────────────────────────────────────────────────────
interface Cue {
  from: number;
  to: number;
  text: string;
}

// Lay a script over the format's phases: `ch` across the chopped clips, `gap`
// over the black gap before the drop (or the last stretch of chopped when
// there's none), `bf` across the buffed clips, `sc` over the screens. Lines
// change on a cut, never mid-shot.
export function cuesFor(format: CapcutFormat, script: TextScript): Cue[] {
  if (script.all) return [{ from: 0, to: format.duration, text: script.all }];
  const v = format.video;
  const cuts = [...new Set(v.flatMap((p) => [p.from, p.to]))].sort((a, b) => a - b);
  const isClip = (p: FormatPiece) => p.role === 'clip_chopped' || p.role === 'clip_buffed';
  const before = v.filter((p) => p.to <= format.drop + 0.01);
  const after = v.filter((p) => p.from >= format.drop - 0.01);

  const spread = (lines: string[], from: number, to: number): Cue[] => {
    if (!lines.length || to - from < 0.1) return [];
    const marks = [from];
    for (let k = 1; k < lines.length; k++) {
      const target = from + ((to - from) * k) / lines.length;
      const inside = cuts.filter((c) => c > marks[marks.length - 1] + 0.2 && c < to - 0.2);
      marks.push(inside.length ? inside.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a)) : target);
    }
    marks.push(to);
    return lines.map((text, i) => ({ from: marks[i], to: marks[i + 1], text }));
  };

  const cues: Cue[] = [];
  const chClips = before.filter(isClip);
  let chEnd = chClips.length ? Math.max(...chClips.map((p) => p.to)) : 0;
  const lastShown = before.length ? Math.max(...before.map((p) => p.to)) : 0;
  if (script.gap) {
    if (format.drop - lastShown > 0.25) {
      cues.push({ from: lastShown, to: format.drop, text: script.gap });
    } else {
      // No gap: the turn takes the last chopped shot.
      const last = chClips.filter((p) => p.from < chEnd - 0.2).pop();
      const from = last ? last.from : chEnd;
      if (chEnd - from > 0.2) cues.push({ from, to: chEnd, text: script.gap });
      chEnd = from;
    }
  }
  cues.push(...spread(script.ch, 0, chEnd));

  const bfClips = after.filter(isClip);
  if (bfClips.length) {
    cues.push(...spread(script.bf, format.drop, Math.max(...bfClips.map((p) => p.to))));
  }
  if (script.sc) {
    for (const p of v) if (!isClip(p) && p.role !== 'asset') cues.push({ from: p.from, to: p.to, text: script.sc });
  }
  return cues.sort((a, b) => a.from - b.from);
}

// White, lightly shadowed, centred a little below the middle — the TikTok
// caption look the reference accounts use.
function drawText(ctx: CanvasRenderingContext2D, text: string, W: number, H: number) {
  const size = Math.round(W * 0.052);
  ctx.save();
  ctx.font = `600 ${size}px "Proxima Nova", "Helvetica Neue", Helvetica, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > W * 0.8 && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  const lh = size * 1.2;
  const y0 = H * 0.62 - ((lines.length - 1) * lh) / 2;
  ctx.shadowColor = 'rgba(0,0,0,0.75)';
  ctx.shadowBlur = size * 0.25;
  ctx.shadowOffsetY = size * 0.04;
  ctx.fillStyle = '#fff';
  lines.forEach((l, i) => ctx.fillText(l, W / 2, y0 + i * lh));
  ctx.restore();
}
