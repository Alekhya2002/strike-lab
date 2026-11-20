# Strike Lab

An options analytics workbench that runs entirely in the browser. It prices options, solves implied volatility, builds a volatility surface, lets you assemble multi-leg strategies, and stress-tests them with a Monte Carlo risk engine.

All market data is **synthetic**: the option chain is generated from a parametric volatility surface, so you can reshape the market with sliders and watch every number respond.

## What it does

| View | Features |
| --- | --- |
| **Chain** | Full call/put chain across 7 expiries with bid, ask, implied vol, delta and open interest. Click a bid or ask to put that leg into a strategy. A quote analyzer takes pasted `type,strike,days,price` rows and returns implied vol and Greeks, flagging prices that break no-arbitrage bounds. |
| **Strategy Lab** | 10 presets (spreads, straddles, iron condor, butterfly, calendar, covered call) priced off the chain at the bid and ask. P&L curves at expiry, halfway and today, breakevens, max profit and loss, net Greeks, a price-by-time P&L heatmap, and a Monte Carlo risk panel (probability of profit, expected P&L, 95% VaR and CVaR, histogram). |
| **Vol Surface** | Implied-vol heatmap by moneyness and expiry, smiles recovered from the quotes by the solver, and the ATM term structure. |

## The engine (`src/lib`)

- `math.ts`: double-precision normal CDF (Hart's rational approximation), seeded PRNG, Box-Muller sampling, quantiles.
- `bs.ts`: Black-Scholes-Merton with dividend yield; delta, gamma, vega, theta, rho, vanna, volga; no-arbitrage price bounds; implied vol by Newton-Raphson inside a bisection bracket so it converges when vega is tiny.
- `chain.ts`: parametric surface (ATM level, term slope, skew, curvature), strike grid, spreads, open interest.
- `strategy.ts`: multi-leg positions repriced at any spot and date, breakeven root-finding, payoff summary, net Greeks, presets.
- `montecarlo.ts`: geometric Brownian motion with antithetic variates; distribution statistics.
- `csv.ts`: quote importer with per-line error reporting.

Details and formulas are in [docs/MODEL.md](docs/MODEL.md).

## Testing

`npm test` runs 26 tests that check the numerics against independent references rather than against themselves:

- normal CDF against known values; put-call parity with dividends
- a textbook Black-Scholes price (Hull)
- every Greek against central finite differences of the pricer
- implied vol round-trips over a grid of strikes, maturities and vols; rejection of arbitrage-violating prices
- vertical spread max profit, max loss and breakeven against closed-form results
- Monte Carlo mean against the Black-Scholes price within four standard errors
- deterministic output for a fixed seed

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test
npm run build      # static site in dist/
```

Requires Node 20 or newer. Deployed to GitHub Pages by the workflow in `.github/workflows/deploy.yml`.

## Limits

Black-Scholes assumes constant volatility, continuous trading and no jumps, and it prices European exercise. Real equity options are American and real tails are fatter, so the Monte Carlo risk numbers understate tail risk. This is an educational tool, not trading advice.

## Built with AI assistance

Written with an AI coding assistant driving the implementation and me directing the design, reviewing the math and checking the output against references. [docs/BUILD_LOG.md](docs/BUILD_LOG.md) records what went wrong along the way.
