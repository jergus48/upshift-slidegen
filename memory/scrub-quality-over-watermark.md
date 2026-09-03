---
name: scrub-quality-over-watermark
description: Image quality beats watermark removal — never reintroduce the diffusion or destructive canvas scrub in the video pipeline
metadata:
  type: feedback
---

In the slide/video pipeline, visible image quality outranks aggressive AI-watermark
removal. The user's words: "the old diffusion destroyed image quality, completely" and
"I just want something simple, no watermark — I thought the package doesn't change quality."

**Why:** Two failed attempts, both removed on 2026-09-03:
- Server-side `noai-watermark` diffusion (`/api/scrub`, `server/scrub.js`). Unusable on this
  machine: torch is CPU-only (`2.14.0+cpu`) and it wants a ~2GB `Lykon/dreamshaper-8`
  download. A 10-minute test never finished downloading, let alone ran inference.
- The `browserScrubFallback` canvas path it silently fell through to: 25-30% downscale,
  `blur(1.5px)`, +/-10 noise, brightness shift, 5x JPEG at quality 0.30-0.50. THIS is what
  actually produced the grainy, dark, mushy slides — not the diffusion.

**How to apply:** The scrub is now `ditherInPlace` in `src/lib/render.ts` — a +/-1 LSB dither
on the finished 1080x1920 frame. Max delta 2/255, invisible, but randomizes the LSB plane;
the cover-resample plus dark overlay plus re-encode already rewrite every pixel. ~436ms per
slide. Do NOT add downscaling, blur, visible noise, or low-quality JPEG round-trips to this
path, and do not bring back a per-image model process. `src/lib/scrubImage.ts`
(RedditView/ScrubView) is a SEPARATE feature — leave it alone. See
[[video-export-must-be-lag-free]].
