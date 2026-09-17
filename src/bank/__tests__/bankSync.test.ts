import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyPlan } from '@/engine/types';

vi.hoisted(() => {
  const data = new Map<string, string>();
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  Object.defineProperty(globalThis, 'window', { value: { localStorage: storage }, configurable: true });
});

const keys = vi.hoisted(() => ({ key: undefined as CryptoKey | undefined }));
vi.mock('../keyStore', () => ({ loadKey: async () => keys.key }));

import { usePlanStore } from '@/store/planStore';
import { useBankStore } from '../bankStore';
import { syncBank } from '../useBankSync';

const answer = (status: number, body: unknown) => vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => Response.json(body, { status }));
const balances = (amount: string) => ({ balances: [{ balance_type: 'ITAV', balance_amount: { amount, currency: 'SEK' } }] });

beforeEach(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
  keys.key = pair.privateKey;
  useBankStore.getState().forget();
  usePlanStore.setState({ plan: emptyPlan(), snapshots: {} });
  const store = usePlanStore.getState();
  store.addAccount({ name: 'Everyday', institution: 'SEB', kind: 'everyday', balance: 24183, bank: { provider: 'enable-banking', externalId: 'hash' } });
  store.addAccount({ name: 'Cash', kind: 'cash', balance: 500 });
  store.setBankSetup({
    provider: 'enable-banking',
    appId: 'app',
    sessions: [{ id: 's', aspsp: 'SEB', country: 'SE', validUntil: '2999-01-01T00:00:00Z', accounts: { hash: 'uid-1' } }],
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('syncBank', () => {
  it('takes the balance the bank reports', async () => {
    const fetcher = answer(200, balances('26150.00'));
    vi.stubGlobal('fetch', fetcher);
    await syncBank({ force: true });
    expect(String(fetcher.mock.calls[0][0])).toContain('path=%2Faccounts%2Fuid-1%2Fbalances');
    expect(usePlanStore.getState().plan.accounts.map((a) => a.balance)).toEqual([26150, 500]);
    expect(useBankStore.getState().accounts.hash).toMatchObject({ status: 'ok', available: 26150 });
  });

  it('leaves the plan exactly as it was when the bank cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline');
    }));
    const before = usePlanStore.getState().plan;
    await expect(syncBank({ force: true })).resolves.toBeUndefined();
    expect(usePlanStore.getState().plan).toBe(before);
    expect(useBankStore.getState().accounts.hash.status).toBe('error');
    expect(useBankStore.getState().syncing).toBe(false);
  });

  it('asks for a new login when the consent is gone or has run out', async () => {
    vi.stubGlobal('fetch', answer(401, { message: 'Session expired' }));
    const before = usePlanStore.getState().plan;
    await syncBank({ force: true });
    expect(useBankStore.getState().accounts.hash.status).toBe('reauth');
    expect(usePlanStore.getState().plan).toBe(before);

    const fetcher = answer(200, balances('1'));
    vi.stubGlobal('fetch', fetcher);
    usePlanStore.setState((s) => ({ plan: { ...s.plan, bank: { ...s.plan.bank!, sessions: [{ ...s.plan.bank!.sessions[0], validUntil: '2000-01-01T00:00:00Z' }] } } }));
    await syncBank({ force: true });
    expect(fetcher).not.toHaveBeenCalled();
    expect(useBankStore.getState().accounts.hash.status).toBe('reauth');
  });

  it('records a recognised salary as received, without touching what the plan expects', async () => {
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-15`;
    const month = date.slice(0, 7);
    const id = usePlanStore.getState().addIncome({
      name: 'Salary', kind: 'salary', amount: 30500, frequency: 'monthly', reliability: 'reliable', includeInBaseline: true,
      bankMatch: { counterparty: 'Ericsson AB', day: 15 },
    });
    const line = (amount: string, name: string, credit_debit_indicator = 'CRDT') => ({
      transaction_amount: { amount, currency: 'SEK' }, credit_debit_indicator, status: 'BOOK', booking_date: date, debtor: { name }, creditor: { name },
    });
    const fetcher = vi.fn(async (url: string | URL | Request, _init?: RequestInit) =>
      Response.json(String(url).includes('transactions') ? { transactions: [line('32850.00', 'ERICSSON AB (PUBL)'), line('500.00', 'Swish Anna'), line('899.00', 'ICA', 'DBIT')] } : balances('58000.00')),
    );
    vi.stubGlobal('fetch', fetcher);
    await syncBank({ force: true });
    const salary = () => usePlanStore.getState().plan.income.find((i) => i.id === id)!;
    expect(salary().actuals).toEqual({ [month]: 32850 });
    expect(salary().amount).toBe(30500);
    expect(useBankStore.getState().txs.hash).toHaveLength(3);

    // The same days read again: nothing doubles, and a plan nothing changed in stays the same object.
    const before = usePlanStore.getState().plan;
    await syncBank({ force: true });
    expect(usePlanStore.getState().plan).toBe(before);
    expect(useBankStore.getState().txs.hash).toHaveLength(3);
  });

  it('keeps the balance when the bank refuses the transactions', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, _init?: RequestInit) =>
      String(url).includes('transactions') ? Response.json({ message: 'no' }, { status: 500 }) : Response.json(balances('26150.00')),
    ));
    await syncBank({ force: true });
    expect(usePlanStore.getState().plan.accounts[0].balance).toBe(26150);
    expect(useBankStore.getState().accounts.hash.status).toBe('ok');
  });

  it('does nothing on a device without the key, or for a plan without a bank', async () => {
    const fetcher = answer(200, balances('1'));
    vi.stubGlobal('fetch', fetcher);
    keys.key = undefined;
    await syncBank({ force: true });
    usePlanStore.setState({ plan: emptyPlan(), snapshots: {} });
    await syncBank({ force: true });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
