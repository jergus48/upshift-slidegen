// Storage abstraction. Slidesmith runs two ways:
//  - Self-hosted (`npm run dev` / `npm start`): everything lives in flat JSON
//    files + a media folder under ~/.slidesmith, exactly as before.
//  - Deployed to Vercel: the filesystem is ephemeral, so JSON documents move
//    to a Redis-compatible KV store (Vercel's Marketplace Redis integration,
//    e.g. Upstash) and images move to Vercel Blob — both shared by everyone
//    hitting the deployment, which is the point (multiple people, one queue).
//
// Which backend is active is decided purely from env vars Vercel sets when
// you attach those integrations — no config needed either way.
import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { Redis } from '@upstash/redis'

// On Vercel, $HOME isn't a writable directory (self-hosted mkdir there works
// fine, but the same path on a Lambda-style filesystem throws ENOENT) — /tmp
// is the only writable path there. It's also wiped between cold starts, so
// this is only a stopgap until Redis + Blob are attached; see the CLOUD
// warning below.
const DIR = process.env.SLIDESMITH_DIR || join(process.env.VERCEL ? '/tmp' : homedir(), '.slidesmith')
const MEDIA_DIR = join(DIR, 'library')

// Vercel's own KV product and the newer Marketplace Redis integrations name
// these env vars slightly differently — accept either.
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN

export const CLOUD = !!(REDIS_URL && REDIS_TOKEN)

if (process.env.VERCEL && !CLOUD) {
  // Not fatal — falls back to /tmp so the app still works for a quick look —
  // but nothing persists across cold starts/deploys and nothing is shared
  // between users until a Redis store is attached in the project's Storage tab.
  console.warn(
    '[storage] Deployed on Vercel without a Redis store attached — using ' +
    'ephemeral /tmp storage. Attach Redis (Storage tab) for real, shared persistence.'
  )
}

const redis = CLOUD ? new Redis({ url: REDIS_URL, token: REDIS_TOKEN }) : null

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

// ── JSON documents (config, per-project queues, image-library index) ────────
export async function readData(key, fallback) {
  if (CLOUD) {
    const v = await redis.get(key)
    return v ?? fallback
  }
  try {
    return JSON.parse(readFileSync(join(DIR, `${key}.json`), 'utf8'))
  } catch {
    return fallback
  }
}

export async function writeData(key, value) {
  if (CLOUD) {
    await redis.set(key, value)
  } else {
    ensureDir(DIR)
    writeFileSync(join(DIR, `${key}.json`), JSON.stringify(value, null, 2))
  }
  return value
}

// ── Binary images (Pinterest scrapes + user uploads) ─────────────────────────
// Local: written to disk; the caller builds a /api/library/img/:id URL and
// keeps the returned filename as the lookup ref for later deletes.
// Cloud: uploaded to Vercel Blob, which hands back a public CDN URL — that
// URL doubles as both the public image URL and the ref used to delete it.
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
