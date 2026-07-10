// The Reddit posts a user is working on (originals + their generated rewrites)
// live in the browser, like everything else. Per-browser, survives reloads.
export interface RedditPost {
  id: string;
  title: string;
  body: string;
  images: string[]; // image URLs pulled from a link import (if any)
  rewrite: { title: string; body: string } | null;
}

const KEY = 'slidesmith:reddit';

export function loadRedditPosts(): RedditPost[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RedditPost[]) : [];
  } catch {
    return [];
  }
}

export function saveRedditPosts(posts: RedditPost[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(posts));
  } catch {
    // storage full/unavailable — nothing more we can do client-side
  }
}

export function newRedditPost(partial?: Partial<RedditPost>): RedditPost {
  return {
    id: `r-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    title: '',
    body: '',
    images: [],
    rewrite: null,
    ...partial,
  };
}
