// Local dev / self-hosted entry point. Boots the shared Express app (see
// app.js) with a real HTTP server. On Vercel, api/[...all].js wraps the same
// app as a serverless function instead — this file is never used there.
import { app } from './app.js'
import { CONFIG_DIR } from './store.js'
import { CLOUD } from './storage.js'

const PORT = process.env.PORT || 8787
// Bind loopback only by default. Without a shared password set, this server
// returns your API keys to whoever can reach it — fine for 127.0.0.1 (only
// you), not fine on a shared network. Set HOST yourself only if you know what
// you're doing (e.g. a firewalled headless box), and set APP_PASSWORD too.
const HOST = process.env.HOST || '127.0.0.1'

app.listen(PORT, HOST, () => {
  console.log(`\n  Slidesmith server → http://localhost:${PORT} (bound to ${HOST})`)
  console.log(`  Storage: ${CLOUD ? 'Vercel Blob (cloud)' : `local files in ${CONFIG_DIR}`}\n`)
})
