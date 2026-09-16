import { useMemo } from 'react';
import clsx from 'clsx';
import { priceAreaFor } from '@/engine/electricity';
import { homeKommunCode, homePriceArea } from '@/engine/home';
import { findKommun, kommunerFor } from '@/engine/tax/kommuner';
import type { PriceArea } from '@/engine/types';
import { usePlanStore } from '@/store/planStore';
import { usePlan } from '@/store/selectors';
import { SelectField } from '@/components/ui/fields';

const NONE = '';
const AUTO = '';

const AREA_CITY: Record<PriceArea, string> = { SE1: 'Luleå', SE2: 'Sundsvall', SE3: 'Stockholm', SE4: 'Malmö' };
const AREAS: PriceArea[] = ['SE1', 'SE2', 'SE3', 'SE4'];

/**
 * Kommun and electricity price area, saved straight to the plan. Used in onboarding, Settings and
 * the electricity calculator, so the answer is given once and reused everywhere it matters.
 */
export function HomeFields({ className, compact = false }: { className?: string; compact?: boolean }) {
  const plan = usePlan();
  const setHome = usePlanStore((s) => s.setHome);
  const year = new Date().getFullYear();
  const kommunCode = homeKommunCode(plan);
  const kommun = findKommun(kommunCode, year);
  const resolved = homePriceArea(plan);

  const kommunOptions = useMemo(
    () => [{ value: NONE, label: 'Not set' }, ...kommunerFor(year).map((k) => ({ value: k.code, label: k.name }))],
    [year],
  );
  const fromKommun = priceAreaFor(kommunCode);
  const areaOptions = [
    { value: AUTO, label: fromKommun && kommun ? `${fromKommun} (from ${kommun.name})` : 'Not sure (SE3)' },
    ...AREAS.map((a) => ({ value: a, label: `${a} · ${AREA_CITY[a]}` })),
  ];

  return (
    <div className={className}>
      <div className={clsx('grid gap-3', compact ? 'grid-cols-2' : 'sm:grid-cols-2')}>
        <SelectField
          label="Kommun"
          value={kommunCode ?? NONE}
          onValueChange={(code: string) => setHome({ kommunCode: code || undefined, priceArea: plan.home?.priceArea })}
          options={kommunOptions}
        />
        <SelectField
          label="Electricity area"
          hint={compact ? undefined : '(elområde)'}
          value={plan.home?.priceArea ?? AUTO}
          onValueChange={(area: string) =>
            setHome({ kommunCode, priceArea: (area || undefined) as PriceArea | undefined })
          }
          options={areaOptions}
        />
      </div>
      {kommun && resolved.source === 'default' && (
        <p className="mt-1.5 text-[12px] text-muted">
          {kommun.name} can be in more than one area. Check "Elområde" on your electricity bill.
        </p>
      )}
    </div>
  );
}
