// Real per-period view tracking for the Channels dashboard.
//
// YouTube's public surfaces (RSS + channel page) only expose each video's
// *lifetime* view total — a single snapshot as of right now. There is no public
// field for "views gained in the last 24h / week / month". The only way to show
// real period views is to measure the change ourselves: on every dashboard
// fetch we record each video's current view count with a timestamp, then a
// window's "gained" views = current − the view count at/before the window's
// start.
//
// Accuracy is only from when tracking started: a true "month" number needs a
// month of recorded history. Until we have a baseline old enough to cover a
// window, the gained figure is a partial lower bound (flagged `exact: false`)
// so the UI can mark it as still-accumulating rather than pretend it's complete.
import { readData, writeData } from './storage.js'

const KEY = 'youtube-view-snapshots'

// Don't record more than one snapshot per video per this interval (keeps the
// history compact across rapid refreshes), and never let a single video's
// series grow unbounded or keep points older than ~13 months.
const MIN_GAP_MS = 30 * 60 * 1000 // 30 min
const MAX_POINTS = 600
const MAX_AGE_MS = 400 * 24 * 60 * 60 * 1000

const DAY = 24 * 60 * 60 * 1000
export const WINDOW_MS = {
  '24h': DAY,
  week: 7 * DAY,
  month: 30 * DAY,
  year: 365 * DAY,
}

// Append the current view counts for every fetched video, then compute each
// video's gained-views-per-window and attach it as `video.gained`. Returns the
// same channels array, enriched. One read + one write of the snapshot store.
export async function withViewDeltas(channels, now = Date.now()) {
  const store = (await readData(KEY, {})) || {}

  for (const c of channels) {
    if (!c?.ok || !Array.isArray(c.videos)) continue
    for (const v of c.videos) {
      if (!v?.id) continue
      const series = store[v.id] || (store[v.id] = [])
      const last = series[series.length - 1]
      // Record a new point when the count changed, or enough time has passed
      // since the last one (so an unchanging count still leaves a trail).
      if (!last || last.v !== v.views || now - last.t >= MIN_GAP_MS) {
        series.push({ t: now, v: v.views })
      }
      prune(series, now)
      v.gained = gainedForWindows(series, v.views, v.publishedAt, now)
    }
  }

  await writeData(KEY, store)
  return channels
}

// Drop points older than MAX_AGE_MS and cap total length (keeping newest).
function prune(series, now) {
  let cut = 0
  while (cut < series.length && now - series[cut].t > MAX_AGE_MS) cut++
  if (cut) series.splice(0, cut)
  if (series.length > MAX_POINTS) series.splice(0, series.length - MAX_POINTS)
}

// Gained views for each named window: { '24h': {value, exact}, week: {...}, … }.
function gainedForWindows(series, currentViews, publishedAt, now) {
  const out = {}
  for (const [name, ms] of Object.entries(WINDOW_MS)) {
    out[name] = gainedForWindow(series, currentViews, publishedAt, ms, now)
  }
  return out
}

// One window's gained views.
//  - Video published inside the window → it didn't exist before the window
//    started, so its entire lifetime total was earned in-window (exact).
//  - Otherwise → current − the view count at the newest snapshot at/before the
//    window start. If we have no snapshot that old yet, fall back to the oldest
//    one we do have and mark the result partial (exact: false).
function gainedForWindow(series, currentViews, publishedAt, windowMs, now) {
  const cutoff = now - windowMs
  const pub = Date.parse(publishedAt || '') || 0
  if (pub && pub >= cutoff) return { value: currentViews, exact: true }

  let baseline = null
  for (const s of series) {
    if (s.t <= cutoff) baseline = s
    else break
  }
  if (baseline) return { value: Math.max(0, currentViews - baseline.v), exact: true }

  if (series.length) return { value: Math.max(0, currentViews - series[0].v), exact: false }
  return { value: 0, exact: false }
}
