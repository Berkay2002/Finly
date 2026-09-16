import { ArrowRight, Plus, TrendingDown, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import clsx from 'clsx';
import { SPEND_GROUP_META, SPEND_GROUPS } from '@/engine/everyday';
import { FREQUENCIES, FREQUENCY_LABELS } from '@/engine/frequency';
import { formatCompact, formatDuration, formatMoney, formatMoneyRange, formatMonths, formatPercent, formatShortMonth, formatShortMonthYear } from '@/engine/format';
import { runScenario, type IncomeChangeScenario, type RecurringExpenseScenario, type ScenarioResult } from '@/engine/scenarios';
import { CATEGORY_META } from '@/engine/taxonomy';
import { EXPENSE_CATEGORIES, type ExpenseCategory, type Frequency } from '@/engine/types';
import { useT } from '@/i18n';
import { useCurrency, useMetrics, useMonthOutlook, usePlan, useViewDate } from '@/store/selectors';
import { customDraft, useExpenseSheet } from '@/components/forms/ExpenseEditor';
import { useGoalSheet } from '@/components/forms/GoalEditor';
import { useLoanSheet } from '@/components/forms/LoanEditor';
import { useSavingsTaxSheet } from '@/components/forms/SavingsTax';
import { PageHeader } from '@/components/layout/PageHeader';
import { Callout } from '@/components/ui/Callout';
import { Card, CardHeader } from '@/components/ui/Card';
import { EditableRow, EditableTitle } from '@/components/ui/EditableRow';
import { IconTile } from '@/components/ui/IconTile';
import { MoneyField, SegmentedControl, SelectField, TextField, TogglePill } from '@/components/ui/fields';
import { Button } from '@/components/ui/Button';

const freqOptions = () => FREQUENCIES.filter((f) => f !== 'once').map((f) => ({ value: f, label: FREQUENCY_LABELS[f] }));

export function PlanningPage() {
  const t = useT();
  return (
    <div>
      <PageHeader title={t.nav.planning} subtitle={t.planning.subtitle} />
      <div className="grid gap-5 xl:grid-cols-2">
        <AffordTool />
        <IncomeTool />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <AllowanceCard />
        <OutlookCard />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Can I afford this?                                                  */
/* ------------------------------------------------------------------ */

function AffordTool() {
  const plan = usePlan();
  const now = useViewDate();
  const currency = useCurrency();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState(0);
  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const [category, setCategory] = useState<ExpenseCategory>('transport');
  const [essential, setEssential] = useState<'essential' | 'optional'>('optional');
  const [committed, setCommitted] = useState<'committed' | 'flexible'>('committed');
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
    <Card>
      <CardHeader icon={<IconTile icon="card-afford" accent="orange" size="sm" />} title={a.title} subtitle={a.subtitle} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label={a.whatIsIt} placeholder={a.namePlaceholder} value={name} onChange={(e) => setName(e.target.value)} className="sm:col-span-2" />
        <MoneyField label={a.amount} currency={currency} value={amount} onValueChange={setAmount} />
        <SelectField label={a.frequency} value={frequency} onValueChange={setFrequency} options={freqOptions()} />
        <SelectField
          label={a.category}
          value={category}
          onValueChange={setCategory}
          options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_META[c].label }))}
        />
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
    </Card>
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
/* Shared results                                                      */
/* ------------------------------------------------------------------ */

function ScenarioResults({ result, currency, onEditGoal }: { result: ScenarioResult; currency: string; onEditGoal: (id: string) => void }) {
  const t = useT().planning.results;
  const money = (n: number) => formatMoney(n, currency);
  const br = result.deltas.find((d) => d.key === 'breathingRoom')!;
  const shown = result.deltas.filter((d) => ['safeToSpend', 'breathingRoom', 'flexible', 'savingsRate', 'essentialRunway', 'lifestyleRunway'].includes(d.key));
  const fmt = (d: (typeof shown)[number], v: number) =>
    d.unit === 'money' ? money(v) : d.unit === 'months' ? formatMonths(v) : formatPercent(v);
  const delayed = result.goals.filter((g) => g.delayMonths > 0);

  return (
    <div className="space-y-3">
      <Callout tone={br.after < 0 ? 'warning' : br.delta < 0 ? 'info' : 'success'}>
        {br.delta < 0
          ? t.reduce(money(br.before), money(br.after))
          : br.delta > 0
            ? t.increase(money(br.before), money(br.after))
            : t.unchanged}
        {br.after < 0 && t.short(money(-br.after))}
      </Callout>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {shown.map((d) => {
          const worse = d.delta < 0;
          const same = Math.abs(d.delta) < 0.005;
          return (
            <div key={d.key} className="rounded-xl border border-line bg-page/60 p-3">
              <div className="text-[11.5px] text-muted">{d.label}</div>
              <div className="mt-0.5 flex items-baseline gap-1.5">
                <span className="tabular text-[12px] text-faint line-through">{fmt(d, d.before)}</span>
                <ArrowRight size={11} className="text-faint" />
                <span className={clsx('tabular text-[14px] font-semibold', same ? 'text-ink' : worse ? 'text-negative' : 'text-positive')}>
                  {fmt(d, d.after)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {result.savingsShortfall > 0 && (
        <div className="rounded-xl border border-line p-3">
          <div className="text-[13px] font-medium text-ink">{t.goalsTitle}</div>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {t.goalsIntro(money(result.savingsShortfall))}
          </p>
          <ul className="mt-2 space-y-0.5">
            {delayed.map((g) => (
              <li key={g.goal.id}>
                <EditableRow onClick={() => onEditGoal(g.goal.id)} title={t.editGoal} className="justify-between py-1 text-[12.5px]">
                  <EditableTitle className="text-ink">{g.goal.name}</EditableTitle>
                  <span className="tabular shrink-0 text-warning">
                    {Number.isFinite(g.delayMonths) ? `+${formatDuration(g.delayMonths)}` : t.neverReached}
                  </span>
                </EditableRow>
              </li>
            ))}
            {delayed.length === 0 && <li className="text-[12.5px] text-muted">{t.noGoalsAffected}</li>}
          </ul>
        </div>
      )}
    </div>
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
                      {i.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="tabular shrink-0 font-semibold text-warning">{t.aboveNormal(money(o.aboveNormal))}</div>
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
