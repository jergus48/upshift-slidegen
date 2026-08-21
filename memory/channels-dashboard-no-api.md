---
name: channels-dashboard-no-api
description: Channels tab tracks YouTube Shorts across channels using ONLY public data — no YouTube API key
metadata:
  type: project
---

The "Channels" tab (added 2026-08-10) is a dashboard showing each tracked YouTube channel's latest 5 uploads with views, likes, thumbnails, and age. Code: `server/youtube.js`, `src/views/ChannelsView.tsx`, `src/lib/localChannels.ts`, route in `server/app.js` (`POST /api/youtube/channels`).

**Why (user's explicit choice):** The user did NOT want to deal with a YouTube Data API key ("just give you link and show me views/likes... simple stuff"). So it scrapes only public, unauthenticated surfaces: the channel page HTML (id via canonical link, name+avatar via og:title/og:image) and the channel RSS feed `feeds/videos.xml` (per-video views via `media:statistics`, likes via `media:starRating count`).

**How to apply:** Do NOT add a YouTube API key / Data API dependency unless the user asks. This scraping approach can break if YouTube changes its page/feed markup — that's the accepted trade-off. Fetches need a desktop UA + `Cookie: CONSENT=YES+1` + follow redirects or YouTube serves a consent interstitial. Tracked channel links live in browser localStorage (`slidesmith:channels`), not server-side. Related: [[video-export-must-be-lag-free]].

**2026-08-11 — RSS feed endpoint broke.** `feeds/videos.xml` started returning generic Google Error 404/500 pages for EVERY channel (verified against MrBeast too — not a bad-handle or Vercel-IP issue). Surfaced as "feed 404/500" in the dashboard. Fix (commit 397b802): `server/youtube.js` now keeps RSS as primary but falls back to scraping the channel `/videos` page's `ytInitialData` when the feed fails. Parses both long-form `lockupViewModel` and Shorts `shortsLockupViewModel` (these channels are Shorts-only). Fallback limitation: no like counts (always 0) and Shorts carry NO publish date (`publishedAt:''`), so Shorts get excluded under any non-"all" time filter. If YouTube fixes the feed, the primary path resumes automatically with full data.
