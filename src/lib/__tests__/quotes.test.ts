import { describe, expect, it, vi } from 'vitest';
import { parseNumber, quotes, searchInstruments } from '../../../api/quotes';
import { getQuoteStatus, quoteQuery, refreshQuotes } from '../quotes';

/** A fetch that answers by URL substring; anything unmatched is a 500. */
function fetcher(routes: Record<string, unknown>) {
  return vi.fn(async (url: string) => {
    const hit = Object.keys(routes).find((k) => url.includes(k));
    return hit ? new Response(JSON.stringify(routes[hit]), { status: 200 }) : new Response('down', { status: 500 });
  });
}

const avanza = (last: number, currency: string, isin: string, changePercent?: number) => ({ isin, quote: { last, changePercent }, listing: { currency } });

describe('parseNumber', () => {
  it('reads Swedish-formatted figures', () => {
    expect(parseNumber('1 292,76')).toBe(1292.76);
    expect(parseNumber('1 292,76')).toBe(1292.76);
    expect(parseNumber('−0,17')).toBe(-0.17);
    expect(parseNumber(262.98)).toBe(262.98);
    expect(parseNumber('')).toBeUndefined();
    expect(parseNumber('n/a')).toBeUndefined();
  });
});

describe('searchInstruments', () => {
  it('keeps stocks, ETFs and funds from Avanza and adds Nordnet funds Avanza lacks', async () => {
    const f = fetcher({
      'avanza.se/_api/search': {
        hits: [
          { type: 'STOCK', orderBookId: '5247', title: 'Investor B (INVE B)', price: { last: '405,75', currency: 'SEK' }, marketPlaceName: 'Stockholmsbörsen' },
          { type: 'FAQ', title: 'Vad är ISK?' },
          { type: 'FUND', orderBookId: '878733', title: 'Avanza Global', price: { last: '262,98', currency: 'SEK' } },
        ],
      },
      'nordnet.se/api/2/main_search': [
        { display_group_type: 'EQUITY', results: [{ instrument_id: 1, display_name: 'Investor B', currency: 'SEK' }] },
        {
          display_group_type: 'FUND',
          results: [
            { instrument_id: 2, display_name: 'Avanza Global', currency: 'SEK' },
            { instrument_id: 16801084, display_name: 'Nordnet Sverige Index', currency: 'SEK', last_price: { price: 841.56 } },
          ],
        },
      ],
    });
    expect(await searchInstruments('x', f)).toEqual([
      { orderbookId: '5247', name: 'Investor B (INVE B)', type: 'stock', currency: 'SEK', price: 405.75, market: 'Stockholmsbörsen' },
      { orderbookId: '878733', name: 'Avanza Global', type: 'fund', currency: 'SEK', price: 262.98, market: undefined },
      { orderbookId: 'nn16801084', name: 'Nordnet Sverige Index', type: 'fund', currency: 'SEK', price: 841.56, market: 'Nordnet' },
    ]);
  });

  it('fails only when both sources are down', async () => {
    await expect(searchInstruments('x', fetcher({}))).rejects.toThrow();
  });
});

describe('quotes', () => {
  it('prices Avanza and Nordnet holdings and converts currencies to the plan currency', async () => {
    const f = fetcher({
      'market-guide/stock/5247': avanza(406, 'SEK', 'SE0015811963', 1.5),
      'market-guide/stock/3323': avanza(300, 'USD', 'US0378331005'),
      'market-guide/stock/19000': avanza(10, 'SEK', 'USDSEK'),
      'nordnet.se/api/2/instruments/16801084': [{ last_nav: 841.56, currency: 'SEK', isin_code: 'SE0014956371', performance_one_day: -0.5 }],
    });
    const result = await quotes(
      [
        { id: '5247', currency: 'SEK' },
        { id: '3323', currency: 'USD' },
        { id: 'nn16801084', currency: 'SEK' },
      ],
      'SEK',
      f,
    );
    expect(result.quotes).toEqual({
      5247: { price: 406, isin: 'SE0015811963', change: 0.015 },
      3323: { price: 300, isin: 'US0378331005' },
      nn16801084: { price: 841.56, isin: 'SE0014956371', change: -0.005 },
    });
    expect(result.fx).toEqual({ SEK: 1, USD: 10 });
  });

  it('falls back to Yahoo by ISIN, converting a listing in another currency and pence', async () => {
    const f = fetcher({
      'finance/search?q=IE00B4L5Y983': { quotes: [{ symbol: 'IWDA.L' }] },
      'chart/IWDA.L': { chart: { result: [{ meta: { regularMarketPrice: 11000, chartPreviousClose: 10000, currency: 'GBp' } }] } },
      'chart/EURSEK%3DX': { chart: { result: [{ meta: { regularMarketPrice: 11, currency: 'SEK' } }] } },
      'chart/GBPSEK%3DX': { chart: { result: [{ meta: { regularMarketPrice: 13.2, currency: 'SEK' } }] } },
    });
    const result = await quotes([{ id: '384747', isin: 'IE00B4L5Y983', currency: 'EUR' }], 'SEK', f);
    // 110 GBP × 13.2 SEK/GBP ÷ 11 SEK/EUR = 132 EUR
    expect(result.quotes['384747'].price).toBeCloseTo(132);
    expect(result.quotes['384747'].change).toBeCloseTo(0.1);
    expect(result.fx).toEqual({ EUR: 11 });
  });

  it('leaves out what no source can price', async () => {
    expect(await quotes([{ id: '1', currency: 'SEK' }], 'SEK', fetcher({}))).toEqual({ quotes: {}, fx: { SEK: 1 } });
  });
});

describe('quoteQuery', () => {
  it('is stable and deduplicated', () => {
    const a = { orderbookId: '5247', currency: 'SEK' };
    const b = { orderbookId: '3323', isin: 'US0378331005', currency: 'USD' };
    expect(quoteQuery([a, b, a], 'SEK')).toBe(quoteQuery([b, a], 'SEK'));
    expect(quoteQuery([], 'SEK')).toBe('');
  });
});

describe('refreshQuotes', () => {
  it('records when prices last came, and when they did not', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 502 })));
    await refreshQuotes('i=1::SEK&to=SEK');
    expect(getQuoteStatus()).toMatchObject({ failed: true, refreshing: false });

    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ quotes: { 1: { price: 1 } }, fx: { SEK: 1 } })));
    await refreshQuotes('i=1::SEK&to=SEK');
    expect(getQuoteStatus()).toMatchObject({ failed: false, refreshing: false, fetchedAt: expect.any(Number) });
    vi.unstubAllGlobals();
  });
});
