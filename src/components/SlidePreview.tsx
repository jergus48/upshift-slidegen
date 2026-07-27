import { useEffect, useState } from 'react';
import type { Slide } from '../types';
import { captionTextStyle, SLIDE_CONTAINER_STYLE, SIDE_PAD_PCT, cleanCaption } from '../lib/captionStyle';
import { resolveImageSrc } from '../lib/imageSrc';

interface SlidePreviewProps {
  slide: Slide;
  className?: string;
  showText?: boolean;
}

export function SlidePreview({ slide, className = '', showText = true }: SlidePreviewProps) {
  // `slide.imageUrl` is a stable reference (a `local:…` id, a `/library/…`
  // path, or a `data:` URL) — resolve it to something the browser can load.
  // Local ids need an async IndexedDB lookup, so this can start as undefined.
  const [src, setSrc] = useState<string | undefined>(() =>
    slide.imageUrl && !slide.imageUrl.startsWith('local:') ? slide.imageUrl : undefined
  );
  useEffect(() => {
    let alive = true;
    resolveImageSrc(slide.imageUrl).then((s) => { if (alive) setSrc(s); });
    return () => { alive = false; };
  }, [slide.imageUrl]);

  // Generated slides (or ones whose image failed to resolve) have no source
  // image — render the same gradient the canvas renderer uses, so the preview
  // matches the exported PNG.
  const background = src
    ? undefined
    : `linear-gradient(135deg, ${slide.bgFrom || '#0f172a'}, ${slide.bgTo || '#1e293b'})`;

  return (
    <div
      // containerType: 'size' lets the caption's `cqh` units resolve to a percent
      // of THIS slide's height, so the text scales identically to the baked PNG.
      className={`relative aspect-[9/16] rounded-md overflow-hidden bg-raised ${className}`}
      style={background ? { background, ...SLIDE_CONTAINER_STYLE } : SLIDE_CONTAINER_STYLE}
    >
      {src && (
        <>
          <img
            src={src}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
          {/* Match the canvas bake's darkening (rgba(0,0,0,0.45)) for readability. */}
          <div className="absolute inset-0 bg-black/45" />
        </>
      )}
      {showText && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ paddingLeft: `${SIDE_PAD_PCT}%`, paddingRight: `${SIDE_PAD_PCT}%` }}
        >
          <span style={captionTextStyle(slide.captionStyle)}>{cleanCaption(slide.text)}</span>
        </div>
      )}
    </div>
  );
}
