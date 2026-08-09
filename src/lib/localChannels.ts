// The list of YouTube channel links tracked in the Channels dashboard. Kept in
// this browser's localStorage (global, not per-project) — the dashboard reads
// only public YouTube data, so there's nothing secret to keep server-side.
const KEY = 'slidesmith:channels';

export function loadChannels(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function saveChannels(links: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(links));
  } catch {
    /* storage full / unavailable — non-fatal, the list just won't persist */
  }
}
