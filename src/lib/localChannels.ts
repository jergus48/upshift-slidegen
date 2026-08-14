// The lists of accounts tracked in the Channels dashboard, kept per platform in
// this browser's localStorage (global, not per-project). Only the public
// YouTube data is fetched live; the other platforms just persist the links the
// user pastes, so there's nothing secret to keep server-side.

export type Platform = 'youtube' | 'instagram' | 'facebook' | 'threads' | 'x' | 'tiktok';

export const PLATFORMS: Platform[] = ['youtube', 'instagram', 'facebook', 'threads', 'x', 'tiktok'];

export const PLATFORM_LABELS: Record<Platform, string> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  facebook: 'Facebook',
  threads: 'Threads',
  x: 'X',
  tiktok: 'TikTok',
};

// One localStorage key per platform. The YouTube key keeps its original name so
// links saved before per-platform storage still load.
const KEY: Record<Platform, string> = {
  youtube: 'slidesmith:channels',
  instagram: 'slidesmith:channels:instagram',
  facebook: 'slidesmith:channels:facebook',
  threads: 'slidesmith:channels:threads',
  x: 'slidesmith:channels:x',
  tiktok: 'slidesmith:channels:tiktok',
};

export function loadChannels(platform: Platform): string[] {
  try {
    const raw = localStorage.getItem(KEY[platform]);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function saveChannels(platform: Platform, links: string[]): void {
  try {
    localStorage.setItem(KEY[platform], JSON.stringify(links));
  } catch {
    /* storage full / unavailable — non-fatal, the list just won't persist */
  }
}
