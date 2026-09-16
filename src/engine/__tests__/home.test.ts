import { describe, expect, it } from 'vitest';
import { ENERGY_TAX_ORE, REDUCED_ENERGY_TAX_ORE } from '../electricity';
import { applyHome, homeKommunCode, homePriceArea } from '../home';
import { withholdingForGross } from '../tax/sweden';
import { emptyPlan, type FinancialPlan, type IncomeSource } from '../types';
import { NOW, expense, income } from './fixtures';

const NORRKOPING = '0581';
const UMEA = '2480';
const GAVLE = '2180';

function salary(kommunCode: string | undefined, extra: Partial<IncomeSource['gross']> = {}): IncomeSource {
  const gross = { amount: 40000, taxYear: 2026, profile: { churchMember: false, over66: false, kommunCode }, ...extra };
  return { ...income({ id: `sal_${kommunCode}`, amount: 0 }), gross, amount: withholdingForGross(gross, 'monthly').netPerPeriod };
}

function plan(partial: Partial<FinancialPlan>): FinancialPlan {
  return { ...emptyPlan(NOW), ...partial };
}

describe('homeKommunCode', () => {
  it('reads the saved home, falling back to a salary tax profile for older plans', () => {
    expect(homeKommunCode(plan({ home: { kommunCode: UMEA }, income: [salary(NORRKOPING)] }))).toBe(UMEA);
    expect(homeKommunCode(plan({ income: [income({ amount: 1 }), salary(NORRKOPING)] }))).toBe(NORRKOPING);
    expect(homeKommunCode(plan({ home: {}, income: [salary(NORRKOPING)] }))).toBeUndefined();
  });
});

describe('homePriceArea', () => {
  it('prefers a chosen area, then the kommun, then SE3', () => {
    expect(homePriceArea(plan({ home: { kommunCode: NORRKOPING, priceArea: 'SE4' } }))).toEqual({ area: 'SE4', source: 'chosen' });
    expect(homePriceArea(plan({ home: { kommunCode: UMEA } }))).toEqual({ area: 'SE3', source: 'default' });
    expect(homePriceArea(plan({ home: { kommunCode: NORRKOPING } }))).toEqual({ area: 'SE3', source: 'kommun' });
    expect(homePriceArea(plan({ home: { kommunCode: '1280' } }))).toEqual({ area: 'SE4', source: 'kommun' });
    expect(homePriceArea(plan({ home: { kommunCode: GAVLE } })).source).toBe('default');
  });
});

describe('applyHome', () => {
  it('moves salaries that followed the old home and recomputes their net', () => {
    const following = salary(NORRKOPING);
    const elsewhere = { ...salary('0180'), id: 'other' };
    const before = plan({ home: { kommunCode: NORRKOPING }, income: [following, elsewhere] });
    const after = applyHome(before, { kommunCode: UMEA });

    const moved = after.income[0];
    expect(moved.gross?.profile.kommunCode).toBe(UMEA);
    expect(moved.gross?.profile.kommunalRate).toBeGreaterThan(30);
    expect(moved.amount).toBe(withholdingForGross(moved.gross!, 'monthly').netPerPeriod);
    expect(moved.amount).not.toBe(following.amount);
    expect(after.income[1]).toBe(elsewhere);
  });

  it('keeps a net pinned to a payslip', () => {
    const pinned = { ...salary(NORRKOPING, { netOverridden: true }), amount: 31234 };
    const after = applyHome(plan({ home: { kommunCode: NORRKOPING }, income: [pinned] }), { kommunCode: UMEA });
    expect(after.income[0].amount).toBe(31234);
    expect(after.income[0].gross?.profile.kommunCode).toBe(UMEA);
  });

  it('switches energiskatt on elnät bills still on the old rate', () => {
    const tariff = { part: 'grid' as const, kwh: 200, energyPrice: 100, surcharge: ENERGY_TAX_ORE, monthlyFee: 100 };
    const before = plan({
      home: { kommunCode: NORRKOPING },
      expenses: [
        expense({ id: 'net', name: 'Elnät', amount: 390, tariff }),
        expense({ id: 'custom', name: 'Elnät 2', amount: 0, tariff: { ...tariff, surcharge: 40 } }),
      ],
    });
    const after = applyHome(before, { kommunCode: UMEA });
    expect(after.expenses[0].tariff?.surcharge).toBe(REDUCED_ENERGY_TAX_ORE);
    expect(after.expenses[0].amount).toBe(366);
    expect(after.expenses[1].tariff?.surcharge).toBe(40);
  });

  it('only stores the area when the kommun stays the same', () => {
    const before = plan({ home: { kommunCode: GAVLE }, income: [salary(GAVLE)] });
    const after = applyHome(before, { kommunCode: GAVLE, priceArea: 'SE2' });
    expect(after.home).toEqual({ kommunCode: GAVLE, priceArea: 'SE2' });
    expect(after.income).toBe(before.income);
  });
});
