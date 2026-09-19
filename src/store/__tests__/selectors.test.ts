import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expense } from '@/engine/__tests__/fixtures';
import { emptyPlan, type FinancialPlan } from '@/engine/types';
import { useUpcoming } from '../selectors';

const state = vi.hoisted(() => ({ plan: undefined as unknown as FinancialPlan, snapshots: {}, viewMonth: new Date(2026, 7, 1) }));
vi.mock('../planStore', () => ({ usePlanStore: (select: (s: typeof state) => unknown) => select(state) }));
vi.mock('../uiStore', async (original) => ({
  ...await original<typeof import('../uiStore')>(),
  useUiStore: (select: (s: typeof state) => unknown) => select(state),
}));
vi.mock('@/lib/rateOutlook', () => ({ useRateOutlook: () => ({}) }));

afterEach(() => vi.useRealTimers());

describe('upcoming items on month-selectable screens', () => {
  it.each([7, 10])('uses today while viewing month index %s', (month) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 19, 12));
    state.viewMonth = new Date(2026, month, 1);
    state.plan = emptyPlan();
    state.plan.expenses = [
      expense({ id: 'gift', name: 'Gift', amount: 1000, frequency: 'once', nextDate: '2026-09-02' }),
      expense({ id: 'future', name: 'Trip', amount: 2000, frequency: 'once', nextDate: '2026-10-01' }),
    ];
    const View = () => createElement('div', null, useUpcoming().map((e) => e.expenseId).join(','));
    expect(renderToString(createElement(View))).toBe('<div>future</div>');
  });
});
