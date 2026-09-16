import type { ExpenseItem, FinancialPlan, IncomeSource } from '../types';
import { emptyPlan } from '../types';

export const NOW = new Date(2026, 8, 16); // 16 Sep 2026

export function income(partial: Partial<IncomeSource> & { amount: number }): IncomeSource {
  return {
    id: partial.id ?? `inc_${partial.amount}`,
    name: partial.name ?? 'Income',
    kind: partial.kind ?? 'salary',
    frequency: partial.frequency ?? 'monthly',
    reliability: partial.reliability ?? 'reliable',
    includeInBaseline: partial.includeInBaseline ?? true,
    amount: partial.amount,
  };
}

export function expense(partial: Partial<ExpenseItem> & { amount: number; name: string }): ExpenseItem {
  return {
    id: partial.id ?? `exp_${partial.name.toLowerCase().replace(/\s+/g, '_')}`,
    category: partial.category ?? 'living',
    subcategory: partial.subcategory ?? 'custom',
    frequency: partial.frequency ?? 'monthly',
    fixed: partial.fixed ?? true,
    essential: partial.essential ?? true,
    committed: partial.committed ?? true,
    tags: partial.tags ?? [],
    ...partial,
  };
}

/**
 * The worked example from PRD §16 / §18.24:
 * reliable 31,500 · variable 4,500 · lifestyle 25,200 · saving 6,000 → unallocated 4,800.
 */
export function prdExamplePlan(): FinancialPlan {
  const plan = emptyPlan(NOW);
  plan.userName = 'Test';
  plan.income = [
    income({ id: 'salary', name: 'Salary', amount: 31500, reliability: 'reliable' }),
    income({ id: 'freelance', name: 'Freelance', amount: 4500, reliability: 'variable', kind: 'freelance' }),
  ];
  plan.expenses = [
    expense({ id: 'rent', name: 'Rent', category: 'home', amount: 8500 }),
    expense({
      id: 'electricity',
      name: 'Electricity',
      category: 'home',
      amount: 500,
      fixed: false,
      range: { low: 300, high: 900 },
    }),
    expense({ id: 'groceries', name: 'Groceries', category: 'living', amount: 4000, fixed: false, committed: false }),
    expense({
      id: 'restaurants',
      name: 'Restaurants',
      category: 'living',
      amount: 2100,
      fixed: false,
      essential: false,
      committed: false,
    }),
    expense({ id: 'car_finance', name: 'Car finance', category: 'transport', amount: 3200, tags: ['car', 'debt'] }),
    expense({
      id: 'fuel',
      name: 'Fuel',
      category: 'transport',
      amount: 1200,
      fixed: false,
      committed: false,
      tags: ['car'],
      range: { low: 900, high: 1600 },
    }),
    expense({ id: 'car_insurance', name: 'Car insurance', category: 'transport', amount: 800, tags: ['car', 'insurance'] }),
    expense({
      id: 'vehicle_tax',
      name: 'Vehicle tax',
      category: 'transport',
      amount: 3000,
      frequency: 'yearly',
      nextDate: '2026-10-12',
      tags: ['car'],
    }),
    expense({ id: 'student_loan', name: 'Student loan', category: 'finance', amount: 1500, tags: ['debt'] }),
    expense({
      id: 'streaming',
      name: 'Streaming',
      category: 'leisure',
      amount: 400,
      essential: false,
      committed: false,
      tags: ['subscription'],
    }),
    expense({
      id: 'gym',
      name: 'Gym',
      category: 'leisure',
      amount: 800,
      essential: false,
      committed: false,
      tags: ['subscription'],
    }),
    expense({
      id: 'holiday',
      name: 'Holiday',
      category: 'planned',
      amount: 12000,
      frequency: 'yearly',
      nextDate: '2027-06-15',
      fixed: false,
      essential: false,
      committed: false,
    }),
    expense({
      id: 'christmas',
      name: 'Christmas',
      category: 'planned',
      amount: 6000,
      frequency: 'yearly',
      nextDate: '2026-12-20',
      fixed: false,
      essential: false,
      committed: false,
    }),
    expense({
      id: 'water',
      name: 'Water',
      category: 'home',
      amount: 300,
      includedElsewhere: true,
    }),
  ];
  // Monthly: 8500+500+4000+2100+3200+1200+800+250+1500+400+800+1000+500 = 24,750
  // We want 25,200 → add 450 of 'other' leisure
  plan.expenses.push(
    expense({ id: 'hobbies', name: 'Hobbies', category: 'leisure', amount: 450, fixed: false, essential: false, committed: false }),
  );
  plan.accounts = [
    { id: 'a1', name: 'Salary account', kind: 'salary', balance: 18500 },
    { id: 'a2', name: 'Savings account', kind: 'savings', balance: 72000 },
    { id: 'a3', name: 'Emergency fund', kind: 'emergency', balance: 40000, monthlyDeposit: 2000 },
    { id: 'a4', name: 'Investments', kind: 'investment', balance: 110000, monthlyDeposit: 3000 },
  ];
  // The emergency and investment goals are saved in their accounts, which hold the amounts.
  plan.goals = [
    {
      id: 'g1',
      name: 'Emergency fund',
      kind: 'emergency',
      purpose: 'long_term',
      currentAmount: 0,
      monthlyContribution: 0,
      targetAmount: 60000,
      linkedAccountId: 'a3',
    },
    {
      id: 'g2',
      name: 'Investments',
      kind: 'investment',
      purpose: 'long_term',
      currentAmount: 0,
      monthlyContribution: 0,
      linkedAccountId: 'a4',
    },
    {
      id: 'g3',
      name: 'Car fund',
      kind: 'purchase',
      purpose: 'future_spending',
      currentAmount: 64000,
      monthlyContribution: 1000,
      targetAmount: 100000,
    },
  ];
  return plan;
}
