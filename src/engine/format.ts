const intFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** "34,200 SEK" — matches the design. Rounds to whole units. */
export function formatMoney(amount: number, currency = 'SEK', opts: { sign?: boolean } = {}): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const rounded = Math.round(safe);
  const body = intFormatter.format(Math.abs(rounded));
  const sign = rounded < 0 ? '-' : opts.sign && rounded > 0 ? '+' : '';
  return `${sign}${body} ${currency}`;
}

/** "34,200" without the currency code. */
export function formatAmount(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return intFormatter.format(Math.round(safe));
}

export function formatPercent(fraction: number, digits = 0): string {
  if (!Number.isFinite(fraction)) return '–';
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function formatMonths(months: number): string {
  if (!Number.isFinite(months)) return '∞';
  if (months >= 120) return '10+ years';
  if (months < 1) return `${months.toFixed(1)} months`;
  const rounded = Math.round(months * 10) / 10;
  return `${rounded} month${rounded === 1 ? '' : 's'}`;
}

/** "1 year, 4 months" style duration. */
export function formatDuration(months: number): string {
  if (!Number.isFinite(months)) return 'Never at this rate';
  if (months <= 0) return 'Reached';
  const whole = Math.ceil(months);
  const years = Math.floor(whole / 12);
  const rest = whole % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} year${years === 1 ? '' : 's'}`);
  if (rest > 0) parts.push(`${rest} month${rest === 1 ? '' : 's'}`);
  return parts.join(', ');
}

const monthYear = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });
const shortMonthYear = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' });
const dayMonthYear = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const shortMonth = new Intl.DateTimeFormat('en-GB', { month: 'short' });

export function formatMonthYear(date: Date): string {
  return monthYear.format(date);
}
export function formatShortMonthYear(date: Date): string {
  return shortMonthYear.format(date);
}
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return dayMonthYear.format(d);
}
export function formatShortMonth(date: Date): string {
  return shortMonth.format(date);
}

/** Compact "273.6k" for chart axes. */
export function formatCompact(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${Math.round(amount / 1_000)}K`;
  return `${Math.round(amount)}`;
}
