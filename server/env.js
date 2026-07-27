// Load a local .env file (if present) into process.env BEFORE anything else
// reads it. This module must be imported first in the local entry point
// (index.js) — ESM runs imports in order, so importing it ahead of app.js
// guarantees env vars are set before app.js / store.js / redditUsers.js read
// them at module load.
//
// Uses Node's built-in env-file loader (Node 20.6+), so there's no dotenv
// dependency. On Vercel this does nothing useful (env vars are injected by the
// platform and there's no .env), and a missing file is simply ignored.
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env')
if (existsSync(envPath)) {
  try {
    process.loadEnvFile(envPath)
  } catch (e) {
    console.warn(`[env] Could not load .env: ${e.message}`)
  }
}
