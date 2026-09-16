import { addMonths, format, getDaysInMonth } from 'date-fns';
import { nextCsnDueDate } from '@/engine/debts';
import { BUNDLED_OUTLOOK, csnRateForYear } from '@/engine/rates';
import { debtKindMeta, suggestionBySlug } from '@/engine/taxonomy';
import { messages } from '@/i18n';
import type { ExpenseItem, FinancialPlan, Frequency } from '@/engine/types';
import { ONBOARDING_STEPS } from '@/engine/types';

/**
 * Demo data modelled on the "Alex" screens in the design folder.
 * Totals: income 34,200 · lifestyle 25,500 (of which 4,200 loan payments) · savings 5,700 · breathing room 3,000.
 */
export function samplePlan(now: Date = new Date()): FinancialPlan {
  const iso = now.toISOString();
  const t = messages().sample;
  const inMonths = (n: number, day = 12) => format(new Date(addMonths(now, n).setDate(day)), 'yyyy-MM-dd');

  let n = 0;
  const id = (p: string) => `${p}_${(n += 1).toString().padStart(3, '0')}`;

  const exp = (
    slug: string,
    amount: number,
    extra: Partial<ExpenseItem> & { frequency?: Frequency } = {},
  ): ExpenseItem => {
    const s = suggestionBySlug(slug);
    if (!s) throw new Error(`Unknown suggestion ${slug}`);
    return {
      id: id('exp'),
      name: s.name,
      category: s.category,
      subcategory: s.slug,
      amount,
      frequency: s.frequency,
      occurrences: s.occurrences,
      fixed: s.fixed,
      essential: s.essential,
      committed: s.committed,
      tags: s.tags ?? [],
      billingLag: s.billingLag,
      ...extra,
    };
  };

  return {
    version: 1,
    currency: 'SEK',
    userName: 'Alex',
    income: [
      {
        id: id('inc'),
        name: t.income.salary,
        note: t.income.salaryNote,
        kind: 'salary',
        amount: 28000,
        frequency: 'monthly',
        reliability: 'reliable',
        includeInBaseline: true,
      },
      {
        id: id('inc'),
        name: t.income.bonus,
        note: t.income.bonusNote,
        kind: 'bonus',
        amount: 36000,
        frequency: 'yearly',
        reliability: 'reliable',
        includeInBaseline: true,
      },
      {
        id: id('inc'),
        name: t.income.freelance,
        note: t.income.freelanceNote,
        kind: 'freelance',
        amount: 2700,
        frequency: 'monthly',
        reliability: 'variable',
        includeInBaseline: true,
      },
      {
        id: id('inc'),
        name: t.income.gifts,
        note: t.income.giftsNote,
        kind: 'other_irregular',
        amount: 6000,
        frequency: 'yearly',
        reliability: 'variable',
        includeInBaseline: true,
      },
    ],
    expenses: [
      // Home — 8,500
      exp('rent', 7300),
      exp('electricity', 500, { range: { low: 250, high: 950 }, note: t.expenses.variablePrice }),
      exp('internet', 350),
      exp('home_insurance', 350),
      exp('water', 0, { includedElsewhere: true, note: t.expenses.includedInRent }),
      // Living — 4,800
      exp('groceries', 740, { range: { low: 650, high: 880 } }),
      exp('restaurants', 450),
      exp('haircuts', 600),
      exp('clothes', 400),
      // Transport — 2,000 (the car loan is under loans)
      exp('fuel', 850, { range: { low: 600, high: 1200 } }),
      exp('car_insurance', 450),
      exp('vehicle_tax', 2300, { nextDate: inMonths(1, 12) }),
      exp('car_parking', 25, { occurrences: { times: 3, per: 'week' }, frequency: 'weekly' }),
      exp('car_service', 2500, { nextDate: inMonths(5, 12) }),
      // Finance — 400 (CSN and the credit card are under loans)
      exp('life_insurance', 250),
      exp('income_insurance', 150),
      // Leisure — 3,100
      exp('streaming', 300),
      exp('music', 120),
      exp('gym', 450),
      exp('mobile', 300),
      exp('nights_out', 400),
      exp('gaming', 200),
      exp('other_hobbies', 500),
      exp('cinema', 150),
      exp('software', 280),
      // Planned — 2,500
      exp('holidays', 8000, { nextDate: inMonths(3, 15) }),
      exp('christmas', 6000, { nextDate: christmasFrom(now) }),
      exp('gifts', 3000, { nextDate: inMonths(2, 20) }),
      exp('electronics', 6000, { nextDate: inMonths(7, 1) }),
      exp('annual_insurance', 1800, { name: t.expenses.annualHomeInsurance, nextDate: inMonths(2, 3) }),
      exp('annual_subscriptions', 3600, { nextDate: inMonths(4, 1) }),
      exp('birthdays', 400),
    ],
    accounts: [
      { id: id('acc'), name: t.accounts.everyday, institution: 'Swedbank', kind: 'everyday', balance: 14500 },
      { id: id('acc'), name: t.accounts.salary, institution: 'SEB', kind: 'salary', balance: 32000 },
      { id: id('acc'), name: t.accounts.savings, institution: 'Avanza', kind: 'savings', balance: 86000, interestRate: 2 },
      { id: id('acc'), name: t.accounts.emergency, institution: 'Nordnet', kind: 'emergency', balance: 40000 },
      { id: id('acc'), name: t.accounts.joint, institution: 'Swedbank', kind: 'joint', balance: 18000 },
      { id: id('acc'), name: 'ISK', institution: 'Avanza', kind: 'isk', balance: 120000, expectedReturn: 6, monthlyDeposit: 1500 },
    ],
    // Loans — 4,200 a month
    debts: [
      {
        id: id('debt'),
        name: debtKindMeta('csn').name,
        lender: 'CSN',
        kind: 'csn',
        csnType: 'annuity',
        balance: 212000,
        rate: csnRateForYear(BUNDLED_OUTLOOK, now.getFullYear()),
        rateYear: now.getFullYear(),
        payment: 4500,
        frequency: 'quarterly',
        nextDate: nextCsnDueDate(now),
      },
      {
        id: id('debt'),
        name: debtKindMeta('car').name,
        lender: 'Santander Consumer Bank',
        kind: 'car',
        secured: true,
        balance: 96000,
        rate: 6.95,
        payment: 2200,
        frequency: 'monthly',
      },
      {
        id: id('debt'),
        name: debtKindMeta('credit_card').name,
        lender: 'Nordea',
        kind: 'credit_card',
        balance: 7800,
        rate: 19.9,
        payment: 500,
        frequency: 'monthly',
      },
    ],
    goals: [
      {
        id: id('goal'),
        name: t.goals.emergency,
        description: t.goals.emergencyDescription,
        kind: 'emergency',
        purpose: 'long_term',
        currentAmount: 68000,
        monthlyContribution: 1300,
        targetAmount: 100000,
        icon: 'shield',
      },
      {
        id: id('goal'),
        name: t.goals.house,
        description: t.goals.houseDescription,
        kind: 'general',
        purpose: 'long_term',
        currentAmount: 120000,
        monthlyContribution: 1800,
        targetAmount: 500000,
        icon: 'home',
      },
      {
        id: id('goal'),
        name: t.goals.holiday,
        description: t.goals.holidayDescription,
        kind: 'purchase',
        purpose: 'future_spending',
        currentAmount: 12000,
        monthlyContribution: 1000,
        targetAmount: 25000,
        icon: 'palmtree',
      },
      {
        id: id('goal'),
        name: t.goals.car,
        description: t.goals.carDescription,
        kind: 'purchase',
        purpose: 'future_spending',
        currentAmount: 2300,
        monthlyContribution: 1000,
        targetAmount: 150000,
        icon: 'car',
      },
      {
        id: id('goal'),
        name: t.goals.laptop,
        description: t.goals.laptopDescription,
        kind: 'purchase',
        purpose: 'future_spending',
        currentAmount: 8500,
        monthlyContribution: 600,
        targetAmount: 20000,
        icon: 'laptop',
      },
    ],
    household: { members: [{ id: 'hh_001', age: '25-50', lunchAway: false }] },
    // Drives in three days a week and packs lunch.
    commute: {
      people: [{ id: 'cm_001', name: t.you, days: 3, mode: 'car', parking: true, passages: 0, buysLunch: false }],
      prices: { parking: 25 },
    },
    // Food runs a little above plan, so the demo shows the pace and the "your months say" hint.
    everydaySpend: {
      food: loggedMonths(now, [4480, 4150, 4520], 4100 * 1.08),
      transport: loggedMonths(now, [1240, 1090, 1310], 1150),
      leisure: loggedMonths(now, [1020, 840, 990], 900),
    },
    onboarding: { completedSteps: [...ONBOARDING_STEPS], completed: true },
    isSample: true,
    createdAt: iso,
    updatedAt: iso,
  };
}

function monthKey(d: Date): string {
  return format(d, 'yyyy-MM');
}

/** Three closed months, oldest first, and the running month logged up to today at `pace` a month. */
function loggedMonths(now: Date, closed: number[], pace: number) {
  const out: Record<string, { amount: number; asOf?: string }> = {};
  closed.forEach((amount, i) => (out[monthKey(addMonths(now, i - closed.length))] = { amount }));
  out[monthKey(now)] = {
    amount: Math.round((pace * now.getDate()) / getDaysInMonth(now) / 10) * 10,
    asOf: format(now, 'yyyy-MM-dd'),
  };
  return out;
}

function christmasFrom(now: Date): string {
  const year = now.getMonth() === 11 && now.getDate() > 20 ? now.getFullYear() + 1 : now.getFullYear();
  return `${year}-12-20`;
}
