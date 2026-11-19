// Prettified server logging so `npm run dev` shows what's happening during the
// slow flows (scraping Pinterest, generating with the model, uploading +
// scheduling to Exposure). Colorized, timestamped, with a tiny spinner-free
// progress helper. No deps — just ANSI codes, disabled when not a TTY or when
// NO_COLOR is set.
const useColor = process.stdout.isTTY && !process.env.NO_COLOR

const wrap = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s))
const c = {
  dim: wrap('2'),
  bold: wrap('1'),
  red: wrap('31'),
  green: wrap('32'),
  yellow: wrap('33'),
  blue: wrap('34'),
  magenta: wrap('35'),
  cyan: wrap('36'),
  gray: wrap('90'),
}

// A short, fixed-width colored tag per flow so logs are scannable at a glance.
const TAGS = {
  scrape: c.magenta('scrape '),
  generate: c.cyan('generate'),
  schedule: c.green('schedule'),
  server: c.blue('server  '),
}

function ts() {
  // HH:MM:SS, local — no Date.now()/argless Date issues here (server runtime).
  return c.gray(new Date().toTimeString().slice(0, 8))
}

function line(flow, symbol, msg) {
  const tag = TAGS[flow] || c.gray(String(flow).padEnd(8))
  console.log(`${ts()} ${tag} ${symbol} ${msg}`)
}

// A flow logger groups related steps under one colored tag. Returns helpers:
//   .step(msg)  – a bullet step
//   .info(msg)  – dim sub-detail
//   .ok(msg)    – success line (green check)
//   .warn(msg)  – warning (yellow)
//   .fail(msg)  – error (red ✗)
//   .progress(done, total, label) – inline-ish "[ 3/10 ] label"
export function logger(flow) {
  return {
    start(msg) {
      line(flow, c.bold('▸'), c.bold(msg))
    },
    step(msg) {
      line(flow, c.cyan('•'), msg)
    },
    info(msg) {
      line(flow, ' ', c.dim(msg))
    },
    ok(msg) {
      line(flow, c.green('✓'), msg)
    },
    warn(msg) {
      line(flow, c.yellow('!'), c.yellow(msg))
    },
    fail(msg) {
      line(flow, c.red('✗'), c.red(msg))
    },
    progress(done, total, label = '') {
      const n = `${String(done).padStart(String(total).length)}/${total}`
      line(flow, c.dim(`[${n}]`), c.dim(label))
    },
  }
}

export { c as colors }
