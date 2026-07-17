// Frontend API client. All calls go to the local Slidesmith server (proxied at
// /api in dev, same-origin in production). The server holds the keys and talks
// to Claude + post-bridge — the browser never sees the secrets in a request.
import type {
  KeyStatus,
  KeysPatch,
  BrainState,
  Slideshow,
  SocialAccount,
  ScheduledPost,
  PostResult,
  ModelOption,
  LibraryImage,
  LibraryPack,
} from '../types';

// Thrown for 401s specifically, so App.tsx can tell "wrong/missing password"
// apart from "server unreachable" and show the login gate instead of an error.
export class AuthError extends Error {}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'content-type': 'application/json' },
    cache: 'no-store', // always hit the server — never a stale Schedule/Results list
    ...init,
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) throw new AuthError((body as { error?: string }).error || 'Password required.');
  if (!res.ok) throw new Error((body as { error?: string }).error || res.statusText);
  return body as T;
}

// ── Shared-password gate (no-op deployments never need these) ────────────────
export const getAuthStatus = () => req<{ required: boolean; authed: boolean }>('/auth');
export const login = (password: string) =>
  req<{ ok: true }>('/login', { method: 'POST', body: JSON.stringify({ password }) });
export const logout = () => req<{ ok: true }>('/logout', { method: 'POST' });

// Only API-key status lives server-side now — projects, Brain, model and the
// Pinterest actor are all in the browser (lib/localWorkspace.ts).
export const getKeyStatus = () => req<{ keys: KeyStatus }>('/config').then((r) => r.keys);

// `keys` only carries fields the user actually typed a new value for — blank
// fields are omitted client-side so they never overwrite an already-saved key.
export const saveKeys = (keys: KeysPatch) =>
  req<{ keys: KeyStatus }>('/config', { method: 'PUT', body: JSON.stringify({ keys }) }).then((r) => r.keys);

export const testKeys = () =>
  req<{ postbridge: boolean; openrouter: boolean; apify: boolean; errors: Record<string, string> }>(
    '/config/test',
    { method: 'POST' }
  );

export const getModels = () => req<ModelOption[]>('/models');

// The queue (generated + manually-created slideshows) lives in the browser
// now — see lib/localQueue.ts — there's no server endpoint for it anymore.

// The Brain, model, and per-batch audience/style-memory overrides all come
// from the client (localWorkspace). Returns bare slideshows (text + gradient
// only) — background assignment happens client-side, since the server no
// longer knows about scraped/uploaded images; see lib/backgrounds.ts.
export const generate = (opts: { count: number; slidesPerShow: number; length: 'short' | 'long'; model: string; brain: BrainState }) =>
  req<Slideshow[]>('/generate', { method: 'POST', body: JSON.stringify(opts) });

// ── Image library ─────────────────────────────────────────────────────────────
// Bundled aesthetic packs only. Scraped/uploaded images live in the browser's
// IndexedDB — see lib/localLibrary.ts.
export const getLibrary = () => req<LibraryImage[]>('/library');

export const getPacks = () => req<LibraryPack[]>('/library/packs');

// Scrapes via the server (needs the Apify key + avoids CORS) and returns the
// downloaded images as data URLs for the caller to save locally. `actor` is a
// client-side setting (localWorkspace).
export const scrapePinterest = (searches: string[], count: number, actor: string) =>
  req<{ pack: string; found: number; images: string[] }>('/library/scrape', {
    method: 'POST',
    body: JSON.stringify({ searches, count, actor }),
  });

// ── Reddit tools (standalone — unrelated to slideshows) ─────────────────────
export const redditFetch = (url: string) =>
  req<{ title: string; body: string; images: string[] }>('/reddit/fetch', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });

export const redditRewrite = (title: string, body: string, model: string) =>
  req<{ title: string; body: string }>('/reddit/rewrite', {
    method: 'POST',
    body: JSON.stringify({ title, body, model }),
  });

// `image` is a data URL of a screenshot (optional). Returns 3 short comments.
export const generateComments = (opts: { text?: string; image?: string; model: string }) =>
  req<{ comments: string[] }>('/comment', { method: 'POST', body: JSON.stringify(opts) });

// Human-sounding self-improvement / productivity posts (3 variants, each with
// a title + body). `topic` optional; `length` controls how long the body is.
export const generatePosts = (opts: { topic?: string; length?: 'short' | 'medium' | 'long'; model: string }) =>
  req<{ posts: { title: string; body: string }[] }>('/post/generate', {
    method: 'POST',
    body: JSON.stringify(opts),
  });

// Structured JSON image-prompts (Google Flow) with an anchored character.
export const generateFlowPrompts = (opts: {
  gender: 'man' | 'woman';
  environment: string;
  activity: string;
  aspectRatio: string;
  count: number;
  model: string;
}) =>
  req<{ prompts: Record<string, unknown>[] }>('/flow/generate', {
    method: 'POST',
    body: JSON.stringify(opts),
  });

export const getAccounts = () => req<SocialAccount[]>('/accounts');

export interface SchedulePayload {
  id: string;
  caption: string;
  slides: string[]; // PNG data URLs
  socialAccounts: number[];
  scheduledAt: string | null;
  mode: 'draft' | 'schedule';
}

export const schedule = (payload: SchedulePayload) =>
  req<unknown>('/schedule', { method: 'POST', body: JSON.stringify(payload) });

// post-bridge → ScheduledPost. post-bridge stores caption + media + schedule;
// it has no concept of our per-slide text, so the Schedule view shows the
// rendered images + caption + status.
export async function getScheduledPosts(): Promise<ScheduledPost[]> {
  const raw = await req<Array<Record<string, unknown>>>('/posts');
  return raw.map((p) => ({
    id: String(p.id),
    caption: String(p.caption || ''),
    status: String(p.status || (p.is_draft ? 'draft' : 'scheduled')),
    scheduledAt: (p.scheduled_at as string) || null,
    // The server resolves post-bridge's nested media (media.object.url) into a
    // flat string[] under `media_urls` — fall back to raw media for safety.
    mediaUrls: Array.isArray(p.media_urls)
      ? (p.media_urls as unknown[]).map(String).filter(Boolean)
      : Array.isArray(p.media)
      ? (p.media as Array<{ url?: string; object?: { url?: string } } | string>)
          .map((m) => (typeof m === 'string' ? m : m.object?.url || m.url || ''))
          .filter(Boolean)
      : [],
    socialAccounts: (p.social_accounts as number[]) || [],
    isDraft: !!p.is_draft,
  }));
}

function mapResult(a: Record<string, unknown>): PostResult {
  return {
    id: String(a.id),
    platform: String(a.platform || ''),
    views: Number(a.view_count || 0),
    likes: Number(a.like_count || 0),
    comments: Number(a.comment_count || 0),
    shares: Number(a.share_count || 0),
    coverImageUrl: (a.cover_image_url as string) || null,
    shareUrl: (a.share_url as string) || null,
    description: (a.video_description as string) || null,
    lastSyncedAt: (a.last_synced_at as string) || null,
  };
}

export async function getResults(): Promise<PostResult[]> {
  const raw = await req<Array<Record<string, unknown>>>('/results');
  return raw.map(mapResult);
}

// Trigger a post-bridge analytics sync, then return the refreshed results.
export async function syncResults(): Promise<PostResult[]> {
  const raw = await req<Array<Record<string, unknown>>>('/results/sync', { method: 'POST' });
  return raw.map(mapResult);
}
