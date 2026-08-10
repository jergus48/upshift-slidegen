// API-key persistence — the only thing that stays server-side, since secrets
// shouldn't live in a shared deployment's browser. Everything else (projects,
// Brain, model choice, the queue, the image library) lives entirely in the
// browser now (localStorage / IndexedDB) — see src/lib/localWorkspace.ts,
// localQueue.ts, localLibrary.ts.
//
// Keys resolve from env vars first (which persist across cold starts on
// Vercel), falling back to a small local config.json for self-hosting.
import { readData, writeData, DATA_DIR } from './storage.js'

const KEYS_KEY = 'config'

// Env-var override, set once in Vercel's Environment Variables (persists across
// cold starts/redeploys, unlike the config file on a serverless filesystem).
// When set, an env key always wins over whatever's saved via Settings.
const ENV_KEYS = {
  postbridge: process.env.POSTBRIDGE_API_KEY || '',
  openrouter: process.env.OPENROUTER_API_KEY || '',
  apify: process.env.APIFY_API_KEY || '',
  fmp: process.env.FMP_API_KEY || '',
}

// Resolved real key values, for server-side use (generation, scraping,
// post-bridge). Never sent to the browser as-is — see maskKeys in app.js.
export async function getKeys() {
  const s = await readData(KEYS_KEY, {})
  return {
    postbridge: ENV_KEYS.postbridge || s.keys?.postbridge || '',
    openrouter: ENV_KEYS.openrouter || s.keys?.openrouter || '',
    apify: ENV_KEYS.apify || s.keys?.apify || '',
    fmp: ENV_KEYS.fmp || s.keys?.fmp || '',
  }
}

// Save keys typed into Settings (self-hosting). Blank/omitted fields are
// ignored so clearing a field never wipes an already-saved key. No-op in
// practice on Vercel, where env vars take precedence anyway.
export async function saveKeys(patch) {
  const s = await readData(KEYS_KEY, {})
  const keys = { ...s.keys }
  for (const k of ['postbridge', 'openrouter', 'apify', 'fmp']) {
    if (patch?.[k]) keys[k] = patch[k]
  }
  await writeData(KEYS_KEY, { ...s, keys })
  return getKeys()
}

export const CONFIG_DIR = DATA_DIR
