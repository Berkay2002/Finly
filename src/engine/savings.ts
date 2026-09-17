import { accountKindMeta, accountRole, goalKindMeta, type AccountRole } from './taxonomy';
import type { Account, FinancialPlan, GoalKind, SavingsGoal } from './types';

/**
 * One place money is saved, as the Savings page shows it. An account holds the balance and the
 * monthly deposit; a goal adds what the money is for. A goal is linked to at most one account and
 * an account to at most one goal, so each amount is counted once.
 */
export interface SavingsPot extends SavingsGoal {
  /** The goal behind the pot; absent for a savings account with no goal. */
  goalId?: string;
  /** The account holding the money; absent for a goal saved outside any account. */
  accountId?: string;
}

/** Accounts whose money is saved rather than spent: they show on the Savings page on their own. */
export const SAVINGS_ROLES: readonly AccountRole[] = ['cash_savings', 'emergency', 'investment'];

export function isSavingsAccount(a: Pick<Account, 'kind'>): boolean {
  return SAVINGS_ROLES.includes(accountRole(a.kind));
}

/** Id of the everyday account added when a plan has none, the same on every device so syncing does not double it. */
export const DEFAULT_EVERYDAY_ACCOUNT_ID = 'acc_everyday';

/** The account the pay lands in and each month's leftover stays on: the salary account, else the first everyday one. */
export function landingAccount(plan: Pick<FinancialPlan, 'accounts'>): Account | undefined {
  return plan.accounts.find((a) => a.kind === 'salary') ?? plan.accounts.find((a) => accountRole(a.kind) === 'everyday');
}

/** The plan with an everyday account (balance 0) when it has none, so the money coming in has somewhere to land. */
export function ensureLandingAccount(plan: FinancialPlan): FinancialPlan {
  if (landingAccount(plan)) return plan;
  const account: Account = { id: DEFAULT_EVERYDAY_ACCOUNT_ID, name: accountKindMeta('everyday').label, kind: 'everyday', balance: 0 };
  return { ...plan, accounts: [...plan.accounts, account] };
}

const KIND_OF_ROLE: Partial<Record<AccountRole, GoalKind>> = { emergency: 'emergency', investment: 'investment' };

/** The pot a savings account with no goal shows as. */
export function accountPot(a: Account): SavingsPot {
  const kind = KIND_OF_ROLE[accountRole(a.kind)] ?? 'general';
  return {
    id: a.id,
    accountId: a.id,
    linkedAccountId: a.id,
    name: a.name,
    ...(a.institution ? { description: a.institution } : {}),
    kind,
    purpose: goalKindMeta(kind).purpose,
    currentAmount: a.balance,
    ...(a.balances ? { balances: a.balances } : {}),
    monthlyContribution: Math.max(0, a.monthlyDeposit ?? 0),
  };
}

/** Goals in their saved order with linked amounts read from the account, then savings accounts with no goal. */
export function savingsPots(plan: Pick<FinancialPlan, 'accounts' | 'goals'>): SavingsPot[] {
  const accounts = new Map(plan.accounts.map((a) => [a.id, a]));
  const claimed = new Set<string>();
  const pots: SavingsPot[] = plan.goals.map((g) => {
    const a = g.linkedAccountId ? accounts.get(g.linkedAccountId) : undefined;
    if (!a || claimed.has(a.id)) return { ...g, goalId: g.id };
    claimed.add(a.id);
    return {
      ...g,
      goalId: g.id,
      accountId: a.id,
      currentAmount: a.balance,
      balances: a.balances,
      monthlyContribution: Math.max(0, a.monthlyDeposit ?? 0),
    };
  });
  for (const a of plan.accounts) if (isSavingsAccount(a) && !claimed.has(a.id)) pots.push(accountPot(a));
  return pots;
}

export function goalForAccount(plan: Pick<FinancialPlan, 'goals'>, accountId: string): SavingsGoal | undefined {
  return plan.goals.find((g) => g.linkedAccountId === accountId);
}

/**
 * Plans saved before accounts held the money kept a balance and a contribution on linked goals too.
 * The account's balance wins, the goal's contribution becomes the account's deposit, and the goal's
 * own amounts are cleared. Links to missing accounts, and second goals on one account, are undone.
 * `autoLink` also links a goal to the one savings account with no goal that holds exactly its amount:
 * the same money entered twice. Idempotent; returns the same plan when there is nothing to do.
 */
export function migrateLinkedGoals(plan: FinancialPlan, { autoLink = false }: { autoLink?: boolean } = {}): FinancialPlan {
  const accounts = new Map(plan.accounts.map((a) => [a.id, a]));
  const claimed = new Set<string>();
  const deposits = new Map<string, number>();
  let changed = false;

  const absorb = (g: SavingsGoal, accountId: string): SavingsGoal => {
    claimed.add(accountId);
    if (g.linkedAccountId === accountId && g.currentAmount === 0 && g.monthlyContribution === 0 && !g.balances) return g;
    changed = true;
    if (g.monthlyContribution > 0) deposits.set(accountId, g.monthlyContribution);
    const { balances: _b, ...rest } = g;
    void _b;
    return { ...rest, linkedAccountId: accountId, currentAmount: 0, monthlyContribution: 0 };
  };

  let goals: SavingsGoal[] = plan.goals.map((g) => {
    if (!g.linkedAccountId) return g;
    if (!accounts.has(g.linkedAccountId) || claimed.has(g.linkedAccountId)) {
      changed = true;
      const { linkedAccountId: _l, ...rest } = g;
      void _l;
      return rest;
    }
    return absorb(g, g.linkedAccountId);
  });

  if (autoLink) {
    goals = goals.map((g) => {
      if (g.linkedAccountId || g.currentAmount <= 0) return g;
      const twin = plan.accounts.find((a) => isSavingsAccount(a) && !claimed.has(a.id) && a.balance === g.currentAmount);
      return twin ? absorb(g, twin.id) : g;
    });
  }

  if (!changed) return plan;
  return {
    ...plan,
    goals,
    accounts: plan.accounts.map((a) => (deposits.has(a.id) ? { ...a, monthlyDeposit: deposits.get(a.id) } : a)),
  };
}
