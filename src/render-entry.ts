// The render worker page (render.html).
//
// A background render job (server/renderJobs.js) opens this page in a headless
// Chrome on the user's machine and calls window.slidesmithRender() once per
// deck. It deliberately imports the SAME lib/render.ts pipeline the in-tab
// export uses — the whole point is that a job renders byte-for-byte what the
// user would have got from the Queue, not a second implementation that drifts.
//
// The page is a pure function of its input: everything it needs (slides with
// image URLs already rewritten to the job's own asset routes, the chosen music
// track) arrives in the payload. It reads no localStorage and no IndexedDB —
// there is none in a fresh headless profile.
import './index.css'; // the caption fonts (Inter, Poppins) the slide renderer bakes with
import { renderSlideshowVideo, videoMetaJson } from './lib/render';
import type { MusicTrack } from './lib/music';
import type { Slideshow } from './types';

interface RenderPayload {
  show: Slideshow;
  music: MusicTrack | null;
  opts: { zoom?: boolean; regrade?: 0 | 1 | 2 };
}

interface RenderResult {
  base64: string;
  mime: string;
  meta: string;
}

declare global {
  interface Window {
    slidesmithRender: (payload: RenderPayload) => Promise<RenderResult>;
  }
}

// Chrome caps a single JS string well above this, but base64-ing a whole video
// in one go still spikes memory; chunk the conversion instead.
function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

const status = (msg: string) => {
  const el = document.getElementById('status');
  if (el) el.textContent = msg;
};

window.slidesmithRender = async ({ show, music, opts }: RenderPayload): Promise<RenderResult> => {
  status(`Rendering ${show.hook || show.id}…`);
  // The regrade is the server's job (it owns ffmpeg and would otherwise get the
  // video shipped back and forth twice), so only the zoom reaches the renderer.
  const blob = await renderSlideshowVideo(show, music, { zoom: opts?.zoom !== false });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  status(`Done: ${show.hook || show.id}`);
  return { base64: toBase64(bytes), mime: blob.type, meta: videoMetaJson(show) };
};

status('Render worker ready.');
