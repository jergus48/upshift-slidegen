// Re-encode an image through a canvas so the downloaded file carries NO
// metadata — EXIF, GPS, XMP, and embedded provenance chunks (C2PA / "Content
// Credentials", the kind Gemini/Imagen add) are all dropped, because the
// canvas is redrawn from raw pixels into a brand-new file.
//
// Note: this removes metadata only. Pixel-level watermarks (e.g. Google's
// SynthID) live in the pixels themselves and are NOT guaranteed to be removed
// by a re-encode — though scaling/compositing degrade them. See the download
// note in the UI.
export async function stripImageMetadata(src: string, type: 'image/png' | 'image/jpeg' = 'image/jpeg'): Promise<string> {
  const img = await loadImage(src);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  // JPEG at high quality keeps the file small; PNG stays lossless if asked.
  return canvas.toDataURL(type, type === 'image/jpeg' ? 0.95 : undefined);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // needed so the canvas isn't tainted for remote images
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image for cleaning.'));
    img.src = src;
  });
}

// Trigger a browser download of a data URL.
export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
