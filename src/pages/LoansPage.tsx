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
  formatNumber,
  formatPercent,
  formatShortMonthYear,
} from '@/engine/format';
import type { DebtLine } from '@/engine/metrics';
import { csnRateDecided, csnRateForYear, fixedRateResets, forecastRates, policyRateAt, rateShock, type RateOutlook } from '@/engine/rates';
import { debtKindMeta, debtName } from '@/engine/taxonomy';
import type { Debt } from '@/engine/types';
import { messages, useT } from '@/i18n';
import { useRateOutlook } from '@/lib/rateOutlook';
import { useAutoAdd } from '@/lib/useAutoAdd';
import { useCurrency, useEffectivePlan, useMetrics, usePreviousMonth, usePreviousSnapshot, useViewDate } from '@/store/selectors';
import { DEBT_ACCENT, DEBT_ICON, LoanEditor, useLoanSheet } from '@/components/forms/LoanEditor';
import { PageHeader } from '@/components/layout/PageHeader';
import { Callout } from '@/components/ui/Callout';
import { Card, CardHeader } from '@/components/ui/Card';
import { EditableRow, EditableTitle } from '@/components/ui/EditableRow';
import { IconTile } from '@/components/ui/IconTile';
import { SplitBar } from '@/components/ui/ProgressBar';
import { StatCard } from '@/components/ui/StatCard';

const pct = (n: number) => `${formatNumber(n, 2)} %`;

const rateText = (n: number) => pct(Math.round(n * 100) / 100);

/** Why a loan sits where it does in the payoff order. */
function orderReason(d: Debt, line: DebtLine | undefined, now: Date): string {
  const t = messages().loans.page;
  const rate = line?.effectiveRate;
  const cost = rate !== undefined ? (isDeductible(d) ? t.rateAfterDeduction(pct(rate)) : pct(rate)) : t.rateNotEntered;
  switch (d.kind) {
    case 'csn':
      return t.reasonCsn(cost);
    case 'credit_card':
      return t.reasonCard(cost);
    case 'personal':
      return t.reasonUnsecured(cost);
    case 'car':
      return isDeductible(d) ? t.reasonCarSecured(cost) : t.reasonUnsecured(cost);
    case 'mortgage': {
      if (mortgageRateType(d) === 'variable') return t.reasonVariable(cost);
      const until = d.rateFixedUntil ? new Date(`${d.rateFixedUntil}T00:00:00`) : null;
      if (until && until > now) {
        return t.reasonFixedUntil(cost, formatMonthYear(until));
      }
      return t.reasonFixed(cost);
    }
    default:
      return cost;
  }
}

export function LoansPage() {
  const plan = useEffectivePlan();
  const m = useMetrics();
  const currency = useCurrency();
  const prev = usePreviousMonth();
  const closed = usePreviousSnapshot();
  const autoAdd = useAutoAdd();
  const loans = useLoanSheet();
  const now = useViewDate();
  const outlook = useRateOutlook();
  const money = (n: number) => formatMoney(n, currency);
  const t = useT().loans;

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
      <PageHeader title={t.page.title} subtitle={t.page.subtitle} />

      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          icon="stat-bank"
          accent="red"
          label={t.page.totalOwed}
          value={money(m.debt.balance)}
          trend={{ before: prev?.totalDebt, after: m.debt.balance, invert: true }}
          sub={t.common.loanCount(debts.length)}
        />
        <StatCard
          icon="stat-cost"
          accent="orange"
          label={t.page.monthlyPayments}
          value={money(m.debt.monthly)}
          sub={m.income.total > 0 ? t.page.shareOfIncome(formatPercent(m.debt.shareOfIncome)) : t.page.countedEssential}
        />
        <StatCard
          icon="card-expensive-months"
          accent="yellow"
          label={t.page.interestPerMonth}
          value={money(interestAfterAvdrag)}
          sub={
            m.debt.taxReduction > 0
              ? t.page.afterDeductionAmount(money(m.debt.taxReduction))
              : m.debt.unsplit > 0
                ? t.page.addBalanceAndRate
                : t.page.realCost
          }
        />
        <StatCard
          icon="card-position"
          accent="green"
          label={t.page.repaidPerMonth}
          value={money(m.debt.principal)}
          sub={
            m.debt.principal > 0
              ? t.page.repaidPerYear(money(m.debt.principal * 12))
              : m.debt.unsplit > 0
                ? t.page.addBalanceAndRate
                : t.page.notRepayingYet
          }
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title={t.page.yourLoans} subtitle={t.page.yourLoansSubtitle} />
            <LoanEditor autoOpenAdd={autoAdd} previous={closed?.byDebt} />
          </Card>

          {m.debt.monthly > 0 && (
            <Card>
              <CardHeader
                icon={<IconTile icon="card-allocation" accent="purple" size="sm" />}
                title={t.page.whereItGoes}
                subtitle={t.page.whereItGoesSubtitle}
              />
              <SplitBar a={m.debt.interest} b={m.debt.principal} accentA="orange" accentB="green" />
              <div className="mt-3 grid grid-cols-2 divide-x divide-line">
                <div>
                  <div className="tabular text-[17px] font-semibold text-ink">{money(m.debt.interest)}</div>
                  <div className="text-[12px] text-muted">
                    {t.page.interest}
                    {m.debt.taxReduction > 0 && t.page.interestAfterDeduction(money(interestAfterAvdrag))}
                  </div>
                </div>
                <div className="pl-4">
                  <div className="tabular text-[17px] font-semibold text-ink">{money(m.debt.principal)}</div>
                  <div className="text-[12px] text-muted">{t.page.repayment}</div>
                </div>
              </div>
              <ul className="mt-4 divide-y divide-line text-[13px]">
                {m.debt.lines.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 truncate text-ink-soft">{debtName(l)}</span>
                    <span className="tabular shrink-0 text-right text-muted">
                      {l.interest !== null && l.principal !== null
                        ? t.page.lineSplit(money(l.interest), money(l.principal))
                        : t.page.addToSplit}
                    </span>
                  </li>
                ))}
              </ul>
              {interestLeft > 0 && (
                <p className="mt-3 border-t border-line pt-3 text-[12.5px] text-muted">
                  {t.page.interestLeftBefore}
                  <span className="tabular font-medium text-ink">{money(interestLeft)}</span>
                  {t.page.interestLeftAfter}
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
              title={r.passed ? t.page.updateRateTitle(debtName(r.debt)) : t.page.newRateTitle(debtName(r.debt), formatDate(r.date))}
            >
              {r.passed
                ? t.page.resetPassed(formatDate(r.date), rateText(r.debt.rate ?? 0), rateText(r.newRate))
                : t.page.resetAhead(
                    rateText(r.debt.rate ?? 0),
                    rateText(r.newRate),
                    money(Math.abs(r.monthlyChange)),
                    r.monthlyChange >= 0,
                    money(Math.abs(r.monthlyChangeAfterDeduction)),
                  )}
            </Callout>
          ))}

          {order.length > 1 && (
            <Card>
              <CardHeader
                icon={<IconTile icon="card-goals" accent="brand" size="sm" />}
                title={t.page.payOffFirst}
                subtitle={t.page.payOffFirstSubtitle}
              />
              <ol className="space-y-1">
                {order.map((d, i) => {
                  const line = lineById.get(d.id);
                  return (
                    <li key={d.id}>
                      <EditableRow onClick={() => loans.openEdit(d.id)} title={t.common.editLoan} className="py-1.5">
                        <span
                          className={clsx(
                            'tabular inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                            i === 0 ? 'bg-brand-solid text-white' : 'bg-page text-muted',
                          )}
                        >
                          {i + 1}
                        </span>
                        <IconTile icon={DEBT_ICON[d.kind]} accent={DEBT_ACCENT[d.kind]} size="sm" />
                        <div className="min-w-0 flex-1">
                          <EditableTitle className="text-[13px] font-medium text-ink">{debtName(d)}</EditableTitle>
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
              title={req.short ? t.page.belowRequirement : t.page.meetsRequirement(req.percent)}
            >
              {t.page.requirement(Math.round(req.ltv * 100), req.percent, money(req.monthly), money(req.current), req.short)}
            </Callout>
          )}

          {csn.length > 0 && (
            <Callout tone="info" icon="goal-graduation" title={t.page.csnTitle}>
              {t.page.csnBody(csnRateDecided(now.getFullYear()), pct(csnRateForYear(outlook, now.getFullYear())), now.getFullYear())}
              {m.resilience.availableForRunway > 0 &&
                m.essentialCost > m.debt.csnMonthly &&
                // Only when lowering CSN changes the rounded figure; "1 month instead of 1 month" says nothing.
                formatMonths(m.resilience.essentialRunwayMonths) !== formatMonths(m.resilience.essentialRunwayCsnReducedMonths) &&
                t.page.csnRunway(
                  formatMonths(m.resilience.essentialRunwayMonths),
                  formatMonths(m.resilience.essentialRunwayCsnReducedMonths),
                )}
            </Callout>
          )}

          {unsecured.length > 0 && (
            <Callout tone="neutral" title={t.page.unsecuredTitle}>
              {t.page.unsecured(unsecured.map((d) => debtName(d)).join(', '), unsecured.length)}
            </Callout>
          )}

          {debts.length === 0 && (
            <Callout tone="tip" title={t.page.onlyLoansTitle}>
              {t.page.onlyLoans(debtKindMeta('csn').label)}
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
  const t = useT().loans;
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
  const sameInAYear = Math.abs(policyYear - policyNow) < 0.05;

  return (
    <Card>
      <CardHeader
        icon={<IconTile icon="card-expensive-months" accent="orange" size="sm" />}
        title={t.rates.title}
        subtitle={t.rates.subtitle(rateText(policyNow), sameInAYear ? null : rateText(policyYear), policyYear > policyNow)}
      />

      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.rows} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--color-line)" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} interval={11} />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--color-muted)' }}
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
                      {t.rates.withForecastTooltip} <span className="font-semibold">{money(row.forecast)}</span>
                    </div>
                    <div className="tabular text-muted">{t.rates.atTodaysRates(money(row.today))}</div>
                  </div>
                ) : null;
              }}
            />
            <Line dataKey="today" stroke="var(--color-faint)" strokeDasharray="4 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            <Line dataKey="forecast" stroke="var(--color-orange-500)" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-[11.5px] text-muted">
        {t.rates.captionBefore}
        <span className="font-medium text-orange-800">{t.rates.captionForecast}</span>
        {t.rates.captionAfter}
      </p>

      <ul className="mt-3 divide-y divide-line text-[13px]">
        {mortgageBalance > 0 && (
          <li className="flex items-start justify-between gap-3 py-2">
            <span className="text-ink-soft">
              {t.rates.shock}
              <span className="block text-[11.5px] text-muted">
                {shock.exposedBalance >= mortgageBalance
                  ? t.rates.shockAll
                  : t.rates.shockPart(money(shock.exposedBalance), money(mortgageBalance))}
              </span>
            </span>
            <span className="tabular shrink-0 text-right text-ink">
              +{t.common.perMonth(money(shock.monthlyAfterDeduction))}
              <span className="block text-[11.5px] text-muted">{t.common.afterDeduction}</span>
            </span>
          </li>
        )}
        {data.interestToday > 0 && (
          <li className="flex items-start justify-between gap-3 py-2">
            <span className="text-ink-soft">
              {t.rates.interestLeft}
              <span className="block text-[11.5px] text-muted">{t.rates.atTodaysRatesAmount(money(data.interestToday))}</span>
            </span>
            <span className="tabular shrink-0 text-right text-ink">
              {money(data.interestAhead)}
              <span className="block text-[11.5px] text-muted">{t.rates.withForecast}</span>
            </span>
          </li>
        )}
        {hasCsn && (
          <li className="flex items-start justify-between gap-3 py-2">
            <span className="text-ink-soft">
              {t.rates.csnRate(nextYear)}
              <span className="block text-[11.5px] text-muted">{t.rates.csnRateSet}</span>
            </span>
            <span className="tabular shrink-0 text-right text-ink">{t.common.about(rateText(csnRateForYear(outlook, nextYear)))}</span>
          </li>
        )}
      </ul>

      <p className="mt-3 border-t border-line pt-3 text-[11.5px] text-muted">
        {t.rates.footnote(
          outlook.forecast.round,
          formatDate(outlook.forecast.published),
          formatDate(new Date(outlook.fetchedAt)),
          outlook.source === 'riksbank',
        )}
      </p>
    </Card>
  );
}
