import { isMonthKey, type MetricsSnapshot, type SnapshotMap } from '@/engine/history';
import type { FinancialPlan } from '@/engine/types';
import { parsePlan, type PlanData } from './planStore';

/** What "Export" writes: the plan plus every closed month. */
export interface PlanFile extends PlanData {
  version: 2;
  exportedAt: string;
}

export function serializePlanFile(data: PlanData): string {
  const file: PlanFile = { version: 2, exportedAt: new Date().toISOString(), plan: data.plan, snapshots: data.snapshots };
  return JSON.stringify(file, null, 2);
}

function cleanSnapshots(raw: unknown): SnapshotMap {
  if (!raw || typeof raw !== 'object') return {};
  const out: SnapshotMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isMonthKey(key) || !value || typeof value !== 'object') continue;
    const snap = value as Partial<MetricsSnapshot>;
    if (typeof snap.income !== 'number' || typeof snap.lifestyleCost !== 'number') continue;
    let plan: FinancialPlan | undefined;
    if (snap.plan !== undefined) {
      try {
        plan = parsePlan(snap.plan);
      } catch {
        plan = undefined;
      }
    }
    out[key] = { ...(snap as MetricsSnapshot), month: key, plan };
  }
  return out;
}

/**
 * Reads an exported file. Accepts the v2 envelope and the older v1 file that held the plan alone.
 * Throws when the JSON is not a Finly file.
 */
export function parsePlanFile(json: string): PlanData {
  const raw = JSON.parse(json) as Record<string, unknown> | null;
  if (!raw || typeof raw !== 'object') throw new Error('Not a Finly plan file');
  if (raw.version === 2 && raw.plan && typeof raw.plan === 'object') {
    return { plan: parsePlan(raw.plan), snapshots: cleanSnapshots(raw.snapshots) };
  }
  return { plan: parsePlan(raw), snapshots: {} };
}
