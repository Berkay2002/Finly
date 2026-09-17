/**
 * Prices for holdings on ISK, KF and AF accounts. Nearly every Swede holds through Avanza or Nordnet,
 * so their public web endpoints are the sources: Avanza for stocks, ETFs and funds, Nordnet for the
 * funds Avanza does not list (Nordnet's own index funds). Yahoo Finance is the backup, found by ISIN.
 * All three are unofficial and need a server-side hop (CORS).
 *
 *   GET /api/quotes?q=investor
 *     → [{ orderbookId, name, type, currency, price }]
 *   GET /api/quotes?i=5247:SE0015811963:SEK&i=3323::USD&to=SEK
 *     → { quotes: { 5247: { price, isin } }, fx: { SEK: 1, USD: 9.83 } }
 *
 * Each `i` is id : ISIN (optional) : the holding's currency. Ids are Avanza orderbook ids, or `nn` + a
 * Nordnet instrument id. Quotes come back in that currency
 * (the Yahoo backup may list the instrument elsewhere, so it is converted), `fx` turns each into `to`.
 * Ids that fail are left out; the app keeps their last price.
 *
 * Kept free of imports so Vercel can run it as-is; tested in src/lib/__tests__/quotes.test.ts.
 */

const AVANZA = 'https://www.avanza.se/_api';
const NORDNET = 'https://public.nordnet.se/api/2';
/** Nordnet's web app identifies itself this way; without it the API answers 401. */
const NORDNET_HEADERS = { 'client-id': 'NEXT' };
const YAHOO_SEARCH = 'https://query2.finance.yahoo.com/v1/finance/search';
const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart';
const HEADERS = { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (compatible; Finly)' };

/** Currency pairs are orderbooks on Avanza too (XXX/SEK). Others go straight to Yahoo. */
const AVANZA_FX: Record<string, string> = { USD: '19000', EUR: '18998', NOK: '53293', DKK: '53292', GBP: '108703' };
const TYPES: Record<string, string> = { STOCK: 'stock', EXCHANGE_TRADED_FUND: 'etf', FUND: 'fund', CERTIFICATE: 'certificate' };

const CACHE_SEARCH = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800';
const CACHE_QUOTES = 'public, max-age=300, s-maxage=900, stale-while-revalidate=3600';
const CACHE_FAIL = 'public, max-age=60, s-maxage=120';

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
interface Price {
  price: number;
  currency: string;
  isin?: string;
}
export interface Instrument {
  orderbookId: string;
  name: string;
  type: string;
  currency: string;
  price?: number;
}

/** A number from Avanza's search, written the Swedish way: "1 292,76", "−0,17". */
export function parseNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const n = Number(value.replace(/[\s\u00a0\u202f]/g, '').replace('\u2212', '-').replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

/** London quotes in pence. */
function inMajorUnits(p: { price: number; currency: string }) {
  return p.currency === 'GBX' || p.currency === 'GBp' ? { ...p, price: p.price / 100, currency: 'GBP' } : p;
}

async function json(fetcher: Fetcher, url: string, init?: RequestInit): Promise<any> {
  const res = await fetcher(url, { ...init, headers: { ...HEADERS, ...init?.headers } });
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
  return res.json();
}

/** Avanza's matches, then Nordnet funds Avanza did not find (by name). Either source may be down, not both. */
export async function searchInstruments(q: string, fetcher: Fetcher = fetch): Promise<Instrument[]> {
  const [avanza, nordnet] = await Promise.allSettled([searchAvanza(q, fetcher), searchNordnetFunds(q, fetcher)]);
  if (avanza.status === 'rejected' && nordnet.status === 'rejected') throw avanza.reason;
  const found = avanza.status === 'fulfilled' ? avanza.value : [];
  const names = new Set(found.map((f) => f.name.toLowerCase()));
  const extra = nordnet.status === 'fulfilled' ? nordnet.value.filter((f) => !names.has(f.name.toLowerCase())) : [];
  return [...found, ...extra].slice(0, 10);
}

async function searchAvanza(q: string, fetcher: Fetcher): Promise<Instrument[]> {
  const body = { query: q, searchFilter: { types: [] }, pagination: { from: 0, size: 20 } };
  const payload = await json(fetcher, `${AVANZA}/search/filtered-search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const out: Instrument[] = [];
  for (const hit of Array.isArray(payload?.hits) ? payload.hits : []) {
    const type = TYPES[hit?.type];
    const currency = hit?.price?.currency;
    if (!type || typeof hit.orderBookId !== 'string' || typeof currency !== 'string') continue;
    const price = parseNumber(hit.price.last);
    const major = price === undefined ? { price, currency } : inMajorUnits({ price, currency });
    out.push({ orderbookId: hit.orderBookId, name: String(hit.title ?? hit.orderBookId), type, ...major });
    if (out.length >= 8) break;
  }
  return out;
}

async function searchNordnetFunds(q: string, fetcher: Fetcher): Promise<Instrument[]> {
  const groups = await json(fetcher, `${NORDNET}/main_search?query=${encodeURIComponent(q)}&search_space=ALL&limit=5`, {
    headers: NORDNET_HEADERS,
  });
  const funds = Array.isArray(groups) ? groups.find((g) => g?.display_group_type === 'FUND')?.results : undefined;
  const out: Instrument[] = [];
  for (const r of Array.isArray(funds) ? funds : []) {
    if (typeof r?.instrument_id !== 'number' || typeof r.currency !== 'string') continue;
    const name = String(r.display_name ?? r.instrument_id);
    out.push({ orderbookId: `nn${r.instrument_id}`, name, type: 'fund', currency: r.currency, price: parseNumber(r.last_price?.price) });
  }
  return out;
}

/** Nordnet's funds report a NAV on the instrument; anything else has a last trade price. */
async function nordnetPrice(id: string, fetcher: Fetcher): Promise<Price> {
  const [j] = await json(fetcher, `${NORDNET}/instruments/${id}`, { headers: NORDNET_HEADERS });
  let price = parseNumber(j?.last_nav);
  if (price === undefined) {
    const [p] = await json(fetcher, `${NORDNET}/instruments/price/${id}`, { headers: NORDNET_HEADERS });
    price = parseNumber(p?.last);
  }
  if (price === undefined || typeof j?.currency !== 'string') throw new Error(`No Nordnet price for ${id}`);
  return { price, currency: j.currency, isin: typeof j.isin_code === 'string' ? j.isin_code : undefined };
}

async function avanzaPrice(id: string, fetcher: Fetcher): Promise<Price> {
  const j = await json(fetcher, `${AVANZA}/market-guide/stock/${id}`);
  const price = parseNumber(j?.quote?.last);
  const currency = j?.listing?.currency;
  if (price === undefined || typeof currency !== 'string') throw new Error(`No Avanza price for ${id}`);
  return { ...inMajorUnits({ price, currency }), isin: typeof j.isin === 'string' ? j.isin : undefined };
}

async function yahooPrice(symbol: string, fetcher: Fetcher): Promise<Price> {
  const j = await json(fetcher, `${YAHOO_CHART}/${encodeURIComponent(symbol)}?range=1d&interval=1d`);
  const meta = j?.chart?.result?.[0]?.meta;
  const price = parseNumber(meta?.regularMarketPrice);
  if (price === undefined || typeof meta?.currency !== 'string') throw new Error(`No Yahoo price for ${symbol}`);
  return inMajorUnits({ price, currency: meta.currency });
}

async function yahooByIsin(isin: string, fetcher: Fetcher): Promise<Price> {
  const j = await json(fetcher, `${YAHOO_SEARCH}?q=${isin}&quotesCount=1&newsCount=0`);
  const symbol = j?.quotes?.[0]?.symbol;
  if (typeof symbol !== 'string') throw new Error(`Yahoo does not know ${isin}`);
  return { ...(await yahooPrice(symbol, fetcher)), isin };
}

/** One unit of `currency` in SEK. */
async function sekRate(currency: string, fetcher: Fetcher): Promise<number> {
  if (currency === 'SEK') return 1;
  const id = AVANZA_FX[currency];
  if (id) {
    try {
      return (await avanzaPrice(id, fetcher)).price;
    } catch {
      // fall through to Yahoo
    }
  }
  return (await yahooPrice(`${currency}SEK=X`, fetcher)).price;
}

const settle = <T>(p: Promise<T>) => p.catch(() => undefined);

export async function quotes(
  items: { id: string; isin?: string; currency: string }[],
  to: string,
  fetcher: Fetcher = fetch,
): Promise<{ quotes: Record<string, { price: number; isin?: string }>; fx: Record<string, number> }> {
  const found = await Promise.all(
    items.map((it) =>
      settle(
        (it.id.startsWith('nn') ? nordnetPrice(it.id.slice(2), fetcher) : avanzaPrice(it.id, fetcher)).catch((error) =>
          it.isin ? yahooByIsin(it.isin, fetcher) : Promise.reject(error),
        ),
      ),
    ),
  );
  const currencies = [...new Set([to, ...items.map((it) => it.currency), ...found.flatMap((p) => (p ? [p.currency] : []))])];
  const rates = await Promise.all(currencies.map((c) => settle(sekRate(c, fetcher))));
  const sek = Object.fromEntries(currencies.map((c, i) => [c, rates[i]]));
  const rate = (from: string, into: string) => (from === into ? 1 : sek[from] && sek[into] ? sek[from] / sek[into] : undefined);

  const out: Record<string, { price: number; isin?: string }> = {};
  items.forEach((it, i) => {
    const p = found[i];
    const r = p && rate(p.currency, it.currency);
    if (p && r) out[it.id] = { price: p.price * r, ...(p.isin ? { isin: p.isin } : {}) };
  });
  const fx: Record<string, number> = {};
  for (const c of new Set(items.map((it) => it.currency))) {
    const r = rate(c, to);
    if (r) fx[c] = r;
  }
  return { quotes: out, fx };
}

const ID = /^(nn)?\d{1,12}$/;
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
const CURRENCY = /^[A-Z]{3}$/;

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const fail = (status: number, error: string) => Response.json({ error }, { status, headers: { 'cache-control': CACHE_FAIL } });
  try {
    const q = params.get('q')?.trim();
    if (q !== undefined) {
      if (q.length < 2) return fail(400, 'Missing q');
      return Response.json(await searchInstruments(q.slice(0, 80)), { headers: { 'cache-control': CACHE_SEARCH } });
    }
    const to = params.get('to') ?? 'SEK';
    const items = params.getAll('i').slice(0, 100).map((raw) => {
      const [id = '', isin = '', currency = ''] = raw.split(':');
      return { id, isin: isin || undefined, currency };
    });
    const valid = items.every((it) => ID.test(it.id) && CURRENCY.test(it.currency) && (!it.isin || ISIN.test(it.isin)));
    if (!items.length || !valid || !CURRENCY.test(to)) return fail(400, 'Expected i=<orderbook id>:<isin>:<currency>');
    const result = await quotes(items, to);
    if (Object.keys(result.quotes).length === 0) return fail(502, 'No prices available');
    return Response.json(result, { headers: { 'cache-control': CACHE_QUOTES } });
  } catch (error) {
    return fail(502, error instanceof Error ? error.message : 'Upstream error');
  }
}
