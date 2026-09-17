import { format, subMonths } from 'date-fns';
import { useMemo } from 'react';
import { buildSnapshot, endOfMonthDate, isFrozen, monthStart, type MetricsSnapshot } from '@/engine/history';
import { computeMetrics, type PlanMetrics } from '@/engine/metrics';
import { allGoalProgress, expectedReturnsBy, monthOutlook, projectPlan, savingsProjection, upcomingExpenses } from '@/engine/projections';
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

/**
 * The plan every number on screen is computed from: frozen for a closed month, live for the running
 * month, and for a later month the live plan rolled forward (see `projectPlan`): deposits added to each
 * account, contributions to each goal, and loan payments taken off each loan. Expected returns are not
 * in it; `useExpectedReturns` has those as a forecast.
 */
export function useEffectivePlan(): FinancialPlan {
  const live = usePlan();
  const { key, frozen, snapshot } = useFrozenMonth();
  const gov = useGovBondRate();
  const todayKey = monthKey(new Date());
  return useMemo(() => {
    if (frozen && snapshot?.plan) return snapshot.plan;
    if (key > todayKey) return projectPlan(live, new Date(), monthStart(key), gov);
    return live;
  }, [live, key, frozen, snapshot, gov, todayKey]);
}

/** The "now" for calculations: today in the running month, the last day of a closed month, else the 1st. */
export function useViewDate(): Date {
  const viewMonth = useUiStore((s) => s.viewMonth);
  const { key, frozen } = useFrozenMonth();
  return useMemo(() => (frozen ? endOfMonthDate(key) : viewDateFor(viewMonth)), [viewMonth, key, frozen]);
}

/**
 * The return after tax the accounts are expected to have earned by the month being viewed, when it lies
 * ahead: the forecast shown beside net worth, not counted in it. 0 for this month and closed months.
 */
export function useExpectedReturns(): number {
  const live = usePlan();
  const key = useViewMonthKey();
  const gov = useGovBondRate();
  const todayKey = monthKey(new Date());
  return useMemo(() => (key > todayKey ? expectedReturnsBy(live, new Date(), monthStart(key), gov) : 0), [live, key, todayKey, gov]);
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

/**
 * The month before the one being viewed, for "vs last month" figures: its snapshot if it was closed, or
 * when it has not passed yet, the plan as it stands (rolled forward past this month). Undefined for a
 * past month that was never closed.
 */
export function usePreviousMonth(): MetricsSnapshot | undefined {
  const saved = usePreviousSnapshot();
  const live = usePlan();
  const viewMonth = useUiStore((s) => s.viewMonth);
  const gov = useGovBondRate();
  const prevKey = monthKey(subMonths(viewMonth, 1));
  const todayKey = monthKey(new Date());
  return useMemo(() => {
    if (saved || prevKey < todayKey) return saved;
    const today = new Date();
    return buildSnapshot(projectPlan(live, today, monthStart(prevKey), gov), prevKey, today);
  }, [saved, live, prevKey, todayKey, gov]);
}

export function monthKey(date: Date): string {
  return format(date, 'yyyy-MM');
}
