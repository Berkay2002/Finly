/**
 * Runs the sync protocol against a real Convex deployment: two simulated devices, a conflict, the
 * write throttle, tamper detection and deletion. Skipped unless `FINLY_E2E=1` and a `VITE_CONVEX_URL`
 * (normally from `.env.local`) is present, because it needs the network and writes one throwaway row.
 *
 *   FINLY_E2E=1 npx vitest run src/sync/__tests__/e2e.test.ts
 */
import { ConvexHttpClient } from 'convex/browser';
import { describe, expect, it } from 'vitest';
import { api } from '../../../convex/_generated/api';
import { decryptJson, deriveKey, deriveSyncId, encryptJson, generateSecret } from '../crypto';
import { phraseToSecret, secretToPhrase } from '../phrase';
import { resolveConflict, toPayload, type SyncPayload } from '../resolve';
import { prdExamplePlan } from '../../engine/__tests__/fixtures';

const url = import.meta.env.VITE_CONVEX_URL || process.env.VITE_CONVEX_URL;
const enabled = process.env.FINLY_E2E === '1' && !!url;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!enabled)('sync against the Convex deployment', () => {
  it('two devices share one phrase; conflicts, throttle, tamper and delete behave', async () => {
    const client = new ConvexHttpClient(url!);

    // Device A turns sync on and shows a phrase; device B types it in.
    const secretA = generateSecret();
    const words = secretToPhrase(secretA);
    const secretB = phraseToSecret(words);
    expect(Array.from(secretB)).toEqual(Array.from(secretA));

    const syncId = await deriveSyncId(secretA);
    expect(await deriveSyncId(secretB)).toBe(syncId);
    const keyA = await deriveKey(secretA);
    const keyB = await deriveKey(secretB);

    // Nothing in the cloud yet.
    expect(await client.query(api.blobs.get, { syncId })).toBeNull();

    // A pushes its plan.
    const planA = { ...prdExamplePlan(), userName: 'Device A', updatedAt: '2026-09-16T10:00:00.000Z' };
    const first = await client.mutation(api.blobs.put, {
      syncId,
      ...(await encryptJson(keyA, toPayload({ plan: planA, snapshots: {} }))),
      version: 0,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.version).toBe(1);

    // B reads it with the key derived from the phrase.
    const remote = await client.query(api.blobs.get, { syncId });
    expect(remote?.version).toBe(1);
    const seen = await decryptJson<SyncPayload>(keyB, remote!);
    expect(seen.plan.userName).toBe('Device A');

    // B pushes with a stale version (it never saw version 1): rejected, current copy handed back.
    const planB = { ...prdExamplePlan(), userName: 'Device B', updatedAt: '2026-09-16T11:00:00.000Z' };
    await sleep(1100); // the per-id throttle is 1 s
    const stale = await client.mutation(api.blobs.put, {
      syncId,
      ...(await encryptJson(keyB, toPayload({ plan: planB, snapshots: {} }))),
      version: 0,
    });
    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(stale.reason).toBe('conflict');
    if (stale.reason !== 'conflict') return;
    expect(stale.current.version).toBe(1);
    const theirs = await decryptJson<SyncPayload>(keyB, stale.current);
    const { winner } = resolveConflict({ plan: planB, snapshots: {} }, { plan: theirs.plan, snapshots: {} });
    expect(winner).toBe('local'); // B's copy is newer by updatedAt

    // B keeps its own and re-pushes on top of version 1.
    const sealedB = await encryptJson(keyB, toPayload({ plan: planB, snapshots: {} }));
    const second = await client.mutation(api.blobs.put, { syncId, ...sealedB, version: 1 });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.version).toBe(2);

    // A second write straight after is throttled; after the wait it goes through.
    const soon = await client.mutation(api.blobs.put, { syncId, ...sealedB, version: 2 });
    expect(soon.ok).toBe(false);
    if (soon.ok) return;
    expect(soon.reason).toBe('throttled');
    if (soon.reason !== 'throttled') return;
    await sleep(soon.retryAfterMs + 100);
    const third = await client.mutation(api.blobs.put, { syncId, ...sealedB, version: 2 });
    expect(third.ok).toBe(true);
    if (!third.ok) return;
    expect(third.version).toBe(3);

    // A's live query would now see version 3 and apply it.
    const latest = await client.query(api.blobs.get, { syncId });
    expect(latest?.version).toBe(3);
    expect((await decryptJson<SyncPayload>(keyA, latest!)).plan.userName).toBe('Device B');

    // A flipped byte is detected, not silently decrypted.
    const tampered = { ...latest!, ciphertext: latest!.ciphertext.slice(0, -4) + (latest!.ciphertext.endsWith('AAAA') ? 'BBBB' : 'AAAA') };
    await expect(decryptJson(keyA, tampered)).rejects.toBeDefined();

    // The wrong phrase derives a different id and cannot read this row.
    const stranger = await deriveKey(generateSecret());
    await expect(decryptJson(stranger, latest!)).rejects.toBeDefined();

    // Delete the cloud copy; a later push from a device that still holds version 3 is told the chain is gone.
    await client.mutation(api.blobs.remove, { syncId });
    expect(await client.query(api.blobs.get, { syncId })).toBeNull();
    const afterDelete = await client.mutation(api.blobs.put, { syncId, ...sealedB, version: 3 });
    expect(afterDelete.ok).toBe(false);
    if (afterDelete.ok) return;
    expect(afterDelete.reason).toBe('conflict');
    if (afterDelete.reason !== 'conflict') return;
    expect(afterDelete.current.version).toBe(0);

    // Clean up what the last step may have left behind (it did not write, but be safe).
    await client.mutation(api.blobs.remove, { syncId });
  }, 30_000);
});
