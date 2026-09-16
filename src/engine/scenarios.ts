import { messages } from '@/i18n';
import { computeMetrics, type PlanMetrics } from './metrics';
import { allGoalProgress, type GoalProgress } from './projections';
import type { AmountRange, ExpenseCategory, FinancialPlan, Frequency } from './types';

/* ------------------------------------------------------------------ */
/* Scenario definitions                                                */
/* ------------------------------------------------------------------ */

export interface RecurringExpenseScenario {
  type: 'add_expense';
  name: string;
  /** Typical amount per period; the plan budgets for this. */
  amount: number;
  /** Optional expected spread for a cost that varies, e.g. a floating-rate electricity plan. */
  range?: AmountRange;
  frequency: Frequency;
  category: ExpenseCategory;
  essential: boolean;
  committed: boolean;
}

export interface IncomeChangeScenario {
  type: 'income_change';
  /** Source to change; omit to apply to all baseline income. */
  sourceId?: string;
  mode: 'percent' | 'absolute' | 'set' | 'remove';
  /** Percent as e.g. 10 for +10 %, −20 for −20 %. Absolute in currency per month. */
  value: number;
}

export type Scenario = RecurringExpenseScenario | IncomeChangeScenario;

/* ------------------------------------------------------------------ */
/* Applying                                                            */
/* ------------------------------------------------------------------ */

export function applyScenario(plan: FinancialPlan, scenario: Scenario): FinancialPlan {
  if (scenario.type === 'add_expense') {
    return {
      ...plan,
      expenses: [
        ...plan.expenses,
        {
          id: '__scenario__',
          name: scenario.name || messages().planning.newExpense,
          category: scenario.category,
          subcategory: 'custom',
          amount: scenario.amount,
          frequency: scenario.frequency,
          fixed: !scenario.range,
          range: scenario.range,
          essential: scenario.essential,
          committed: scenario.committed,
          tags: [],
        },
      ],
    };
  }

  const targets = scenario.sourceId
    ? plan.income.filter((i) => i.id === scenario.sourceId)
    : plan.income.filter((i) => i.includeInBaseline);
  const ids = new Set(targets.map((i) => i.id));

  return {
    ...plan,
    income: plan.income.map((src) => {
      if (!ids.has(src.id)) return src;
      switch (scenario.mode) {
        case 'remove':
          return { ...src, amount: 0 };
        case 'percent':
          return { ...src, amount: src.amount * (1 + scenario.value / 100) };
        case 'absolute': {
          // value is per month; convert to the source's own frequency
          const factor = monthlyFactor(src.frequency);
          return { ...src, amount: Math.max(0, src.amount + scenario.value / factor) };
        }
        case 'set': {
          const factor = monthlyFactor(src.frequency);
          return { ...src, amount: Math.max(0, scenario.value / factor) };
        }
      }
    }),
  };
}

function monthlyFactor(frequency: Frequency): number {
  switch (frequency) {
    case 'weekly':
      return 52 / 12;
    case 'monthly':
      return 1;
    case 'quarterly':
      return 1 / 3;
    case 'yearly':
    case 'once':
      return 1 / 12;
  }
}

/* ------------------------------------------------------------------ */
/* Comparison                                                          */
/* ------------------------------------------------------------------ */

export interface MetricDelta {
  key: string;
  label: string;
  before: number;
  after: number;
  delta: number;
  unit: 'money' | 'months' | 'percent';
}

export interface GoalImpact {
  goal: GoalProgress['goal'];
  before: GoalProgress;
  after: GoalProgress;
  delayMonths: number;
}

export interface ScenarioResult {
  before: PlanMetrics;
  after: PlanMetrics;
  deltas: MetricDelta[];
  /** How much planned saving would have to shrink to keep breathing room ≥ 0. */
  savingsShortfall: number;
  goals: GoalImpact[];
}

export function runScenario(plan: FinancialPlan, scenario: Scenario, now: Date = new Date()): ScenarioResult {
  const before = computeMetrics(plan, now);
  const afterPlan = applyScenario(plan, scenario);
  const after = computeMetrics(afterPlan, now);
  const t = messages().planning.deltas;

  const deltas: MetricDelta[] = [
    d('safeToSpend', t.safeToSpend, before.safeToSpend, after.safeToSpend, 'money'),
    d('breathingRoom', t.breathingRoom, before.breathingRoom, after.breathingRoom, 'money'),
    d('flexible', t.flexible, before.expenses.flexible, after.expenses.flexible, 'money'),
    d('savings', t.savings, before.savings.total, after.savings.total, 'money'),
    d('savingsRate', t.savingsRate, before.savings.rate, after.savings.rate, 'percent'),
    d('lifestyle', t.lifestyle, before.lifestyleCost, after.lifestyleCost, 'money'),
    d('essential', t.essential, before.essentialCost, after.essentialCost, 'money'),
    d('income', t.income, before.income.total, after.income.total, 'money'),
    d(
      'essentialRunway',
      t.essentialRunway,
      before.resilience.essentialRunwayMonths,
      after.resilience.essentialRunwayMonths,
      'months',
    ),
    d(
      'lifestyleRunway',
      t.lifestyleRunway,
      before.resilience.lifestyleRunwayMonths,
      after.resilience.lifestyleRunwayMonths,
      'months',
    ),
  ];

  // If breathing room goes negative, savings would realistically have to absorb it.
  const savingsShortfall = after.breathingRoom < 0 ? Math.min(-after.breathingRoom, after.savings.total) : 0;
  const goalsBefore = allGoalProgress(plan, now);
  let goals: GoalImpact[] = [];
  if (savingsShortfall > 0 && after.savings.total > 0) {
    const factor = (after.savings.total - savingsShortfall) / after.savings.total;
    const reducedPlan: FinancialPlan = {
      ...afterPlan,
      goals: afterPlan.goals.map((g) => ({ ...g, monthlyContribution: g.monthlyContribution * factor })),
      accounts: afterPlan.accounts.map((a) => (a.monthlyDeposit ? { ...a, monthlyDeposit: a.monthlyDeposit * factor } : a)),
    };
    const goalsAfter = allGoalProgress(reducedPlan, now);
    goals = goalsBefore.map((b, i) => {
      const a = goalsAfter[i];
      const delay =
        Number.isFinite(a.monthsToTarget) && Number.isFinite(b.monthsToTarget)
          ? a.monthsToTarget - b.monthsToTarget
          : Number.isFinite(b.monthsToTarget)
            ? Infinity
            : 0;
      return { goal: b.goal, before: b, after: a, delayMonths: delay };
    });
  } else {
    goals = goalsBefore.map((b) => ({ goal: b.goal, before: b, after: b, delayMonths: 0 }));
  }

  return { before, after, deltas, savingsShortfall, goals };
}

function d(key: string, label: string, before: number, after: number, unit: MetricDelta['unit']): MetricDelta {
  return { key, label, before, after, delta: after - before, unit };
}
