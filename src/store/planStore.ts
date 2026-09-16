import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { newId } from '@/lib/id';
import { computeMetrics } from '@/engine/metrics';
import type {
  Account,
  ExpenseItem,
  FinancialPlan,
  IncomeSource,
  OnboardingStep,
  SavingsGoal,
} from '@/engine/types';
import { emptyPlan } from '@/engine/types';
import { samplePlan } from './sampleData';

/** Numbers frozen at the end of a month so later months can show deltas (Tracking Mode groundwork). */
export interface MetricsSnapshot {
  month: string; // YYYY-MM
  savedAt: string;
  income: number;
  lifestyleCost: number;
  savings: number;
  breathingRoom: number;
  safeToSpend: number;
  totalAssets: number;
  cashInBank: number;
  investments: number;
  savingsRate: number;
  byCategory: Record<string, number>;
}

type Draft<T extends { id: string }> = Omit<T, 'id'> & { id?: string };

interface PlanState {
  plan: FinancialPlan;
  snapshots: Record<string, MetricsSnapshot>;
  hydrated: boolean;

  setUserName: (name: string) => void;
  setCurrency: (currency: string) => void;

  addIncome: (draft: Draft<IncomeSource>) => string;
  updateIncome: (id: string, patch: Partial<IncomeSource>) => void;
  removeIncome: (id: string) => void;

  addExpense: (draft: Draft<ExpenseItem>) => string;
  updateExpense: (id: string, patch: Partial<ExpenseItem>) => void;
  removeExpense: (id: string) => void;

  addAccount: (draft: Draft<Account>) => string;
  updateAccount: (id: string, patch: Partial<Account>) => void;
  removeAccount: (id: string) => void;

  addGoal: (draft: Draft<SavingsGoal>) => string;
  updateGoal: (id: string, patch: Partial<SavingsGoal>) => void;
  removeGoal: (id: string) => void;

  completeStep: (step: OnboardingStep) => void;
  finishOnboarding: () => void;
  reopenOnboarding: () => void;
  startOnboarding: () => void;

  saveSnapshot: (month: string, now?: Date) => void;

  loadSample: () => void;
  reset: () => void;
  importPlan: (plan: FinancialPlan) => void;
  setHydrated: () => void;
}

function touch(plan: FinancialPlan): FinancialPlan {
  return { ...plan, updatedAt: new Date().toISOString() };
}

export const usePlanStore = create<PlanState>()(
  persist(
    (set, get) => {
      const mutate = (fn: (plan: FinancialPlan) => FinancialPlan) =>
        set((s) => ({ plan: touch({ ...fn(s.plan), isSample: undefined }) }));

      return {
        plan: emptyPlan(),
        snapshots: {},
        hydrated: false,

        setUserName: (userName) => mutate((p) => ({ ...p, userName })),
        setCurrency: (currency) => mutate((p) => ({ ...p, currency })),

        addIncome: (draft) => {
          const id = draft.id ?? newId('inc');
          mutate((p) => ({ ...p, income: [...p.income, { ...draft, id }] }));
          return id;
        },
        updateIncome: (id, patch) =>
          mutate((p) => ({ ...p, income: p.income.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
        removeIncome: (id) => mutate((p) => ({ ...p, income: p.income.filter((x) => x.id !== id) })),

        addExpense: (draft) => {
          const id = draft.id ?? newId('exp');
          mutate((p) => ({ ...p, expenses: [...p.expenses, { ...draft, id }] }));
          return id;
        },
        updateExpense: (id, patch) =>
          mutate((p) => ({ ...p, expenses: p.expenses.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
        removeExpense: (id) => mutate((p) => ({ ...p, expenses: p.expenses.filter((x) => x.id !== id) })),

        addAccount: (draft) => {
          const id = draft.id ?? newId('acc');
          mutate((p) => ({ ...p, accounts: [...p.accounts, { ...draft, id }] }));
          return id;
        },
        updateAccount: (id, patch) =>
          mutate((p) => ({ ...p, accounts: p.accounts.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
        removeAccount: (id) => mutate((p) => ({ ...p, accounts: p.accounts.filter((x) => x.id !== id) })),

        addGoal: (draft) => {
          const id = draft.id ?? newId('goal');
          mutate((p) => ({ ...p, goals: [...p.goals, { ...draft, id }] }));
          return id;
        },
        updateGoal: (id, patch) =>
          mutate((p) => ({ ...p, goals: p.goals.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
        removeGoal: (id) => mutate((p) => ({ ...p, goals: p.goals.filter((x) => x.id !== id) })),

        completeStep: (step) =>
          mutate((p) =>
            p.onboarding.completedSteps.includes(step)
              ? p
              : { ...p, onboarding: { ...p.onboarding, completedSteps: [...p.onboarding.completedSteps, step] } },
          ),
        finishOnboarding: () => mutate((p) => ({ ...p, onboarding: { ...p.onboarding, completed: true } })),
        // Re-run the session on the current data: progress is cleared so no step shows as done.
        reopenOnboarding: () =>
          mutate((p) => ({ ...p, onboarding: { completedSteps: [], completed: false } })),
        // Start a fresh session from the welcome screen. A demo plan is discarded;
        // a plan with the user's own data is kept, only its progress is cleared.
        startOnboarding: () =>
          set((s) =>
            s.plan.isSample
              ? { plan: emptyPlan(), snapshots: {} }
              : { plan: touch({ ...s.plan, onboarding: { completedSteps: [], completed: false } }) },
          ),

        saveSnapshot: (month, now = new Date()) => {
          const m = computeMetrics(get().plan, now);
          const snap: MetricsSnapshot = {
            month,
            savedAt: new Date().toISOString(),
            income: m.income.total,
            lifestyleCost: m.lifestyleCost,
            savings: m.savings.total,
            breathingRoom: m.breathingRoom,
            safeToSpend: m.safeToSpend,
            totalAssets: m.position.totalAssets,
            cashInBank: m.position.cashInBank,
            investments: m.position.investments,
            savingsRate: m.savings.rate,
            byCategory: { ...m.expenses.byCategory },
          };
          set((s) => ({ snapshots: { ...s.snapshots, [month]: snap } }));
        },

        loadSample: () => set({ plan: samplePlan() }),
        reset: () => set({ plan: emptyPlan(), snapshots: {} }),
        importPlan: (plan) => set({ plan: touch({ ...emptyPlan(), ...plan, isSample: undefined }) }),
        setHydrated: () => set({ hydrated: true }),
      };
    },
    {
      name: 'finly.plan.v1',
      partialize: (s) => ({ plan: s.plan, snapshots: s.snapshots }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    },
  ),
);

export function serializePlan(plan: FinancialPlan): string {
  return JSON.stringify(plan, null, 2);
}

export function parsePlan(json: string): FinancialPlan {
  const raw = JSON.parse(json) as Partial<FinancialPlan>;
  if (!raw || typeof raw !== 'object' || raw.version !== 1) {
    throw new Error('Not a Finly plan file');
  }
  const base = emptyPlan();
  return {
    ...base,
    ...raw,
    income: Array.isArray(raw.income) ? raw.income : [],
    expenses: Array.isArray(raw.expenses) ? raw.expenses : [],
    accounts: Array.isArray(raw.accounts) ? raw.accounts : [],
    goals: Array.isArray(raw.goals) ? raw.goals : [],
    onboarding: raw.onboarding ?? base.onboarding,
  };
}
