import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { newId } from '@/lib/id';
import { buildSnapshot, monthsToClose, withMonthValue, type MetricsSnapshot, type SnapshotMap } from '@/engine/history';
import { monthKeyOf } from '@/engine/metrics';
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

export type { MetricsSnapshot, SnapshotMap } from '@/engine/history';

/** The whole persisted state: what export, import and sync move around. */
export interface PlanData {
  plan: FinancialPlan;
  snapshots: SnapshotMap;
}

type Draft<T extends { id: string }> = Omit<T, 'id'> & { id?: string };

interface PlanState {
  plan: FinancialPlan;
  snapshots: SnapshotMap;
  hydrated: boolean;

  setUserName: (name: string) => void;
  setCurrency: (currency: string) => void;

  addIncome: (draft: Draft<IncomeSource>) => string;
  updateIncome: (id: string, patch: Partial<IncomeSource>) => void;
  removeIncome: (id: string) => void;

  addExpense: (draft: Draft<ExpenseItem>) => string;
  updateExpense: (id: string, patch: Partial<ExpenseItem>) => void;
  removeExpense: (id: string) => void;
  /** Record (or clear, with null) the real bill for a variable item in a month (YYYY-MM). */
  setExpenseActual: (id: string, month: string, amount: number | null) => void;

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

  /** Freeze `month`'s numbers from the live plan. Pass `today` to pin the timestamp (tests). */
  saveSnapshot: (month: string, today?: Date) => void;
  /** Close every month that is due (see `monthsToClose`). Returns the keys closed; idempotent. */
  closeMonths: (now?: Date) => string[];

  loadSample: () => void;
  reset: () => void;
  importPlan: (data: FinancialPlan | PlanData) => void;
  /** Replace plan and history verbatim (sync applies a remote copy this way; `updatedAt` is kept). */
  replaceAll: (data: PlanData) => void;
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
        setExpenseActual: (id, month, amount) =>
          set((s) => {
            const apply = (plan: FinancialPlan): FinancialPlan => ({
              ...plan,
              expenses: plan.expenses.map((x) => {
                if (x.id !== id) return x;
                const actuals = { ...(x.actuals ?? {}) };
                if (amount === null || !Number.isFinite(amount)) delete actuals[month];
                else actuals[month] = Math.max(0, amount);
                return { ...x, actuals: Object.keys(actuals).length > 0 ? actuals : undefined };
              }),
            });
            const plan = touch({ ...apply(s.plan), isSample: undefined });
            // A closed month keeps its own copy of the plan; the bill belongs to both.
            const frozen = s.snapshots[month];
            if (!frozen?.plan) return { plan };
            const frozenPlan = apply(frozen.plan);
            const snap: MetricsSnapshot = { ...buildSnapshot(frozenPlan, month), savedAt: frozen.savedAt, plan: frozenPlan };
            return { plan, snapshots: { ...s.snapshots, [month]: snap } };
          }),

        addAccount: (draft) => {
          const id = draft.id ?? newId('acc');
          const balances = withMonthValue(draft.balances, monthKeyOf(new Date()), draft.balance);
          mutate((p) => ({ ...p, accounts: [...p.accounts, { ...draft, id, balances }] }));
          return id;
        },
        updateAccount: (id, patch) =>
          mutate((p) => ({
            ...p,
            accounts: p.accounts.map((x) => {
              if (x.id !== id) return x;
              const next = { ...x, ...patch };
              if (typeof patch.balance === 'number') next.balances = withMonthValue(x.balances, monthKeyOf(new Date()), patch.balance);
              return next;
            }),
          })),
        removeAccount: (id) => mutate((p) => ({ ...p, accounts: p.accounts.filter((x) => x.id !== id) })),

        addGoal: (draft) => {
          const id = draft.id ?? newId('goal');
          const balances = withMonthValue(draft.balances, monthKeyOf(new Date()), draft.currentAmount);
          mutate((p) => ({ ...p, goals: [...p.goals, { ...draft, id, balances }] }));
          return id;
        },
        updateGoal: (id, patch) =>
          mutate((p) => ({
            ...p,
            goals: p.goals.map((x) => {
              if (x.id !== id) return x;
              const next = { ...x, ...patch };
              if (typeof patch.currentAmount === 'number')
                next.balances = withMonthValue(x.balances, monthKeyOf(new Date()), patch.currentAmount);
              return next;
            }),
          })),
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

        saveSnapshot: (month, today = new Date()) =>
          set((s) => ({ snapshots: { ...s.snapshots, [month]: buildSnapshot(s.plan, month, today) } })),
        closeMonths: (now = new Date()) => {
          const { plan, snapshots } = get();
          const due = monthsToClose(plan, snapshots, now);
          if (due.length === 0) return due;
          const next: SnapshotMap = { ...snapshots };
          for (const key of due) next[key] = buildSnapshot(plan, key, now);
          set({ snapshots: next });
          return due;
        },

        loadSample: () => set({ plan: samplePlan(), snapshots: {} }),
        reset: () => set({ plan: emptyPlan(), snapshots: {} }),
        importPlan: (data) => {
          const { plan, snapshots } = 'plan' in data ? data : { plan: data, snapshots: {} };
          set({ plan: touch({ ...emptyPlan(), ...plan, isSample: undefined }), snapshots });
        },
        replaceAll: ({ plan, snapshots }) => set({ plan, snapshots }),
        setHydrated: () => set({ hydrated: true }),
      };
    },
    {
      name: 'finly.plan.v1',
      version: 2,
      partialize: (s) => ({ plan: s.plan, snapshots: s.snapshots }),
      // Earlier versions stored the same shape minus the optional history fields; nothing needs rewriting.
      migrate: (persisted) => {
        const s = (persisted ?? {}) as Partial<PlanData>;
        return { plan: s.plan ? { ...emptyPlan(), ...s.plan } : emptyPlan(), snapshots: s.snapshots ?? {} };
      },
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    },
  ),
);

/** Normalises a parsed v1 plan object; throws when it is not one. */
export function parsePlan(input: unknown): FinancialPlan {
  const raw = input as Partial<FinancialPlan> | null;
  if (!raw || typeof raw !== 'object' || raw.version !== 1 || !Array.isArray(raw.income)) {
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
