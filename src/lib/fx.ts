import { addMonths, format, startOfMonth } from 'date-fns';
import { monthlyRates, type FxRates } from '@/engine/fx';

/** What Frankfurter has rates for, the Nordic and most used ones first. */
export const FX_CURRENCIES = ['SEK', 'EUR', 'USD', 'DKK', 'NOK', 'GBP', 'CHF', 'PLN', 'ISK', 'AUD', 'BRL', 'CAD', 'CNY', 'CZK', 'HKD', 'HUF', 'IDR', 'ILS', 'INR', 'JPY', 'KRW', 'MXN', 'MYR', 'NZD', 'PHP', 'RON', 'SGD', 'THB', 'TRY', 'ZAR'];

/** Frankfurter serves the ECB's daily reference rates: free, no key, CORS open, so the browser calls it directly. */
const API = 'https://api.frankfurter.dev/v1';

/**
 * Monthly rates per EUR for `currencies` over the last 13 months (as far back as months are closed), or null
 * when offline or the service is down: the plan then keeps the rates it has.
 */
export async function fetchFx(currencies: string[], today = new Date(), fetcher: typeof fetch = fetch): Promise<FxRates | null> {
  const symbols = currencies.filter((c) => /^[A-Z]{3}$/.test(c) && c !== 'EUR');
  if (!symbols.length) return null;
  const from = format(addMonths(startOfMonth(today), -12), 'yyyy-MM-dd');
  try {
    const res = await fetcher(`${API}/${from}..?symbols=${symbols.join(',')}`, { headers: { accept: 'application/json' } });
    const json = res.ok ? ((await res.json()) as { rates?: unknown }) : null;
    if (!json?.rates || typeof json.rates !== 'object') return null;
    return monthlyRates(json.rates as Record<string, Record<string, number>>, format(today, 'yyyy-MM'));
  } catch {
    return null;
  }
}
