import { addMonths, format, getDaysInMonth } from 'date-fns';
import { nextCsnDueDate } from '@/engine/debts';
import { BUNDLED_OUTLOOK, csnRateForYear } from '@/engine/rates';
import { suggestionBySlug } from '@/engine/taxonomy';
import type { ExpenseItem, FinancialPlan, Frequency } from '@/engine/types';
import { ONBOARDING_STEPS } from '@/engine/types';

/**
 * Demo data modelled on the "Alex" screens in the design folder.
 * Totals: income 34,200 · lifestyle 25,500 (of which 4,200 loan payments) · savings 5,700 · breathing room 3,000.
 */
export function samplePlan(now: Date = new Date()): FinancialPlan {
  const iso = now.toISOString();
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
        name: 'Salary',
        note: 'Main job',
        kind: 'salary',
        amount: 28000,
        frequency: 'monthly',
        reliability: 'reliable',
        includeInBaseline: true,
      },
      {
        id: id('inc'),
        name: 'Bonus',
        note: 'Annual (divided monthly)',
        kind: 'bonus',
        amount: 36000,
        frequency: 'yearly',
        reliability: 'reliable',
        includeInBaseline: true,
      },
      {
        id: id('inc'),
        name: 'Freelance work',
        note: 'Design projects',
        kind: 'freelance',
        amount: 2700,
        frequency: 'monthly',
        reliability: 'variable',
        includeInBaseline: true,
      },
      {
        id: id('inc'),
        name: 'Gifts',
        note: 'Estimated average',
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
      exp('electricity', 500, { range: { low: 250, high: 950 }, note: 'Rörligt pris' }),
      exp('internet', 350),
      exp('home_insurance', 350),
      exp('water', 0, { includedElsewhere: true, note: 'Included in rent' }),
      // Living — 4,800
      exp('groceries', 740, { range: { low: 650, high: 880 } }),
      exp('restaurants', 450),
      exp('haircuts', 300),
      exp('clothes', 400),
      // Transport — 2,000 (the car loan is under loans)
      exp('fuel', 850, { range: { low: 600, high: 1200 } }),
      exp('car_insurance', 450),
      exp('vehicle_tax', 2300, { nextDate: inMonths(1, 12) }),
      exp('car_parking', 300),
      exp('car_service', 2500, { nextDate: inMonths(5, 12) }),
      // Finance — 400 (CSN and the credit card are under loans)
      exp('life_insurance', 250),
      exp('income_insurance', 150),
      // Leisure — 3,100
      exp('streaming', 300),
      exp('music', 120),
      exp('gym', 450),
      exp('mobile', 300),
      exp('nights_out', 800),
      exp('gaming', 200),
      exp('other_hobbies', 500),
      exp('cinema', 150),
      exp('software', 280),
      // Planned — 2,500
      exp('holidays', 8000, { nextDate: inMonths(3, 15) }),
      exp('christmas', 6000, { nextDate: christmasFrom(now) }),
      exp('gifts', 3000, { nextDate: inMonths(2, 20) }),
      exp('electronics', 6000, { nextDate: inMonths(7, 1) }),
      exp('annual_insurance', 1800, { name: 'Annual home insurance', nextDate: inMonths(2, 3) }),
      exp('annual_subscriptions', 3600, { nextDate: inMonths(4, 1) }),
      exp('birthdays', 1600, { nextDate: inMonths(6, 10) }),
    ],
    accounts: [
      { id: id('acc'), name: 'Everyday account', institution: 'Swedbank', kind: 'everyday', balance: 14500 },
      { id: id('acc'), name: 'Salary account', institution: 'SEB', kind: 'salary', balance: 32000 },
      { id: id('acc'), name: 'Savings account', institution: 'Avanza', kind: 'savings', balance: 86000 },
      { id: id('acc'), name: 'Emergency fund', institution: 'Nordnet', kind: 'emergency', balance: 40000 },
      { id: id('acc'), name: 'Joint account', institution: 'Swedbank', kind: 'joint', balance: 18000 },
      { id: id('acc'), name: 'Investments', institution: 'Avanza', kind: 'investment', balance: 120000 },
    ],
    // Loans — 4,200 a month
    debts: [
      {
        id: id('debt'),
        name: 'CSN',
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
        name: 'Billån',
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
        name: 'Credit card',
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
        name: 'Emergency fund',
        description: "Financial security for life's uncertainties.",
        kind: 'emergency',
        purpose: 'long_term',
        currentAmount: 68000,
        monthlyContribution: 1300,
        targetAmount: 100000,
        icon: 'shield',
      },
      {
        id: id('goal'),
        name: 'House deposit',
        description: 'Our first home.',
        kind: 'general',
        purpose: 'long_term',
        currentAmount: 120000,
        monthlyContribution: 1800,
        targetAmount: 500000,
        icon: 'home',
      },
      {
        id: id('goal'),
        name: 'Holiday',
        description: 'Explore more of the world.',
        kind: 'purchase',
        purpose: 'future_spending',
        currentAmount: 12000,
        monthlyContribution: 1000,
        targetAmount: 25000,
        icon: 'palmtree',
      },
      {
        id: id('goal'),
        name: 'Car fund',
        description: 'For a more flexible tomorrow.',
        kind: 'purchase',
        purpose: 'future_spending',
        currentAmount: 2300,
        monthlyContribution: 1000,
        targetAmount: 150000,
        icon: 'car',
      },
      {
        id: id('goal'),
        name: 'New laptop',
        description: 'Upgrade for work and creativity.',
        kind: 'purchase',
        purpose: 'future_spending',
        currentAmount: 8500,
        monthlyContribution: 600,
        targetAmount: 20000,
        icon: 'laptop',
      },
    ],
    household: { members: [{ id: 'hh_001', age: '25-50', lunchAway: false }] },
    // Food runs a little above plan, so the demo shows the pace and the "your months say" hint.
    foodSpend: {
      [monthKey(addMonths(now, -3))]: { amount: 4480 },
      [monthKey(addMonths(now, -2))]: { amount: 4150 },
      [monthKey(addMonths(now, -1))]: { amount: 4520 },
      [monthKey(now)]: {
        amount: Math.round((4100 * 1.08 * now.getDate()) / getDaysInMonth(now) / 10) * 10,
        asOf: format(now, 'yyyy-MM-dd'),
      },
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

function christmasFrom(now: Date): string {
  const year = now.getMonth() === 11 && now.getDate() > 20 ? now.getFullYear() + 1 : now.getFullYear();
  return `${year}-12-20`;
}
