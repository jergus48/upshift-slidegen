import type { CSSProperties } from 'react';

// ─── Single source of truth for caption styling ─────────────────────────────
// Both the on-screen editor preview (SlidePreview.tsx, plain CSS) AND the
// exported PNG (lib/render.ts, canvas) consume these exact numbers, so a slide
// in the editor looks pixel-equivalent to the baked image that gets scheduled —
// just at a different physical size. Tweak the look in ONE place.
//
// Values are percent-of-slide-height. The preview expresses them as container
// query height units (cqh); the bake multiplies them by the canvas height.

// Caption font size as a percent of slide height. 2.7% of a 1080×1920 slide
// ≈ 52px in the baked PNG — a clean, readable TikTok caption.
export const FONT_SIZE_PCT = 2.7;

// Black outline width as a fraction of the font size — the TikTok/CapCut look.
export const STROKE_RATIO = 0.08;

// Line-height multiple, shared by both renderers.
export const LINE_HEIGHT = 1.2;

// Horizontal safe-zone padding as a percent of slide width.
export const SIDE_PAD_PCT = 8;

// Convert a percent (e.g. 8) to a ratio (0.08) for canvas math.
export const pct = (p: number) => p / 100;

// ─── Caption font styles ────────────────────────────────────────────────────
// The user can pick the caption look per slideshow:
//  • 'app'    — the app default: Inter, extra-bold, thin clean outline.
//  • 'tiktok' — the classic TikTok caption look: Helvetica/Arial family, bold,
//               with the heavier black outline TikTok uses on its default text.
// Both renderers (CSS preview + canvas bake) read the SAME numbers here so they
// always match. Note: TikTok's exact caption font is proprietary; this is a
// close, honest approximation using the web-safe Helvetica/Arial family.
export type CaptionStyle = 'app' | 'tiktok';

export interface CaptionStyleSpec {
  fontFamily: string;
  fontWeight: number;
  strokeRatio: number; // black outline width as a fraction of the font size
}

export const CAPTION_STYLES: Record<CaptionStyle, CaptionStyleSpec> = {
  app: {
    fontFamily: "Inter, sans-serif",
    fontWeight: 800,
    strokeRatio: STROKE_RATIO,
  },
  tiktok: {
    // TikTok Sans — TikTok's official font (open-source, SIL OFL 1.1). Heavy
    // weight + thick outline give the recognizable TikTok caption look.
    fontFamily: "'TikTok Sans', 'Helvetica Neue', Arial, sans-serif",
    fontWeight: 800,
    strokeRatio: 0.16,
  },
};

export const DEFAULT_CAPTION_STYLE: CaptionStyle = 'app';

export function captionStyleSpec(style?: CaptionStyle): CaptionStyleSpec {
  return CAPTION_STYLES[style || DEFAULT_CAPTION_STYLE] ?? CAPTION_STYLES.app;
}

// ─── CSS for the preview overlay text ───────────────────────────────────────
// The slide container MUST carry SLIDE_CONTAINER_STYLE (containerType: 'size')
// so `cqh` resolves to a percent of the slide's height, not the viewport.
export function captionTextStyle(style?: CaptionStyle): CSSProperties {
  const spec = captionStyleSpec(style);
  const strokePct = FONT_SIZE_PCT * spec.strokeRatio;
  return {
    fontSize: `${FONT_SIZE_PCT}cqh`,
    fontFamily: spec.fontFamily,
    WebkitTextStroke: `${strokePct}cqh black`,
    paintOrder: 'stroke fill', // stroke under fill — clean outline, no eaten glyphs
    fontWeight: spec.fontWeight,
    color: '#ffffff',
    lineHeight: LINE_HEIGHT,
    textAlign: 'center',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxWidth: '100%',
  };
}

// Put this on the slide container so the cqh units above work.
export const SLIDE_CONTAINER_STYLE: CSSProperties = { containerType: 'size' };
