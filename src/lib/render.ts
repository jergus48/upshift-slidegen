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
import { writeFileToDir } from './downloadFolders';
import { pickMusicTrack, type MusicGender, type MusicTrack } from './music';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

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
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement | HTMLCanvasElement) {
  const scale = Math.max(W / img.width, H / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}

// ── Nuclear scrub pipeline ──────────────────────────────────────────────────
// Strips pixel-level watermarks (Google SynthID / Imagen) from source images
// so YouTube's classifiers can't flag the exported video as "Made with AI".
//
// SynthID is specifically engineered to survive mild crop/resize/noise/single
// JPEG — so we stack MANY degradation passes that each attack the watermark
// from a different angle:
//
//   1. Aggressive crop (5–10% off each edge)
//   2. Downscale to ~70–80% (heavy interpolation smearing)
//   3. Per-pixel noise (±8 levels) + per-channel colour shift (±5)
//   4. 3×3 box blur (smears spatial watermark patterns)
//   5. THREE rounds of JPEG re-compression at LOW quality (0.65 → 0.55 → 0.70)
//      — each pass applies 8×8 DCT quantisation that destroys different
//      frequency components; three passes at varying quality ensures nothing
//      survives in the high-frequency domain where SynthID hides
//
// The output is a much smaller image, but drawCover scales it right back up to
// 1080×1920 for the slide — and since it's just a background under bold text
// + a 45% dark overlay, the quality loss is invisible.

async function scrubImage(img: HTMLImageElement): Promise<HTMLCanvasElement> {
  const w0 = img.naturalWidth || img.width;
  const h0 = img.naturalHeight || img.height;
  const rand = (min: number, max: number) => min + Math.random() * (max - min);

  // ── 1. Aggressive crop (5–10% off each edge) ──────────────────────────────
  const cropFrac = rand(0.05, 0.10);
  const cx = Math.round(w0 * cropFrac);
  const cy = Math.round(h0 * cropFrac);
  const sw = Math.max(1, w0 - cx * 2);
  const sh = Math.max(1, h0 - cy * 2);

  // ── 2. Downscale to 70–80% — heavy interpolation smears pixel patterns ────
  const scale = rand(0.70, 0.80);
  const dw = Math.max(1, Math.round(sw * scale));
  const dh = Math.max(1, Math.round(sh * scale));

  const tmp = document.createElement('canvas');
  tmp.width = dw;
  tmp.height = dh;
  const tctx = tmp.getContext('2d')!;
  tctx.drawImage(img, cx, cy, sw, sh, 0, 0, dw, dh);

  // ── 3. Heavy per-pixel noise + colour channel shifts ──────────────────────
  try {
    const imageData = tctx.getImageData(0, 0, dw, dh);
    const d = imageData.data;
    const noiseAmp = 8; // ±8 levels — well above SynthID's designed tolerance
    const bright = 1 + rand(-0.05, 0.05); // ±5% global brightness
    // Independent per-channel shift so colour profile drifts.
    const shifts = [rand(-5, 5), rand(-5, 5), rand(-5, 5)];
    for (let i = 0; i < d.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const v = d[i + c] * bright + shifts[c] + (Math.random() * 2 - 1) * noiseAmp;
        d[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
    tctx.putImageData(imageData, 0, 0);
  } catch { /* tainted canvas — skip noise, JPEG passes still help */ }

  // ── 4. 3×3 box blur — smears spatial watermark patterns ───────────────────
  try {
    const src = tctx.getImageData(0, 0, dw, dh);
    const dst = tctx.createImageData(dw, dh);
    const s = src.data;
    const o = dst.data;
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        const idx = (y * dw + x) * 4;
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          let count = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const ny = y + dy;
              const nx = x + dx;
              if (ny >= 0 && ny < dh && nx >= 0 && nx < dw) {
                sum += s[(ny * dw + nx) * 4 + c];
                count++;
              }
            }
          }
          o[idx + c] = Math.round(sum / count);
        }
        o[idx + 3] = 255; // alpha
      }
    }
    tctx.putImageData(dst, 0, 0);
  } catch { /* skip blur if getImageData fails */ }

  // ── 5. Triple JPEG round-trip at LOW quality ──────────────────────────────
  // Each pass applies 8×8 DCT quantisation; varying the quality ensures
  // different frequency coefficients get zeroed each time. Three passes at
  // aggressive quality levels is devastating to any pixel-embedded signal.
  const jpegQualities = [0.65, 0.55, 0.70];
  for (const q of jpegQualities) {
    try {
      const jpegUrl = tmp.toDataURL('image/jpeg', q);
      const jpegImg = await loadImage(jpegUrl);
      tctx.clearRect(0, 0, dw, dh);
      tctx.drawImage(jpegImg, 0, 0, dw, dh);
    } catch {
      // If a round-trip fails, continue with what we have.
      break;
    }
  }

  return tmp;
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
      // Scrub the source image before drawing: crop, resize, noise, and JPEG
      // re-compression strip pixel-level AI watermarks (SynthID) that would
      // otherwise trigger YouTube's "Made with AI" label.
      const clean = await scrubImage(img);
      drawCover(ctx, clean);
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

// When saving into a chosen folder preset, split the two export kinds into their
// own top-level subfolders so a folder never mixes image posts with videos:
//   <chosen folder>/posts/<post>/…   and   <chosen folder>/videos/<video>.mp4
// Only applies to the folder-preset path; plain browser-download zips are
// unaffected. See lib/downloadFolders.ts.
const POSTS_SUBDIR = 'posts';
const VIDEOS_SUBDIR = 'videos';

// Render every slide to a PNG and save it. With a `dir` (a folder preset chosen
// on a Chromium browser — see lib/downloadFolders.ts) the PNGs are written
// straight into a per-post subfolder there. Without one we fall back to the
// classic <a download> link per slide; browsers throttle back-to-back
// programmatic downloads, so we space those out rather than firing all at once.
export async function downloadSlideshow(
  show: Slideshow,
  dir?: FileSystemDirectoryHandle | null,
): Promise<void> {
  const slides = await renderSlideshow(show);
  const base = slugify(show.hook || show.caption || show.id);
  if (dir) {
    for (let i = 0; i < slides.length; i++) {
      await writeFileToDir(dir, `${POSTS_SUBDIR}/${base}/${base}-${i + 1}.png`, dataUrlToBytes(slides[i]));
    }
    return;
  }
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

// Bundle several slideshows into ONE zip — or, with a `dir` (a folder preset on
// a Chromium browser), write each post's folder straight into it, no zip to
// unpack. Each post gets its own folder containing its images (named with the
// slide's order number at the end) and a text file with the title, body and
// hashtags. Without a `dir` a single browser download of the zip is triggered.
export async function downloadSlideshowsZip(
  shows: Slideshow[],
  dir?: FileSystemDirectoryHandle | null,
): Promise<void> {
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

  // Straight to the chosen folder — write every entry under the posts/ subfolder.
  if (dir) {
    for (const entry of entries) await writeFileToDir(dir, `${POSTS_SUBDIR}/${entry.name}`, entry.data);
    return;
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
// slideshow".
//
// Two encoders, picked at runtime:
//  • WebCodecs (VideoEncoder/AudioEncoder + mp4-muxer) — the DEFAULT where the
//    browser supports it (modern Chrome, Edge, Safari 17+). Frames are encoded
//    as fast as the CPU can go, NOT in real time, so a 20s clip exports in a
//    second or two and can never freeze/drop frames mid-transition. This is the
//    fix for the "laggy / few slides / frozen animation" exports.
//  • MediaRecorder (canvas.captureStream) — the FALLBACK for browsers without
//    WebCodecs. It records in real time, so export takes as long as the clip.
//
// Both share the same scene builder (prepareVideoScene) so the picture is
// identical whichever encoder runs.

const VIDEO_FPS = 30;
// H.264 bitrate. 8 Mbps is plenty for 1080×1920 slideshow content (mostly still
// frames with brief slides) and, crucially, light enough that the real-time
// fallback encoder can sustain it without dropping frames — the old 12 Mbps was
// what made MediaRecorder hitch and freeze on transitions.
const VIDEO_BITRATE = 8_000_000;
const TRANSITION_MS = 240; // quick horizontal slide from one slide to the next
// Reading pace tuned for Shorts: punchy, not lingering. Trimmed a notch tighter
// so decks feel snappier. A typical ~8-word slide lands near ~2s, so a 10-slide
// deck comes out around ~22s.
const READ_BASE_MS = 650; // floor: even a one-word slide stays up this long
const READ_PER_WORD_MS = 180; // added reading time per word
const READ_MAX_MS = 4500; // cap so a wordy slide can't stall forever
// The after half of a Characters deck reads 50% slower per word than the before
// half: those slides carry the payoff (the clean line, the blocked/streak proof
// shots) and want dwelling on, while the before slides just repeat the hook.
const AFTER_PACE = 1.5;

// How long slide `text` should stay on screen: a base plus reading time per
// word. `pace` stretches only the per-word part (and its cap) — the floor is the
// same for every slide.
function readingHoldMs(text: string, pace = 1): number {
  const words = cleanCaption(text || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.min(READ_MAX_MS * pace, READ_BASE_MS + words * READ_PER_WORD_MS * pace);
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

// Find where a track's "energetic" part begins, so the video opens on the hook/
// drop instead of a quiet intro. Scans loudness (RMS) in 0.5s windows and returns
// the first window that reaches a high fraction of the track's peak AND stays
// there briefly (so a lone transient click doesn't trigger it). Bounded to the
// first 45s and always leaves a few seconds of runway; returns 0 if nothing
// clearly louder stands out (e.g. a track that's full-energy from the top).
function detectDropOffset(buf: AudioBuffer): number {
  const data = buf.getChannelData(0);
  const sr = buf.sampleRate;
  const winLen = Math.floor(sr * 0.5);
  if (winLen <= 0) return 0;

  const rms: number[] = [];
  for (let i = 0; i + winLen <= data.length; i += winLen) {
    let sum = 0;
    for (let j = 0; j < winLen; j++) {
      const v = data[i + j];
      sum += v * v;
    }
    rms.push(Math.sqrt(sum / winLen));
  }
  if (rms.length < 4) return 0;

  const peak = Math.max(...rms);
  if (peak <= 0) return 0;
  const enter = peak * 0.7; // "loud enough" to count as the drop
  const hold = peak * 0.55; // must not dip below this during the sustain check
  const sustainWins = 3; // ~1.5s of sustained energy
  const maxWin = Math.min(rms.length - sustainWins, Math.floor(45 / 0.5));

  for (let i = 0; i < maxWin; i++) {
    if (rms[i] < enter) continue;
    let sustained = true;
    for (let k = 1; k < sustainWins; k++) {
      if (rms[i + k] < hold) { sustained = false; break; }
    }
    if (sustained) return i * 0.5;
  }
  return 0;
}

// The drawn slideshow, independent of how it's encoded: a canvas, its total
// duration in ms, and a `drawAt(t)` that paints the exact frame for time `t`.
// Shared by both encoders so the picture is identical whichever one runs.
interface VideoScene {
  canvas: HTMLCanvasElement;
  drawAt: (t: number) => void;
  total: number;
  // For a Characters before/after deck: how far into the clip (ms) the first
  // after slide lands, i.e. the cut the music drop has to hit. Undefined for
  // every other deck, which just opens on the drop instead.
  cutAt?: number;
}

async function prepareVideoScene(show: Slideshow): Promise<VideoScene> {
  const imgs = await Promise.all((await renderSlideshow(show)).map(loadImage));
  if (!imgs.length) throw new Error('This slideshow has no slides to turn into a video.');

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // A Characters deck paces its after slides slower (see AFTER_PACE); anything
  // else runs at the normal pace throughout.
  const beforeCount =
    show.kind === 'characters' ? Math.min(show.beforeSlides ?? 0, show.slides.length) : 0;
  const holds = show.slides.map((s, i) =>
    readingHoldMs(s.text, beforeCount > 0 && i >= beforeCount ? AFTER_PACE : 1)
  );
  // Where the before half ends: every before hold plus the transitions between
  // and out of them, so the first after slide is fully on screen at `cutAt`.
  const cutAt =
    beforeCount > 0 && beforeCount < show.slides.length
      ? holds.slice(0, beforeCount).reduce((n, d) => n + d, 0) + beforeCount * TRANSITION_MS
      : undefined;
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

  return { canvas, drawAt, total, cutAt };
}

// Decode + resolve a music track down to what an encoder needs: the raw buffer
// and the offset (seconds) where playback should start (the drop). Returns null
// when there's no track or it can't be read, so the video just comes out silent.
async function resolveMusic(
  ctx: BaseAudioContext,
  music: MusicTrack,
  cutAt?: number,
): Promise<{ buffer: AudioBuffer; offset: number } | null> {
  const buffer = await loadAudioBuffer(ctx as AudioContext, music.url);
  if (!buffer) return null;
  // Characters decks (cutAt set, drop pinned) don't open on the drop — they
  // START the many seconds of before-half ahead of it, so the drop lands exactly
  // on the before→after cut. If the drop sits earlier in the song than the
  // before half is long, there's nothing to rewind into, so it opens at 0:00 and
  // the drop simply arrives a little after the cut.
  const wanted =
    cutAt != null && music.drop != null
      ? music.drop - cutAt / 1000
      : music.start ?? detectDropOffset(buffer);
  const offset = Math.max(0, Math.min(wanted, Math.max(0, buffer.duration - 2)));
  return { buffer, offset };
}

// ── WebCodecs encoder (default, non-real-time) ───────────────────────────────
// Encodes the scene frame-by-frame with VideoEncoder as fast as the CPU allows,
// muxing to MP4. Because it doesn't record off a live clock, frames can't be
// dropped and transitions can't freeze — every frame is encoded exactly once.

function hasWebCodecs(): boolean {
  return (
    typeof VideoEncoder !== 'undefined' &&
    typeof VideoFrame !== 'undefined' &&
    typeof (globalThis as { OfflineAudioContext?: unknown }).OfflineAudioContext !== 'undefined'
  );
}

// Probe H.264 configs in order of preference and return the first the browser's
// VideoEncoder actually supports for our resolution, or null if none do.
async function pickAvcConfig(): Promise<VideoEncoderConfig | null> {
  // High → Main → Baseline, level 4.2 (headroom over 1080×1920@30) then 5.1.
  const codecs = ['avc1.64002A', 'avc1.4D402A', 'avc1.42002A', 'avc1.640033', 'avc1.420033'];
  for (const codec of codecs) {
    const cfg: VideoEncoderConfig = {
      codec,
      width: W,
      height: H,
      bitrate: VIDEO_BITRATE,
      framerate: VIDEO_FPS,
      // Ask for length-prefixed AVCC so mp4-muxer gets a proper avcC box.
      avc: { format: 'avc' },
    };
    try {
      const res = await VideoEncoder.isConfigSupported(cfg);
      if (res.supported) return cfg;
    } catch { /* try the next candidate */ }
  }
  return null;
}

// Builds a valid AAC-LC AudioSpecificConfig (the 2-byte "esds" payload that tells
// a player the codec's sample rate + channel count). Safari's WebCodecs
// AudioEncoder emits a broken/empty decoder config, so the muxed MP4 ends up
// declaring "0 channels" — which plays locally but jams server-side transcoders
// (YouTube gets stuck "processing" such files forever). We rebuild the config
// from the exact values we configured the encoder with, so the audio-track header
// is always correct regardless of what the browser reports.
function aacAudioSpecificConfig(sampleRate: number, channels: number): Uint8Array {
  const RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
  const objectType = 2; // AAC-LC
  const chCfg = Math.max(1, Math.min(2, channels)); // 1 = mono, 2 = stereo
  let idx = RATES.indexOf(sampleRate);
  if (idx < 0) idx = 4; // unknown rate → fall back to the 44.1kHz index
  // 5 bits objectType | 4 bits samplingFrequencyIndex | 4 bits channelConfig | 3 bits 0
  const b0 = (objectType << 3) | (idx >> 1);
  const b1 = ((idx & 1) << 7) | (chCfg << 3);
  return new Uint8Array([b0, b1]);
}

async function renderSlideshowVideoWebCodecs(
  show: Slideshow,
  music?: MusicTrack | null,
): Promise<Blob> {
  const videoConfig = await pickAvcConfig();
  if (!videoConfig) throw new Error('No supported H.264 config for WebCodecs.');

  const { canvas, drawAt, total, cutAt } = await prepareVideoScene(show);
  const frameDurUs = Math.round(1_000_000 / VIDEO_FPS);
  const frameCount = Math.max(1, Math.round((total / 1000) * VIDEO_FPS));

  // Resolve music up front so the muxer can declare an audio track (if any)
  // before we start feeding chunks. We render it offline to a single buffer,
  // looping from the drop, so a short song still covers a long clip. If audio
  // can't be encoded (AudioEncoder missing/unsupported) but music was asked for,
  // bail so the caller falls back to the real-time recorder, which keeps sound.
  const OfflineCtx: typeof OfflineAudioContext | undefined = (
    globalThis as { OfflineAudioContext?: typeof OfflineAudioContext }
  ).OfflineAudioContext;
  const AudioCtxCtor: typeof AudioContext | undefined =
    (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  let renderedAudio: AudioBuffer | null = null;
  if (music?.url && OfflineCtx && AudioCtxCtor) {
    if (typeof AudioEncoder === 'undefined') {
      throw new Error('AudioEncoder unavailable — fall back for music.');
    }
    const decodeCtx = new AudioCtxCtor();
    const resolved = await resolveMusic(decodeCtx, music, cutAt);
    await decodeCtx.close();
    if (resolved) {
      const { buffer, offset } = resolved;
      const channels = Math.min(2, buffer.numberOfChannels);
      const sampleRate = buffer.sampleRate;
      const aacCfg: AudioEncoderConfig = {
        codec: 'mp4a.40.2', // AAC-LC
        numberOfChannels: channels,
        sampleRate,
        bitrate: 128_000,
      };
      const aacOk = await AudioEncoder.isConfigSupported(aacCfg)
        .then((r) => r.supported === true)
        .catch(() => false);
      if (!aacOk) throw new Error('AAC encoding unsupported — fall back for music.');

      const frames = Math.max(1, Math.ceil((sampleRate * total) / 1000));
      const oac = new OfflineCtx(channels, frames, sampleRate);
      const src = oac.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.loopStart = offset; // loop back to the drop, not the quiet intro
      src.loopEnd = buffer.duration;
      const gain = oac.createGain();
      gain.gain.value = 0.85;
      src.connect(gain).connect(oac.destination);
      src.start(0, offset);
      renderedAudio = await oac.startRendering();
    }
  }

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: W, height: H, frameRate: VIDEO_FPS },
    audio: renderedAudio
      ? { codec: 'aac', numberOfChannels: renderedAudio.numberOfChannels, sampleRate: renderedAudio.sampleRate }
      : undefined,
    fastStart: 'in-memory',
  });

  let encodeError: unknown = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { encodeError = e; },
  });
  videoEncoder.configure(videoConfig);

  for (let f = 0; f < frameCount; f++) {
    if (encodeError) throw encodeError;
    drawAt(Math.min((f / VIDEO_FPS) * 1000, total));
    const frame = new VideoFrame(canvas, { timestamp: f * frameDurUs, duration: frameDurUs });
    videoEncoder.encode(frame, { keyFrame: f % (VIDEO_FPS * 2) === 0 });
    frame.close();
    // Backpressure: don't queue frames faster than the encoder drains them, or
    // memory balloons on a long deck. Wait for the queue to shrink before more.
    if (videoEncoder.encodeQueueSize > 30) {
      await new Promise<void>((resolve) => {
        const check = () => (videoEncoder.encodeQueueSize <= 15 ? resolve() : setTimeout(check, 4));
        check();
      });
    }
  }
  await videoEncoder.flush();
  videoEncoder.close();

  if (renderedAudio) {
    const channels = renderedAudio.numberOfChannels;
    const sampleRate = renderedAudio.sampleRate;
    // A guaranteed-correct decoder config, used to override whatever the browser
    // hands us (Safari's is broken → "0 channels"). We know these values exactly:
    // the encoder is configured with them right below.
    const description = aacAudioSpecificConfig(sampleRate, channels);
    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => {
        const fixedMeta: EncodedAudioChunkMetadata = {
          ...meta,
          decoderConfig: {
            ...(meta?.decoderConfig ?? {}),
            codec: 'mp4a.40.2',
            sampleRate,
            numberOfChannels: channels,
            description,
          },
        };
        muxer.addAudioChunk(chunk, fixedMeta);
      },
      error: (e) => { encodeError = e; },
    });
    audioEncoder.configure({ codec: 'mp4a.40.2', numberOfChannels: channels, sampleRate, bitrate: 128_000 });

    const chanData: Float32Array[] = [];
    for (let c = 0; c < channels; c++) chanData.push(renderedAudio.getChannelData(c));
    const totalSamples = renderedAudio.length;
    const block = 4096;
    for (let i = 0; i < totalSamples; i += block) {
      if (encodeError) throw encodeError;
      const n = Math.min(block, totalSamples - i);
      // f32-planar wants each channel's samples laid end-to-end.
      const data = new Float32Array(n * channels);
      for (let c = 0; c < channels; c++) data.set(chanData[c].subarray(i, i + n), c * n);
      const audioData = new AudioData({
        format: 'f32-planar',
        sampleRate,
        numberOfFrames: n,
        numberOfChannels: channels,
        timestamp: Math.round((i / sampleRate) * 1_000_000),
        data,
      });
      audioEncoder.encode(audioData);
      audioData.close();
    }
    await audioEncoder.flush();
    audioEncoder.close();
  }

  if (encodeError) throw encodeError;
  muxer.finalize();
  return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}

// ── MediaRecorder encoder (real-time fallback) ───────────────────────────────
// Used only when WebCodecs isn't available. Records the canvas in real time, so
// export takes about as long as the clip itself.
async function renderSlideshowVideoRealtime(show: Slideshow, music?: MusicTrack | null): Promise<Blob> {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('Video export needs a browser with MediaRecorder support.');
  }
  const { canvas, drawAt, total, cutAt } = await prepareVideoScene(show);

  // Capture in MANUAL mode: captureStream(0) means the browser emits a frame ONLY
  // when we call requestFrame(). This is deliberate — passing a frame rate instead
  // makes the browser auto-sample the canvas on its own clock, which grabs a STALE
  // frame whenever our render loop hitches (GC, or the H.264 encoder spiking on a
  // slide-transition keyframe). That stale-frame sampling is what makes a
  // transition freeze for a beat and then jump. With manual capture, exactly one
  // frame is emitted per frame we actually draw, so the picture can't freeze on a
  // hitch — the worst case is the clip finishing a few ms late. (Auto-capture also
  // silently ignores requestFrame(), so the old "push a frame each tick" safety net
  // never actually ran.)
  // Probe requestFrame support on a throwaway stream first: if the browser can't
  // do manual capture, captureStream(0) would emit ZERO frames, so fall back to
  // auto-capture at VIDEO_FPS.
  const probeTrack = canvas.captureStream(0).getVideoTracks()[0] as
    | CanvasCaptureMediaStreamTrack
    | undefined;
  const canRequestFrame = !!(probeTrack && typeof probeTrack.requestFrame === 'function');
  probeTrack?.stop();

  const stream = canvas.captureStream(canRequestFrame ? 0 : VIDEO_FPS);
  const videoTrack = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;
  const pushFrame = () => {
    if (canRequestFrame && videoTrack) videoTrack.requestFrame();
  };

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
  let musicOffset = 0; // seconds into the track where playback should begin
  if (music?.url && AudioCtx) {
    audioCtx = new AudioCtx();
    // Same resolution as the WebCodecs path: open on the drop, or — for a
    // Characters deck — far enough ahead of it that the drop lands on the cut.
    const resolved = await resolveMusic(audioCtx, music, cutAt);
    if (resolved) {
      const { buffer } = resolved;
      musicOffset = resolved.offset;

      const dest = audioCtx.createMediaStreamDestination();
      const gain = audioCtx.createGain();
      gain.gain.value = 0.85;
      musicSource = audioCtx.createBufferSource();
      musicSource.buffer = buffer;
      musicSource.loop = true;
      // Loop back to the drop (not 0:00) so a short song doesn't fall into its
      // quiet intro on repeat.
      musicSource.loopStart = musicOffset;
      musicSource.loopEnd = buffer.duration;
      musicSource.connect(gain).connect(dest);
      dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    } else {
      await audioCtx.close();
      audioCtx = null;
    }
  }

  const mimeType = pickVideoMime();
  const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: VIDEO_BITRATE });
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve) => {
    rec.onstop = () => resolve();
  });

  drawAt(0); // seed the first frame before recording starts
  // Flush a chunk every second (timeslice) so a long or briefly-backgrounded
  // recording streams its data out instead of buffering the whole clip until
  // stop() — which on some browsers can drop the tail.
  rec.start(1000);
  pushFrame();
  if (musicSource && audioCtx) {
    // Begin on the drop and stop exactly when the video ends, so the audio can
    // never outlast the picture even if the recording is uneven.
    musicSource.start(0, musicOffset);
    try {
      musicSource.stop(audioCtx.currentTime + total / 1000);
    } catch { /* stop-scheduling unsupported — stopped manually below */ }
  }

  // Drive the render off the WALL CLOCK (performance.now), so time — and the audio,
  // which plays on the real clock — never drift from the picture. While the tab is
  // VISIBLE we schedule via requestAnimationFrame: it's synced to the display's
  // refresh, so frames land on an even cadence and transitions read smoothly. rAF
  // is paused entirely while the tab is hidden, though, which would freeze the
  // canvas mid-clip while the audio played on — so we fall back to setTimeout
  // whenever the page isn't visible (it throttles when backgrounded but never
  // pauses). Either way each tick draws for the current wall-clock time and pushes
  // exactly one frame, so a slow tick just draws the right frame a little late
  // rather than freezing the output.
  await new Promise<void>((resolve) => {
    const startT = performance.now();
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    const frameMs = 1000 / VIDEO_FPS;
    const schedule = (fn: () => void) => {
      if (typeof requestAnimationFrame === 'function' && document?.visibilityState !== 'hidden') {
        requestAnimationFrame(fn);
      } else {
        setTimeout(fn, frameMs);
      }
    };
    const tick = () => {
      if (done) return;
      const t = performance.now() - startT;
      drawAt(Math.min(t, total));
      pushFrame();
      if (t >= total) { finish(); return; }
      schedule(tick);
    };
    tick();
    // Hard safety net: guarantee we stop even if the timer chain is throttled far
    // past its schedule, so a render can't hang indefinitely.
    setTimeout(finish, total + 1000);
  });
  drawAt(total);
  pushFrame();
  rec.stop();
  await stopped;
  try {
    musicSource?.stop();
  } catch { /* already stopped */ }
  if (audioCtx) await audioCtx.close();

  return new Blob(chunks, { type: mimeType });
}

// Render one slideshow to a video Blob (MP4). Uses the fast WebCodecs encoder
// where the browser supports it — encoding runs far quicker than the clip and
// can't drop frames — and transparently falls back to the real-time
// MediaRecorder path otherwise (or if WebCodecs errors, e.g. no AAC encoder for
// a music track). `music`, when given, is mixed in as a background track
// (looped/trimmed to the clip, starting on its pinned `start` or an auto-detected
// drop); a missing or unreadable track just yields a silent video.
export async function renderSlideshowVideo(show: Slideshow, music?: MusicTrack | null): Promise<Blob> {
  if (hasWebCodecs()) {
    try {
      return await renderSlideshowVideoWebCodecs(show, music);
    } catch (err) {
      // Any WebCodecs failure (unsupported config, no AAC encoder, runtime
      // error) drops us to the real-time recorder so the export still succeeds.
      console.warn('WebCodecs video export failed; using real-time recorder.', err);
    }
  }
  return renderSlideshowVideoRealtime(show, music);
}

// Download selected slideshows as video(s). A single selection saves one file
// (.mp4 where supported, else .webm); several are bundled into one zip.
// `onProgress` reports how many are finished so the UI can show live progress
// during the (real-time) render.
export async function downloadSlideshowsVideo(
  shows: Slideshow[],
  onProgress?: (done: number, total: number) => void,
  music?: MusicGender | null,
  dir?: FileSystemDirectoryHandle | null,
): Promise<void> {
  if (!shows.length) return;

  // Each video gets its own randomly-picked track from the chosen pool, so a
  // batch doesn't all share one song. No pool / empty pool → silent video.
  // Characters decks draw from the Characters music library, everything else
  // from the video one — they hide tracks independently.
  const trackFor = async (show: Slideshow) =>
    music ? await pickMusicTrack(music, show.kind === 'characters' ? 'characters' : 'video') : null;

  // Single selection → one plain video file plus its metadata sidecar.
  if (shows.length === 1) {
    onProgress?.(0, 1);
    const blob = await renderSlideshowVideo(shows[0], await trackFor(shows[0]));
    onProgress?.(1, 1);
    const base = slugify(shows[0].hook || shows[0].caption || shows[0].id);
    const videoName = `${base}.${extForMime(blob.type)}`;
    const metaJson = videoMetaJson(shows[0]);
    // Straight into the chosen folder — video + sidecar under videos/, no zip.
    if (dir) {
      await writeFileToDir(dir, `${VIDEOS_SUBDIR}/${videoName}`, new Uint8Array(await blob.arrayBuffer()));
      await writeFileToDir(dir, `${VIDEOS_SUBDIR}/${base}.json`, new TextEncoder().encode(metaJson));
      return;
    }
    const saveFile = (href: string, name: string) => {
      const a = document.createElement('a');
      a.href = href;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    };
    const url = URL.createObjectURL(blob);
    saveFile(url, videoName);
    URL.revokeObjectURL(url);
    // Space the second download out — browsers throttle back-to-back saves.
    await new Promise((r) => setTimeout(r, 200));
    const metaUrl = URL.createObjectURL(new Blob([metaJson], { type: 'application/json' }));
    saveFile(metaUrl, `${base}.json`);
    URL.revokeObjectURL(metaUrl);
    return;
  }

  // Several → render each and bundle into one zip (stored, since the video is
  // already compressed), stamped in order so they sort by "date modified". With
  // a chosen folder, write each video + sidecar straight in instead of zipping.
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

    const blob = await renderSlideshowVideo(show, await trackFor(show));
    const videoName = `${name}.${extForMime(blob.type)}`;
    const videoBytes = new Uint8Array(await blob.arrayBuffer());
    const metaBytes = new TextEncoder().encode(videoMetaJson(show));
    if (dir) {
      await writeFileToDir(dir, `${VIDEOS_SUBDIR}/${videoName}`, videoBytes);
      await writeFileToDir(dir, `${VIDEOS_SUBDIR}/${name}.json`, metaBytes);
    } else {
      entries.push({ name: videoName, data: videoBytes, date: new Date(base + i * 60_000) });
      // A metadata sidecar next to each video so the whole zip is upload-ready.
      entries.push({ name: `${name}.json`, data: metaBytes, date: new Date(base + i * 60_000) });
    }
    onProgress?.(i + 1, shows.length);
  }

  if (dir) return; // already written straight into the folder

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
