import { addMonths, set, startOfMonth, subDays } from 'date-fns';
import { formatMoney, formatMonthYear } from '@/engine/format';
import { upcomingExpenses } from '@/engine/projections';
import type { GovBondRate } from '@/engine/rates';
import type { FinancialPlan } from '@/engine/types';
import type { Messages } from '@/i18n';

export interface Reminder {
  /** Local time to send, as epoch ms. */
  fireAt: number;
  title: string;
  body: string;
  /** Where a tap lands. */
  url: string;
}

const HOUR = 9;
const HORIZON_MONTHS = 3;
const MAX = 90;

const at9 = (date: Date) => set(date, { hours: HOUR, minutes: 0, seconds: 0, milliseconds: 0 }).getTime();

/**
 * What this device wants to be told while the app is closed: each irregular cost the day before it
 * falls, and a nudge when a month has closed. Text is rendered here, in the person's language and
 * currency, so the service worker only has to show it.
 */
// ponytail: 3-month horizon; a device that does not open the app for 3 months stops getting reminders.
export function buildReminders(plan: FinancialPlan, now: Date, t: Messages['push'], gov?: GovBondRate): Reminder[] {
  const out: Reminder[] = [];
  // upcomingExpenses starts at the 1st of this month, so dates already behind us come back too.
  for (const u of upcomingExpenses(plan, now, HORIZON_MONTHS, gov)) {
    const fireAt = at9(subDays(u.date, 1));
    if (fireAt <= now.getTime()) continue;
    out.push({ fireAt, title: t.dueTomorrow(u.name), body: formatMoney(u.amount, plan.currency), url: '/?open=bills' });
  }
  const next = addMonths(startOfMonth(now), 1);
  out.push({ fireAt: at9(next), title: t.monthClosed(formatMonthYear(now)), body: t.monthClosedBody, url: '/' });
  return out.sort((a, b) => a.fireAt - b.fireAt).slice(0, MAX);
}
