import { Check, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { addMonths } from 'date-fns';
import { typicalRate } from '@/engine/debts';
import { formatMoney, formatPercent, formatShortMonthYear } from '@/engine/format';
import { computeMetrics } from '@/engine/metrics';
import { monthsAhead } from '@/engine/projections';
import { ownershipMonthly, phonePlanComparison } from '@/engine/purchases';
import { installment, maxAffordablePrice, purchaseImpact, runScenario } from '@/engine/scenarios';
import { suggestionBySlug } from '@/engine/taxonomy';
import { useT } from '@/i18n';
import { useDraft } from '@/store/draftStore';
import { usePlanStore } from '@/store/planStore';
import { useCurrency, useGovBondRate, usePlan } from '@/store/selectors';
import { customDraft, fromSuggestion, useExpenseSheet } from '@/components/forms/ExpenseEditor';
import { useGoalSheet } from '@/components/forms/GoalEditor';
import { useLoanSheet } from '@/components/forms/LoanEditor';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { DateField, MoneyField, TextField } from '@/components/ui/fields';
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

export type ItemKind = 'computer' | 'phone' | 'other';

/** How each kind is filed, kept and usually paid. */
const PRESETS: Record<ItemKind, { slug: string; years: number; months: number; goalIcon: string; runningSlug?: string }> = {
  computer: { slug: 'electronics', years: 4, months: 24, goalIcon: 'laptop', runningSlug: 'software' },
  phone: { slug: 'electronics', years: 3, months: 24, goalIcon: 'laptop', runningSlug: 'software' },
  other: { slug: 'large_one_off', years: 5, months: 12, goalIcon: 'gift' },
};
const PRICE_COMPARISON = 'https://www.prisjakt.nu/';
const PLAN_COMPARISON = 'https://www.mobilabonnemang.se/';

/**
 * Can I afford this computer, phone or other thing? The most the plan pays in full and in instalments first; then
 * a price judged by how it is paid, what the old one sells for, and what it costs a month to own over the years
 * it is kept. A phone is also weighed against getting it through an operator plan.
 */
export function ItemTool({ kind }: { kind: ItemKind }) {
  const plan = usePlan();
  const gov = useGovBondRate();
  const currency = useCurrency();
  const addExpense = usePlanStore((s) => s.addExpense);
  const expenses = useExpenseSheet();
  const loans = useLoanSheet();
  const goalSheet = useGoalSheet();
  const t = useT();
  const a = t.planning.afford;
  const c = t.planning.car;
  const i = t.planning.item;
  const money = (n: number) => formatMoney(n, currency);
  const preset = PRESETS[kind];
  const field = useDraft(kind);
  const { today, date, setDate, when } = usePurchaseDate(field);

  const [name, setName] = field('name', '');
  const [priceFrom, setPriceFrom] = field('priceFrom', 0);
  const [priceTo, setPriceTo] = field('priceTo', 0);
  const [tradeIn, setTradeIn] = field<number | null>('tradeIn', null);
  const [extras, setExtras] = field<number | null>('extras', null);
  const [years, setYears] = field<number | null>('years', preset.years);
  const [resale, setResale] = field<number | null>('resale', null);
  const [insurance, setInsurance] = field<number | null>('insurance', null);
  const [subscriptions, setSubscriptions] = field<number | null>('subscriptions', null);
  const [pay, setPay] = field<PayMode>('pay', 'now');
  const [months, setMonths] = field('months', preset.months);
  const [apr, setApr] = field<number | null>('apr', null);
  const [setupFee, setSetupFee] = field('setupFee', 0);
  const [monthlyFee, setMonthlyFee] = field('monthlyFee', 0);
  const [bundled, setBundled] = field<number | null>('bundled', null);
  const [bundledUpfront, setBundledUpfront] = field('bundledUpfront', 0);
  const [planMonths, setPlanMonths] = field('planMonths', 24);
  const [simOnly, setSimOnly] = field<number | null>('simOnly', null);
  const [added, setAdded] = useState(false);

  const label = name || (kind === 'other' ? t.planning.newExpense : a.kinds[kind]);
  const rate = apr ?? typicalRate('personal', false);
  const old = tradeIn ?? 0;
  const extra = extras ?? 0;
  const running = (insurance ?? 0) + (subscriptions ?? 0);
  const kept = Math.max(0, years ?? 0);

  const base = useMemo(() => purchaseImpact(plan, { amount: 0, date: when }, today, gov), [plan, when, today, gov]);
  const breathingRoom = useMemo(() => computeMetrics(plan, when, gov).breathingRoom, [plan, when, gov]);
  const annuity = (loan: number) => (loan > 0 ? installment(loan, months, rate, setupFee, monthlyFee).monthly : 0);
  const payUpTo = roundDown(base.room + old - extra, 100);
  const splitUpTo = roundDown(maxAffordablePrice({ cash: 0, budget: breathingRoom / 2 - running, minShare: 0, loanMonthly: annuity }) + old, 100);

  const price = Math.max(priceFrom, priceTo);
  const isRange = priceTo > priceFrom && priceFrom > 0;
  const outright = Math.max(0, price + extra - old);
  const loan = installment(Math.max(0, price - old), months, rate, setupFee, monthlyFee);
  // Saving up needs at least a month; a purchase this month saves over a year instead.
  const ahead = monthsAhead(today, when);
  const saveMonths = ahead >= 1 ? ahead : 12;
  const buyDate = pay === 'save' && ahead < 1 ? addMonths(today, saveMonths) : when;
  const upfront = pay === 'split' ? extra : outright;
  const monthlyPay = pay === 'split' ? loan.monthly : pay === 'save' ? outright / saveMonths : 0;

  const impact = useMemo(() => (price > 0 ? purchaseImpact(plan, { amount: upfront, date: buyDate }, today, gov) : null), [plan, price, upfront, buyDate, today, gov]);
  const scenario = useMemo(
    () =>
      price > 0 && monthlyPay + running > 0
        ? runScenario(plan, { type: 'add_expense', name: label, amount: monthlyPay + running, frequency: 'monthly', category: 'planned', essential: false, committed: true }, today)
        : null,
    [plan, price, monthlyPay, running, label, today],
  );

  const ownership = ownershipMonthly({ price, extras: extra, tradeIn: old, loanExtra: pay === 'split' ? loan.extra : 0, resale: resale ?? 0, years: kept || 1, running });
  const verdict: Verdict | null = impact
    ? worstVerdict(judgeAgainst(upfront, impact.room), judgeAgainst(monthlyPay + running, breathingRoom))
    : null;
  const missing = [insurance === null && c.costs.insurance, resale === null && i.costs.resale].filter((x): x is string => !!x);
  const phone =
    kind === 'phone' && price > 0 && bundled !== null && simOnly !== null
      ? phonePlanComparison({ price, tradeIn: old, simOnlyMonthly: simOnly, bundledMonthly: bundled, bundledUpfront, months: planMonths })
      : null;

  const addRunning = () => {
    const s = preset.runningSlug ? suggestionBySlug(preset.runningSlug) : undefined;
    if (subscriptions) addExpense({ ...(s ? fromSuggestion(s) : customDraft('living', label)), occurrences: undefined, amount: Math.round(subscriptions), frequency: 'monthly' });
    if (insurance) addExpense({ ...customDraft('finance', i.insuranceFor(label), ['insurance']), amount: Math.round(insurance), frequency: 'monthly' });
    setAdded(true);
  };

  const answer = (
    <AnswerPanel
      figures={
        payUpTo > 0 || splitUpTo > 0
          ? [
              { label: i.payUpTo, value: payUpTo > 0 ? money(payUpTo) : '–' },
              { label: i.splitUpTo(months), value: splitUpTo > 0 ? money(splitUpTo) : '–', positive: true },
            ]
          : []
      }
      note={i.basis(formatPercent(rate / 100, 1))}
      empty={i.none}
    />
  );

  const inputs = (
    <>
      <FieldGrid>
        <Field wide>
          <TextField label={a.whatIsIt} placeholder={a.kindPlaceholders[kind]} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </FieldGrid>
      <FieldGrid cols={3}>
        <Field help={<SourceLinks links={[{ name: i.comparePrices, url: PRICE_COMPARISON }]} />}>
          <MoneyField label={c.price} currency={currency} value={priceFrom} onValueChange={setPriceFrom} />
        </Field>
        <Field>
          <MoneyField label={c.priceTo} hint={t.planning.allowance.optional} currency={currency} value={priceTo} onValueChange={setPriceTo} />
        </Field>
        <Field>
          <DateField label={a.when} value={date} min={isoDay(today)} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </FieldGrid>

      <ToolSection title={i.aboutTitle[kind]}>
        <FieldGrid className="mt-2">
          <Field help={i.tradeInHint}>
            <MoneyField label={i.tradeIn} currency={currency} value={old} onValueChange={(v) => setTradeIn(Math.max(0, v))} />
          </Field>
          <Field help={i.extrasHint[kind]}>
            <MoneyField label={i.extras} currency={currency} value={extra} onValueChange={(v) => setExtras(Math.max(0, v))} />
          </Field>
          <Field>
            <NumberField label={i.years} value={years} onChange={setYears} step="0.5" />
          </Field>
          <Field help={i.resaleHint}>
            <MoneyField label={i.resale} currency={currency} value={resale ?? 0} onValueChange={(v) => setResale(Math.max(0, v))} />
          </Field>
          <Field help={i.insuranceHint}>
            <MoneyField label={i.insurance} currency={currency} value={insurance ?? 0} onValueChange={(v) => setInsurance(Math.max(0, v))} />
          </Field>
          <Field>
            <MoneyField label={i.subscriptions[kind]} currency={currency} value={subscriptions ?? 0} onValueChange={(v) => setSubscriptions(Math.max(0, v))} />
          </Field>
        </FieldGrid>
      </ToolSection>

      {kind === 'phone' && (
        <details className="rounded-xl border border-line p-3">
          <summary className="cursor-pointer text-[13px] font-medium text-ink">{i.phonePlan.title}</summary>
          <FieldGrid className="mt-3">
            <Field>
              <MoneyField label={i.phonePlan.bundled} currency={currency} value={bundled ?? 0} onValueChange={(v) => setBundled(Math.max(0, v))} />
            </Field>
            <Field>
              <MoneyField label={i.phonePlan.bundledUpfront} currency={currency} value={bundledUpfront} onValueChange={(v) => setBundledUpfront(Math.max(0, v))} />
            </Field>
            <Field>
              <NumberField label={i.phonePlan.months} value={planMonths} onChange={(v) => setPlanMonths(Math.max(1, Math.round(v ?? 1)))} />
            </Field>
            <Field help={<SourceLinks label={`${i.phonePlan.simOnlyHint} ·`} links={[{ name: i.phonePlan.compare, url: PLAN_COMPARISON }]} />}>
              <MoneyField label={i.phonePlan.simOnly} currency={currency} value={simOnly ?? 0} onValueChange={(v) => setSimOnly(Math.max(0, v))} />
            </Field>
          </FieldGrid>
        </details>
      )}

      <PayOptions
        value={pay}
        onChange={setPay}
        options={[
          { id: 'now', label: a.payNow, detail: money(outright) },
          {
            id: 'split',
            label: a.instalments,
            detail: `${a.perMonth(money(loan.monthly))} · ${a.total(money(loan.total + extra))}`,
            extra: loan.extra > 0.5 ? a.extraCost(money(loan.extra)) : undefined,
          },
          { id: 'save', label: a.saveUp, detail: `${a.perMonth(money(outright / saveMonths))} ${a.saveBy(formatShortMonthYear(addMonths(today, saveMonths)))}` },
        ]}
      >
        {pay === 'split' && (
          <>
            <FieldGrid className="mt-3">
              <Field>
                <NumberField label={a.months} value={months} onChange={(v) => setMonths(Math.max(1, Math.round(v ?? 1)))} />
              </Field>
              <Field help={apr === null ? a.rateHint(formatPercent(rate / 100, 1)) : undefined}>
                <NumberField label={a.interest} value={apr} onChange={setApr} placeholder={String(rate)} step="0.01" />
              </Field>
              <Field>
                <MoneyField label={a.setupFee} currency={currency} value={setupFee} onValueChange={setSetupFee} />
              </Field>
              <Field>
                <MoneyField label={a.monthlyFee} currency={currency} value={monthlyFee} onValueChange={setMonthlyFee} />
              </Field>
            </FieldGrid>
            <p className="mt-2 text-[12px] text-muted">{i.instalmentTerms}</p>
          </>
        )}
      </PayOptions>
    </>
  );

  const out =
    price > 0 && impact && verdict ? (
      <div className="space-y-3">
        <Callout tone={verdictTone(verdict)}>
          <strong>{i.verdict[verdict](i.subject[kind](money(price)))}</strong>{' '}
          {pay === 'now'
            ? i.nowSentence(impact.account, money(impact.landingBefore), money(impact.landingAfter))
            : pay === 'split'
              ? i.splitSentence(money(loan.monthly), months, money(loan.total + extra))
              : i.saveSentence(money(monthlyPay), formatShortMonthYear(buyDate))}
          {old > 0 && i.tradeInNote(money(old))}
          {impact.shortBy > 0 && i.fromSavings(money(impact.shortBy))}
          {monthlyPay + running > breathingRoom && c.overBy(money(monthlyPay + running - breathingRoom))}
          {kept > 0 && i.ownership(kept, money(ownership))}
          {isRange && a.rangeNote(money(price))}
          {missing.length > 0 && c.notIncluded(missing.join(', ').toLowerCase())}
        </Callout>
        {phone && (
          <Callout tone="tip">
            {i.phonePlan.buy(phone.months, money(phone.buy))}
            {i.phonePlan.bundle(money(phone.bundle))}
            {i.phonePlan.cheaper[phone.cheaper](money(phone.difference))}
          </Callout>
        )}

        <CostList
          currency={currency}
          rows={[
            { label: i.costs.price, value: price },
            ...(extra > 0 ? [{ label: i.costs.extras, value: extra }] : []),
            ...(old > 0 ? [{ label: i.costs.tradeIn, value: -old }] : []),
            ...(pay === 'split' ? [{ label: i.costs.interest, value: loan.extra }] : []),
            { label: i.costs.running, value: insurance === null && subscriptions === null ? null : running * 12 * (kept || 1), note: `${a.perMonth(money(running))} · ${kept || 1} ${c.years.toLowerCase()}` },
            { label: i.costs.resale, value: resale === null ? null : -resale },
          ]}
          total={{
            label: i.costs.total,
            value: ownership * 12 * (kept || 1),
            note: a.perMonth(money(ownership)),
          }}
        />

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <DeltaTile label={a.landing(impact.account)} before={money(impact.landingBefore)} after={money(impact.landingAfter)} change={-upfront} />
          <DeltaTile label={i.monthlyTile} before={money(0)} after={money(monthlyPay + running)} change={-(monthlyPay + running)} />
          <DeltaTile label={i.ownershipTile} before={money(0)} after={money(ownership)} change={-ownership} />
        </div>
        {pay !== 'split' && <EarliestLine result={impact} today={today} when={when} onUse={setDate} />}
        {scenario && <ScenarioResults result={scenario} currency={currency} onEditGoal={goalSheet.openEdit} />}

        <div className="flex flex-wrap items-center justify-end gap-2">
          {running > 0 && (
            <Button size="sm" variant="secondary" icon={added ? Check : Plus} disabled={added} onClick={addRunning}>
              {added ? a.addedRunning : a.addRunning}
            </Button>
          )}
          {pay === 'save' && (
            <Button
              size="sm"
              variant="secondary"
              icon={Plus}
              onClick={() =>
                goalSheet.openNew('purchase', { name: label, targetAmount: Math.round(outright), targetDate: isoDay(buyDate), monthlyContribution: Math.ceil(monthlyPay), icon: preset.goalIcon })
              }
            >
              {a.addGoal}
            </Button>
          )}
          {pay === 'split' ? (
            <Button
              size="sm"
              variant="soft"
              icon={Plus}
              onClick={() => loans.openNew('personal', { name: label, balance: Math.max(0, price - old), rate, payment: loan.monthly, frequency: 'monthly' })}
            >
              {a.addLoan}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="soft"
              icon={Plus}
              onClick={() =>
                expenses.openNew({
                  ...fromSuggestion(suggestionBySlug(preset.slug)!),
                  occurrences: undefined,
                  name: label,
                  amount: Math.round(outright),
                  frequency: 'once',
                  nextDate: isoDay(buyDate),
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
      <Callout tone="neutral">{i.enterPrice}</Callout>
    );

  return (
    <ToolGrid answer={answer} inputs={inputs} verdict={out}>
      {expenses.sheet}
      {loans.sheet}
      {goalSheet.sheet}
    </ToolGrid>
  );
}
