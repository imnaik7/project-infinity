import type { Currency } from '../services/pi';

/** Money in a record's currency: ₹4,50,000 · $12,400 · €9,800 (Indian grouping for INR). */
export function money(amount: number, currency?: Currency, decimals = 0): string {
  const code = currency?.code ?? 'INR';
  const locale = code === 'INR' ? 'en-IN' : code === 'EUR' ? 'de-DE' : 'en-US';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: code, minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(amount || 0);
  } catch {
    return `${currency?.symbol ?? '₹'}${(amount || 0).toFixed(decimals)}`;
  }
}

/** Compact: ₹4.5L · ₹1.2Cr · $12.4K */
export function compact(amount: number, currency?: Currency): string {
  const code = currency?.code ?? 'INR';
  const sym = currency?.symbol ?? '₹';
  const a = Math.abs(amount);
  if (code === 'INR') {
    if (a >= 1e7) return `${sym}${(amount / 1e7).toFixed(1)}Cr`;
    if (a >= 1e5) return `${sym}${(amount / 1e5).toFixed(1)}L`;
    if (a >= 1e3) return `${sym}${(amount / 1e3).toFixed(1)}K`;
    return `${sym}${Math.round(amount)}`;
  }
  if (a >= 1e6) return `${sym}${(amount / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${sym}${(amount / 1e3).toFixed(1)}K`;
  return `${sym}${Math.round(amount)}`;
}

/** Convert an amount from a currency to INR base (exchange rate = units per 1 INR). */
export const toBase = (amount: number, currency?: Currency) => (currency && currency.rate > 0 ? amount / currency.rate : amount);

export function fmtDate(iso?: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', opts);
}

export const fmtShort = (iso?: string) => fmtDate(iso, { day: 'numeric', month: 'short' });

export function relative(iso: string | undefined, now: number): string {
  if (!iso) return '';
  const diff = (new Date(iso).getTime() - now) / 86_400_000;
  const days = Math.round(diff);
  if (Math.abs(diff) < 1 / 24) return 'just now';
  if (Math.abs(diff) < 1) {
    const h = Math.round(Math.abs(diff) * 24);
    return diff < 0 ? `${h}h ago` : `in ${h}h`;
  }
  if (days === 0) return 'today';
  if (days === -1) return 'yesterday';
  if (days === 1) return 'tomorrow';
  return days < 0 ? `${-days}d ago` : `in ${days}d`;
}

// ---------- weeks ----------
export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const parseDay = (iso: string) => new Date(`${iso}T00:00:00`);
export const weekDays = (mondayIso: string) => Array.from({ length: 7 }, (_, i) => isoDay(addDays(parseDay(mondayIso), i)));

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');

export const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
