# Memory index

- [YouTube character pipeline](youtube-character-pipeline.md) — multi-channel YT auto-posting via post-bridge inside SlideSmith; step 1 (sidecar + video-in-scheduler) done, slot-filler next.
- [Video export must be lag-free](video-export-must-be-lag-free.md) — hard perf requirement; export now uses WebCodecs (fast, no dropped frames) with MediaRecorder as fallback.
- [Channels dashboard is no-API](channels-dashboard-no-api.md) — YouTube Shorts tracker uses public page + RSS scraping only; user chose no API key. Don't add one unprompted.
- [Scrub: quality over watermark](scrub-quality-over-watermark.md) — diffusion + destructive canvas scrub removed; invisible LSB dither only, never regress.
