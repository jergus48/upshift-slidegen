---
name: video-export-must-be-lag-free
description: Video export performance is a hard requirement — must not lag, drop slides, or freeze
metadata:
  type: feedback
---

Video export performance is a top priority for the user ("I need it without lags"). Complaints that triggered this: exports lagged, showed only a few slides, and froze during transition animations — otherwise they love the tool ("goated").

**Why:** The original pipeline recorded the canvas in REAL TIME (`canvas.captureStream` + `MediaRecorder` at 12 Mbps, 1080×1920). Real-time recording is bounded by clip length (a batch = clip length × N) and the heavy encoder silently dropped frames → frozen/jumpy transitions and missing slides.

**How to apply:** Video is now encoded in `src/lib/render.ts` via WebCodecs (`VideoEncoder`/`AudioEncoder` + `mp4-muxer`) as the DEFAULT — encodes faster than real time, never drops frames, correct MP4 duration. `MediaRecorder` real-time is only a fallback for browsers without WebCodecs. Bitrate is `VIDEO_BITRATE` (8 Mbps). User runs both Chrome and Safari (17+), both support the fast path. Never regress back to a real-time-only encoder.
