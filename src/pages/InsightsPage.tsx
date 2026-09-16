import { ChevronRight, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { formatMoney, formatMonths, formatPercent } from '@/engine/format';
import type { CostLine } from '@/engine/metrics';
import { CATEGORY_META } from '@/engine/taxonomy';
import { EXPENSE_CATEGORIES, type ExpenseTag } from '@/engine/types';
import { CATEGORY_ROUTE } from '@/nav';
import { useCurrency, useMetrics } from '@/store/selectors';
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

export function InsightsPage() {
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
      <PageHeader title="Insights" subtitle="The deeper questions: what costs the most, what is committed, and what could change." />

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Where money goes */}
        <Card>
          <CardHeader
            icon={<IconTile icon="card-where-money-goes" accent="brand" size="sm" />}
            title="Where is my money going?"
            subtitle="Monthly amount and share of income by area. Open an area to change what is in it."
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
            title="What costs me the most?"
            subtitle="Largest individual items, with their annual equivalent. Tap one to edit it."
          />
          {m.topCosts.length === 0 ? (
            <p className="text-[13px] text-muted">Add expenses to see your biggest cost drivers.</p>
          ) : (
            <ol className="divide-y divide-line">
              {m.topCosts.map((l, i) => (
                <li key={l.id}>
                  <EditableLine onClick={() => openEdit(l.id)} name={l.name} lead={<span className="w-5 text-right font-medium text-muted">{i + 1}.</span>}>
                    <span className="tabular font-medium text-ink">{money(l.monthly)}</span>
                    <span className="tabular w-24 text-right text-[12px] text-muted">{money(l.annual)}/yr</span>
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
            title="How much of my lifestyle is already committed?"
            subtitle="Committed costs are hard to change soon. Flexible ones you could realistically adjust."
            action="Home & bills"
            actionTo={CATEGORY_ROUTE.home}
          />
          <SplitBar a={committed} b={m.expenses.flexible} accentA="orange" accentB="green" />
          <div className="mt-3 grid grid-cols-2 divide-x divide-line">
            <div>
              <div className="tabular text-[17px] font-semibold text-ink">{money(committed)}</div>
              <div className="text-[12px] text-muted">
                Committed · {m.lifestyleCost > 0 ? formatPercent(committed / m.lifestyleCost) : '–'}
                {m.debt.monthly > 0 && <span className="block text-faint">incl. {money(m.debt.monthly)} of loans</span>}
              </div>
            </div>
            <div className="pl-4">
              <div className="tabular text-[17px] font-semibold text-ink">{money(m.expenses.flexible)}</div>
              <div className="text-[12px] text-muted">Flexible · {m.lifestyleCost > 0 ? formatPercent(m.expenses.flexible / m.lifestyleCost) : '–'}</div>
            </div>
          </div>
          <dl className="mt-4 divide-y divide-line text-[13px]">
            <Row label="Essential monthly cost" hint="the minimum to meet obligations" value={money(m.essentialCost)} />
            <Row label="Normal lifestyle cost" hint="essentials plus your usual discretionary spending" value={money(m.lifestyleCost)} />
            <Row label="Planned cost" hint="lifestyle plus saving and investing" value={money(m.plannedCost)} strong />
          </dl>
        </Card>

        {/* Allocation today vs future */}
        <Card>
          <CardHeader
            icon={<IconTile icon="stat-safe-to-spend" accent="brand" size="sm" />}
            title="Today versus the future"
            subtitle="What share of your income goes where."
            action="Savings & goals"
            actionTo="/savings"
          />
          {m.income.total === 0 ? (
            <p className="text-[13px] text-muted">
              Add income to see the allocation.{' '}
              <Link to="/income" className="font-medium text-brand-700">
                Add income
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
                  ['Current lifestyle', m.allocation.lifestyle, 'blue'],
                  ...(m.allocation.debtPaydown > 0 ? [['Paying down loans', m.allocation.debtPaydown, 'red']] : []),
                  ['Planned future spending', m.allocation.futureSpending, 'green'],
                  ['Long-term saving & investing', m.allocation.longTerm, 'purple'],
                  ['Unallocated', m.allocation.unallocated, 'neutral'],
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
                  Your plan exceeds your income by {money(-m.breathingRoom)} per month, so the shares above add up to more than 100%.
                </Callout>
              )}
            </>
          )}
        </Card>

        {/* Reducible */}
        <Card>
          <CardHeader
            icon={<IconTile icon="nav-leisure" accent="green" size="sm" />}
            title="Which expenses could I realistically reduce?"
            subtitle="Optional and flexible items. Tap one to change its amount or how it is classified."
            action="Leisure"
            actionTo={CATEGORY_ROUTE.leisure}
          />
          {m.reducible.length === 0 ? (
            <p className="text-[13px] text-muted">Nothing is marked both optional and flexible.</p>
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
            <span className="text-ink-soft">All optional & flexible spending</span>
            <span className="tabular font-semibold text-ink">{money(m.reducible.reduce((a, l) => a + l.monthly, 0))}</span>
          </div>
        </Card>

        {/* Subscriptions & car */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
          <Card>
            <CardHeader
              icon={<IconTile icon="card-subscriptions" accent="purple" size="sm" />}
              title="Subscriptions"
              action="Add subscription"
              actionIcon={Plus}
              onAction={() => openNew(['subscription'])}
            />
            <Total monthly={money(m.subscriptions.monthly)} annual={money(m.subscriptions.annual)} />
            <TaggedLines lines={m.subscriptions.lines} money={money} onEdit={openEdit} empty="No subscriptions yet. Add one here, or tag an existing expense as a subscription." />
          </Card>
          <Card>
            <CardHeader
              icon={<IconTile icon="card-car-cost" accent="orange" size="sm" />}
              title="How expensive is my car really?"
              action="Add car cost"
              actionIcon={Plus}
              onAction={() => expenses.openNew(customDraft('transport', '', ['car']))}
            />
            <Total monthly={money(m.car.monthly)} annual={money(m.car.annual)} />
            <TaggedLines
              lines={m.car.lines}
              money={money}
              onEdit={openEdit}
              empty={m.car.loans.length > 0 ? '' : 'No car costs yet. Add one here, or tag an existing expense as car-related.'}
            />
            {m.car.loans.length > 0 && (
              <ul className={clsx('divide-y divide-line', m.car.lines.length > 0 ? 'border-t border-line' : 'mt-3')}>
                {m.car.loans.map((l) => (
                  <li key={l.id}>
                    <EditableLine onClick={() => loans.openEdit(l.id)} name={l.name}>
                      <span className="text-[12px] text-muted">Loan</span>
                      <span className="tabular text-ink">{money(l.monthly)}</span>
                    </EditableLine>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 border-t border-line pt-3 text-[12.5px] text-muted">
              Common car costs like fuel, insurance and tax are one tap away on{' '}
              <Link to={CATEGORY_ROUTE.transport} className="font-medium text-brand-700">
                Transport
              </Link>
              .
            </p>
          </Card>
        </div>

        {/* Resilience */}
        <Card className="lg:col-span-2">
          <CardHeader
            icon={<IconTile icon="card-resilience" accent="green" size="sm" />}
            title="How financially resilient am I?"
            subtitle="Plain numbers instead of a score."
            action="Update accounts"
            actionTo="/accounts"
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Emergency savings" value={money(m.position.emergency)} sub={m.essentialCost > 0 ? `${formatMonths(m.resilience.emergencyMonths)} of essentials` : undefined} />
            <Stat label="Essential runway" value={formatMonths(m.resilience.essentialRunwayMonths)} sub={`${money(m.resilience.availableForRunway)} cash & emergency`} />
            <Stat label="Lifestyle runway" value={formatMonths(m.resilience.lifestyleRunwayMonths)} sub="at your normal lifestyle" />
            <Stat
              label="Essentials vs reliable income"
              value={m.resilience.reliableCoversEssentials ? 'Covered' : 'Not covered'}
              sub={
                m.resilience.reliableCoversEssentials
                  ? `${money(m.resilience.essentialMargin)} to spare`
                  : `${money(-m.resilience.essentialMargin)} relies on variable income`
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

/** A cost line that opens the expense editor in place. */
function EditableLine({ name, lead, children, onClick }: { name: string; lead?: ReactNode; children: ReactNode; onClick: () => void }) {
  return (
    <EditableRow onClick={onClick} title="Edit expense" className="py-2 text-[13px]">
      {lead}
      <EditableTitle className="flex-1 text-ink">{name}</EditableTitle>
      {children}
    </EditableRow>
  );
}

function Total({ monthly, annual }: { monthly: string; annual: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="tabular text-[22px] font-bold text-ink">{monthly}</span>
      <span className="text-[12.5px] text-muted">/ month</span>
      <span className="tabular ml-auto text-[13px] text-muted">{annual} / year</span>
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
