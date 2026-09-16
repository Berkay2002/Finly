import { energyTaxFor, priceAreaFor, withTariffAmounts } from './electricity';
import { findKommun } from './tax/kommuner';
import { withholdingForGross } from './tax/sweden';
import type { FinancialPlan, HomeLocation, PriceArea } from './types';

/**
 * Where the household lives, and what follows from it: the municipal tax rate for a salary entered
 * before tax, energiskatt on the elnät bill and the price area for spot prices.
 */

/** The home kommun. Plans from before `home` existed fall back to the first salary's tax profile. */
export function homeKommunCode(plan: Pick<FinancialPlan, 'home' | 'income'>): string | undefined {
  if (plan.home) return plan.home.kommunCode;
  return plan.income.find((i) => i.gross?.profile.kommunCode)?.gross?.profile.kommunCode;
}

export interface ResolvedPriceArea {
  area: PriceArea;
  /** `chosen` by the user, taken from the `kommun`, or a `default` guess (SE3, where most people live). */
  source: 'chosen' | 'kommun' | 'default';
}

export function homePriceArea(plan: Pick<FinancialPlan, 'home' | 'income'>): ResolvedPriceArea {
  if (plan.home?.priceArea) return { area: plan.home.priceArea, source: 'chosen' };
  const fromKommun = priceAreaFor(homeKommunCode(plan));
  return fromKommun ? { area: fromKommun, source: 'kommun' } : { area: 'SE3', source: 'default' };
}

/**
 * Sets the home and carries the move through the plan. Things that were following the old home
 * follow the new one; things the user set differently are left alone:
 * - salaries whose tax profile used the old kommun switch kommun and get a new net (unless the net
 *   was pinned to a payslip);
 * - elnät bills still on the old kommun's energiskatt get the new one.
 */
export function applyHome(plan: FinancialPlan, next: HomeLocation): FinancialPlan {
  const prevKommun = homeKommunCode(plan);
  const nextKommun = next.kommunCode || undefined;
  const home: HomeLocation = { kommunCode: nextKommun, priceArea: next.priceArea || undefined };
  if (prevKommun === nextKommun) return { ...plan, home };

  const income = plan.income.map((src) => {
    const gross = src.gross;
    if (!gross || gross.profile.kommunCode !== prevKommun) return src;
    const profile = {
      ...gross.profile,
      kommunCode: nextKommun,
      kommunalRate: findKommun(nextKommun, gross.taxYear)?.rate,
    };
    const g = { ...gross, profile };
    return g.netOverridden ? { ...src, gross: g } : { ...src, gross: g, amount: withholdingForGross(g, src.frequency).netPerPeriod };
  });

  const oldTax = energyTaxFor(prevKommun);
  const newTax = energyTaxFor(nextKommun);
  const expenses =
    oldTax === newTax
      ? plan.expenses
      : plan.expenses.map((e) =>
          e.tariff?.part === 'grid' && e.tariff.surcharge === oldTax
            ? withTariffAmounts({ ...e, tariff: { ...e.tariff, surcharge: newTax } })
            : e,
        );

  return { ...plan, home, income, expenses };
}
