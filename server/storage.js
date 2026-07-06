// Storage abstraction. Slidesmith runs two ways:
//  - Self-hosted (`npm run dev` / `npm start`): everything lives in flat JSON
//    files + a media folder under ~/.slidesmith, exactly as before.
//  - Deployed to Vercel: the filesystem is ephemeral, so everything moves to
//    Vercel Blob — JSON documents as private blobs (config/queue/library
//    index), images as public ones — shared by everyone hitting the
//    deployment, which is the point (multiple people, one queue).
//
// Which backend is active is decided purely from BLOB_READ_WRITE_TOKEN, which
// Vercel sets automatically once you attach a Blob store — no config needed.
import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'

// On Vercel, $HOME isn't a writable directory (self-hosted mkdir there works
// fine, but the same path on a Lambda-style filesystem throws ENOENT) — /tmp
// is the only writable path there. It's also wiped between cold starts, so
// this is only a stopgap until a Blob store is attached; see the warning below.
const DIR = process.env.SLIDESMITH_DIR || join(process.env.VERCEL ? '/tmp' : homedir(), '.slidesmith')
const MEDIA_DIR = join(DIR, 'library')

export const CLOUD = !!process.env.BLOB_READ_WRITE_TOKEN

if (process.env.VERCEL && !CLOUD) {
  // Not fatal — falls back to /tmp so the app still works for a quick look —
  // but nothing persists across cold starts/deploys and nothing is shared
  // between users until a Blob store is attached in the project's Storage tab.
  console.warn(
    '[storage] Deployed on Vercel without a Blob store attached — using ' +
    'ephemeral /tmp storage. Attach Blob (Storage tab) for real, shared persistence.'
  )
}

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

// ── JSON documents (config, per-project queues, image-library index) ────────
// Stored as private blobs at a fixed pathname, overwritten in place. Reading
// via `get()` (not a plain fetch of the public URL) always returns the latest
// write — a cached public CDN URL would not, since these get overwritten often.
export async function readData(key, fallback) {
  if (CLOUD) {
    const { get } = await import('@vercel/blob')
    const result = await get(`data/${key}.json`, { access: 'private' }).catch(() => null)
    if (!result) return fallback
    try {
      return JSON.parse(await new Response(result.stream).text())
    } catch {
      return fallback
    }
  }
  try {
    return JSON.parse(readFileSync(join(DIR, `${key}.json`), 'utf8'))
  } catch {
    return fallback
  }
}

export async function writeData(key, value) {
  if (CLOUD) {
    const { put } = await import('@vercel/blob')
    await put(`data/${key}.json`, JSON.stringify(value), {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
    })
    return value
  }
  ensureDir(DIR)
  writeFileSync(join(DIR, `${key}.json`), JSON.stringify(value, null, 2))
  return value
}

// ── Binary images (Pinterest scrapes + user uploads) ─────────────────────────
// These stay public — they're just background images, same trust level as the
// bundled packs — so the CDN URL is served straight to <img> tags.
// Local: written to disk; the caller builds a /api/library/img/:id URL and
// keeps the returned filename as the lookup ref for later deletes.
export async function putImage(filename, buffer, contentType) {
  if (CLOUD) {
    const { put } = await import('@vercel/blob')
    const { url } = await put(`library/${filename}`, buffer, {
      access: 'public',
      contentType,
      addRandomSuffix: true,
    })
    return url
  }
  ensureDir(MEDIA_DIR)
  writeFileSync(join(MEDIA_DIR, filename), buffer)
  return filename
}

// `ref` is whatever putImage returned: a Blob URL in the cloud, or the local
// filename it wrote to ~/.slidesmith/library.
export async function deleteImage(ref) {
  if (CLOUD) {
    const { del } = await import('@vercel/blob')
    await del(ref).catch(() => {})
    return
  }
  const p = join(MEDIA_DIR, ref)
  if (existsSync(p)) rmSync(p)
}

// Local-only: resolve a stored filename back to its path on disk, for the
// /api/library/img/:id route to stream. Cloud images are served straight
// from their Blob URL and never hit this.
export function localMediaPath(filename) {
  return join(MEDIA_DIR, filename)
}

export const DATA_DIR = DIR
