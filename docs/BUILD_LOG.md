# Build log

Notes on building this with an AI coding assistant: what I asked for, what broke, and how each problem was caught.

## Approach

1. Decided the scope and the numerical core first (pricing, Greeks, implied vol, chain, strategies, Monte Carlo) before any interface.
2. Had the assistant write the engine and the tests together, with tests that compare against independent references (finite differences, textbook values, closed-form spread results, Black-Scholes versus Monte Carlo).
3. Built the interface on top of the tested engine, then looked at real screenshots of every view and checked displayed numbers by hand.

## What went wrong

- **Tail precision of the normal CDF.** A test demanded absolute accuracy on N(−8) ≈ 6e-16. The approximation is accurate to about 1e-8 *relative* there, so the test was wrong, not the code. Switched to a relative check.
- **Seed test that could not fail.** The "different seed gives a different chain" test compared mid prices, which barely depend on the seed because spreads are symmetric around fair value. It also compared an ask to a mid, so it passed vacuously. Rewrote it on open interest at an at-the-money strike.
- **Histogram dropped the top edge (a real bug).** Simulated P&L equal to the upper bin edge fell outside every bin. For credit strategies most paths sit at max profit, so a large share of the distribution vanished. Found by a test that checked the histogram holds nearly all samples; fixed by assigning the top edge to the last bin.
- **Importer test used a valid price as the invalid case.** A 600-strike call at 60 is a legal no-arbitrage price, so no error was raised. Replaced it with a price below intrinsic value.
- **Unrealistic short-dated vol wings.** The first surface gave about 95% vol at 80% moneyness for 7-day options. Standardizing moneyness by √T blows up for short T; capped by flooring the standardizing horizon at 30 days.
- **Noisy smile tails.** Far out-of-the-money quotes priced at one cent made solved IV jump around. Excluded quotes under 10 cents from the smile.
- **Chart axis title overlapping tick labels.** Found only by looking at a screenshot; widened the left padding.

## Takeaways

Writing the verification before trusting the output caught the one real logic bug. Screenshots caught the problems tests cannot see, such as unrealistic data and overlapping labels.
