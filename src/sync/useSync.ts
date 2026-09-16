import { useQuery } from 'convex/react';
import { useEffect } from 'react';
import { api } from '../../convex/_generated/api';
import { usePlanStore, type PlanData } from '@/store/planStore';
import { convex } from './convexClient';
import { decryptJson, deriveKey, encryptJson, fromHex, generateSecret, type Sealed } from './crypto';
import { phraseToSecret, secretToPhrase } from './phrase';
import { fromPayload, resolveConflict, toPayload, type Winner } from './resolve';
import { useSyncStore } from './syncStore';

const PUSH_DELAY_MS = 2000;

/*
 * Module-level state on purpose: the controller is mounted once, StrictMode mounts it twice in
 * development, and a debounce timer or an in-flight push must not be duplicated by that.
 */
let dirty = false;
let applyingRemote = false;
let pushTimer: ReturnType<typeof setTimeout> | undefined;
let inFlight: Promise<void> | null = null;
let pushAgain = false;
let keyCache: { syncId: string; key: CryptoKey } | null = null;

function client() {
  if (!convex) throw new Error('Sync is not configured in this build.');
  return convex;
}

async function keyFor(syncId: string, secretHex: string): Promise<CryptoKey> {
  if (keyCache?.syncId === syncId) return keyCache.key;
  const key = await deriveKey(fromHex(secretHex));
  keyCache = { syncId, key };
  return key;
}

function localData(): PlanData {
  const { plan, snapshots } = usePlanStore.getState();
  return { plan, snapshots };
}

/** Apply another device's copy without the plan store treating it as an edit. */
function applyRemote(data: PlanData) {
  applyingRemote = true;
  try {
    usePlanStore.getState().replaceAll(data);
    dirty = false;
  } finally {
    applyingRemote = false;
  }
}

async function decryptRemote(syncId: string, secretHex: string, sealed: Sealed): Promise<PlanData> {
  return fromPayload(await decryptJson(await keyFor(syncId, secretHex), sealed));
}

function raiseConflict(remote: PlanData, remoteVersion: number, remoteUpdatedAt: number) {
  const { winner } = resolveConflict(localData(), remote);
  useSyncStore.getState().setConflict({ remote, remoteVersion, remoteUpdatedAt, newer: winner });
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong while syncing.';
}

async function push(): Promise<void> {
  if (inFlight) {
    pushAgain = true;
    return inFlight;
  }
  const run = async () => {
    const sync = useSyncStore.getState();
    if (!sync.syncId || !sync.secret || sync.status === 'conflict' || sync.status === 'off') return;
    sync.setStatus('syncing');
    try {
      const key = await keyFor(sync.syncId, sync.secret);
      const sealed = await encryptJson(key, toPayload(localData()));
      dirty = false;
      const result = await client().mutation(api.blobs.put, { syncId: sync.syncId, ...sealed, version: sync.version });
      if (result.ok) {
        useSyncStore.getState().markSynced(result.version);
      } else if (result.reason === 'throttled') {
        dirty = true;
        useSyncStore.getState().setStatus('idle');
        schedulePush(result.retryAfterMs + 50);
      } else if (result.current.version === 0) {
        // The cloud copy was deleted from another device. Start a new chain with this data.
        dirty = true;
        useSyncStore.getState().markSynced(0);
        schedulePush(0);
      } else {
        dirty = true;
        const remote = await decryptRemote(sync.syncId, sync.secret, result.current);
        raiseConflict(remote, result.current.version, result.current.updatedAt);
      }
    } catch (e) {
      dirty = true;
      useSyncStore.getState().setStatus('error', message(e));
    }
  };
  inFlight = run().finally(() => {
    inFlight = null;
    if (pushAgain) {
      pushAgain = false;
      schedulePush(0);
    }
  });
  return inFlight;
}

function schedulePush(delay = PUSH_DELAY_MS) {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => void push(), delay);
}

/**
 * Mount once inside `ConvexProvider`. Keeps the cloud copy and the local store in step: local
 * edits are pushed after a short pause, and the live query brings other devices' pushes here.
 */
export function SyncController() {
  const syncId = useSyncStore((s) => s.syncId);
  const secret = useSyncStore((s) => s.secret);
  const version = useSyncStore((s) => s.version);
  const status = useSyncStore((s) => s.status);
  const remote = useQuery(api.blobs.get, syncId ? { syncId } : 'skip');

  // Local edits → push.
  useEffect(() => {
    if (!syncId) return;
    const unsubscribe = usePlanStore.subscribe((s, prev) => {
      if (applyingRemote || useSyncStore.getState().status === 'off') return;
      if (s.plan === prev.plan && s.snapshots === prev.snapshots) return;
      dirty = true;
      schedulePush();
    });
    if (dirty) schedulePush();
    return unsubscribe;
  }, [syncId]);

  // Other devices' pushes → apply, or ask when this device has unsent edits.
  useEffect(() => {
    if (!syncId || !secret || remote === undefined || status === 'conflict' || inFlight) return;
    if (remote === null) {
      if (version > 0) useSyncStore.getState().markSynced(0);
      return;
    }
    if (remote.version <= version) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await decryptRemote(syncId, secret, remote);
        if (cancelled) return;
        if (dirty) raiseConflict(data, remote.version, remote.updatedAt);
        else {
          applyRemote(data);
          useSyncStore.getState().markSynced(remote.version);
        }
      } catch (e) {
        if (!cancelled) useSyncStore.getState().setStatus('error', message(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [syncId, secret, remote, version, status]);

  return null;
}

function isBlank(plan: PlanData['plan']): boolean {
  return (
    plan.isSample === true ||
    (plan.income.length === 0 && plan.expenses.length === 0 && plan.accounts.length === 0 && plan.goals.length === 0)
  );
}

export type JoinOutcome = 'uploaded' | 'downloaded' | 'conflict';

/** Everything the Settings card and the conflict banner need. */
export function useSyncActions() {
  const sync = useSyncStore();

  return {
    configured: convex !== null,
    status: sync.status,
    error: sync.error,
    lastSyncedAt: sync.lastSyncedAt,
    conflict: sync.conflict,

    /** Words for the phrase this device syncs under, or null when sync is off. */
    phrase(): string[] | null {
      return sync.secret ? secretToPhrase(fromHex(sync.secret)) : null;
    },

    /** A fresh phrase, not yet in use; call `startNew` with it to switch sync on. */
    draftPhrase(): { secret: Uint8Array; words: string[] } {
      const secret = generateSecret();
      return { secret, words: secretToPhrase(secret) };
    },

    async startNew(secret: Uint8Array): Promise<void> {
      client();
      await useSyncStore.getState().enable(secret);
      dirty = true;
      await push();
    },

    /** Join a chain another device started. Throws `PhraseError` on a bad phrase. */
    async join(words: string[]): Promise<JoinOutcome> {
      const c = client();
      const secret = phraseToSecret(words);
      const syncId = await useSyncStore.getState().enable(secret);
      const remote = await c.query(api.blobs.get, { syncId });
      if (remote === null) {
        dirty = true;
        await push();
        return 'uploaded';
      }
      const secretHex = useSyncStore.getState().secret!;
      let data: PlanData;
      try {
        data = await decryptRemote(syncId, secretHex, remote);
      } catch (e) {
        useSyncStore.getState().disable();
        throw new Error(`The cloud copy could not be read: ${message(e)}`);
      }
      if (isBlank(usePlanStore.getState().plan)) {
        applyRemote(data);
        useSyncStore.getState().markSynced(remote.version);
        return 'downloaded';
      }
      dirty = true;
      raiseConflict(data, remote.version, remote.updatedAt);
      return 'conflict';
    },

    /** Settle a conflict. Closed months from both sides are kept either way. */
    async resolve(keep: Winner): Promise<void> {
      const { conflict } = useSyncStore.getState();
      if (!conflict) return;
      const local = localData();
      const merged: PlanData =
        keep === 'local'
          ? { plan: local.plan, snapshots: { ...conflict.remote.snapshots, ...local.snapshots } }
          : { plan: conflict.remote.plan, snapshots: { ...local.snapshots, ...conflict.remote.snapshots } };
      applyRemote(merged);
      useSyncStore.getState().setConflict(undefined);
      useSyncStore.getState().markSynced(conflict.remoteVersion);
      if (keep === 'local') {
        dirty = true;
        await push();
      }
    },

    retry(): void {
      dirty = true;
      void push();
    },

    /** Stop syncing on this device. Local data and the cloud copy stay as they are. */
    turnOff(): void {
      clearTimeout(pushTimer);
      dirty = false;
      keyCache = null;
      useSyncStore.getState().disable();
    },

    /** Remove the cloud copy, then stop syncing here. Other devices keep their local data. */
    async deleteCloud(): Promise<void> {
      const { syncId } = useSyncStore.getState();
      if (syncId) await client().mutation(api.blobs.remove, { syncId });
      this.turnOff();
    },
  };
}
