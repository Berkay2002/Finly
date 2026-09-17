import { useEffect, useState } from 'react';
import { Info, Plus, X } from 'lucide-react';
import clsx from 'clsx';
import { AGE_GROUPS } from '@/engine/food';
import { personalFoodCost, usesBodyMetrics, type PersonalMemberCost } from '@/engine/foodProfile';
import { formatAmount, formatMoney, formatMonthKey, formatNumber } from '@/engine/format';
import { monthlyToWeekly } from '@/engine/frequency';
import type { ActivityLevel, AgeGroup, Diet, Household, HouseholdMember, Sex, ShoppingStyle, WeightGoal } from '@/engine/types';
import { useT } from '@/i18n';
import { useFoodPrices } from '@/lib/foodPrices';
import { newId } from '@/lib/id';
import { usePlanStore } from '@/store/planStore';
import { usePlan } from '@/store/selectors';
import { Button, IconButton } from '@/components/ui/Button';
import { Label, SegmentedControl, SelectField, Switch, TextField, TogglePill } from '@/components/ui/fields';

/** Shown until the household is edited; saved with this id on the first change. */
const FIRST_MEMBER: HouseholdMember = { id: 'hh_first', age: '25-50', lunchAway: false };

const SEX_UNSET = '' as const;
type SexChoice = Sex | typeof SEX_UNSET;

/**
 * Who the household feeds, and what Konsumentverket says that costs. The household is saved to the
 * plan as it is edited, so the answer is given once; `onApply` decides what the figure is used for.
 * "Personalise" scales each person's figure by body, activity and diet (see engine/foodProfile.ts).
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
  const tp = t.household.food.personalise;
  const plan = usePlan();
  const ageOptions = AGE_GROUPS.map((a) => ({ value: a.id, label: a.label }));
  const setHousehold = usePlanStore((s) => s.setHousehold);
  const household = plan.household;
  const members = household?.members?.length ? household.members : [];
  // Show one adult until the household is edited, without saving a guess to the plan.
  const shown = members.length > 0 ? members : [FIRST_MEMBER];
  const personalised = household?.personalised === true;
  const year = new Date().getFullYear();
  // The first person is taken to be the plan's owner, whose birth year is asked elsewhere.
  const priced = shown.map((m, i) => (i === 0 && m.birthYear === undefined ? { ...m, birthYear: plan.birthYear } : m));
  const prices = useFoodPrices();
  const cost = personalFoodCost({ members: priced, shopping: household?.shopping, personalised }, year, prices);
  const money = (n: number) => formatMoney(n, currency);
  const [showLunchNote, setShowLunchNote] = useState(false);

  const saveHousehold = (patch: Partial<Household>) =>
    setHousehold({ members: shown, shopping: household?.shopping, personalised, ...patch });
  const save = (next: HouseholdMember[]) => saveHousehold({ members: next });
  const update = (id: string, patch: Partial<HouseholdMember>) =>
    save(shown.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const activityOptions = (Object.keys(tp.activities) as ActivityLevel[]).map((value) => ({ value, label: tp.activities[value] }));
  const goalOptions = (Object.keys(tp.goals) as WeightGoal[]).map((value) => ({ value, label: tp.goals[value] }));
  const dietOptions = (Object.keys(tp.diets) as Diet[]).map((value) => ({ value, label: tp.diets[value] }));
  const sexOptions: { value: SexChoice; label: string }[] = [
    { value: SEX_UNSET, label: tp.sexUnset },
    { value: 'female', label: tp.female },
    { value: 'male', label: tp.male },
  ];
  const shoppingOptions = (Object.keys(tp.shoppingStyles) as ShoppingStyle[]).map((value) => ({ value, label: tp.shoppingStyles[value] }));

  return (
    <div className="space-y-5">
      <section>
        <div className="mb-2 flex items-center gap-1.5">
          <span className="text-[12.5px] font-medium text-ink-soft">{t.household.food.whoFor}</span>
          <button
            type="button"
            onClick={() => setShowLunchNote((v) => !v)}
            aria-label={t.household.food.lunchOutInfo}
            aria-expanded={showLunchNote}
            title={t.household.food.lunchOutInfo}
            className={showLunchNote ? 'text-ink' : 'text-faint hover:text-ink'}
          >
            <Info size={14} />
          </button>
        </div>
        {showLunchNote && (
          <p className="mb-2 text-[11.5px] leading-relaxed text-muted">{t.household.food.lunchOutNote}</p>
        )}
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
                size="md"
                className="h-9"
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
          className="ml-7 mt-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-brand-700 hover:underline"
        >
          <Plus size={13} /> {t.household.food.addPerson}
        </button>
      </section>

      <section className="rounded-xl border border-line p-3">
        <Switch checked={personalised} onChange={(v) => saveHousehold({ personalised: v })} label={tp.toggle} />
        {personalised && (
          <div className="mt-3 space-y-4">
            <p className="text-[11.5px] leading-relaxed text-muted">{tp.intro}</p>
            {shown.map((m, i) => (
              <PersonDetail
                key={m.id}
                index={i}
                member={priced[i]}
                cost={cost.perMember[i]}
                onChange={(patch) => update(m.id, patch)}
                options={{ sex: sexOptions, activity: activityOptions, goal: goalOptions, diet: dietOptions }}
              />
            ))}
            <div>
              <Label>{tp.shopping}</Label>
              <SegmentedControl
                value={household?.shopping ?? 'normal'}
                onChange={(shopping) => saveHousehold({ shopping })}
                options={shoppingOptions}
              />
            </div>
          </div>
        )}
      </section>

      <div className="rounded-lg bg-card px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[12.5px] text-ink-soft">
            {t.household.food.source(cost.year)}
            <span className="text-muted"> · {t.household.food.atPrices(formatMonthKey(cost.priceMonth))}</span>
            {personalised && <span className="text-muted"> · {tp.personalised}</span>}
          </span>
          <span className="tabular text-[15px] font-semibold text-ink">
            {money(cost.monthly)}
            <span className="ml-1 text-[12px] font-normal text-muted">{t.household.food.aMonth}</span>
          </span>
        </div>
        <div className="tabular text-right text-[12px] text-muted">{t.household.food.aWeek(money(monthlyToWeekly(cost.monthly)))}</div>
        {Math.round(cost.base) !== Math.round(cost.monthly) && (
          <div className="tabular text-right text-[12px] text-faint line-through">{tp.base(money(cost.base))}</div>
        )}

        {personalised && cost.breakdown.length > 0 && (
          <div className="mt-3 border-t border-line pt-2.5">
            <div className="mb-1.5 text-[12px] font-medium text-ink-soft">{tp.whereItGoes}</div>
            <ul className="space-y-1">
              {cost.breakdown.map((g) => (
                <li key={g.group} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-[12px]">
                  <span className="truncate text-muted">{tp.groups[g.group]}</span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-page">
                    <span className="block h-full rounded-full bg-brand-500" style={{ width: `${(100 * g.monthly) / cost.breakdown[0].monthly}%` }} />
                  </span>
                  <span className="tabular text-ink">{money(g.monthly)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-2.5 border-t border-line pt-2.5 text-[11.5px] leading-relaxed text-muted">
          {t.household.food.disclaimer}
          {personalised && tp.disclaimer}
          {cost.adultsLunchingOut > 0 && t.household.food.workLunches}
        </p>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
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

/** One person's body, activity and diet. Children get activity and diet only. */
function PersonDetail({
  index,
  member: m,
  cost,
  onChange,
  options,
}: {
  index: number;
  member: HouseholdMember;
  cost: PersonalMemberCost;
  onChange: (patch: Partial<HouseholdMember>) => void;
  options: {
    sex: { value: SexChoice; label: string }[];
    activity: { value: ActivityLevel; label: string }[];
    goal: { value: WeightGoal; label: string }[];
    diet: { value: Diet; label: string }[];
  };
}) {
  const t = useT();
  const tp = t.household.food.personalise;
  const body = usesBodyMetrics(m.age);
  const thisYear = new Date().getFullYear();

  return (
    <div>
      <div className="mb-1.5 text-[12px] font-medium text-ink">{tp.person(index + 1, t.household.food.ageGroups[m.age])}</div>
      <div className={clsx('grid gap-2', body ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2')}>
        {body && (
          <>
            <SelectField
              size="sm"
              label={tp.sex}
              value={m.sex ?? SEX_UNSET}
              onValueChange={(v: SexChoice) => onChange({ sex: v === SEX_UNSET ? undefined : v })}
              options={options.sex}
            />
            <DraftNumber label={tp.birthYear} value={m.birthYear} min={1900} max={thisYear} onCommit={(birthYear) => onChange({ birthYear })} />
            <DraftNumber label={tp.height} unit={tp.cm} value={m.heightCm} min={50} max={250} onCommit={(heightCm) => onChange({ heightCm })} />
            <DraftNumber label={tp.weight} unit={tp.kg} value={m.weightKg} min={20} max={300} onCommit={(weightKg) => onChange({ weightKg })} />
          </>
        )}
        <SelectField
          size="sm"
          label={tp.activity}
          value={m.activity ?? 'average'}
          onValueChange={(activity: ActivityLevel) => onChange({ activity })}
          options={options.activity}
        />
        {body && (
          <SelectField
            size="sm"
            label={tp.goal}
            value={m.goal ?? 'maintain'}
            onValueChange={(goal: WeightGoal) => onChange({ goal })}
            options={options.goal}
          />
        )}
        <SelectField
          size="sm"
          label={tp.diet}
          value={m.diet ?? 'omnivore'}
          onValueChange={(diet: Diet) => onChange({ diet })}
          options={options.diet}
          className={body ? 'sm:col-span-2' : undefined}
        />
      </div>
      <label className="mt-2 flex cursor-pointer items-center gap-2 text-[12px] text-ink-soft">
        <input type="checkbox" checked={m.freeFrom === true} onChange={(e) => onChange({ freeFrom: e.target.checked || undefined })} />
        {tp.freeFrom}
      </label>
      <p className="mt-1 text-[11.5px] text-muted">
        {cost.energy ? tp.energy(formatAmount(cost.energy.kcal), formatNumber(cost.energy.ratio, 2)) : null}
        {!body && ` ${tp.childEnergy}`}
      </p>
    </div>
  );
}

/**
 * A whole number typed freely, saved only once it is within range so a half-typed "19" never reaches
 * the plan; clearing the field forgets the value.
 */
function DraftNumber({
  label,
  unit,
  value,
  min,
  max,
  onCommit,
}: {
  label: string;
  unit?: string;
  value: number | undefined;
  min: number;
  max: number;
  onCommit: (v: number | undefined) => void;
}) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  useEffect(() => {
    setText(value === undefined ? '' : String(value));
  }, [value]);
  return (
    <TextField
      label={label}
      hint={unit}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      inputClassName="h-9 tabular"
      value={text}
      onChange={(e) => {
        const v = e.target.value;
        setText(v);
        const n = Number(v);
        if (v === '') onCommit(undefined);
        else if (Number.isInteger(n) && n >= min && n <= max) onCommit(n);
      }}
    />
  );
}
