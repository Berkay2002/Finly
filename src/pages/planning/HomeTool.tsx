import { Check, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { format, isValid, parseISO, setDate as setDayOfMonth } from 'date-fns';
import { typicalRate } from '@/engine/debts';
import { formatMoney, formatMonths, formatPercent } from '@/engine/format';
import { toMonthly } from '@/engine/frequency';
import { computeMetrics } from '@/engine/metrics';
import { monthsAhead } from '@/engine/projections';
import {
  HOME_MIN_DOWN_SHARE,
  homeBuyingCosts,
  maxAffordablePrice,
  mortgageMonthly,
  propertyFee,
  purchaseImpact,
  runScenario,
} from '@/engine/scenarios';
import { suggestionBySlug } from '@/engine/taxonomy';
import { useT } from '@/i18n';
import { usePlanStore } from '@/store/planStore';
import { useCurrency, useGovBondRate, usePlan, useViewDate } from '@/store/selectors';
import { fromSuggestion } from '@/components/forms/ExpenseEditor';
import { useGoalSheet } from '@/components/forms/GoalEditor';
import { useLoanSheet } from '@/components/forms/LoanEditor';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { DateField, MoneyField, SegmentedControl } from '@/components/ui/fields';
import { DeltaTile, NumberField, ScenarioResults } from './results';

const isoDay = (d: Date) => format(d, 'yyyy-MM-dd');
/** What today's housing costs are, to be replaced by the new home's. */
const HOUSING_NOW = new Set(['rent', 'hoa_fees']);

/**
 * Can I afford this home? Like the car: the most home the plan carries first, then a price judged with a
 * Swedish mortgage (10 % down, amortisation by loan-to-value, interest after ränteavdrag), the home's own
 * fees and, for a house, stamp duty and the property charge. Today's rent stops, so it is credited back.
 */
export function HomeTool() {
  const plan = usePlan();
  const viewDate = useViewDate();
  const gov = useGovBondRate();
  const currency = useCurrency();
  const addExpense = usePlanStore((s) => s.addExpense);
  const loans = useLoanSheet();
  const goalSheet = useGoalSheet();
  const t = useT();
  const c = t.planning.car;
  const h = t.planning.home;
  const money = (n: number) => formatMoney(n, currency);
  const today = useMemo(() => new Date(), []);

  const [type, setType] = useState<'apartment' | 'house'>('apartment');
  const [priceFrom, setPriceFrom] = useState(0);
  const [priceTo, setPriceTo] = useState(0);
  const [date, setDate] = useState(() => isoDay(monthsAhead(today, viewDate) > 0 ? setDayOfMonth(viewDate, 15) : today));
  /** Null follows the suggestion. */
  const [cash, setCash] = useState<number | null>(null);
  const [housingNow, setHousingNow] = useState<number | null>(null);
  const [fee, setFee] = useState<number | null>(null);
  const [operating, setOperating] = useState<number | null>(null);
  const [insurance, setInsurance] = useState<number | null>(null);
  const [deeds, setDeeds] = useState(0);
  const [down, setDown] = useState<number | null>(null);
  const [apr, setApr] = useState<number | null>(null);
  const [added, setAdded] = useState(false);
  const house = type === 'house';

  const when = useMemo(() => {
    const d = parseISO(date);
    return isValid(d) && d > today ? d : today;
  }, [date, today]);

  const base = useMemo(() => purchaseImpact(plan, { amount: 0, date: when }, today, gov), [plan, when, today, gov]);
  const breathingRoom = useMemo(() => computeMetrics(plan, when, gov).breathingRoom, [plan, when, gov]);
  const housingToday = useMemo(
    () => plan.expenses.filter((e) => HOUSING_NOW.has(e.subcategory)).reduce((sum, e) => sum + toMonthly(e.amount, e.frequency), 0),
    [plan],
  );
  const savings = cash ?? Math.floor(base.savings / 1000) * 1000;
  const ends = housingNow ?? housingToday;
  const rate = apr ?? typicalRate('mortgage', true);
  const fixed = (house ? 0 : (fee ?? 0)) + (operating ?? 0) + (insurance ?? 0);
  const propertyMonthly = (price: number) => (house ? propertyFee(price) / 12 : 0);
  const buyingCosts = (price: number, loan: number) => homeBuyingCosts(price, loan, house, deeds);

  // Whole ten thousands: homes are not priced to the krona.
  const maxFor = (budget: number) =>
    Math.floor(
      maxAffordablePrice({
        cash: savings,
        budget,
        minShare: HOME_MIN_DOWN_SHARE,
        loanMonthly: (loan, price) => mortgageMonthly(loan, price, rate).monthly + propertyMonthly(price),
        upfront: buyingCosts,
      }) / 10_000,
    ) * 10_000;
  const max = maxFor(breathingRoom + ends - fixed);
  const comfortable = maxFor(breathingRoom / 2 + ends - fixed);

  const judge = (price: number) => {
    // Pantbrev follow the loan, so the suggestion sizes costs at the smallest down payment first.
    const spare = savings - buyingCosts(price, price * (1 - HOME_MIN_DOWN_SHARE));
    const d = Math.min(price, down ?? Math.max(Math.ceil(price * HOME_MIN_DOWN_SHARE), Math.floor(spare / 1000) * 1000));
    const loan = price - d;
    const mortgage = mortgageMonthly(loan, price, rate);
    const costs = buyingCosts(price, loan);
    const monthly = mortgage.monthly + fixed + propertyMonthly(price);
    const change = monthly - ends;
    const upfront = d + costs;
    const minDown = Math.ceil(price * HOME_MIN_DOWN_SHARE);
    const ok = d >= minDown && upfront <= savings;
    const verdict = ok && change <= breathingRoom / 2 ? 'comfortable' : ok && change <= breathingRoom ? 'tight' : 'no';
    return { price, down: d, loan, mortgage, costs, monthly, change, upfront, minDown, verdict } as const;
  };
  const top = Math.max(priceFrom, priceTo);
  const main = top > 0 ? judge(top) : null;
  const low = priceTo > priceFrom && priceFrom > 0 ? judge(priceFrom) : null;

  const upfront = main?.upfront;
  const change = main?.change;
  const impact = useMemo(() => (upfront === undefined ? null : purchaseImpact(plan, { amount: upfront, date: when }, today, gov)), [plan, upfront, when, today, gov]);
  const scenario = useMemo(
    () =>
      change === undefined || change <= 0
        ? null
        : runScenario(plan, { type: 'add_expense', name: h.name, amount: change, frequency: 'monthly', category: 'home', essential: true, committed: true }, today),
    [plan, change, today, h.name],
  );

  const missing = [
    !house && fee === null && h.costs.fee,
    operating === null && h.costs.operating,
    insurance === null && h.costs.insurance,
  ].filter((x): x is string => !!x);

  const addHomeCosts = () => {
    if (!main) return;
    const lines: [string, number, 'monthly' | 'yearly', string?][] = [
      ['hoa_fees', house ? 0 : (fee ?? 0), 'monthly'],
      ['property_charges', house ? propertyFee(main.price) : 0, 'yearly'],
      ['home_insurance', insurance ?? 0, 'monthly'],
      ['other_housing', operating ?? 0, 'monthly', h.costs.operating],
    ];
    for (const [slug, amount, frequency, name] of lines) {
      const s = suggestionBySlug(slug);
      if (s && amount > 0) addExpense({ ...fromSuggestion(s), occurrences: undefined, name: name ?? s.name, amount: Math.round(amount), frequency });
    }
    setAdded(true);
  };

  const rows = main
    ? [
        { label: h.costs.interest, value: main.mortgage.interest },
        { label: h.costs.deduction, value: -main.mortgage.deduction },
        { label: h.costs.amortization(main.mortgage.percent), value: main.mortgage.amortization },
        ...(house ? [{ label: h.costs.propertyFee, value: propertyMonthly(main.price) }] : [{ label: h.costs.fee, value: fee }]),
        { label: h.costs.operating, value: operating },
        { label: h.costs.insurance, value: insurance },
      ]
    : [];

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:grid-rows-[auto_1fr] lg:items-start">
      <div className="lg:col-start-2 lg:row-start-1">
        {/* The answer, before anything is typed */}
        <div className="rounded-xl border border-line bg-page/60 p-4">
          <div className="text-[12px] font-medium text-muted">{c.answerTitle}</div>
          {max > 0 ? (
            <>
              <div className="mt-1 grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[12px] text-ink-soft">{h.upTo}</div>
                  <div className="tabular text-[22px] font-bold text-ink">{money(max)}</div>
                </div>
                <div>
                  <div className="text-[12px] text-ink-soft">{c.comfortablyUpTo}</div>
                  <div className="tabular text-[22px] font-bold text-positive">{comfortable > 0 ? money(comfortable) : '–'}</div>
                </div>
              </div>
              <p className="mt-2 text-[12.5px] text-muted">
                {h.basis(money(savings), formatPercent(rate / 100, 2))}
                {house && h.basisHouse}
                {ends > 0 && h.housingEnds(money(ends))} {missing.length > 0 && h.runningMissing}
              </p>
            </>
          ) : (
            <p className="mt-1 text-[13px] text-ink-soft">{h.none(money(breathingRoom))}</p>
          )}
        </div>
      </div>

      <div className="space-y-4 lg:col-start-1 lg:row-span-2 lg:row-start-1">
        <SegmentedControl
          value={type}
          onChange={setType}
          options={[
            { value: 'apartment', label: h.types.apartment },
            { value: 'house', label: h.types.house },
          ]}
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <MoneyField label={c.price} currency={currency} value={priceFrom} onValueChange={setPriceFrom} />
          <MoneyField label={c.priceTo} hint={t.planning.allowance.optional} currency={currency} value={priceTo} onValueChange={setPriceTo} />
          <DateField label={t.planning.afford.when} value={date} min={isoDay(today)} onChange={(e) => setDate(e.target.value)} />
        </div>

        {/* What it costs to live there */}
        <section className="rounded-xl border border-line p-3">
          <div className="text-[13px] font-medium text-ink">{h.homeTitle}</div>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <MoneyField
              label={h.cash}
              hint={cash === null ? h.cashHint : undefined}
              currency={currency}
              value={savings}
              onValueChange={(v) => setCash(Math.max(0, v))}
            />
            <MoneyField
              label={h.housingNow}
              hint={housingNow === null ? h.housingNowHint : undefined}
              currency={currency}
              value={ends}
              onValueChange={(v) => setHousingNow(Math.max(0, v))}
            />
            {!house && <MoneyField label={h.fee} hint={h.feeHint} currency={currency} value={fee ?? 0} onValueChange={setFee} />}
            <MoneyField label={h.operating} hint={house ? h.operatingHouse : h.operatingApartment} currency={currency} value={operating ?? 0} onValueChange={setOperating} />
            <MoneyField label={h.insurance} currency={currency} value={insurance ?? 0} onValueChange={setInsurance} />
            {house && <MoneyField label={h.deeds} hint={h.deedsHint} currency={currency} value={deeds} onValueChange={(v) => setDeeds(Math.max(0, v))} />}
          </div>
        </section>

        {/* The mortgage */}
        <details className="rounded-xl border border-line p-3">
          <summary className="cursor-pointer text-[13px] font-medium text-ink">
            {h.loanTitle} <span className="font-normal text-muted">· {h.loanSummary(down === null ? c.suggestedDown : money(down), formatPercent(rate / 100, 2))}</span>
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <MoneyField
              label={t.planning.afford.downPayment}
              hint={down === null ? h.downHint : undefined}
              currency={currency}
              value={main?.down ?? down ?? 0}
              onValueChange={(v) => setDown(Math.max(0, v))}
            />
            <NumberField label={t.planning.afford.interest} hint={apr === null ? t.planning.afford.rateHint(formatPercent(rate / 100, 2)) : undefined} value={apr} onChange={setApr} placeholder={String(rate)} step="0.01" />
            {(down !== null || cash !== null || housingNow !== null) && (
              <div className="col-span-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setDown(null);
                    setCash(null);
                    setHousingNow(null);
                  }}
                >
                  {t.planning.afford.useSuggested}
                </Button>
              </div>
            )}
          </div>
        </details>
      </div>

      <div className="lg:col-start-2 lg:row-start-2">
        {main && impact ? (
          <div className="space-y-3">
            <Callout tone={main.verdict === 'comfortable' ? 'success' : main.verdict === 'tight' ? 'info' : 'warning'}>
              <strong>{h.verdict[main.verdict](money(main.price))}</strong> {h.split(money(main.down), money(main.loan), money(main.mortgage.monthly))}{' '}
              {main.change >= 0 ? h.moreThanNow(money(main.monthly), money(main.change)) : h.lessThanNow(money(main.monthly), money(-main.change))}
              {main.costs > 0 && h.stampDuty(money(main.costs))}
              {main.change > breathingRoom && c.overBy(money(main.change - breathingRoom))}
              {main.down < main.minDown && h.minDown(money(main.minDown))}
              {main.upfront > savings && h.cashShort(money(main.upfront - savings))}
              {missing.length > 0 && c.notIncluded(missing.join(', ').toLowerCase())}
            </Callout>
            {low && <p className="text-[12.5px] text-ink-soft">{c.lowEnd(money(low.price), c.verdictShort[low.verdict], money(low.monthly))}</p>}

            <dl className="divide-y divide-line rounded-lg bg-page/60 px-3 text-[12.5px]">
              {rows.map((row) => (
                <div key={row.label} className="flex items-baseline justify-between gap-3 py-1.5">
                  <dt className="text-ink-soft">{row.label}</dt>
                  <dd className="tabular text-ink">{row.value === null ? <span className="text-muted">{c.notEntered}</span> : money(row.value)}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-3 py-1.5 font-semibold">
                <dt className="text-ink">{h.costs.total}</dt>
                <dd className="tabular text-ink">{money(main.monthly)}</dd>
              </div>
            </dl>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <DeltaTile label={h.upfrontTile} before={money(savings)} after={money(savings - main.upfront)} change={-main.upfront} />
              <DeltaTile label={h.costs.total} before={money(ends)} after={money(main.monthly)} change={-main.change} />
              <DeltaTile
                label={t.planning.deltas.essentialRunway}
                before={formatMonths(impact.runwayBefore)}
                after={formatMonths(impact.runwayAfter)}
                change={impact.runwayAfter - impact.runwayBefore}
              />
            </div>
            {scenario && <ScenarioResults result={scenario} currency={currency} onEditGoal={goalSheet.openEdit} />}
            {ends > 0 && <p className="text-[12.5px] text-muted">{h.endHousingNote}</p>}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button size="sm" variant="secondary" icon={added ? Check : Plus} disabled={added || fixed + propertyMonthly(main.price) <= 0} onClick={addHomeCosts}>
                {added ? h.addedCosts : h.addCosts}
              </Button>
              <Button
                size="sm"
                variant="soft"
                icon={Plus}
                onClick={() =>
                  loans.openNew('mortgage', {
                    name: h.name,
                    balance: main.loan,
                    rate,
                    amortization: Math.round(main.mortgage.amortization),
                    propertyValue: main.price,
                    frequency: 'monthly',
                  })
                }
              >
                {h.addMortgage}
              </Button>
            </div>
          </div>
        ) : (
          <Callout tone="neutral">{h.enterPrice}</Callout>
        )}
      </div>
      {loans.sheet}
      {goalSheet.sheet}
    </div>
  );
}
