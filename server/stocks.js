// Stock market data via Financial Modeling Prep (FMP), plus the prompt builders
// for the AI summaries/explanations. This module is deliberately defensive:
// every enrichment call is wrapped so a plan-tier restriction or a single bad
// symbol degrades to "no data for that panel" instead of blanking the page —
// the same philosophy as the YouTube dashboard (server/youtube.js).
//
// IMPORTANT (honesty): nothing here predicts prices or promises gains. Quotes,
// analyst targets/ratings, earnings and news are third-party facts surfaced
// as-is and attributed to their source (analysts / FMP). The AI endpoints only
// summarize that public data and always carry a "not financial advice"
// disclaimer — see buildPortfolioPrompt / buildIdeasPrompt / buildWhyPrompt.
import { logger } from './log.js'

const log = logger('stocks')
const BASE = 'https://financialmodelingprep.com/stable'

// ── Tiny in-memory cache ─────────────────────────────────────────────────────
// FMP's free tier has a tight daily request budget, so we don't want a rapid
// re-render or a second refresh click to re-hit the API. Short TTLs keep the
// data live-ish while smoothing out bursts. Process-local (fine for a personal
// tool / single serverless instance); nothing here is user-specific.
const cache = new Map() // key -> { at, ttl, value }
async function cached(key, ttlMs, produce) {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < hit.ttl) return hit.value
  const value = await produce()
  cache.set(key, { at: Date.now(), ttl: ttlMs, value })
  return value
}

function requireKey(apiKey) {
  if (!apiKey) throw new Error('Missing Financial Modeling Prep API key. Add it in Settings.')
}

// One GET against the FMP "stable" API. Returns parsed JSON. FMP signals errors
// both as non-200s and as a 200 with an { "Error Message": ... } body — treat
// both as failures so callers' try/catch can fall back cleanly.
async function fmpGet(path, apiKey, params = {}) {
  const url = new URL(`${BASE}/${path}`)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
  }
  url.searchParams.set('apikey', apiKey)
  const res = await fetch(url.href)
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = (body && (body['Error Message'] || body.message)) || `FMP ${res.status}`
    throw new Error(msg)
  }
  if (body && !Array.isArray(body) && body['Error Message']) throw new Error(body['Error Message'])
  return body
}

// A single symbol's live quote, normalized to the fields the UI needs. FMP's
// stable /quote returns an array with one element. Field names have shifted
// across FMP versions, so we read a couple of aliases defensively.
function normalizeQuote(q, symbol) {
  if (!q) return null
  const pct = q.changePercentage ?? q.changesPercentage ?? 0
  return {
    symbol: q.symbol || symbol,
    name: q.name || '',
    price: num(q.price),
    change: num(q.change),
    changePct: num(pct),
    dayLow: num(q.dayLow),
    dayHigh: num(q.dayHigh),
    yearLow: num(q.yearLow),
    yearHigh: num(q.yearHigh),
    open: num(q.open),
    previousClose: num(q.previousClose),
    marketCap: num(q.marketCap),
    volume: num(q.volume),
    exchange: q.exchange || '',
    timestamp: q.timestamp || null,
  }
}
const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v))

// Batch quotes. One stable /quote call per symbol, run concurrently, each cached
// 60s. Bad/unknown symbols resolve to null and are dropped — a Trade Republic
// ticker FMP doesn't recognize won't blank the whole list.
export async function fetchQuotes(symbols, apiKey) {
  requireKey(apiKey)
  const uniq = [...new Set(symbols.map((s) => String(s).trim().toUpperCase()).filter(Boolean))]
  const results = await Promise.all(
    uniq.map((symbol) =>
      cached(`quote:${symbol}`, 60_000, async () => {
        try {
          const arr = await fmpGet('quote', apiKey, { symbol })
          return normalizeQuote(Array.isArray(arr) ? arr[0] : arr, symbol)
        } catch (e) {
          log.step(`quote ${symbol} failed: ${e.message}`)
          return null
        }
      })
    )
  )
  return results.filter(Boolean)
}

// Symbol search for the "add holding" flow. FMP splits this into two endpoints —
// search-symbol (matches tickers) and search-name (matches company names) — so
// we query both and merge. US-listed USD tickers are floated to the top because
// they carry the fullest data (analyst targets, earnings); the user's broker
// may show Frankfurt/Xetra symbols (ABEA, 6B0…) that FMP can't fully cover, so
// steering them to GOOGL/AAPL etc. is deliberate.
const US_EXCHANGES = new Set(['NASDAQ', 'NYSE', 'AMEX', 'NYSEARCA', 'BATS', 'CBOE'])
export async function searchSymbols(query, apiKey) {
  requireKey(apiKey)
  const q = String(query || '').trim()
  if (!q) return []
  const [bySym, byName] = await Promise.all([
    best(() => fmpGet('search-symbol', apiKey, { query: q, limit: 15 })),
    best(() => fmpGet('search-name', apiKey, { query: q, limit: 15 })),
  ])
  const merged = new Map()
  for (const r of [...(bySym || []), ...(byName || [])]) {
    if (!r?.symbol || merged.has(r.symbol)) continue
    merged.set(r.symbol, {
      symbol: r.symbol,
      name: r.name || '',
      exchange: r.exchange || '',
      exchangeFull: r.exchangeFullName || r.exchange || '',
      currency: r.currency || '',
    })
  }
  const rank = (r) => (US_EXCHANGES.has((r.exchange || '').toUpperCase()) ? 0 : r.currency === 'USD' ? 1 : 2)
  return [...merged.values()]
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, 12)
    .map((r) => ({ symbol: r.symbol, name: r.name, exchange: r.exchangeFull, currency: r.currency }))
}

// Full per-symbol enrichment for the detail panel: profile, analyst price-target
// consensus, analyst rating breakdown, next + last earnings, and recent news.
// Each piece is independent and best-effort — a premium-only endpoint just
// yields null for that section. Cached 10 min (this data moves slowly, and it's
// the expensive part of the request budget).
export async function analyzeSymbol(symbol, apiKey) {
  requireKey(apiKey)
  const sym = String(symbol).trim().toUpperCase()
  return cached(`analyze:${sym}`, 10 * 60_000, async () => {
    const [quote, profile, target, ratings, earnings, news] = await Promise.all([
      fetchQuotes([sym], apiKey).then((q) => q[0] || null).catch(() => null),
      best(() => fmpGet('profile', apiKey, { symbol: sym })).then((a) => firstOf(a)),
      best(() => fmpGet('price-target-consensus', apiKey, { symbol: sym })).then((a) => firstOf(a)),
      best(() => fmpGet('grades-consensus', apiKey, { symbol: sym })).then((a) => firstOf(a)),
      // FMP's free tier caps `limit` at 5 on these endpoints (a higher value
      // 400s), so stay within it. News is a premium endpoint on the free plan
      // and simply resolves to [] there (handled by best()).
      best(() => fmpGet('earnings', apiKey, { symbol: sym, limit: 5 })),
      getNews(sym, apiKey),
    ])
    return {
      symbol: sym,
      quote,
      profile: profile
        ? {
            companyName: profile.companyName || '',
            sector: profile.sector || '',
            industry: profile.industry || '',
            image: profile.image || '',
            description: profile.description || '',
            website: profile.website || '',
            beta: num(profile.beta),
            range: profile.range || '',
          }
        : null,
      target: target
        ? {
            high: num(target.targetHigh),
            low: num(target.targetLow),
            consensus: num(target.targetConsensus),
            median: num(target.targetMedian),
          }
        : null,
      ratings: ratings
        ? {
            consensus: ratings.consensus || '',
            strongBuy: num(ratings.strongBuy) || 0,
            buy: num(ratings.buy) || 0,
            hold: num(ratings.hold) || 0,
            sell: num(ratings.sell) || 0,
            strongSell: num(ratings.strongSell) || 0,
          }
        : null,
      earnings: normalizeEarnings(earnings),
      news,
    }
  })
}

// News for a symbol, with a free fallback. FMP's stock-news endpoint is premium
// (restricted on the free plan), so we try it first and, when it yields nothing,
// fall back to Yahoo Finance's per-ticker RSS feed — no key, finance-specific,
// and fresh. Cached 10 min. Used by the detail panel and the "why did it move"
// explainer.
export async function fetchNews(symbol, apiKey) {
  const sym = String(symbol).trim().toUpperCase()
  return getNews(sym, apiKey)
}

async function getNews(sym, apiKey) {
  return cached(`news:${sym}`, 10 * 60_000, async () => {
    const fmp = normalizeNews(await best(() => fmpGet('news/stock', apiKey, { symbols: sym, limit: 5 })))
    if (fmp.length) return fmp
    return best(() => fetchYahooNews(sym)).then((n) => n || [])
  })
}

// Yahoo Finance financial-news RSS for one ticker. Dependency-free regex over
// the feed markup — same approach as the YouTube RSS parser (server/youtube.js).
async function fetchYahooNews(symbol) {
  const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`Yahoo news ${res.status}`)
  const xml = await res.text()
  const items = xml.split('<item>').slice(1)
  const out = []
  for (const item of items) {
    const title = decodeEntities(firstMatch(item, /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/))
    const link = firstMatch(item, /<link>([\s\S]*?)<\/link>/).trim()
    if (!title || !link) continue
    const pub = firstMatch(item, /<pubDate>([\s\S]*?)<\/pubDate>/).trim()
    const desc = decodeEntities(firstMatch(item, /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/))
    let site = 'Yahoo Finance'
    try { site = new URL(link).hostname.replace(/^www\./, '') } catch { /* keep default */ }
    out.push({
      title: title.trim(),
      site,
      url: link,
      image: '',
      publishedDate: pub ? new Date(pub).toISOString() : '',
      snippet: desc.replace(/<[^>]+>/g, '').trim().slice(0, 300),
    })
    if (out.length >= 8) break
  }
  return out
}

// Minimal helpers, mirroring server/youtube.js (kept local — those aren't exported).
function firstMatch(s, re) {
  const m = String(s).match(re)
  return m ? m[1] : ''
}
function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

// Split FMP's earnings history into the next upcoming date and the most recent
// reported quarter (with its actual-vs-estimate surprise).
function normalizeEarnings(arr) {
  const rows = (Array.isArray(arr) ? arr : [])
    .map((e) => ({
      date: e.date,
      epsActual: num(e.epsActual ?? e.eps),
      epsEstimated: num(e.epsEstimated ?? e.epsEstimate),
      revenueActual: num(e.revenueActual ?? e.revenue),
      revenueEstimated: num(e.revenueEstimated ?? e.revenueEstimate),
    }))
    .filter((e) => e.date)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
  const now = Date.now()
  const upcoming = [...rows].reverse().find((e) => new Date(e.date).getTime() >= now) || null
  const lastReported = rows.find((e) => new Date(e.date).getTime() < now && e.epsActual !== null) || null
  return { upcoming, lastReported }
}

function normalizeNews(arr) {
  return (Array.isArray(arr) ? arr : [])
    .map((n) => ({
      title: n.title || '',
      site: n.site || n.publisher || '',
      url: n.url || '',
      image: n.image || '',
      publishedDate: n.publishedDate || n.date || '',
      snippet: String(n.text || '').slice(0, 300),
    }))
    .filter((n) => n.title && n.url)
    .slice(0, 12)
}

// Run a producer, swallow failures to null (used for optional/premium sections).
async function best(fn) {
  try {
    return await fn()
  } catch (e) {
    log.step(`enrichment skipped: ${e.message}`)
    return null
  }
}
const firstOf = (a) => (Array.isArray(a) ? a[0] || null : a || null)

// ── AI prompt builders (summaries of the fetched facts — never predictions) ──

const DISCLAIMER =
  'This is an automated summary of public market data and third-party analyst opinion for information only. ' +
  'It is not personalized financial advice, and past performance and analyst targets do not guarantee future results.'

// Whole-portfolio summary + a stance per holding, grounded in the numbers we
// pass in. The model is told to reason from the data, attribute analyst views,
// express confidence, and never promise gains.
export function buildPortfolioPrompt(holdings) {
  const rows = holdings
    .map((h) => {
      const q = h.quote || {}
      const t = h.target || {}
      const parts = [
        `${h.symbol} (${h.name || q.name || ''})`,
        `shares=${h.shares ?? '?'}`,
        `avgCost=${h.avgPrice ?? '?'}`,
        q.price != null ? `price=${q.price}` : null,
        q.changePct != null ? `todayPct=${q.changePct}` : null,
        h.gainPct != null ? `unrealizedPct=${h.gainPct}` : null,
        t.consensus != null ? `analystTarget=${t.consensus}` : null,
        h.ratingConsensus ? `analystRating=${h.ratingConsensus}` : null,
        h.sector ? `sector=${h.sector}` : null,
      ].filter(Boolean)
      return `- ${parts.join(', ')}`
    })
    .join('\n')

  return `You are a careful equity research assistant. Below is a real portfolio with live prices, the holder's average cost, and (where available) analyst consensus price targets and rating consensus.

Portfolio:
${rows}

Write a JSON object with this exact shape:
{
  "overview": "3-5 sentence plain-English read on the portfolio: concentration, sector tilt, notable winners/losers today and vs cost. Reference the numbers.",
  "positions": [
    { "symbol": "TICKER", "stance": "accumulate | hold | trim | review", "reason": "1-2 sentences citing the specific data (target vs price, rating, today's move, position size). Attribute analyst views to 'analysts'.", "confidence": "low | medium | high" }
  ],
  "watch": ["short bullet risks or catalysts to watch this week, e.g. upcoming earnings, concentration risk"],
  "disclaimer": ${JSON.stringify(DISCLAIMER)}
}

Rules: base every claim on the data given — do NOT invent prices, targets or ratings. If analyst data is missing for a name, say so rather than guessing. Do not promise returns or use hype. Keep it concise and specific. Include one position object for every holding. Return only the JSON.`
}

// New-idea suggestions that complement the current holdings (diversification /
// gaps), framed as areas to research — not a directive to buy.
export function buildIdeasPrompt(holdings) {
  const held = holdings.map((h) => `${h.symbol} (${h.sector || '?'})`).join(', ')
  return `A long-term investor currently holds: ${held || '(nothing yet)'}.

Suggest up to 6 well-known, liquid stocks or ETFs they do NOT already hold that would broaden the portfolio — filling sector or geographic gaps, or adding quality/diversification for a long-term horizon.

Return JSON:
{
  "ideas": [
    { "symbol": "TICKER", "name": "Company", "thesis": "1-2 sentence long-term rationale and what gap it fills", "category": "e.g. sector / theme" }
  ],
  "disclaimer": ${JSON.stringify(DISCLAIMER)}
}

Rules: only real, currently-listed US-traded tickers. Prefer diversification over chasing recent performance. This is research to investigate, not a recommendation to buy. Return only the JSON.`
}

// "Why did it move today?" — explain a stock's move strictly from the headlines
// we hand the model, admitting uncertainty when the news doesn't explain it.
export function buildWhyPrompt({ symbol, name, changePct, news }) {
  const headlines = (news || [])
    .slice(0, 8)
    .map((n, i) => `${i + 1}. ${n.title} (${n.site}, ${n.publishedDate})`)
    .join('\n')
  const dir = changePct == null ? 'moved' : changePct >= 0 ? `rose ${changePct}%` : `fell ${Math.abs(changePct)}%`
  return `${symbol}${name ? ` (${name})` : ''} ${dir} today. Recent headlines:
${headlines || '(no recent headlines available)'}

Explain, in 2-4 sentences, the most likely reasons for today's move based ONLY on these headlines and the direction. If the headlines don't clearly explain it, say the move may be driven by broader market or sector factors rather than company news — do not fabricate a cause.

Return JSON: { "explanation": "...", "drivers": ["short bullet", "..."], "disclaimer": ${JSON.stringify(DISCLAIMER)} }
Return only the JSON.`
}
