// Money helpers. All arithmetic is done on integer minor units; decimal strings are parsed
// without floating point so "19.99" never becomes 1998 cents.

export const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "JPY", "CAD", "AUD", "NZD", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "MXN", "BRL", "THB", "SGD", "HKD", "KRW", "INR", "ZAR", "AED", "TRY", "ISK", "MAD"] as const;

const ZERO_DECIMAL = new Set(["JPY", "KRW", "HUF", "ISK"]);

export function currencyDigits(currency: string) {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? 0 : 2;
}

export function isValidCurrency(c: string) {
  return /^[A-Z]{3}$/.test(c);
}

/** Parses a user-entered decimal amount ("12", "12.5", "1,234.56", "12,50") into minor units. */
export function parseMoney(input: string, currency: string): number | null {
  let s = String(input).trim().replace(/\s/g, "");
  if (!s) return null;
  // Accept a single comma as a decimal separator when there is no dot ("12,50").
  if (!s.includes(".") && /^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  else s = s.replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const digits = currencyDigits(currency);
  const [whole, frac = ""] = s.split(".");
  if (frac.length > digits) return null;
  const minor = Number(whole) * 10 ** digits + Number((frac + "0".repeat(digits)).slice(0, digits) || "0");
  if (!Number.isSafeInteger(minor)) return null;
  return minor;
}

export function minorToDecimalString(minor: number, currency: string) {
  const digits = currencyDigits(currency);
  const neg = minor < 0;
  const abs = Math.abs(minor);
  if (digits === 0) return `${neg ? "-" : ""}${abs}`;
  const s = String(abs).padStart(digits + 1, "0");
  return `${neg ? "-" : ""}${s.slice(0, -digits)}.${s.slice(-digits)}`;
}

export function formatMoney(minor: number | null | undefined, currency: string, opts: { approx?: boolean } = {}) {
  if (minor === null || minor === undefined) return "—";
  const digits = currencyDigits(currency);
  const value = Number(minorToDecimalString(minor, currency));
  let out: string;
  try {
    out = new Intl.NumberFormat("en", { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  } catch {
    out = `${minorToDecimalString(minor, currency)} ${currency}`;
  }
  return opts.approx ? `≈ ${out}` : out;
}

/**
 * Splits `total` into integer parts proportional to `weights` using the largest-remainder method.
 * The parts always sum exactly to `total`; ties are resolved by input order (deterministic).
 */
export function allocate(total: number, weights: number[]): number[] {
  if (!Number.isInteger(total)) throw new Error("total must be an integer");
  if (weights.length === 0) throw new Error("no weights");
  if (weights.some((w) => !Number.isInteger(w) || w < 0)) throw new Error("weights must be non-negative integers");
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) throw new Error("weights sum to zero");
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const base = weights.map((w) => Math.floor((abs * w) / sum));
  let remainder = abs - base.reduce((a, b) => a + b, 0);
  const order = weights
    .map((w, i) => ({ i, rem: (abs * w) % sum }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (let k = 0; remainder > 0; k = (k + 1) % order.length, remainder--) base[order[k].i] += 1;
  return base.map((v) => v * sign);
}

/** Multiplies minor units by a decimal-string rate with half-up rounding, avoiding float drift. */
export function convertMinor(minor: number, fromCurrency: string, toCurrency: string, rate: string): number {
  if (!/^\d+(\.\d{1,10})?$/.test(rate)) throw new Error("Invalid rate");
  const [w, f = ""] = rate.split(".");
  const scale = 10n ** BigInt(f.length);
  const rateInt = BigInt(w) * scale + BigInt(f || "0");
  const digitShift = currencyDigits(toCurrency) - currencyDigits(fromCurrency);
  let num = BigInt(minor) * rateInt;
  let den = scale;
  if (digitShift > 0) num *= 10n ** BigInt(digitShift);
  else if (digitShift < 0) den *= 10n ** BigInt(-digitShift);
  const neg = num < 0n;
  const absNum = neg ? -num : num;
  const q = (absNum * 2n + den) / (den * 2n);
  return Number(neg ? -q : q);
}
