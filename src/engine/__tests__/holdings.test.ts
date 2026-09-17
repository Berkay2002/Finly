import { describe, expect, it } from 'vitest';
import { applyQuotes, applyTrade, holdingsGain, holdingsPatch, tickerOf } from '../holdings';
import type { Account, Holding } from '../types';

const stock: Holding = { id: 'h1', orderbookId: '5247', name: 'Investor B', type: 'stock', currency: 'SEK', quantity: 10, avgPrice: 350, price: 400, fx: 1 };
const fund: Holding = { id: 'h2', orderbookId: '3323', name: 'US fund', type: 'fund', currency: 'USD', quantity: 2, avgPrice: 100, price: 150, fx: 10 };

describe('holdingsPatch', () => {
  it('derives the balance from cash and holdings in the plan currency', () => {
    const isk: Account = { id: 'a', name: 'ISK', kind: 'isk', balance: 0, cash: 500, holdings: [stock, fund] };
    expect(holdingsPatch(isk)).toEqual({ balance: 500 + 4000 + 3000 });
  });

  it('fills in cost basis and fund share on an AF', () => {
    const af: Account = { id: 'a', name: 'AF', kind: 'af', balance: 0, holdings: [stock, fund] };
    expect(holdingsPatch(af)).toEqual({ balance: 7000, costBasis: 3500 + 2000, fundShare: 43 });
  });

  it('leaves an account without holdings alone', () => {
    expect(holdingsPatch({ id: 'a', name: 'ISK', kind: 'isk', balance: 123 })).toEqual({});
  });
});

describe('holdingsGain', () => {
  it('compares value with cost, skipping holdings without a purchase price', () => {
    const unpriced = { ...stock, id: 'h3', avgPrice: 0 };
    // 4000 + 3000 against 3500 + 2000
    expect(holdingsGain([stock, fund, unpriced])).toEqual({ amount: 1500, share: 1500 / 5500 });
    expect(holdingsGain([unpriced])).toBeNull();
  });
});

describe('tickerOf', () => {
  it('reads a plain ticker, not a share-class one', () => {
    expect(tickerOf('Advanced Micro Devices (AMD)')).toBe('AMD');
    expect(tickerOf('Investor B (INVE B)')).toBeUndefined();
    expect(tickerOf('SAAB B')).toBeUndefined();
  });
});

describe('applyTrade', () => {
  const isk: Account = { id: 'a', name: 'ISK', kind: 'isk', balance: 0, cash: 1000, holdings: [stock, fund] };

  it('sells part: quantity down, average price kept, proceeds to cash, gain in the plan currency', () => {
    const r = applyTrade(isk, 'h2', { side: 'sell', quantity: 1, price: 160, useCash: true });
    expect(r.holdings[1]).toMatchObject({ quantity: 1, avgPrice: 100 });
    expect(r.cash).toBe(1000 + 1600);
    expect(r.gain).toBe(600);
  });

  it('sells everything: the holding goes, and never more than is held', () => {
    const r = applyTrade(isk, 'h1', { side: 'sell', quantity: 99, price: 400, useCash: false });
    expect(r.holdings.map((h) => h.id)).toEqual(['h2']);
    expect(r.cash).toBe(1000);
    expect(r.gain).toBe(10 * 50);
  });

  it('buys more: the average price blends, cost comes from cash but not below 0', () => {
    const r = applyTrade(isk, 'h1', { side: 'buy', quantity: 10, price: 450, useCash: true });
    expect(r.holdings[0]).toMatchObject({ quantity: 20, avgPrice: 400 });
    expect(r.cash).toBe(0);
  });
});

describe('applyQuotes', () => {
  const accounts: Account[] = [
    { id: 'a', name: 'ISK', kind: 'isk', balance: 7000, holdings: [stock, fund] },
    { id: 'b', name: 'Salary', kind: 'salary', balance: 100 },
  ];

  it('moves prices and the balance', () => {
    const next = applyQuotes(accounts, { quotes: { 5247: { price: 410, isin: 'SE0015811963' } }, fx: { USD: 11 } }, '2026-09-17');
    expect(next?.[0].balance).toBe(4100 + 3300);
    expect(next?.[0].holdings?.[0]).toMatchObject({ price: 410, isin: 'SE0015811963', priceAt: '2026-09-17' });
    expect(next?.[1]).toBe(accounts[1]);
  });

  it("stores today's change, which alone counts as a move but keeps the price date", () => {
    const next = applyQuotes(accounts, { quotes: { 5247: { price: 400, change: 0.01 } }, fx: {} }, '2026-09-17');
    expect(next?.[0].holdings?.[0]).toMatchObject({ dayChange: 0.01, priceAt: undefined });
  });

  it('answers null when nothing changed', () => {
    expect(applyQuotes(accounts, { quotes: { 5247: { price: 400 } }, fx: { SEK: 1, USD: 10 } }, '2026-09-17')).toBeNull();
  });
});
