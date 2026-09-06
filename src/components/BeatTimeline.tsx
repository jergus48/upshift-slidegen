import { useCallback, useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';

// A CapCut-style beat timeline.
//
// Two things make it smooth, and both matter: the grid is drawn on a CANVAS
// rather than as one DOM node per beat (a 3-minute track holds hundreds, and
// laying those out was what made the first version crawl), and the playhead is
// moved by a requestAnimationFrame loop that writes a transform straight to one
// element — it never goes through React state, so playback triggers no renders
// at all. React only redraws when the beats, the view window, or the size
// actually change.
//
// The view window is the other half of the design: when a range is selected the
// editor can hand this a `viewStart`/`viewEnd` and the whole width maps to just
// that slice, which is what makes beats in a 5-second section pickable without
// zooming into a 3-minute track.

interface Props {
  duration: number;
  beats: number[];
  from: number;
  to: number;
  point?: number;
  // The slice of the track the timeline draws. Defaults to the whole thing.
  viewStart?: number;
  viewEnd?: number;
  // Read the current playback position. A function, not a value, so the
  // playhead can animate without this component re-rendering.
  getTime: () => number;
  onSeek: (seconds: number) => void;
  onPickBeat: (seconds: number) => void;
  onAddBeat: (seconds: number) => void;
  onRemoveBeat: (seconds: number) => void;
}

function fmt(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Sub-second labels for short windows, so a 4-second selection doesn't show
// four identical-looking marks.
function fmtFine(sec: number): string {
  return sec < 10 ? `${sec.toFixed(1)}s` : fmt(sec);
}

const STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];

function labelStep(span: number, widthPx: number): number {
  const perSec = widthPx / Math.max(0.001, span);
  return STEPS.find((s) => s * perSec >= 64) ?? STEPS[STEPS.length - 1];
}

const RULER_H = 18;
const TRACK_H = 52;

export function BeatTimeline({
  duration,
  beats,
  from,
  to,
  point,
  viewStart = 0,
  viewEnd,
  getTime,
  onSeek,
  onPickBeat,
  onAddBeat,
  onRemoveBeat,
}: Props) {
  const [zoom, setZoom] = useState(1);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const headRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(700);

  const vStart = viewStart;
  const vEnd = viewEnd ?? duration;
  const span = Math.max(0.001, vEnd - vStart);

  // Track the drawn width so both the canvas and the ruler work in real pixels.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(200, el.clientWidth * zoom));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [zoom]);

  const xOf = useCallback((t: number) => ((t - vStart) / span) * width, [vStart, span, width]);
  const tOf = useCallback((x: number) => vStart + (x / width) * span, [vStart, span, width]);

  // ── Draw the grid ──────────────────────────────────────────────────────────
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const h = RULER_H + TRACK_H;
    cv.width = width * dpr;
    cv.height = h * dpr;
    cv.style.width = `${width}px`;
    cv.style.height = `${h}px`;
    const g = cv.getContext('2d');
    if (!g) return;
    g.scale(dpr, dpr);
    g.clearRect(0, 0, width, h);

    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue('--ink').trim() || '#111';
    const ink5 = css.getPropertyValue('--ink-5').trim() || '#888';
    const line = css.getPropertyValue('--line').trim() || '#ddd';
    const bg = css.getPropertyValue('--bg').trim() || '#fff';

    // Ruler
    g.strokeStyle = line;
    g.beginPath();
    g.moveTo(0, RULER_H + 0.5);
    g.lineTo(width, RULER_H + 0.5);
    g.stroke();

    const step = labelStep(span, width);
    g.fillStyle = ink5;
    g.font = '9px ui-sans-serif, system-ui, sans-serif';
    const first = Math.ceil(vStart / step) * step;
    for (let t = first; t <= vEnd; t += step) {
      const x = Math.round(xOf(t)) + 0.5;
      g.strokeStyle = line;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, 6);
      g.stroke();
      g.fillText(span < 20 ? fmtFine(t) : fmt(t), x + 3, 11);
    }

    // Everything outside the selected beat range is dimmed, so the slice that
    // will actually become video is the bright part.
    if (beats.length) {
      g.fillStyle = bg;
      g.globalAlpha = 0.62;
      const a = beats[from] ?? beats[0];
      const b = beats[Math.min(to, beats.length - 1)] ?? beats[beats.length - 1];
      if (a > vStart) g.fillRect(0, RULER_H, xOf(a), TRACK_H);
      if (b < vEnd) g.fillRect(xOf(b), RULER_H, width - xOf(b), TRACK_H);
      g.globalAlpha = 1;
    }

    // Beats. Every 4th is a downbeat: taller, stronger, and numbered by bar when
    // there's room, which is what makes the pulse readable instead of a smear.
    const spacingPx = beats.length > 1 ? width / beats.length : width;
    const showNumbers = spacingPx > 26;
    for (let i = 0; i < beats.length; i++) {
      const t = beats[i];
      if (t < vStart - 1 || t > vEnd + 1) continue; // off-screen, skip the work
      const x = Math.round(xOf(t)) + 0.5;
      const bar = i % 4 === 0;
      const inRange = i >= from && i < to;
      g.strokeStyle = inRange ? (bar ? ink : ink5) : line;
      g.lineWidth = bar ? 1.5 : 1;
      g.beginPath();
      g.moveTo(x, RULER_H + (bar ? 8 : TRACK_H - 16));
      g.lineTo(x, RULER_H + TRACK_H);
      g.stroke();
      if (bar && showNumbers) {
        g.fillStyle = ink5;
        g.fillText(String(Math.floor(i / 4) + 1), x + 3, RULER_H + 16);
      }
    }
    g.lineWidth = 1;

    // The pinned start/drop
    if (point != null && point >= vStart && point <= vEnd) {
      const x = Math.round(xOf(point)) + 0.5;
      g.strokeStyle = '#10b981';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, RULER_H);
      g.lineTo(x, RULER_H + TRACK_H);
      g.stroke();
      g.fillStyle = '#10b981';
      g.beginPath();
      g.arc(x, RULER_H + 4, 3.5, 0, Math.PI * 2);
      g.fill();
    }
  }, [beats, from, to, point, width, span, vStart, vEnd, xOf]);

  // ── Animate the playhead, outside React ────────────────────────────────────
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = headRef.current;
      if (el) {
        const x = xOf(getTime());
        el.style.transform = `translateX(${x}px)`;
        el.style.opacity = x < -2 || x > width + 2 ? '0' : '1';
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [xOf, getTime, width]);

  if (!duration) return null;

  // A click picks the beat under the cursor when there is one, else it seeks.
  // Shift adds a beat, Alt (or right-click) removes the nearest one.
  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const t = Math.max(vStart, Math.min(vEnd, tOf(x)));
    if (e.shiftKey) {
      onAddBeat(t);
      return;
    }
    if (e.altKey) {
      onRemoveBeat(t);
      return;
    }
    const tolSec = (8 / width) * span; // 8px of slop
    let hit: number | undefined;
    let best = tolSec;
    for (const b of beats) {
      const d = Math.abs(b - t);
      if (d <= best) {
        best = d;
        hit = b;
      }
    }
    if (hit != null) onPickBeat(hit);
    else onSeek(t);
  };

  return (
    <div className="rounded-lg border border-line bg-raised/40 overflow-hidden">
      <div ref={scrollRef} className="overflow-x-auto">
        <div
          className="relative cursor-pointer select-none"
          style={{ width, height: RULER_H + TRACK_H }}
          onClick={onClick}
          onContextMenu={(e) => {
            e.preventDefault();
            const rect = e.currentTarget.getBoundingClientRect();
            onRemoveBeat(tOf(e.clientX - rect.left));
          }}
        >
          <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />
          <div
            ref={headRef}
            className="absolute top-0 left-0 w-[2px] bg-ink pointer-events-none will-change-transform"
            style={{ height: RULER_H + TRACK_H }}
          >
            <div className="absolute -top-px -left-[3px] w-2 h-2 rotate-45 bg-ink" />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 px-2 py-1 border-t border-line/70">
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(1, z / 2))}
          disabled={zoom <= 1}
          className="w-6 h-6 rounded flex items-center justify-center text-ink-5 hover:bg-raised hover:text-ink-2 disabled:opacity-40 transition-colors"
          aria-label="Zoom out"
        >
          <ZoomOut size={12} />
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(32, z * 2))}
          disabled={zoom >= 32}
          className="w-6 h-6 rounded flex items-center justify-center text-ink-5 hover:bg-raised hover:text-ink-2 disabled:opacity-40 transition-colors"
          aria-label="Zoom in"
        >
          <ZoomIn size={12} />
        </button>
        <span className="text-[10px] text-ink-5 tabular-nums">{zoom}×</span>
        <span className="ml-auto text-[10px] text-ink-5">
          click a beat to pin · shift-click to add · alt-click to remove
        </span>
      </div>
    </div>
  );
}
