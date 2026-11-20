import { describe, expect, it } from "vitest";
import { normCdf, normPdf, mulberry32, niceTicks } from "../lib/math";
import { bsGreeks, bsPrice, impliedVol, priceBounds } from "../lib/bs";
import { DEFAULT_MARKET, DEFAULT_SURFACE, generateChain, surfaceVol, smilePoints } from "../lib/chain";
import { buildPreset, findRoots, netCost, netGreeks, PRESETS, strategyPnL, summarize, type Leg } from "../lib/strategy";
import { simulate } from "../lib/montecarlo";
import { analyzeQuotes } from "../lib/csv";

const m = DEFAULT_MARKET;

describe("normal distribution", () => {
  it("matches known CDF values to 1e-12", () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 14);
    expect(normCdf(1.96)).toBeCloseTo(0.9750021048517795, 12);
    expect(normCdf(-1)).toBeCloseTo(0.15865525393145707, 12);
    expect(Math.abs(normCdf(-8) / 6.220960574271786e-16 - 1)).toBeLessThan(1e-7);
  });
  it("is symmetric and is the integral of the PDF", () => {
    for (const x of [0.3, 1.1, 2.7]) expect(normCdf(x) + normCdf(-x)).toBeCloseTo(1, 14);
    const h = 1e-5;
    expect((normCdf(0.8 + h) - normCdf(0.8 - h)) / (2 * h)).toBeCloseTo(normPdf(0.8), 8);
  });
});

describe("Black-Scholes pricing", () => {
  it("reproduces the textbook value (Hull, S=42 K=40 r=10% sigma=20% T=0.5)", () => {
    expect(bsPrice("call", 42, 40, 0.5, 0.1, 0, 0.2)).toBeCloseTo(4.759, 3);
    expect(bsPrice("put", 42, 40, 0.5, 0.1, 0, 0.2)).toBeCloseTo(0.8086, 3);
  });
  it("satisfies put-call parity with dividends", () => {
    for (const K of [380, 450, 520]) {
      const c = bsPrice("call", m.S, K, 0.4, m.r, m.q, 0.27);
      const p = bsPrice("put", m.S, K, 0.4, m.r, m.q, 0.27);
      expect(c - p).toBeCloseTo(m.S * Math.exp(-m.q * 0.4) - K * Math.exp(-m.r * 0.4), 10);
    }
  });
  it("returns intrinsic value at expiry", () => {
    expect(bsPrice("call", 110, 100, 0, 0.05, 0, 0.3)).toBe(10);
    expect(bsPrice("put", 110, 100, 0, 0.05, 0, 0.3)).toBe(0);
  });
});

describe("Greeks", () => {
  const args = ["call", 450, 460, 0.25, 0.045, 0.012, 0.23] as const;
  const price = (S: number, T: number, sig: number, r = 0.045) => bsPrice("call", S, 460, T, r, 0.012, sig);
  it("delta and gamma agree with finite differences", () => {
    const g = bsGreeks(...args);
    const h = 0.01;
    expect(g.delta).toBeCloseTo((price(450 + h, 0.25, 0.23) - price(450 - h, 0.25, 0.23)) / (2 * h), 6);
    expect(g.gamma).toBeCloseTo((price(450 + h, 0.25, 0.23) - 2 * price(450, 0.25, 0.23) + price(450 - h, 0.25, 0.23)) / (h * h), 5);
  });
  it("vega, theta and rho agree with finite differences", () => {
    const g = bsGreeks(...args);
    expect(g.vega).toBeCloseTo((price(450, 0.25, 0.2301) - price(450, 0.25, 0.2299)) / 0.0002 / 100, 6);
    expect(g.theta).toBeCloseTo(-(price(450, 0.25 + 1e-4, 0.23) - price(450, 0.25 - 1e-4, 0.23)) / 2e-4 / 365, 5);
    expect(g.rho).toBeCloseTo((price(450, 0.25, 0.23, 0.0451) - price(450, 0.25, 0.23, 0.0449)) / 0.0002 / 100, 6);
  });
  it("vanna is d(delta)/d(vol)", () => {
    const g = bsGreeks(...args);
    const d = (sig: number) => bsGreeks("call", 450, 460, 0.25, 0.045, 0.012, sig).delta;
    expect(g.vanna).toBeCloseTo((d(0.2301) - d(0.2299)) / 0.0002 / 100, 6);
  });
  it("call delta minus put delta equals the dividend discount factor", () => {
    const c = bsGreeks("call", 450, 460, 0.25, 0.045, 0.012, 0.23).delta;
    const p = bsGreeks("put", 450, 460, 0.25, 0.045, 0.012, 0.23).delta;
    expect(c - p).toBeCloseTo(Math.exp(-0.012 * 0.25), 12);
  });
});

describe("implied volatility", () => {
  it("round-trips across the strike and maturity grid", () => {
    for (const type of ["call", "put"] as const)
      for (const K of [300, 400, 450, 500, 600])
        for (const T of [3 / 365, 0.1, 0.5, 2])
          for (const sig of [0.08, 0.2, 0.55, 1.4]) {
            const px = bsPrice(type, m.S, K, T, m.r, m.q, sig);
            const [lo] = priceBounds(type, m.S, K, T, m.r, m.q);
            if (px - lo < 1e-6 || px < 1e-6) continue; // no recoverable time value
            const iv = impliedVol(type, px, m.S, K, T, m.r, m.q);
            expect(Math.abs(bsPrice(type, m.S, K, T, m.r, m.q, iv) - px)).toBeLessThan(1e-8);
          }
  });
  it("rejects prices outside no-arbitrage bounds", () => {
    expect(impliedVol("call", 5, 450, 400, 0.25, 0.045, 0.012)).toBeNaN(); // below intrinsic
    expect(impliedVol("call", 460, 450, 400, 0.25, 0.045, 0.012)).toBeNaN(); // above spot
    expect(impliedVol("put", 10, 450, 440, 0, 0.045, 0.012)).toBeNaN();
  });
});

describe("synthetic chain and surface", () => {
  const chain = generateChain(m, DEFAULT_SURFACE);
  it("is deterministic for a given seed", () => {
    expect(generateChain(m, DEFAULT_SURFACE)[2].rows[20].call.openInterest).toBe(chain[2].rows[20].call.openInterest);
    expect(generateChain(m, DEFAULT_SURFACE, undefined, 99)[2].rows[20].call.openInterest).not.toBe(chain[2].rows[20].call.openInterest);
  });
  it("has bid <= mid <= ask and a recovered smile close to the generating surface", () => {
    const e = chain[2];
    for (const r of e.rows) {
      expect(r.call.bid).toBeLessThanOrEqual(r.call.ask);
      expect(r.put.bid).toBeLessThanOrEqual(r.put.ask);
    }
    for (const p of smilePoints(e)) {
      if (Math.abs(p.strike - m.S) / m.S < 0.1) expect(Math.abs(p.iv - surfaceVol(DEFAULT_SURFACE, m, p.strike, e.T))).toBeLessThan(0.01);
    }
  });
  it("shows equity-style skew: low-strike IV above high-strike IV", () => {
    expect(surfaceVol(DEFAULT_SURFACE, m, 400, 0.25)).toBeGreaterThan(surfaceVol(DEFAULT_SURFACE, m, 500, 0.25));
  });
});

describe("strategies", () => {
  const chain = generateChain(m, DEFAULT_SURFACE);
  it("builds every preset with finite entries", () => {
    for (const name of PRESETS) {
      const legs = buildPreset(name, chain, 2, m);
      expect(legs.length).toBeGreaterThan(0);
      for (const l of legs) expect(Number.isFinite(l.entry)).toBe(true);
    }
  });
  it("vertical spread has capped profit and loss, and breakeven = long strike + debit", () => {
    const legs = buildPreset("Bull Call Spread", chain, 2, m);
    const s = summarize(legs, m, legs[0].days);
    const width = legs[1].strike - legs[0].strike;
    const debit = netCost(legs) / 100;
    expect(s.unlimitedProfit || s.unlimitedLoss).toBe(false);
    expect(s.maxProfit).toBeCloseTo((width - debit) * 100, 0);
    expect(s.maxLoss).toBeCloseTo(-debit * 100, 0);
    expect(s.breakevens).toHaveLength(1);
    expect(s.breakevens[0]).toBeCloseTo(legs[0].strike + debit, 1);
  });
  it("naked long call has unlimited upside and bounded loss; short call is the mirror", () => {
    const long = buildPreset("Long Call", chain, 2, m);
    const a = summarize(long, m, long[0].days);
    expect(a.unlimitedProfit).toBe(true);
    expect(a.maxLoss).toBeCloseTo(-long[0].entry * 100, 0);
    const short = [{ ...long[0], qty: -1 }];
    expect(summarize(short, m, short[0].days).unlimitedLoss).toBe(true);
  });
  it("straddle has two breakevens and iron condor is net credit with two breakevens", () => {
    const st = buildPreset("Long Straddle", chain, 2, m);
    expect(summarize(st, m, st[0].days).breakevens).toHaveLength(2);
    const ic = buildPreset("Iron Condor", chain, 2, m);
    expect(netCost(ic)).toBeLessThan(0);
    expect(summarize(ic, m, ic[0].days).breakevens).toHaveLength(2);
  });
  it("net delta of a covered call is below 100 and P&L at entry spot is zero or small before decay", () => {
    const cc = buildPreset("Covered Call", chain, 2, m);
    const d = netGreeks(cc, m).delta;
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(100);
    expect(Math.abs(strategyPnL(cc, m.S, 0, m))).toBeLessThan(150);
  });
  it("findRoots locates simple roots", () => {
    const r = findRoots((x) => x * x - 4, -5, 5);
    expect(r).toHaveLength(2);
    expect(r[0]).toBeCloseTo(-2, 9);
    expect(r[1]).toBeCloseTo(2, 9);
  });
});

describe("Monte Carlo", () => {
  it("under the risk-neutral measure, expected option value matches Black-Scholes", () => {
    const sigma = 0.25, K = 450, days = 90;
    const fair = bsPrice("call", m.S, K, days / 365, m.r, m.q, sigma);
    const leg: Leg = { id: "x", kind: "call", qty: 1, strike: K, days, entry: fair, iv: sigma };
    const r = simulate([leg], m, { horizonDays: days, realVol: sigma, drift: m.r - m.q, paths: 200000, seed: 11 });
    // Expected P&L at expiry is the future value of zero, discounted: E[payoff] = fair * e^{rT}
    const target = fair * Math.exp(m.r * days / 365) - fair;
    const se = r.stdev / Math.sqrt(r.samples);
    expect(Math.abs(r.mean - target * 100)).toBeLessThan(4 * se); // dollars per contract, 4 standard errors
  });
  it("is reproducible and orders its risk measures", () => {
    const chain = generateChain(m, DEFAULT_SURFACE);
    const legs = buildPreset("Iron Condor", chain, 2, m);
    const o = { horizonDays: legs[0].days, realVol: 0.2, drift: 0.05, paths: 20000, seed: 3 };
    const a = simulate(legs, m, o), b = simulate(legs, m, o);
    expect(a.mean).toBe(b.mean);
    expect(a.worst).toBeLessThanOrEqual(a.cvar95);
    expect(a.cvar95).toBeLessThanOrEqual(a.var95);
    expect(a.var95).toBeLessThanOrEqual(a.best);
    expect(a.pop).toBeGreaterThan(0);
    expect(a.pop).toBeLessThan(1);
    expect(a.histogram.reduce((s, h) => s + h.count, 0)).toBeGreaterThan(a.samples * 0.98);
  });
  it("a credit spread wins more often than a long straddle when realised vol is below implied", () => {
    const chain = generateChain(m, DEFAULT_SURFACE);
    const ic = buildPreset("Iron Condor", chain, 2, m);
    const st = buildPreset("Long Straddle", chain, 2, m);
    const o = { horizonDays: ic[0].days, realVol: 0.12, drift: 0.0, paths: 20000, seed: 5 };
    expect(simulate(ic, m, o).pop).toBeGreaterThan(simulate(st, m, o).pop);
  });
});

describe("quote importer", () => {
  it("computes IV and Greeks and reports bad rows", () => {
    const r = analyzeQuotes("type,strike,days,price\ncall,450,30,10.12\nput,430,30,x\ncall,400,30,20\nfoo", m);
    expect(r.quotes[0].iv).toBeGreaterThan(0.1);
    expect(r.quotes[0].greeks?.delta).toBeGreaterThan(0);
    expect(r.errors.length).toBe(3);
    expect(r.errors.join("|")).toContain("no-arbitrage");
  });
});

describe("utilities", () => {
  it("PRNG is seedable and uniform-ish", () => {
    const a = mulberry32(1), b = mulberry32(1);
    expect(a()).toBe(b());
    const r = mulberry32(9);
    let s = 0;
    for (let i = 0; i < 20000; i++) s += r();
    expect(s / 20000).toBeCloseTo(0.5, 1);
  });
  it("niceTicks covers the range with round steps", () => {
    const t = niceTicks(-130, 870, 5);
    expect(t[0]).toBeGreaterThanOrEqual(-130);
    expect(t[t.length - 1]).toBeLessThanOrEqual(870);
    expect(t.includes(0)).toBe(true);
  });
});
