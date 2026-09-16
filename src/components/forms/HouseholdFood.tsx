import { Plus, X } from 'lucide-react';
import { AGE_GROUPS, householdFoodCost } from '@/engine/food';
import { formatMoney } from '@/engine/format';
import { monthlyToWeekly } from '@/engine/frequency';
import type { AgeGroup, HouseholdMember } from '@/engine/types';
import { useT } from '@/i18n';
import { newId } from '@/lib/id';
import { usePlanStore } from '@/store/planStore';
import { usePlan } from '@/store/selectors';
import { Button, IconButton } from '@/components/ui/Button';
import { SelectField, TogglePill } from '@/components/ui/fields';

/** Shown until the household is edited; saved with this id on the first change. */
const FIRST_MEMBER: HouseholdMember = { id: 'hh_first', age: '25-50', lunchAway: false };

/**
 * Who the household feeds, and what Konsumentverket says that costs. The household is saved to the
 * plan as it is edited, so the answer is given once; `onApply` decides what the figure is used for.
 */
export function HouseholdFoodEstimator({
  currency,
  applyLabel,
  onApply,
  onCancel,
}: {
  currency: string;
  applyLabel: (monthly: number) => string;
  onApply: (monthly: number, adultsLunchingOut: number) => void;
  onCancel?: () => void;
}) {
  const t = useT();
  const plan = usePlan();
  const ageOptions = AGE_GROUPS.map((a) => ({ value: a.id, label: a.label }));
  const setHousehold = usePlanStore((s) => s.setHousehold);
  const members = plan.household?.members?.length ? plan.household.members : [];
  // Show one adult until the household is edited, without saving a guess to the plan.
  const shown = members.length > 0 ? members : [FIRST_MEMBER];
  const cost = householdFoodCost(shown, new Date().getFullYear());
  const money = (n: number) => formatMoney(n, currency);

  const save = (next: HouseholdMember[]) => setHousehold({ members: next });
  const update = (id: string, patch: Partial<HouseholdMember>) =>
    save(shown.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  return (
    <div>
      <div className="mb-1 text-[12.5px] font-medium text-ink-soft">{t.household.food.whoFor}</div>
      <ul className="space-y-2">
        {shown.map((m, i) => (
          <li key={m.id} className="flex flex-wrap items-center gap-2">
            <span className="w-5 text-right text-[12px] text-faint">{i + 1}.</span>
            <SelectField
              size="sm"
              value={m.age}
              onValueChange={(age: AgeGroup) => update(m.id, { age })}
              options={ageOptions}
              className="min-w-0 flex-1"
            />
            <TogglePill
              value={m.lunchAway ? 'away' : 'home'}
              onChange={(v) => update(m.id, { lunchAway: v === 'away' })}
              options={[
                { value: 'home', label: t.household.food.lunchAtHome },
                { value: 'away', label: t.household.food.lunchOut },
              ]}
            />
            <IconButton
              icon={X}
              label={t.household.food.removePerson}
              onClick={() => save(shown.filter((x) => x.id !== m.id))}
              disabled={shown.length <= 1}
            />
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => save([...shown, { id: newId('hh'), age: '7-10', lunchAway: true }])}
        className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-medium text-brand-700 hover:underline"
      >
        <Plus size={13} /> {t.household.food.addPerson}
      </button>
      <p className="mt-2 text-[11.5px] text-muted">
        {t.household.food.lunchOutNote}
      </p>

      <div className="mt-3 rounded-lg bg-card px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[12.5px] text-ink-soft">{t.household.food.source(cost.year)}</span>
          <span className="tabular text-[15px] font-semibold text-ink">
            {money(cost.monthly)}
            <span className="ml-1 text-[12px] font-normal text-muted">{t.household.food.aMonth}</span>
          </span>
        </div>
        <div className="tabular text-right text-[12px] text-muted">{t.household.food.aWeek(money(monthlyToWeekly(cost.monthly)))}</div>
        <p className="mt-1.5 text-[11.5px] text-muted">
          {t.household.food.disclaimer}
          {cost.adultsLunchingOut > 0 && t.household.food.workLunches}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {onCancel && (
          <Button size="sm" variant="secondary" onClick={onCancel}>
            {t.household.food.cancel}
          </Button>
        )}
        <Button
          size="sm"
          onClick={() => {
            if (members.length === 0) save(shown);
            onApply(cost.monthly, cost.adultsLunchingOut);
          }}
          disabled={cost.monthly <= 0}
        >
          {applyLabel(cost.monthly)}
        </Button>
      </div>
    </div>
  );
}
