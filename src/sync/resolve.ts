import { messages } from '@/i18n';
import type { PlanData } from '@/store/planStore';

/** What the encrypted blob holds. `payloadVersion` lets the shape change later. */
export interface SyncPayload extends PlanData {
  payloadVersion: 1;
}

export function toPayload(data: PlanData): SyncPayload {
  return { payloadVersion: 1, plan: data.plan, snapshots: data.snapshots };
}

/** Accepts a decrypted blob; throws when it is not one of ours. */
export function fromPayload(raw: unknown): PlanData {
  const p = raw as Partial<SyncPayload> | null;
  if (!p || typeof p !== 'object' || p.payloadVersion !== 1 || !p.plan || typeof p.plan !== 'object') {
    throw new Error(messages().sync.errors.unrecognised);
  }
  return { plan: p.plan, snapshots: p.snapshots && typeof p.snapshots === 'object' ? p.snapshots : {} };
}

export type Winner = 'local' | 'remote';

/**
 * Two devices edited independently. The plan is one object, so the copy touched last wins whole;
 * closed months are a union, with the winner's copy of a month taking precedence, so a month closed
 * on the losing device is never lost.
 */
export function resolveConflict(local: PlanData, remote: PlanData): { winner: Winner; merged: PlanData } {
  const winner: Winner = remote.plan.updatedAt > local.plan.updatedAt ? 'remote' : 'local';
  const [loser, best] = winner === 'remote' ? [local, remote] : [remote, local];
  return { winner, merged: { plan: best.plan, snapshots: { ...loser.snapshots, ...best.snapshots } } };
}
