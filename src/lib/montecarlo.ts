import { gaussian, mulberry32, quantile } from "./math";
import type { Market } from "./chain";
import { strategyPnL, type Leg } from "./strategy";

export interface SimOptions {
  horizonDays: number;
  /** Annualised vol of the underlying used to simulate paths (the "real-world" view). */
  realVol: number;
  /** Annualised drift. Use r - q for the risk-neutral measure. */
  drift: number;
  paths: number;
  seed: number;
}

export interface SimResult {
  mean: number;
  stdev: number;
  /** Probability that P&L > 0 at the horizon. */
  pop: number;
  /** 5th-percentile P&L (value-at-risk threshold, 95%). */
  var95: number;
  /** Mean P&L in the worst 5% of paths (expected shortfall). */
  cvar95: number;
  best: number;
  worst: number;
  histogram: { x0: number; x1: number; count: number }[];
  samples: number;
}

/** Monte Carlo over geometric Brownian motion with antithetic variates. */
export function simulate(legs: Leg[], m: Market, o: SimOptions): SimResult {
  const rng = gaussian(mulberry32(o.seed));
  const T = o.horizonDays / 365;
  const volT = o.realVol * Math.sqrt(T);
  const drift = (o.drift - 0.5 * o.realVol * o.realVol) * T;
  const n = Math.max(2, o.paths - (o.paths % 2));
  const pnl = new Float64Array(n);
  for (let i = 0; i < n; i += 2) {
    const z = rng();
    pnl[i] = strategyPnL(legs, m.S * Math.exp(drift + volT * z), o.horizonDays, m);
    pnl[i + 1] = strategyPnL(legs, m.S * Math.exp(drift - volT * z), o.horizonDays, m);
  }
  let sum = 0, wins = 0;
  for (let i = 0; i < n; i++) { sum += pnl[i]; if (pnl[i] > 0) wins++; }
  const mean = sum / n;
  let ss = 0;
  for (let i = 0; i < n; i++) ss += (pnl[i] - mean) ** 2;
  const sorted = Float64Array.from(pnl).sort();
  const var95 = quantile(sorted, 0.05);
  const tailN = Math.max(1, Math.floor(n * 0.05));
  let tail = 0;
  for (let i = 0; i < tailN; i++) tail += sorted[i];
  // Histogram trimmed to the 0.5%-99.5% range so extreme tails do not flatten the shape.
  const lo = quantile(sorted, 0.005);
  const hi = quantile(sorted, 0.995);
  const bins = 48;
  const width = hi > lo ? (hi - lo) / bins : 1;
  const histogram = Array.from({ length: bins }, (_, b) => ({ x0: lo + b * width, x1: lo + (b + 1) * width, count: 0 }));
  for (let i = 0; i < n; i++) {
    if (pnl[i] < lo || pnl[i] > hi) continue;
    const b = Math.min(bins - 1, Math.floor((pnl[i] - lo) / width)); // the top edge belongs to the last bin
    histogram[b].count++;
  }
  return {
    mean, stdev: Math.sqrt(ss / (n - 1)), pop: wins / n, var95, cvar95: tail / tailN,
    best: sorted[n - 1], worst: sorted[0], histogram, samples: n,
  };
}
