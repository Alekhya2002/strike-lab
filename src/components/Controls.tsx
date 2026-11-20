import { DEFAULT_MARKET, DEFAULT_SURFACE, type Market, type SurfaceParams } from "../lib/chain";

interface SliderProps {
  id: string; label: string; value: number; min: number; max: number; step: number;
  fmt: (v: number) => string; onChange: (v: number) => void;
}

function Slider({ id, label, value, min, max, step, fmt, onChange }: SliderProps) {
  return (
    <div className="ctl col">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <output>{fmt(value)}</output>
    </div>
  );
}

interface Props {
  market: Market; setMarket: (m: Market) => void;
  surface: SurfaceParams; setSurface: (s: SurfaceParams) => void;
  seed: number; setSeed: (s: number) => void;
}

export function Controls({ market, setMarket, surface, setSurface, seed, setSeed }: Props) {
  const pctFmt = (d: number) => (v: number) => `${(v * 100).toFixed(d)}%`;
  return (
    <aside className="side" aria-label="Market controls">
      <h2>Market</h2>
      <p className="fine">Synthetic underlying, not live data.</p>
      <Slider id="spot" label="Spot price" value={market.S} min={50} max={900} step={1} fmt={(v) => v.toFixed(0)} onChange={(S) => setMarket({ ...market, S })} />
      <Slider id="rate" label="Risk-free rate" value={market.r} min={0} max={0.1} step={0.0025} fmt={pctFmt(2)} onChange={(r) => setMarket({ ...market, r })} />
      <Slider id="div" label="Dividend yield" value={market.q} min={0} max={0.06} step={0.0025} fmt={pctFmt(2)} onChange={(q) => setMarket({ ...market, q })} />
      <h2>Volatility surface</h2>
      <Slider id="atm" label="ATM vol (30d)" value={surface.atmVol} min={0.08} max={0.8} step={0.005} fmt={pctFmt(1)} onChange={(atmVol) => setSurface({ ...surface, atmVol })} />
      <Slider id="skew" label="Skew" value={surface.skew} min={-0.3} max={0.1} step={0.005} fmt={(v) => v.toFixed(3)} onChange={(skew) => setSurface({ ...surface, skew })} />
      <Slider id="cvx" label="Smile curvature" value={surface.convexity} min={0} max={0.12} step={0.0025} fmt={(v) => v.toFixed(3)} onChange={(convexity) => setSurface({ ...surface, convexity })} />
      <Slider id="term" label="Term slope" value={surface.termSlope} min={-0.15} max={0.15} step={0.005} fmt={(v) => v.toFixed(3)} onChange={(termSlope) => setSurface({ ...surface, termSlope })} />
      <div className="row">
        <button className="btn" onClick={() => setSeed(seed + 1)}>Reroll spreads and OI</button>
        <button className="btn ghost" onClick={() => { setMarket(DEFAULT_MARKET); setSurface(DEFAULT_SURFACE); }}>Reset</button>
      </div>
    </aside>
  );
}
