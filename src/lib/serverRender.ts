// Hand a video export to the local server instead of rendering it in this tab.
//
// The tab-side export (lib/render.ts) is fine when you sit and watch it, but a
// backgrounded tab gets its timers throttled, so switching away mid-batch slows
// or stalls the render. A server render job (server/renderJobs.js) drives a
// headless Chrome on the same machine, which nothing throttles: submit, close
// the tab, collect the files from the folder afterwards.
//
// What this module does is the part only the browser can do — gather the
// material. The photos live in this browser (IndexedDB) and the decks are built
// here, so each unique photo and music track is uploaded to the job once, every
// slide's image reference is rewritten to that job's own asset URL, and the
// rewritten decks are handed over. Everything after that happens without us.
import type { Slideshow } from '../types';
import { resolveImageSrc } from './imageSrc';
import { videoMetaJson, slugify } from './render';
import { pickMusicTrack, type MusicGender, type MusicTrack } from './music';

export interface RenderJob {
  id: string;
  name: string;
  status: 'draft' | 'queued' | 'running' | 'done' | 'error' | 'cancelled';
  done: number;
  total: number;
  outDir: string;
  error: string | null;
  files: string[];
  createdAt: string;
  finishedAt: string | null;
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'content-type': 'application/json' },
    cache: 'no-store',
    ...init,
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body;
}

// Whether this deployment can render server-side at all — false on Vercel,
// where there is no browser to drive and no folder to write into.
export async function serverRenderStatus(): Promise<{ supported: boolean; ffmpeg: boolean }> {
  try {
    return await json<{ supported: boolean; ffmpeg: boolean }>('/render/status');
  } catch {
    return { supported: false, ffmpeg: false };
  }
}

// The folder a Queue-side server render writes into. Characters have one per
// character; everything else shares this single remembered path, since there is
// nothing else to hang it off.
const OUT_DIR_KEY = 'slidesmith:serverOutDir';

export function getDefaultOutDir(): string {
  try {
    return localStorage.getItem(OUT_DIR_KEY) || '';
  } catch {
    return '';
  }
}

export function setDefaultOutDir(dir: string): void {
  try {
    if (dir.trim()) localStorage.setItem(OUT_DIR_KEY, dir.trim());
    else localStorage.removeItem(OUT_DIR_KEY);
  } catch {
    /* storage unavailable — the path just won't stick */
  }
}

export const listRenderJobs = () => json<RenderJob[]>('/render/jobs');
export const cancelRenderJob = (id: string) =>
  json<RenderJob>(`/render/jobs/${id}/cancel`, { method: 'POST' });
export const deleteRenderJob = (id: string) =>
  json<{ ok: true }>(`/render/jobs/${id}`, { method: 'DELETE' });

// A file extension the render page's <img>/decodeAudioData will accept. The
// name only has to be unique and typed — the server serves it back with a
// content-type guessed from exactly this.
function extFor(blob: Blob, fallback: string): string {
  const t = blob.type;
  if (t.includes('png')) return 'png';
  if (t.includes('webp')) return 'webp';
  if (t.includes('gif')) return 'gif';
  if (t.includes('jpeg') || t.includes('jpg')) return 'jpg';
  if (t.includes('mpeg') || t.includes('mp3')) return 'mp3';
  if (t.includes('wav')) return 'wav';
  if (t.includes('mp4') || t.includes('m4a')) return 'm4a';
  return fallback;
}

// Uploads one blob to the job and returns the URL the render page will load it
// from. Relative on purpose: the page must fetch assets from its OWN origin or
// the canvas is tainted and the slide renderer's toDataURL() throws.
async function uploadAsset(
  job: { id: string; token: string },
  name: string,
  blob: Blob,
): Promise<string> {
  const res = await fetch(`/api/render/assets/${job.id}/${job.token}/${name}`, {
    method: 'PUT',
    headers: { 'content-type': blob.type || 'application/octet-stream' },
    body: blob,
  });
  if (!res.ok) throw new Error(`Could not upload ${name} to the render job.`);
  return `/api/render/assets/${job.id}/${job.token}/${name}`;
}

export interface ServerRenderOpts {
  name: string;
  // Absolute path on the machine running the server. Empty = the job's own
  // folder under ~/.slidesmith.
  outDir: string;
  music: MusicGender | null;
  zoom: boolean;
  regrade: 0 | 1 | 2;
  // Progress of the upload phase only — the render itself is polled from the
  // job list once this resolves.
  onUpload?: (done: number, total: number) => void;
}

// Ship a batch of decks off to the server. Resolves as soon as the job is
// queued — not when the videos are finished.
export async function submitServerRender(
  shows: Slideshow[],
  opts: ServerRenderOpts,
): Promise<RenderJob> {
  if (!shows.length) throw new Error('Nothing to render.');
  const job = await json<{ id: string; token: string }>('/render/jobs', {
    method: 'POST',
    body: JSON.stringify({ name: opts.name, outDir: opts.outDir }),
  });

  // Every distinct photo is uploaded once, however many decks or slides use it.
  const uploaded = new Map<string, string>();
  const refs = [...new Set(shows.flatMap((s) => s.slides.map((sl) => sl.imageUrl || '')))].filter(
    Boolean,
  );

  // Each deck draws its own random track, so pick them here (the pools live in
  // this browser) and upload each distinct one once.
  const tracks = new Map<string, MusicTrack | null>();
  for (const show of shows) {
    if (!opts.music) {
      tracks.set(show.id, null);
      continue;
    }
    tracks.set(
      show.id,
      await pickMusicTrack(opts.music, show.kind === 'characters' ? 'characters' : 'video'),
    );
  }
  const trackUrls = [
    ...new Set([...tracks.values()].map((t) => t?.url || '').filter(Boolean)),
  ];

  const total = refs.length + trackUrls.length;
  let done = 0;
  opts.onUpload?.(0, total);

  const put = async (ref: string, fallbackExt: string) => {
    const src = ref.startsWith('http') || ref.startsWith('/') || ref.startsWith('data:')
      ? ref
      : ((await resolveImageSrc(ref)) ?? '');
    if (!src) return;
    const blob = await fetch(src).then((r) => r.blob());
    const name = `a${uploaded.size}.${extFor(blob, fallbackExt)}`;
    uploaded.set(ref, await uploadAsset(job, name, blob));
    opts.onUpload?.(++done, total);
  };

  for (const ref of refs) await put(ref, 'jpg');
  for (const url of trackUrls) await put(url, 'mp3');

  const items = shows.map((show, i) => {
    const track = tracks.get(show.id) || null;
    return {
      show: {
        ...show,
        slides: show.slides.map((sl) => ({
          ...sl,
          imageUrl: sl.imageUrl ? uploaded.get(sl.imageUrl) || sl.imageUrl : sl.imageUrl,
        })),
      },
      music: track ? { ...track, url: uploaded.get(track.url) || track.url } : null,
      opts: { zoom: opts.zoom, regrade: opts.regrade },
      filename: `${slugify(show.hook || show.caption || show.id)}-${i + 1}`,
      meta: videoMetaJson(show),
    };
  });

  return json<RenderJob>(`/render/jobs/${job.id}/start`, {
    method: 'POST',
    body: JSON.stringify({ items, outDir: opts.outDir }),
  });
}
