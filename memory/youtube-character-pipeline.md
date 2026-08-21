---
name: youtube-character-pipeline
description: Multi-channel YouTube "character" auto-posting — decision to build on post-bridge inside SlideSmith, not a separate app
metadata:
  type: project
---

Goal: automate posting vertical slideshow videos to multiple YouTube channels
(one per "character"), scheduled at viral-in-USA times, capped safely under
YouTube's own ~15/day upload limit, re-run in batches.

**UPDATE (pivot): user's post-bridge plan does NOT include API access (paid ~$5/mo
add-on) and they dislike post-bridge. Switched to a Puppeteer script driving the
real logged-in Chrome (same pattern as
C:\Users\Jergus\Desktop\Upshift\internalTools\genScript\genScript\automate.js —
CDP trusted input, connect to Chrome launched with --remote-debugging-port=9222).
No API, no post-bridge, no fee. New file:
genScript/genScript/ytUpload.js — reads a SlideSmith export folder (mp4 + json
sidecar), plans ≤per-day (hard cap 15) into viral-ET slots across upcoming days,
schedules each through the YouTube Studio upload flow. One channel per run
(separate Google login per character). Ledger .ytupload-done.json makes re-runs
skip already-done. Has --dry-run (fills everything but doesn't click Schedule)
for first-run selector verification. Studio DOM selectors are UNVERIFIED against
the live UI — first real run MUST be --dry-run. The SlideSmith→post-bridge video
scheduling work below still exists but is now secondary/unused for YouTube.**

Original (superseded) decision: build inside SlideSmith on top of post-bridge — NOT a separate app,
NOT the raw YouTube Data API.** Rationale:
- SlideSmith already schedules to post-bridge (`server/postbridge.js`,
  `/api/schedule`), which hosts media, does each platform's OAuth, publishes, and
  pulls analytics. A "character" = a post-bridge social account (connect each
  YouTube channel once in post-bridge's UI — no passwords, no Google Cloud).
- Raw YouTube Data API caps at ~6 uploads/day per project (10k units ÷ 1600) —
  a wall for a multi-character pipeline. post-bridge = "unlimited posts".
- post-bridge pricing (2026): Creator $29/mo (15 channels), Growth $49 (50),
  Pro $99 (unlimited). User to confirm YouTube is connectable + accepts vertical
  MP4 → Shorts on their account.

**Build order agreed:** (1) sidecar + video-in-scheduler first [DONE], then
(2) per-character slot-filler UI (pick channel → read scheduled posts → fill open
viral-ET slots across days, ≤ daily cap, ≤15 hard). Viral slots = standard
best-times preset (~6-9am, 12-1pm, 7-11pm ET), editable.

**Shipped in step 1:**
- `src/lib/render.ts`: `videoMeta(show)` → {title=hook, description=caption+hashtags,
  tags}. Video export now drops a `.json` sidecar next to each `.mp4` (single +
  zip paths).
- `/api/schedule` (`server/app.js`) accepts a single `video` data URL (MP4/WebM)
  → one media upload; body limit raised 50mb→200mb. `slides` path unchanged.
- `SchedulePayload` (`src/lib/api.ts`): `slides?` + `video?` (video wins).
- `BulkScheduleModal.tsx`: "Post as" Carousel/Video toggle; video renders
  serially (CONCURRENCY 1) via `renderSlideshowVideo`, hook becomes the title.

Not yet done: music on scheduled videos (currently silent); the slot-filler.

**ytUpload.js progress (verified live against user's channel UCMCs40T1ZylxyXMjVDSTOLw):**
CONFIRMED YouTube Studio selectors:
- Create btn = `ytcp-button` whose text==='Create' (inner button aria-label="Create"); needs ~30s wait on cold dashboard.
- Upload menu item = `#text-item-0`.
- File input = `input[type="file"]` (uploadFile).
- Details: visible `#textbox` [0]=title (PREFILLED from filename → must clear), [1]=description.
- Made-for-kids = `tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]`.
- Show-more = `#toggle-button`; Next = `#next-button` (3 clicks to Visibility).
- Visibility select = `ytcp-video-visibility-select`; radios name PUBLIC/UNLISTED/PRIVATE.
- SCHEDULE toggle = click `#second-container` (div text "Schedule"); `#first-container`="Save or publish". Done btn text flips "Publish"→"Schedule".
- Date = `#datepicker-trigger` (ytcp-text-dropdown-trigger) opens calendar; date input `ytcp-date-picker input`; type "Aug 8, 2026".
- Time input = `<input>` inside `ytcp-datetime-picker` matching /(AM|PM)/, value like "12:00 AM".
- Final = `#done-button`.
BUGS FIXED: field clear was flaky triple-click → doubled title AND date ("focu5 rules...", "Aug 8, 202Aug 8, 2026"). Now clearAndType() uses Ctrl+A + leftover-check for ALL fields (title/desc/date/time).
GOTCHA: leftover open JS dialog (beforeunload/calendar) FREEZES page JS → every evaluate hangs with "Runtime.callFunctionOn timed out". Fix = user fully closes+relaunches debug Chrome clean. Added page.on('dialog') auto-accept + protocolTimeout 240000.
DEFAULTS: per-day now 3 (not 10 — 1-3/day is the viral rec, 10 is spam); slots reordered best-first (19:00,12:00,21:00,17:00,08:00...). HARD_DAILY_MAX 15.
NEW: collision-aware planSchedule (skips taken slots, counts existing toward cap) + readScheduledTimes(page) reads channel Content page for already-scheduled uploads. readScheduledTimes PARSING IS UNVERIFIED — must inspect Content page (`/channel/UC.../videos/upload`) row DOM for date/visibility cells; --no-check disables it.
VERIFIED WORKING: full flow validated end-to-end. Real run (per-day=1) scheduled 3/4:
consistency→Aug12 7PM, grit→Aug14 7PM, streaks→Aug15 7PM (LIVE on channel). focus
FAILED once ("Node not clickable" on title box, 2nd video of batch) → hardened
clearAndType with scrollIntoView + retry. date+time now set cleanly (clearAndType).
readScheduledTimes confirmed reading the channel's existing scheduled shorts.

USER'S FINAL RULES (implemented): 3/day (default), START TODAY (planSchedule default
day = today; past slots skipped so it rolls forward naturally), same fixed times each
day, and read the EXACT scheduled time from the HOVER TOOLTIP ("…become public on
Month D, YYYY at H:MM PM") not just the date — readScheduledTimes now hovers each
scheduled row and parses the tooltip. Slots best-first: 19:00,12:00,21:00,...

CURRENT REAL STATE (user decided): the 3 already-scheduled (Aug12/14/15 7PM, old 1/day
plan) are LEFT AS-IS; user will handle 'focus' (the failed one) themselves later. focus
is NOT in the ledger so a future re-run schedules it (and skips the 3 done ones).
Inspection scripts removed. ~several private test drafts + these on channel.
NOTE: hover-tooltip time parsing is NEW/unverified against live — validate on next run.

**genScript UI integration (DONE, backend API-tested):** ytUpload.js now a spawn-able
worker — added `--port=` (env YT_DEBUG_PORT) so each character uses its OWN debug Chrome,
and `--delete-after` (removes mp4+json from folder on successful schedule). CLI still works.
server.js (genScript, raw http server on :3000): added YT scheduler — characters persist in
`yt_characters.json` ({id,name,folder,port}); routes GET /api/yt/characters,
POST /api/yt/characters/save (dup-port guard), /remove, /schedule (spawns
`node ytUpload.js <folder> --port= --per-day= [--start=] --delete-after`, streams stdout to
the existing /api/events SSE via log(), verifies debug Chrome is up on the port first),
/stop (kills child). New page public/youtube.html served at GET /youtube; toolnav link
added in index.html. Verified live: /youtube renders, character CRUD + guards work.
Model: one character = one channel = one debug Chrome on its own port + own inbox folder;
UI has per-character perDay/start/dry-run + Schedule button + live log + launch-command box.
Run one character at a time (ytState single lock). To use: `node server.js` in genScript dir,
open http://localhost:3000/youtube.
