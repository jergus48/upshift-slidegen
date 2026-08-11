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
import { readData, writeData } from './storage.js'

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

// ── Disk day-cache ───────────────────────────────────────────────────────────
// Slow-moving enrichment (analyst targets, ratings, earnings, company profile)
// barely changes intraday and is the expensive part of the FMP budget, so we
// persist it to a small JSON file keyed by symbol + calendar day. Unlike the
// in-memory cache above it survives a server restart, so reopening a holding
// (or restarting `npm run dev`) doesn't re-hit FMP/Yahoo — the data is fetched
// at most once per symbol per day. Live prices are NOT day-cached; they keep
// their own short in-memory TTL so the panel stays current.
const DAY_CACHE_KEY = 'stock-cache'
const today = () => new Date().toISOString().slice(0, 10)
let dayCacheMem = null // { [key]: { day, value } }, lazily loaded from disk

async function loadDayCache() {
  if (dayCacheMem) return dayCacheMem
  const raw = await readData(DAY_CACHE_KEY, {})
  // Drop stale (previous-day) entries on first load so the file doesn't grow.
  const d = today()
  dayCacheMem = {}
  for (const [k, v] of Object.entries(raw)) {
    if (v && v.day === d) dayCacheMem[k] = v
  }
  return dayCacheMem
}

// Return today's cached value for `key`, else run `produce()`, store, persist.
// `shouldStore` guards against caching an empty/failed result for the whole day
// (so an uncovered symbol just retries next time instead of sticking as blank).
async function dayCached(key, produce, shouldStore = () => true) {
  const store = await loadDayCache()
  const hit = store[key]
  if (hit && hit.day === today()) return hit.value
  const value = await produce()
  if (shouldStore(value)) {
    store[key] = { day: today(), value }
    // Best-effort persist — a write failure must never break the request.
    writeData(DAY_CACHE_KEY, store).catch((e) => log.step(`day-cache write failed: ${e.message}`))
  }
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
    currency: q.currency || 'USD', // FMP stable /quote omits currency; it's USD
    timestamp: q.timestamp || null,
    source: 'fmp',
  }
}
const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v))

// Yahoo Finance quote via the keyless v8 chart endpoint. Works for ANY listing —
// US, Xetra/Frankfurt (.DE/.F), Vienna (.VI), London (.L) etc. — which the FMP
// free plan does not (it blocks non-US and a subset of US symbols). This is what
// lets a European broker's portfolio (Trade Republic / Trading212) show prices.
async function fetchYahooQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`Yahoo quote ${res.status}`)
  const body = await res.json().catch(() => null)
  const m = body?.chart?.result?.[0]?.meta
  if (!m || m.regularMarketPrice == null) throw new Error('no Yahoo quote')
  const price = num(m.regularMarketPrice)
  const prev = num(m.previousClose ?? m.chartPreviousClose)
  const change = price != null && prev != null ? price - prev : null
  return {
    symbol: m.symbol || symbol,
    name: m.longName || m.shortName || '',
    price,
    change,
    changePct: change != null && prev ? (change / prev) * 100 : null,
    dayLow: num(m.regularMarketDayLow),
    dayHigh: num(m.regularMarketDayHigh),
    yearLow: num(m.fiftyTwoWeekLow),
    yearHigh: num(m.fiftyTwoWeekHigh),
    open: null,
    previousClose: prev,
    marketCap: null,
    volume: num(m.regularMarketVolume),
    exchange: m.fullExchangeName || m.exchangeName || '',
    currency: m.currency || 'USD',
    timestamp: m.regularMarketTime || null,
    source: 'yahoo',
  }
}

// Keyless Yahoo Finance symbol search — the fallback for searchSymbols() when
// FMP is unavailable (rate-limited / plan-restricted). Returns matches in the
// same shape as the FMP path: { symbol, name, exchange, currency }. Yahoo's
// search doesn't report currency, so it's left blank (the add-holding flow
// defaults to USD); equities/ETFs only, so index/currency/futures noise is
// filtered out.
async function searchYahooSymbols(query) {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=15&newsCount=0`
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`Yahoo search ${res.status}`)
  const body = await res.json().catch(() => null)
  const quotes = Array.isArray(body?.quotes) ? body.quotes : []
  return quotes
    .filter((q) => q?.symbol && (q.quoteType === 'EQUITY' || q.quoteType === 'ETF'))
    .map((q) => ({
      symbol: q.symbol,
      name: q.longname || q.shortname || '',
      exchange: q.exchDisp || q.exchange || '',
      currency: '',
    }))
}

// ── Yahoo analyst enrichment (fallback for FMP-uncovered symbols) ─────────────
// Yahoo's quoteSummary carries analyst price targets and a rating breakdown for
// listings the FMP free plan blocks (non-US ADRs like AMKBY, foreign lines,
// etc.). It needs a cookie + "crumb" pair, which we fetch once and reuse.
const YAHOO_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
let yahooAuth = null // { cookie, crumb, at }

async function getYahooAuth() {
  if (yahooAuth && Date.now() - yahooAuth.at < 25 * 60_000) return yahooAuth
  const r = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': YAHOO_UA } })
  const cookie = (r.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ')
  if (!cookie) throw new Error('no Yahoo cookie')
  const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': YAHOO_UA, Cookie: cookie },
  })
  const crumb = (await crumbRes.text()).trim()
  if (!crumb || crumb.includes('<') || crumb.length > 32) throw new Error('no Yahoo crumb')
  yahooAuth = { cookie, crumb, at: Date.now() }
  return yahooAuth
}

// Turn a recommendationTrend period ({strongBuy,buy,hold,sell,strongSell}) into
// a consensus label, weighting Buy→Sell 1..5 (lower = more bullish) — the same
// shape FMP's grades-consensus returns.
function consensusFromCounts(t) {
  const sb = t.strongBuy || 0, b = t.buy || 0, h = t.hold || 0, s = t.sell || 0, ss = t.strongSell || 0
  const total = sb + b + h + s + ss
  if (!total) return ''
  const mean = (sb * 1 + b * 2 + h * 3 + s * 4 + ss * 5) / total
  if (mean <= 1.5) return 'Strong Buy'
  if (mean <= 2.5) return 'Buy'
  if (mean <= 3.5) return 'Hold'
  if (mean <= 4.5) return 'Sell'
  return 'Strong Sell'
}

// Fetch analyst price target + rating breakdown from Yahoo. Returns
// { target, ratings } in the SAME shape analyzeSymbol builds from FMP; either
// field is null when Yahoo has no analyst data for that symbol.
async function fetchYahooEnrichment(symbol) {
  const { cookie, crumb } = await getYahooAuth()
  const url =
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}` +
    `?modules=financialData,recommendationTrend&crumb=${encodeURIComponent(crumb)}`
  const res = await fetch(url, { headers: { 'User-Agent': YAHOO_UA, Cookie: cookie } })
  if (!res.ok) throw new Error(`Yahoo quoteSummary ${res.status}`)
  const body = await res.json().catch(() => null)
  const r = body?.quoteSummary?.result?.[0]
  if (!r) return { target: null, ratings: null }

  const fd = r.financialData || {}
  const mean = num(fd.targetMeanPrice?.raw)
  const target = mean != null
    ? {
        high: num(fd.targetHighPrice?.raw),
        low: num(fd.targetLowPrice?.raw),
        consensus: mean,
        median: num(fd.targetMedianPrice?.raw) ?? mean,
      }
    : null

  const trend = r.recommendationTrend?.trend?.[0]
  const ratings = trend && (trend.strongBuy + trend.buy + trend.hold + trend.sell + trend.strongSell) > 0
    ? {
        consensus: consensusFromCounts(trend),
        strongBuy: trend.strongBuy || 0,
        buy: trend.buy || 0,
        hold: trend.hold || 0,
        sell: trend.sell || 0,
        strongSell: trend.strongSell || 0,
      }
    : null

  return { target, ratings }
}

// Batch quotes. Per symbol: try FMP (richer fields for covered US names), then
// fall back to Yahoo for anything FMP's plan blocks. Concurrent, cached 60s. A
// symbol neither source can price resolves to null and is dropped.
export async function fetchQuotes(symbols, apiKey) {
  const uniq = [...new Set(symbols.map((s) => String(s).trim().toUpperCase()).filter(Boolean))]
  const results = await Promise.all(
    uniq.map((symbol) =>
      cached(`quote:${symbol}`, 60_000, async () => {
        if (apiKey) {
          try {
            const arr = await fmpGet('quote', apiKey, { symbol })
            const q = normalizeQuote(Array.isArray(arr) ? arr[0] : arr, symbol)
            if (q && q.price != null) return q
          } catch (e) {
            log.step(`FMP quote ${symbol} unavailable (${e.message}); trying Yahoo`)
          }
        }
        try {
          return await fetchYahooQuote(symbol)
        } catch (e) {
          log.step(`quote ${symbol} failed everywhere: ${e.message}`)
          return null
        }
      })
    )
  )
  return results.filter(Boolean)
}

// ── FX rates ─────────────────────────────────────────────────────────────────
// Currency conversion for the portfolio's display-currency toggle. Holdings can
// be quoted in USD, EUR, GBP… (European listings come through Yahoo), so to show
// one combined total — or every row — in a single currency we need spot rates.
// Source: frankfurter.dev (free, no key, ECB reference rates). Cached 1h in
// memory since ECB publishes once a day; a personal tool doesn't need tick data.
// Returns a flat map of rates FROM `base` (e.g. base 'EUR' → { USD: 1.15, … });
// the base itself is always 1. Falls back to `{ [base]: 1 }` if the API is down,
// so the caller degrades to "can't convert" rather than throwing.
export async function fetchFxRates(base = 'USD') {
  const b = String(base || 'USD').trim().toUpperCase() || 'USD'
  return cached(`fx:${b}`, 3_600_000, async () => {
    try {
      const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=${b}`)
      const body = await res.json().catch(() => null)
      if (!res.ok || !body?.rates) throw new Error(`FX ${res.status}`)
      return { base: b, date: body.date || today(), rates: { ...body.rates, [b]: 1 } }
    } catch (e) {
      log.step(`FX rates for ${b} unavailable: ${e.message}`)
      return { base: b, date: today(), rates: { [b]: 1 } }
    }
  })
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
  // FMP unavailable (rate-limited / plan-restricted) → nothing merged. Fall back
  // to keyless Yahoo search so the add-holding flow keeps working. Yahoo also
  // powers the quote fallback, so any symbol it returns can still be priced.
  if (merged.size === 0) {
    try {
      const yahoo = await searchYahooSymbols(q)
      for (const r of yahoo) {
        if (!merged.has(r.symbol)) merged.set(r.symbol, { ...r, exchangeFull: r.exchange })
      }
    } catch (e) {
      log.step(`Yahoo symbol search failed for "${q}": ${e.message}`)
    }
  }
  const rank = (r) => (US_EXCHANGES.has((r.exchange || '').toUpperCase()) ? 0 : r.currency === 'USD' ? 1 : 2)
  return [...merged.values()]
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, 12)
    .map((r) => ({ symbol: r.symbol, name: r.name, exchange: r.exchangeFull || r.exchange, currency: r.currency }))
}

// Full per-symbol enrichment for the detail panel: profile, analyst price-target
// consensus, analyst rating breakdown, next + last earnings, and recent news.
// Each piece is independent and best-effort — a premium-only endpoint just
// yields null for that section. Cached 10 min (this data moves slowly, and it's
// the expensive part of the request budget).
export async function analyzeSymbol(symbol, apiKey) {
  // No requireKey: the quote + news come from Yahoo when FMP can't cover the
  // symbol (or no key is set), so the panel still renders — just without the
  // FMP-only analyst/earnings sections.
  const sym = String(symbol).trim().toUpperCase()
  // Live price stays fresh (its own short TTL); the slow enrichment is fetched
  // at most once a day and persisted to disk (see dayCached / fetchEnrichment).
  const [quote, enrich, news] = await Promise.all([
    fetchQuotes([sym], apiKey).then((q) => q[0] || null).catch(() => null),
    dayCached(
      `enrich:${sym}`,
      () => fetchEnrichment(sym, apiKey),
      // Only day-cache a result that actually carries something, so a fully
      // uncovered symbol retries next time rather than sticking blank all day.
      (v) => !!(v && (v.profile || v.target || v.ratings || (v.earnings && v.earnings.length))),
    ),
    getNews(sym, apiKey),
  ])
  return { symbol: sym, quote, ...enrich, news }
}

// The slow-moving, day-cacheable half of the analysis: company profile, analyst
// price-target consensus, rating breakdown and earnings. FMP is tried first;
// when it can't cover the symbol (free-plan restriction / rate limit) the
// analyst target + ratings fall back to Yahoo, so non-US listings still show a
// target and consensus instead of "not covered by the free FMP plan".
async function fetchEnrichment(sym, apiKey) {
  const [profile, target, ratings, earnings] = await Promise.all([
    best(() => fmpGet('profile', apiKey, { symbol: sym })).then((a) => firstOf(a)),
    best(() => fmpGet('price-target-consensus', apiKey, { symbol: sym })).then((a) => firstOf(a)),
    best(() => fmpGet('grades-consensus', apiKey, { symbol: sym })).then((a) => firstOf(a)),
    // FMP's free tier caps `limit` at 5 on these endpoints (a higher value
    // 400s), so stay within it.
    best(() => fmpGet('earnings', apiKey, { symbol: sym, limit: 5 })),
  ])

  let outTarget = target
    ? { high: num(target.targetHigh), low: num(target.targetLow), consensus: num(target.targetConsensus), median: num(target.targetMedian) }
    : null
  let outRatings = ratings
    ? {
        consensus: ratings.consensus || '',
        strongBuy: num(ratings.strongBuy) || 0,
        buy: num(ratings.buy) || 0,
        hold: num(ratings.hold) || 0,
        sell: num(ratings.sell) || 0,
        strongSell: num(ratings.strongSell) || 0,
      }
    : null

  // Fill any gap FMP left with Yahoo's analyst data (one call covers both).
  if (!outTarget || !outRatings) {
    try {
      const y = await fetchYahooEnrichment(sym)
      if (!outTarget) outTarget = y.target
      if (!outRatings) outRatings = y.ratings
    } catch (e) {
      log.step(`Yahoo enrichment failed for ${sym}: ${e.message}`)
    }
  }

  return {
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
    target: outTarget,
    ratings: outRatings,
    earnings: normalizeEarnings(earnings),
  }
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
      // Forward-looking signal: how far today's price sits below/above the
      // analyst consensus target. THIS — not the holder's cost basis — is what
      // should drive a buy/sell lean. Positive = room to run, negative = the
      // price has already overshot where analysts see fair value.
      const upsidePct =
        t.consensus != null && q.price != null && q.price > 0
          ? (((t.consensus - q.price) / q.price) * 100).toFixed(1)
          : null
      const parts = [
        `${h.symbol} (${h.name || q.name || ''})`,
        `shares=${h.shares ?? '?'}`,
        q.price != null ? `price=${q.price}` : null,
        t.consensus != null ? `analystTarget=${t.consensus}` : null,
        upsidePct != null ? `upsideToTargetPct=${upsidePct}` : null,
        h.ratingConsensus ? `analystRating=${h.ratingConsensus}` : null,
        q.changePct != null ? `todayPct=${q.changePct}` : null,
        q.yearHigh != null ? `week52High=${q.yearHigh}` : null,
        q.yearLow != null ? `week52Low=${q.yearLow}` : null,
        h.sector ? `sector=${h.sector}` : null,
        // Cost basis is included ONLY so the overview can name winners/losers.
        // It must NOT influence any stance — see the rules below.
        h.avgPrice != null ? `holderAvgCost=${h.avgPrice}` : null,
        h.gainPct != null ? `holderUnrealizedPct=${h.gainPct}` : null,
      ].filter(Boolean)
      return `- ${parts.join(', ')}`
    })
    .join('\n')

  return `You are a careful, forward-looking equity research assistant. Below is a real portfolio with live prices, analyst consensus price targets and rating consensus (where available), 52-week range, valuation, and the holder's cost basis.

Portfolio:
${rows}

Decide a stance for each holding based ONLY on forward-looking, security-level signals — never on the holder's profit or loss. The holder's average cost and unrealized P/L are SUNK: whether they are up or down says nothing about whether the stock is attractive from here. A stock can be a screaming buy while the holder is down, or a clear trim while the holder is up.

How to reason about each stance:
- "accumulate": meaningful upside to the analyst target AND/OR a Buy-leaning rating, reasonable valuation, and no obvious negative catalyst. The forward case is intact or improving.
- "hold": roughly fairly valued vs the target, mixed or neutral signals, no strong edge either way.
- "trim": the price has run to or ABOVE the analyst target (little or no upside, negative upsideToTargetPct), stretched valuation, sitting at/near the 52-week high with deteriorating signals, or an oversized position that dominates the portfolio (concentration risk). Trim because upside is gone — NOT because the holder is sitting on a gain, and NEVER because they are sitting on a loss.
- "review": a real red flag needs a closer look (rating downgrade, price far above target, weak fundamentals) before acting.

Write a JSON object with this exact shape:
{
  "overview": "3-5 sentence plain-English read on the portfolio: concentration, sector tilt, and which names have the best/worst forward setup (upside to target, rating). You may mention notable winners/losers vs cost, but frame stances around forward prospects.",
  "positions": [
    { "symbol": "TICKER", "stance": "accumulate | hold | trim | review", "reason": "1-2 sentences citing the specific FORWARD data that drives the stance — upside/downside to target, rating, valuation, 52-week position, concentration. Attribute analyst views to 'analysts'. Do NOT cite the holder's gain or loss as a reason.", "confidence": "low | medium | high" }
  ],
  "watch": ["short bullet risks or catalysts to watch this week, e.g. upcoming earnings, names trading above target, concentration risk"],
  "disclaimer": ${JSON.stringify(DISCLAIMER)}
}

Rules: base every claim on the data given — do NOT invent prices, targets or ratings. If analyst data is missing for a name, say the signal is unavailable and lean "hold" rather than guessing. Never justify a stance with the holder's unrealized gain or loss. Do not promise returns or use hype. Keep it concise and specific. Include one position object for every holding. Return only the JSON.`
}

// The screening universe, grouped by theme. Deliberately mixes megacaps with
// higher-beta mid-caps and less-obvious "niche" names (specialty consumer,
// cybersecurity, fintech, semis, GLP-1/medtech, nuclear/power, growth SaaS) —
// the kind of names that can move a lot, not just the mega-cap defaults. Ideas
// are still screened from these on REAL signals (analyst upside, rating, 52-week
// position, earnings, momentum), never invented. Held names are filtered out at
// request time, and picks are diversified across themes so the list isn't all
// one sector. All US-listed so FMP's free plan can supply analyst data.
const IDEA_THEMES = {
  megacap: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'AVGO', 'NFLX'],
  semis: ['AMD', 'QCOM', 'TXN', 'MU', 'MRVL', 'ARM', 'SMCI', 'ANET', 'MPWR', 'ON', 'LRCX', 'KLAC'],
  software: ['CRM', 'ADBE', 'NOW', 'PLTR', 'CRWD', 'PANW', 'ZS', 'NET', 'DDOG', 'SNOW', 'MDB', 'TEAM', 'HUBS'],
  fintech: ['V', 'MA', 'JPM', 'HOOD', 'COIN', 'SOFI', 'AFRM', 'NU', 'TOST'],
  consumer: ['ELF', 'CELH', 'ONON', 'DECK', 'CROX', 'ANF', 'WING', 'CAVA', 'DKNG', 'RCL', 'CMG', 'LULU'],
  ecommerce: ['SHOP', 'MELI', 'SE', 'DASH', 'ABNB', 'UBER'],
  health: ['LLY', 'UNH', 'ISRG', 'VRTX', 'REGN', 'DXCM', 'PODD', 'HIMS', 'NVO'],
  energy: ['XOM', 'CVX', 'LNG', 'VST', 'CEG', 'GEV', 'FSLR', 'ENPH'],
  staples: ['COST', 'WMT', 'PG', 'KO', 'PEP', 'MCD'],
  industrial: ['CAT', 'GE', 'DE', 'ETN', 'PWR'],
}
const IDEA_UNIVERSE = [...new Set(Object.values(IDEA_THEMES).flat())]
const THEME_OF = new Map(Object.entries(IDEA_THEMES).flatMap(([theme, syms]) => syms.map((s) => [s, theme])))

// How many ideas to surface (up from the original 6 — the user asked for more).
const IDEA_COUNT = 12
// Cap per theme so the list stays diverse (no all-semis wall).
const MAX_PER_THEME = 3

// Score a candidate: reward analyst upside and a bullish rating, plus EITHER of
// two paths to a move — being cheap within its 52-week range (mean-reversion) OR
// showing strong momentum with an earnings beat (trend). Small extra nudge for
// smaller-cap "niche" names, which have more room to run. Deterministic — the
// ranking is facts; the model only phrases the thesis afterwards.
function ideaScore(c) {
  const ratingBonus = { 'Strong Buy': 12, Buy: 8, Outperform: 8, Hold: 0, Sell: -15, 'Strong Sell': -20 }[c.rating] ?? 0
  const cheapBonus = c.pos52 != null ? (1 - c.pos52) * 12 : 0 // near 52w low → up to +12
  // Momentum: high in the range AND a positive earnings beat = a working trend.
  const momoBonus = c.pos52 != null && c.pos52 >= 0.6 && (c.epsBeat ?? -1) > 0 ? c.pos52 * 10 : 0
  // "Niche" nudge: sub-$50B caps have more torque than the megacaps.
  const nicheBonus = c.marketCap != null && c.marketCap > 0 && c.marketCap < 50e9 ? 6 : 0
  return (c.upsidePct ?? 0) + ratingBonus + Math.max(cheapBonus, momoBonus) + nicheBonus
}

// Screen the universe for buy ideas grounded in real data: analyst target upside
// vs current price, rating consensus, position in the 52-week range, and the
// last earnings beat/miss. Returns the top candidates enriched with a headline.
export async function rankIdeaCandidates(held, apiKey) {
  const heldSet = new Set((held || []).map((s) => String(s).trim().toUpperCase()))
  const universe = IDEA_UNIVERSE.filter((s) => !heldSet.has(s))
  const quotes = await fetchQuotes(universe, apiKey)
  const qBy = new Map(quotes.map((q) => [q.symbol.toUpperCase(), q]))

  // Ranking pass: quote (have it, incl. marketCap) + analyst target (1 cached
  // call each). epsBeat isn't known yet, so this prelim score uses upside +
  // cheapness + the niche cap nudge to pick a shortlist to enrich.
  const scored = (
    await Promise.all(
      universe.map(async (sym) => {
        const q = qBy.get(sym)
        if (!q || q.price == null) return null
        const t = await cached(`ptc:${sym}`, 30 * 60_000, () =>
          best(() => fmpGet('price-target-consensus', apiKey, { symbol: sym })).then(firstOf)
        )
        const consensus = num(t?.targetConsensus)
        if (consensus == null) return null
        const upsidePct = ((consensus - q.price) / q.price) * 100
        const pos52 =
          q.yearHigh != null && q.yearLow != null && q.yearHigh > q.yearLow
            ? (q.price - q.yearLow) / (q.yearHigh - q.yearLow)
            : null
        return {
          symbol: sym,
          name: q.name,
          price: q.price,
          currency: q.currency,
          marketCap: q.marketCap,
          theme: THEME_OF.get(sym) || 'other',
          consensus,
          upsidePct,
          pos52,
        }
      })
    )
  ).filter(Boolean)

  // Shortlist by prelim score — wider than the final count so the momentum
  // re-rank (which needs earnings) and theme diversification have room to work.
  const shortlist = scored
    .sort((a, b) => ideaScore({ ...b, rating: '' }) - ideaScore({ ...a, rating: '' }))
    .slice(0, IDEA_COUNT * 2)

  // Enrichment pass for the shortlist: rating, last earnings, a headline.
  const enriched = await Promise.all(
    shortlist.map(async (c) => {
      const [grades, earnings, news] = await Promise.all([
        best(() => fmpGet('grades-consensus', apiKey, { symbol: c.symbol })).then(firstOf),
        best(() => fmpGet('earnings', apiKey, { symbol: c.symbol, limit: 5 })),
        getNews(c.symbol, apiKey),
      ])
      const last = normalizeEarnings(earnings).lastReported
      const epsBeat =
        last && last.epsActual != null && last.epsEstimated != null ? last.epsActual - last.epsEstimated : null
      return {
        ...c,
        rating: grades?.consensus || '',
        epsBeat,
        epsDate: last?.date || '',
        headline: news[0]?.title || '',
        headlineUrl: news[0]?.url || '',
        headlineSite: news[0]?.site || '',
      }
    })
  )

  // Final re-rank with the full signal set (now incl. epsBeat momentum), then
  // diversify across themes so the list isn't dominated by one sector.
  const ranked = enriched.sort((a, b) => ideaScore(b) - ideaScore(a))
  const perTheme = new Map()
  const picks = []
  for (const c of ranked) {
    const n = perTheme.get(c.theme) || 0
    if (n >= MAX_PER_THEME) continue
    perTheme.set(c.theme, n + 1)
    picks.push(c)
    if (picks.length >= IDEA_COUNT) break
  }
  // If theme caps left us short (small shortlist), backfill by pure score.
  if (picks.length < IDEA_COUNT) {
    for (const c of ranked) {
      if (picks.includes(c)) continue
      picks.push(c)
      if (picks.length >= IDEA_COUNT) break
    }
  }
  return picks
}

// Turn the screened candidates + their real numbers into short theses. The model
// must justify each pick strictly from the figures we pass — no invented facts.
export function buildIdeasPrompt(candidates) {
  const rows = candidates
    .map((c) => {
      const parts = [
        `${c.symbol} (${c.name})`,
        c.theme ? `theme=${c.theme}` : null,
        `price=${round2(c.price)} ${c.currency}`,
        c.marketCap != null ? `marketCap=${capLabel(c.marketCap)}` : null,
        c.consensus != null ? `analystTarget=${round2(c.consensus)} (upside ${round2(c.upsidePct)}%)` : null,
        c.rating ? `analystRating=${c.rating}` : null,
        c.pos52 != null
          ? `positionIn52wkRange=${Math.round(c.pos52 * 100)}% (0%=at its 52-week low/cheap, 100%=at its 52-week high/expensive; high+beating earnings = momentum)`
          : null,
        c.epsBeat != null ? `lastEPS=${c.epsBeat >= 0 ? 'beat' : 'missed'} by ${round2(Math.abs(c.epsBeat))}` : null,
        c.headline ? `headline="${c.headline}"` : null,
      ].filter(Boolean)
      return `- ${parts.join(', ')}`
    })
    .join('\n')

  return `Below are stocks screened as potential buys across different themes/sectors, each with real data. They range from megacaps to smaller, higher-beta "niche" names. Write a punchy, fact-based thesis for EACH one that explains WHY it's interesting.

Candidates:
${rows}

Return JSON:
{
  "ideas": [
    { "symbol": "TICKER", "thesis": "2-3 sentences citing MULTIPLE specific figures: the analyst upside vs target, the rating, where it sits in its 52-week range (frame it as value if low, momentum if high), the last earnings beat/miss, its size/theme (call out smaller-cap names as higher-torque), and how the headline fits. Attribute analyst views to 'analysts'." }
  ],
  "disclaimer": ${JSON.stringify(DISCLAIMER)}
}

Rules: use ONLY the numbers and headline given for each candidate — do not invent prices, targets, or facts. Every thesis must reference at least THREE concrete data points and give a clear reason the stock could move. Differentiate value plays (cheap in range) from momentum plays (high in range + earnings beat). No generic "market leader" filler. This is research to investigate, not a recommendation to buy. One idea object per candidate, same order. Return only the JSON.`
}
const round2 = (n) => (n == null ? null : Math.round(Number(n) * 100) / 100)
// Human market-cap label for the ideas prompt (e.g. "$12.4B", "$1.2T").
function capLabel(n) {
  if (n == null || !(n > 0)) return null
  if (n >= 1e12) return `$${round2(n / 1e12)}T`
  if (n >= 1e9) return `$${round2(n / 1e9)}B`
  if (n >= 1e6) return `$${round2(n / 1e6)}M`
  return `$${Math.round(n)}`
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
