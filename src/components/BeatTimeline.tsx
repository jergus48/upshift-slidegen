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
  // Drag a marker from one second to another. Where the accuracy actually comes
  // from now: detection puts a marker roughly right, the ear puts it exactly
  // right, and dragging is how the ear gets its say.
  onMoveBeat: (from: number, to: number) => void;
  // Clear every marker in a dragged-out span. Shift-drag on the timeline.
  onClearSpan: (from: number, to: number) => void;
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

// Fixed colours rather than theme tokens: these have to mean the same thing in
// light and dark, and the palette's greys are what made the selection hard to
// see in the first place.
const ACCENT = '#2563eb';        // the slice that becomes video
const ACCENT_FILL = 'rgba(37,99,235,0.13)';
const DRAG = '#10b981';          // a marker under the pointer, and the pinned point

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
  onMoveBeat,
  onClearSpan,
}: Props) {
  const [zoom, setZoom] = useState(1);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const headRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(700);
  // The marker currently under the pointer, while it is being dragged: where it
  // started (its identity, since beats are addressed by time) and where it sits
  // right now. Non-null only during a drag.
  const [drag, setDrag] = useState<{ orig: number; time: number } | null>(null);
  // A shift-drag in progress: the stretch whose markers clear on release.
  const [sweep, setSweep] = useState<{ from: number; to: number } | null>(null);
  // Whether the pointer actually moved during this press. A drag ends in a
  // mouseup that the browser also reports as a click, and without this every
  // drag would finish by pinning the start point too.
  const movedRef = useRef(false);

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

    // ── What will actually become video ──────────────────────────────────────
    // The selected slice is painted in the accent colour and everything outside
    // it is washed out. It used to be a 62% white wash on the outside and
    // nothing at all on the inside, which on a pale theme was almost invisible —
    // two nearly identical greys, and no way to tell at a glance which half was
    // the one being exported.
    if (beats.length) {
      const a = beats[from] ?? beats[0];
      const b = beats[Math.min(to, beats.length - 1)] ?? beats[beats.length - 1];
      const ax = xOf(a);
      const bx = xOf(b);

      // Inside: a tinted band, plus a solid accent rule along the top so the
      // extent reads even where the tint is subtle on a dark theme.
      g.fillStyle = ACCENT_FILL;
      g.fillRect(ax, RULER_H, Math.max(0, bx - ax), TRACK_H);
      g.fillStyle = ACCENT;
      g.fillRect(ax, RULER_H, Math.max(0, bx - ax), 3);

      // Outside: heavier wash than before, so the contrast is unmistakable.
      g.fillStyle = bg;
      g.globalAlpha = 0.78;
      if (a > vStart) g.fillRect(0, RULER_H, ax, TRACK_H);
      if (b < vEnd) g.fillRect(bx, RULER_H, width - bx, TRACK_H);
      g.globalAlpha = 1;

      // The two edges, with a grab handle each — this is where "From here" and
      // "To here" put the range, and the handles say it can be moved.
      for (const [x, dir] of [[ax, 1], [bx, -1]] as const) {
        if (x < -4 || x > width + 4) continue;
        g.strokeStyle = ACCENT;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(Math.round(x) + 0.5, RULER_H);
        g.lineTo(Math.round(x) + 0.5, RULER_H + TRACK_H);
        g.stroke();
        g.fillStyle = ACCENT;
        g.beginPath();
        g.moveTo(x, RULER_H + 3);
        g.lineTo(x + dir * 7, RULER_H + 3);
        g.lineTo(x, RULER_H + 12);
        g.closePath();
        g.fill();
      }
      g.lineWidth = 1;

      // How much is selected, written on the band itself when it fits.
      const used = Math.max(0, Math.min(to, beats.length) - from);
      const label = `${used} beats · ${fmtFine(Math.max(0, b - a))}`;
      g.font = '10px ui-sans-serif, system-ui, sans-serif';
      if (bx - ax > g.measureText(label).width + 16) {
        g.fillStyle = ACCENT;
        g.fillText(label, ax + 8, RULER_H + TRACK_H - 6);
      }
    }

    // The span being shift-dragged, painted as what it will remove.
    if (sweep) {
      const a = xOf(Math.min(sweep.from, sweep.to));
      const b = xOf(Math.max(sweep.from, sweep.to));
      g.fillStyle = 'rgba(220,38,38,0.18)';
      g.fillRect(a, RULER_H, Math.max(1, b - a), TRACK_H);
      g.strokeStyle = '#dc2626';
      g.lineWidth = 1.5;
      g.strokeRect(a + 0.5, RULER_H + 0.5, Math.max(1, b - a) - 1, TRACK_H - 1);
      g.lineWidth = 1;
    }

    // Beats. All drawn the same: one line per detected marker, full height.
    // They used to be striped — every 4th taller and numbered as a bar — but
    // that counted positions in the array, not musical time, so once the
    // detector began adding off-grid hits (rolls, syncopated bass) the "bars"
    // drifted away from the real downbeats and the numbers said nothing true.
    // A marker means one thing now: a beat was detected here.
    for (let i = 0; i < beats.length; i++) {
      // A marker being dragged is drawn where the pointer is, not where it is
      // saved — the commit only happens on mouseup.
      const t = drag && beats[i] === drag.orig ? drag.time : beats[i];
      if (t < vStart - 1 || t > vEnd + 1) continue; // off-screen, skip the work
      const x = Math.round(xOf(t)) + 0.5;
      const dragging = drag != null && beats[i] === drag.orig;
      // Three states, three colours: the one being dragged, the ones that will
      // be cut on, and the ones outside the selection that won't.
      const inRange = i >= from && i < to;
      g.strokeStyle = dragging ? DRAG : inRange ? ink : line;
      g.lineWidth = inRange ? 1.5 : 1;
      g.beginPath();
      g.moveTo(x, RULER_H + 8);
      g.lineTo(x, RULER_H + TRACK_H);
      g.stroke();
    }
    g.lineWidth = 1;

    // The pinned start/drop
    if (point != null && point >= vStart && point <= vEnd) {
      const x = Math.round(xOf(point)) + 0.5;
      g.strokeStyle = DRAG;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, RULER_H);
      g.lineTo(x, RULER_H + TRACK_H);
      g.stroke();
      g.fillStyle = DRAG;
      g.beginPath();
      g.arc(x, RULER_H + 4, 3.5, 0, Math.PI * 2);
      g.fill();
    }
  }, [beats, from, to, point, width, span, vStart, vEnd, xOf, drag, sweep]);

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

  // The marker within 8px of a time, if there is one — the same slop for
  // clicking and for grabbing, so anything you can pin you can also drag.
  const beatNear = (t: number): number | undefined => {
    let hit: number | undefined;
    let best = (8 / width) * span;
    for (const b of beats) {
      const d = Math.abs(b - t);
      if (d <= best) {
        best = d;
        hit = b;
      }
    }
    return hit;
  };

  // Press on a marker to drag it. The move is tracked on `window`, not on the
  // canvas, so the pointer can leave the timeline mid-drag without the marker
  // being stranded — and it commits once, on release.
  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Shift-drag clears a span — the bulk edit a detected grid always needs.
    if (e.button === 0 && e.shiftKey) {
      const rect = e.currentTarget.getBoundingClientRect();
      const start = Math.max(vStart, Math.min(vEnd, tOf(e.clientX - rect.left)));
      movedRef.current = false;
      setSweep({ from: start, to: start });
      const move = (ev: MouseEvent) => {
        movedRef.current = true;
        setSweep({ from: start, to: Math.max(vStart, Math.min(vEnd, tOf(ev.clientX - rect.left))) });
      };
      const up = (ev: MouseEvent) => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        setSweep(null);
        const end = Math.max(vStart, Math.min(vEnd, tOf(ev.clientX - rect.left)));
        // A shift-CLICK (no drag) still means "add a beat here", as before.
        if (Math.abs(end - start) < 0.02) onAddBeat(start);
        else onClearSpan(start, end);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
      return;
    }
    if (e.button !== 0 || e.altKey) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const hit = beatNear(tOf(e.clientX - rect.left));
    if (hit == null) return;
    movedRef.current = false;
    setDrag({ orig: hit, time: hit });

    const move = (ev: MouseEvent) => {
      const t = Math.max(vStart, Math.min(vEnd, tOf(ev.clientX - rect.left)));
      if (Math.abs(ev.clientX - e.clientX) > 2) movedRef.current = true;
      setDrag({ orig: hit, time: t });
    };
    const up = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      setDrag(null);
      if (!movedRef.current) return; // a plain click — let onClick handle it
      const t = Math.max(vStart, Math.min(vEnd, tOf(ev.clientX - rect.left)));
      onMoveBeat(hit, Math.round(t * 1000) / 1000);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

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
    if (movedRef.current) {
      movedRef.current = false; // the tail of a drag, not a click
      return;
    }
    const hit = beatNear(t);
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
          onMouseDown={onMouseDown}
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
          <span className="inline-flex items-center gap-1 mr-2">
            <span className="inline-block w-2 h-2 rounded-sm" style={{ background: ACCENT }} />
            used in the video
          </span>
          drag a beat to move it · click to pin · shift-click to add · shift-drag to clear a stretch · alt-click to remove
        </span>
      </div>
    </div>
  );
}
