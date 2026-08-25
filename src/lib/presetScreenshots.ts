// Per-preset, per-gender app-slide screenshots. For an addiction preset you can
// upload the exact phone screenshot that should land on the app ("Upshift")
// slide, separately for men and women. When set, generation drops that image on
// the app slide for that preset+gender instead of a random POV shot.
//
// The image bytes reuse the local library's IndexedDB (so slides resolve them
// through the normal `local:` id path — see imageSrc.ts), stored under a
// dedicated pack that is auto-hidden from the background/pack pickers. The
// mapping preset+gender → local id lives in localStorage.
import { addLocalImages, removeLocalImage } from './localLibrary';
import { setPackHidden } from './hiddenPacks';
import type { Gender } from './quitPresets';

// Pack name the screenshots are stored under. Hidden from pickers so it never
// pollutes background selection; still visible in the Library view.
const PACK = 'App slide screenshots';
const KEY = 'slidesmith:preset-appshots';

type ShotMap = Record<string, string>; // `${presetKey}:${gender}` -> local id

// Defaults shipped with the build (public/app-shots/manifest.json). These make
// the screenshots show up for *every* user/browser (e.g. on Vercel) without
// anyone uploading anything; a per-browser upload still overrides them.
let defaults: ShotMap = {};
export async function loadAppShotDefaults(): Promise<void> {
  try {
    const res = await fetch('/app-shots/manifest.json');
    if (!res.ok) return;
    const json = (await res.json()) as { shots?: Record<string, string> };
    const shots = json.shots || {};
    defaults = Object.fromEntries(
      Object.entries(shots).map(([k, file]) => [k, file.startsWith('/') ? file : `/app-shots/${file}`])
    );
    notify();
  } catch {
    /* no bundled defaults — uploads still work */
  }
}

type Listener = () => void;
const listeners = new Set<Listener>();
const notify = () => listeners.forEach((l) => l());

export function subscribeAppShots(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function read(): ShotMap {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') as ShotMap;
  } catch {
    return {};
  }
}

function write(map: ShotMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* storage full/unavailable — the mapping just won't persist */
  }
  notify();
}

const mapKey = (presetKey: string, gender: Gender) => `${presetKey}:${gender}`;

// The stable `local:` ref to drop on the app slide for this preset+gender, or
// undefined if the user hasn't uploaded one.
export function getAppShotRef(presetKey: string, gender: Gender): string | undefined {
  const k = mapKey(presetKey, gender);
  return read()[k] ?? defaults[k];
}

// Whole map, for the picker to show which presets already have shots.
export function getAppShots(): ShotMap {
  return { ...defaults, ...read() };
}

// Save (or replace) the screenshot for one preset+gender. `dataUrl` is a base64
// data URL read from the picked file. Returns the new local id.
export async function setAppShot(presetKey: string, gender: Gender, dataUrl: string): Promise<string | undefined> {
  const [img] = await addLocalImages(PACK, [dataUrl], 'uploaded');
  setPackHidden(PACK, true);
  if (!img) return undefined;
  const map = read();
  const k = mapKey(presetKey, gender);
  const old = map[k];
  map[k] = img.id;
  write(map);
  if (old) removeLocalImage(old).catch(() => undefined); // drop the replaced blob
  return img.id;
}

// Remove the screenshot for one preset+gender (image bytes + mapping).
export async function clearAppShot(presetKey: string, gender: Gender): Promise<void> {
  const map = read();
  const k = mapKey(presetKey, gender);
  const id = map[k];
  if (!id) return;
  delete map[k];
  write(map);
  await removeLocalImage(id).catch(() => undefined);
}
