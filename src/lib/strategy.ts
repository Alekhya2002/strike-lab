import { bsGreeks, bsPrice, type Greeks } from "./bs";
import type { ChainExpiry, Market } from "./chain";

export type LegKind = "call" | "put" | "stock";

/**
 * One position leg. qty is signed (+ long, - short) in contracts of 100 shares;
 * a stock leg is quantity in lots of 100 shares. entry is the per-share price paid
 * (long) or received (short). iv is the implied vol locked in at entry.
 */
export interface Leg {
  id: string;
  kind: LegKind;
  qty: number;
  strike: number;
  days: number;
  entry: number;
  iv: number;
}

export const MULTIPLIER = 100;
let nextId = 1;
export const newId = () => `leg-${nextId++}`;

/** Per-share value of a leg at spot S, `elapsed` days from now, with an optional parallel IV shift. */
export function legValue(leg: Leg, S: number, elapsed: number, m: Market, ivShift = 0): number {
  if (leg.kind === "stock") return S;
  const remaining = (leg.days - elapsed) / 365;
  return bsPrice(leg.kind, S, leg.strike, remaining, m.r, m.q, Math.max(0.01, leg.iv + ivShift));
}

/** Total strategy P&L in dollars at spot S, `elapsed` days from now. */
export function strategyPnL(legs: Leg[], S: number, elapsed: number, m: Market, ivShift = 0): number {
  let total = 0;
  for (const leg of legs) total += leg.qty * MULTIPLIER * (legValue(leg, S, elapsed, m, ivShift) - leg.entry);
  return total;
}

/** Net debit (positive) or credit (negative) to open, in dollars. */
export function netCost(legs: Leg[]): number {
  return legs.reduce((s, l) => s + l.qty * MULTIPLIER * l.entry, 0);
}

export function nearestExpiry(legs: Leg[]): number {
  const d = legs.filter((l) => l.kind !== "stock").map((l) => l.days);
  return d.length ? Math.min(...d) : 30;
}

export function netGreeks(legs: Leg[], m: Market, elapsed = 0): Greeks {
  const g: Greeks = { delta: 0, gamma: 0, vega: 0, theta: 0, rho: 0, vanna: 0, volga: 0 };
  for (const leg of legs) {
    const w = leg.qty * MULTIPLIER;
    if (leg.kind === "stock") {
      g.delta += w;
      continue;
    }
    const x = bsGreeks(leg.kind, m.S, leg.strike, (leg.days - elapsed) / 365, m.r, m.q, leg.iv);
    for (const k of Object.keys(g) as (keyof Greeks)[]) g[k] += w * x[k];
  }
  return g;
}

/** Roots of f on [lo, hi]: sample for sign changes, then refine each by bisection. */
export function findRoots(f: (x: number) => number, lo: number, hi: number, n = 600): number[] {
  const roots: number[] = [];
  let xPrev = lo;
  let fPrev = f(lo);
  for (let i = 1; i <= n; i++) {
    const x = lo + ((hi - lo) * i) / n;
    const fx = f(x);
    if (fPrev === 0) roots.push(xPrev);
    else if (fPrev * fx < 0) {
      let a = xPrev, b = x, fa = fPrev;
      for (let k = 0; k < 60; k++) {
        const mid = 0.5 * (a + b);
        const fm = f(mid);
        if (fa * fm <= 0) b = mid;
        else { a = mid; fa = fm; }
      }
      roots.push(0.5 * (a + b));
    }
    xPrev = x;
    fPrev = fx;
  }
  return roots;
}

export interface PayoffSummary {
  maxProfit: number;
  maxLoss: number;
  unlimitedProfit: boolean;
  unlimitedLoss: boolean;
  breakevens: number[];
}

export function summarize(legs: Leg[], m: Market, elapsed: number): PayoffSummary {
  const lo = m.S * 0.2;
  const hi = m.S * 2.2;
  const f = (s: number) => strategyPnL(legs, s, elapsed, m);
  const n = 800;
  let best = f(0.0001);
  let worst = best;
  for (let i = 0; i <= n; i++) {
    const v = f(lo + ((hi - lo) * i) / n);
    if (v > best) best = v;
    if (v < worst) worst = v;
  }
  const slope = (f(hi) - f(hi * 0.98)) / (hi * 0.02);
  const tol = 0.5; // dollars per $1 of underlying; below this, treat the tail as flat
  return {
    maxProfit: best,
    maxLoss: worst,
    unlimitedProfit: slope > tol,
    unlimitedLoss: slope < -tol,
    breakevens: findRoots(f, lo, hi),
  };
}

export const PRESETS = [
  "Long Call", "Long Put", "Covered Call", "Bull Call Spread", "Bear Put Spread",
  "Long Straddle", "Long Strangle", "Iron Condor", "Call Butterfly", "Calendar Spread",
] as const;
export type PresetName = (typeof PRESETS)[number];

/** Build a preset from live chain quotes: buy at the ask, sell at the bid. */
export function buildPreset(name: PresetName, chain: ChainExpiry[], expiryIdx: number, m: Market): Leg[] {
  const e = chain[Math.min(expiryIdx, chain.length - 1)];
  const far = chain[Math.min(expiryIdx + 2, chain.length - 1)];
  let atm = 0;
  e.rows.forEach((r, i) => { if (Math.abs(r.strike - m.S) < Math.abs(e.rows[atm].strike - m.S)) atm = i; });
  const row = (off: number, ex: ChainExpiry = e) => ex.rows[Math.max(0, Math.min(ex.rows.length - 1, atm + off))];
  const step = Math.max(1, Math.round(e.rows.length / 14)); // ~7% wings regardless of strike spacing
  const leg = (kind: "call" | "put", qty: number, off: number, ex: ChainExpiry = e): Leg => {
    const q = (kind === "call" ? row(off, ex).call : row(off, ex).put);
    return {
      id: newId(), kind, qty, strike: q.strike, days: ex.days,
      entry: qty > 0 ? q.ask : q.bid, iv: Number.isFinite(q.iv) ? q.iv : 0.2,
    };
  };
  switch (name) {
    case "Long Call": return [leg("call", 1, 0)];
    case "Long Put": return [leg("put", 1, 0)];
    case "Covered Call": return [{ id: newId(), kind: "stock", qty: 1, strike: 0, days: 0, entry: m.S, iv: 0 }, leg("call", -1, step)];
    case "Bull Call Spread": return [leg("call", 1, 0), leg("call", -1, 2 * step)];
    case "Bear Put Spread": return [leg("put", 1, 0), leg("put", -1, -2 * step)];
    case "Long Straddle": return [leg("call", 1, 0), leg("put", 1, 0)];
    case "Long Strangle": return [leg("call", 1, step), leg("put", 1, -step)];
    case "Iron Condor": return [leg("put", 1, -3 * step), leg("put", -1, -step), leg("call", -1, step), leg("call", 1, 3 * step)];
    case "Call Butterfly": return [leg("call", 1, -2 * step), leg("call", -2, 0), leg("call", 1, 2 * step)];
    case "Calendar Spread": return [leg("call", -1, 0), leg("call", 1, 0, far)];
  }
}
