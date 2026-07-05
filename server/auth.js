// Shared-password gate for public deployments. Self-hosting normally runs
// with no APP_PASSWORD set — the server only binds to localhost there anyway,
// so this is a no-op. Once deployed somewhere public (Vercel), set an
// APP_PASSWORD env var and every /api/* route (which is what can read your
// OpenRouter/post-bridge/Apify keys) requires it first.
import { createHash } from 'node:crypto'

const COOKIE = 'slidesmith_auth'

// Tiny hand-rolled cookie helpers — the format is simple enough that pulling
// in a dependency (and its version churn) isn't worth it for one cookie.
function parseCookies(header) {
  const out = {}
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=')
    if (i === -1) continue
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

function serializeCookie(name, value, { maxAge, path = '/', httpOnly, secure, sameSite } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`]
  if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`)
  if (path) parts.push(`Path=${path}`)
  if (httpOnly) parts.push('HttpOnly')
  if (secure) parts.push('Secure')
  if (sameSite) parts.push(`SameSite=${sameSite}`)
  return parts.join('; ')
}
const APP_PASSWORD = process.env.APP_PASSWORD || ''

export const AUTH_REQUIRED = !!APP_PASSWORD

// The cookie is a static token derived from the password, not a per-session
// secret — fine for "a couple of trusted people share one deployment", which
// is the whole use case. Nobody who doesn't already know APP_PASSWORD can
// produce it.
function token() {
  return createHash('sha256').update(APP_PASSWORD).digest('hex')
}

export function checkPassword(password) {
  return AUTH_REQUIRED && typeof password === 'string' && password === APP_PASSWORD
}

export function authCookie() {
  return serializeCookie(COOKIE, token(), {
    httpOnly: true,
    sameSite: 'Lax',
    secure: !!process.env.VERCEL, // Vercel is always HTTPS; local dev usually isn't
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  })
}

export function clearAuthCookie() {
  return serializeCookie(COOKIE, '', {
    httpOnly: true,
    sameSite: 'Lax',
    secure: !!process.env.VERCEL,
    path: '/',
    maxAge: 0,
  })
}

export function isAuthed(req) {
  if (!AUTH_REQUIRED) return true
  const cookies = parseCookies(req.headers.cookie)
  return cookies[COOKIE] === token()
}

// Express middleware: gate every /api/* route except the two needed to log in.
export function authGate(req, res, next) {
  if (!AUTH_REQUIRED) return next()
  if (!req.path.startsWith('/api/')) return next() // static assets always pass
  if (req.path === '/api/login' || req.path === '/api/auth') return next()
  if (isAuthed(req)) return next()
  res.status(401).json({ error: 'Password required.' })
}
