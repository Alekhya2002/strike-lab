import { useMemo, useState } from "react";
import type { ChainExpiry, Market, Quote } from "../lib/chain";
import { analyzeQuotes, SAMPLE_CSV } from "../lib/csv";
import { num, pct, signed } from "../lib/format";

interface Props {
  chain: ChainExpiry[];
  expiryIdx: number;
  setExpiryIdx: (i: number) => void;
  market: Market;
  onAdd: (q: Quote, side: 1 | -1) => void;
  legCount: number;
  onOpenStrategy: () => void;
}

export function ChainView({ chain, expiryIdx, setExpiryIdx, market, onAdd, legCount, onOpenStrategy }: Props) {
  const e = chain[expiryIdx];
  const atmStrike = useMemo(() => e.rows.reduce((b, r) => (Math.abs(r.strike - market.S) < Math.abs(b - market.S) ? r.strike : b), e.rows[0].strike), [e, market.S]);

  const cell = (q: Quote, side: "bid" | "ask") => (
    <button className={`px ${side}`} onClick={() => onAdd(q, side === "ask" ? 1 : -1)}
      title={side === "ask" ? `Buy 1 ${q.type} ${q.strike} at ${q.ask.toFixed(2)}` : `Sell 1 ${q.type} ${q.strike} at ${q.bid.toFixed(2)}`}>
      {q[side].toFixed(2)}
    </button>
  );

  return (
    <div className="stack">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Option chain</h2>
            <p className="sub">Synthetic quotes generated from the volatility surface. Click a bid to sell or an ask to buy; the leg goes to the Strategy Lab at that price.</p>
          </div>
          <button className="btn primary" onClick={onOpenStrategy}>Strategy Lab ({legCount} {legCount === 1 ? "leg" : "legs"})</button>
        </div>
        <div className="chips" role="tablist" aria-label="Expiry">
          {chain.map((c, i) => (
            <button key={c.days} role="tab" aria-selected={i === expiryIdx} className={`chip ${i === expiryIdx ? "on" : ""}`} onClick={() => setExpiryIdx(i)}>
              {c.days}d
            </button>
          ))}
          <span className="meta">Forward {e.forward.toFixed(2)} · {e.rows.length} strikes</span>
        </div>
        <div className="scroll">
          <table className="chain">
            <thead>
              <tr>
                <th colSpan={5} className="callh">Calls</th><th />
                <th colSpan={5} className="puth">Puts</th>
              </tr>
              <tr>
                <th>OI</th><th>Delta</th><th>IV</th><th>Bid</th><th>Ask</th>
                <th className="k">Strike</th>
                <th>Bid</th><th>Ask</th><th>IV</th><th>Delta</th><th>OI</th>
              </tr>
            </thead>
            <tbody>
              {e.rows.map((r) => (
                <tr key={r.strike} className={r.strike === atmStrike ? "atm" : ""}>
                  <td className={r.strike < market.S ? "itm" : ""}>{r.call.openInterest.toLocaleString()}</td>
                  <td className={r.strike < market.S ? "itm" : ""}>{num(r.call.greeks.delta)}</td>
                  <td className={r.strike < market.S ? "itm" : ""}>{pct(r.call.iv)}</td>
                  <td className={r.strike < market.S ? "itm" : ""}>{cell(r.call, "bid")}</td>
                  <td className={r.strike < market.S ? "itm" : ""}>{cell(r.call, "ask")}</td>
                  <th className="k">{r.strike}</th>
                  <td className={r.strike > market.S ? "itm" : ""}>{cell(r.put, "bid")}</td>
                  <td className={r.strike > market.S ? "itm" : ""}>{cell(r.put, "ask")}</td>
                  <td className={r.strike > market.S ? "itm" : ""}>{pct(r.put.iv)}</td>
                  <td className={r.strike > market.S ? "itm" : ""}>{num(r.put.greeks.delta)}</td>
                  <td className={r.strike > market.S ? "itm" : ""}>{r.put.openInterest.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <QuoteAnalyzer market={market} />
    </div>
  );
}

function QuoteAnalyzer({ market }: { market: Market }) {
  const [text, setText] = useState(SAMPLE_CSV);
  const result = useMemo(() => analyzeQuotes(text, market), [text, market]);
  return (
    <div className="panel">
      <h2>Quote analyzer</h2>
      <p className="sub">Paste your own option prices as <code>type,strike,days,price</code>. The solver backs out implied vol and Greeks using the spot, rate and dividend yield from the sidebar, and flags any price that violates no-arbitrage bounds.</p>
      <label htmlFor="csv" className="lbl">Quotes</label>
      <textarea id="csv" value={text} onChange={(ev) => setText(ev.target.value)} spellCheck={false} rows={7} />
      {result.errors.length > 0 && (
        <ul className="errors" role="alert">{result.errors.map((er) => <li key={er}>{er}</li>)}</ul>
      )}
      {result.quotes.length > 0 && (
        <div className="scroll">
          <table className="plain">
            <thead><tr><th>Type</th><th>Strike</th><th>Days</th><th>Price</th><th>IV</th><th>Delta</th><th>Gamma</th><th>Vega</th><th>Theta/day</th></tr></thead>
            <tbody>
              {result.quotes.map((q, i) => (
                <tr key={i}>
                  <td>{q.type}</td><td>{q.strike}</td><td>{q.days}</td><td>{q.price.toFixed(2)}</td>
                  <td>{pct(q.iv)}</td>
                  <td>{q.greeks ? signed(q.greeks.delta, 3) : "—"}</td>
                  <td>{q.greeks ? q.greeks.gamma.toFixed(4) : "—"}</td>
                  <td>{q.greeks ? q.greeks.vega.toFixed(3) : "—"}</td>
                  <td>{q.greeks ? signed(q.greeks.theta, 3) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
