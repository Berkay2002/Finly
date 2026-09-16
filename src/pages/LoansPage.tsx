import { addMonths } from 'date-fns';
import clsx from 'clsx';
import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  amortizationRequirement,
  debtPayoff,
  debtSchedule,
  isDeductible,
  mortgageRateType,
  repaymentOrder,
} from '@/engine/debts';
import {
  formatCompact,
  formatDate,
  formatDuration,
  formatMoney,
  formatMonths,
  formatMonthYear,
  formatPercent,
  formatShortMonthYear,
} from '@/engine/format';
import type { DebtLine } from '@/engine/metrics';
import { csnRateDecided, csnRateForYear, fixedRateResets, forecastRates, policyRateAt, rateShock, type RateOutlook } from '@/engine/rates';
import { debtKindMeta } from '@/engine/taxonomy';
import type { Debt } from '@/engine/types';
import { useRateOutlook } from '@/lib/rateOutlook';
import { useAutoAdd } from '@/lib/useAutoAdd';
import { useCurrency, useEffectivePlan, useMetrics, usePreviousSnapshot, useViewDate } from '@/store/selectors';
import { DEBT_ACCENT, DEBT_ICON, LoanEditor, useLoanSheet } from '@/components/forms/LoanEditor';
import { PageHeader } from '@/components/layout/PageHeader';
import { Callout } from '@/components/ui/Callout';
import { Card, CardHeader } from '@/components/ui/Card';
import { DeltaOr } from '@/components/ui/Delta';
import { EditableRow, EditableTitle } from '@/components/ui/EditableRow';
import { IconTile } from '@/components/ui/IconTile';
import { SplitBar } from '@/components/ui/ProgressBar';
import { StatCard } from '@/components/ui/StatCard';

const pct = (n: number) => `${n.toLocaleString('sv-SE', { maximumFractionDigits: 2 })} %`;

const rateText = (n: number) => pct(Math.round(n * 100) / 100);

/** Why a loan sits where it does in the payoff order. */
function orderReason(d: Debt, line: DebtLine | undefined, now: Date): string {
  const rate = line?.effectiveRate;
  const cost = rate !== undefined ? `${pct(rate)}${isDeductible(d) ? ' after ränteavdrag' : ''}` : 'rate not entered';
  switch (d.kind) {
    case 'csn':
      return `Last. ${cost}, lowered payments if income drops, written off at death.`;
    case 'credit_card':
      return `${cost}. Card credit is usually the most expensive debt.`;
    case 'personal':
      return `${cost}. Unsecured, so no ränteavdrag.`;
    case 'car':
      return isDeductible(d) ? `${cost}. Secured by the car.` : `${cost}. Unsecured, so no ränteavdrag.`;
    case 'mortgage': {
      if (mortgageRateType(d) === 'variable') return `${cost}. Rörlig, so extra amortering is free any time.`;
      const until = d.rateFixedUntil ? new Date(`${d.rateFixedUntil}T00:00:00`) : null;
      if (until && until > now) {
        return `${cost}. Bunden until ${formatMonthYear(until)}: paying extra before then can cost ränteskillnadsersättning, so do it on the villkorsändringsdag.`;
      }
      return `${cost}. Bunden: extra amortering before the villkorsändringsdag can cost ränteskillnadsersättning.`;
    }
    default:
      return cost;
  }
}

export function LoansPage() {
  const plan = useEffectivePlan();
  const m = useMetrics();
  const currency = useCurrency();
  const prev = usePreviousSnapshot();
  const autoAdd = useAutoAdd();
  const loans = useLoanSheet();
  const now = useViewDate();
  const outlook = useRateOutlook();
  const money = (n: number) => formatMoney(n, currency);

  const debts = plan.debts ?? [];
  const lineById = new Map(m.debt.lines.map((l) => [l.id, l]));
  const order = repaymentOrder(debts);
  const req = amortizationRequirement(debts);
  const csn = debts.filter((d) => d.kind === 'csn');
  const unsecured = debts.filter((d) => d.kind !== 'csn' && !isDeductible(d) && d.balance > 0);
  const interestAfterAvdrag = m.debt.interest - m.debt.taxReduction;
  const interestLeft = m.debt.lines.reduce((a, l) => a + (l.interestLeft ?? 0), 0);
  const resets = fixedRateResets(debts, now, outlook);

  return (
    <div>
      <PageHeader title="Loans" subtitle="What you owe, what it costs, and which loan to pay off first." />

      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          icon="stat-bank"
          accent="red"
          label="Total owed"
          value={money(m.debt.balance)}
          sub={<DeltaOr before={prev?.totalDebt} after={m.debt.balance} invert fallback={`${debts.length} loan${debts.length === 1 ? '' : 's'}`} />}
        />
        <StatCard
          icon="stat-cost"
          accent="orange"
          label="Monthly payments"
          value={money(m.debt.monthly)}
          sub={m.income.total > 0 ? `${formatPercent(m.debt.shareOfIncome)} of your income` : 'Counted as essential costs'}
        />
        <StatCard
          icon="card-expensive-months"
          accent="yellow"
          label="Interest per month"
          value={money(interestAfterAvdrag)}
          sub={
            m.debt.taxReduction > 0
              ? `After ${money(m.debt.taxReduction)} ränteavdrag`
              : m.debt.unsplit > 0
                ? 'Add balance and rate to every loan'
                : 'The real cost of borrowing'
          }
        />
        <StatCard
          icon="card-position"
          accent="blue"
          label="Net worth"
          value={money(m.position.netWorth)}
          sub={<DeltaOr before={prev?.netWorth} after={m.position.netWorth} fallback="Accounts minus loans" />}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Your loans"
              subtitle="Payments count as essential costs every month. Update the balance whenever you get a statement."
            />
            <LoanEditor autoOpenAdd={autoAdd} previous={prev?.byDebt} />
          </Card>

          {m.debt.monthly > 0 && (
            <Card>
              <CardHeader
                icon={<IconTile icon="card-allocation" accent="purple" size="sm" />}
                title="Where each payment goes"
                subtitle="Interest is the cost of borrowing. Repayment lowers the debt, so it builds your net worth."
              />
              <SplitBar a={m.debt.interest} b={m.debt.principal} accentA="orange" accentB="green" />
              <div className="mt-3 grid grid-cols-2 divide-x divide-line">
                <div>
                  <div className="tabular text-[17px] font-semibold text-ink">{money(m.debt.interest)}</div>
                  <div className="text-[12px] text-muted">
                    Interest
                    {m.debt.taxReduction > 0 && ` · ${money(interestAfterAvdrag)} after ränteavdrag`}
                  </div>
                </div>
                <div className="pl-4">
                  <div className="tabular text-[17px] font-semibold text-ink">{money(m.debt.principal)}</div>
                  <div className="text-[12px] text-muted">Repayment</div>
                </div>
              </div>
              <ul className="mt-4 divide-y divide-line text-[13px]">
                {m.debt.lines.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 truncate text-ink-soft">{l.name}</span>
                    <span className="tabular shrink-0 text-right text-muted">
                      {l.interest !== null && l.principal !== null ? (
                        <>
                          {money(l.interest)} interest · {money(l.principal)} repaid
                        </>
                      ) : (
                        'Add balance and rate to split'
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              {interestLeft > 0 && (
                <p className="mt-3 border-t border-line pt-3 text-[12.5px] text-muted">
                  At today's rates you will pay about <span className="tabular font-medium text-ink">{money(interestLeft)}</span> more
                  in interest before these loans are gone, before ränteavdrag.
                </p>
              )}
            </Card>
          )}

          <RatesCard debts={debts} now={now} outlook={outlook} currency={currency} />
        </div>

        <div className="space-y-4 self-start">
          {resets.map((r) => (
            <Callout
              key={r.debt.id}
              tone={r.passed || r.monthlyChange > 0 ? 'warning' : 'info'}
              icon="goal-home"
              title={r.passed ? `Update the rate on ${r.debt.name}` : `${r.debt.name}: new rate ${formatDate(r.date)}`}
            >
              {r.passed ? (
                <>
                  The fixed rate ended {formatDate(r.date)}, so {rateText(r.debt.rate ?? 0)} is probably out of date. Enter the
                  rate from your bank; Finly's estimate is about {rateText(r.newRate)}.
                </>
              ) : (
                <>
                  Bunden at {rateText(r.debt.rate ?? 0)} until then. A rörlig rate would be about {rateText(r.newRate)} by that
                  date: {money(Math.abs(r.monthlyChange))} a month {r.monthlyChange >= 0 ? 'more' : 'less'} (
                  {money(Math.abs(r.monthlyChangeAfterDeduction))} after ränteavdrag). Compare rörlig with a new bindningstid,
                  and pay any extra amortering that day, when it costs no ränteskillnadsersättning.
                </>
              )}
            </Callout>
          ))}

          {order.length > 1 && (
            <Card>
              <CardHeader
                icon={<IconTile icon="card-goals" accent="brand" size="sm" />}
                title="Pay off first"
                subtitle="Where extra money does the most: the highest rate after ränteavdrag first, CSN last."
              />
              <ol className="space-y-1">
                {order.map((d, i) => {
                  const line = lineById.get(d.id);
                  return (
                    <li key={d.id}>
                      <EditableRow onClick={() => loans.openEdit(d.id)} title="Edit loan" className="py-1.5">
                        <span
                          className={clsx(
                            'tabular inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                            i === 0 ? 'bg-brand-600 text-white' : 'bg-page text-muted',
                          )}
                        >
                          {i + 1}
                        </span>
                        <IconTile icon={DEBT_ICON[d.kind]} accent={DEBT_ACCENT[d.kind]} size="sm" />
                        <div className="min-w-0 flex-1">
                          <EditableTitle className="text-[13px] font-medium text-ink">{d.name}</EditableTitle>
                          <div className="text-[11.5px] text-muted">{orderReason(d, line, now)}</div>
                        </div>
                        {line?.payoffMonths !== null && line?.payoffMonths !== undefined && (
                          <span className="hidden shrink-0 text-right text-[11.5px] text-muted sm:block">
                            {formatDuration(line.payoffMonths)}
                          </span>
                        )}
                      </EditableRow>
                    </li>
                  );
                })}
              </ol>
            </Card>
          )}

          {req && req.percent > 0 && (
            <Callout
              tone={req.short ? 'warning' : 'success'}
              icon="goal-home"
              title={req.short ? 'Below the amorteringskrav' : `Amortering meets the ${req.percent} % requirement`}
            >
              Belåningsgrad {Math.round(req.ltv * 100)} % means amortising {req.percent} % a year:{' '}
              {money(req.monthly)} a month. You amortise {money(req.current)}.
              {req.short && ' Loans taken before June 2016 can be exempt; check with your bank.'}
            </Callout>
          )}

          {csn.length > 0 && (
            <Callout tone="info" icon="goal-graduation" title="CSN is in a league of its own">
              {csnRateDecided(now.getFullYear()) ? '' : 'About '}
              {pct(csnRateForYear(outlook, now.getFullYear()))} in {now.getFullYear()} and no ränteavdrag, but payments can be lowered if your income drops (nedsättning)
              and what is left is written off at death, so extra money usually does more elsewhere.
              {m.resilience.availableForRunway > 0 &&
                m.essentialCost > m.debt.csnMonthly &&
                ` If your income stopped, lowered CSN payments would stretch your cash from ${formatMonths(m.resilience.essentialRunwayMonths)} to ${formatMonths(m.resilience.essentialRunwayCsnReducedMonths)} of essentials.`}
            </Callout>
          )}

          {unsecured.length > 0 && (
            <Callout tone="neutral" title="No ränteavdrag on unsecured loans">
              From income year 2026 only loans with security, like a mortgage or a billån secured by the car, give a tax
              reduction on interest. {unsecured.map((d) => d.name).join(', ')} {unsecured.length === 1 ? 'costs' : 'cost'} the
              full rate.
            </Callout>
          )}

          {debts.length === 0 && (
            <Callout tone="tip" title="Only loans go here">
              Rent, bills and subscriptions are spending. Loans are different: part of each payment is interest, part lowers
              what you owe. Add {debtKindMeta('csn').label.toLowerCase()}, a bolån or a billån to see both.
            </Callout>
          )}
        </div>
      </div>
      {loans.sheet}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* If rates change                                                     */
/* ------------------------------------------------------------------ */

const CHART_MONTHS = 36;

function RatesCard({ debts, now, outlook, currency }: { debts: Debt[]; now: Date; outlook: RateOutlook; currency: string }) {
  const money = (n: number) => formatMoney(n, currency);
  const moving = debts.filter((d) => (d.kind === 'mortgage' || d.kind === 'csn') && d.rate !== undefined && d.balance > 0);

  const data = useMemo(() => {
    const rows = Array.from({ length: CHART_MONTHS }, (_, i) => ({ date: addMonths(now, i + 1), today: 0, forecast: 0 }));
    let interestToday = 0;
    let interestAhead = 0;
    for (const d of debts) {
      const rates = forecastRates(d, now, outlook, debts);
      debtSchedule(d, now, CHART_MONTHS).forEach((r, i) => (rows[i].today += r.payment));
      debtSchedule(d, now, CHART_MONTHS, rates).forEach((r, i) => (rows[i].forecast += r.payment));
      const flat = debtPayoff(d, now);
      const ahead = debtPayoff(d, now, rates);
      // Compare like with like: only loans that clear in both cases count towards interest left.
      if (flat && ahead && Number.isFinite(flat.months) && Number.isFinite(ahead.months)) {
        interestToday += flat.totalInterest ?? 0;
        interestAhead += ahead.totalInterest ?? 0;
      }
    }
    return {
      rows: rows.map((r) => ({ name: formatShortMonthYear(r.date), today: Math.round(r.today), forecast: Math.round(r.forecast) })),
      interestToday,
      interestAhead,
    };
  }, [debts, now, outlook]);

  if (moving.length === 0) return null;

  const policyNow = policyRateAt(outlook, now);
  const policyYear = policyRateAt(outlook, addMonths(now, 12));
  const shock = rateShock(debts, now);
  const mortgageBalance = debts.filter((d) => d.kind === 'mortgage').reduce((a, d) => a + d.balance, 0);
  const hasCsn = moving.some((d) => d.kind === 'csn');
  const nextYear = now.getFullYear() + 1;
  const inAYear =
    Math.abs(policyYear - policyNow) < 0.05
      ? 'about the same'
      : `about ${rateText(policyYear)}, ${policyYear > policyNow ? 'up' : 'down'} from today`;

  return (
    <Card>
      <CardHeader
        icon={<IconTile icon="card-expensive-months" accent="orange" size="sm" />}
        title="If rates change"
        subtitle={`Styrräntan is ${rateText(policyNow)}; in a year the Riksbank expects ${inAYear}. Rörliga bolån follow it within weeks, bundna at the villkorsändringsdag, and CSN a year or more later.`}
      />

      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.rows} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#e6eaf0" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6b7a90' }} axisLine={false} tickLine={false} interval={11} />
            <YAxis
              tick={{ fontSize: 11, fill: '#6b7a90' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatCompact}
              width={52}
              domain={['auto', 'auto']}
            />
            <Tooltip
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as { name: string; today: number; forecast: number } | undefined;
                return active && row ? (
                  <div className="rounded-lg border border-line bg-card px-3 py-2 text-[12px] shadow">
                    <div className="text-muted">{row.name}</div>
                    <div className="tabular text-ink">
                      With the forecast <span className="font-semibold">{money(row.forecast)}</span>
                    </div>
                    <div className="tabular text-muted">At today's rates {money(row.today)}</div>
                  </div>
                ) : null;
              }}
            />
            <Line dataKey="today" stroke="#9aa6b8" strokeDasharray="4 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            <Line dataKey="forecast" stroke="#f2994a" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-[11.5px] text-muted">
        Loan payments per month over three years: <span className="font-medium text-orange-800">with the forecast</span>, and at
        today's rates (dashed).
      </p>

      <ul className="mt-3 divide-y divide-line text-[13px]">
        {mortgageBalance > 0 && (
          <li className="flex items-start justify-between gap-3 py-2">
            <span className="text-ink-soft">
              If rates rose 1 percentage point
              <span className="block text-[11.5px] text-muted">
                {shock.exposedBalance >= mortgageBalance
                  ? 'All your bolån can change rate within a year.'
                  : `${money(shock.exposedBalance)} of ${money(mortgageBalance)} in bolån is rörlig or resets within a year.`}
              </span>
            </span>
            <span className="tabular shrink-0 text-right text-ink">
              +{money(shock.monthlyAfterDeduction)}/mo
              <span className="block text-[11.5px] text-muted">after ränteavdrag</span>
            </span>
          </li>
        )}
        {data.interestToday > 0 && (
          <li className="flex items-start justify-between gap-3 py-2">
            <span className="text-ink-soft">
              Interest left to pay
              <span className="block text-[11.5px] text-muted">{money(data.interestToday)} at today's rates</span>
            </span>
            <span className="tabular shrink-0 text-right text-ink">
              {money(data.interestAhead)}
              <span className="block text-[11.5px] text-muted">with the forecast</span>
            </span>
          </li>
        )}
        {hasCsn && (
          <li className="flex items-start justify-between gap-3 py-2">
            <span className="text-ink-soft">
              CSN rate {nextYear}
              <span className="block text-[11.5px] text-muted">Set in December from rates over the last three years</span>
            </span>
            <span className="tabular shrink-0 text-right text-ink">about {rateText(csnRateForYear(outlook, nextYear))}</span>
          </li>
        )}
      </ul>

      <p className="mt-3 border-t border-line pt-3 text-[11.5px] text-muted">
        An estimate: the Riksbank revises its forecast at every policy meeting and is often wrong. Riksbank forecast from policy
        round {outlook.forecast.round}, published {formatDate(outlook.forecast.published)};{' '}
        {outlook.source === 'riksbank'
          ? `updated ${formatDate(new Date(outlook.fetchedAt))}`
          : `the copy shipped with Finly (${formatDate(new Date(outlook.fetchedAt))})`}
        . Other loans are assumed to keep their rate.
      </p>
    </Card>
  );
}
