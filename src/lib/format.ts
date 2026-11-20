export const usd = (v: number, digits = 0): string => {
  if (!Number.isFinite(v)) return "n/a";
  const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${v < 0 ? "-" : ""}$${s}`;
};
export const pct = (v: number, digits = 1): string => (Number.isFinite(v) ? `${(v * 100).toFixed(digits)}%` : "—");
export const num = (v: number, digits = 2): string => (Number.isFinite(v) ? v.toFixed(digits) : "—");
export const signed = (v: number, digits = 2): string => (Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${v.toFixed(digits)}` : "—");
