import { useMemo, useState } from "react";
import type { ChainExpiry, Market, SurfaceParams } from "../lib/chain";
import { simulate } from "../lib/montecarlo";
import { buildPreset, MULTIPLIER, nearestExpiry, netCost, netGreeks, PRESETS, strategyPnL, summarize, type Leg } from "../lib/strategy";
import { num, pct, signed, usd } from "../lib/format";
import { Heatmap, Histogram, LineChart, pnlColor } from "./Chart";

interface Props {
  legs: Leg[];
  setLegs: (l: Leg[]) => void;
  chain: ChainExpiry[];
  expiryIdx: number;
  market: Market;
  surface: SurfaceParams;
}

export function StrategyLab({ legs, setLegs, chain, expiryIdx, market, surface }: Props) {
  const [ivShift, setIvShift] = useState(0);
  const [realVol, setRealVol] = useState(surface.atmVol);
  const [measure, setMeasure] = useState<"rn" | "real">("rn");
  const [realDrift, setRealDrift] = useState(0.07);
  const [horizonFrac, setHorizonFrac] = useState(1);
  const [paths, setPaths] = useState(50000);

  const near = nearestExpiry(legs);
  const horizon = Math.max(1, Math.round(near * horizonFrac));

  const summary = useMemo(() => summarize(legs, market, near), [legs, market, near]);
  const cost = netCost(legs);
  const greeks = useMemo(() => netGreeks(legs, market), [legs, market]);

  const curves = useMemo(() => {
    const n = 160;
    const lo = market.S * 0.75, hi = market.S * 1.25;
    const xs = Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / n);
    const make = (elapsed: number, shift: number) => xs.map((x) => [x, strategyPnL(legs, x, elapsed, market, shift)] as [number, number]);
    return {
      expiry: make(near, 0),
      half: make(near / 2, ivShift),
      today: make(0, ivShift),
    };
  }, [legs, market, near, ivShift]);

  const heat = useMemo(() => {
    const xs = Array.from({ length: 33 }, (_, i) => market.S * (0.8 + (0.4 * i) / 32));
    const steps = Math.min(near, 14);
    const ys = Array.from({ length: steps + 1 }, (_, j) => (near * j) / steps);
    const z = ys.map((d) => xs.map((x) => strategyPnL(legs, x, d, market, ivShift)));
    const max = Math.max(...z.flat().map(Math.abs), 1);
    return { xs, ys, z, max };
  }, [legs, market, near, ivShift]);

  const sim = useMemo(
    () => simulate(legs, market, {
      horizonDays: horizon, realVol, paths, seed: 2027,
      drift: measure === "rn" ? market.r - market.q : realDrift,
    }),
    [legs, market, horizon, realVol, paths, measure, realDrift],
  );

  const update = (id: string, patch: Partial<Leg>) => setLegs(legs.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const money = (v: number) => usd(v);

  return (
    <div className="stack">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Strategy lab</h2>
            <p className="sub">Load a preset priced off the live chain (buy at the ask, sell at the bid), or build legs by clicking quotes in the chain.</p>
          </div>
        </div>
        <div className="chips">
          {PRESETS.map((p) => (
            <button key={p} className="chip" onClick={() => setLegs(buildPreset(p, chain, expiryIdx, market))}>{p}</button>
          ))}
          <button className="chip ghost" onClick={() => setLegs([])}>Clear</button>
        </div>
        {legs.length === 0 ? (
          <p className="empty">No legs yet. Pick a preset above, or open the Chain tab and click a bid or ask.</p>
        ) : (
          <div className="scroll">
            <table className="plain legs">
              <thead><tr><th>Position</th><th>Contracts</th><th>Strike</th><th>Days</th><th>Entry</th><th>Entry IV</th><th /></tr></thead>
              <tbody>
                {legs.map((l) => (
                  <tr key={l.id}>
                    <td><span className={`tag ${l.qty > 0 ? "long" : "short"}`}>{l.qty > 0 ? "Long" : "Short"}</span> {l.kind === "stock" ? "100 sh" : l.kind}</td>
                    <td>
                      <input aria-label="Contracts" className="qty" type="number" step={1} value={l.qty}
                        onChange={(ev) => { const v = Math.trunc(Number(ev.target.value)); if (v !== 0 && Number.isFinite(v)) update(l.id, { qty: v }); }} />
                    </td>
                    <td>{l.kind === "stock" ? "—" : l.strike}</td>
                    <td>{l.kind === "stock" ? "—" : l.days}</td>
                    <td>{l.entry.toFixed(2)}</td>
                    <td>{l.kind === "stock" ? "—" : pct(l.iv)}</td>
                    <td><button className="x" aria-label="Remove leg" onClick={() => setLegs(legs.filter((x) => x.id !== l.id))}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {legs.length > 0 && (
        <>
          <div className="stats">
            <Stat k={cost >= 0 ? "Net debit" : "Net credit"} v={money(Math.abs(cost))} />
            <Stat k="Max profit" v={summary.unlimitedProfit ? "Unlimited" : money(summary.maxProfit)} tone="gain" />
            <Stat k="Max loss" v={summary.unlimitedLoss ? "Unlimited" : money(summary.maxLoss)} tone="loss" />
            <Stat k="Breakeven" v={summary.breakevens.length ? summary.breakevens.map((b) => b.toFixed(2)).join(" · ") : "none in range"} />
            <Stat k="Net delta" v={signed(greeks.delta, 1)} sub="shares of exposure" />
            <Stat k="Net gamma" v={signed(greeks.gamma, 2)} sub="delta per $1" />
            <Stat k="Theta / day" v={usd(greeks.theta, 0)} sub="time decay" />
            <Stat k="Vega" v={usd(greeks.vega, 0)} sub="per vol point" />
          </div>

          <div className="panel">
            <h2>Profit and loss by underlying price</h2>
            <p className="sub">Solid line is P&amp;L at the nearest expiry ({near} days). The other curves reprice every leg with Black-Scholes at the earlier dates.</p>
            <LineChart
              label="Profit and loss versus underlying price"
              zeroLine height={340}
              series={[
                { name: `At expiry (${near}d)`, color: "var(--accent)", pts: curves.expiry },
                { name: "Halfway", color: "var(--amber)", pts: curves.half, dash: "6 4" },
                { name: "Today", color: "var(--violet)", pts: curves.today, dash: "2 4" },
              ]}
              vlines={[{ x: market.S, label: `Spot ${market.S}`, color: "var(--fg)" },
                ...summary.breakevens.map((b) => ({ x: b, label: `BE ${b.toFixed(1)}`, color: "var(--amber)" }))]}
              xFmt={(v) => v.toFixed(0)} yFmt={(v) => usd(v)} xTitle="Underlying price" yTitle="P&L (dollars)"
            />
            <div className="ctl">
              <label htmlFor="ivs">Parallel IV shift on the early curves</label>
              <input id="ivs" type="range" min={-0.1} max={0.1} step={0.005} value={ivShift} onChange={(e) => setIvShift(Number(e.target.value))} />
              <output>{signed(ivShift * 100, 1)} vol pts</output>
            </div>
          </div>

          <div className="panel">
            <h2>P&amp;L heatmap: price against time</h2>
            <p className="sub">Each cell is total P&amp;L if the underlying is at that price after that many days. Watch theta bleed a long straddle or build a credit spread.</p>
            <Heatmap
              label="P&L heatmap across price and days elapsed"
              xs={heat.xs} ys={heat.ys} z={heat.z}
              color={(v) => pnlColor(v, heat.max)} cellText={(v) => usd(v)}
              xFmt={(v) => v.toFixed(0)} yFmt={(v) => `${v.toFixed(0)}d`}
              xTitle="Underlying" yTitle="Days elapsed"
            />
          </div>

          <div className="panel">
            <h2>Monte Carlo risk</h2>
            <p className="sub">
              {sim.samples.toLocaleString()} geometric Brownian motion paths with antithetic variates, repricing every leg at the {horizon}-day horizon.
              Set realized vol below or above the implied level to test whether the market is overpaying or underpaying for risk.
            </p>
            <div className="grid-ctl">
              <div className="ctl col">
                <label htmlFor="rv">Realized vol</label>
                <input id="rv" type="range" min={0.05} max={0.8} step={0.005} value={realVol} onChange={(e) => setRealVol(Number(e.target.value))} />
                <output>{pct(realVol)} vs {pct(surface.atmVol)} ATM implied</output>
              </div>
              <div className="ctl col">
                <label htmlFor="hz">Horizon</label>
                <input id="hz" type="range" min={0.1} max={1} step={0.05} value={horizonFrac} onChange={(e) => setHorizonFrac(Number(e.target.value))} />
                <output>{horizon} of {near} days</output>
              </div>
              <div className="ctl col">
                <label htmlFor="ms">Drift</label>
                <select id="ms" value={measure} onChange={(e) => setMeasure(e.target.value as "rn" | "real")}>
                  <option value="rn">Risk-neutral (r minus q)</option>
                  <option value="real">Real-world (custom)</option>
                </select>
                {measure === "real" && (
                  <input aria-label="Real-world drift" type="range" min={-0.2} max={0.3} step={0.01} value={realDrift} onChange={(e) => setRealDrift(Number(e.target.value))} />
                )}
                {measure === "real" && <output>{pct(realDrift)} per year</output>}
              </div>
              <div className="ctl col">
                <label htmlFor="pp">Paths</label>
                <select id="pp" value={paths} onChange={(e) => setPaths(Number(e.target.value))}>
                  <option value={10000}>10,000</option><option value={50000}>50,000</option><option value={200000}>200,000</option>
                </select>
              </div>
            </div>
            <div className="stats compact">
              <Stat k="Probability of profit" v={pct(sim.pop)} />
              <Stat k="Expected P&L" v={money(sim.mean)} tone={sim.mean >= 0 ? "gain" : "loss"} />
              <Stat k="95% VaR" v={money(sim.var95)} sub="5th percentile" tone="loss" />
              <Stat k="95% CVaR" v={money(sim.cvar95)} sub="mean of worst 5%" tone="loss" />
              <Stat k="Std deviation" v={money(sim.stdev)} />
              <Stat k="Return on risk" v={!summary.unlimitedLoss && summary.maxLoss < 0 ? pct(sim.mean / Math.abs(summary.maxLoss)) : "n/a"} sub="mean P&L over max loss" />
            </div>
            <Histogram
              label="Distribution of simulated profit and loss"
              bins={sim.histogram} xFmt={(v) => usd(v)}
              vlines={[{ x: 0, label: "Breakeven", color: "var(--fg)" }, { x: sim.mean, label: `Mean ${usd(sim.mean)}`, color: "var(--accent)" }, { x: sim.var95, label: `VaR ${usd(sim.var95)}`, color: "var(--loss)" }]}
            />
            <p className="fine">Contract multiplier {MULTIPLIER}. Black-Scholes assumes constant volatility and no jumps, so tail risk is understated for real markets. Treat this as an educational model, not advice.</p>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ k, v, sub, tone }: { k: string; v: string; sub?: string; tone?: "gain" | "loss" }) {
  return (
    <div className="stat">
      <span className="k">{k}</span>
      <span className={`v ${tone ?? ""}`}>{v}</span>
      {sub && <span className="s">{sub}</span>}
    </div>
  );
}

export { num };
