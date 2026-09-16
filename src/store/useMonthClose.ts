import { useEffect } from 'react';
import { usePlanStore } from './planStore';

/**
 * Closes any month that is due: on load and whenever the tab comes back into view, so a tab
 * left open across the turn of the month still gets its snapshot. `closeMonths` is idempotent,
 * which also makes StrictMode's double effect harmless.
 */
export function useMonthClose(): void {
  const hydrated = usePlanStore((s) => s.hydrated);
  useEffect(() => {
    if (!hydrated) return;
    const run = () => usePlanStore.getState().closeMonths(new Date());
    run();
    const onVisible = () => {
      if (document.visibilityState === 'visible') run();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [hydrated]);
}
