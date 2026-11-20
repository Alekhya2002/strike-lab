import { normCdf, normPdf } from "./math";

export type OptionType = "call" | "put";

export interface Greeks {
  delta: number;
  gamma: number;
  /** Per 1 volatility point (0.01). */
  vega: number;
  /** Per calendar day. */
  theta: number;
  /** Per 1 percentage point of rate. */
  rho: number;
  /** d(delta)/d(vol), per 1 vol point. */
  vanna: number;
  /** d(vega)/d(vol), per 1 vol point squared (scaled by 1e4). */
  volga: number;
}

const ZERO_GREEKS: Greeks = { delta: 0, gamma: 0, vega: 0, theta: 0, rho: 0, vanna: 0, volga: 0 };

export function d1d2(S: number, K: number, T: number, r: number, q: number, sigma: number): [number, number] {
  const vs = sigma * Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / vs;
  return [d1, d1 - vs];
}

/** Black-Scholes-Merton price with continuous dividend yield q. T in years. */
export function bsPrice(type: OptionType, S: number, K: number, T: number, r: number, q: number, sigma: number): number {
  if (T <= 0) return type === "call" ? Math.max(S - K, 0) : Math.max(K - S, 0);
  const dfR = Math.exp(-r * T);
  const dfQ = Math.exp(-q * T);
  if (sigma <= 1e-12) {
    return type === "call" ? Math.max(S * dfQ - K * dfR, 0) : Math.max(K * dfR - S * dfQ, 0);
  }
  const [d1, d2] = d1d2(S, K, T, r, q, sigma);
  return type === "call"
    ? S * dfQ * normCdf(d1) - K * dfR * normCdf(d2)
    : K * dfR * normCdf(-d2) - S * dfQ * normCdf(-d1);
}

export function bsGreeks(type: OptionType, S: number, K: number, T: number, r: number, q: number, sigma: number): Greeks {
  if (T <= 0 || sigma <= 1e-12) {
    const itm = type === "call" ? S > K : S < K;
    return { ...ZERO_GREEKS, delta: T <= 0 && itm ? (type === "call" ? 1 : -1) : 0 };
  }
  const sq = Math.sqrt(T);
  const dfR = Math.exp(-r * T);
  const dfQ = Math.exp(-q * T);
  const [d1, d2] = d1d2(S, K, T, r, q, sigma);
  const pdf = normPdf(d1);
  const gamma = (dfQ * pdf) / (S * sigma * sq);
  const vegaRaw = S * dfQ * pdf * sq;
  const common = (-S * dfQ * pdf * sigma) / (2 * sq);
  const delta = type === "call" ? dfQ * normCdf(d1) : -dfQ * normCdf(-d1);
  const thetaYear =
    type === "call"
      ? common - r * K * dfR * normCdf(d2) + q * S * dfQ * normCdf(d1)
      : common + r * K * dfR * normCdf(-d2) - q * S * dfQ * normCdf(-d1);
  const rho = type === "call" ? K * T * dfR * normCdf(d2) : -K * T * dfR * normCdf(-d2);
  const vanna = (-dfQ * pdf * d2) / sigma;
  const volga = (vegaRaw * d1 * d2) / sigma;
  return {
    delta,
    gamma,
    vega: vegaRaw / 100,
    theta: thetaYear / 365,
    rho: rho / 100,
    vanna: vanna / 100,
    volga: volga / 10000,
  };
}

/** No-arbitrage bounds on a European option price. */
export function priceBounds(type: OptionType, S: number, K: number, T: number, r: number, q: number): [number, number] {
  const dfR = Math.exp(-r * T);
  const dfQ = Math.exp(-q * T);
  return type === "call"
    ? [Math.max(S * dfQ - K * dfR, 0), S * dfQ]
    : [Math.max(K * dfR - S * dfQ, 0), K * dfR];
}

/**
 * Implied volatility by safeguarded Newton-Raphson: Newton steps inside a shrinking
 * bisection bracket, so it converges even where vega is tiny. Returns NaN when the
 * price violates no-arbitrage bounds or the option has no time value to invert.
 */
export function impliedVol(
  type: OptionType, price: number, S: number, K: number, T: number, r: number, q: number,
): number {
  if (!(T > 0) || !(price > 0)) return NaN;
  const [lo0, hi0] = priceBounds(type, S, K, T, r, q);
  const eps = 1e-10;
  if (price < lo0 + eps || price > hi0 - eps) return NaN;
  let lo = 1e-6;
  let hi = 6;
  if (bsPrice(type, S, K, T, r, q, hi) < price) return NaN;
  // Brenner-Subrahmanyam starting guess, clamped into the bracket.
  let sigma = Math.min(hi, Math.max(lo, Math.sqrt((2 * Math.PI) / T) * (price / S)));
  for (let i = 0; i < 100; i++) {
    const diff = bsPrice(type, S, K, T, r, q, sigma) - price;
    if (Math.abs(diff) < 1e-12) return sigma;
    if (diff > 0) hi = sigma;
    else lo = sigma;
    const vega = bsGreeks(type, S, K, T, r, q, sigma).vega * 100;
    let next = vega > 1e-10 ? sigma - diff / vega : NaN;
    if (!(next > lo && next < hi)) next = 0.5 * (lo + hi);
    if (Math.abs(next - sigma) < 1e-12) return next;
    sigma = next;
  }
  return sigma;
}
