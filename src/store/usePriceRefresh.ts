import { useEffect } from 'react';
import { latestMonth } from '@/engine/foodPrices';
import { foodLinksToRefresh, spotAreasToRefresh } from '@/engine/priceLinks';
import type { PriceArea } from '@/engine/types';
import { useFoodPrices } from '@/lib/foodPrices';
import { fetchSpotAverage, previousMonthKey } from '@/lib/spotPrice';
import { usePlanStore } from './planStore';

/**
 * Keeps price-linked costs current: groceries linked to the food index move when a newer month of
 * SCB data arrives, and supply tariffs that follow the spot price pick up last month's average.
 * Runs on load and again when the food prices refresh or a tariff starts following. Closed months
 * are frozen (engine/history), so only the live plan moves. Every step is idempotent, which makes
 * StrictMode's double effect harmless.
 */
export function usePriceRefresh(): void {
  const hydrated = usePlanStore((s) => s.hydrated);
  const food = useFoodPrices();
  const foodMonth = latestMonth(food);
  const spotAreas = usePlanStore((s) => spotAreasToRefresh(s.plan.expenses, previousMonthKey()).join(','));

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
}
