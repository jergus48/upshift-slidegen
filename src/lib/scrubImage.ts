// "Scrub" an image so it reads as a brand-new file: strips ALL metadata (via a
// canvas re-encode) AND makes tiny, near-invisible pixel changes so its
// perceptual hash differs from the original — which is what sites like Reddit
// use to catch reposts/duplicates. The changes are deliberately small:
//   - a small random crop off each edge (changes framing + dimensions)
//   - a slight resize (dimensions no longer match the original)
//   - faint per-pixel noise + a tiny brightness nudge (perceptual hash shifts)
//   - JPEG re-compression (fresh bytes, no source metadata)
//
// Honest caveat: this defeats most perceptual-hash matching, but nothing is
// 100%. Stronger changes are more robust but more visible — this is tuned to
// stay almost invisible. Pixel watermarks (e.g. SynthID) may still survive.

interface ScrubOptions {
  // 0 = none, 1 = default (subtle), 2 = stronger (still near-invisible).
  strength?: 1 | 2;
}

export async function scrubImage(src: string, { strength = 1 }: ScrubOptions = {}): Promise<string> {
  const img = await loadImage(src);
  const w0 = img.naturalWidth || img.width;
  const h0 = img.naturalHeight || img.height;

  const k = strength === 2 ? 1.8 : 1;
  const rand = (min: number, max: number) => min + Math.random() * (max - min);

  // 1. Random crop off each edge (2–5% base, a bit more on "stronger").
  const cropFrac = rand(0.02, 0.05) * k;
  const cx = Math.round(w0 * cropFrac);
  const cy = Math.round(h0 * cropFrac);
  const sw = Math.max(1, w0 - cx * 2);
  const sh = Math.max(1, h0 - cy * 2);

  // 2. Slight resize so output dimensions differ from the original.
  const scale = rand(0.97, 0.995);
  const dw = Math.max(1, Math.round(sw * scale));
  const dh = Math.max(1, Math.round(sh * scale));

  const canvas = document.createElement('canvas');
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, cx, cy, sw, sh, 0, 0, dw, dh);

  // 3. Faint noise + tiny brightness shift across the pixels.
  const noiseAmp = 2 * k; // ± levels out of 255
  const bright = 1 + rand(-0.02, 0.02) * k;
  try {
    const image = ctx.getImageData(0, 0, dw, dh);
    const d = image.data;
    for (let i = 0; i < d.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const v = d[i + c] * bright + (Math.random() * 2 - 1) * noiseAmp;
        d[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
    ctx.putImageData(image, 0, 0);
  } catch {
    // getImageData can throw if the canvas is tainted (remote image without
    // CORS) — in that case we still return the metadata-free re-encode below.
  }

  // 4. Re-compress as JPEG — new bytes, no source metadata.
  return canvas.toDataURL('image/jpeg', 0.92);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image.'));
    img.src = src;
  });
}
