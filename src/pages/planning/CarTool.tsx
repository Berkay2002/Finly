import { Check, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  AVERAGE_FUEL_PRICE,
  CAR_FUELS,
  FUEL_PRICES_MONTH,
  TYPICAL_CONSUMPTION,
  carInfoUrl,
  maintenanceEstimate,
  runningCosts,
  vehicleTax,
  type CarFuel,
} from '@/engine/car';
import { typicalRate } from '@/engine/debts';
import { formatMoney, formatMonthKey, formatPercent } from '@/engine/format';
import { computeMetrics, monthKeyOf } from '@/engine/metrics';
import {
  CAR_MIN_DOWN_SHARE,
  drawFrom,
  fundingSources,
  installment,
  maxAffordablePrice,
  purchaseImpact,
  runScenario,
  suggestedDownPayment,
} from '@/engine/scenarios';
import { accountRole, suggestionBySlug } from '@/engine/taxonomy';
import { useT } from '@/i18n';
import { useDraft } from '@/store/draftStore';
import { usePlanStore } from '@/store/planStore';
import { useCurrency, useGovBondRate, usePlan } from '@/store/selectors';
import { fromSuggestion } from '@/components/forms/ExpenseEditor';
import { useGoalSheet } from '@/components/forms/GoalEditor';
import { useLoanSheet } from '@/components/forms/LoanEditor';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { DateField, MoneyField, SelectField, TextField } from '@/components/ui/fields';
import {
  AnswerPanel,
  CostList,
  Field,
  FieldGrid,
  NumberField,
  ScenarioResults,
  SourceLinks,
  ToolGrid,
  ToolSection,
  VerdictHeadline,
  isoDay,
  roundDown,
  useElectricityPrice,
  usePurchaseDate,
} from './results';

const QUOTE_LINKS = [
  { name: 'Folksam', url: 'https://www.folksam.se/forsakringar/bilforsakring' },
  { name: 'If', url: 'https://www.if.se/privat/forsakringar/bilforsakring' },
  { name: 'Trygg-Hansa', url: 'https://www.trygghansa.se/forsakringar/bilforsakring' },
  { name: 'Länsförsäkringar', url: 'https://www.lansforsakringar.se/privat/forsakring/bilforsakring/' },
];

/**
 * Can I afford this car? Answers first with the most car the plan carries, from the money that can go down by
 * the purchase month (the landing account's balance and leftovers until then, plus any savings the user
 * includes) and what the breathing room pays a month; then judges a price (or range) with the car's own running
 * costs and a car loan. What people rarely know (fuel use and price, upkeep) starts from an estimate.
 */
export function CarTool() {
  const plan = usePlan();
  const gov = useGovBondRate();
  const currency = useCurrency();
  const addExpense = usePlanStore((s) => s.addExpense);
  const loans = useLoanSheet();
  const goalSheet = useGoalSheet();
  const t = useT();
  const a = t.planning.afford;
  const c = t.planning.car;
  const money = (n: number) => formatMoney(n, currency);
  const share = (n: number, of: number) => formatPercent(of > 0 ? n / of : 0, 0);
  const field = useDraft('car');
  const { today, date, setDate, when } = usePurchaseDate(field);

  const [priceFrom, setPriceFrom] = field('priceFrom', 0);
  const [priceTo, setPriceTo] = field('priceTo', 0);
  const [plate, setPlate] = field('plate', '');
  const [fuel, setFuel] = field<CarFuel>('fuel', 'petrol');
  const [co2, setCo2] = field<number | null>('co2', null);
  const [firstRegistered, setFirstRegistered] = field('firstRegistered', '');
  const [km, setKm] = field<number | null>('km', 12000);
  const [consumption, setConsumption] = field<number | null>('consumption', null);
  const [unitPrice, setUnitPrice] = field<number | null>('unitPrice', null);
  const [insurance, setInsurance] = field<number | null>('insurance', null);
  const [service, setService] = field<number | null>('service', null);
  const [parking, setParking] = field<number | null>('parking', null);
  const [sources, setSources] = field<string[]>('sources', []);
  const [down, setDown] = field<number | null>('down', null);
  const [apr, setApr] = field<number | null>('apr', null);
  const [years, setYears] = field('years', 5);
  const [setupFee, setSetupFee] = field('setupFee', 0);
  const [monthlyFee, setMonthlyFee] = field('monthlyFee', 0);
  const [added, setAdded] = useState(false);

  // Charging at home is priced from the household's own electricity bills, else last month's spot price.
  const electric = fuel === 'electric';
  const { price: charging, spot } = useElectricityPrice(plan, electric);

  // The tax needs CO2 and the registration month (malus runs three years from it); an electric car pays the base.
  const taxKnown = electric || (co2 !== null && firstRegistered !== '');
  const tax = vehicleTax({ fuel, co2: co2 ?? 0, firstRegistered: firstRegistered || monthKeyOf(today) }, when);
  const use = consumption ?? TYPICAL_CONSUMPTION[fuel];
  const energyPrice = unitPrice ?? (electric ? charging?.krPerKwh : AVERAGE_FUEL_PRICE[fuel as Exclude<CarFuel, 'electric'>]);
  const upkeep = maintenanceEstimate({ fuel, firstRegistered, kmPerYear: km ?? 0 }, when);
  const run = runningCosts({
    taxYearly: taxKnown ? tax.yearly : 0,
    kmPerYear: km ?? 0,
    consumption: use,
    unitPrice: energyPrice ?? 0,
    insuranceMonthly: insurance ?? 0,
    serviceYearly: service ?? upkeep.yearly,
    parkingMonthly: parking ?? 0,
  });
  const missing = [
    !taxKnown && c.costs.tax,
    energyPrice === undefined && c.costs.charging,
    insurance === null && c.costs.insurance,
  ].filter((x): x is string => !!x);

  const base = useMemo(() => purchaseImpact(plan, { amount: 0, date: when }, today, gov), [plan, when, today, gov]);
  const savings = useMemo(() => fundingSources(plan, when, today, gov), [plan, when, today, gov]);
  const breathingRoom = useMemo(() => computeMetrics(plan, when, gov).breathingRoom, [plan, when, gov]);
  const chosen = savings.filter((s) => sources.includes(s.accountId));
  const cash = base.room + chosen.reduce((sum, s) => sum + s.available, 0);

  const rate = apr ?? typicalRate('car', true);
  const months = Math.max(1, Math.round(years * 12));
  const loanFor = (loan: number) => installment(Math.max(0, loan), months, rate, setupFee, monthlyFee);
  const loanMonthly = (loan: number) => (loan > 0 ? loanFor(loan).monthly : 0);
  const maxFor = (budget: number) => roundDown(maxAffordablePrice({ cash, budget, minShare: CAR_MIN_DOWN_SHARE, loanMonthly }), 1000);
  const max = maxFor(breathingRoom - run.total);
  const comfortable = maxFor(breathingRoom / 2 - run.total);

  const judge = (price: number) => {
    // The suggestion is what the everyday account can spare; savings only go in when the user asks for more.
    const d = Math.min(price, down ?? suggestedDownPayment(base.room, price, CAR_MIN_DOWN_SHARE));
    const loan = loanFor(price - d);
    const fromSavings = drawFrom(chosen, d - base.room);
    const short = Math.max(0, d - base.room - fromSavings.reduce((sum, s) => sum + s.amount, 0));
    const monthly = (price > d ? loan.monthly : 0) + run.total;
    return { price, down: d, loan, monthly, fromSavings, short, verdict: price <= comfortable ? 'comfortable' : price <= max ? 'tight' : 'no' } as const;
  };
  const top = Math.max(priceFrom, priceTo);
  const main = top > 0 ? judge(top) : null;
  const low = priceTo > priceFrom && priceFrom > 0 ? judge(priceFrom) : null;
  const minDown = Math.ceil(top * CAR_MIN_DOWN_SHARE);
  const maxDown = Math.max(minDown, Math.min(top, roundDown(cash, 100)));

  const mainMonthly = main?.monthly;
  const scenario = useMemo(
    () =>
      mainMonthly === undefined
        ? null
        : runScenario(plan, { type: 'add_expense', name: c.carName, amount: mainMonthly, frequency: 'monthly', category: 'transport', essential: false, committed: true }, today),
    [plan, mainMonthly, today, c.carName],
  );

  const addRunningCosts = () => {
    const lines: [string, number, 'monthly' | 'yearly'][] = [
      ['vehicle_tax', run.tax * 12, 'yearly'],
      [electric ? 'ev_charging' : 'fuel', run.energy, 'monthly'],
      ['car_insurance', run.insurance, 'monthly'],
      ['car_service', run.service * 12, 'yearly'],
      ['car_parking', run.parking, 'monthly'],
    ];
    for (const [slug, amount, frequency] of lines) {
      const s = suggestionBySlug(slug);
      if (s && amount > 0) addExpense({ ...fromSuggestion(s), occurrences: undefined, amount: Math.round(amount), frequency });
    }
    setAdded(true);
  };

  const month = formatMonthKey(monthKeyOf(when));
  const answer = (
    <AnswerPanel
      figures={
        max > 0
          ? [
              { label: c.upTo, value: money(max) },
              { label: c.comfortablyUpTo, value: comfortable > 0 ? money(comfortable) : '–', positive: true },
            ]
          : []
      }
      note={
        <>
          {c.basis(money(cash), month, formatPercent(rate / 100, 1), years)}{' '}
          {missing.length === 0 || run.total > 0 ? c.runningIncluded(money(run.total)) : c.runningMissing}
        </>
      }
      empty={c.none(money(breathingRoom))}
    />
  );

  const perKrona = ((km ?? 0) * use) / 100 / 12;
  const inputs = (
    <>
      <FieldGrid cols={3}>
        <Field>
          <MoneyField label={c.price} currency={currency} value={priceFrom} onValueChange={setPriceFrom} />
        </Field>
        <Field>
          <MoneyField label={c.priceTo} hint={t.planning.allowance.optional} currency={currency} value={priceTo} onValueChange={setPriceTo} />
        </Field>
        <Field>
          <DateField label={a.when} value={date} min={isoDay(today)} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </FieldGrid>

      <ToolSection title={c.carTitle}>
        <FieldGrid className="mt-2">
          <Field help={<SourceLinks links={[{ name: c.lookUp, url: carInfoUrl(plate) }]} />}>
            <TextField label={c.plate} placeholder="ABC 123" value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} />
          </Field>
          <Field>
            <SelectField label={c.fuel} value={fuel} onValueChange={setFuel} options={CAR_FUELS.map((f) => ({ value: f, label: c.fuels[f] }))} />
          </Field>
          {!electric && (
            <Field help={c.co2Hint}>
              <NumberField label={c.co2} value={co2} onChange={setCo2} />
            </Field>
          )}
          <Field>
            <TextField label={c.firstRegistered} type="month" value={firstRegistered} onChange={(e) => setFirstRegistered(e.target.value)} />
          </Field>
          <Field>
            <NumberField label={c.km} value={km} onChange={setKm} />
          </Field>
          <Field help={consumption === null ? c.typical(String(TYPICAL_CONSUMPTION[fuel])) : undefined}>
            <NumberField
              label={electric ? c.kwhPer100 : c.litresPer100}
              value={consumption}
              onChange={setConsumption}
              step="0.1"
              placeholder={String(TYPICAL_CONSUMPTION[fuel])}
            />
          </Field>
          <Field
            wide
            help={
              !electric
                ? c.fuelPriceHint(formatMonthKey(FUEL_PRICES_MONTH), money(perKrona))
                : charging?.source === 'tariff'
                  ? c.chargingFromBills
                  : charging && spot
                    ? c.chargingFromSpot(formatMonthKey(spot.month), spot.area)
                    : c.chargingUnknown
            }
          >
            <NumberField
              label={electric ? c.pricePerKwh : c.pricePerLitre}
              value={unitPrice}
              onChange={setUnitPrice}
              step="0.01"
              placeholder={energyPrice !== undefined && unitPrice === null ? energyPrice.toFixed(2) : undefined}
            />
          </Field>
          <Field help={<SourceLinks label={c.getQuote} links={QUOTE_LINKS} />}>
            <MoneyField label={c.insurance} currency={currency} value={insurance ?? 0} onValueChange={setInsurance} />
          </Field>
          <Field>
            <MoneyField label={c.parking} hint={t.planning.allowance.optional} currency={currency} value={parking ?? 0} onValueChange={setParking} />
          </Field>
          <Field wide help={service === null ? c.serviceHint(money(upkeep.service), money(upkeep.tyres), money(upkeep.repairs)) : undefined}>
            <MoneyField
              label={c.service}
              currency={currency}
              value={service ?? 0}
              placeholder={String(upkeep.yearly)}
              // Clearing the field goes back to the estimate.
              onValueChange={(v) => setService(v > 0 ? v : null)}
            />
          </Field>
        </FieldGrid>

        <CostList
          className="mt-3"
          currency={currency}
          rows={[
            {
              label: c.costs.tax,
              value: taxKnown ? run.tax : null,
              note: tax.malusUntil ? c.malus(formatMonthKey(tax.malusUntil), money(tax.afterMalus ?? 0)) : c.perYear(money(tax.yearly)),
            },
            {
              label: electric ? c.costs.charging : c.costs.fuel,
              value: energyPrice === undefined ? null : run.energy,
              note: consumption === null || unitPrice === null ? c.estimate : undefined,
            },
            { label: c.costs.insurance, value: insurance === null ? null : run.insurance },
            { label: c.costs.service, value: run.service, note: service === null ? c.estimate : undefined },
            { label: c.costs.parking, value: run.parking },
          ]}
          total={{ label: c.costs.total, value: run.total }}
        />
      </ToolSection>

      <ToolSection title={c.payTitle}>
        <p className="mt-0.5 text-[12.5px] text-muted">{c.moneyBy(month)}</p>
        <ul className="mt-2 divide-y divide-line rounded-lg bg-page/60 px-3 text-[12.5px]">
          <li className="flex items-baseline justify-between gap-3 py-2">
            <span className="min-w-0">
              <span className="block text-ink">{base.account}</span>
              <span className="block text-muted">
                {c.everydayNote(money(base.landingNow), money(base.landingBefore - base.landingNow))}
                {base.room < base.landingBefore - 0.5 && c.keptBack(money(base.landingBefore - base.room))}
              </span>
            </span>
            <span className="tabular shrink-0 text-ink">{money(base.room)}</span>
          </li>
          {savings.map((s) => (
            <li key={s.accountId}>
              <label className="flex cursor-pointer items-baseline justify-between gap-3 py-2">
                <span className="flex min-w-0 items-baseline gap-2">
                  <input
                    type="checkbox"
                    className="translate-y-0.5 accent-brand-solid"
                    checked={sources.includes(s.accountId)}
                    onChange={(e) => setSources(e.target.checked ? [...sources, s.accountId] : sources.filter((id) => id !== s.accountId))}
                  />
                  <span className="min-w-0">
                    <span className="block text-ink">{s.name}</span>
                    {(s.tax > 0 || accountRole(s.kind) === 'emergency') && (
                      <span className="block text-muted">{s.tax > 0 ? c.afterTax(money(s.tax)) : c.bufferNote}</span>
                    )}
                  </span>
                </span>
                <span className={sources.includes(s.accountId) ? 'tabular shrink-0 text-ink' : 'tabular shrink-0 text-faint'}>{money(s.available)}</span>
              </label>
            </li>
          ))}
          {savings.length > 0 && (
            <li className="flex items-baseline justify-between gap-3 py-2 font-semibold text-ink">
              <span>{c.available}</span>
              <span className="tabular">{money(cash)}</span>
            </li>
          )}
        </ul>

        {main && (
          <div className="mt-3">
            <MoneyField label={a.downPayment} currency={currency} value={main.down} onValueChange={(v) => setDown(Math.max(0, v))} />
            {maxDown > minDown && (
              <>
                <input
                  type="range"
                  aria-label={a.downPayment}
                  className="mt-3 w-full accent-brand-solid"
                  min={minDown}
                  max={maxDown}
                  step={100}
                  value={Math.min(maxDown, Math.max(minDown, main.down))}
                  onChange={(e) => setDown(Number(e.target.value))}
                />
                <div className="tabular flex justify-between gap-3 text-[12px] text-muted">
                  <span>{c.downMin(share(minDown, top), money(minDown))}</span>
                  <span className="text-right">{c.downMax(share(maxDown, top), money(maxDown))}</span>
                </div>
                {maxDown < top && (
                  <p className="mt-2 text-[12.5px] text-ink-soft">
                    {c.downCompare(
                      share(minDown, top),
                      money(loanFor(top - minDown).monthly),
                      share(maxDown, top),
                      money(loanFor(top - maxDown).monthly),
                      money(loanFor(top - minDown).extra - loanFor(top - maxDown).extra),
                    )}
                  </p>
                )}
              </>
            )}
            {down !== null && (
              <Button className="mt-2" size="sm" variant="secondary" onClick={() => setDown(null)}>
                {a.useSuggested}
              </Button>
            )}
          </div>
        )}

        <details className="mt-3 border-t border-line pt-3">
          <summary className="cursor-pointer text-[13px] font-medium text-ink">
            {c.loanTitle} <span className="font-normal text-muted">{c.loanSummary(formatPercent(rate / 100, 1), years)}</span>
          </summary>
          <FieldGrid className="mt-3">
            <Field help={apr === null ? a.rateHint(formatPercent(rate / 100, 1)) : undefined}>
              <NumberField label={a.interest} value={apr} onChange={setApr} placeholder={String(rate)} step="0.01" />
            </Field>
            <Field>
              <NumberField label={c.years} value={years} onChange={(v) => setYears(Math.max(1, v ?? 1))} />
            </Field>
            <Field>
              <MoneyField label={a.setupFee} currency={currency} value={setupFee} onValueChange={setSetupFee} />
            </Field>
            <Field>
              <MoneyField label={a.monthlyFee} currency={currency} value={monthlyFee} onValueChange={setMonthlyFee} />
            </Field>
          </FieldGrid>
        </details>
      </ToolSection>
    </>
  );

  const paidFrom = main
    ? [
        ...(Math.min(main.down, base.room) > 0 ? [`${base.account} ${money(Math.min(main.down, base.room))}`] : []),
        ...main.fromSavings.map((s) => `${s.source.name} ${money(s.amount)}`),
      ].join(' + ')
    : '';

  const verdict =
    main && scenario ? (
      <div className="space-y-3">
        <VerdictHeadline
          verdict={main.verdict}
          title={c.headline[main.verdict]}
          amount={c.perMonth(money(main.monthly))}
          detail={main.price > main.down ? c.breakdown(money(main.loan.monthly), years, money(run.total)) : c.paidInFull(money(run.total))}
        >
          {paidFrom && <p>{c.downFrom(money(main.down), paidFrom)}</p>}
          {low && <p>{c.lowEnd(money(low.price), c.verdictShort[low.verdict], money(low.monthly))}</p>}
          {missing.length > 0 && <p className="text-muted">{c.notIncluded(missing.join(', ').toLowerCase()).trim()}</p>}
        </VerdictHeadline>
        {main.short > 0 && (
          <Callout
            tone="warning"
            action={
              cash >= minDown && (
                <Button size="sm" variant="secondary" onClick={() => setDown(maxDown)}>
                  {c.useAvailable(money(maxDown))}
                </Button>
              )
            }
          >
            {c.downShort(money(main.short))}
          </Callout>
        )}
        <ScenarioResults
          result={scenario}
          currency={currency}
          onEditGoal={goalSheet.openEdit}
          label={c.carName}
          details={main.price > main.down ? [{ label: c.interestOver(years), value: money(main.loan.extra) }] : []}
        />
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button size="sm" variant="secondary" icon={added ? Check : Plus} disabled={added || run.total <= 0} onClick={addRunningCosts}>
            {added ? c.addedRunning : c.addRunning}
          </Button>
          {main.price > main.down && (
            <Button
              size="sm"
              variant="soft"
              icon={Plus}
              onClick={() =>
                loans.openNew('car', {
                  name: plate ? `${c.carName} ${plate}` : c.carName,
                  balance: main.price - main.down,
                  rate,
                  payment: main.loan.monthly,
                  frequency: 'monthly',
                  assetValue: main.price,
                })
              }
            >
              {a.addLoan}
            </Button>
          )}
        </div>
      </div>
    ) : (
      <Callout tone="neutral">{c.enterPrice}</Callout>
    );

  return (
    <ToolGrid answer={answer} inputs={inputs} verdict={verdict}>
      {loans.sheet}
      {goalSheet.sheet}
    </ToolGrid>
  );
}
