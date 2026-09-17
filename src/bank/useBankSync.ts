import { useEffect } from 'react';
import { classifyTransactions, mergeWindow, receivedByMonth, type BankTx, type ClassifiedTx, type OwnAccount } from '@/engine/bankActuals';
import { monthKeyOf } from '@/engine/metrics';
import { usePlanStore } from '@/store/planStore';
import { useSyncStore } from '@/sync/syncStore';
import { useBankStore, type BankAccountState } from './bankStore';
import { BankError, getBalance, getTransactions, signJwt } from './enableBanking';
import { loadKey } from './keyStore';

/** Banks book through the day, not by the second; on its own the app asks at most this often. */
const MIN_INTERVAL_MS = 60 * 60_000;
/** Lets the plan from another device arrive first, so a fetched balance is not laid over a stale copy. */
const SYNC_HEAD_START_MS = 5000;

/** Banks book late and correct themselves: each round reads this far back again and replaces it. */
const REFETCH_DAYS = 10;
/** How far back the first read goes. Enough for this month and last to be whole. */
const FIRST_FETCH_DAYS = 90;
const KEEP_MONTHS = 13;

const isoDay = (date: Date) => `${monthKeyOf(date)}-${String(date.getDate()).padStart(2, '0')}`;
const daysBefore = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() - days);

/** The transactions on this device, with what each one is, newest first. */
export function classifiedTxs(): ClassifiedTx[] {
  const { plan } = usePlanStore.getState();
  const own: OwnAccount[] = plan.accounts.flatMap((a) => (a.bank ? [{ externalId: a.bank.externalId, accountId: a.id, iban: a.bank.iban }] : []));
  const txs = own.flatMap((o) => useBankStore.getState().txs[o.externalId] ?? []);
  return classifyTransactions(txs, plan, own).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/**
 * Writes what each income paid into the plan, for this month and the last: the two the stored
 * transactions always cover in full. Only a changed figure is written, so a round that finds nothing
 * new leaves the plan alone. The expected amounts are never touched.
 */
export function reconcileIncome(now: Date = new Date()): void {
  // A device that holds no transactions knows nothing; what another device worked out stands.
  if (!Object.values(useBankStore.getState().txs).some((list) => list.length)) return;
  const received = receivedByMonth(classifiedTxs());
  const months = [monthKeyOf(now), monthKeyOf(new Date(now.getFullYear(), now.getMonth() - 1, 1))];
  for (const source of usePlanStore.getState().plan.income) {
    for (const month of months) {
      const amount = received[source.id]?.[month];
      if (amount !== source.actuals?.[month]) usePlanStore.getState().setIncomeActual(source.id, month, amount ?? null);
    }
  }
}

// Module-level on purpose, like the sync controller: StrictMode mounts twice, one fetch is enough.
let inFlight: Promise<void> | null = null;

/**
 * Reads the balance of every connected account and hands them to the plan in one write. It never
 * throws: whatever goes wrong ends up as a status on the account, and the plan keeps the last
 * balance it had. Without a connected account, or without the key on this device, it does nothing.
 */
export function syncBank({ force = false }: { force?: boolean } = {}): Promise<void> {
  inFlight ??= run(force)
    .catch(() => undefined)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

async function run(force: boolean): Promise<void> {
  const bank = useBankStore.getState();
  const { plan } = usePlanStore.getState();
  const setup = plan.bank;
  const linked = plan.accounts.filter((a) => a.bank);
  if (!setup || linked.length === 0) return;
  if (!force && bank.lastSyncedAt && Date.now() - Date.parse(bank.lastSyncedAt) < MIN_INTERVAL_MS) return;
  const cloud = useSyncStore.getState().status;
  if (cloud === 'conflict' || (!force && cloud === 'syncing')) return;

  const key = await loadKey();
  if (!key) {
    bank.setHasKey(false);
    return;
  }

  bank.setSyncing(true);
  try {
    const jwt = await signJwt(key, setup.appId);
    const now = new Date();
    const states: Record<string, BankAccountState> = {};
    const balances: Record<string, number> = {};
    const txs: Record<string, BankTx[]> = {};
    for (const account of linked) {
      const id = account.bank!.externalId;
      const previous = bank.accounts[id];
      // The newest session that covers the account: a reconnect adds one and leaves the old behind.
      const session = [...setup.sessions].reverse().find((s) => s.accounts[id]);
      if (!session || Date.parse(session.validUntil) <= now.getTime()) {
        states[id] = { ...previous, status: 'reauth', error: undefined };
        continue;
      }
      try {
        const balance = await getBalance(jwt, session.accounts[id]);
        // Available shows card purchases sooner. When it is above booked it most likely counts a credit
        // line in, which is not the user's money, so booked it is.
        const { available, booked } = balance ?? {};
        const value = available !== undefined && (booked === undefined || available <= booked) ? available : booked;
        if (value !== undefined) balances[id] = Math.round(value * 100) / 100;
        states[id] = { booked: balance?.booked, available: balance?.available, lastSyncedAt: now.toISOString(), status: 'ok' };
        txs[id] = bank.txs[id] ?? [];
        // After the balance, and on its own: a bank that refuses the list still gave the figure that matters.
        try {
          const from = isoDay(daysBefore(previous?.lastSyncedAt && txs[id].length ? new Date(previous.lastSyncedAt) : now, txs[id].length ? REFETCH_DAYS : FIRST_FETCH_DAYS));
          const keepFrom = isoDay(new Date(now.getFullYear(), now.getMonth() - KEEP_MONTHS, 1));
          txs[id] = mergeWindow(txs[id], await getTransactions(jwt, session.accounts[id], id, from), from, keepFrom);
        } catch {
          /* the stored ones stand until next time */
        }
      } catch (e) {
        // Asked too often: not worth a warning, the next round will do.
        if (e instanceof BankError && e.status === 429 && previous) states[id] = previous;
        else states[id] = { ...previous, status: e instanceof BankError && e.needsLogin ? 'reauth' : 'error', error: e instanceof Error ? e.message : undefined };
      }
    }
    usePlanStore.getState().refreshBankBalances(balances, now);
    useBankStore.getState().setAccounts(states, now.toISOString());
    try {
      // Only accounts read this round: one that failed keeps what it had, one no longer connected is dropped.
      useBankStore.getState().setTxs({ ...Object.fromEntries(linked.map((a) => [a.bank!.externalId, bank.txs[a.bank!.externalId] ?? []])), ...txs });
      reconcileIncome(now);
    } catch {
      /* storage full: balances are in, the transactions wait */
    }
  } finally {
    useBankStore.getState().setSyncing(false);
  }
}

/** On load and whenever the tab comes back into view; `syncBank` itself decides whether it is time. */
export function useBankSync(): void {
  const hydrated = usePlanStore((s) => s.hydrated);
  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => void syncBank(), useSyncStore.getState().syncId ? SYNC_HEAD_START_MS : 0);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void syncBank();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [hydrated]);
}
