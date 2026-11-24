// Draws the two "card" looks used by the Brain / Meme list tools on a canvas:
//   article — plain page, light Inter text, [[underlined]] phrases, photos with
//             text wrapping beside them (the "day 1 to 3: everything is boring" look)
//   mode    — pastel square, bold "EASY MODE:" title, dash list on the right,
//             meme picture bottom-left, small pictures under the list
//
// ONE routine for the baked 1080x1920 PNG (lib/render.ts) and the small preview
// (components/SlidePreview.tsx), which just draws it scaled down. Both looks are
// designed on a 3:4 / 1:1 page, so the page is centred on the 9:16 canvas and the
// background colour fills the rest.
import type { CardSpec, ArticleBlock } from '../types';
import { resolveImageSrc } from './imageSrc';

const W = 1080;
const H = 1920;
const INTER = "Inter, 'Helvetica Neue', Arial, sans-serif";
const HELV = "'Helvetica Neue', Helvetica, Arial, sans-serif";

// ── Images ──────────────────────────────────────────────────────────────────
const imageCache = new Map<string, Promise<HTMLImageElement | null>>();

function loadRef(ref?: string): Promise<HTMLImageElement | null> {
  if (!ref) return Promise.resolve(null);
  let p = imageCache.get(ref);
  if (!p) {
    p = (async () => {
      // "ref#left" / "ref#right": one half of a side-by-side picture.
      const half = /#(left|right)$/.exec(ref)?.[1];
      if (half) {
        const whole = await loadRef(ref.replace(/#(left|right)$/, ''));
        if (!whole) return null;
        const c = document.createElement('canvas');
        const sw = Math.round(whole.width * 0.46);
        c.width = sw;
        c.height = whole.height;
        c.getContext('2d')!.drawImage(whole, half === 'left' ? 0 : whole.width - sw, 0, sw, whole.height, 0, 0, sw, whole.height);
        return new Promise<HTMLImageElement | null>((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = c.toDataURL('image/png');
        });
      }
      const src = await resolveImageSrc(ref);
      if (!src) return null;
      return new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        // Remote images would taint the canvas — same-origin proxy, like render.ts.
        img.src = /^https?:\/\//i.test(src) ? `/api/photo?u=${encodeURIComponent(src)}` : src;
      });
    })();
    imageCache.set(ref, p);
    p.then((img) => { if (!img) imageCache.delete(ref); });
  }
  return p;
}

// Whole picture, never cropped — the originals show the full photo.
function fit(img: HTMLImageElement, maxW: number, maxH: number): { w: number; h: number } {
  const s = Math.min(maxW / img.width, maxH / img.height);
  return { w: img.width * s, h: img.height * s };
}

// ── Rich text: [[underlined]] phrases ───────────────────────────────────────
interface Word {
  t: string;
  u: boolean;
  // Attached to the previous word with no space (punctuation right after a [[phrase]]).
  glue?: boolean;
}

function tokenize(text: string): (Word | 'nl')[] {
  const out: (Word | 'nl')[] = [];
  let u = false;
  // Did the text just before this part end without whitespace? Only then does a
  // part starting with punctuation ("[[phrase]], then") attach to it.
  let prevOpen = false;
  for (const part of text.split(/(\[\[|\]\])/)) {
    if (part === '[[') { u = true; continue; }
    if (part === ']]') { u = false; continue; }
    if (!part) continue;
    const lines = part.split('\n');
    lines.forEach((line, i) => {
      if (i > 0) { out.push('nl'); prevOpen = false; }
      const glueFirst = i === 0 && prevOpen && /^\S/.test(line);
      line.split(/\s+/).filter(Boolean).forEach((w, wi) => out.push({ t: w, u, glue: wi === 0 && glueFirst }));
      if (line) prevOpen = !/\s$/.test(line);
    });
  }
  return out;
}

function layoutRich(ctx: CanvasRenderingContext2D, text: string, maxW: number): Word[][] {
  const lines: Word[][] = [];
  let cur: Word[] = [];
  let curW = 0;
  const space = ctx.measureText(' ').width;
  for (const tok of tokenize(text)) {
    if (tok === 'nl') { lines.push(cur); cur = []; curW = 0; continue; }
    const w = ctx.measureText(tok.t).width;
    const next = cur.length ? curW + (tok.glue ? 0 : space) + w : w;
    if (next > maxW && cur.length && !tok.glue) {
      lines.push(cur);
      cur = [tok];
      curW = w;
    } else {
      cur.push(tok);
      curW = next;
    }
  }
  if (cur.length) lines.push(cur);
  return lines;
}

// ── Scattered small pictures ────────────────────────────────────────────────
// The small "this is the thing on the list" pictures go wherever the text leaves
// room, a little tilted, like the hand-placed ones in the reference. Placement is
// seeded from the card's own content, so the preview and the export match.
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const hits = (a: Rect, b: Rect, pad: number) =>
  a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;

function scatter(
  ctx: CanvasRenderingContext2D, thumbs: HTMLImageElement[], occupied: Rect[], area: Rect,
  seed: number, minSize: number, maxSize: number,
) {
  const rnd = seededRandom(seed);
  const placed: Rect[] = [...occupied];
  for (const img of thumbs) {
    let box = minSize + rnd() * (maxSize - minSize);
    for (let attempt = 0; attempt < 140; attempt++) {
      // Shrink if the space is tight, down to 70% of the minimum.
      if (attempt > 0 && attempt % 35 === 0) box = Math.max(minSize * 0.7, box * 0.82);
      const sz = fit(img, box, box);
      const rect: Rect = {
        x: area.x + rnd() * Math.max(0, area.w - sz.w),
        y: area.y + rnd() * Math.max(0, area.h - sz.h),
        w: sz.w,
        h: sz.h,
      };
      if (placed.some((p) => hits(rect, p, 14))) continue;
      const rot = (rnd() - 0.5) * 0.28;
      ctx.save();
      ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
      ctx.rotate(rot);
      ctx.drawImage(img, -rect.w / 2, -rect.h / 2, rect.w, rect.h);
      ctx.restore();
      placed.push(rect);
      break;
    }
  }
}

const loadedThumbs = (card: CardSpec, imgs: Map<string, HTMLImageElement | null>) =>
  (card.thumbs || []).map((r) => imgs.get(r) ?? null).filter((i): i is HTMLImageElement => !!i);

// Draws wrapped rich text; returns its height. `occ` collects each line's box.
function drawRich(
  ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number,
  size: number, lh: number, ink: string, occ?: Rect[],
): number {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const lines = layoutRich(ctx, text, maxW);
  const space = ctx.measureText(' ').width;
  lines.forEach((line, li) => {
    const ty = y + li * lh;
    let cx = x;
    if (occ) {
      const lineW = line.reduce((n, w, i) => n + ctx.measureText(w.t).width + (i > 0 && !w.glue ? space : 0), 0);
      occ.push({ x, y: ty, w: lineW, h: lh });
    }
    let runStart: number | null = null;
    line.forEach((w, i) => {
      if (w.u && runStart === null) runStart = cx;
      ctx.fillStyle = ink;
      ctx.fillText(w.t, cx, ty);
      const end = cx + ctx.measureText(w.t).width;
      const nextU = line[i + 1]?.u;
      if (runStart !== null && !(w.u && nextU)) {
        ctx.fillStyle = ink;
        ctx.fillRect(runStart, ty + size * 1.08, end - runStart, Math.max(2, Math.round(size * 0.055)));
        runStart = null;
      }
      cx = end + (line[i + 1]?.glue ? 0 : space);
    });
  });
  return lines.length * lh;
}

// ── Article look ────────────────────────────────────────────────────────────
function drawArticle(ctx: CanvasRenderingContext2D, card: CardSpec, imgs: Map<string, HTMLImageElement | null>) {
  const wideFirst = (card.blocks || []).some((b) => b.kind === 'img' && b.wide);
  const M = wideFirst ? 97 : 42;
  const maxW = W - M * 2;
  let y = 220;
  const occ: Rect[] = [];

  const big = !!card.big;
  if (big) y = 260;
  const tSize = big ? 96 : 64;
  ctx.font = `${big ? 600 : 400} ${tSize}px ${INTER}`;
  y += drawRich(ctx, card.title, M, y, maxW, tSize, tSize + 12, card.ink, occ) + (big ? 70 : 56);

  for (const b of card.blocks || []) {
    if (b.kind === 'p') {
      const pSize = big ? 58 : 40;
      ctx.font = `400 ${pSize}px ${INTER}`;
      y += drawRich(ctx, b.text, M, y, maxW, pSize, Math.round(pSize * 1.28), card.ink, occ) + (big ? 50 : 34);
      continue;
    }
    const img = b.ref ? imgs.get(b.ref) ?? null : null;
    if (!img) {
      // No picture available — the paragraph beside it still has to appear.
      if (b.sideText) {
        ctx.font = `400 40px ${INTER}`;
        y += drawRich(ctx, b.sideText, M, y, maxW, 40, 50, card.ink, occ) + 34;
      }
      continue;
    }
    if (b.side === 'solo') {
      const img2 = b.ref2 ? imgs.get(b.ref2) ?? null : null;
      const label = (text: string | undefined, cx: number) => {
        if (!text) return;
        ctx.font = `600 36px ${INTER}`;
        ctx.fillStyle = card.ink;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(text, cx, y);
        ctx.textAlign = 'left';
        occ.push({ x: cx - ctx.measureText(text).width / 2, y, w: ctx.measureText(text).width, h: 46 });
      };
      if (img2) {
        const gap = 30;
        const cw = (maxW - gap) / 2;
        const a = fit(img, cw, 600);
        const c = fit(img2, cw, 600);
        const top = y + (b.label || b.label2 ? 56 : 0);
        label(b.label, M + cw / 2);
        label(b.label2, M + cw + gap + cw / 2);
        const ah = Math.max(a.h, c.h);
        ctx.drawImage(img, M + (cw - a.w) / 2, top + (ah - a.h) / 2, a.w, a.h);
        ctx.drawImage(img2, M + cw + gap + (cw - c.w) / 2, top + (ah - c.h) / 2, c.w, c.h);
        occ.push({ x: M, y: top, w: maxW, h: ah });
        y = top + ah + 30;
      } else {
        const sz = fit(img, b.wide ? maxW : 626, b.wide ? 700 : 520);
        const top = y + (b.label ? 56 : 0);
        label(b.label, M + sz.w / 2);
        ctx.drawImage(img, M, top, sz.w, sz.h);
        occ.push({ x: M, y: top, w: sz.w, h: sz.h });
        y = top + sz.h + 30;
      }
      if (b.caption) {
        ctx.font = `400 36px ${INTER}`;
        y += drawRich(ctx, b.caption, M, y, maxW, 36, 46, card.ink, occ) + 30;
      }
      continue;
    }
    // Picture beside a paragraph.
    const sz = fit(img, 520, 700);
    const gap = 44;
    const imgX = b.side === 'left' ? M : W - 89 - sz.w;
    const textX = b.side === 'left' ? M + sz.w + gap : M;
    const textW = b.side === 'left' ? W - M - textX : imgX - gap - M;
    ctx.drawImage(img, imgX, y, sz.w, sz.h);
    occ.push({ x: imgX, y, w: sz.w, h: sz.h });
    let th = 0;
    if (b.sideText) {
      ctx.font = `400 40px ${INTER}`;
      th = drawRich(ctx, b.sideText, textX, y + 8, textW, 40, 50, card.ink, occ);
    }
    y += Math.max(sz.h, th) + 40;
  }

  // Small pictures in whatever space the page has left (top band, margins, bottom).
  const thumbs = loadedThumbs(card, imgs);
  if (thumbs.length) {
    scatter(ctx, thumbs, occ, { x: 16, y: 16, w: W - 32, h: 1408 }, hashString(card.title), 195, 290);
  }
}

// ── Mode look ───────────────────────────────────────────────────────────────
// Designed on 1440 and scaled by 0.75 onto a 1080 square.
function drawMode(ctx: CanvasRenderingContext2D, card: CardSpec, imgs: Map<string, HTMLImageElement | null>) {
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = card.ink;
  const occ: Rect[] = [];
  ctx.font = `800 52px ${HELV}`;
  card.title.toUpperCase().split('\n').forEach((line, i) => {
    ctx.fillText(line, 35, 38 + i * 56);
    occ.push({ x: 35, y: 38 + i * 56, w: ctx.measureText(line).width, h: 56 });
  });

  const listX = 525;
  const listW = W - 30 - listX;
  const lh = 53;
  ctx.font = `300 46px ${HELV}`;
  let y = 215;
  const drawLine = (line: string) => {
    ctx.fillText(line, listX, y);
    occ.push({ x: listX, y, w: ctx.measureText(line).width, h: lh });
    y += lh;
  };
  for (const item of card.items || []) {
    const text = item.startsWith('-') ? item : `-${item}`;
    // Plain word wrap, continuation lines start flush with the dash like the original.
    const words = text.split(' ');
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > listW && line) {
        drawLine(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) drawLine(line);
  }

  // Meme picture, bottom-left.
  const main = card.image ? imgs.get(card.image) ?? null : null;
  if (main) {
    const sz = fit(main, 480, 520);
    ctx.drawImage(main, 34, 920 - sz.h, sz.w, sz.h);
    occ.push({ x: 34, y: 920 - sz.h, w: sz.w, h: sz.h });
  }

  if (card.handle) {
    ctx.fillStyle = card.ink;
    ctx.font = `800 38px ${HELV}`;
    ctx.fillText(card.handle, 12, 1018);
    occ.push({ x: 12, y: 1018, w: ctx.measureText(card.handle).width, h: 44 });
  }

  // Small pictures of the list's things, scattered around the text and the meme.
  const thumbs = loadedThumbs(card, imgs);
  if (thumbs.length) {
    scatter(ctx, thumbs, occ, { x: 10, y: 10, w: W - 20, h: 1060 }, hashString(card.title + (card.items || []).join("|")), 190, 280);
  }
}

// ── Entry point ─────────────────────────────────────────────────────────────
function refsOf(card: CardSpec): string[] {
  const refs: string[] = [];
  for (const b of card.blocks || []) if (b.kind === 'img') { if (b.ref) refs.push(b.ref); if (b.ref2) refs.push(b.ref2); }
  if (card.image) refs.push(card.image);
  refs.push(...(card.thumbs || []));
  return refs;
}

// Draws `card` into a canvas of any 9:16 size; the canvas must already be sized.
export async function drawCard(ctx: CanvasRenderingContext2D, card: CardSpec, w: number, h: number): Promise<void> {
  try {
    await Promise.all([
      document.fonts?.load(`400 40px Inter`),
      document.fonts?.load(`300 40px Inter`),
    ]);
  } catch { /* fonts API unavailable */ }
  const refs = [...new Set(refsOf(card))];
  const loaded = await Promise.all(refs.map((r) => loadRef(r)));
  const imgs = new Map<string, HTMLImageElement | null>(refs.map((r, i) => [r, loaded[i]]));

  ctx.save();
  ctx.scale(w / W, h / H);
  ctx.fillStyle = card.bg;
  ctx.fillRect(0, 0, W, H);
  if (card.layout === 'article') {
    ctx.translate(0, (H - 1440) / 2);
    drawArticle(ctx, card, imgs);
  } else {
    ctx.translate(0, (H - 1080) / 2);
    drawMode(ctx, card, imgs);
  }
  ctx.restore();
}

export type { ArticleBlock };
