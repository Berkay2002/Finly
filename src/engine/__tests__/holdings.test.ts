import { describe, expect, it } from 'vitest';
import { applyQuotes, holdingsPatch } from '../holdings';
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

  it('answers null when nothing changed', () => {
    expect(applyQuotes(accounts, { quotes: { 5247: { price: 400 } }, fx: { SEK: 1, USD: 10 } }, '2026-09-17')).toBeNull();
  });
});
