import { useMemo } from "react";
import { smilePoints, surfaceVol, type ChainExpiry, type Market, type SurfaceParams } from "../lib/chain";
import { pct } from "../lib/format";
import { Heatmap, ivColor, LineChart } from "./Chart";

export function SurfaceView({ chain, market, surface }: { chain: ChainExpiry[]; market: Market; surface: SurfaceParams }) {
  const grid = useMemo(() => {
    const xs = Array.from({ length: 41 }, (_, i) => 0.8 + (0.4 * i) / 40);
    const ys = chain.map((c) => c.days);
    const z = chain.map((c) => xs.map((m) => surfaceVol(surface, market, market.S * m, c.T)));
    return { xs, ys, z, lo: Math.min(...z.flat()), hi: Math.max(...z.flat()) };
  }, [chain, market, surface]);

  const smiles = useMemo(
    () => chain.map((c, i) => ({
      name: `${c.days}d`,
      color: `hsl(${200 - i * 24} 75% ${62 - i * 2}%)`,
      pts: smilePoints(c).map((p) => [p.strike, p.iv] as [number, number]),
    })),
    [chain],
  );

  const term = useMemo(
    () => [{
      name: "ATM implied vol", color: "var(--accent)",
      pts: chain.map((c) => [c.days, surfaceVol(surface, market, c.forward, c.T)] as [number, number]),
    }],
    [chain, market, surface],
  );

  return (
    <div className="stack">
      <div className="panel">
        <h2>Implied volatility surface</h2>
        <p className="sub">
          Volatility by moneyness and expiry from the parametric model. Adjust ATM level, skew, curvature and term slope in the sidebar. With a negative skew, low strikes (puts) are priced richer than high strikes, the shape equity index options show in practice.
        </p>
        <Heatmap
          label="Implied volatility heatmap by moneyness and days to expiry"
          xs={grid.xs} ys={grid.ys} z={grid.z}
          color={(v) => ivColor(v, grid.lo, grid.hi)} cellText={(v) => pct(v)}
          xFmt={(v) => `${(v * 100).toFixed(0)}%`} yFmt={(v) => `${v}d`}
          xTitle="Strike as % of spot" yTitle="Days to expiry"
        />
      </div>
      <div className="panel">
        <h2>Volatility smiles recovered from quotes</h2>
        <p className="sub">Each curve is implied vol solved from the generated out-of-the-money mid prices, strike by strike. If the solver and pricer agree, these match the surface above.</p>
        <LineChart
          label="Implied volatility smile by expiry" height={300}
          series={smiles} vlines={[{ x: market.S, label: `Spot ${market.S}`, color: "var(--fg)" }]}
          xFmt={(v) => v.toFixed(0)} yFmt={(v) => pct(v, 0)} xTitle="Strike" yTitle="Implied vol"
        />
      </div>
      <div className="panel">
        <h2>ATM term structure</h2>
        <LineChart
          label="At-the-money implied volatility by days to expiry" height={240}
          series={term} xFmt={(v) => `${v.toFixed(0)}d`} yFmt={(v) => pct(v)} xTitle="Days to expiry" yTitle="ATM vol"
        />
      </div>
    </div>
  );
}
