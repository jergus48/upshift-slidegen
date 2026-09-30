import { gapsOf, ROLE_COLOR, ROLE_LABEL, type CapcutFormat } from '../lib/capcutFormats';

// A format's timeline as one bar, in the placeholder colours — the CapCut
// timeline at a glance. The white tick is the drop.
export function FormatStrip({ format, height = 14 }: { format: CapcutFormat; height?: number }) {
  const d = format.duration || 1;
  const pct = (t: number) => `${(t / d) * 100}%`;
  return (
    <div className="relative w-full rounded overflow-hidden bg-raised" style={{ height }}>
      {format.video.map((v, i) => (
        <div
          key={i}
          className="absolute top-0 bottom-0 border-r border-black/30"
          style={{ left: pct(v.from), width: pct(v.to - v.from), background: ROLE_COLOR[v.role] }}
          title={`${v.role === 'asset' ? v.asset : ROLE_LABEL[v.role]} · ${v.from.toFixed(2)}–${v.to.toFixed(2)}s${v.speed !== 1 ? ` · ${v.speed}×` : ''}`}
        />
      ))}
      {gapsOf(format).map((g, i) => (
        <div
          key={`g${i}`}
          className="absolute top-0 bottom-0 bg-black"
          style={{ left: pct(g.from), width: pct(g.to - g.from) }}
          title={`Black ${g.from.toFixed(2)}–${g.to.toFixed(2)}s`}
        />
      ))}
      <div className="absolute top-0 bottom-0 w-0.5 bg-white" style={{ left: pct(format.drop) }} title="Drop" />
    </div>
  );
}
