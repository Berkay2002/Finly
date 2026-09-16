import { format, subMonths } from 'date-fns';
import { useMemo } from 'react';
import { endOfMonthDate, isFrozen, type MetricsSnapshot } from '@/engine/history';
import { computeMetrics, type PlanMetrics } from '@/engine/metrics';
import { allGoalProgress, monthOutlook, savingsProjection, upcomingExpenses } from '@/engine/projections';
import type { GovBondRate } from '@/engine/rates';
import type { FinancialPlan } from '@/engine/types';
import { useRateOutlook } from '@/lib/rateOutlook';
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

/** Today's statslåneränta, for savings tax in a year whose 30 November rate is not known yet. */
export function useGovBondRate(): GovBondRate | undefined {
  return useRateOutlook().govBondRate;
}

export function useMetrics(): PlanMetrics {
  const plan = useEffectivePlan();
  const now = useViewDate();
  const gov = useGovBondRate();
  return useMemo(() => computeMetrics(plan, now, gov), [plan, now, gov]);
}

export function useGoalProgress() {
  const plan = useEffectivePlan();
  const now = useViewDate();
  const gov = useGovBondRate();
  return useMemo(() => allGoalProgress(plan, now, gov), [plan, now, gov]);
}

/** After-tax expected return of each account, percent, by id: what a linked goal grows by. */
export function useAccountReturns(): Map<string, number> {
  const m = useMetrics();
  return useMemo(() => new Map(m.capitalTax.accounts.map((t) => [t.accountId, t.netReturn])), [m]);
}

export function useUpcoming(horizonMonths = 12) {
  const plan = useEffectivePlan();
  const now = useViewDate();
  const gov = useGovBondRate();
  return useMemo(() => upcomingExpenses(plan, now, horizonMonths, gov), [plan, now, horizonMonths, gov]);
}

export function useMonthOutlook(horizonMonths = 12) {
  const plan = useEffectivePlan();
  const now = useViewDate();
  const metrics = useMetrics();
  const gov = useGovBondRate();
  return useMemo(() => monthOutlook(plan, metrics, now, horizonMonths, gov), [plan, metrics, now, horizonMonths, gov]);
}

export function useSavingsProjection(includeUnallocated = false) {
  const plan = useEffectivePlan();
  const now = useViewDate();
  const metrics = useMetrics();
  const gov = useGovBondRate();
  return useMemo(
    () => savingsProjection(plan, metrics, now, 12, { includeUnallocated, gov }),
    [plan, metrics, now, includeUnallocated, gov],
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
