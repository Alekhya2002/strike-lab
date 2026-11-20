import { mulberry32 } from "./math";
import { bsGreeks, bsPrice, impliedVol, type Greeks, type OptionType } from "./bs";

export interface Market {
  S: number;
  r: number;
  q: number;
}

/** Parametric volatility surface: ATM level, term structure, skew and smile curvature. */
export interface SurfaceParams {
  atmVol: number; // ATM vol at 30 days, e.g. 0.20
  termSlope: number; // vol per sqrt(year); positive = upward-sloping term structure
  skew: number; // slope of vol in standardized moneyness; negative = equity-style put skew
  convexity: number; // smile curvature
}

export const DEFAULT_SURFACE: SurfaceParams = { atmVol: 0.2, termSlope: 0.04, skew: -0.09, convexity: 0.035 };
export const DEFAULT_MARKET: Market = { S: 450, r: 0.045, q: 0.012 };

/** Implied vol at strike K and maturity T (years) from the parametric surface. */
export function surfaceVol(p: SurfaceParams, m: Market, K: number, T: number): number {
  const F = m.S * Math.exp((m.r - m.q) * T);
  const atm = Math.max(0.05, p.atmVol + p.termSlope * (Math.sqrt(T) - Math.sqrt(30 / 365)));
  // Standardize with a 30-day floor so very short expiries do not explode into unrealistic wings.
  const x = Math.log(K / F) / (atm * Math.sqrt(Math.max(T, 30 / 365)));
  return Math.max(0.03, atm * (1 + p.skew * x + p.convexity * x * x));
}

export interface Quote {
  type: OptionType;
  strike: number;
  days: number;
  bid: number;
  ask: number;
  mid: number;
  iv: number; // implied from mid; NaN if not invertible
  greeks: Greeks;
  volume: number;
  openInterest: number;
}

export interface StrikeRow {
  strike: number;
  call: Quote;
  put: Quote;
}

export interface ChainExpiry {
  days: number;
  T: number;
  forward: number;
  rows: StrikeRow[];
}

export function strikeStep(S: number): number {
  if (S < 25) return 0.5;
  if (S < 100) return 1;
  if (S < 250) return 2.5;
  if (S < 750) return 5;
  return 10;
}

export const DEFAULT_EXPIRIES = [7, 14, 30, 45, 60, 90, 180];

export function generateChain(
  m: Market, surface: SurfaceParams, expiries: number[] = DEFAULT_EXPIRIES, seed = 7,
): ChainExpiry[] {
  const step = strikeStep(m.S);
  const mid0 = Math.round(m.S / step) * step;
  const nEach = Math.round((m.S * 0.22) / step);
  return expiries.map((days, ei) => {
    const rng = mulberry32(seed * 1000 + ei * 17 + 3);
    const T = days / 365;
    const rows: StrikeRow[] = [];
    for (let i = -nEach; i <= nEach; i++) {
      const K = +(mid0 + i * step).toFixed(2);
      if (K <= 0) continue;
      const sigma = surfaceVol(surface, m, K, T);
      const x = Math.log(K / m.S) / (sigma * Math.sqrt(T));
      const liquidity = Math.exp(-0.5 * (x / 1.2) ** 2);
      const make = (type: OptionType): Quote => {
        const fair = bsPrice(type, m.S, K, T, m.r, m.q, sigma);
        const half = Math.max(0.01, 0.012 + 0.018 * fair * (1.4 - liquidity) + rng() * 0.01);
        const bid = Math.max(0, +(fair - half).toFixed(2));
        const ask = +(fair + half).toFixed(2);
        const mid = +((bid + ask) / 2).toFixed(3);
        const iv = impliedVol(type, mid, m.S, K, T, m.r, m.q);
        const g = bsGreeks(type, m.S, K, T, m.r, m.q, Number.isFinite(iv) ? iv : sigma);
        const oi = Math.round(liquidity * (800 + rng() * 5200) / (1 + ei * 0.25));
        return { type, strike: K, days, bid, ask, mid, iv, greeks: g, volume: Math.round(oi * rng() * 0.35), openInterest: oi };
      };
      rows.push({ strike: K, call: make("call"), put: make("put") });
    }
    return { days, T, forward: m.S * Math.exp((m.r - m.q) * T), rows };
  });
}

/** Out-of-the-money IV at each strike (puts below forward, calls above), the standard smile. */
export function smilePoints(e: ChainExpiry): { strike: number; iv: number }[] {
  const out: { strike: number; iv: number }[] = [];
  for (const row of e.rows) {
    const q = row.strike < e.forward ? row.put : row.call;
    // Skip penny-priced quotes: a one-cent tick is a large fraction of their price, so the solved IV is noise.
    if (Number.isFinite(q.iv) && q.mid >= 0.1) out.push({ strike: row.strike, iv: q.iv });
  }
  return out;
}
