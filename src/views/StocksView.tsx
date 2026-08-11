import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  RefreshCw,
  Loader2,
  Plus,
  X,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Lightbulb,
  ChevronDown,
  HelpCircle,
  Pencil,
  ExternalLink,
  Eye,
  EyeOff,
} from 'lucide-react';
import type {
  Holding,
  StockQuote,
  StockAnalysis,
  SymbolSearchResult,
  PortfolioSummary,
  StockIdeas,
  WhyMoved,
} from '../types';
import { ViewHeader } from '../components/ViewHeader';
import {
  getStockQuotes,
  getFxRates,
  searchStockSymbols,
  analyzeStock,
  whyStockMoved,
  summarizePortfolio,
  getStockIdeas,
} from '../lib/api';
import { loadHoldings, saveHoldings } from '../lib/localPortfolio';

// ── formatting helpers ───────────────────────────────────────────────────────
// Currency symbol for the common cases (holdings can be USD, EUR, GBP… since
// prices may come from Yahoo for European listings). Falls back to the ISO code.
const CUR: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', CHF: 'CHF ', JPY: '¥', CAD: 'C$', AUD: 'A$', GBp: 'p' };
const curSym = (c?: string) => (c ? CUR[c] ?? `${c} ` : '$');
const money = (n: number | null | undefined, cur?: string, dp = 2) =>
  n == null || Number.isNaN(n) ? '—' : `${curSym(cur)}${n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
const pct = (n: number | null | undefined) => (n == null || Number.isNaN(n) ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`);
// A signed money value with an explicit + / − so a loss never reads as a gain.
const signedMoney = (n: number | null | undefined, cur?: string, dp = 2) =>
  n == null || Number.isNaN(n) ? '—' : `${n >= 0 ? '+' : '−'}${money(Math.abs(n), cur, dp)}`;
function fmtDate(iso: string) {
  const t = new Date(iso).getTime();
  if (!t) return iso;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
const upColor = (n: number | null | undefined) =>
  n == null ? 'text-ink-4' : n > 0 ? 'text-emerald-500' : n < 0 ? 'text-red-500' : 'text-ink-4';

// Convert an amount from one currency to another using rates keyed off a single
// base (here USD). `fx[X]` is "how many X per 1 base", so X→Y is `× fx[Y]/fx[X]`.
// Returns the amount unchanged when currencies match, rates are missing, or a
// currency is unknown — so a rate gap degrades to "shown in native" not a blank.
type Fx = Record<string, number> | null;
// Some listings quote in a currency's minor unit — London stocks trade in GBp
// (pence = 1/100 GBP), and FX tables only carry the major unit (GBP). Normalise
// to { ISO code that fx uses, factor to reach the major unit } so pence converts
// correctly instead of coming out 100× too high.
function normCur(cur: string): { code: string; factor: number } {
  if (cur === 'GBp' || cur === 'GBX') return { code: 'GBP', factor: 0.01 };
  if (cur === 'ZAc' || cur === 'ZAX') return { code: 'ZAR', factor: 0.01 };
  if (cur === 'ILA') return { code: 'ILS', factor: 0.01 };
  return { code: (cur || '').toUpperCase(), factor: 1 };
}
function convertRaw(n: number | null | undefined, from: string, to: string, fx: Fx): number | null {
  if (n == null || Number.isNaN(n)) return null;
  const F = normCur(from);
  const T = normCur(to);
  if (!F.code || !T.code) return n;
  const major = n * F.factor; // amount in F's major unit
  if (F.code === T.code) return major / T.factor;
  const rf = fx?.[F.code];
  const rt = fx?.[T.code];
  if (!rf || !rt) return n;
  return (major * (rt / rf)) / T.factor;
}

// A holding joined with its live quote + derived P/L, for rendering + sorting.
interface Row {
  h: Holding;
  quote: StockQuote | null;
  cur: string; // display currency for this holding (from its quote)
  value: number | null; // shares × price
  cost: number; // shares × avgPrice
  gain: number | null; // value − cost
  gainPct: number | null; // (price − avgPrice) / avgPrice
}

interface StocksViewProps {
  hasFmp: boolean;
  canGenerate: boolean; // OpenRouter key present → AI summaries/ideas available
  model: string;
}

export function StocksView({ hasFmp, canGenerate, model }: StocksViewProps) {
  const [holdings, setHoldings] = useState<Holding[]>(() => loadHoldings());
  const [quotes, setQuotes] = useState<Record<string, StockQuote>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  // Spot FX rates (base USD) for showing every value in EUR alongside its native
  // currency. null until loaded / if the rate service is down (then EUR lines are
  // simply omitted rather than shown wrong).
  const [fx, setFx] = useState<Record<string, number> | null>(null);

  // Symbols temporarily excluded from the totals — a scratch "what-if" toggle so
  // you can see how the portfolio total shifts without a holding. In-memory only
  // (resets on reload); the holding stays visible, just dimmed and uncounted.
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const toggleExcluded = (symbol: string) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      const s = symbol.toUpperCase();
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });

  const [expanded, setExpanded] = useState<string | null>(null);
  const [analyses, setAnalyses] = useState<Record<string, StockAnalysis | { error: string } | 'loading'>>({});
  const [why, setWhy] = useState<Record<string, WhyMoved | { error: string } | 'loading'>>({});

  const [summary, setSummary] = useState<PortfolioSummary | 'loading' | null>(null);
  const [summaryErr, setSummaryErr] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<StockIdeas | 'loading' | null>(null);
  const [ideasErr, setIdeasErr] = useState<string | null>(null);

  const persist = (next: Holding[]) => {
    setHoldings(next);
    saveHoldings(next);
  };

  // Fetch live quotes for the whole list (load + Refresh). Cheap call.
  const refreshQuotes = useCallback(async (symbols: string[]) => {
    if (!symbols.length) {
      setQuotes({});
      setUpdatedAt(Date.now());
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const q = await getStockQuotes(symbols);
      const map: Record<string, StockQuote> = {};
      for (const item of q) map[item.symbol.toUpperCase()] = item;
      setQuotes(map);
      setUpdatedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial quote load. State is set only inside the async callbacks (never
  // synchronously in the effect body) — the first render already shows the
  // empty/loading state, so there's no flash to cover.
  useEffect(() => {
    if (!hasFmp) return;
    const initial = loadHoldings();
    if (!initial.length) return;
    let cancelled = false;
    getStockQuotes(initial.map((h) => h.symbol))
      .then((q) => {
        if (cancelled) return;
        const map: Record<string, StockQuote> = {};
        for (const item of q) map[item.symbol.toUpperCase()] = item;
        setQuotes(map);
        setUpdatedAt(Date.now());
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [hasFmp]);

  // Spot FX rates (base USD), fetched once. Server-cached 1h, so this is cheap
  // and shared across refreshes. Failure leaves fx null → toggle falls back to
  // native values (see convertRaw), so the page still works offline from rates.
  useEffect(() => {
    let cancelled = false;
    getFxRates('USD')
      .then((r) => {
        if (!cancelled) setFx(r.rates);
      })
      .catch(() => {
        /* rates unavailable → conversion silently no-ops */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows: Row[] = useMemo(() => {
    return holdings
      .map((h) => {
        const quote = quotes[h.symbol.toUpperCase()] || null;
        const price = quote?.price ?? null;
        const value = price != null ? price * h.shares : null;
        const cost = h.avgPrice * h.shares;
        const gain = value != null ? value - cost : null;
        const gainPct = price != null && h.avgPrice > 0 ? ((price - h.avgPrice) / h.avgPrice) * 100 : null;
        return { h, quote, cur: quote?.currency || h.currency || 'USD', value, cost, gain, gainPct };
      })
      .sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
  }, [holdings, quotes]);

  // Portfolio totals, summed into a single target currency so the combined figure
  // is correct even across mixed-currency listings (converting each row first).
  // We compute it in both USD and EUR so the header can show both at once. When
  // rates are missing, conversion no-ops and mixed holdings won't add up cleanly
  // — flagged via `mixed` so the UI can note it rather than lie.
  const totals = useMemo(() => {
    const priced = rows.filter((r) => r.value != null && !excluded.has(r.h.symbol.toUpperCase()));
    const inCur = (target: string) => {
      let value = 0;
      let cost = 0;
      let dayChange = 0;
      for (const r of priced) {
        value += convertRaw(r.value, r.cur, target, fx) ?? r.value!;
        cost += convertRaw(r.cost, r.cur, target, fx) ?? r.cost;
        const prev = r.quote?.previousClose;
        if (prev != null) {
          const dc = (r.quote!.price! - prev) * r.h.shares;
          dayChange += convertRaw(dc, r.cur, target, fx) ?? dc;
        }
      }
      const gain = value - cost;
      return {
        value,
        gain,
        gainPct: cost > 0 ? (gain / cost) * 100 : null,
        dayChange,
        dayPct: value - dayChange > 0 ? (dayChange / (value - dayChange)) * 100 : null,
      };
    };
    const have = priced.length > 0;
    const currencies = [...new Set(priced.map((r) => normCur(r.cur).code))];
    return {
      have,
      usd: have ? inCur('USD') : null,
      eur: have ? inCur('EUR') : null,
      // If holdings span >1 currency and we have no rates, the sums are unreliable.
      mixed: currencies.length > 1 && !fx,
      excludedCount: rows.filter((r) => r.value != null && excluded.has(r.h.symbol.toUpperCase())).length,
    };
  }, [rows, fx, excluded]);

  // Open a holding → lazily fetch its full analysis once.
  const toggle = (symbol: string) => {
    const sym = symbol.toUpperCase();
    setExpanded((cur) => (cur === sym ? null : sym));
    if (!analyses[sym]) {
      setAnalyses((a) => ({ ...a, [sym]: 'loading' }));
      analyzeStock(sym)
        .then((res) => setAnalyses((a) => ({ ...a, [sym]: res })))
        .catch((e) => setAnalyses((a) => ({ ...a, [sym]: { error: e instanceof Error ? e.message : String(e) } })));
    }
  };

  const askWhy = (r: Row) => {
    const sym = r.h.symbol.toUpperCase();
    setWhy((w) => ({ ...w, [sym]: 'loading' }));
    whyStockMoved({ symbol: sym, name: r.h.name, changePct: r.quote?.changePct, model })
      .then((res) => setWhy((w) => ({ ...w, [sym]: res })))
      .catch((e) => setWhy((w) => ({ ...w, [sym]: { error: e instanceof Error ? e.message : String(e) } })));
  };

  // Portfolio summary — fetch full analyses for every holding (server-cached),
  // enrich, then ask the model to reason over the real numbers.
  const runSummary = async () => {
    setSummary('loading');
    setSummaryErr(null);
    try {
      const analysesList = await Promise.all(holdings.map((h) => analyzeStock(h.symbol).catch(() => null)));
      const enriched = holdings.map((h, i) => {
        const a = analysesList[i];
        const quote = quotes[h.symbol.toUpperCase()] || a?.quote || null;
        const price = quote?.price ?? null;
        const gainPct = price != null && h.avgPrice > 0 ? ((price - h.avgPrice) / h.avgPrice) * 100 : null;
        return {
          symbol: h.symbol,
          name: h.name,
          shares: h.shares,
          avgPrice: h.avgPrice,
          quote: quote ? { price: quote.price, changePct: quote.changePct } : null,
          target: a?.target || null,
          ratingConsensus: a?.ratings?.consensus || null,
          sector: a?.profile?.sector || null,
          gainPct: gainPct != null ? Number(gainPct.toFixed(1)) : null,
        };
      });
      setSummary(await summarizePortfolio(enriched, model));
    } catch (e) {
      setSummary(null);
      setSummaryErr(e instanceof Error ? e.message : String(e));
    }
  };

  const runIdeas = async () => {
    setIdeas('loading');
    setIdeasErr(null);
    try {
      setIdeas(await getStockIdeas(holdings.map((h) => ({ symbol: h.symbol, sector: '' })), model));
    } catch (e) {
      setIdeas(null);
      setIdeasErr(e instanceof Error ? e.message : String(e));
    }
  };

  if (!hasFmp) {
    return (
      <>
        <ViewHeader title="Stocks" subtitle="Analyze your portfolio: live prices, analyst targets, earnings, news and AI summaries." />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-md text-center">
            <TrendingUp size={28} className="mx-auto text-ink-5 mb-3" />
            <p className="text-[14px] text-ink-3 font-medium">Add a Financial Modeling Prep API key</p>
            <p className="text-[13px] text-ink-5 mt-2">
              The Stocks analyzer needs a (free) FMP key for market data. Add it in <span className="text-ink-3 font-medium">Settings → API keys</span>, then come back here.
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <ViewHeader
        title="Stocks"
        subtitle="Your holdings with live prices, analyst targets, earnings & news — plus AI summaries. Information only, not financial advice."
        right={
          <>
            {updatedAt && !loading && (
              <span className="text-[11px] text-ink-6 mr-1">
                updated {new Date(updatedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button
              onClick={() => void refreshQuotes(holdings.map((h) => h.symbol))}
              disabled={loading || !holdings.length}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-line text-[12px] text-ink-4 hover:text-ink hover:border-line-2 disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </>
        }
      />

      <div className="flex-1 overflow-y-auto">
        {/* Add holding */}
        <div className="px-4 sm:px-8 py-4 border-b border-line bg-surface">
          <div className="max-w-4xl mx-auto">
            <AddHolding
              existing={holdings.map((h) => h.symbol)}
              onAdd={(h) => {
                const next = [...holdings.filter((x) => x.symbol !== h.symbol), h];
                persist(next);
                void refreshQuotes(next.map((x) => x.symbol));
              }}
            />
          </div>
        </div>

        {/* Totals + AI actions */}
        {holdings.length > 0 && (
          <div className="px-4 sm:px-8 py-4 border-b border-line bg-surface">
            <div className="max-w-4xl mx-auto flex flex-wrap items-end gap-x-8 gap-y-4 justify-between">
              <div className="flex flex-wrap gap-x-8 gap-y-4">
                <Stat
                  label="Portfolio value"
                  value={money(totals.usd?.value, 'USD')}
                  alt={fx ? money(totals.eur?.value, 'EUR') : undefined}
                />
                <Stat
                  label="Today"
                  value={signedMoney(totals.usd?.dayChange, 'USD')}
                  alt={fx ? signedMoney(totals.eur?.dayChange, 'EUR') : undefined}
                  sub={pct(totals.usd?.dayPct)}
                  color={upColor(totals.usd?.dayChange)}
                />
                <Stat
                  label="Total unrealised"
                  value={signedMoney(totals.usd?.gain, 'USD')}
                  alt={fx ? signedMoney(totals.eur?.gain, 'EUR') : undefined}
                  sub={pct(totals.usd?.gainPct)}
                  color={upColor(totals.usd?.gain)}
                />
                {totals.mixed && (
                  <div className="self-center text-[11px] text-amber-500 max-w-[180px]">
                    FX rates unavailable — mixed-currency total may be off.
                  </div>
                )}
                {totals.excludedCount > 0 && (
                  <button
                    onClick={() => setExcluded(new Set())}
                    className="self-center flex items-center gap-1.5 text-[11px] text-ink-5 hover:text-ink"
                    title="Reset — count every holding again"
                  >
                    <EyeOff size={12} />
                    {totals.excludedCount} hidden from total · reset
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={runSummary}
                  disabled={!canGenerate || summary === 'loading'}
                  title={canGenerate ? '' : 'Add an OpenRouter key in Settings to enable AI summaries'}
                  className="flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-ink text-bg text-[13px] font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {summary === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  Analyze portfolio
                </button>
                <button
                  onClick={runIdeas}
                  disabled={!canGenerate || ideas === 'loading'}
                  title={canGenerate ? '' : 'Add an OpenRouter key in Settings to enable AI ideas'}
                  className="flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-line text-[13px] text-ink-3 hover:text-ink hover:border-line-2 disabled:opacity-50"
                >
                  {ideas === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <Lightbulb size={14} />}
                  Ideas to buy
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="p-4 sm:p-8">
          <div className="max-w-4xl mx-auto flex flex-col gap-6">
            {/* Portfolio summary result */}
            {summaryErr && <ErrorNote text={summaryErr} />}
            {summary && summary !== 'loading' && <SummaryCard summary={summary} onClose={() => setSummary(null)} />}

            {/* Ideas result */}
            {ideasErr && <ErrorNote text={ideasErr} />}
            {ideas && ideas !== 'loading' && <IdeasCard ideas={ideas} held={holdings.map((h) => h.symbol)} onClose={() => setIdeas(null)} />}

            {/* Holdings */}
            {holdings.length === 0 ? (
              <Empty text="Add your holdings above to see live prices, analyst targets, earnings and AI summaries. Search by company name and pick the US-listed ticker so market data resolves." />
            ) : error && !Object.keys(quotes).length ? (
              <ErrorNote text={error} />
            ) : (
              <div className="flex flex-col gap-2.5">
                {rows.map((r) => (
                  <HoldingCard
                    key={r.h.symbol}
                    row={r}
                    fx={fx}
                    excluded={excluded.has(r.h.symbol.toUpperCase())}
                    onToggleExclude={() => toggleExcluded(r.h.symbol)}
                    expanded={expanded === r.h.symbol.toUpperCase()}
                    analysis={analyses[r.h.symbol.toUpperCase()]}
                    why={why[r.h.symbol.toUpperCase()]}
                    canGenerate={canGenerate}
                    onToggle={() => toggle(r.h.symbol)}
                    onWhy={() => askWhy(r)}
                    onRemove={() => {
                      const next = holdings.filter((x) => x.symbol !== r.h.symbol);
                      persist(next);
                    }}
                    onEdit={(shares, avgPrice) => {
                      persist(holdings.map((x) => (x.symbol === r.h.symbol ? { ...x, shares, avgPrice } : x)));
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Add-holding bar: search FMP symbols, then enter shares + avg cost ─────────
function AddHolding({ existing, onAdd }: { existing: string[]; onAdd: (h: Holding) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SymbolSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<SymbolSearchResult | null>(null);
  const [shares, setShares] = useState('');
  const [avg, setAvg] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (picked) return; // not searching while filling in the position
    if (timer.current) clearTimeout(timer.current);
    const q = query.trim();
    // Below 2 chars the dropdown is hidden anyway (see render), so we just skip
    // the fetch and leave any stale results — no synchronous setState here.
    if (q.length < 2) return;
    timer.current = setTimeout(() => {
      setSearching(true);
      searchStockSymbols(q)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, picked]);

  const reset = () => {
    setPicked(null);
    setQuery('');
    setResults([]);
    setShares('');
    setAvg('');
  };

  const commit = () => {
    if (!picked) return;
    const n = Number(shares);
    const p = Number(avg);
    if (!(n > 0) || !(p > 0)) return;
    onAdd({ symbol: picked.symbol.toUpperCase(), name: picked.name, shares: n, avgPrice: p, currency: picked.currency || 'USD' });
    reset();
  };

  if (picked) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 h-9 px-3 rounded-lg bg-card border border-line">
          <span className="text-[13px] font-semibold text-ink">{picked.symbol}</span>
          <span className="text-[12px] text-ink-6 truncate max-w-[160px]">{picked.name}</span>
          {picked.currency && <span className="text-[11px] text-ink-5 shrink-0">· {picked.currency}</span>}
        </div>
        <input
          value={shares}
          onChange={(e) => setShares(e.target.value)}
          type="number"
          min="0"
          step="any"
          placeholder="Shares"
          className="h-9 w-28 px-3 rounded-lg bg-card border border-line text-[13px] text-ink placeholder:text-ink-6 outline-none focus-visible:ring-2 focus-visible:ring-ink/10"
        />
        <input
          value={avg}
          onChange={(e) => setAvg(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
          type="number"
          min="0"
          step="any"
          placeholder={`Avg cost / share${picked.currency ? ` (${picked.currency})` : ''}`}
          className="h-9 w-48 px-3 rounded-lg bg-card border border-line text-[13px] text-ink placeholder:text-ink-6 outline-none focus-visible:ring-2 focus-visible:ring-ink/10"
        />
        <button
          onClick={commit}
          disabled={!(Number(shares) > 0) || !(Number(avg) > 0)}
          className="flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-ink text-bg text-[13px] font-medium hover:opacity-90 disabled:opacity-50"
        >
          <Plus size={14} /> Add holding
        </button>
        <button onClick={reset} className="h-9 px-2 text-ink-6 hover:text-ink" aria-label="Cancel">
          <X size={15} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Add a holding — search by company or ticker (e.g. Apple, MSFT, Alphabet)"
          className="flex-1 h-9 px-3 rounded-lg bg-card border border-line text-[13px] text-ink placeholder:text-ink-6 outline-none focus-visible:ring-2 focus-visible:ring-ink/10"
        />
      </div>
      {query.trim().length >= 2 && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-card border border-line rounded-lg shadow-lg overflow-hidden max-h-72 overflow-y-auto">
          {searching && (
            <div className="flex items-center gap-2 px-3 py-2.5 text-[12px] text-ink-5">
              <Loader2 size={13} className="animate-spin" /> Searching…
            </div>
          )}
          {!searching && results.length === 0 && (
            <div className="px-3 py-2.5 text-[12px] text-ink-6">No matches. Try the company name or a US ticker.</div>
          )}
          {results.map((r) => {
            const already = existing.some((s) => s.toUpperCase() === r.symbol.toUpperCase());
            return (
              <button
                key={`${r.symbol}-${r.exchange}`}
                disabled={already}
                onClick={() => {
                  setPicked(r);
                  setResults([]);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-raised disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="text-[13px] font-semibold text-ink w-16 shrink-0">{r.symbol}</span>
                <span className="text-[12px] text-ink-4 truncate flex-1">{r.name}</span>
                <span className="text-[11px] text-ink-6 shrink-0">{already ? 'added' : r.exchange}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, alt, sub, color }: { label: string; value: string; alt?: string; sub?: string; color?: string }) {
  return (
    <div>
      <div className="text-[11px] text-ink-6 uppercase tracking-widest">{label}</div>
      <div className={`text-[22px] font-semibold leading-none mt-1.5 ${color || 'text-ink'}`}>{value}</div>
      {alt && <div className={`text-[13px] mt-1 opacity-70 ${color || 'text-ink-4'}`}>≈ {alt}</div>}
      {sub && <div className={`text-[12px] mt-1 ${color || 'text-ink-5'}`}>{sub}</div>}
    </div>
  );
}

// ── One holding row + expandable analysis ─────────────────────────────────────
function HoldingCard({
  row,
  fx,
  excluded,
  onToggleExclude,
  expanded,
  analysis,
  why,
  canGenerate,
  onToggle,
  onWhy,
  onRemove,
  onEdit,
}: {
  row: Row;
  fx: Fx;
  excluded: boolean;
  onToggleExclude: () => void;
  expanded: boolean;
  analysis: StockAnalysis | { error: string } | 'loading' | undefined;
  why: WhyMoved | { error: string } | 'loading' | undefined;
  canGenerate: boolean;
  onToggle: () => void;
  onWhy: () => void;
  onRemove: () => void;
  onEdit: (shares: number, avgPrice: number) => void;
}) {
  const { h, quote, cur, value, gain, gainPct } = row;
  // EUR equivalent of a native amount, for the secondary line. Returns null when
  // the holding is already in EUR (no second line needed) or rates are missing.
  const eur = (n: number | null | undefined): string | null => {
    if (n == null || !fx || normCur(cur).code === 'EUR') return null;
    const v = convertRaw(n, cur, 'EUR', fx);
    return v == null ? null : money(v, 'EUR');
  };
  const [editing, setEditing] = useState(false);
  const [shares, setShares] = useState(String(h.shares));
  const [avg, setAvg] = useState(String(h.avgPrice));

  return (
    <div className={`bg-card border rounded-xl overflow-hidden transition-colors ${excluded ? 'border-dashed border-line-2' : 'border-line'}`}>
      {/* Header row */}
      <div className="flex items-center gap-3 p-3.5">
        <button onClick={onToggle} className={`flex items-center gap-3 flex-1 min-w-0 text-left ${excluded ? 'opacity-45' : ''}`}>
          <div className="w-9 h-9 rounded-lg bg-raised shrink-0 flex items-center justify-center overflow-hidden">
            {analysis && analysis !== 'loading' && !('error' in analysis) && analysis.profile?.image ? (
              <img src={analysis.profile.image} alt="" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
            ) : (
              <span className="text-[11px] font-bold text-ink-5">{h.symbol.slice(0, 4)}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-semibold text-ink truncate">{h.name || h.symbol}</span>
              <span className="text-[11px] text-ink-6 shrink-0">{h.symbol}</span>
            </div>
            <div className="text-[12px] text-ink-5 mt-0.5">
              {h.shares} sh · avg {money(h.avgPrice, cur)}
            </div>
          </div>
        </button>

        {/* Price + today's move */}
        <div className={`text-right shrink-0 ${excluded ? 'opacity-45' : ''}`}>
          <div className="text-[14px] font-semibold text-ink">{money(quote?.price, cur)}</div>
          <div className={`text-[12px] ${upColor(quote?.changePct)} flex items-center gap-1 justify-end`}>
            {quote?.changePct != null && (quote.changePct >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />)}
            {pct(quote?.changePct)}
          </div>
        </div>

        {/* Value + unrealized (native, with EUR equivalent underneath) */}
        <div className={`text-right shrink-0 w-28 hidden sm:block ${excluded ? 'opacity-45' : ''}`}>
          <div className="text-[14px] font-semibold text-ink">{money(value, cur)}</div>
          {eur(value) && <div className="text-[11px] text-ink-5 opacity-80">≈ {eur(value)}</div>}
          <div className={`text-[12px] ${upColor(gain)}`}>
            {signedMoney(gain, cur, 0)} · {pct(gainPct)}
          </div>
        </div>

        {/* Exclude-from-total toggle — a scratch "what-if", doesn't remove the holding */}
        <button
          onClick={onToggleExclude}
          className={`shrink-0 p-1 ${excluded ? 'text-amber-500 hover:text-amber-400' : 'text-ink-6 hover:text-ink'}`}
          aria-label={excluded ? 'Count in total again' : 'Hide from total'}
          title={excluded ? 'Counting off — click to include in total' : 'Exclude from total (what-if)'}
        >
          {excluded ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>

        <button onClick={onToggle} className="text-ink-6 hover:text-ink shrink-0 p-1" aria-label="Toggle details">
          <ChevronDown size={16} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-line p-4 bg-surface">
          {/* Position editor + remove */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {editing ? (
              <>
                <input value={shares} onChange={(e) => setShares(e.target.value)} type="number" step="any" className="h-8 w-24 px-2 rounded-md bg-card border border-line text-[12px] text-ink outline-none" placeholder="Shares" />
                <input value={avg} onChange={(e) => setAvg(e.target.value)} type="number" step="any" className="h-8 w-32 px-2 rounded-md bg-card border border-line text-[12px] text-ink outline-none" placeholder="Avg cost" />
                <button
                  onClick={() => {
                    const n = Number(shares);
                    const p = Number(avg);
                    if (n > 0 && p > 0) onEdit(n, p);
                    setEditing(false);
                  }}
                  className="h-8 px-3 rounded-md bg-ink text-bg text-[12px] font-medium"
                >
                  Save
                </button>
                <button onClick={() => setEditing(false)} className="h-8 px-2 text-ink-6 hover:text-ink text-[12px]">Cancel</button>
              </>
            ) : (
              <>
                <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-line text-[12px] text-ink-4 hover:text-ink">
                  <Pencil size={12} /> Edit position
                </button>
                <button onClick={onRemove} className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-line text-[12px] text-red-500/80 hover:text-red-500">
                  <X size={13} /> Remove
                </button>
                <button
                  onClick={onWhy}
                  disabled={!canGenerate || why === 'loading'}
                  title={canGenerate ? '' : 'Add an OpenRouter key in Settings'}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-line text-[12px] text-ink-4 hover:text-ink disabled:opacity-50"
                >
                  {why === 'loading' ? <Loader2 size={12} className="animate-spin" /> : <HelpCircle size={12} />}
                  Why did it move today?
                </button>
              </>
            )}
          </div>

          {/* Why-moved result */}
          {why && why !== 'loading' && (
            'error' in why ? (
              <ErrorNote text={why.error} />
            ) : (
              <div className="mb-4 rounded-lg border border-line bg-card p-3">
                <p className="text-[13px] text-ink-3 leading-relaxed">{why.explanation}</p>
                {why.drivers.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1">
                    {why.drivers.map((d, i) => (
                      <li key={i} className="text-[12px] text-ink-5 flex gap-1.5">
                        <span className="text-ink-6">•</span> {d}
                      </li>
                    ))}
                  </ul>
                )}
                <Disclaimer text={why.disclaimer} />
              </div>
            )
          )}

          {analysis === 'loading' || analysis === undefined ? (
            <div className="flex items-center gap-2 py-6 text-ink-5 text-[13px]">
              <Loader2 size={14} className="animate-spin" /> Loading analysis…
            </div>
          ) : 'error' in analysis ? (
            <ErrorNote text={analysis.error} />
          ) : (
            <AnalysisBody a={analysis} price={quote?.price ?? null} cur={cur} />
          )}
        </div>
      )}
    </div>
  );
}

function AnalysisBody({ a, price, cur }: { a: StockAnalysis; price: number | null; cur: string }) {
  const t = a.target;
  const upside = t?.consensus != null && price != null && price > 0 ? ((t.consensus - price) / price) * 100 : null;
  const r = a.ratings;
  const totalRatings = r ? r.strongBuy + r.buy + r.hold + r.sell + r.strongSell : 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Analyst target + rating */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-lg border border-line bg-card p-3">
          <div className="text-[11px] text-ink-6 uppercase tracking-widest mb-2">Analyst price target</div>
          {t && t.consensus != null ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className="text-[20px] font-semibold text-ink">{money(t.consensus, cur)}</span>
                {upside != null && <span className={`text-[13px] ${upColor(upside)}`}>{pct(upside)} vs price</span>}
              </div>
              <div className="text-[12px] text-ink-6 mt-1">
                range {money(t.low, cur)} – {money(t.high, cur)}
              </div>
            </>
          ) : (
            <div className="text-[12px] text-ink-6">No analyst target — {a.symbol} isn't covered by the free FMP plan (common for non-US listings).</div>
          )}
        </div>
        <div className="rounded-lg border border-line bg-card p-3">
          <div className="text-[11px] text-ink-6 uppercase tracking-widest mb-2">Analyst consensus</div>
          {r && totalRatings > 0 ? (
            <>
              <div className="text-[15px] font-semibold text-ink capitalize">{r.consensus || 'Mixed'}</div>
              <div className="text-[12px] text-ink-5 mt-1">
                {r.strongBuy + r.buy} buy · {r.hold} hold · {r.sell + r.strongSell} sell
              </div>
            </>
          ) : (
            <div className="text-[12px] text-ink-6">No rating consensus — {a.symbol} isn't covered by the free FMP plan.</div>
          )}
        </div>
      </div>

      {/* Earnings */}
      {(a.earnings.upcoming || a.earnings.lastReported) && (
        <div className="rounded-lg border border-line bg-card p-3">
          <div className="text-[11px] text-ink-6 uppercase tracking-widest mb-2">Earnings</div>
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-[13px]">
            {a.earnings.upcoming && (
              <div>
                <span className="text-ink-6">Next report </span>
                <span className="text-ink-3 font-medium">{fmtDate(a.earnings.upcoming.date)}</span>
                {a.earnings.upcoming.epsEstimated != null && (
                  <span className="text-ink-6"> · est EPS {a.earnings.upcoming.epsEstimated}</span>
                )}
              </div>
            )}
            {a.earnings.lastReported && (
              <div>
                <span className="text-ink-6">Last ({fmtDate(a.earnings.lastReported.date)}) </span>
                <span className="text-ink-3 font-medium">EPS {a.earnings.lastReported.epsActual ?? '—'}</span>
                {a.earnings.lastReported.epsEstimated != null && (
                  <span className={upColor((a.earnings.lastReported.epsActual ?? 0) - a.earnings.lastReported.epsEstimated)}>
                    {' '}
                    vs est {a.earnings.lastReported.epsEstimated}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Company blurb */}
      {a.profile?.description && (
        <p className="text-[12px] text-ink-5 leading-relaxed line-clamp-3">
          {a.profile.sector && <span className="text-ink-4 font-medium">{a.profile.sector} · </span>}
          {a.profile.description}
        </p>
      )}

      {/* News */}
      {a.news.length > 0 && (
        <div>
          <div className="text-[11px] text-ink-6 uppercase tracking-widest mb-2">Recent news</div>
          <div className="flex flex-col gap-1.5">
            {a.news.slice(0, 6).map((n, i) => (
              <a
                key={i}
                href={n.url}
                target="_blank"
                rel="noreferrer"
                className="group flex items-start gap-2 rounded-md hover:bg-raised p-1.5 -m-1.5"
              >
                <ExternalLink size={12} className="text-ink-6 mt-0.5 shrink-0" />
                <span className="text-[13px] text-ink-4 group-hover:text-ink leading-snug">
                  {n.title}
                  <span className="text-ink-6"> · {n.site}{n.publishedDate ? ` · ${fmtDate(n.publishedDate)}` : ''}</span>
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── AI portfolio summary card ─────────────────────────────────────────────────
function SummaryCard({ summary, onClose }: { summary: PortfolioSummary; onClose: () => void }) {
  const stanceColor: Record<string, string> = {
    accumulate: 'text-emerald-500 border-emerald-500/30 bg-emerald-500/10',
    hold: 'text-ink-3 border-line bg-raised',
    trim: 'text-amber-500 border-amber-500/30 bg-amber-500/10',
    review: 'text-red-500 border-red-500/30 bg-red-500/10',
  };
  // Plain-English meaning of each stance tag, shown as a legend under the positions.
  const stanceHelp: { key: string; label: string; help: string }[] = [
    { key: 'accumulate', label: 'Accumulate', help: 'Upside to analyst target and/or a Buy rating — the forward case is intact.' },
    { key: 'hold', label: 'Hold', help: 'Roughly fairly valued vs target — no strong edge either way.' },
    { key: 'trim', label: 'Trim', help: 'Price at or above target (little upside left) or an oversized position — not because of any gain or loss.' },
    { key: 'review', label: 'Review', help: 'A red flag (downgrade, price far above target) worth a closer look before acting.' },
  ];
  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-ink-3" />
          <h3 className="text-[14px] font-semibold text-ink">Portfolio analysis</h3>
        </div>
        <button onClick={onClose} className="text-ink-6 hover:text-ink p-1" aria-label="Dismiss">
          <X size={15} />
        </button>
      </div>
      <p className="text-[13px] text-ink-3 leading-relaxed">{summary.overview}</p>

      {summary.positions.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          {summary.positions.map((p) => (
            <div key={p.symbol} className="flex items-start gap-3">
              <span className="text-[12px] font-semibold text-ink w-14 shrink-0 pt-0.5">{p.symbol}</span>
              <span className={`text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded border shrink-0 ${stanceColor[p.stance?.toLowerCase()] || stanceColor.hold}`}>
                {p.stance}
              </span>
              <span className="text-[12px] text-ink-5 leading-snug flex-1">
                {p.reason}
                {p.confidence && <span className="text-ink-6"> ({p.confidence} confidence)</span>}
              </span>
            </div>
          ))}
          {/* Legend — what each stance tag means */}
          <div className="mt-2 pt-3 border-t border-line flex flex-col gap-1.5">
            {stanceHelp.map((s) => (
              <div key={s.key} className="flex items-start gap-3">
                <span className={`text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded border shrink-0 w-[86px] text-center ${stanceColor[s.key]}`}>
                  {s.label}
                </span>
                <span className="text-[11px] text-ink-6 leading-snug flex-1 pt-0.5">{s.help}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {summary.watch.length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] text-ink-6 uppercase tracking-widest mb-1.5">Watch this week</div>
          <ul className="flex flex-col gap-1">
            {summary.watch.map((w, i) => (
              <li key={i} className="text-[12px] text-ink-5 flex gap-1.5">
                <span className="text-ink-6">•</span> {w}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Disclaimer text={summary.disclaimer} />
    </div>
  );
}

function IdeasCard({ ideas, held, onClose }: { ideas: StockIdeas; held: string[]; onClose: () => void }) {
  const fresh = ideas.ideas.filter((i) => !held.some((s) => s.toUpperCase() === i.symbol.toUpperCase()));
  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Lightbulb size={15} className="text-ink-3" />
          <h3 className="text-[14px] font-semibold text-ink">Ideas to research</h3>
        </div>
        <button onClick={onClose} className="text-ink-6 hover:text-ink p-1" aria-label="Dismiss">
          <X size={15} />
        </button>
      </div>
      <p className="text-[11px] text-ink-6 mb-3">
        Screened across sectors — megacaps to smaller, higher-torque "niche" names you don't hold — ranked on analyst upside, rating, 52-week position, earnings and momentum.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {fresh.map((i) => (
          <div key={i.symbol} className="rounded-lg border border-line bg-surface p-3 flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-ink">{i.symbol}</span>
              <span className="text-[12px] text-ink-6 truncate flex-1">{i.name}</span>
              {i.price != null && <span className="text-[12px] text-ink-4 shrink-0">{money(i.price, i.currency)}</span>}
            </div>

            {/* Fact chips */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {i.upsidePct != null && (
                <Chip color={i.upsidePct >= 0 ? 'emerald' : 'red'}>
                  {pct(i.upsidePct)} to target {i.targetConsensus != null ? money(i.targetConsensus, i.currency) : ''}
                </Chip>
              )}
              {i.rating && <Chip color={/buy/i.test(i.rating) ? 'emerald' : /sell/i.test(i.rating) ? 'red' : 'plain'}>{i.rating}</Chip>}
              {i.pos52 != null && (
                <Chip color={i.pos52 <= 0.35 ? 'emerald' : 'plain'}>{Math.round(i.pos52 * 100)}% of 52-wk range</Chip>
              )}
              {i.epsBeat != null && (
                <Chip color={i.epsBeat >= 0 ? 'emerald' : 'red'}>EPS {i.epsBeat >= 0 ? 'beat' : 'miss'}</Chip>
              )}
              {i.marketCap != null && i.marketCap > 0 && i.marketCap < 50e9 && (
                <Chip color="plain">small-cap</Chip>
              )}
              {i.theme && i.theme !== 'other' && <Chip color="plain">{i.theme}</Chip>}
            </div>

            {i.thesis && <p className="text-[12px] text-ink-4 mt-2 leading-snug">{i.thesis}</p>}

            {i.headline && (
              <a
                href={i.headlineUrl}
                target="_blank"
                rel="noreferrer"
                className="group mt-2 flex items-start gap-1.5 text-[11px] text-ink-6 hover:text-ink-3"
              >
                <ExternalLink size={11} className="mt-0.5 shrink-0" />
                <span className="leading-snug">{i.headline}</span>
              </a>
            )}
          </div>
        ))}
      </div>
      <Disclaimer text={ideas.disclaimer} />
    </div>
  );
}

function Chip({ children, color }: { children: ReactNode; color: 'emerald' | 'red' | 'plain' }) {
  const cls = {
    emerald: 'text-emerald-500 border-emerald-500/30 bg-emerald-500/10',
    red: 'text-red-500 border-red-500/30 bg-red-500/10',
    plain: 'text-ink-4 border-line bg-raised',
  }[color];
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${cls}`}>{children}</span>;
}

function Disclaimer({ text }: { text: string }) {
  if (!text) return null;
  return <p className="mt-3 pt-3 border-t border-line text-[11px] text-ink-6 leading-relaxed italic">{text}</p>;
}

function ErrorNote({ text }: { text: string }) {
  return <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-[12px] text-red-500">{text}</div>;
}

function Empty({ text }: { text: string }) {
  return <div className="text-center py-16 text-[13px] text-ink-5 max-w-md mx-auto">{text}</div>;
}
