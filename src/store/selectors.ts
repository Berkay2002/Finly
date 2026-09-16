import { format, subMonths } from 'date-fns';
import { useMemo } from 'react';
import { computeMetrics, type PlanMetrics } from '@/engine/metrics';
import { allGoalProgress, monthOutlook, savingsProjection, upcomingExpenses } from '@/engine/projections';
import type { FinancialPlan } from '@/engine/types';
import { usePlanStore, type MetricsSnapshot } from './planStore';
import { useUiStore, viewDateFor } from './uiStore';

export function usePlan(): FinancialPlan {
  return usePlanStore((s) => s.plan);
}

export function useCurrency(): string {
  return usePlanStore((s) => s.plan.currency);
}

export function useViewDate(): Date {
  const viewMonth = useUiStore((s) => s.viewMonth);
  return useMemo(() => viewDateFor(viewMonth), [viewMonth]);
}

export function useMetrics(): PlanMetrics {
  const plan = usePlan();
  const now = useViewDate();
  return useMemo(() => computeMetrics(plan, now), [plan, now]);
}

export function useGoalProgress() {
  const plan = usePlan();
  const now = useViewDate();
  return useMemo(() => allGoalProgress(plan, now), [plan, now]);
}

export function useUpcoming(horizonMonths = 12) {
  const plan = usePlan();
  const now = useViewDate();
  return useMemo(() => upcomingExpenses(plan, now, horizonMonths), [plan, now, horizonMonths]);
}

export function useMonthOutlook(horizonMonths = 12) {
  const plan = usePlan();
  const now = useViewDate();
  const metrics = useMetrics();
  return useMemo(() => monthOutlook(plan, metrics, now, horizonMonths), [plan, metrics, now, horizonMonths]);
}

export function useSavingsProjection(includeUnallocated = false) {
  const plan = usePlan();
  const now = useViewDate();
  const metrics = useMetrics();
  return useMemo(
    () => savingsProjection(plan, metrics, now, 12, { includeUnallocated }),
    [plan, metrics, now, includeUnallocated],
  );
}

/** Snapshot of the month before the one being viewed, if the user saved one. */
export function usePreviousSnapshot(): MetricsSnapshot | undefined {
  const snapshots = usePlanStore((s) => s.snapshots);
  const viewMonth = useUiStore((s) => s.viewMonth);
  return snapshots[format(subMonths(viewMonth, 1), 'yyyy-MM')];
}

export function monthKey(date: Date): string {
  return format(date, 'yyyy-MM');
}
