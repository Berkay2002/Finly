import { format, subMonths } from 'date-fns';
import { useMemo } from 'react';
import { endOfMonthDate, isFrozen, type MetricsSnapshot } from '@/engine/history';
import { computeMetrics, type PlanMetrics } from '@/engine/metrics';
import { allGoalProgress, monthOutlook, savingsProjection, upcomingExpenses } from '@/engine/projections';
import type { FinancialPlan } from '@/engine/types';
import { usePlanStore } from './planStore';
import { useUiStore, viewDateFor } from './uiStore';

/** The live plan: what editors read and write. */
export function usePlan(): FinancialPlan {
  return usePlanStore((s) => s.plan);
}

export function useCurrency(): string {
  return usePlanStore((s) => s.plan.currency);
}

export function useViewMonthKey(): string {
  const viewMonth = useUiStore((s) => s.viewMonth);
  return monthKey(viewMonth);
}

/**
 * Whether the month being viewed was closed with a frozen plan. A closed month renders from that
 * plan so later edits do not rewrite it; the running month always renders live.
 */
export function useFrozenMonth(): { key: string; frozen: boolean; snapshot?: MetricsSnapshot } {
  const key = useViewMonthKey();
  const snapshots = usePlanStore((s) => s.snapshots);
  return useMemo(() => {
    const snapshot = snapshots[key];
    return { key, frozen: isFrozen(snapshots, key), snapshot };
  }, [snapshots, key]);
}

/** The plan every number on screen is computed from: frozen for a closed month, live otherwise. */
export function useEffectivePlan(): FinancialPlan {
  const live = usePlan();
  const { frozen, snapshot } = useFrozenMonth();
  return frozen && snapshot?.plan ? snapshot.plan : live;
}

/** The "now" for calculations: today in the running month, the last day of a closed month, else the 1st. */
export function useViewDate(): Date {
  const viewMonth = useUiStore((s) => s.viewMonth);
  const { key, frozen } = useFrozenMonth();
  return useMemo(() => (frozen ? endOfMonthDate(key) : viewDateFor(viewMonth)), [viewMonth, key, frozen]);
}

export function useMetrics(): PlanMetrics {
  const plan = useEffectivePlan();
  const now = useViewDate();
  return useMemo(() => computeMetrics(plan, now), [plan, now]);
}

export function useGoalProgress() {
  const plan = useEffectivePlan();
  const now = useViewDate();
  return useMemo(() => allGoalProgress(plan, now), [plan, now]);
}

export function useUpcoming(horizonMonths = 12) {
  const plan = useEffectivePlan();
  const now = useViewDate();
  return useMemo(() => upcomingExpenses(plan, now, horizonMonths), [plan, now, horizonMonths]);
}

export function useMonthOutlook(horizonMonths = 12) {
  const plan = useEffectivePlan();
  const now = useViewDate();
  const metrics = useMetrics();
  return useMemo(() => monthOutlook(plan, metrics, now, horizonMonths), [plan, metrics, now, horizonMonths]);
}

export function useSavingsProjection(includeUnallocated = false) {
  const plan = useEffectivePlan();
  const now = useViewDate();
  const metrics = useMetrics();
  return useMemo(
    () => savingsProjection(plan, metrics, now, 12, { includeUnallocated }),
    [plan, metrics, now, includeUnallocated],
  );
}

/** Snapshot of the month before the one being viewed, if it was closed. */
export function usePreviousSnapshot(): MetricsSnapshot | undefined {
  const snapshots = usePlanStore((s) => s.snapshots);
  const viewMonth = useUiStore((s) => s.viewMonth);
  return snapshots[format(subMonths(viewMonth, 1), 'yyyy-MM')];
}

export function monthKey(date: Date): string {
  return format(date, 'yyyy-MM');
}
