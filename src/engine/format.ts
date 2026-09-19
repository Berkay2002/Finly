import { locale, messages } from '@/i18n';

/** Intl formatters are costly to build, so keep one per locale and options. */
const cache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>();

function numberFormat(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `n|${locale()}|${JSON.stringify(options)}`;
  let f = cache.get(key) as Intl.NumberFormat | undefined;
  if (!f) cache.set(key, (f = new Intl.NumberFormat(locale(), options)));
  return f;
}

function dateFormat(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `d|${locale()}|${JSON.stringify(options)}`;
  let f = cache.get(key) as Intl.DateTimeFormat | undefined;
  if (!f) cache.set(key, (f = new Intl.DateTimeFormat(locale(), options)));
  return f;
}

const int = () => numberFormat({ maximumFractionDigits: 0 });

/** "34,200 SEK" in English, "34 200 SEK" in Swedish. Rounds to whole units. */
export function formatMoney(amount: number, currency = 'SEK', opts: { sign?: boolean } = {}): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const rounded = Math.round(safe);
  const body = int().format(Math.abs(rounded));
  const sign = rounded < 0 ? '-' : opts.sign && rounded > 0 ? '+' : '';
  return `${sign}${body} ${currency}`;
}

/** "300–900 SEK", collapsing to a single figure when the bounds round to the same number. */
export function formatMoneyRange(low: number, high: number, currency = 'SEK'): string {
  const a = Math.round(Number.isFinite(low) ? low : 0);
  const b = Math.round(Number.isFinite(high) ? high : 0);
  if (a === b) return formatMoney(a, currency);
  return `${int().format(Math.min(a, b))}–${int().format(Math.max(a, b))} ${currency}`;
}

/** "34,200" without the currency code. */
export function formatAmount(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return int().format(Math.round(safe));
}

/** A plain number with up to `digits` decimals in the current locale: "6.95" or "6,95". */
export function formatNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '–';
  return numberFormat({ maximumFractionDigits: digits }).format(value);
}

/** "12%" in English, "12 %" in Swedish. */
export function formatPercent(fraction: number, digits = 0): string {
  if (!Number.isFinite(fraction)) return '–';
  return numberFormat({ style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(fraction);
}

export function formatMonths(months: number): string {
  const t = messages().format;
  if (!Number.isFinite(months)) return '∞';
  if (months >= 120) return t.tenPlusYears;
  if (months < 1) return t.months(numberFormat({ minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(months), months);
  const rounded = Math.round(months * 10) / 10;
  return t.months(numberFormat({ maximumFractionDigits: 1 }).format(rounded), rounded);
}

/** "1 year, 4 months" style duration. */
export function formatDuration(months: number): string {
  const t = messages().format;
  if (!Number.isFinite(months)) return t.never;
  if (months <= 0) return t.reached;
  const whole = Math.ceil(months);
  const years = Math.floor(whole / 12);
  const rest = whole % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(t.years(years));
  if (rest > 0) parts.push(t.months(String(rest), rest));
  return parts.join(', ');
}

export function formatMonthYear(date: Date): string {
  return dateFormat({ month: 'long', year: 'numeric' }).format(date);
}
/** "January 2026" from a YYYY-MM key. */
export function formatMonthKey(key: string): string {
  const [y, m] = key.split('-').map(Number);
  if (!y || !m) return key;
  return formatMonthYear(new Date(y, m - 1, 1));
}
export function formatShortMonthYear(date: Date): string {
  return dateFormat({ month: 'short', year: 'numeric' }).format(date);
}
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return dateFormat({ day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}
/** "Tue 16 Sep", a day heading in a list. */
export function formatDayHeading(date: string): string {
  return dateFormat({ weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${date}T12:00:00`));
}
/** "14:32". */
export function formatTime(date: Date | number): string {
  return dateFormat({ hour: '2-digit', minute: '2-digit' }).format(date);
}
export function formatShortMonth(date: Date): string {
  return dateFormat({ month: 'short' }).format(date);
}

/** Compact "274K" for chart axes. */
export function formatCompact(amount: number): string {
  const t = messages().format;
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return `${formatNumber(amount / 1_000_000, 1)}${t.million}`;
  if (abs >= 1_000) return `${Math.round(amount / 1_000)}${t.thousand}`;
  return `${Math.round(amount)}`;
}
