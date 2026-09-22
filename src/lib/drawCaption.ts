// The caption overlay, drawn on a canvas — shared by every renderer that bakes
// text onto a frame: the still-slide bake (lib/render.ts, which feeds the
// slideshow videos) and the Video tool's clip overlay (lib/videoOverlay.ts).
//
// Geometry comes from lib/captionStyle.ts, the SAME constants the on-screen
// editor preview uses, so a caption looks identical in the preview, in a baked
// slide PNG and burnt into a video clip.
import {
  FONT_SIZE_PCT,
  LINE_HEIGHT,
  SIDE_PAD_PCT,
  pct,
  captionStyleSpec,
  primaryFontFamily,
  cleanCaption,
  type CaptionStyle,
  type CaptionStyleSpec,
} from './captionStyle';

// Word-wrap within hard newlines, mirroring the preview's wrapping.
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
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

// Make sure the caption font is actually loaded before drawing — a web font
// that's declared but never used in the DOM isn't "pending", so awaiting
// fonts.ready alone can still bake with a fallback. Load by the PRIMARY family
// only; passing the whole fallback list can make fonts.load() throw, which
// would silently leave the canvas baking in Arial.
export async function loadCaptionFont(spec: CaptionStyleSpec): Promise<void> {
  const primary = primaryFontFamily(spec.fontFamily);
  try {
    await document.fonts?.load(`${spec.fontWeight} 100px "${primary}"`);
  } catch { /* fonts API unavailable — fall through to whatever's loaded */ }
  if (document.fonts?.ready) await document.fonts.ready;
}

// Paint one caption: white bold text, black outline, centered both ways inside
// a `w` x `h` frame. `yCenter` (0..1) moves the block off centre — the Video
// tool uses it to lift captions above a phone UI, slides leave it at 0.5.
export function drawCaption(
  ctx: CanvasRenderingContext2D,
  text: string,
  w: number,
  h: number,
  style?: CaptionStyle,
  yCenter = 0.5,
): void {
  const spec = captionStyleSpec(style);
  const fontPx = Math.round(h * pct(FONT_SIZE_PCT));
  const lineHeight = Math.round(fontPx * LINE_HEIGHT);
  const strokeW = Math.max(2, Math.round(fontPx * spec.strokeRatio));

  ctx.save();
  ctx.font = `${spec.fontWeight} ${fontPx}px ${spec.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  const maxWidth = w * (1 - 2 * pct(SIDE_PAD_PCT));
  const lines = wrapText(ctx, cleanCaption(text || ''), maxWidth);
  const blockH = lines.length * lineHeight;
  const startY = h * yCenter - blockH / 2;
  const x = w / 2;

  for (let i = 0; i < lines.length; i++) {
    const y = startY + i * lineHeight;
    // Paint stroke first, fill on top — same effect as CSS paint-order: stroke fill.
    ctx.strokeStyle = 'black';
    ctx.lineWidth = strokeW;
    ctx.strokeText(lines[i], x, y);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(lines[i], x, y);
  }
  ctx.restore();
}
