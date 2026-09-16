import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PlanData } from '@/store/planStore';
import { deriveSyncId, toHex } from './crypto';
import type { Winner } from './resolve';

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'conflict' | 'error';

export interface SyncConflict {
  remote: PlanData;
  remoteVersion: number;
  remoteUpdatedAt: number;
  /** Which copy is newer by the plan's own `updatedAt`. */
  newer: Winner;
}

interface SyncState {
  /**
   * The 16-byte secret as hex. Kept in localStorage next to the plan itself, which is already
   * plaintext there: the phrase adds no exposure on this device. It protects the copy on the server.
   */
  secret?: string;
  /** Derived from the secret; the only identifier the server ever sees. */
  syncId?: string;
  /** Version of the cloud copy this device last read or wrote. 0 = never. */
  version: number;
  lastSyncedAt?: string;
  status: SyncStatus;
  error?: string;
  /** In memory only: the other device's copy, waiting for the user to choose. */
  conflict?: SyncConflict;

  enable: (secret: Uint8Array) => Promise<string>;
  disable: () => void;
  setStatus: (status: SyncStatus, error?: string) => void;
  setConflict: (conflict: SyncConflict | undefined) => void;
  markSynced: (version: number) => void;
}

export const useSyncStore = create<SyncState>()(
  persist(
    (set) => ({
      version: 0,
      status: 'off',

      enable: async (secret) => {
        const syncId = await deriveSyncId(secret);
        set({ secret: toHex(secret), syncId, version: 0, status: 'idle', error: undefined, conflict: undefined });
        return syncId;
      },
      disable: () =>
        set({ secret: undefined, syncId: undefined, version: 0, lastSyncedAt: undefined, status: 'off', error: undefined, conflict: undefined }),
      setStatus: (status, error) => set({ status, error }),
      setConflict: (conflict) => set({ conflict, status: conflict ? 'conflict' : 'idle' }),
      markSynced: (version) => set({ version, lastSyncedAt: new Date().toISOString(), status: 'idle', error: undefined }),
    }),
    {
      name: 'finly.sync.v1',
      partialize: (s) => ({ secret: s.secret, syncId: s.syncId, version: s.version, lastSyncedAt: s.lastSyncedAt }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SyncState>;
        return { ...current, ...p, status: p.syncId ? 'idle' : 'off' };
      },
    },
  ),
);
