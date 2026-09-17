import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BankTx } from '@/engine/bankActuals';
import type { BankInstitution, NewSession } from './enableBanking';

/**
 * What this device knows about the bank, next to the plan rather than in it: none of it is needed to
 * plan, and it would only make the synced copy churn. The plan carries the links and the balances;
 * a device without the key still shows those, it just cannot fetch new ones.
 */

export type BankAccountStatus = 'ok' | 'reauth' | 'error';

export interface BankAccountState {
  booked?: number;
  available?: number;
  lastSyncedAt?: string;
  status: BankAccountStatus;
  error?: string;
}

/** A login started at the bank; checked when the bank sends the person back. */
export interface PendingAuth {
  state: string;
  bank: BankInstitution;
  startedAt: string;
}

interface BankState {
  /** Whether this device holds the signing key (the key itself is in IndexedDB, see keyStore). */
  hasKey: boolean;
  /**
   * The key file as text, only when the person chose to use the connection on all their devices. It
   * rides along in the encrypted sync blob, which is why it has to be readable here.
   */
  sharedPem?: string;
  pendingAuth?: PendingAuth;
  /** A fresh session whose accounts still have to be tied to Finly accounts. */
  pendingMapping?: NewSession & { bank: BankInstitution };
  /** By `AccountBankLink.externalId`. */
  accounts: Record<string, BankAccountState>;
  lastSyncedAt?: string;
  /**
   * Transactions by `AccountBankLink.externalId`, newest first. Kept here and not in the plan: every
   * closed month carries a copy of the plan, and the synced copy has a size limit. A device with the
   * key fetches its own; what is worked out from them (income received) does go to the plan.
   */
  txs: Record<string, BankTx[]>;
  /** In memory only. */
  syncing: boolean;

  setHasKey: (hasKey: boolean) => void;
  setSharedPem: (pem: string | undefined) => void;
  setPendingAuth: (pending: PendingAuth | undefined) => void;
  setPendingMapping: (pending: BankState['pendingMapping']) => void;
  setAccounts: (accounts: Record<string, BankAccountState>, lastSyncedAt?: string) => void;
  setTxs: (txs: Record<string, BankTx[]>) => void;
  setSyncing: (syncing: boolean) => void;
  forget: () => void;
}

/** A login at the bank takes a minute or two; anything older was abandoned. */
export const PENDING_AUTH_MS = 15 * 60_000;

export const useBankStore = create<BankState>()(
  persist(
    (set) => ({
      hasKey: false,
      accounts: {},
      txs: {},
      syncing: false,

      setHasKey: (hasKey) => set({ hasKey }),
      setSharedPem: (sharedPem) => set({ sharedPem }),
      setPendingAuth: (pendingAuth) => set({ pendingAuth }),
      setPendingMapping: (pendingMapping) => set({ pendingMapping }),
      setAccounts: (accounts, lastSyncedAt) => set((s) => ({ accounts, lastSyncedAt: lastSyncedAt ?? s.lastSyncedAt })),
      setTxs: (txs) => set({ txs }),
      setSyncing: (syncing) => set({ syncing }),
      forget: () => set({ hasKey: false, sharedPem: undefined, pendingAuth: undefined, pendingMapping: undefined, accounts: {}, txs: {}, lastSyncedAt: undefined }),
    }),
    {
      // Not sessionStorage: the bank's app often hands the person back in a new tab.
      name: 'finly.bank.v1',
      partialize: ({ hasKey, sharedPem, pendingAuth, pendingMapping, accounts, txs, lastSyncedAt }) => ({ hasKey, sharedPem, pendingAuth, pendingMapping, accounts, txs, lastSyncedAt }),
    },
  ),
);
