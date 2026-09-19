import { Plus, TrendingDown, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import clsx from 'clsx';
import { SPEND_GROUP_META, SPEND_GROUPS } from '@/engine/everyday';
import { FREQUENCIES, FREQUENCY_LABELS } from '@/engine/frequency';
import { formatCompact, formatMoney, formatMoneyRange, formatShortMonth, formatShortMonthYear } from '@/engine/format';
import { runScenario, type IncomeChangeScenario, type RecurringExpenseScenario } from '@/engine/scenarios';
import { CATEGORY_META } from '@/engine/taxonomy';
import { EXPENSE_CATEGORIES, type ExpenseCategory, type Frequency } from '@/engine/types';
import { useT } from '@/i18n';
import { useDraft, useDraftStore, type PurchaseKind } from '@/store/draftStore';
import { useCurrency, useEffectivePlan, useMetrics, useMonthOutlook, usePlan, useViewDate } from '@/store/selectors';
import { customDraft, useExpenseSheet } from '@/components/forms/ExpenseEditor';
import { useGoalSheet } from '@/components/forms/GoalEditor';
import { useLoanSheet } from '@/components/forms/LoanEditor';
import { useSavingsTaxSheet } from '@/components/forms/SavingsTax';
import { PageHeader } from '@/components/layout/PageHeader';
import { Callout } from '@/components/ui/Callout';
import { Card, CardHeader } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { IconTile } from '@/components/ui/IconTile';
import { MoneyField, SegmentedControl, SelectField, TextField, TogglePill } from '@/components/ui/fields';
import { Button } from '@/components/ui/Button';
import { CarTool } from './planning/CarTool';
import { HomeTool } from './planning/HomeTool';
import { ItemTool } from './planning/ItemTool';
import { TripTool } from './planning/TripTool';
import { ScenarioResults } from './planning/results';
import { SaveBar, SavedList, TOOL_ICONS } from './planning/SavedScenarios';

const freqOptions = () => FREQUENCIES.filter((f) => f !== 'once').map((f) => ({ value: f, label: FREQUENCY_LABELS[f] }));

export function PlanningPage() {
  const t = useT();
  return (
    <div>
      <PageHeader title={t.nav.planning} subtitle={t.planning.subtitle} />
      <AffordTool />
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <IncomeTool />
        <AllowanceCard />
      </div>
      <div className="mt-5">
        <OutlookCard />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Can I afford this?                                                  */
/* ------------------------------------------------------------------ */

function AffordTool() {
  const mode = useDraftStore((s) => s.mode);
  const kind = useDraftStore((s) => s.kind);
  const { setMode, setKind } = useDraftStore.getState();
  const a = useT().planning.afford;
  return (
    <Card>
      <CardHeader icon={<IconTile icon="card-afford" accent="orange" size="sm" />} title={a.title} subtitle={a.subtitle} />
      <SavedList />
      <SegmentedControl
        className="mb-3"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'purchase', label: a.modeOnce },
          { value: 'monthly', label: a.modeMonthly },
        ]}
      />
      {mode === 'purchase' && (
        <div className="mb-3">
          <div className="mb-2 text-[12.5px] font-medium text-ink-soft">{a.whatBuying}</div>
          <div className="flex flex-wrap gap-2">
            {PURCHASE_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={clsx(
                  'inline-flex items-center gap-1.5 rounded-full border py-1 pl-1.5 pr-3 text-[12.5px] font-medium transition',
                  kind === k ? 'border-brand-200 bg-brand-50 text-ink' : 'border-line text-muted hover:text-ink',
                )}
              >
                <Icon icon={TOOL_ICONS[k]} size={22} />
                {a.kinds[k]}
              </button>
            ))}
          </div>
        </div>
      )}
      <SaveBar />
      {mode === 'monthly' ? (
        <MonthlyCost />
      ) : kind === 'car' ? (
        <CarTool />
      ) : kind === 'home' ? (
        <HomeTool />
      ) : kind === 'trip' ? (
        <TripTool />
      ) : (
        <ItemTool key={kind} kind={kind} />
      )}
    </Card>
  );
}

const PURCHASE_KINDS: PurchaseKind[] = ['car', 'home', 'computer', 'phone', 'trip', 'other'];

function MonthlyCost() {
  const plan = useEffectivePlan();
  const now = useViewDate();
  const currency = useCurrency();
  const field = useDraft('monthly');
  const [name, setName] = field('name', '');
  const [amount, setAmount] = field('amount', 0);
  const [frequency, setFrequency] = field<Frequency>('frequency', 'monthly');
  const [category, setCategory] = field<ExpenseCategory>('category', 'transport');
  const [essential, setEssential] = field<'essential' | 'optional'>('essential', 'optional');
  const [committed, setCommitted] = field<'committed' | 'flexible'>('committed', 'committed');
  const expenses = useExpenseSheet();
  const goalSheet = useGoalSheet();
  const t = useT();
  const a = t.planning.afford;

  const result = useMemo(() => {
    if (amount <= 0) return null;
    const scenario: RecurringExpenseScenario = {
      type: 'add_expense',
      name: name || t.planning.newExpense,
      amount,
      frequency,
      category,
      essential: essential === 'essential',
      committed: committed === 'committed',
    };
    return runScenario(plan, scenario, now);
  }, [plan, now, name, amount, frequency, category, essential, committed, t]);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label={a.whatIsIt} placeholder={a.namePlaceholder} value={name} onChange={(e) => setName(e.target.value)} className="sm:col-span-2" />
        <MoneyField label={a.amount} currency={currency} value={amount} onValueChange={setAmount} />
        <SelectField label={a.frequency} value={frequency} onValueChange={setFrequency} options={freqOptions()} />
        <CategorySelect value={category} onValueChange={setCategory} />
        <div className="flex flex-col gap-2">
          <div className="text-[12.5px] font-medium text-ink-soft">{a.classification}</div>
          <div className="flex flex-wrap gap-2">
            <TogglePill value={essential} onChange={setEssential} options={[{ value: 'essential', label: a.essential }, { value: 'optional', label: a.optional }]} />
            <TogglePill value={committed} onChange={setCommitted} options={[{ value: 'committed', label: a.committed }, { value: 'flexible', label: a.flexible }]} />
          </div>
        </div>
      </div>
      <div className="mt-4">
        {result ? (
          <>
            <ScenarioResults result={result} currency={currency} onEditGoal={goalSheet.openEdit} />
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-[12.5px] text-muted">{a.goAhead}</p>
              <Button
                size="sm"
                variant="soft"
                icon={Plus}
                onClick={() =>
                  expenses.openNew({
                    ...customDraft(category, name || t.planning.newExpense),
                    amount,
                    frequency,
                    essential: essential === 'essential',
                    committed: committed === 'committed',
                  })
                }
              >
                {a.addToPlan}
              </Button>
            </div>
          </>
        ) : (
          <Callout tone="neutral">{a.enterAmount}</Callout>
        )}
      </div>
      {expenses.sheet}
      {goalSheet.sheet}
    </>
  );
}

function CategorySelect({ value, onValueChange }: { value: ExpenseCategory; onValueChange: (c: ExpenseCategory) => void }) {
  const a = useT().planning.afford;
  return (
    <SelectField
      label={a.category}
      value={value}
      onValueChange={onValueChange}
      options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_META[c].label }))}
    />
  );
}

/* ------------------------------------------------------------------ */
/* What if my income changes?                                          */
/* ------------------------------------------------------------------ */

function IncomeTool() {
  const plan = usePlan();
  const now = useViewDate();
  const currency = useCurrency();
  const [sourceId, setSourceId] = useState<string>('');
  const [mode, setMode] = useState<IncomeChangeScenario['mode']>('percent');
  const [value, setValue] = useState(10);
  const goalSheet = useGoalSheet();
  const t = useT();
  const it = t.planning.income;

  const result = useMemo(() => {
    if (plan.income.length === 0) return null;
    if (mode !== 'remove' && value === 0) return null;
    const scenario: IncomeChangeScenario = { type: 'income_change', sourceId: sourceId || undefined, mode, value };
    return runScenario(plan, scenario, now);
  }, [plan, now, sourceId, mode, value]);

  const presets: { label: string; mode: IncomeChangeScenario['mode']; value: number; icon: typeof TrendingUp }[] = [
    { label: it.presetRaise, mode: 'percent', value: 10, icon: TrendingUp },
    { label: it.presetReduced, mode: 'percent', value: -20, icon: TrendingDown },
    { label: it.presetLose, mode: 'remove', value: 0, icon: TrendingDown },
  ];

  return (
    <Card>
      <CardHeader icon={<IconTile icon="card-income-change" accent="blue" size="sm" />} title={it.title} subtitle={it.subtitle} action={it.manage} actionTo="/income" />
      {plan.income.length === 0 ? (
        <Callout tone="neutral">{it.addFirst}</Callout>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              label={it.whichIncome}
              value={sourceId}
              onValueChange={setSourceId}
              options={[{ value: '', label: it.allBaseline }, ...plan.income.map((i) => ({ value: i.id, label: i.name }))]}
            />
            <div>
              <div className="mb-1 text-[12.5px] font-medium text-ink-soft">{it.change}</div>
              <SegmentedControl
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'percent', label: '%' },
                  { value: 'absolute', label: it.modeAbsolute },
                  { value: 'set', label: it.modeSet },
                  { value: 'remove', label: it.modeRemove },
                ]}
              />
            </div>
            {mode === 'percent' && (
              <TextField
                label={it.percentChange}
                hint={it.negativeHint}
                type="number"
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(Number(e.target.value) || 0)}
              />
            )}
            {mode === 'absolute' && (
              <TextField
                label={it.monthlyChange}
                hint={it.negativeHint}
                type="number"
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(Number(e.target.value) || 0)}
              />
            )}
            {mode === 'set' && <MoneyField label={it.newMonthlyAmount} currency={currency} value={value} onValueChange={setValue} />}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {presets.map((p) => (
              <Button
                key={p.label}
                size="sm"
                variant="secondary"
                icon={p.icon}
                onClick={() => {
                  setMode(p.mode);
                  setValue(p.value);
                }}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <div className="mt-4">
            {result ? <ScenarioResults result={result} currency={currency} onEditGoal={goalSheet.openEdit} /> : <Callout tone="neutral">{it.enterChange}</Callout>}
          </div>
        </>
      )}
      {goalSheet.sheet}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Daily / weekly allowance                                            */
/* ------------------------------------------------------------------ */

function AllowanceCard() {
  const m = useMetrics();
  const currency = useCurrency();
  const [spent, setSpent] = useState(0);
  const t = useT().planning.allowance;
  const money = (n: number) => formatMoney(n, currency);
  const remainingBudget = Math.max(0, m.daily.flexibleBudget - spent);
  const perDay = spent > 0 ? remainingBudget / m.daily.daysRemaining : m.daily.perDay;
  const perWeek = perDay * 7;
  // Flexible everyday spending is part of the flexible money; spread what is still to spend in each group over the days left.
  const groups = SPEND_GROUPS.map((g) => {
    const s = m.everyday[g];
    const logged = s.month.spent !== undefined && !s.month.complete;
    const left = logged ? Math.max(0, s.flexible - (s.month.spent ?? 0)) : s.flexible * (m.daily.daysRemaining / m.daily.daysInMonth);
    return { id: g, label: SPEND_GROUP_META[g].label, perDay: s.flexible > 0 ? left / m.daily.daysRemaining : 0, summary: s, logged };
  }).filter((g) => g.perDay > 0);
  const groupsPerDay = groups.reduce((a, g) => a + g.perDay, 0);

  return (
    <Card>
      <CardHeader icon={<IconTile icon="card-per-day" accent="brand" size="sm" />} title={t.title} subtitle={t.subtitle} />
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-page p-3">
          <div className="text-[11.5px] text-muted">{t.perDay}</div>
          <div className="tabular text-[18px] font-semibold text-ink">{money(perDay)}</div>
        </div>
        <div className="rounded-xl bg-page p-3">
          <div className="text-[11.5px] text-muted">{t.perWeek}</div>
          <div className="tabular text-[18px] font-semibold text-ink">{money(perWeek)}</div>
        </div>
        <div className="rounded-xl bg-page p-3">
          <div className="text-[11.5px] text-muted">{t.daysLeft}</div>
          <div className="tabular text-[18px] font-semibold text-ink">{m.daily.daysRemaining}</div>
        </div>
      </div>
      <dl className="mt-3 divide-y divide-line text-[13px]">
        <div className="flex justify-between py-2">
          <dt className="text-ink-soft">{t.flexibleInPlan}</dt>
          <dd className="tabular font-medium text-ink">{money(m.expenses.flexible)}</dd>
        </div>
        <div className="flex justify-between py-2">
          <dt className="text-ink-soft">{t.safeOnTop}</dt>
          <dd className="tabular font-medium text-ink">{money(m.safeToSpend)}</dd>
        </div>
        <div className="flex justify-between py-2">
          <dt className="font-medium text-ink">{t.flexibleThisMonth}</dt>
          <dd className="tabular font-semibold text-ink">{money(m.daily.flexibleBudget)}</dd>
        </div>
      </dl>
      {groups.length > 0 && (
        <div className="mt-3 rounded-xl bg-page p-3 text-[12.5px]">
          <div className="mb-1 text-[11.5px] font-medium text-muted">{t.ofWhich}</div>
          {groups.map((g) => (
            <div key={g.id} className="mt-1 flex justify-between gap-3">
              <span className="text-ink-soft">{g.label}</span>
              <span className="tabular whitespace-nowrap text-ink">
                {t.dayWeek(money(g.perDay), money(g.perDay * 7))}
              </span>
            </div>
          ))}
          <div className="mt-1 flex justify-between gap-3">
            <span className="text-ink-soft">{t.everythingElse}</span>
            <span className="tabular whitespace-nowrap text-ink">
              {t.dayWeek(money(Math.max(0, perDay - groupsPerDay)), money(Math.max(0, perWeek - groupsPerDay * 7)))}
            </span>
          </div>
          <p className="mt-1.5 text-muted">
            {groups.some((g) => g.logged)
              ? groups
                  .filter((g) => g.logged)
                  .map((g) => t.soFar(g.label, money(g.summary.month.spent ?? 0), money(g.summary.monthly)))
                  .join(' ')
              : t.logHint}
          </p>
        </div>
      )}
      <MoneyField
        className="mt-3"
        label={t.spentSoFar}
        hint={t.optional}
        currency={currency}
        value={spent}
        onValueChange={setSpent}
      />
      {spent > 0 && (
        <p className="tabular mt-2 text-[12.5px] text-muted">
          {t.leftFor(money(remainingBudget), m.daily.daysRemaining)}
        </p>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Month outlook                                                       */
/* ------------------------------------------------------------------ */

function OutlookCard() {
  const outlook = useMonthOutlook(12);
  const m = useMetrics();
  const t = useT().planning.outlook;
  const currency = useCurrency();
  const money = (n: number) => formatMoney(n, currency);
  const data = outlook.map((o) => ({
    name: formatShortMonth(o.month),
    full: formatShortMonthYear(o.month),
    expected: Math.round(o.expected),
    above: Math.round(o.aboveNormal),
    items: o.items,
  }));
  const expensive = outlook.filter((o) => o.aboveNormal > 0).sort((a, b) => b.aboveNormal - a.aboveNormal).slice(0, 4);
  const expenses = useExpenseSheet();
  const loans = useLoanSheet();
  const taxSheet = useSavingsTaxSheet();

  return (
    <Card>
      <div id="outlook" />
      <CardHeader icon={<IconTile icon="card-expensive-months" accent="orange" size="sm" />} title={t.title} subtitle={t.subtitle(money(m.lifestyleCost))} />
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} tickFormatter={formatCompact} width={52} />
            <Tooltip
              cursor={{ fill: 'var(--color-page)' }}
              content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null;
                const p = payload[0].payload as (typeof data)[number];
                return (
                  <div className="rounded-lg border border-line bg-card px-3 py-2 text-[12px] shadow">
                    <div className="text-muted">{p.full}</div>
                    <div className="tabular font-semibold text-ink">{money(p.expected)}</div>
                    <div className={clsx('tabular', p.above > 0 ? 'text-warning' : 'text-positive')}>
                      {p.above > 0 ? '+' : ''}
                      {t.vsNormal(money(p.above))}
                    </div>
                    {p.items.slice(0, 4).map((it) => (
                      <div key={it.id} className="text-muted">
                        {it.name}: {it.high > it.low ? formatMoneyRange(it.low, it.high, currency) : money(it.amount)}
                      </div>
                    ))}
                  </div>
                );
              }}
            />
            <Bar dataKey="expected" radius={[6, 6, 0, 0]} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.full} fill={d.above > 0 ? 'var(--color-orange-500)' : 'var(--color-brand-200)'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {expensive.length > 0 ? (
        <ul className="mt-3 divide-y divide-line">
          {expensive.map((o) => (
            <li key={o.month.toISOString()} className="flex items-start justify-between gap-3 py-2 text-[13px]">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-ink">{formatShortMonthYear(o.month)}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {o.items.map((i) => (
                    <button
                      key={i.id}
                      type="button"
                      onClick={() =>
                        i.source === 'tax' ? taxSheet.open() : i.source === 'debt' ? loans.openEdit(i.expenseId) : expenses.openEdit(i.expenseId)
                      }
                      title={i.source === 'tax' ? t.seeSavingsTax : i.source === 'debt' ? t.editLoan : t.editExpense}
                      className="rounded-full border border-line bg-card px-2 py-0.5 text-[11.5px] text-ink-soft transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
                    >
                      {i.name}: {money(i.amount)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="tabular shrink-0 text-right font-semibold text-ink">
                {money(o.expected)}
                <div className="text-[11.5px] font-normal text-muted">{t.monthTotal}</div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[13px] text-muted">{t.none}</p>
      )}
      {expenses.sheet}
      {loans.sheet}
      {taxSheet.sheet}
    </Card>
  );
}
