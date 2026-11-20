import { bsGreeks, impliedVol, type Greeks, type OptionType } from "./bs";
import type { Market } from "./chain";

export interface ImportedQuote {
  type: OptionType;
  strike: number;
  days: number;
  price: number;
  iv: number;
  greeks: Greeks | null;
}

export interface ImportResult {
  quotes: ImportedQuote[];
  errors: string[];
}

/**
 * Parse option quotes pasted as CSV: `type,strike,days,price` (header optional).
 * Computes implied vol and Greeks for each valid row; reports every bad row with its line number.
 */
export function analyzeQuotes(text: string, m: Market): ImportResult {
  const quotes: ImportedQuote[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const cells = line.split(/[,\t;]\s*/).map((c) => c.trim());
    if (i === 0 && /[a-z]/i.test(cells[1] ?? "") ) return; // header row
    if (cells.length < 4) { errors.push(`Line ${i + 1}: expected type,strike,days,price`); return; }
    const t = cells[0].toLowerCase();
    const type: OptionType | null = t.startsWith("c") ? "call" : t.startsWith("p") ? "put" : null;
    const [strike, days, price] = [Number(cells[1]), Number(cells[2]), Number(cells[3])];
    if (!type) { errors.push(`Line ${i + 1}: type must be call or put`); return; }
    if (![strike, days, price].every(Number.isFinite) || strike <= 0 || days <= 0 || price < 0) {
      errors.push(`Line ${i + 1}: strike, days and price must be positive numbers`);
      return;
    }
    const T = days / 365;
    const iv = impliedVol(type, price, m.S, strike, T, m.r, m.q);
    if (!Number.isFinite(iv)) errors.push(`Line ${i + 1}: price ${price} is outside no-arbitrage bounds, so no implied vol exists`);
    quotes.push({ type, strike, days, price, iv, greeks: Number.isFinite(iv) ? bsGreeks(type, m.S, strike, T, m.r, m.q, iv) : null });
  });
  return { quotes, errors };
}

export const SAMPLE_CSV = `type,strike,days,price
call,450,30,10.12
call,470,30,3.35
put,430,30,4.90
put,450,30,9.31
call,450,0,5
call,400,30,20`;
