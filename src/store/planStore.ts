import { messages } from '@/i18n';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { newId } from '@/lib/id';
import { applyCommute } from '@/engine/commute';
import { migrateLegacyDebts } from '@/engine/debts';
import { shareUsage, withTariffAmounts } from '@/engine/electricity';
import { reconcilePriceLink, refreshPriceLinks, type PriceInputs } from '@/engine/priceLinks';
import { applyQuotes, holdingsPatch, type QuoteResult } from '@/engine/holdings';
import { applyHome } from '@/engine/home';
import { buildSnapshot, monthsToClose, withMonthValue, type MetricsSnapshot, type SnapshotMap } from '@/engine/history';
import { monthKeyOf } from '@/engine/metrics';
import { accountPot, ensureLandingAccount, migrateLinkedGoals, type SavingsPot } from '@/engine/savings';
import type {
  Account,
  Commute,
  CommutePrice,
  Debt,
  ExpenseItem,
  FinancialPlan,
  HomeLocation,
  Household,
  IncomeSource,
  OnboardingStep,
  SavingsGoal,
  SpendEntry,
  SpendGroup,
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

/** A savings pot being edited: a new one has no id. */
export type PotDraft = Draft<SavingsPot>;

interface PlanState {
  plan: FinancialPlan;
  snapshots: SnapshotMap;
  hydrated: boolean;

  setUserName: (name: string) => void;
  /** A small data URL from `fileToAvatar`, or undefined to remove the picture. */
  setAvatar: (avatar: string | undefined) => void;
  /** Four-digit year, or undefined to clear it. */
  setBirthYear: (year: number | undefined) => void;
  setCurrency: (currency: string) => void;
  /** Where the household lives; salaries and electricity bills that followed the old home follow the new one. */
  setHome: (home: HomeLocation) => void;
  /** Who the household feeds, for the groceries estimate. */
  setHousehold: (household: Household) => void;
  /**
   * Save how the household commutes and write the counts and prices to lunches, tickets, cards,
   * parking and congestion charges. `skip` leaves those lines' items untouched.
   */
  setCommute: (commute: Commute, prices: Record<CommutePrice, number>, skip?: ReadonlySet<CommutePrice>) => void;

  addIncome: (draft: Draft<IncomeSource>) => string;
  updateIncome: (id: string, patch: Partial<IncomeSource>) => void;
  removeIncome: (id: string) => void;

  addExpense: (draft: Draft<ExpenseItem>) => string;
  updateExpense: (id: string, patch: Partial<ExpenseItem>) => void;
  removeExpense: (id: string) => void;
  /** Record (or clear, with null) the real bill for a variable item in a month (YYYY-MM). */
  setExpenseActual: (id: string, month: string, amount: number | null) => void;
  /** Record (or clear, with null) what was spent on a group of everyday spending in a month (YYYY-MM). */
  setEverydaySpend: (group: SpendGroup, month: string, entry: SpendEntry | null) => void;

  addAccount: (draft: Draft<Account>) => string;
  updateAccount: (id: string, patch: Partial<Account>) => void;
  removeAccount: (id: string) => void;

  addDebt: (draft: Draft<Debt>) => string;
  updateDebt: (id: string, patch: Partial<Debt>) => void;
  removeDebt: (id: string) => void;

  addGoal: (draft: Draft<SavingsGoal>) => string;
  updateGoal: (id: string, patch: Partial<SavingsGoal>) => void;
  removeGoal: (id: string) => void;
  /**
   * Save a pot from the Savings sheet: the balance and monthly deposit go to its account when it has
   * one, the rest to its goal. A savings account with no goal gets one only when something goal-like was set.
   */
  saveSavingsPot: (draft: PotDraft) => void;

  completeStep: (step: OnboardingStep) => void;
  finishOnboarding: () => void;
  reopenOnboarding: () => void;
  startOnboarding: () => void;

  /** Bring price-linked costs (food index, spot price) to the newest month. No-op when nothing is newer. */
  refreshPriceLinks: (inputs: PriceInputs) => void;
  /** Move holdings to fresh prices; a no-op when nothing changed. */
  refreshHoldings: (result: QuoteResult, today?: Date) => void;

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

/** Recompute a calculated electricity bill after it changed and pass its kWh on to the other half. */
function withElectricity(expenses: ExpenseItem[], id: string): ExpenseItem[] {
  const changed = expenses.map((x) => (x.id === id ? withTariffAmounts(x) : x));
  return shareUsage(changed, id);
}

function touch(plan: FinancialPlan): FinancialPlan {
  return { ...plan, updatedAt: new Date().toISOString() };
}

/**
 * Applies a change about one month's real figures to the live plan and, when that month is already
 * closed, to its frozen copy too, rebuilding the snapshot so the closed month shows the figure.
 */
function withMonthApplied(
  s: { plan: FinancialPlan; snapshots: SnapshotMap },
  month: string,
  apply: (plan: FinancialPlan) => FinancialPlan,
): Partial<{ plan: FinancialPlan; snapshots: SnapshotMap }> {
  const plan = touch({ ...apply(s.plan), isSample: undefined });
  const frozen = s.snapshots[month];
  if (!frozen?.plan) return { plan };
  const frozenPlan = apply(frozen.plan);
  const snap: MetricsSnapshot = { ...buildSnapshot(frozenPlan, month), savedAt: frozen.savedAt, plan: frozenPlan };
  return { plan, snapshots: { ...s.snapshots, [month]: snap } };
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
        setAvatar: (avatar) => mutate((p) => ({ ...p, avatar })),
        setBirthYear: (birthYear) => mutate((p) => ({ ...p, birthYear })),
        setCurrency: (currency) => mutate((p) => ({ ...p, currency })),
        setHome: (home) => mutate((p) => applyHome(p, home)),
        setHousehold: (household) => mutate((p) => ({ ...p, household })),
        setCommute: (commute, prices, skip) => mutate((p) => applyCommute(p, commute, prices, () => newId('exp'), skip)),

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
          mutate((p) => ({ ...p, expenses: withElectricity([...p.expenses, { ...draft, id }], id) }));
          return id;
        },
        updateExpense: (id, patch) =>
          mutate((p) => ({
            ...p,
            expenses: withElectricity(
              p.expenses.map((x) => (x.id === id ? reconcilePriceLink(x, { ...x, ...patch }) : x)),
              id,
            ),
          })),
        refreshPriceLinks: (inputs) => {
          const { expenses, changed } = refreshPriceLinks(get().plan.expenses, inputs);
          if (changed.length === 0) return;
          const electricity = changed.filter((id) => expenses.find((e) => e.id === id)?.tariff);
          mutate((p) => ({ ...p, expenses: electricity.reduce(shareUsage, expenses) }));
        },
        refreshHoldings: (result, today = new Date()) => {
          const before = get().plan.accounts;
          const accounts = applyQuotes(before, result, today.toISOString().slice(0, 10));
          if (!accounts) return;
          const month = monthKeyOf(today);
          mutate((p) => ({
            ...p,
            accounts: accounts.map((a, i) => (a === before[i] ? a : { ...a, balances: withMonthValue(a.balances, month, a.balance) })),
          }));
        },
        removeExpense: (id) => mutate((p) => ({ ...p, expenses: p.expenses.filter((x) => x.id !== id) })),
        setExpenseActual: (id, month, amount) =>
          set((s) =>
            withMonthApplied(s, month, (plan) => ({
              ...plan,
              expenses: plan.expenses.map((x) => {
                if (x.id !== id) return x;
                const actuals = { ...(x.actuals ?? {}) };
                if (amount === null || !Number.isFinite(amount)) delete actuals[month];
                else actuals[month] = Math.max(0, amount);
                return { ...x, actuals: Object.keys(actuals).length > 0 ? actuals : undefined };
              }),
            })),
          ),
        setEverydaySpend: (group, month, entry) =>
          set((s) =>
            withMonthApplied(s, month, (plan) => {
              const byMonth = { ...(plan.everydaySpend?.[group] ?? {}) };
              if (!entry || !Number.isFinite(entry.amount)) delete byMonth[month];
              else byMonth[month] = { amount: Math.max(0, entry.amount), ...(entry.asOf ? { asOf: entry.asOf } : {}) };
              const everydaySpend = { ...(plan.everydaySpend ?? {}) };
              if (Object.keys(byMonth).length > 0) everydaySpend[group] = byMonth;
              else delete everydaySpend[group];
              return { ...plan, everydaySpend: Object.keys(everydaySpend).length > 0 ? everydaySpend : undefined };
            }),
          ),

        addAccount: (draft) => {
          const id = draft.id ?? newId('acc');
          const account = { ...draft, ...holdingsPatch({ ...draft, id }) };
          const balances = withMonthValue(draft.balances, monthKeyOf(new Date()), account.balance);
          mutate((p) => ({ ...p, accounts: [...p.accounts, { ...account, id, balances }] }));
          return id;
        },
        updateAccount: (id, patch) =>
          mutate((p) => ({
            ...p,
            accounts: p.accounts.map((x) => {
              if (x.id !== id) return x;
              const merged = { ...x, ...patch };
              const next = 'holdings' in patch || 'cash' in patch ? { ...merged, ...holdingsPatch(merged) } : merged;
              if (typeof patch.balance === 'number' || next.balance !== x.balance) next.balances = withMonthValue(x.balances, monthKeyOf(new Date()), next.balance);
              return next;
            }),
          })),
        // A goal saved in the account keeps the amounts it showed and stays on the Savings page.
        removeAccount: (id) =>
          mutate((p) => {
            const a = p.accounts.find((x) => x.id === id);
            return {
              ...p,
              accounts: p.accounts.filter((x) => x.id !== id),
              goals: a ? p.goals.map((g) => (g.linkedAccountId === id ? unlinkGoal(g, a) : g)) : p.goals,
            };
          }),

        addDebt: (draft) => {
          const id = draft.id ?? newId('debt');
          const balances = withMonthValue(draft.balances, monthKeyOf(new Date()), draft.balance);
          mutate((p) => ({ ...p, debts: [...(p.debts ?? []), { ...draft, id, balances }] }));
          return id;
        },
        updateDebt: (id, patch) =>
          mutate((p) => ({
            ...p,
            debts: (p.debts ?? []).map((x) => {
              if (x.id !== id) return x;
              const next = { ...x, ...patch };
              if (typeof patch.balance === 'number') next.balances = withMonthValue(x.balances, monthKeyOf(new Date()), patch.balance);
              return next;
            }),
          })),
        removeDebt: (id) => mutate((p) => ({ ...p, debts: (p.debts ?? []).filter((x) => x.id !== id) })),

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
        saveSavingsPot: (draft) => mutate((p) => applyPotDraft(p, draft, () => newId('goal'), monthKeyOf(new Date()))),

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
          set({ plan: touch(normalizePlan({ ...emptyPlan(), ...plan, isSample: undefined })), snapshots: normalizeSnapshots(snapshots) });
        },
        replaceAll: ({ plan, snapshots }) => set({ plan: normalizePlan(plan), snapshots: normalizeSnapshots(snapshots) }),
        setHydrated: () => set({ hydrated: true }),
      };
    },
    {
      name: 'finly.plan.v1',
      version: 4,
      partialize: (s) => ({ plan: s.plan, snapshots: s.snapshots }),
      // v1–2 stored the same shape minus the optional history fields. v3 moved loan repayments out of
      // expenses into `debts`; closed months keep their frozen plans as they were. v4 moved the amounts of
      // goals linked to an account onto the account, and links goals that repeat an account's balance.
      migrate: (persisted, version) => {
        const s = (persisted ?? {}) as Partial<PlanData>;
        const autoLink = version < 4;
        const plan = s.plan ? normalizePlan(migrateLinkedGoals({ ...emptyPlan(), ...s.plan }, { autoLink })) : emptyPlan();
        return { plan, snapshots: normalizeSnapshots(s.snapshots ?? {}) };
      },
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    },
  ),
);

/** Brings a plan saved by an older version up to the current shape. Idempotent. */
export function normalizePlan(plan: FinancialPlan): FinancialPlan {
  return ensureLandingAccount(migrateLinkedGoals(migrateLegacyDebts({ ...plan, debts: Array.isArray(plan.debts) ? plan.debts : [] })));
}

/** Closed months' frozen plans get the linked-goal migration, so their savings read the same way. */
function normalizeSnapshots(snapshots: SnapshotMap): SnapshotMap {
  let changed = false;
  const next: SnapshotMap = {};
  for (const [key, snap] of Object.entries(snapshots)) {
    const plan = snap.plan ? migrateLinkedGoals(snap.plan) : undefined;
    if (plan !== snap.plan) changed = true;
    next[key] = plan === snap.plan ? snap : { ...snap, plan };
  }
  return changed ? next : snapshots;
}

/** The goal on its own again, holding what its account showed. */
function unlinkGoal(g: SavingsGoal, a: Account): SavingsGoal {
  const { linkedAccountId: _l, ...rest } = g;
  void _l;
  return {
    ...rest,
    currentAmount: a.balance,
    monthlyContribution: Math.max(0, a.monthlyDeposit ?? 0),
    ...(a.balances ? { balances: a.balances } : {}),
  };
}

const GOAL_FIELDS = ['name', 'description', 'kind', 'purpose', 'icon', 'targetAmount', 'targetDate'] as const;

/** Applies a pot saved from the Savings sheet (see `saveSavingsPot`). */
export function applyPotDraft(plan: FinancialPlan, draft: PotDraft, newGoalId: () => string, month: string): FinancialPlan {
  const { id, goalId, accountId: _a, ...fields } = draft;
  void _a;
  const account = draft.linkedAccountId ? plan.accounts.find((a) => a.id === draft.linkedAccountId) : undefined;

  if (!account) {
    const { linkedAccountId: _l, ...goal } = fields;
    void _l;
    const saved: SavingsGoal = {
      ...goal,
      id: goalId ?? newGoalId(),
      balances: withMonthValue(fields.balances, month, fields.currentAmount),
    };
    return {
      ...plan,
      goals: goalId ? plan.goals.map((g) => (g.id === goalId ? saved : g)) : [...plan.goals, saved],
    };
  }

  const deposit = Math.max(0, fields.monthlyContribution);
  const accounts = plan.accounts.map((a) => {
    if (a.id !== account.id) return a;
    const next: Account = { ...a, monthlyDeposit: deposit > 0 ? deposit : undefined };
    if (fields.currentAmount !== a.balance) {
      next.balance = fields.currentAmount;
      next.balances = withMonthValue(a.balances, month, fields.currentAmount);
    }
    return next;
  });

  // A savings account opened as a pot only becomes a goal when something beyond its own details was set.
  const plain = accountPot(account);
  const isAccountPot = !goalId && id === account.id;
  if (isAccountPot && GOAL_FIELDS.every((k) => (fields[k] || undefined) === (plain[k] || undefined))) {
    return { ...plan, accounts };
  }

  const { balances: _b, ...goal } = fields;
  void _b;
  const saved: SavingsGoal = {
    ...goal,
    id: goalId ?? newGoalId(),
    linkedAccountId: account.id,
    currentAmount: 0,
    monthlyContribution: 0,
  };
  const others = plan.goals.map((g) =>
    g.id !== saved.id && g.linkedAccountId === account.id ? unlinkGoal(g, account) : g,
  );
  return {
    ...plan,
    accounts,
    goals: goalId ? others.map((g) => (g.id === goalId ? saved : g)) : [...others, saved],
  };
}

/** Normalises a parsed v1 plan object; throws when it is not one. */
export function parsePlan(input: unknown): FinancialPlan {
  const raw = input as Partial<FinancialPlan> | null;
  if (!raw || typeof raw !== 'object' || raw.version !== 1 || !Array.isArray(raw.income)) {
    throw new Error(messages().settings.notPlanFile);
  }
  const base = emptyPlan();
  return {
    ...base,
    ...raw,
    income: Array.isArray(raw.income) ? raw.income : [],
    expenses: Array.isArray(raw.expenses) ? raw.expenses : [],
    accounts: Array.isArray(raw.accounts) ? raw.accounts : [],
    debts: Array.isArray(raw.debts) ? raw.debts : [],
    goals: Array.isArray(raw.goals) ? raw.goals : [],
    onboarding: raw.onboarding ?? base.onboarding,
  };
}
