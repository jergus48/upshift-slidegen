// The user's stock holdings, entered by hand and kept in this browser's
// localStorage (global, not per-project). There's no broker connection — the
// user adds/edits/removes positions themselves, matching "add a new stock if I
// bought new". Nothing here is secret, so it never touches the server; the
// server only ever sees the tickers when fetching public market data.
import type { Holding } from '../types';

const KEY = 'slidesmith:portfolio';

export function loadHoldings(): Holding[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((h) => ({
        symbol: String(h.symbol || '').trim().toUpperCase(),
        name: String(h.name || ''),
        shares: Number(h.shares) || 0,
        avgPrice: Number(h.avgPrice) || 0,
        currency: h.currency ? String(h.currency) : undefined,
      }))
      .filter((h) => h.symbol);
  } catch {
    return [];
  }
}

export function saveHoldings(holdings: Holding[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(holdings));
  } catch {
    /* storage full / unavailable — non-fatal, the list just won't persist */
  }
}
