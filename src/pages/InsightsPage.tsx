import { ChevronRight, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { formatMoney, formatMonths, formatNumber, formatPercent } from '@/engine/format';
import type { CostLine } from '@/engine/metrics';
import { DEPOSIT_GUARANTEE, savingsNudges } from '@/engine/tax/capital';
import { CATEGORY_META } from '@/engine/taxonomy';
import { EXPENSE_CATEGORIES, type ExpenseTag } from '@/engine/types';
import { CATEGORY_ROUTE } from '@/nav';
import { useCurrency, useEffectivePlan, useMetrics } from '@/store/selectors';
import { customDraft, useExpenseSheet } from '@/components/forms/ExpenseEditor';
import { useLoanSheet } from '@/components/forms/LoanEditor';
import { PageHeader } from '@/components/layout/PageHeader';
import { ACCENT } from '@/components/ui/accent';
import { Callout } from '@/components/ui/Callout';
import { Card, CardHeader } from '@/components/ui/Card';
import { EditableRow, EditableTitle } from '@/components/ui/EditableRow';
import { CATEGORY_ICON } from '@/components/ui/icons';
import { IconTile } from '@/components/ui/IconTile';
import { ProgressBar, SplitBar, StackedBar } from '@/components/ui/ProgressBar';
import { useT } from '@/i18n';

export function InsightsPage() {
  const t = useT().insights;
  const m = useMetrics();
  const currency = useCurrency();
  const money = (n: number) => formatMoney(n, currency);
  // Loan payments are committed: they cannot be cut this month.
  const committed = m.expenses.committed + m.debt.monthly;
  const maxCat = Math.max(1, ...EXPENSE_CATEGORIES.map((c) => m.expenses.byCategory[c]));

  // One shared edit dialog so every card can add, edit or remove an expense without leaving the page.
  const expenses = useExpenseSheet();
  const loans = useLoanSheet();
  const openEdit = expenses.openEdit;
  const openNew = (tags: ExpenseTag[]) => expenses.openNew(customDraft('leisure', '', tags));

  return (
    <div>
      <PageHeader title={t.title} subtitle={t.subtitle} />

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Where money goes */}
        <Card>
          <CardHeader
            icon={<IconTile icon="card-where-money-goes" accent="brand" size="sm" />}
            title={t.whereMoneyGoes.title}
            subtitle={t.whereMoneyGoes.subtitle}
          />
          <ul className="space-y-1">
            {EXPENSE_CATEGORIES.map((c) => {
              const v = m.expenses.byCategory[c];
              const Icon = CATEGORY_ICON[c];
              return (
                <li key={c}>
                  <Link
                    to={CATEGORY_ROUTE[c]}
                    className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-page"
                  >
                    <IconTile icon={Icon} accent={CATEGORY_META[c].accent} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between text-[13px]">
                        <span className="font-medium text-ink transition-colors group-hover:text-brand-700">{CATEGORY_META[c].label}</span>
                        <span className="tabular text-ink">
                          {money(v)}
                          <span className="ml-2 text-muted">{m.income.total > 0 ? formatPercent(v / m.income.total) : ''}</span>
                        </span>
                      </div>
                      <ProgressBar value={v / maxCat} accent={CATEGORY_META[c].accent} height="sm" className="mt-1" />
                    </div>
                    <ChevronRight size={14} className="shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>

        {/* Top costs */}
        <Card>
          <CardHeader
            icon={<IconTile icon="card-largest" accent="indigo" size="sm" />}
            title={t.topCosts.title}
            subtitle={t.topCosts.subtitle}
          />
          {m.topCosts.length === 0 ? (
            <p className="text-[13px] text-muted">{t.topCosts.empty}</p>
          ) : (
            <ol className="divide-y divide-line">
              {m.topCosts.map((l, i) => (
                <li key={l.id}>
                  <EditableLine onClick={() => openEdit(l.id)} name={l.name} lead={<span className="w-5 text-right font-medium text-muted">{i + 1}.</span>}>
                    <span className="tabular font-medium text-ink">{money(l.monthly)}</span>
                    <span className="tabular w-24 text-right text-[12px] text-muted">{t.topCosts.perYear(money(l.annual))}</span>
                  </EditableLine>
                </li>
              ))}
            </ol>
          )}
        </Card>

        {/* Committed vs flexible + essential/lifestyle */}
        <Card>
          <CardHeader
            icon={<IconTile icon="nav-home-bills" accent="orange" size="sm" />}
            title={t.committed.title}
            subtitle={t.committed.subtitle}
            action={t.committed.action}
            actionTo={CATEGORY_ROUTE.home}
          />
          <SplitBar a={committed} b={m.expenses.flexible} accentA="orange" accentB="green" />
          <div className="mt-3 grid grid-cols-2 divide-x divide-line">
            <div>
              <div className="tabular text-[17px] font-semibold text-ink">{money(committed)}</div>
              <div className="text-[12px] text-muted">
                {t.committed.committed(m.lifestyleCost > 0 ? formatPercent(committed / m.lifestyleCost) : '–')}
                {m.debt.monthly > 0 && <span className="block text-faint">{t.committed.inclLoans(money(m.debt.monthly))}</span>}
              </div>
            </div>
            <div className="pl-4">
              <div className="tabular text-[17px] font-semibold text-ink">{money(m.expenses.flexible)}</div>
              <div className="text-[12px] text-muted">{t.committed.flexible(m.lifestyleCost > 0 ? formatPercent(m.expenses.flexible / m.lifestyleCost) : '–')}</div>
            </div>
          </div>
          <dl className="mt-4 divide-y divide-line text-[13px]">
            <Row label={t.committed.essential} hint={t.committed.essentialHint} value={money(m.essentialCost)} />
            <Row label={t.committed.lifestyle} hint={t.committed.lifestyleHint} value={money(m.lifestyleCost)} />
            <Row label={t.committed.planned} hint={t.committed.plannedHint} value={money(m.plannedCost)} strong />
          </dl>
        </Card>

        {/* Allocation today vs future */}
        <Card>
          <CardHeader
            icon={<IconTile icon="stat-safe-to-spend" accent="brand" size="sm" />}
            title={t.allocation.title}
            subtitle={t.allocation.subtitle}
            action={t.allocation.action}
            actionTo="/savings"
          />
          {m.income.total === 0 ? (
            <p className="text-[13px] text-muted">
              {t.allocation.empty}{' '}
              <Link to="/income" className="font-medium text-brand-700">
                {t.allocation.addIncome}
              </Link>
            </p>
          ) : (
            <>
              <StackedBar
                segments={[
                  { value: m.allocation.lifestyle, accent: 'blue' },
                  { value: m.allocation.debtPaydown, accent: 'red' },
                  { value: m.allocation.futureSpending, accent: 'green' },
                  { value: m.allocation.longTerm, accent: 'purple' },
                  { value: m.allocation.unallocated, accent: 'neutral' },
                ]}
              />
              <ul className="mt-3 space-y-1.5 text-[13px]">
                {[
                  [t.allocation.lifestyle, m.allocation.lifestyle, 'blue'],
                  ...(m.allocation.debtPaydown > 0 ? [[t.allocation.debtPaydown, m.allocation.debtPaydown, 'red']] : []),
                  [t.allocation.futureSpending, m.allocation.futureSpending, 'green'],
                  [t.allocation.longTerm, m.allocation.longTerm, 'purple'],
                  [t.allocation.unallocated, m.allocation.unallocated, 'neutral'],
                ].map(([label, v, accent]) => (
                  <li key={String(label)} className="flex items-center gap-2">
                    <span className={clsx('h-2.5 w-2.5 rounded-full', ACCENT[accent as keyof typeof ACCENT].dot)} />
                    <span className="flex-1 text-ink-soft">{label}</span>
                    <span className="tabular font-medium text-ink">{formatPercent(Number(v))}</span>
                  </li>
                ))}
              </ul>
              {m.breathingRoom < 0 && (
                <Callout tone="warning" className="mt-3">
                  {t.allocation.overspent(money(-m.breathingRoom))}
                </Callout>
              )}
            </>
          )}
        </Card>

        {/* Reducible */}
        <Card>
          <CardHeader
            icon={<IconTile icon="nav-leisure" accent="green" size="sm" />}
            title={t.reducible.title}
            subtitle={t.reducible.subtitle}
            action={t.reducible.action}
            actionTo={CATEGORY_ROUTE.leisure}
          />
          {m.reducible.length === 0 ? (
            <p className="text-[13px] text-muted">{t.reducible.empty}</p>
          ) : (
            <ul className="divide-y divide-line">
              {m.reducible.slice(0, 8).map((l) => (
                <li key={l.id}>
                  <EditableLine onClick={() => openEdit(l.id)} name={l.name}>
                    <span className="text-[12px] text-muted">{CATEGORY_META[l.category].shortLabel}</span>
                    <span className="tabular w-24 text-right font-medium text-ink">{money(l.monthly)}</span>
                  </EditableLine>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex justify-between border-t border-line pt-3 text-[13px]">
            <span className="text-ink-soft">{t.reducible.total}</span>
            <span className="tabular font-semibold text-ink">{money(m.reducible.reduce((a, l) => a + l.monthly, 0))}</span>
          </div>
        </Card>

        {/* Subscriptions & car */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
          <Card>
            <CardHeader
              icon={<IconTile icon="card-subscriptions" accent="purple" size="sm" />}
              title={t.subscriptions.title}
              action={t.subscriptions.add}
              actionIcon={Plus}
              onAction={() => openNew(['subscription'])}
            />
            <Total monthly={money(m.subscriptions.monthly)} annual={money(m.subscriptions.annual)} />
            <TaggedLines lines={m.subscriptions.lines} money={money} onEdit={openEdit} empty={t.subscriptions.empty} />
          </Card>
          <Card>
            <CardHeader
              icon={<IconTile icon="card-car-cost" accent="orange" size="sm" />}
              title={t.car.title}
              action={t.car.add}
              actionIcon={Plus}
              onAction={() => expenses.openNew(customDraft('transport', '', ['car']))}
            />
            <Total monthly={money(m.car.monthly)} annual={money(m.car.annual)} />
            <TaggedLines
              lines={m.car.lines}
              money={money}
              onEdit={openEdit}
              empty={m.car.loans.length > 0 ? '' : t.car.empty}
            />
            {m.car.loans.length > 0 && (
              <ul className={clsx('divide-y divide-line', m.car.lines.length > 0 ? 'border-t border-line' : 'mt-3')}>
                {m.car.loans.map((l) => (
                  <li key={l.id}>
                    <EditableLine onClick={() => loans.openEdit(l.id)} name={l.name}>
                      <span className="text-[12px] text-muted">{t.car.loan}</span>
                      <span className="tabular text-ink">{money(l.monthly)}</span>
                    </EditableLine>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 border-t border-line pt-3 text-[12.5px] text-muted">
              {t.car.hintBefore}{' '}
              <Link to={CATEGORY_ROUTE.transport} className="font-medium text-brand-700">
                {t.car.hintLink}
              </Link>
              {t.car.hintAfter}
            </p>
          </Card>
        </div>

        <SavingsNudgesCard />

        {/* Resilience */}
        <Card className="lg:col-span-2">
          <CardHeader
            icon={<IconTile icon="card-resilience" accent="green" size="sm" />}
            title={t.resilience.title}
            subtitle={t.resilience.subtitle}
            action={t.resilience.action}
            actionTo="/accounts"
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label={t.resilience.emergency} value={money(m.position.emergency)} sub={m.essentialCost > 0 ? t.resilience.emergencySub(formatMonths(m.resilience.emergencyMonths)) : undefined} />
            <Stat label={t.resilience.essentialRunway} value={formatMonths(m.resilience.essentialRunwayMonths)} sub={t.resilience.essentialRunwaySub(money(m.resilience.availableForRunway))} />
            <Stat label={t.resilience.lifestyleRunway} value={formatMonths(m.resilience.lifestyleRunwayMonths)} sub={t.resilience.lifestyleRunwaySub} />
            <Stat
              label={t.resilience.coverage}
              value={m.resilience.reliableCoversEssentials ? t.resilience.covered : t.resilience.notCovered}
              sub={
                m.resilience.reliableCoversEssentials
                  ? t.resilience.toSpare(money(m.resilience.essentialMargin))
                  : t.resilience.reliesOnVariable(money(-m.resilience.essentialMargin))
              }
              tone={m.resilience.reliableCoversEssentials ? 'good' : 'warn'}
            />
          </div>
        </Card>
      </div>

      {expenses.sheet}
      {loans.sheet}
    </div>
  );
}

/** Rule-based tips on which account type suits the money, from the savings tax. Hidden when there is nothing to say. */
function SavingsNudgesCard() {
  const t = useT().insights.nudges;
  const m = useMetrics();
  const plan = useEffectivePlan();
  const currency = useCurrency();
  const money = (n: number) => formatMoney(n, currency);
  const nudges = savingsNudges(plan, m.capitalTax);
  if (nudges.length === 0) return null;
  const rate = (n: number) => t.rate(formatNumber(n, 2));

  return (
    <Card className="lg:col-span-2">
      <CardHeader
        icon={<IconTile icon="account-investment" accent="purple" size="sm" />}
        title={t.title}
        subtitle={t.subtitle}
        action={t.action}
        actionTo="/accounts"
      />
      <div className="grid gap-3 lg:grid-cols-2">
        {nudges.map((n) => {
          switch (n.kind) {
            case 'pick_wrapper':
              return (
                <Callout key={n.kind} tone="tip" title={t.pickWrapperTitle(n.accountIds.length)}>
                  {t.pickWrapperBody(money(n.balance))}
                </Callout>
              );
            case 'cash_to_isk':
              return (
                <Callout key={n.kind} tone="tip" title={t.cashToIskTitle}>
                  {t.cashToIskBody(money(n.cash), n.interestTax >= 1 ? money(n.interestTax) : null, money(n.room))}
                </Callout>
              );
            case 'af_to_isk':
              return (
                <Callout key={n.accountId} tone="tip" title={t.afToIskTitle(n.name)}>
                  {t.afToIskBody(rate(n.expectedReturn), rate(n.breakEven), n.room >= 1 ? money(n.room) : null)}{' '}
                  {n.gain === undefined
                    ? t.moveUnknown
                    : n.gain >= 0
                      ? t.moveTax(money(n.taxIfSold))
                      : t.moveLoss(money(-n.gain))}
                </Callout>
              );
            case 'deposit_guarantee':
              return (
                <Callout key={n.institution} tone="warning" title={t.depositTitle(money(n.amount), n.institution)}>
                  {t.depositBody(money(DEPOSIT_GUARANTEE))}
                </Callout>
              );
          }
        })}
      </div>
    </Card>
  );
}

/** A cost line that opens the expense editor in place. */
function EditableLine({ name, lead, children, onClick }: { name: string; lead?: ReactNode; children: ReactNode; onClick: () => void }) {
  const t = useT().insights;
  return (
    <EditableRow onClick={onClick} title={t.editExpense} className="py-2 text-[13px]">
      {lead}
      <EditableTitle className="flex-1 text-ink">{name}</EditableTitle>
      {children}
    </EditableRow>
  );
}

function Total({ monthly, annual }: { monthly: string; annual: string }) {
  const t = useT().insights;
  return (
    <div className="flex items-baseline gap-3">
      <span className="tabular text-[22px] font-bold text-ink">{monthly}</span>
      <span className="text-[12.5px] text-muted">{t.perMonth}</span>
      <span className="tabular ml-auto text-[13px] text-muted">{t.perYear(annual)}</span>
    </div>
  );
}

function TaggedLines({
  lines,
  money,
  onEdit,
  empty,
}: {
  lines: CostLine[];
  money: (n: number) => string;
  onEdit: (id: string) => void;
  empty: string;
}) {
  if (lines.length === 0) return empty ? <p className="mt-2 text-[12.5px] text-muted">{empty}</p> : null;
  return (
    <ul className="mt-3 divide-y divide-line">
      {lines.map((l) => (
        <li key={l.id}>
          <EditableLine onClick={() => onEdit(l.id)} name={l.name}>
            <span className="text-[12px] text-muted">{CATEGORY_META[l.category].shortLabel}</span>
            <span className="tabular text-ink">{money(l.monthly)}</span>
          </EditableLine>
        </li>
      ))}
    </ul>
  );
}

function Row({ label, hint, value, strong }: { label: string; hint?: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className={clsx(strong ? 'font-semibold text-ink' : 'text-ink-soft')}>
        {label}
        {hint && <span className="ml-1.5 text-[11.5px] text-faint">{hint}</span>}
      </dt>
      <dd className={clsx('tabular', strong ? 'font-semibold text-ink' : 'font-medium text-ink')}>{value}</dd>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'warn' }) {
  return (
    <div className="rounded-xl bg-page p-3">
      <div className="text-[11.5px] text-muted">{label}</div>
      <div className={clsx('tabular text-[18px] font-semibold', tone === 'warn' ? 'text-warning' : tone === 'good' ? 'text-positive' : 'text-ink')}>
        {value}
      </div>
      {sub && <div className="text-[11.5px] text-muted">{sub}</div>}
    </div>
  );
}
