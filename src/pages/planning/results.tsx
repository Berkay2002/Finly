import { ArrowRight, ExternalLink } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { format, isValid, parseISO, setDate as setDayOfMonth } from 'date-fns';
import { homeElectricityPrice } from '@/engine/car';
import { formatDuration, formatMoney, formatMonths, formatPercent, formatShortMonthYear } from '@/engine/format';
import { homePriceArea } from '@/engine/home';
import { monthsAhead } from '@/engine/projections';
import type { PurchaseResult, ScenarioResult } from '@/engine/scenarios';
import type { FinancialPlan } from '@/engine/types';
import { useT } from '@/i18n';
import type { useDraft } from '@/store/draftStore';
import { fetchSpotAverage, previousMonthKey, type SpotAverage } from '@/lib/spotPrice';
import { useViewDate } from '@/store/selectors';
import { Button } from '@/components/ui/Button';
import { EditableRow, EditableTitle } from '@/components/ui/EditableRow';
import { TextField } from '@/components/ui/fields';

/* ------------------------------------------------------------------ */
/* Shared results                                                      */
/* ------------------------------------------------------------------ */

/** Smallest change worth showing, per unit: half a krona, a tenth of a month, a tenth of a percent. */
const NOTICEABLE = { money: 0.5, months: 0.05, percent: 0.001 } as const;

/**
 * What a change does to the plan: breathing room as a bar, goals pushed back when saving has to give, and the
 * other figures that move folded away. `details` adds the tool's own lines to the fold.
 */
export function ScenarioResults({
  result,
  currency,
  onEditGoal,
  label,
  details = [],
}: {
  result: ScenarioResult;
  /** Name of what is added, for the bar's legend. */
  label?: string;
  currency: string;
  onEditGoal: (id: string) => void;
  details?: { label: string; value: string }[];
}) {
  const t = useT().planning.results;
  const money = (n: number) => formatMoney(n, currency);
  const br = result.deltas.find((d) => d.key === 'breathingRoom')!;
  const moved = result.deltas.filter((d) => ['flexible', 'savingsRate', 'essentialRunway', 'lifestyleRunway'].includes(d.key) && Math.abs(d.delta) >= NOTICEABLE[d.unit]);
  const fmt = (d: (typeof moved)[number], v: number) =>
    d.unit === 'money' ? money(v) : d.unit === 'months' ? formatMonths(v) : formatPercent(v);
  const delayed = result.goals.filter((g) => g.delayMonths > 0);

  return (
    <div className="space-y-3">
      <SpareMoneyBar saving={result.before.savings.total} before={br.before} after={br.after} label={label ?? t.thisPart} money={money} />
      {(details.length > 0 || moved.length > 0) && (
        <details className="rounded-xl border border-line px-3 py-2">
          <summary className="cursor-pointer text-[12.5px] font-medium text-ink-soft">{t.moreChanges}</summary>
          <dl className="mt-1 divide-y divide-line text-[12.5px]">
            {details.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-3 py-1.5">
                <dt className="text-ink-soft">{row.label}</dt>
                <dd className="tabular text-ink">{row.value}</dd>
              </div>
            ))}
            {moved.map((d) => (
              <div key={d.key} className="flex items-baseline justify-between gap-3 py-1.5">
                <dt className="text-ink-soft">{d.label}</dt>
                <dd className="tabular flex items-baseline gap-1.5">
                  <span className="text-faint">{fmt(d, d.before)}</span>
                  <ArrowRight size={11} className="text-faint" />
                  <span className={d.delta < 0 ? 'text-negative' : 'text-positive'}>{fmt(d, d.after)}</span>
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}
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

/**
 * Where the money left after costs goes each month, as one bar: planned saving, what is left over, and what the
 * change takes from them (red past zero) or adds.
 */
function SpareMoneyBar({ saving, before, after, label, money }: { saving: number; before: number; after: number; label: string; money: (n: number) => string }) {
  const t = useT().planning.results;
  const from = saving + before;
  const to = saving + after;
  const kept = Math.max(0, Math.min(from, to));
  const savingKept = Math.min(Math.max(0, saving), kept);
  const parts = [
    { key: 'saving', label: t.savingPart, amount: savingKept, bar: savingKept, className: 'bg-brand-solid' },
    { key: 'free', label: t.freePart, amount: kept - savingKept, bar: kept - savingKept, className: 'bg-brand-solid/40' },
    // What the change takes; the part past zero is drawn red.
    { key: 'this', label, amount: before - after, bar: Math.max(0, from) - kept, className: 'bg-warning' },
    { key: 'over', label: '', amount: 0, bar: Math.max(0, -to) - Math.max(0, -from), className: 'bg-negative' },
    { key: 'added', label: t.addedPart, amount: to - Math.max(0, from), bar: Math.max(0, to) - kept, className: 'bg-positive' },
  ];
  const scale = parts.reduce((sum, p) => sum + Math.max(0, p.bar), 0) || 1;
  const savingCut = Math.max(0, saving) - savingKept;

  return (
    <div className="rounded-xl border border-line p-3">
      <div className="text-[12px] font-medium text-muted">{t.barTitle}</div>
      <div className="mt-2 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-line" aria-hidden>
        {parts.map((p) => p.bar > 0 && <div key={p.key} className={clsx('rounded-full', p.className)} style={{ width: `${(p.bar / scale) * 100}%` }} />)}
      </div>
      <ul className="tabular mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-soft">
        {parts
          .filter((p) => p.label && p.amount >= NOTICEABLE.money)
          .map((p) => (
            <li key={p.key} className="flex items-center gap-1.5">
              <span className={clsx('h-2 w-2 rounded-full', p.className)} aria-hidden />
              {p.label} {money(p.amount)}
            </li>
          ))}
      </ul>
      {to < 0 ? (
        <p className="mt-2 text-[12.5px] font-medium text-negative">{t.short(money(-to))}</p>
      ) : (
        savingCut >= NOTICEABLE.money && <p className="mt-2 text-[12.5px] text-warning">{t.savingCut(money(savingCut))}</p>
      )}
    </div>
  );
}

/** The answer in one line and one number: whether it fits, and what it costs a month. */
export function VerdictHeadline({ verdict, title, amount, detail, children }: { verdict: Verdict; title: string; amount: string; detail?: ReactNode; children?: ReactNode }) {
  const tone = verdict === 'comfortable' ? 'text-positive' : verdict === 'tight' ? 'text-warning' : 'text-negative';
  return (
    <div className="rounded-xl border border-line bg-page/60 p-4">
      <div className={clsx('flex items-center gap-2 text-[13px] font-semibold', tone)}>
        <span className="h-2 w-2 rounded-full bg-current" aria-hidden />
        {title}
      </div>
      <div className="tabular mt-1 text-[24px] font-semibold leading-tight text-ink">{amount}</div>
      {detail && <p className="mt-0.5 text-[12.5px] text-muted">{detail}</p>}
      {children && <div className="mt-2 space-y-1 text-[12.5px] text-ink-soft">{children}</div>}
    </div>
  );
}

export function DeltaTile({ label, before, after, change }: { label: string; before: string; after: string; change: number }) {
  const same = Math.abs(change) < 0.005;
  return (
    <div className="rounded-xl border border-line bg-page/60 p-3">
      <div className="text-[11.5px] text-muted">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className="tabular text-[12px] text-faint line-through">{before}</span>
        <ArrowRight size={11} className="text-faint" />
        <span className={clsx('tabular text-[14px] font-semibold', same ? 'text-ink' : change < 0 ? 'text-negative' : 'text-positive')}>{after}</span>
      </div>
    </div>
  );
}

/** A number field that can be left empty; empty reads as 0 or as the given fallback. */
export function NumberField({ value, onChange, ...rest }: { label: string; hint?: string; value: number | null; onChange: (v: number | null) => void; placeholder?: string; step?: string }) {
  return (
    <TextField
      type="number"
      inputMode="decimal"
      min={0}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0))}
      {...rest}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Purchase tool parts                                                 */
/* ------------------------------------------------------------------ */

export const isoDay = (d: Date) => format(d, 'yyyy-MM-dd');

/** The purchase date: the 15th of the viewed month when that is ahead, else today; never before today. */
export function usePurchaseDate(field: ReturnType<typeof useDraft>) {
  const viewDate = useViewDate();
  const today = useMemo(() => new Date(), []);
  const [date, setDate] = field('date', () => isoDay(monthsAhead(today, viewDate) > 0 ? setDayOfMonth(viewDate, 15) : today));
  const when = useMemo(() => {
    const d = parseISO(date);
    return isValid(d) && d > today ? d : today;
  }, [date, today]);
  return { today, date, setDate, when };
}

/** Questions down the left; answer and verdict stay pinned on the right while you type. Mobile: answer, inputs, verdict. */
export function ToolGrid({ answer, inputs, verdict, children }: { answer: ReactNode; inputs: ReactNode; verdict: ReactNode; children?: ReactNode }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      {/* `contents` on mobile lets order interleave answer, inputs, verdict; on lg it becomes the sticky column. */}
      <div className="contents lg:sticky lg:top-4 lg:col-start-2 lg:row-start-1 lg:block lg:max-h-[calc(100vh-2rem)] lg:space-y-4 lg:overflow-y-auto lg:overscroll-contain">
        <div className="order-1">{answer}</div>
        <div className="order-3">{verdict}</div>
      </div>
      <div className="order-2 space-y-4 lg:col-start-1 lg:row-start-1">{inputs}</div>
      {children}
    </div>
  );
}

/** What the plan can carry, before anything is typed. No `figures` shows `empty` instead. */
export function AnswerPanel({ figures, note, empty }: { figures: { label: string; value: string; positive?: boolean }[]; note?: ReactNode; empty?: ReactNode }) {
  const c = useT().planning.car;
  return (
    <div className="rounded-xl border border-line bg-page/60 p-4">
      <div className="text-[12px] font-medium text-muted">{c.answerTitle}</div>
      {figures.length > 0 ? (
        <>
          <div className="mt-1 grid grid-cols-2 gap-3">
            {figures.map((f) => (
              <div key={f.label}>
                <div className="text-[12px] text-ink-soft">{f.label}</div>
                <div className={clsx('tabular text-[22px] font-bold', f.positive ? 'text-positive' : 'text-ink')}>{f.value}</div>
              </div>
            ))}
          </div>
          {note && <p className="mt-2 text-[12.5px] text-muted">{note}</p>}
        </>
      ) : (
        <p className="mt-1 text-[13px] text-ink-soft">{empty}</p>
      )}
    </div>
  );
}

/**
 * Fields side by side that line up: each `Field` spans three rows of this grid (label, input, help), shared
 * with its neighbours through subgrid, so a label that wraps or links under one input do not push the other out
 * of line.
 */
export function FieldGrid({ cols = 2, className, children }: { cols?: 2 | 3; className?: string; children: ReactNode }) {
  return <div className={clsx('grid gap-x-3 gap-y-3', cols === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2', className)}>{children}</div>;
}

/** One field in a `FieldGrid`, with help or links under the input. The field's own wrapper is flattened into the subgrid. */
export function Field({ children, help, wide }: { children: ReactNode; help?: ReactNode; wide?: boolean }) {
  return (
    <div className={clsx('row-span-3 grid grid-rows-subgrid gap-y-0 [&>div:first-child]:contents [&>div:first-child>label]:self-end', wide && 'sm:col-span-2')}>
      {children}
      <div className="mt-1 text-[12px] leading-snug text-muted empty:mt-0">{help}</div>
    </div>
  );
}

/** Electricity per kWh at home: the plan's own tariffs, else last month's spot price fetched when `enabled`. */
export function useElectricityPrice(plan: FinancialPlan, enabled: boolean) {
  const [spot, setSpot] = useState<SpotAverage | null>(null);
  useEffect(() => {
    if (!enabled || spot || homeElectricityPrice(plan)) return;
    fetchSpotAverage(homePriceArea(plan).area, previousMonthKey())
      .then(setSpot)
      .catch(() => undefined);
  }, [enabled, spot, plan]);
  return { price: enabled ? homeElectricityPrice(plan, spot?.oreInclVat) : null, spot };
}

export function ToolSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line p-3">
      <div className="text-[13px] font-medium text-ink">{title}</div>
      {children}
    </section>
  );
}

export interface CostRow {
  label: string;
  /** Null: not entered yet. */
  value: number | null;
  note?: string;
}

/** Costs line by line, with a total. */
export function CostList({ rows, total, currency, className }: { rows: CostRow[]; total: { label: string; value: number; note?: string }; currency: string; className?: string }) {
  const c = useT().planning.car;
  const money = (n: number) => formatMoney(n, currency);
  return (
    <dl className={clsx('divide-y divide-line rounded-lg bg-page/60 px-3 text-[12.5px]', className)}>
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between gap-3 py-1.5">
          <dt className="text-ink-soft">
            {row.label}
            {row.value !== null && row.note && <span className="ml-1 text-muted">· {row.note}</span>}
          </dt>
          <dd className="tabular shrink-0 text-ink">{row.value === null ? <span className="text-muted">{c.notEntered}</span> : money(row.value)}</dd>
        </div>
      ))}
      <div className="flex items-baseline justify-between gap-3 py-1.5 font-semibold">
        <dt className="text-ink">
          {total.label}
          {total.note && <span className="ml-1 font-normal text-muted">· {total.note}</span>}
        </dt>
        <dd className="tabular shrink-0 text-ink">{money(total.value)}</dd>
      </div>
    </dl>
  );
}

/** Where to find a real figure: a lookup, a price comparison, a quote. */
export function SourceLinks({ label, links }: { label?: string; links: { name: string; url: string }[] }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2">
      {label}
      {links.map((l) => (
        <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">
          {l.name}
          {links.length === 1 && <ExternalLink size={11} />}
        </a>
      ))}
    </p>
  );
}

export type PayMode = 'now' | 'split' | 'save';

/** Pay in full, split into instalments or save up first, each with what it comes to. */
export function PayOptions({ value, onChange, options, children }: { value: PayMode; onChange: (m: PayMode) => void; options: { id: PayMode; label: string; detail: string; extra?: string }[]; children?: ReactNode }) {
  const a = useT().planning.afford;
  return (
    <ToolSection title={a.waysToPay}>
      <div className="mt-2 space-y-1">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={value === o.id}
            onClick={() => onChange(o.id)}
            className={clsx(
              'flex w-full items-baseline justify-between gap-3 rounded-lg border px-3 py-2 text-left text-[12.5px] transition',
              value === o.id ? 'border-brand-200 bg-brand-50' : 'border-transparent hover:bg-page',
            )}
          >
            <span className="font-medium text-ink">{o.label}</span>
            <span className="tabular text-right text-ink-soft">
              {o.detail}
              {o.extra && <span className="block text-warning">{o.extra}</span>}
            </span>
          </button>
        ))}
      </div>
      {children}
    </ToolSection>
  );
}

/** When it fits without dipping into savings, with a button to move the date there. */
export function EarliestLine({ result, today, when, onUse }: { result: PurchaseResult; today: Date; when: Date; onUse: (iso: string) => void }) {
  const a = useT().planning.afford;
  const earliest = result.earliest;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-soft">
      <span>{!earliest ? a.notWithin : monthsAhead(today, earliest) <= 0 ? a.fitsNow : a.earliest(formatShortMonthYear(earliest))}</span>
      {earliest && monthsAhead(earliest, when) !== 0 && (
        <Button size="sm" variant="secondary" onClick={() => onUse(isoDay(earliest > today ? earliest : today))}>
          {a.useDate}
        </Button>
      )}
    </div>
  );
}

export type Verdict = 'comfortable' | 'tight' | 'no';
export const verdictTone = (v: Verdict) => (v === 'comfortable' ? 'success' : v === 'tight' ? 'info' : 'warning');

/** Comfortable within half of what is spare, tight within all of it. */
export const judgeAgainst = (amount: number, spare: number): Verdict => (amount <= spare / 2 ? 'comfortable' : amount <= spare ? 'tight' : 'no');

/** The least comfortable of several checks. */
export const worstVerdict = (...v: Verdict[]): Verdict => (v.includes('no') ? 'no' : v.includes('tight') ? 'tight' : 'comfortable');

/** Rounded down for an answer that is a guide, not a quote. */
export const roundDown = (n: number, step: number) => Math.max(0, Math.floor(n / step) * step);
