import { useEffect, useMemo, useState } from "react";
import { ChainView } from "./components/ChainView";
import { Controls } from "./components/Controls";
import { StrategyLab } from "./components/StrategyLab";
import { SurfaceView } from "./components/SurfaceView";
import { DEFAULT_MARKET, DEFAULT_SURFACE, generateChain, type Market, type Quote, type SurfaceParams } from "./lib/chain";
import { buildPreset, newId, type Leg } from "./lib/strategy";

const TABS = [
  { id: "chain", label: "Chain" },
  { id: "strategy", label: "Strategy Lab" },
  { id: "surface", label: "Vol Surface" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const fromHash = (): TabId => {
  const h = window.location.hash.replace("#", "");
  return TABS.some((t) => t.id === h) ? (h as TabId) : "strategy";
};

export default function App() {
  const [tab, setTab] = useState<TabId>(fromHash);
  const [market, setMarket] = useState<Market>(DEFAULT_MARKET);
  const [surface, setSurface] = useState<SurfaceParams>(DEFAULT_SURFACE);
  const [seed, setSeed] = useState(7);
  const [expiryIdx, setExpiryIdx] = useState(2);
  const chain = useMemo(() => generateChain(market, surface, undefined, seed), [market, surface, seed]);
  const [legs, setLegs] = useState<Leg[]>(() => buildPreset("Iron Condor", generateChain(DEFAULT_MARKET, DEFAULT_SURFACE, undefined, 7), 2, DEFAULT_MARKET));
  const [toast, setToast] = useState("");

  useEffect(() => {
    const on = () => setTab(fromHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const go = (id: TabId) => { window.location.hash = id; setTab(id); };

  const addLeg = (q: Quote, side: 1 | -1) => {
    const leg: Leg = { id: newId(), kind: q.type, qty: side, strike: q.strike, days: q.days, entry: side > 0 ? q.ask : q.bid, iv: Number.isFinite(q.iv) ? q.iv : surface.atmVol };
    setLegs((prev) => [...prev, leg]);
    setToast(`${side > 0 ? "Bought" : "Sold"} ${q.days}d ${q.strike} ${q.type} at ${leg.entry.toFixed(2)}`);
  };

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1>Strike Lab</h1>
          <p>Options pricing, volatility surface and risk workbench</p>
        </div>
        <nav role="tablist" aria-label="Views" className="tabs">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} onClick={() => go(t.id)}>{t.label}</button>
          ))}
        </nav>
      </header>
      <div className="layout">
        <Controls market={market} setMarket={setMarket} surface={surface} setSurface={setSurface} seed={seed} setSeed={setSeed} />
        <main>
          {tab === "chain" && <ChainView chain={chain} expiryIdx={expiryIdx} setExpiryIdx={setExpiryIdx} market={market} onAdd={addLeg} legCount={legs.length} onOpenStrategy={() => go("strategy")} />}
          {tab === "strategy" && <StrategyLab legs={legs} setLegs={setLegs} chain={chain} expiryIdx={expiryIdx} market={market} surface={surface} />}
          {tab === "surface" && <SurfaceView chain={chain} market={market} surface={surface} />}
        </main>
      </div>
      <footer className="foot">
        All market data is synthetic. Pricing uses Black-Scholes-Merton with continuous dividend yield; implied vol uses a safeguarded Newton solver. Educational tool, not investment advice.
      </footer>
      <div className="toast" role="status" aria-live="polite">{toast}</div>
    </div>
  );
}
