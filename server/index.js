// Local dev / self-hosted entry point. Boots the shared Express app (see
// app.js) with a real HTTP server. On Vercel, api/index.js wraps the same
// app as a serverless function instead — this file is never used there.
import './env.js' // must be first — loads a local .env before app.js reads env
import { app } from './app.js'
import { CONFIG_DIR } from './store.js'

const PORT = process.env.PORT || 8787
// Bind loopback only by default. Without a shared password set, this server
// returns your API keys to whoever can reach it — fine for 127.0.0.1 (only
// you), not fine on a shared network. Set HOST yourself only if you know what
// you're doing (e.g. a firewalled headless box), and set APP_PASSWORD too.
const HOST = process.env.HOST || '127.0.0.1'

const server = app.listen(PORT, HOST, () => {
  console.log(`\n  Slidesmith server → http://localhost:${PORT} (bound to ${HOST})`)
  console.log(`  Config stored in ${CONFIG_DIR}. Queue + library live in the browser.\n`)
})

// A second launcher window (or a leftover one from earlier) starting its own
// server used to die here with a raw stack trace. Worse, whichever process ends
// up owning the port is the one the app talks to — so a silent clash shows up
// later as exports failing with "Failed to fetch" when the owner changes
// mid-render. Say plainly what happened instead.
server.on('error', (e) => {
  if (e?.code === 'EADDRINUSE') {
    console.error(
      `\n  Port ${PORT} is already in use — SlideGen is very likely already running.\n` +
        `  Open http://localhost:5173 (or http://localhost:${PORT}) in your browser instead of\n` +
        `  starting a second copy. If you're sure nothing else should be there, stop the other\n` +
        `  process first (Windows: taskkill /F /PID <pid> after \`netstat -ano | findstr :${PORT}\`).\n`,
    )
    process.exit(1)
  }
  throw e
})
