import { describe, expect, it } from 'vitest';
import en from '@/i18n/en';
import { emptyPlan } from '@/engine/types';
import { buildReminders } from '../reminders';

const NOW = new Date(2026, 8, 19, 12, 0); // 19 Sep 2026, noon local

function planWith(dates: string[]) {
  const plan = emptyPlan();
  return {
    ...plan,
    currency: 'SEK',
    expenses: dates.map((date, i) => ({
      id: `e${i}`,
      name: `Bill ${i}`,
      category: 'living' as const,
      subcategory: 'custom',
      amount: 1250,
      fixed: true,
      essential: true,
      committed: true,
      tags: [],
      frequency: 'yearly' as const,
      nextDate: date,
    })),
  };
}

describe('buildReminders', () => {
  it('reminds at 09:00 the day before an irregular cost, in the plan currency', () => {
    const [bill, month] = buildReminders(planWith(['2026-09-29']), NOW, en.push);
    expect(new Date(bill.fireAt)).toEqual(new Date(2026, 8, 28, 9, 0));
    expect(bill.title).toBe('Bill 0 is due tomorrow');
    expect(bill.body).toContain('1');
    expect(bill.url).toBe('/?open=bills');
    expect(new Date(month.fireAt)).toEqual(new Date(2026, 9, 1, 9, 0));
    expect(month.title).toBe('September 2026 is closed');
  });

  it('skips costs whose reminder moment has passed and sorts by time', () => {
    const out = buildReminders(planWith(['2026-11-10', '2026-09-18', '2026-10-05']), NOW, en.push);
    expect(out.map((r) => r.title)).toEqual(['September 2026 is closed', 'Bill 2 is due tomorrow', 'Bill 0 is due tomorrow']);
    expect(out.every((r) => r.fireAt > NOW.getTime())).toBe(true);
  });
});
