import { useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';

// A CapCut-style beat timeline: a time ruler with real timestamps, a beat grid
// where every 4th beat (the downbeat, i.e. the start of a bar) is tall and
// numbered while the beats between it stay hair-thin, a draggable playhead, and
// dimming outside the selected range.
//
// The zoom is the point of it. A 3-minute track at 120 BPM has ~360 beats; drawn
// across one screen width they're under 2px apart and merge into a grey smear,
// which is useless for picking a beat. Zooming widens the track and scrolls, so
// individual beats become separate, clickable objects.

interface Props {
  duration: number;
  time: number;
  beats: number[];
  from: number;
  to: number;
  // The pinned start/drop second, drawn as the marker to aim for.
  point?: number;
  onSeek: (seconds: number) => void;
  onPickBeat: (seconds: number) => void;
}

function fmt(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Ruler steps that read naturally as time. Picked so labels stay ~60px apart at
// the current zoom rather than colliding into each other.
const STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300];

function labelStep(duration: number, widthPx: number): number {
  const target = 64; // min px between labels
  const perSec = widthPx / Math.max(1, duration);
  return STEPS.find((s) => s * perSec >= target) ?? STEPS[STEPS.length - 1];
}

export function BeatTimeline({ duration, time, beats, from, to, point, onSeek, onPickBeat }: Props) {
  const [zoom, setZoom] = useState(1);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [innerWidth, setInnerWidth] = useState(700);

  // Measure the drawn width so the ruler can space its labels in real pixels
  // instead of guessing from the zoom factor.
  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setInnerWidth(el.clientWidth || 700));
    ro.observe(el);
    setInnerWidth(el.clientWidth || 700);
    return () => ro.disconnect();
  }, []);

  // Keep the playhead on screen while zoomed in, the way a video editor does.
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc || zoom === 1 || !duration) return;
    const x = (time / duration) * innerWidth;
    const pad = 80;
    if (x < sc.scrollLeft + pad || x > sc.scrollLeft + sc.clientWidth - pad) {
      sc.scrollTo({ left: Math.max(0, x - sc.clientWidth / 2), behavior: 'smooth' });
    }
  }, [time, duration, innerWidth, zoom]);

  if (!duration) return null;

  const pct = (t: number) => `${(t / duration) * 100}%`;
  const step = labelStep(duration, innerWidth);
  const ticks: number[] = [];
  for (let t = 0; t <= duration; t += step) ticks.push(t);

  // Seek from a click anywhere on the track background.
  const seekFromEvent = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    onSeek(Math.max(0, Math.min(duration, ratio * duration)));
  };

  return (
    <div className="rounded-lg border border-line bg-raised/40 overflow-hidden">
      <div ref={scrollRef} className="overflow-x-auto">
        <div ref={innerRef} className="relative select-none" style={{ width: `${zoom * 100}%` }}>
          {/* Time ruler */}
          <div className="relative h-5 border-b border-line/70">
            {ticks.map((t) => (
              <div key={t} className="absolute top-0 h-full" style={{ left: pct(t) }}>
                <div className="absolute top-0 left-0 w-px h-2 bg-ink-5/50" />
                <span className="absolute top-1.5 left-1 text-[9px] leading-none text-ink-5 tabular-nums">
                  {fmt(t)}
                </span>
              </div>
            ))}
          </div>

          {/* Beat track */}
          <div className="relative h-12 cursor-text" onClick={seekFromEvent}>
            {/* Dim everything outside the selected beat range */}
            {beats.length > 0 && from > 0 && (
              <div
                className="absolute inset-y-0 left-0 bg-bg/70"
                style={{ width: pct(beats[from] ?? 0) }}
              />
            )}
            {beats.length > 0 && to < beats.length && (
              <div
                className="absolute inset-y-0 right-0 bg-bg/70"
                style={{ left: pct(beats[to] ?? duration) }}
              />
            )}

            {beats.map((b, i) => {
              const bar = i % 4 === 0; // downbeat — the one worth aiming at
              const inRange = i >= from && i < to;
              return (
                <button
                  key={b}
                  type="button"
                  title={`Beat ${i + 1} · bar ${Math.floor(i / 4) + 1} · ${fmt(b)}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPickBeat(b);
                  }}
                  style={{ left: pct(b) }}
                  className={`absolute -ml-[4px] w-[9px] flex justify-center group ${
                    bar ? 'bottom-0 h-9' : 'bottom-0 h-4'
                  }`}
                >
                  <span
                    className={`w-px h-full transition-colors ${
                      inRange
                        ? bar
                          ? 'bg-ink-3 group-hover:bg-ink'
                          : 'bg-ink-5/60 group-hover:bg-ink-2'
                        : 'bg-line group-hover:bg-ink-5'
                    }`}
                  />
                </button>
              );
            })}

            {/* Bar numbers, every 4 beats, only while there's room for them */}
            {zoom > 1 &&
              beats.map((b, i) =>
                i % 4 === 0 ? (
                  <span
                    key={`n${b}`}
                    className="absolute top-0 text-[9px] leading-none text-ink-5 tabular-nums pointer-events-none"
                    style={{ left: `calc(${pct(b)} + 3px)` }}
                  >
                    {Math.floor(i / 4) + 1}
                  </span>
                ) : null
              )}

            {/* The pinned start/drop */}
            {point != null && (
              <div className="absolute inset-y-0 w-[2px] bg-emerald-500" style={{ left: pct(point) }}>
                <div className="absolute -top-0.5 -left-[3px] w-2 h-2 rounded-full bg-emerald-500" />
              </div>
            )}

            {/* Playhead */}
            <div className="absolute inset-y-0 w-[2px] bg-ink pointer-events-none" style={{ left: pct(time) }}>
              <div className="absolute -top-0.5 -left-[3px] w-2 h-2 rotate-45 bg-ink" />
            </div>
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
          tall tick = bar · click a beat to pin it
        </span>
      </div>
    </div>
  );
}
