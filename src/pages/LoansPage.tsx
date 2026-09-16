import clsx from 'clsx';
import { amortizationRequirement, CSN_RATE_2026, isDeductible, repaymentOrder } from '@/engine/debts';
import { formatDuration, formatMoney, formatMonths, formatPercent } from '@/engine/format';
import type { DebtLine } from '@/engine/metrics';
import { debtKindMeta } from '@/engine/taxonomy';
import type { Debt } from '@/engine/types';
import { useAutoAdd } from '@/lib/useAutoAdd';
import { useCurrency, useEffectivePlan, useMetrics, usePreviousSnapshot } from '@/store/selectors';
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

/** Why a loan sits where it does in the payoff order. */
function orderReason(d: Debt, line: DebtLine | undefined): string {
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
    case 'mortgage':
      return `${cost}. Secured by your home, usually the cheapest bank loan.`;
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
  const money = (n: number) => formatMoney(n, currency);

  const debts = plan.debts ?? [];
  const lineById = new Map(m.debt.lines.map((l) => [l.id, l]));
  const order = repaymentOrder(debts);
  const req = amortizationRequirement(debts);
  const csn = debts.filter((d) => d.kind === 'csn');
  const unsecured = debts.filter((d) => d.kind !== 'csn' && !isDeductible(d) && d.balance > 0);
  const interestAfterAvdrag = m.debt.interest - m.debt.taxReduction;
  const interestLeft = m.debt.lines.reduce((a, l) => a + (l.interestLeft ?? 0), 0);

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
        </div>

        <div className="space-y-4 self-start">
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
                          <div className="text-[11.5px] text-muted">{orderReason(d, line)}</div>
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
              {pct(CSN_RATE_2026)} in 2026 and no ränteavdrag, but payments can be lowered if your income drops (nedsättning)
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
