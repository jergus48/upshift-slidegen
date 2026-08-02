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
    img.src = src;
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
// hashtags, and the folder it lives in.
function captionFile(show: Slideshow, folder: string): string {
  const tags = show.hashtags.map((t) => `#${t}`).join(' ');
  return [
    `Title: ${show.hook || ''}`,
    '',
    'Body:',
    show.caption || '',
    '',
    `Hashtags: ${tags}`,
    '',
    `Folder: ${folder}`,
    '',
  ].join('\n');
}

// Bundle several slideshows into ONE zip. Each post gets its own folder
// containing its images (named with the slide's order number at the end) and a
// text file with the title, body, hashtags and folder name. Triggers a single
// browser download.
export async function downloadSlideshowsZip(shows: Slideshow[]): Promise<void> {
  const entries: ZipEntry[] = [];
  const usedFolders = new Set<string>();

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
      entries.push({ name: `${folder}/${folder}-${i + 1}.png`, data: dataUrlToBytes(dataUrl) });
    });
    entries.push({
      name: `${folder}/${folder}.txt`,
      data: new TextEncoder().encode(captionFile(show, folder)),
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
