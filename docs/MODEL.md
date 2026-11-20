# Model notes

Notation: spot S, strike K, maturity T in years, rate r, dividend yield q, volatility σ.

## Pricing

d1 = [ln(S/K) + (r − q + σ²/2)T] / (σ√T), d2 = d1 − σ√T

Call = S e^(−qT) N(d1) − K e^(−rT) N(d2)
Put  = K e^(−rT) N(−d2) − S e^(−qT) N(−d1)

At T ≤ 0 the price is intrinsic value. At σ ≈ 0 it is the discounted forward intrinsic value.

## Greeks (as reported)

| Greek | Definition | Unit |
| --- | --- | --- |
| Delta | ∂V/∂S | per $1 |
| Gamma | ∂²V/∂S² | delta per $1 |
| Vega | ∂V/∂σ | per 1 vol point |
| Theta | −∂V/∂T | per calendar day |
| Rho | ∂V/∂r | per 1 rate point |
| Vanna | ∂²V/∂S∂σ | delta per 1 vol point |
| Volga | ∂²V/∂σ² | vega per 1 vol point |

## Implied volatility

Find σ with BS(σ) = price. The solver keeps a bracket [1e-6, 6], takes a Newton step, and falls back to bisection whenever the step leaves the bracket. It returns NaN when the price is below intrinsic, above the upper bound (S e^(−qT) for calls, K e^(−rT) for puts), or has no recoverable time value.

## Volatility surface

With forward F = S e^((r−q)T) and ATM level a(T) = atmVol + termSlope(√T − √(30/365)):

x = ln(K/F) / (a · √max(T, 30/365))
σ(K, T) = a · (1 + skew · x + convexity · x²), floored at 3%

The 30-day floor on the standardizing horizon stops short expiries from producing unrealistic wings. A negative skew gives the equity-style pattern of richer downside puts.

## Strategy P&L

P&L = Σ qty · 100 · (value_now − entry). Each option leg is repriced with Black-Scholes at its remaining life using the implied vol locked in at entry plus an optional parallel shift. Legs past expiry settle at intrinsic value, so calendar spreads work. Breakevens are found by sampling the curve for sign changes and refining each by bisection.

## Monte Carlo

S_T = S · exp[(μ − σ²/2)T + σ√T · Z] with antithetic pairs (Z, −Z). μ = r − q is the risk-neutral drift; a custom drift gives a real-world view. Reported: probability of profit, mean, standard deviation, 95% VaR (5th percentile), 95% CVaR (mean of the worst 5%).

Setting realized vol below the implied level shows how short-premium strategies earn the variance risk premium, and above it shows long-volatility strategies winning.
