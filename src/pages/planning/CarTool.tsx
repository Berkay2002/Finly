import { Check, ExternalLink, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { format, isValid, parseISO, setDate as setDayOfMonth } from 'date-fns';
import { CAR_FUELS, homeChargingPrice, runningCosts, vehicleTax, type CarFuel } from '@/engine/car';
import { typicalRate } from '@/engine/debts';
import { formatMoney, formatMonthKey, formatPercent } from '@/engine/format';
import { homePriceArea } from '@/engine/home';
import { computeMetrics, monthKeyOf } from '@/engine/metrics';
import { monthsAhead } from '@/engine/projections';
import { CAR_MIN_DOWN_SHARE, installment, maxAffordablePrice, purchaseImpact, runScenario, suggestedDownPayment } from '@/engine/scenarios';
import { suggestionBySlug } from '@/engine/taxonomy';
import { useT } from '@/i18n';
import { fetchSpotAverage, previousMonthKey, type SpotAverage } from '@/lib/spotPrice';
import { usePlanStore } from '@/store/planStore';
import { useCurrency, useGovBondRate, usePlan, useViewDate } from '@/store/selectors';
import { fromSuggestion } from '@/components/forms/ExpenseEditor';
import { useGoalSheet } from '@/components/forms/GoalEditor';
import { useLoanSheet } from '@/components/forms/LoanEditor';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { DateField, MoneyField, SelectField, TextField } from '@/components/ui/fields';
import { DeltaTile, NumberField, ScenarioResults } from './results';

const isoDay = (d: Date) => format(d, 'yyyy-MM-dd');

const QUOTE_LINKS = [
  { name: 'Folksam', url: 'https://www.folksam.se/forsakringar/bilforsakring' },
  { name: 'If', url: 'https://www.if.se/privat/forsakringar/bilforsakring' },
  { name: 'Trygg-Hansa', url: 'https://www.trygghansa.se/forsakringar/bilforsakring' },
  { name: 'Länsförsäkringar', url: 'https://www.lansforsakringar.se/privat/forsakring/bilforsakring/' },
];
const PLATE_LOOKUP = 'https://fordon-fu-regnr.transportstyrelsen.se/';
const FUEL_PRICES = 'https://bensinpriser.se/';

/**
 * Can I afford this car? Answers first with the most car the plan carries, from what the landing account can
 * spare as down payment and what the breathing room pays a month; then judges a price (or range) with the
 * car's own running costs and a car loan.
 */
export function CarTool() {
  const plan = usePlan();
  const viewDate = useViewDate();
  const gov = useGovBondRate();
  const currency = useCurrency();
  const addExpense = usePlanStore((s) => s.addExpense);
  const loans = useLoanSheet();
  const goalSheet = useGoalSheet();
  const t = useT();
  const c = t.planning.car;
  const money = (n: number) => formatMoney(n, currency);
  const today = useMemo(() => new Date(), []);

  const [priceFrom, setPriceFrom] = useState(0);
  const [priceTo, setPriceTo] = useState(0);
  const [date, setDate] = useState(() => isoDay(monthsAhead(today, viewDate) > 0 ? setDayOfMonth(viewDate, 15) : today));
  const [plate, setPlate] = useState('');
  const [fuel, setFuel] = useState<CarFuel>('petrol');
  const [co2, setCo2] = useState<number | null>(null);
  const [firstRegistered, setFirstRegistered] = useState(() => monthKeyOf(today));
  const [km, setKm] = useState<number | null>(12000);
  const [consumption, setConsumption] = useState<number | null>(null);
  const [unitPrice, setUnitPrice] = useState<number | null>(null);
  const [insurance, setInsurance] = useState<number | null>(null);
  const [service, setService] = useState<number | null>(null);
  const [parking, setParking] = useState<number | null>(null);
  const [down, setDown] = useState<number | null>(null);
  const [apr, setApr] = useState<number | null>(null);
  const [years, setYears] = useState(5);
  const [setupFee, setSetupFee] = useState(0);
  const [monthlyFee, setMonthlyFee] = useState(0);
  const [spot, setSpot] = useState<SpotAverage | null>(null);
  const [added, setAdded] = useState(false);

  const when = useMemo(() => {
    const d = parseISO(date);
    return isValid(d) && d > today ? d : today;
  }, [date, today]);

  // Charging at home is priced from the household's own electricity bills, else last month's spot price.
  const charging = fuel === 'electric' ? homeChargingPrice(plan, spot?.oreInclVat) : null;
  useEffect(() => {
    if (fuel !== 'electric' || spot || homeChargingPrice(plan)) return;
    fetchSpotAverage(homePriceArea(plan).area, previousMonthKey())
      .then(setSpot)
      .catch(() => undefined);
  }, [fuel, spot, plan]);

  const tax = vehicleTax({ fuel, co2: co2 ?? 0, firstRegistered }, when);
  const needsCo2 = fuel !== 'electric';
  const run = runningCosts({
    taxYearly: needsCo2 && co2 === null ? 0 : tax.yearly,
    kmPerYear: km ?? 0,
    consumption: consumption ?? 0,
    unitPrice: unitPrice ?? charging?.krPerKwh ?? 0,
    insuranceMonthly: insurance ?? 0,
    serviceYearly: service ?? 0,
    parkingMonthly: parking ?? 0,
  });
  const missing = [
    needsCo2 && co2 === null && c.costs.tax,
    (consumption === null || (unitPrice ?? charging?.krPerKwh) === undefined) && (fuel === 'electric' ? c.costs.charging : c.costs.fuel),
    insurance === null && c.costs.insurance,
    service === null && c.costs.service,
  ].filter((x): x is string => !!x);

  const { room } = useMemo(() => purchaseImpact(plan, { amount: 0, date: when }, today, gov), [plan, when, today, gov]);
  const breathingRoom = useMemo(() => computeMetrics(plan, when, gov).breathingRoom, [plan, when, gov]);
  const rate = apr ?? typicalRate('car', true);
  const months = Math.max(1, Math.round(years * 12));
  const loanMonthly = (loan: number) => (loan > 0 ? installment(loan, months, rate, setupFee, monthlyFee).monthly : 0);
  // Whole thousands: the answer is a guide, not a quote.
  const maxFor = (budget: number) =>
    Math.floor(maxAffordablePrice({ cash: room, budget, minShare: CAR_MIN_DOWN_SHARE, loanMonthly }) / 1000) * 1000;
  const max = maxFor(breathingRoom - run.total);
  const comfortable = maxFor(breathingRoom / 2 - run.total);

  const judge = (price: number) => {
    const d = Math.min(price, down ?? suggestedDownPayment(room, price, CAR_MIN_DOWN_SHARE));
    const loan = installment(price - d, months, rate, setupFee, monthlyFee);
    const monthly = loan.monthly + run.total;
    return { price, down: d, loan, monthly, verdict: price <= comfortable ? 'comfortable' : price <= max ? 'tight' : 'no' } as const;
  };
  const top = Math.max(priceFrom, priceTo);
  const main = top > 0 ? judge(top) : null;
  const low = priceTo > priceFrom && priceFrom > 0 ? judge(priceFrom) : null;

  const mainDown = main?.down;
  const mainMonthly = main?.monthly;
  const impact = useMemo(
    () => (mainDown === undefined ? null : purchaseImpact(plan, { amount: mainDown, date: when }, today, gov)),
    [plan, mainDown, when, today, gov],
  );
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
      [fuel === 'electric' ? 'ev_charging' : 'fuel', run.energy, 'monthly'],
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
                  <div className="text-[12px] text-ink-soft">{c.upTo}</div>
                  <div className="tabular text-[22px] font-bold text-ink">{money(max)}</div>
                </div>
                <div>
                  <div className="text-[12px] text-ink-soft">{c.comfortablyUpTo}</div>
                  <div className="tabular text-[22px] font-bold text-positive">{comfortable > 0 ? money(comfortable) : '–'}</div>
                </div>
              </div>
              <p className="mt-2 text-[12.5px] text-muted">
                {c.basis(money(room), formatPercent(rate / 100, 1), years)}{' '}
                {missing.length === 0 || run.total > 0 ? c.runningIncluded(money(run.total)) : c.runningMissing}
              </p>
            </>
          ) : (
            <p className="mt-1 text-[13px] text-ink-soft">{c.none(money(breathingRoom))}</p>
          )}
        </div>
      </div>

      <div className="space-y-4 lg:col-start-1 lg:row-span-2 lg:row-start-1">
        {/* Price */}
        <div className="grid gap-3 sm:grid-cols-3">
          <MoneyField label={c.price} currency={currency} value={priceFrom} onValueChange={setPriceFrom} />
          <MoneyField label={c.priceTo} hint={t.planning.allowance.optional} currency={currency} value={priceTo} onValueChange={setPriceTo} />
          <DateField label={t.planning.afford.when} value={date} min={isoDay(today)} onChange={(e) => setDate(e.target.value)} />
        </div>

        {/* The car */}
        <section className="rounded-xl border border-line p-3">
          <div className="text-[13px] font-medium text-ink">{c.carTitle}</div>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div>
              <TextField label={c.plate} placeholder="ABC 123" value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} />
              <a href={PLATE_LOOKUP} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[12px] text-brand-600 hover:underline">
                {c.lookUp} <ExternalLink size={11} />
              </a>
            </div>
            <SelectField label={c.fuel} value={fuel} onValueChange={setFuel} options={CAR_FUELS.map((f) => ({ value: f, label: c.fuels[f] }))} />
            {needsCo2 && <NumberField label={c.co2} hint={c.co2Hint} value={co2} onChange={setCo2} />}
            <TextField label={c.firstRegistered} type="month" value={firstRegistered} onChange={(e) => e.target.value && setFirstRegistered(e.target.value)} />
            <NumberField label={c.km} value={km} onChange={setKm} />
            <NumberField label={fuel === 'electric' ? c.kwhPer100 : c.litresPer100} value={consumption} onChange={setConsumption} step="0.1" />
            <div className="sm:col-span-2">
              <NumberField
                label={fuel === 'electric' ? c.pricePerKwh : c.pricePerLitre}
                value={unitPrice}
                onChange={setUnitPrice}
                step="0.01"
                placeholder={charging ? charging.krPerKwh.toFixed(2) : undefined}
              />
              <p className="mt-1 text-[12px] text-muted">
                {fuel !== 'electric' ? (
                  <a href={FUEL_PRICES} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                    {c.fuelPriceLink} <ExternalLink size={11} />
                  </a>
                ) : charging?.source === 'tariff' ? (
                  c.chargingFromBills
                ) : charging && spot ? (
                  c.chargingFromSpot(formatMonthKey(spot.month), spot.area)
                ) : (
                  c.chargingUnknown
                )}
              </p>
            </div>
            <div>
              <MoneyField label={c.insurance} currency={currency} value={insurance ?? 0} onValueChange={setInsurance} />
              <p className="mt-1 flex flex-wrap gap-x-2 text-[12px] text-muted">
                {c.getQuote}
                {QUOTE_LINKS.map((q) => (
                  <a key={q.name} href={q.url} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
                    {q.name}
                  </a>
                ))}
              </p>
            </div>
            <MoneyField label={c.service} hint={c.serviceHint} currency={currency} value={service ?? 0} onValueChange={setService} />
            <MoneyField label={c.parking} hint={t.planning.allowance.optional} currency={currency} value={parking ?? 0} onValueChange={setParking} />
          </div>

          <dl className="mt-3 divide-y divide-line rounded-lg bg-page/60 px-3 text-[12.5px]">
            {[
              { label: c.costs.tax, value: needsCo2 && co2 === null ? null : run.tax, note: tax.malusUntil ? c.malus(formatMonthKey(tax.malusUntil), money(tax.afterMalus ?? 0)) : c.perYear(money(tax.yearly)) },
              { label: fuel === 'electric' ? c.costs.charging : c.costs.fuel, value: run.energy > 0 ? run.energy : null },
              { label: c.costs.insurance, value: insurance === null ? null : run.insurance },
              { label: c.costs.service, value: service === null ? null : run.service },
              { label: c.costs.parking, value: run.parking },
            ].map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-3 py-1.5">
                <dt className="text-ink-soft">
                  {row.label}
                  {row.value !== null && row.note && <span className="ml-1 text-muted">· {row.note}</span>}
                </dt>
                <dd className="tabular text-ink">{row.value === null ? <span className="text-muted">{c.notEntered}</span> : money(row.value)}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-3 py-1.5 font-semibold">
              <dt className="text-ink">{c.costs.total}</dt>
              <dd className="tabular text-ink">{money(run.total)}</dd>
            </div>
          </dl>
        </section>

        {/* The loan */}
        <details className="rounded-xl border border-line p-3">
          <summary className="cursor-pointer text-[13px] font-medium text-ink">
            {c.loanTitle} <span className="font-normal text-muted">· {c.loanSummary(down === null ? c.suggestedDown : money(down), formatPercent(rate / 100, 1), years)}</span>
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <MoneyField
              label={t.planning.afford.downPayment}
              hint={down === null ? c.downHint : undefined}
              currency={currency}
              value={main?.down ?? down ?? 0}
              onValueChange={(v) => setDown(Math.max(0, v))}
            />
            <NumberField label={t.planning.afford.interest} hint={apr === null ? t.planning.afford.rateHint(formatPercent(rate / 100, 1)) : undefined} value={apr} onChange={setApr} placeholder={String(rate)} step="0.01" />
            <NumberField label={c.years} value={years} onChange={(v) => setYears(Math.max(1, v ?? 1))} />
            <MoneyField label={t.planning.afford.setupFee} currency={currency} value={setupFee} onValueChange={setSetupFee} />
            <MoneyField label={t.planning.afford.monthlyFee} currency={currency} value={monthlyFee} onValueChange={setMonthlyFee} />
            {down !== null && (
              <div className="flex items-end">
                <Button size="sm" variant="secondary" onClick={() => setDown(null)}>
                  {t.planning.afford.useSuggested}
                </Button>
              </div>
            )}
          </div>
        </details>
      </div>

      <div className="lg:col-start-2 lg:row-start-2">
        {/* The verdict */}
        {main && impact && scenario ? (
          <div className="space-y-3">
            <Callout tone={main.verdict === 'comfortable' ? 'success' : main.verdict === 'tight' ? 'info' : 'warning'}>
              <strong>{c.verdict[main.verdict](money(main.price))}</strong>{' '}
              {c.split(money(main.down), money(main.price - main.down), money(main.loan.monthly), years)}{' '}
              {c.monthlyTotal(money(run.total), money(main.monthly))}
              {main.monthly > breathingRoom && c.overBy(money(main.monthly - breathingRoom))}
              {impact.shortBy > 0 && c.downFromSavings(money(impact.shortBy))}
              {missing.length > 0 && c.notIncluded(missing.join(', ').toLowerCase())}
            </Callout>
            {low && (
              <p className="text-[12.5px] text-ink-soft">
                {c.lowEnd(money(low.price), c.verdictShort[low.verdict], money(low.monthly))}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <DeltaTile label={t.planning.afford.landing(impact.account)} before={money(impact.landingBefore)} after={money(impact.landingAfter)} change={-main.down} />
              <DeltaTile label={c.loanExtra} before={money(0)} after={money(main.loan.extra)} change={-main.loan.extra} />
              <DeltaTile label={c.monthlyCost} before={money(0)} after={money(main.monthly)} change={-main.monthly} />
            </div>
            <ScenarioResults result={scenario} currency={currency} onEditGoal={goalSheet.openEdit} />
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button size="sm" variant="secondary" icon={added ? Check : Plus} disabled={added || run.total <= 0} onClick={addRunningCosts}>
                {added ? c.addedRunning : c.addRunning}
              </Button>
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
                {t.planning.afford.addLoan}
              </Button>
            </div>
          </div>
        ) : (
          <Callout tone="neutral">{c.enterPrice}</Callout>
        )}
      </div>
      {loans.sheet}
      {goalSheet.sheet}
    </div>
  );
}
