// Client-side slide renderer. Each slide becomes a 1080×1920 PNG drawn on a
// canvas — text over a gradient. No image-generation API, no cost, deterministic
// output. The resulting data URLs are sent to the server, which uploads them to
// post-bridge as the post's media.
//
// Caption geometry (font %, stroke, line-height, padding, centering) comes from
// lib/captionStyle.ts — the SAME constants the editor preview uses — so the
// scheduled PNG matches what the user saw when editing.
import type { Slide, Slideshow } from '../types';
import { FONT_SIZE_PCT, LINE_HEIGHT, SIDE_PAD_PCT, pct, captionStyleSpec, primaryFontFamily, cleanCaption } from './captionStyle';
import { resolveImageSrc } from './imageSrc';
import { createZip, dataUrlToBytes, type ZipEntry } from './zip';
import { pickMusicTrack, type MusicGender } from './music';

const W = 1080;
const H = 1920;

// Word-wrap within hard newlines, mirroring the preview's wrapping.
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (!paragraph.trim()) { out.push(''); continue; }
    const words = paragraph.split(/\s+/);
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        out.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image load failed: ${src}`));
    // Remote (cross-origin http[s]) images — e.g. the R2 photo library — would
    // taint the canvas and break toDataURL, and R2 sends no CORS header so
    // crossOrigin='anonymous' can't save it either. Route them through the
    // same-origin server proxy (/api/photo) instead. Local paths, blob: and
    // data: URLs are already same-origin/safe and load directly.
    img.src = /^https?:\/\//i.test(src) ? `/api/photo?u=${encodeURIComponent(src)}` : src;
  });
}

// Draw an image to cover the whole canvas (object-fit: cover).
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement) {
  const scale = Math.max(W / img.width, H / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}

export async function renderSlide(slide: Slide): Promise<string> {
  const style = captionStyleSpec(slide.captionStyle);

  // Make sure the caption font is actually loaded before drawing — a web font
  // that's declared but never used in the DOM isn't "pending", so awaiting
  // fonts.ready alone can still bake with a fallback. Explicitly request the
  // exact weight/family this slide uses.
  // Load by the PRIMARY family only (e.g. "Poppins") — passing the whole
  // fallback list can make fonts.load() throw, which would silently leave the
  // canvas baking in Arial instead of the caption font the user picked.
  const primary = primaryFontFamily(style.fontFamily);
  try {
    await document.fonts?.load(`${style.fontWeight} 100px "${primary}"`);
  } catch { /* fonts API unavailable — fall through to whatever's loaded */ }
  if (document.fonts?.ready) await document.fonts.ready;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Resolve the slide's stable image reference (`local:…` id, `/library/…`
  // path, or `data:` URL) to something loadable. Local ids become same-origin
  // blob: object URLs, which don't taint the canvas, so toDataURL still works.
  const imageSrc = await resolveImageSrc(slide.imageUrl);
  if (imageSrc) {
    try {
      const img = await loadImage(imageSrc);
      drawCover(ctx, img);
      // Darken so white text stays readable.
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, W, H);
    } catch {
      ctx.fillStyle = slide.bgFrom || '#0f172a';
      ctx.fillRect(0, 0, W, H);
    }
  } else {
    // Gradient background
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, slide.bgFrom || '#0f172a');
    grad.addColorStop(1, slide.bgTo || '#1e293b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    // Subtle vignette for depth
    const vig = ctx.createRadialGradient(W / 2, H / 2, H / 3, W / 2, H / 2, H);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
  }

  // Caption: white bold text, black outline, centered — driven by the SAME
  // percentages the editor preview uses, so the two always match. Font family,
  // weight and outline thickness come from the slide's chosen caption style
  // (resolved at the top of this function).
  const fontPx = Math.round(H * pct(FONT_SIZE_PCT));
  const lineHeight = Math.round(fontPx * LINE_HEIGHT);
  const strokeW = Math.max(2, Math.round(fontPx * style.strokeRatio));

  ctx.font = `${style.fontWeight} ${fontPx}px ${style.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  const maxWidth = W * (1 - 2 * pct(SIDE_PAD_PCT));
  const lines = wrap(ctx, cleanCaption(slide.text || ''), maxWidth);
  const blockH = lines.length * lineHeight;
  const startY = (H - blockH) / 2; // vertically centered, matching the preview
  const x = W / 2;

  for (let i = 0; i < lines.length; i++) {
    const y = startY + i * lineHeight;
    // Paint stroke first, fill on top — same effect as CSS paint-order: stroke fill.
    ctx.strokeStyle = 'black';
    ctx.lineWidth = strokeW;
    ctx.strokeText(lines[i], x, y);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(lines[i], x, y);
  }

  return canvas.toDataURL('image/png');
}

export async function renderSlideshow(show: Slideshow): Promise<string[]> {
  const out: string[] = [];
  for (const slide of show.slides) {
    out.push(await renderSlide(slide));
  }
  return out;
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'slideshow'
  );
}

// Render every slide to a PNG and save each to disk via a temporary <a download>
// link. Browsers throttle back-to-back programmatic downloads, so we space them
// out a little rather than firing all of them in the same tick.
export async function downloadSlideshow(show: Slideshow): Promise<void> {
  const slides = await renderSlideshow(show);
  const base = slugify(show.hook || show.caption || show.id);
  for (let i = 0; i < slides.length; i++) {
    const a = document.createElement('a');
    a.href = slides[i];
    a.download = `${base}-${i + 1}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (i < slides.length - 1) await new Promise((r) => setTimeout(r, 200));
  }
}

// The companion text file bundled alongside each post's images: title, body,
// then hashtags — each block on its own line with no labels, so the text can be
// copied straight into a post.
function captionFile(show: Slideshow): string {
  const tags = show.hashtags.map((t) => `#${t}`).join(' ');
  return [show.hook || '', '', show.caption || '', '', tags, ''].join('\n');
}

// Per-video upload metadata — what a YouTube/Shorts uploader (post-bridge, the
// scheduler, or a person posting by hand) needs to fill the title, description
// and tag fields. Title = the hook; description = the caption followed by the
// hashtags (YouTube shows in-description hashtags as clickable chips); tags =
// the bare hashtag words. Kept in sync with captionFile() above so the sidecar
// and the image .txt tell the same story.
export interface VideoMeta {
  title: string;
  description: string;
  tags: string[];
}

export function videoMeta(show: Slideshow): VideoMeta {
  const tags = show.hashtags || [];
  const hashLine = tags.map((t) => `#${t}`).join(' ');
  const description = [show.caption || '', hashLine].filter(Boolean).join('\n\n');
  return { title: show.hook || show.caption || 'Untitled', description, tags };
}

// The JSON sidecar bundled next to each exported .mp4, so every video file
// carries its own title/description/tags and an uploader needs no second export.
function videoMetaJson(show: Slideshow): string {
  return JSON.stringify(videoMeta(show), null, 2);
}

// Bundle several slideshows into ONE zip. Each post gets its own folder
// containing its images (named with the slide's order number at the end) and a
// text file with the title, body, hashtags and folder name. Triggers a single
// browser download.
export async function downloadSlideshowsZip(shows: Slideshow[]): Promise<void> {
  const entries: ZipEntry[] = [];
  const usedFolders = new Set<string>();

  // Stamp every file with a steadily increasing modified time so that sorting by
  // "date modified" (e.g. after downloading the folder from Google Drive) shows
  // the posts and their slides in this exact order. One minute apart keeps them
  // distinct even at DOS timestamps' 2-second resolution.
  const base = Date.now();
  let step = 0;
  const nextDate = () => new Date(base + step++ * 60_000);

  for (const show of shows) {
    // Give every post a distinct folder even if two share the same hook.
    let folder = slugify(show.hook || show.caption || show.id);
    if (usedFolders.has(folder)) {
      let n = 2;
      while (usedFolders.has(`${folder}-${n}`)) n++;
      folder = `${folder}-${n}`;
    }
    usedFolders.add(folder);

    const slides = await renderSlideshow(show);
    slides.forEach((dataUrl, i) => {
      entries.push({
        name: `${folder}/${folder}-${i + 1}.png`,
        data: dataUrlToBytes(dataUrl),
        date: nextDate(),
      });
    });
    entries.push({
      name: `${folder}/${folder}.txt`,
      data: new TextEncoder().encode(captionFile(show)),
      date: nextDate(),
    });
  }

  const blob = createZip(entries);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const stamp = new Date().toISOString().slice(0, 10);
  a.download = `slidesmith-posts-${stamp}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── Video export ────────────────────────────────────────────────────────────
// Turn a slideshow into a vertical (9:16) video that holds each slide on screen
// long enough to read, then slides horizontally to the next — a "YouTube
// slideshow". The video is recorded in REAL TIME from a canvas via
// canvas.captureStream + MediaRecorder, so exporting takes about as long as the
// clip itself.

const VIDEO_FPS = 30;
const TRANSITION_MS = 240; // quick horizontal slide from one slide to the next
// Reading pace tuned for Shorts: punchy, not lingering. Trimmed a notch tighter
// so decks feel snappier. A typical ~8-word slide lands near ~2s, so a 10-slide
// deck comes out around ~22s.
const READ_BASE_MS = 650; // floor: even a one-word slide stays up this long
const READ_PER_WORD_MS = 180; // added reading time per word
const READ_MAX_MS = 4500; // cap so a wordy slide can't stall forever

// How long slide `text` should stay on screen: a base plus reading time per word.
function readingHoldMs(text: string): number {
  const words = cleanCaption(text || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.min(READ_MAX_MS, READ_BASE_MS + words * READ_PER_WORD_MS);
}

// Smooth acceleration/deceleration for the slide transition.
function easeInOut(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
}

// Pick the best container/codec the browser can record. MP4 (H.264) is
// preferred: it plays everywhere (incl. Windows Media Player, phones, YouTube)
// and — unlike MediaRecorder's WebM — carries a correct duration, so players
// don't show a bogus "1 hour" length. WebM is only a fallback for browsers that
// can't record MP4.
function pickVideoMime(): string {
  const candidates = [
    'video/mp4;codecs=avc1.42E01E', // H.264 baseline
    'video/mp4;codecs=h264',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  const supported =
    typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function';
  for (const m of candidates) {
    if (supported && MediaRecorder.isTypeSupported(m)) return m;
  }
  return 'video/webm';
}

// File extension matching the recorded container.
function extForMime(mime: string): string {
  return mime.includes('mp4') ? 'mp4' : 'webm';
}

// Fetch + decode a music track into an AudioBuffer using the given context.
// Returns null on any failure so a missing/broken track just yields a silent
// video rather than aborting the export.
async function loadAudioBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = await res.arrayBuffer();
    return await ctx.decodeAudioData(bytes);
  } catch {
    return null;
  }
}

// Render one slideshow to a video Blob (MP4 when the browser supports it).
// `musicUrl`, when given, is mixed in as a background track (looped/trimmed to
// the clip length); a missing or unreadable track falls back to a silent video.
export async function renderSlideshowVideo(show: Slideshow, musicUrl?: string | null): Promise<Blob> {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('Video export needs a browser with MediaRecorder support.');
  }
  const imgs = await Promise.all((await renderSlideshow(show)).map(loadImage));
  if (!imgs.length) throw new Error('This slideshow has no slides to turn into a video.');

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const holds = show.slides.map((s) => readingHoldMs(s.text));
  // Total = every hold plus one transition between each adjacent pair.
  const total = holds.reduce((n, d) => n + d, 0) + Math.max(0, imgs.length - 1) * TRANSITION_MS;

  // Draw whatever should be on screen at time `t` (ms into the clip).
  const drawAt = (t: number) => {
    let cursor = 0;
    for (let i = 0; i < imgs.length; i++) {
      if (t < cursor + holds[i]) {
        ctx.drawImage(imgs[i], 0, 0, W, H); // holding slide i, full frame
        return;
      }
      cursor += holds[i];
      if (i < imgs.length - 1) {
        if (t < cursor + TRANSITION_MS) {
          const dx = Math.round(-easeInOut((t - cursor) / TRANSITION_MS) * W);
          ctx.drawImage(imgs[i], dx, 0, W, H); // outgoing slides left
          ctx.drawImage(imgs[i + 1], dx + W, 0, W, H); // incoming follows from the right
          return;
        }
        cursor += TRANSITION_MS;
      }
    }
    ctx.drawImage(imgs[imgs.length - 1], 0, 0, W, H); // past the end — hold the last frame
  };

  const stream = canvas.captureStream(VIDEO_FPS);

  // Optional background music: decode the track and route it into a
  // MediaStreamDestination, whose audio track we splice onto the canvas stream
  // so MediaRecorder captures picture + sound together. The source loops so a
  // short song still covers a longer clip; we start/stop it around recording.
  const AudioCtx: typeof AudioContext | undefined =
    (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
      .AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  let audioCtx: AudioContext | null = null;
  let musicSource: AudioBufferSourceNode | null = null;
  if (musicUrl && AudioCtx) {
    audioCtx = new AudioCtx();
    const buffer = await loadAudioBuffer(audioCtx, musicUrl);
    if (buffer) {
      const dest = audioCtx.createMediaStreamDestination();
      const gain = audioCtx.createGain();
      gain.gain.value = 0.85;
      musicSource = audioCtx.createBufferSource();
      musicSource.buffer = buffer;
      musicSource.loop = true;
      musicSource.connect(gain).connect(dest);
      dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    } else {
      await audioCtx.close();
      audioCtx = null;
    }
  }

  const mimeType = pickVideoMime();
  const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12_000_000 });
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve) => {
    rec.onstop = () => resolve();
  });

  drawAt(0); // seed the first frame before recording starts
  rec.start();
  musicSource?.start(); // begin the soundtrack in lockstep with recording
  await new Promise<void>((resolve) => {
    const startT = performance.now();
    const frame = () => {
      const t = performance.now() - startT;
      drawAt(Math.min(t, total));
      if (t >= total) {
        resolve();
        return;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  rec.stop();
  await stopped;
  try {
    musicSource?.stop();
  } catch { /* already stopped */ }
  if (audioCtx) await audioCtx.close();

  return new Blob(chunks, { type: mimeType });
}

// Download selected slideshows as video(s). A single selection saves one file
// (.mp4 where supported, else .webm); several are bundled into one zip.
// `onProgress` reports how many are finished so the UI can show live progress
// during the (real-time) render.
export async function downloadSlideshowsVideo(
  shows: Slideshow[],
  onProgress?: (done: number, total: number) => void,
  music?: MusicGender | null,
): Promise<void> {
  if (!shows.length) return;

  // Each video gets its own randomly-picked track from the chosen pool, so a
  // batch doesn't all share one song. No pool / empty pool → silent video.
  const trackFor = async () => (music ? await pickMusicTrack(music) : null);

  // Single selection → one plain video file plus its metadata sidecar.
  if (shows.length === 1) {
    onProgress?.(0, 1);
    const blob = await renderSlideshowVideo(shows[0], await trackFor());
    onProgress?.(1, 1);
    const base = slugify(shows[0].hook || shows[0].caption || shows[0].id);
    const saveFile = (href: string, name: string) => {
      const a = document.createElement('a');
      a.href = href;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    };
    const url = URL.createObjectURL(blob);
    saveFile(url, `${base}.${extForMime(blob.type)}`);
    URL.revokeObjectURL(url);
    // Space the second download out — browsers throttle back-to-back saves.
    await new Promise((r) => setTimeout(r, 200));
    const metaUrl = URL.createObjectURL(new Blob([videoMetaJson(shows[0])], { type: 'application/json' }));
    saveFile(metaUrl, `${base}.json`);
    URL.revokeObjectURL(metaUrl);
    return;
  }

  // Several → render each and bundle into one zip (stored, since the video is
  // already compressed), stamped in order so they sort by "date modified".
  const entries: ZipEntry[] = [];
  const usedNames = new Set<string>();
  const base = Date.now();
  onProgress?.(0, shows.length);
  for (let i = 0; i < shows.length; i++) {
    const show = shows[i];
    let name = slugify(show.hook || show.caption || show.id);
    if (usedNames.has(name)) {
      let n = 2;
      while (usedNames.has(`${name}-${n}`)) n++;
      name = `${name}-${n}`;
    }
    usedNames.add(name);

    const blob = await renderSlideshowVideo(show, await trackFor());
    entries.push({
      name: `${name}.${extForMime(blob.type)}`,
      data: new Uint8Array(await blob.arrayBuffer()),
      date: new Date(base + i * 60_000),
    });
    // A metadata sidecar next to each video so the whole zip is upload-ready.
    entries.push({
      name: `${name}.json`,
      data: new TextEncoder().encode(videoMetaJson(show)),
      date: new Date(base + i * 60_000),
    });
    onProgress?.(i + 1, shows.length);
  }

  const zip = createZip(entries);
  const url = URL.createObjectURL(zip);
  const a = document.createElement('a');
  a.href = url;
  const stamp = new Date().toISOString().slice(0, 10);
  a.download = `slidesmith-videos-${stamp}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
