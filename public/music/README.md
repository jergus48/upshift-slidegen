# Video soundtrack tracks

When a slideshow is exported as a video, the app can mix in a background track.
The user picks **Male music** or **Female music** in the popup; the exporter then
picks a track **at random** from that pool for each video.

## How to add tracks

1. Drop your `.mp3` (or `.m4a`/`.wav`) files into:
   - `public/music/male/`   — viral / motivational tracks for the "male" vibe
   - `public/music/female/` — viral / motivational tracks for the "female" vibe
2. List the filenames in `manifest.json`:

   ```json
   {
     "male":   ["track-one.mp3", "track-two.mp3"],
     "female": ["track-a.mp3", "track-b.mp3"]
   }
   ```

   - Filenames with no leading slash resolve to `/music/<gender>/<file>`.
   - You may instead list full `https://…` URLs (e.g. an R2/CDN link), or set a
     top-level `"base"` that's prefixed to every bare filename.

3. If a pool is left empty, choosing that option simply exports a **silent**
   video — nothing breaks.

## Licensing note

Only add tracks you have the right to use. This repo ships with **no audio
files** — the actual "viral motivational" songs must be supplied by you, because
they're copyrighted and can't be bundled here.
