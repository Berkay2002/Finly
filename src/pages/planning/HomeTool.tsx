import { Check, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { typicalRate } from '@/engine/debts';
import { formatMoney, formatMonthKey, formatMonths, formatPercent } from '@/engine/format';
import { toMonthly } from '@/engine/frequency';
import { computeMetrics } from '@/engine/metrics';
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
import { useDraft } from '@/store/draftStore';
import { usePlanStore } from '@/store/planStore';
import { useCurrency, useGovBondRate, usePlan } from '@/store/selectors';
import { fromSuggestion } from '@/components/forms/ExpenseEditor';
import { useGoalSheet } from '@/components/forms/GoalEditor';
import { useLoanSheet } from '@/components/forms/LoanEditor';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { DateField, MoneyField, SegmentedControl } from '@/components/ui/fields';
import {
  AnswerPanel,
  CostList,
  DeltaTile,
  Field,
  FieldGrid,
  NumberField,
  ScenarioResults,
  SourceLinks,
  ToolGrid,
  ToolSection,
  isoDay,
  roundDown,
  useElectricityPrice,
  usePurchaseDate,
  verdictTone,
} from './results';

/** What today's housing costs are, to be replaced by the new home's. */
const HOUSING_NOW = new Set(['rent', 'hoa_fees']);
const QUOTE_LINKS = [
  { name: 'Folksam', url: 'https://www.folksam.se/forsakringar/hemforsakring' },
  { name: 'If', url: 'https://www.if.se/privat/forsakringar/hemforsakring' },
  { name: 'Trygg-Hansa', url: 'https://www.trygghansa.se/forsakringar/hemforsakring' },
  { name: 'Länsförsäkringar', url: 'https://www.lansforsakringar.se/privat/forsakring/hemforsakring/' },
];
const LISTINGS = 'https://www.booli.se/';
const RATES = 'https://www.compricer.se/bolan/';
/** How far rates are tested rising, in percentage points. */
const RATE_STRESS = 3;

/**
 * Can I afford this home? Like the car: the most home the plan carries first, then a price judged with a
 * Swedish mortgage (10 % down, amortisation by loan-to-value, interest after ränteavdrag), the home's own
 * running costs and, for a house, stamp duty and the property charge. Today's rent stops, so it is credited back.
 */
export function HomeTool() {
  const plan = usePlan();
  const gov = useGovBondRate();
  const currency = useCurrency();
  const addExpense = usePlanStore((s) => s.addExpense);
  const loans = useLoanSheet();
  const goalSheet = useGoalSheet();
  const t = useT();
  const c = t.planning.car;
  const h = t.planning.home;
  const money = (n: number) => formatMoney(n, currency);
  const field = useDraft('home');
  const { today, date, setDate, when } = usePurchaseDate(field);

  const [type, setType] = field<'apartment' | 'house'>('type', 'apartment');
  const [priceFrom, setPriceFrom] = field('priceFrom', 0);
  const [priceTo, setPriceTo] = field('priceTo', 0);
  /** Null follows the suggestion. */
  const [cash, setCash] = field<number | null>('cash', null);
  const [housingNow, setHousingNow] = field<number | null>('housingNow', null);
  const [fee, setFee] = field<number | null>('fee', null);
  const [kwh, setKwh] = field<number | null>('kwh', null);
  const [kwhPrice, setKwhPrice] = field<number | null>('kwhPrice', null);
  const [heating, setHeating] = field<number | null>('heating', null);
  const [water, setWater] = field<number | null>('water', null);
  const [maintenance, setMaintenance] = field<number | null>('maintenance', null);
  const [insurance, setInsurance] = field<number | null>('insurance', null);
  const [deeds, setDeeds] = field('deeds', 0);
  const [down, setDown] = field<number | null>('down', null);
  const [apr, setApr] = field<number | null>('apr', null);
  const [added, setAdded] = useState(false);
  const house = type === 'house';

  const base = useMemo(() => purchaseImpact(plan, { amount: 0, date: when }, today, gov), [plan, when, today, gov]);
  const breathingRoom = useMemo(() => computeMetrics(plan, when, gov).breathingRoom, [plan, when, gov]);
  const housingToday = useMemo(
    () => plan.expenses.filter((e) => HOUSING_NOW.has(e.subcategory)).reduce((sum, e) => sum + toMonthly(e.amount, e.frequency), 0),
    [plan],
  );
  const { price: electricity, spot } = useElectricityPrice(plan, kwh !== null);
  const krPerKwh = kwhPrice ?? electricity?.krPerKwh;

  const savings = cash ?? roundDown(base.savings, 1000);
  const ends = housingNow ?? housingToday;
  const rate = apr ?? typicalRate('mortgage', true);
  const monthly = {
    fee: house ? 0 : (fee ?? 0),
    electricity: ((kwh ?? 0) * (krPerKwh ?? 0)) / 12,
    heating: house ? (heating ?? 0) / 12 : 0,
    water: house ? (water ?? 0) / 12 : 0,
    maintenance: (maintenance ?? 0) / 12,
    insurance: insurance ?? 0,
  };
  const fixed = Object.values(monthly).reduce((a, b) => a + b, 0);
  const propertyMonthly = (price: number) => (house ? propertyFee(price) / 12 : 0);
  const buyingCosts = (price: number, loan: number) => homeBuyingCosts(price, loan, house, deeds);

  // Whole ten thousands: homes are not priced to the krona.
  const maxFor = (budget: number) =>
    roundDown(
      maxAffordablePrice({
        cash: savings,
        budget,
        minShare: HOME_MIN_DOWN_SHARE,
        loanMonthly: (loan, price) => mortgageMonthly(loan, price, rate).monthly + propertyMonthly(price),
        upfront: buyingCosts,
      }),
      10_000,
    );
  const max = maxFor(breathingRoom + ends - fixed);
  const comfortable = maxFor(breathingRoom / 2 + ends - fixed);

  const judge = (price: number) => {
    // Pantbrev follow the loan, so the suggestion sizes costs at the smallest down payment first.
    const spare = savings - buyingCosts(price, price * (1 - HOME_MIN_DOWN_SHARE));
    const d = Math.min(price, down ?? Math.max(Math.ceil(price * HOME_MIN_DOWN_SHARE), roundDown(spare, 1000)));
    const loan = price - d;
    const mortgage = mortgageMonthly(loan, price, rate);
    const costs = buyingCosts(price, loan);
    const total = mortgage.monthly + fixed + propertyMonthly(price);
    const change = total - ends;
    const upfront = d + costs;
    const minDown = Math.ceil(price * HOME_MIN_DOWN_SHARE);
    const ok = d >= minDown && upfront <= savings;
    const verdict = ok && change <= breathingRoom / 2 ? 'comfortable' : ok && change <= breathingRoom ? 'tight' : 'no';
    return { price, down: d, loan, mortgage, costs, monthly: total, change, upfront, minDown, verdict } as const;
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
    kwh === null && h.costs.electricity,
    house && water === null && h.costs.water,
    insurance === null && h.costs.insurance,
  ].filter((x): x is string => !!x);

  const addHomeCosts = () => {
    if (!main) return;
    const lines: [string, number, 'monthly' | 'yearly'][] = [
      ['hoa_fees', monthly.fee, 'monthly'],
      ['property_charges', house ? propertyFee(main.price) : 0, 'yearly'],
      ['electricity', monthly.electricity, 'monthly'],
      ['heating', monthly.heating * 12, 'yearly'],
      ['water', monthly.water * 12, 'yearly'],
      ['maintenance', monthly.maintenance * 12, 'yearly'],
      ['home_insurance', monthly.insurance, 'monthly'],
    ];
    for (const [slug, amount, frequency] of lines) {
      const s = suggestionBySlug(slug);
      if (s && amount > 0) addExpense({ ...fromSuggestion(s), occurrences: undefined, amount: Math.round(amount), frequency });
    }
    setAdded(true);
  };

  const electricityNote =
    kwhPrice !== null || !electricity
      ? undefined
      : electricity.source === 'tariff'
        ? c.chargingFromBills
        : spot
          ? c.chargingFromSpot(formatMonthKey(spot.month), spot.area)
          : undefined;

  const answer = (
    <AnswerPanel
      figures={
        max > 0
          ? [
              { label: h.upTo, value: money(max) },
              ...(comfortable < max ? [{ label: c.comfortablyUpTo, value: comfortable > 0 ? money(comfortable) : '–', positive: true }] : []),
            ]
          : []
      }
      note={
        <>
          {h.basis(money(savings), formatPercent(rate / 100, 2))}
          {house && h.basisHouse}
          {ends > 0 && h.housingEnds(money(ends))} {missing.length > 0 && h.runningMissing}
        </>
      }
      empty={h.none(money(breathingRoom))}
    />
  );

  const inputs = (
    <>
      <SegmentedControl
        value={type}
        onChange={setType}
        options={[
          { value: 'apartment', label: h.types.apartment },
          { value: 'house', label: h.types.house },
        ]}
      />
      <FieldGrid cols={3}>
        <Field help={<SourceLinks links={[{ name: h.browseListings, url: LISTINGS }]} />}>
          <MoneyField label={c.price} currency={currency} value={priceFrom} onValueChange={setPriceFrom} />
        </Field>
        <Field>
          <MoneyField label={c.priceTo} hint={t.planning.allowance.optional} currency={currency} value={priceTo} onValueChange={setPriceTo} />
        </Field>
        <Field>
          <DateField label={t.planning.afford.when} value={date} min={isoDay(today)} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </FieldGrid>

      <ToolSection title={h.homeTitle}>
        <FieldGrid className="mt-2">
          <Field help={cash === null ? h.cashHint : undefined}>
            <MoneyField label={h.cash} currency={currency} value={savings} onValueChange={(v) => setCash(Math.max(0, v))} />
          </Field>
          <Field help={housingNow === null ? h.housingNowHint : undefined}>
            <MoneyField label={h.housingNow} currency={currency} value={ends} onValueChange={(v) => setHousingNow(Math.max(0, v))} />
          </Field>
          {!house && (
            <Field help={h.feeHint}>
              <MoneyField label={h.fee} currency={currency} value={fee ?? 0} onValueChange={setFee} />
            </Field>
          )}
          {house && (
            <Field help={h.deedsHint}>
              <MoneyField label={h.deeds} currency={currency} value={deeds} onValueChange={(v) => setDeeds(Math.max(0, v))} />
            </Field>
          )}
          <Field help={h.electricityHint[type]}>
            <NumberField label={h.electricity} value={kwh} onChange={setKwh} />
          </Field>
          <Field help={electricityNote ?? (kwh !== null && krPerKwh === undefined ? c.chargingUnknown : undefined)}>
            <NumberField label={h.electricityPrice} value={kwhPrice} onChange={setKwhPrice} step="0.01" placeholder={electricity ? electricity.krPerKwh.toFixed(2) : undefined} />
          </Field>
          {house && (
            <>
              <Field help={h.heatingHint}>
                <MoneyField label={h.heating} currency={currency} value={heating ?? 0} onValueChange={setHeating} />
              </Field>
              <Field help={h.waterHint}>
                <MoneyField label={h.water} currency={currency} value={water ?? 0} onValueChange={setWater} />
              </Field>
            </>
          )}
          <Field help={h.maintenanceHint}>
            <MoneyField label={h.maintenance} currency={currency} value={maintenance ?? 0} onValueChange={setMaintenance} />
          </Field>
          <Field help={<SourceLinks label={c.getQuote} links={QUOTE_LINKS} />}>
            <MoneyField label={h.insurance} currency={currency} value={insurance ?? 0} onValueChange={setInsurance} />
          </Field>
        </FieldGrid>
      </ToolSection>

      <details className="rounded-xl border border-line p-3">
        <summary className="cursor-pointer text-[13px] font-medium text-ink">
          {h.loanTitle} <span className="font-normal text-muted">· {h.loanSummary(down === null ? c.suggestedDown : money(down), formatPercent(rate / 100, 2))}</span>
        </summary>
        <FieldGrid className="mt-3">
          <Field help={down === null ? h.downHint : undefined}>
            <MoneyField label={t.planning.afford.downPayment} currency={currency} value={main?.down ?? down ?? 0} onValueChange={(v) => setDown(Math.max(0, v))} />
          </Field>
          <Field
            help={<SourceLinks label={apr === null ? `${t.planning.afford.rateHint(formatPercent(rate / 100, 2))} ·` : undefined} links={[{ name: h.compareRates, url: RATES }]} />}
          >
            <NumberField label={t.planning.afford.interest} value={apr} onChange={setApr} placeholder={String(rate)} step="0.01" />
          </Field>
        </FieldGrid>
        {(down !== null || cash !== null || housingNow !== null) && (
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
        )}
      </details>
    </>
  );

  const verdict =
    main && impact ? (
      <div className="space-y-3">
        <Callout tone={verdictTone(main.verdict)}>
          <strong>{h.verdict[main.verdict](money(main.price))}</strong> {h.split(money(main.down), money(main.loan), money(main.mortgage.monthly))}{' '}
          {main.change >= 0 ? h.moreThanNow(money(main.monthly), money(main.change)) : h.lessThanNow(money(main.monthly), money(-main.change))}
          {main.costs > 0 && h.stampDuty(money(main.costs))}
          {main.change > breathingRoom && c.overBy(money(main.change - breathingRoom))}
          {main.down < main.minDown && h.minDown(money(main.minDown))}
          {main.upfront > savings && h.cashShort(money(main.upfront - savings))}
          {main.loan > 0 && h.rateRise(formatPercent((rate + RATE_STRESS) / 100, 2), money(mortgageMonthly(main.loan, main.price, rate + RATE_STRESS).monthly))}
          {missing.length > 0 && c.notIncluded(missing.join(', ').toLowerCase())}
        </Callout>
        {low && <p className="text-[12.5px] text-ink-soft">{c.lowEnd(money(low.price), c.verdictShort[low.verdict], money(low.monthly))}</p>}

        <CostList
          currency={currency}
          rows={[
            { label: h.costs.interest, value: main.mortgage.interest },
            { label: h.costs.deduction, value: -main.mortgage.deduction },
            { label: h.costs.amortization(main.mortgage.percent), value: main.mortgage.amortization },
            ...(house ? [{ label: h.costs.propertyFee, value: propertyMonthly(main.price) }] : [{ label: h.costs.fee, value: fee === null ? null : monthly.fee }]),
            { label: h.costs.electricity, value: kwh === null ? null : monthly.electricity, note: krPerKwh !== undefined ? h.electricityAt(krPerKwh.toFixed(2)) : undefined },
            ...(house
              ? [
                  { label: h.costs.heating, value: monthly.heating },
                  { label: h.costs.water, value: water === null ? null : monthly.water },
                ]
              : []),
            { label: h.costs.maintenance, value: monthly.maintenance },
            { label: h.costs.insurance, value: insurance === null ? null : monthly.insurance },
          ]}
          total={{ label: h.costs.total, value: main.monthly }}
        />

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
    );

  return (
    <ToolGrid answer={answer} inputs={inputs} verdict={verdict}>
      {loans.sheet}
      {goalSheet.sheet}
    </ToolGrid>
  );
}
