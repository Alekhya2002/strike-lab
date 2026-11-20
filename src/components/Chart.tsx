import { useState } from "react";
import { niceTicks } from "../lib/math";

const W = 760;
const PAD = { l: 78, r: 18, t: 14, b: 36 };

export interface Series {
  name: string;
  color: string;
  pts: [number, number][];
  dash?: string;
}
export interface VLine {
  x: number;
  label: string;
  color?: string;
}

interface LineProps {
  series: Series[];
  vlines?: VLine[];
  xFmt: (v: number) => string;
  yFmt: (v: number) => string;
  xTitle?: string;
  yTitle?: string;
  height?: number;
  zeroLine?: boolean;
  label: string;
}

export function LineChart({ series, vlines = [], xFmt, yFmt, xTitle, yTitle, height = 320, zeroLine = false, label }: LineProps) {
  const [hover, setHover] = useState<number | null>(null);
  const all = series.flatMap((s) => s.pts);
  const xmin = Math.min(...all.map((p) => p[0]));
  const xmax = Math.max(...all.map((p) => p[0]));
  let ymin = Math.min(...all.map((p) => p[1]), zeroLine ? 0 : Infinity);
  let ymax = Math.max(...all.map((p) => p[1]), zeroLine ? 0 : -Infinity);
  const padY = (ymax - ymin || 1) * 0.07;
  ymin -= padY;
  ymax += padY;
  const sx = (x: number) => PAD.l + ((x - xmin) / (xmax - xmin || 1)) * (W - PAD.l - PAD.r);
  const sy = (y: number) => height - PAD.b - ((y - ymin) / (ymax - ymin || 1)) * (height - PAD.t - PAD.b);
  const xt = niceTicks(xmin, xmax, 7);
  const yt = niceTicks(ymin, ymax, 6);
  const path = (pts: [number, number][]) => pts.map((p, i) => `${i ? "L" : "M"}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join("");
  const ref = series[0]?.pts ?? [];
  const hi = hover === null ? null : Math.min(ref.length - 1, Math.max(0, hover));

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - box.left) / box.width;
    setHover(Math.round(frac * (ref.length - 1)));
  };

  return (
    <figure className="chart">
      <div className="legend" aria-live="polite">
        {series.map((s, si) => (
          <span key={s.name} className="lg">
            <i style={{ background: s.color }} />
            {s.name}
            {hi !== null && s.pts[hi] && <b>{yFmt(s.pts[hi][1])}</b>}
            {hi !== null && si === 0 && ref[hi] && <em>at {xFmt(ref[hi][0])}</em>}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={label}>
        {yt.map((v) => (
          <g key={`y${v}`}>
            <line x1={PAD.l} x2={W - PAD.r} y1={sy(v)} y2={sy(v)} className="grid" />
            <text x={PAD.l - 8} y={sy(v) + 4} textAnchor="end" className="tick">{yFmt(v)}</text>
          </g>
        ))}
        {xt.map((v) => (
          <text key={`x${v}`} x={sx(v)} y={height - PAD.b + 18} textAnchor="middle" className="tick">{xFmt(v)}</text>
        ))}
        {zeroLine && <line x1={PAD.l} x2={W - PAD.r} y1={sy(0)} y2={sy(0)} className="zero" />}
        {vlines.map((v, i) => (
          <g key={`${v.label}${i}`}>
            <line x1={sx(v.x)} x2={sx(v.x)} y1={PAD.t} y2={height - PAD.b} stroke={v.color ?? "var(--muted)"} strokeDasharray="3 4" />
            <text x={sx(v.x) + 4} y={PAD.t + 10 + (i % 3) * 12} className="tick" fill={v.color ?? "var(--muted)"}>{v.label}</text>
          </g>
        ))}
        {series.map((s) => (
          <path key={s.name} d={path(s.pts)} fill="none" stroke={s.color} strokeWidth={2.2} strokeDasharray={s.dash} strokeLinejoin="round" />
        ))}
        {hi !== null && ref[hi] && <line x1={sx(ref[hi][0])} x2={sx(ref[hi][0])} y1={PAD.t} y2={height - PAD.b} className="cross" />}
        {xTitle && <text x={(PAD.l + W - PAD.r) / 2} y={height - 4} textAnchor="middle" className="axis">{xTitle}</text>}
        {yTitle && <text transform={`translate(13 ${height / 2}) rotate(-90)`} textAnchor="middle" className="axis">{yTitle}</text>}
        <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={height - PAD.t - PAD.b} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
      </svg>
    </figure>
  );
}

export function Histogram({ bins, vlines, xFmt, label }: {
  bins: { x0: number; x1: number; count: number }[]; vlines: VLine[]; xFmt: (v: number) => string; label: string;
}) {
  const height = 260;
  const xmin = bins[0].x0, xmax = bins[bins.length - 1].x1;
  const ymax = Math.max(...bins.map((b) => b.count), 1);
  const sx = (x: number) => PAD.l + ((x - xmin) / (xmax - xmin || 1)) * (W - PAD.l - PAD.r);
  const sy = (c: number) => height - PAD.b - (c / ymax) * (height - PAD.t - PAD.b);
  const total = bins.reduce((s, b) => s + b.count, 0) || 1;
  const xt = niceTicks(xmin, xmax, 7);
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={label}>
        <line x1={PAD.l} x2={W - PAD.r} y1={height - PAD.b} y2={height - PAD.b} className="zero" />
        {bins.map((b) => {
          const mid = (b.x0 + b.x1) / 2;
          return (
            <rect key={b.x0} x={sx(b.x0) + 0.5} width={Math.max(1, sx(b.x1) - sx(b.x0) - 1)} y={sy(b.count)} height={height - PAD.b - sy(b.count)}
              fill={mid >= 0 ? "var(--gain)" : "var(--loss)"} opacity={0.82}>
              <title>{`${xFmt(b.x0)} to ${xFmt(b.x1)}: ${((b.count / total) * 100).toFixed(1)}% of paths`}</title>
            </rect>
          );
        })}
        {xt.map((v) => <text key={v} x={sx(v)} y={height - PAD.b + 18} textAnchor="middle" className="tick">{xFmt(v)}</text>)}
        {vlines.filter((v) => v.x >= xmin && v.x <= xmax).map((v, i) => (
          <g key={v.label}>
            <line x1={sx(v.x)} x2={sx(v.x)} y1={PAD.t} y2={height - PAD.b} stroke={v.color ?? "var(--fg)"} strokeWidth={1.6} strokeDasharray="4 3" />
            <text x={sx(v.x) + 4} y={PAD.t + 10 + i * 12} className="tick" fill={v.color ?? "var(--fg)"}>{v.label}</text>
          </g>
        ))}
        <text x={(PAD.l + W - PAD.r) / 2} y={height - 4} textAnchor="middle" className="axis">P&amp;L at horizon (dollars)</text>
      </svg>
    </figure>
  );
}

export function Heatmap({ xs, ys, z, color, xFmt, yFmt, cellText, xTitle, yTitle, label }: {
  xs: number[]; ys: number[]; z: number[][]; color: (v: number) => string;
  xFmt: (v: number) => string; yFmt: (v: number) => string; cellText: (v: number) => string;
  xTitle: string; yTitle: string; label: string;
}) {
  const [hov, setHov] = useState<[number, number] | null>(null);
  const height = 330;
  const cw = (W - PAD.l - PAD.r) / xs.length;
  const ch = (height - PAD.t - PAD.b) / ys.length;
  const xEvery = Math.ceil(xs.length / 9);
  const yEvery = Math.ceil(ys.length / 8);
  return (
    <figure className="chart">
      <div className="legend" aria-live="polite">
        {hov ? <span className="lg"><b>{cellText(z[hov[1]][hov[0]])}</b><em>{xTitle} {xFmt(xs[hov[0]])}, {yTitle} {yFmt(ys[hov[1]])}</em></span> : <span className="lg"><em>Hover a cell to read it</em></span>}
      </div>
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={label}>
        {ys.map((_y, j) => xs.map((_x, i) => (
          <rect key={`${i}-${j}`} x={PAD.l + i * cw} y={PAD.t + (ys.length - 1 - j) * ch} width={cw + 0.5} height={ch + 0.5}
            fill={color(z[j][i])} onPointerEnter={() => setHov([i, j])} onPointerLeave={() => setHov(null)} />
        )))}
        {xs.map((x, i) => i % xEvery === 0 && <text key={`x${i}`} x={PAD.l + (i + 0.5) * cw} y={height - PAD.b + 16} textAnchor="middle" className="tick">{xFmt(x)}</text>)}
        {ys.map((y, j) => j % yEvery === 0 && <text key={`y${j}`} x={PAD.l - 8} y={PAD.t + (ys.length - 1 - j + 0.5) * ch + 4} textAnchor="end" className="tick">{yFmt(y)}</text>)}
        <text x={(PAD.l + W - PAD.r) / 2} y={height - 4} textAnchor="middle" className="axis">{xTitle}</text>
        <text transform={`translate(13 ${height / 2}) rotate(-90)`} textAnchor="middle" className="axis">{yTitle}</text>
      </svg>
    </figure>
  );
}

/** Diverging loss-to-gain colour on the dark background. */
export function pnlColor(v: number, max: number): string {
  const a = Math.min(1, Math.abs(v) / (max || 1));
  return v >= 0 ? `rgba(46,196,138,${0.08 + 0.85 * a})` : `rgba(239,83,96,${0.08 + 0.85 * a})`;
}

/** Sequential cool-to-warm colour for implied vol. */
export function ivColor(v: number, lo: number, hi: number): string {
  const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo || 1)));
  const h = 215 - t * 175; // blue to amber
  return `hsl(${h} 70% ${28 + t * 24}%)`;
}
