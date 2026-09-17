import { ArrowRight } from 'lucide-react';
import clsx from 'clsx';
import { formatDuration, formatMoney, formatMonths, formatPercent } from '@/engine/format';
import type { ScenarioResult } from '@/engine/scenarios';
import { useT } from '@/i18n';
import { Callout } from '@/components/ui/Callout';
import { TextField } from '@/components/ui/fields';
import { EditableRow, EditableTitle } from '@/components/ui/EditableRow';

/* ------------------------------------------------------------------ */
/* Shared results                                                      */
/* ------------------------------------------------------------------ */

export function ScenarioResults({ result, currency, onEditGoal }: { result: ScenarioResult; currency: string; onEditGoal: (id: string) => void }) {
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
        {shown.map((d) => (
          <DeltaTile key={d.key} label={d.label} before={fmt(d, d.before)} after={fmt(d, d.after)} change={d.delta} />
        ))}
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
