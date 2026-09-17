import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { addMonths } from 'date-fns';
import { typicalRate } from '@/engine/debts';
import { formatMoney, formatMonths, formatPercent, formatShortMonthYear } from '@/engine/format';
import { fxRate, type FxRates } from '@/engine/fx';
import { computeMetrics, monthKeyOf } from '@/engine/metrics';
import { monthsAhead } from '@/engine/projections';
import { tripCost } from '@/engine/purchases';
import { installment, purchaseImpact, runScenario } from '@/engine/scenarios';
import { suggestionBySlug } from '@/engine/taxonomy';
import { useT } from '@/i18n';
import { useDraft } from '@/store/draftStore';
import { FX_CURRENCIES, fetchFx } from '@/lib/fx';
import { useCurrency, useGovBondRate, usePlan } from '@/store/selectors';
import { fromSuggestion, useExpenseSheet } from '@/components/forms/ExpenseEditor';
import { useGoalSheet } from '@/components/forms/GoalEditor';
import { useLoanSheet } from '@/components/forms/LoanEditor';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { DateField, MoneyField, SelectField, TextField } from '@/components/ui/fields';
import {
  AnswerPanel,
  CostList,
  DeltaTile,
  EarliestLine,
  Field,
  FieldGrid,
  NumberField,
  PayOptions,
  ScenarioResults,
  SourceLinks,
  ToolGrid,
  ToolSection,
  isoDay,
  judgeAgainst,
  roundDown,
  usePurchaseDate,
  verdictTone,
  worstVerdict,
  type PayMode,
  type Verdict,
} from './results';

const FLIGHTS = [
  { name: 'Skyscanner', url: 'https://www.skyscanner.se/' },
  { name: 'Google Flights', url: 'https://www.google.com/travel/flights' },
];
const LOCAL_PRICES = 'https://www.numbeo.com/cost-of-living/';

/**
 * Can I afford this trip? What the account can spare by the departure first; then the trip built up from travel,
 * nights, food per person per day and the rest, with prices there in their own currency at the latest ECB rate,
 * judged by saving up for it, paying at once or spreading it out.
 */
export function TripTool() {
  const plan = usePlan();
  const gov = useGovBondRate();
  const currency = useCurrency();
  const expenses = useExpenseSheet();
  const loans = useLoanSheet();
  const goalSheet = useGoalSheet();
  const t = useT();
  const a = t.planning.afford;
  const c = t.planning.car;
  const i = t.planning.item;
  const r = t.planning.trip;
  const money = (n: number) => formatMoney(n, currency);
  const field = useDraft('trip');
  const { today, date, setDate, when } = usePurchaseDate(field);

  const [name, setName] = field('name', '');
  const [nights, setNights] = field<number | null>('nights', 7);
  const [travellers, setTravellers] = field<number | null>('travellers', 2);
  const [local, setLocal] = field('local', currency);
  const [travel, setTravel] = field<number | null>('travel', null);
  const [insurance, setInsurance] = field<number | null>('insurance', null);
  const [stay, setStay] = field<number | null>('stay', null);
  const [food, setFood] = field<number | null>('food', null);
  const [transport, setTransport] = field<number | null>('transport', null);
  const [activities, setActivities] = field<number | null>('activities', null);
  const [spending, setSpending] = field<number | null>('spending', null);
  const [buffer, setBuffer] = field<number | null>('buffer', 10);
  const [pay, setPay] = field<PayMode>('pay', 'save');
  const [months, setMonths] = field('months', 12);
  const [apr, setApr] = field<number | null>('apr', null);
  const [fetched, setFetched] = useState<FxRates | null>(null);

  // Prices there: the plan's own rates when it has the currency, else the latest from the ECB.
  const month = monthKeyOf(today);
  const known = fxRate(plan.fx, local, currency, month) ?? fxRate(fetched ?? undefined, local, currency, month);
  useEffect(() => {
    if (local === currency || fxRate(plan.fx, local, currency, month) !== undefined) return;
    let live = true;
    fetchFx([local, currency], today).then((fx) => live && fx && setFetched(fx));
    return () => {
      live = false;
    };
  }, [local, currency, plan.fx, month, today]);
  const fx = known ?? 1;

  const cost = tripCost({
    travellers: travellers ?? 1,
    nights: nights ?? 0,
    travelPerPerson: travel ?? 0,
    stayPerNight: stay ?? 0,
    foodPerPersonDay: food ?? 0,
    localTransport: transport ?? 0,
    activities: activities ?? 0,
    spending: spending ?? 0,
    insurance: insurance ?? 0,
    bufferPercent: buffer ?? 0,
    fx,
  });
  const total = Math.round(cost.total);
  const label = name || r.name;
  const rate = apr ?? typicalRate('personal', false);

  const base = useMemo(() => purchaseImpact(plan, { amount: 0, date: when }, today, gov), [plan, when, today, gov]);
  const breathingRoom = useMemo(() => computeMetrics(plan, when, gov).breathingRoom, [plan, when, gov]);

  const ahead = monthsAhead(today, when);
  const saveMonths = ahead >= 1 ? ahead : 12;
  const leave = pay === 'save' && ahead < 1 ? addMonths(today, saveMonths) : when;
  const loan = installment(total, months, rate);
  const upfront = pay === 'split' ? 0 : total;
  const monthlyPay = pay === 'split' ? loan.monthly : pay === 'save' ? total / saveMonths : 0;

  const impact = useMemo(() => (total > 0 ? purchaseImpact(plan, { amount: upfront, date: leave }, today, gov) : null), [plan, total, upfront, leave, today, gov]);
  const scenario = useMemo(
    () =>
      total > 0 && monthlyPay > 0
        ? runScenario(plan, { type: 'add_expense', name: label, amount: monthlyPay, frequency: 'monthly', category: 'planned', essential: false, committed: true }, today)
        : null,
    [plan, total, monthlyPay, label, today],
  );
  const verdict: Verdict | null = impact ? worstVerdict(judgeAgainst(upfront, impact.room), judgeAgainst(monthlyPay, breathingRoom)) : null;

  const inLocal = (n: number) => formatMoney(n, local);
  const people = Math.max(1, Math.round(travellers ?? 1));
  const missing = [travel === null && r.costs.travel, stay === null && r.costs.stay, food === null && r.costs.food].filter((x): x is string => !!x);

  const answer = (
    <AnswerPanel
      figures={
        base.room >= 1000
          ? [
              { label: r.upTo, value: money(roundDown(base.room, 1000)) },
              { label: c.comfortablyUpTo, value: money(roundDown(base.room / 2, 1000)), positive: true },
            ]
          : []
      }
      note={r.basis(formatShortMonthYear(when))}
      empty={r.none}
    />
  );

  const inputs = (
    <>
      <FieldGrid>
        <Field wide>
          <TextField label={a.whatIsIt} placeholder={a.kindPlaceholders.trip} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </FieldGrid>
      <FieldGrid cols={3}>
        <Field>
          <DateField label={r.departure} value={date} min={isoDay(today)} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field>
          <NumberField label={r.nights} value={nights} onChange={setNights} />
        </Field>
        <Field>
          <NumberField label={r.travellers} value={travellers} onChange={setTravellers} />
        </Field>
      </FieldGrid>

      <ToolSection title={r.travelTitle}>
        <FieldGrid className="mt-2">
          <Field help={<SourceLinks label={r.findPrices} links={FLIGHTS} />}>
            <MoneyField label={r.travel} currency={currency} value={travel ?? 0} onValueChange={(v) => setTravel(Math.max(0, v))} />
          </Field>
          <Field help={r.insuranceHint}>
            <MoneyField label={r.insurance} currency={currency} value={insurance ?? 0} onValueChange={(v) => setInsurance(Math.max(0, v))} />
          </Field>
        </FieldGrid>
      </ToolSection>

      <ToolSection title={r.stayTitle}>
        <FieldGrid className="mt-2">
          <Field wide help={local === currency ? undefined : known !== undefined ? r.rate(local, `${known.toFixed(known < 1 ? 4 : 2)} ${currency}`) : r.rateMissing}>
            <SelectField label={r.currency} value={local} onValueChange={setLocal} options={[...new Set([currency, ...FX_CURRENCIES])].map((code) => ({ value: code, label: code }))} />
          </Field>
          <Field>
            <MoneyField label={r.stay} currency={local} value={stay ?? 0} onValueChange={(v) => setStay(Math.max(0, v))} />
          </Field>
          <Field help={<SourceLinks links={[{ name: r.foodHint, url: LOCAL_PRICES }]} />}>
            <MoneyField label={r.food} currency={local} value={food ?? 0} onValueChange={(v) => setFood(Math.max(0, v))} />
          </Field>
          <Field>
            <MoneyField label={r.localTransport} currency={local} value={transport ?? 0} onValueChange={(v) => setTransport(Math.max(0, v))} />
          </Field>
          <Field>
            <MoneyField label={r.activities} currency={local} value={activities ?? 0} onValueChange={(v) => setActivities(Math.max(0, v))} />
          </Field>
          <Field>
            <MoneyField label={r.spending} currency={local} value={spending ?? 0} onValueChange={(v) => setSpending(Math.max(0, v))} />
          </Field>
          <Field help={r.bufferHint}>
            <NumberField label={r.buffer} value={buffer} onChange={setBuffer} />
          </Field>
        </FieldGrid>

        <CostList
          className="mt-3"
          currency={currency}
          rows={[
            { label: r.costs.travel, value: travel === null ? null : cost.travel, note: `${people} × ${money(travel ?? 0)}` },
            { label: r.costs.stay, value: stay === null ? null : cost.stay, note: `${cost.days - 1} × ${inLocal(stay ?? 0)}` },
            { label: r.costs.food, value: food === null ? null : cost.food, note: `${people} × ${cost.days} × ${inLocal(food ?? 0)}` },
            { label: r.costs.localTransport, value: cost.localTransport },
            { label: r.costs.activities, value: cost.activities },
            { label: r.costs.spending, value: cost.spending },
            { label: r.costs.insurance, value: cost.insurance },
            { label: r.costs.buffer(buffer ?? 0), value: cost.buffer },
          ]}
          total={{ label: r.costs.total, value: cost.total, note: `${r.perPerson(money(cost.perPerson))} · ${r.perDay(money(cost.perDay))}` }}
        />
      </ToolSection>

      <PayOptions
        value={pay}
        onChange={setPay}
        options={[
          { id: 'save', label: a.saveUp, detail: `${a.perMonth(money(total / saveMonths))} ${a.saveBy(formatShortMonthYear(addMonths(today, saveMonths)))}` },
          { id: 'now', label: a.payNow, detail: money(total) },
          {
            id: 'split',
            label: a.instalments,
            detail: `${a.perMonth(money(loan.monthly))} · ${a.total(money(loan.total))}`,
            extra: loan.extra > 0.5 ? a.extraCost(money(loan.extra)) : undefined,
          },
        ]}
      >
        {pay === 'split' && (
          <FieldGrid className="mt-3">
            <Field>
              <NumberField label={a.months} value={months} onChange={(v) => setMonths(Math.max(1, Math.round(v ?? 1)))} />
            </Field>
            <Field help={apr === null ? a.rateHint(formatPercent(rate / 100, 1)) : undefined}>
              <NumberField label={a.interest} value={apr} onChange={setApr} placeholder={String(rate)} step="0.01" />
            </Field>
          </FieldGrid>
        )}
      </PayOptions>
    </>
  );

  const out =
    total > 0 && impact && verdict ? (
      <div className="space-y-3">
        <Callout tone={verdictTone(verdict)}>
          <strong>{i.verdict[verdict](r.subject(money(total)))}</strong>{' '}
          {pay === 'now'
            ? i.nowSentence(impact.account, money(impact.landingBefore), money(impact.landingAfter))
            : pay === 'split'
              ? i.splitSentence(money(loan.monthly), months, money(loan.total))
              : i.saveSentence(money(monthlyPay), formatShortMonthYear(leave))}
          {impact.shortBy > 0 && i.fromSavings(money(impact.shortBy))}
          {monthlyPay > breathingRoom && c.overBy(money(monthlyPay - breathingRoom))}
          {missing.length > 0 && c.notIncluded(missing.join(', ').toLowerCase())}
        </Callout>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <DeltaTile label={a.landing(impact.account)} before={money(impact.landingBefore)} after={money(impact.landingAfter)} change={-upfront} />
          <DeltaTile label={pay === 'save' ? r.savingTile : i.monthlyTile} before={money(0)} after={money(monthlyPay)} change={-monthlyPay} />
          <DeltaTile
            label={t.planning.deltas.essentialRunway}
            before={formatMonths(impact.runwayBefore)}
            after={formatMonths(impact.runwayAfter)}
            change={impact.runwayAfter - impact.runwayBefore}
          />
        </div>
        {pay !== 'split' && <EarliestLine result={impact} today={today} when={when} onUse={setDate} />}
        {scenario && <ScenarioResults result={scenario} currency={currency} onEditGoal={goalSheet.openEdit} />}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {pay === 'save' && (
            <Button
              size="sm"
              variant="secondary"
              icon={Plus}
              onClick={() =>
                goalSheet.openNew('purchase', { name: label, targetAmount: total, targetDate: isoDay(leave), monthlyContribution: Math.ceil(monthlyPay), icon: 'plane' })
              }
            >
              {a.addGoal}
            </Button>
          )}
          {pay === 'split' ? (
            <Button size="sm" variant="soft" icon={Plus} onClick={() => loans.openNew('personal', { name: label, balance: total, rate, payment: loan.monthly, frequency: 'monthly' })}>
              {a.addLoan}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="soft"
              icon={Plus}
              onClick={() =>
                expenses.openNew({
                  ...fromSuggestion(suggestionBySlug('holidays')!),
                  occurrences: undefined,
                  name: label,
                  amount: total,
                  frequency: 'once',
                  nextDate: isoDay(leave),
                  essential: false,
                  committed: true,
                })
              }
            >
              {a.addOneOff}
            </Button>
          )}
        </div>
      </div>
    ) : (
      <Callout tone="neutral">{r.enterCosts}</Callout>
    );

  return (
    <ToolGrid answer={answer} inputs={inputs} verdict={out}>
      {expenses.sheet}
      {loans.sheet}
      {goalSheet.sheet}
    </ToolGrid>
  );
}
