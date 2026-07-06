// JSON document storage for config (keys/Brain/projects). Local files only —
// the queue and image library live entirely in the browser (localStorage /
// IndexedDB) now, so the server has no runtime image/queue state to persist.
//
// On Vercel, $HOME isn't writable (self-hosted mkdir there works fine, but
// the same path on a Lambda-style filesystem throws ENOENT) — /tmp is the
// only writable path there. It's wiped between cold starts, so config
// entered in Settings won't reliably survive on a Vercel deployment; use the
// POSTBRIDGE_API_KEY/OPENROUTER_API_KEY/APIFY_API_KEY env vars (see store.js)
// for keys that need to actually stick.
import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'

const DIR = process.env.SLIDESMITH_DIR || join(process.env.VERCEL ? '/tmp' : homedir(), '.slidesmith')

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

export async function readData(key, fallback) {
  try {
    return JSON.parse(readFileSync(join(DIR, `${key}.json`), 'utf8'))
  } catch {
    return fallback
  }
}

export async function writeData(key, value) {
  ensureDir(DIR)
  writeFileSync(join(DIR, `${key}.json`), JSON.stringify(value, null, 2))
  return value
}

export const DATA_DIR = DIR
