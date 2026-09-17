import { useEffect } from 'react';
import { latestMonth } from '@/engine/foodPrices';
import { foodLinksToRefresh, spotAreasToRefresh } from '@/engine/priceLinks';
import type { PriceArea } from '@/engine/types';
import { useFoodPrices } from '@/lib/foodPrices';
import { fetchQuotes, quoteQuery } from '@/lib/quotes';
import { fetchSpotAverage, previousMonthKey } from '@/lib/spotPrice';
import { usePlanStore } from './planStore';

/**
 * Keeps price-linked costs current: groceries linked to the food index move when a newer month of
 * SCB data arrives, and supply tariffs that follow the spot price pick up last month's average.
 * Runs on load and again when the food prices refresh or a tariff starts following. Closed months
 * are frozen (engine/history), so only the live plan moves. Holdings on ISK, KF and AF accounts pick up
 * their latest price. Every step is idempotent, which makes
 * StrictMode's double effect harmless.
 */
export function usePriceRefresh(): void {
  const hydrated = usePlanStore((s) => s.hydrated);
  const food = useFoodPrices();
  const foodMonth = latestMonth(food);
  const spotAreas = usePlanStore((s) => spotAreasToRefresh(s.plan.expenses, previousMonthKey()).join(','));
  const holdings = usePlanStore((s) => quoteQuery(s.plan.accounts.flatMap((a) => a.holdings ?? []), s.plan.currency));

  useEffect(() => {
    if (!hydrated) return;
    const { plan, refreshPriceLinks } = usePlanStore.getState();
    if (foodLinksToRefresh(plan.expenses, food)) refreshPriceLinks({ food });
  }, [hydrated, food, foodMonth]);

  useEffect(() => {
    if (!hydrated || !spotAreas) return;
    const month = previousMonthKey();
    let cancelled = false;
    Promise.all((spotAreas.split(',') as PriceArea[]).map((area) => fetchSpotAverage(area, month)))
      .then((spot) => {
        if (!cancelled) usePlanStore.getState().refreshPriceLinks({ spot });
      })
      .catch(() => {
        // Offline or the feed is down: the tariff keeps its last figure until next time.
      });
    return () => {
      cancelled = true;
    };
  }, [hydrated, spotAreas]);

  // Holdings on investment accounts: prices once per load, and again when a holding or the currency changes.
  useEffect(() => {
    if (!hydrated || !holdings) return;
    let cancelled = false;
    void fetchQuotes(holdings).then((result) => {
      // Offline or both price sources down: holdings keep their last price.
      if (result && !cancelled) usePlanStore.getState().refreshHoldings(result);
    });
    return () => {
      cancelled = true;
    };
  }, [hydrated, holdings]);
}
