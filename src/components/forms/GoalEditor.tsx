import { ChevronRight, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { formatDuration, formatMoney, formatNumber, formatPercent } from '@/engine/format';
import { goalProgress, goalReturn } from '@/engine/projections';
import { GOAL_KINDS, goalKindMeta } from '@/engine/taxonomy';
import type { GoalKind, SavingsGoal, SavingsPurpose } from '@/engine/types';
import { useT } from '@/i18n';
import { usePlanStore } from '@/store/planStore';
import { useAccountReturns, useCurrency, usePlan, useViewDate } from '@/store/selectors';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Delta } from '@/components/ui/Delta';
import { GOAL_ICONS, goalAccent, goalIcon } from '@/components/ui/icons';
import { IconTile } from '@/components/ui/IconTile';
import { DateField, MoneyField, SelectField, TextField, TogglePill } from '@/components/ui/fields';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Sheet } from '@/components/ui/Sheet';

export type GoalDraft = Omit<SavingsGoal, 'id'> & { id?: string };
type Draft = GoalDraft;

export function blankGoal(kind: GoalKind = 'purchase'): Draft {
  const meta = goalKindMeta(kind);
  return {
    name: kind === 'purchase' || kind === 'custom' ? '' : meta.label,
    description: '',
    kind,
    purpose: meta.purpose,
    currentAmount: 0,
    monthlyContribution: 0,
    icon: kind === 'emergency' ? 'shield' : kind === 'investment' ? 'trending' : kind === 'pension' ? 'leaf' : 'target',
  };
}

export function GoalEditor({
  autoOpenAdd = false,
  compact = false,
  previous,
}: {
  autoOpenAdd?: boolean;
  compact?: boolean;
  /** Amounts saved at the previous month's close, by goal id, for a "vs last month" hint per row. */
  previous?: Record<string, number>;
}) {
  const plan = usePlan();
  const currency = useCurrency();
  const now = useViewDate();
  const returns = useAccountReturns();
  const { addGoal, updateGoal, removeGoal } = usePlanStore();
  const [editing, setEditing] = useState<Draft | null>(null);
  const t = useT().goals.editor;

  useEffect(() => {
    if (autoOpenAdd) setEditing(blankGoal());
  }, [autoOpenAdd]);

  const save = () => {
    if (!editing) return;
    if (editing.id) {
      const { id, ...patch } = editing;
      updateGoal(id, patch);
    } else addGoal(editing);
    setEditing(null);
  };

  return (
    <div className="space-y-3">
      {!compact && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12.5px] text-muted">
            {plan.goals.length === 0 ? t.noGoals : t.goalCount(plan.goals.length)}
          </p>
          <Button variant="secondary" size="sm" icon={Plus} onClick={() => setEditing(blankGoal())}>
            {t.addNewGoal}
          </Button>
        </div>
      )}

      <div className="space-y-2.5">
        {plan.goals.map((g) => {
          const p = goalProgress(g, now, goalReturn(g, returns));
          const Icon = goalIcon(g.icon, g.kind);
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => setEditing({ ...g })}
              className="card flex w-full items-center gap-3 p-3.5 text-left transition hover:border-line-strong sm:gap-4"
            >
              <IconTile icon={Icon} accent={goalAccent(g.icon, g.kind)} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-[14px] font-semibold text-ink">{g.name || t.untitled}</span>
                  <Chip tone={g.purpose === 'long_term' ? 'brand' : 'blue'}>
                    {g.purpose === 'long_term' ? t.longTerm : t.plannedSpending}
                  </Chip>
                </div>
                {g.description && <div className="truncate text-[12.5px] text-muted">{g.description}</div>}
                {g.targetAmount ? (
                  <div className="mt-2 flex items-center gap-3">
                    <ProgressBar value={p.progress} accent="brand" className="max-w-xs flex-1" />
                    <span className="tabular text-[12.5px] font-medium text-ink-soft">{formatPercent(p.progress)}</span>
                  </div>
                ) : null}
                <div className="tabular mt-1 flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
                  <span>
                    {g.targetAmount
                      ? t.progress(formatMoney(g.currentAmount, currency), formatMoney(g.targetAmount, currency))
                      : t.saved(formatMoney(g.currentAmount, currency))}
                  </span>
                  {previous && <Delta before={previous[g.id]} after={g.currentAmount} />}
                </div>
              </div>
              <div className="hidden shrink-0 border-l border-line pl-4 text-right sm:block">
                <div className="text-[11.5px] text-muted">{t.monthly}</div>
                <div className="tabular text-[13.5px] font-semibold text-ink">{formatMoney(g.monthlyContribution, currency)}</div>
              </div>
              {g.targetAmount ? (
                <div className="hidden shrink-0 border-l border-line pl-4 text-right md:block">
                  <div className="text-[11.5px] text-muted">{t.estCompletion}</div>
                  <div className={clsx('text-[13.5px] font-semibold', p.onTrack === false ? 'text-warning' : 'text-ink')}>
                    {formatDuration(p.monthsToTarget)}
                  </div>
                  {goalReturn(g, returns) > 0 && (
                    <div className="text-[11px] text-muted">
                      {t.atAfterTax(formatNumber(goalReturn(g, returns), 1))}
                    </div>
                  )}
                </div>
              ) : null}
              <ChevronRight size={16} className="shrink-0 text-faint" />
            </button>
          );
        })}
        {plan.goals.length === 0 && (
          <button
            type="button"
            onClick={() => setEditing(blankGoal())}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-page/60 px-3 py-5 text-[13px] font-medium text-brand-700 hover:bg-brand-50"
          >
            <Plus size={14} /> {t.addFirst}
          </button>
        )}
      </div>

      <GoalSheet
        draft={editing}
        onChange={setEditing}
        onClose={() => setEditing(null)}
        onSave={save}
        onRemove={() => {
          if (editing?.id) removeGoal(editing.id);
          setEditing(null);
        }}
      />
    </div>
  );
}

/**
 * The add/edit goal dialog on its own, so other pages (Home, Planning) can edit a goal in
 * place without navigating to Savings.
 */
export function GoalSheet({
  draft,
  onChange,
  onClose,
  onSave,
  onRemove,
}: {
  draft: Draft | null;
  onChange: (d: Draft) => void;
  onClose: () => void;
  onSave: () => void;
  onRemove?: () => void;
}) {
  const plan = usePlan();
  const currency = useCurrency();
  const t = useT().goals.sheet;
  return (
    <Sheet
      open={draft !== null}
      onClose={onClose}
      title={draft?.id ? t.editGoal : t.newGoal}
      footer={
        <div className="flex items-center justify-between gap-2">
          {draft?.id && onRemove ? (
            <Button variant="danger" onClick={onRemove}>
              {t.remove}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              {t.cancel}
            </Button>
            <Button onClick={onSave} disabled={!draft?.name.trim()}>
              {draft?.id ? t.save : t.addGoal}
            </Button>
          </div>
        </div>
      }
    >
      {draft && (
          <div className="space-y-4">
            <SelectField
              label={t.type}
              value={draft.kind}
              onValueChange={(kind: GoalKind) => {
                const meta = goalKindMeta(kind);
                onChange({
                  ...draft,
                  kind,
                  purpose: meta.purpose,
                  name: draft.id || draft.name ? draft.name : blankGoal(kind).name,
                  icon: draft.id ? draft.icon : blankGoal(kind).icon,
                });
              }}
              options={GOAL_KINDS.map((k) => ({ value: k.id, label: k.label }))}
            />
            <TextField
              label={t.name}
              placeholder={t.namePlaceholder}
              value={draft.name}
              onChange={(e) => onChange({ ...draft, name: e.target.value })}
              autoFocus={!draft.id}
            />
            <TextField
              label={t.description}
              hint={t.optional}
              placeholder={t.descriptionPlaceholder}
              value={draft.description ?? ''}
              onChange={(e) => onChange({ ...draft, description: e.target.value })}
            />
            <div>
              <div className="mb-1 text-[12.5px] font-medium text-ink-soft">{t.purpose}</div>
              <TogglePill
                size="md"
                value={draft.purpose}
                onChange={(purpose: SavingsPurpose) => onChange({ ...draft, purpose })}
                options={[
                  { value: 'future_spending', label: t.plannedFutureSpending },
                  { value: 'long_term', label: t.longTermWealth },
                ]}
              />
              <p className="mt-1 text-[12px] text-muted">
                {t.purposeHint}
              </p>
            </div>
            <div>
              <div className="mb-1.5 text-[12.5px] font-medium text-ink-soft">{t.icon}</div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(GOAL_ICONS).map(([key, picture]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onChange({ ...draft, icon: key })}
                    className={clsx(
                      'rounded-xl border p-0.5 transition',
                      draft.icon === key ? 'border-brand-500' : 'border-transparent hover:border-line-strong',
                    )}
                  >
                    <IconTile icon={picture} accent={goalAccent(key)} size="sm" />
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <MoneyField
                label={t.savedSoFar}
                currency={currency}
                value={draft.currentAmount}
                onValueChange={(currentAmount) => onChange({ ...draft, currentAmount })}
              />
              <MoneyField
                label={t.monthlyContribution}
                currency={currency}
                value={draft.monthlyContribution}
                onValueChange={(monthlyContribution) => onChange({ ...draft, monthlyContribution })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <MoneyField
                label={t.targetAmount}
                hint={t.optional}
                currency={currency}
                value={draft.targetAmount ?? 0}
                onValueChange={(v) => onChange({ ...draft, targetAmount: v > 0 ? v : undefined })}
              />
              <DateField
                label={t.targetDate}
                hint={t.optional}
                value={draft.targetDate ?? ''}
                onChange={(e) => onChange({ ...draft, targetDate: e.target.value || undefined })}
              />
            </div>
            {plan.accounts.length > 0 && (
              <SelectField
                label={t.linkedAccount}
                hint={t.optional}
                value={draft.linkedAccountId ?? ''}
                onValueChange={(v) => onChange({ ...draft, linkedAccountId: v || undefined })}
                options={[{ value: '', label: t.none }, ...plan.accounts.map((a) => ({ value: a.id, label: a.name }))]}
              />
            )}
          </div>
      )}
    </Sheet>
  );
}

/**
 * Goal editing state plus the rendered sheet, for pages that show goals but are not the
 * Savings page. Render `sheet` once anywhere in the page.
 */
export function useGoalSheet() {
  const plan = usePlan();
  const { addGoal, updateGoal, removeGoal } = usePlanStore();
  const [draft, setDraft] = useState<Draft | null>(null);
  const openEdit = (id: string) => {
    const g = plan.goals.find((x) => x.id === id);
    if (g) setDraft({ ...g });
  };
  const openNew = (kind?: GoalKind) => setDraft(blankGoal(kind));
  const close = () => setDraft(null);
  const save = () => {
    if (!draft) return;
    if (draft.id) {
      const { id, ...patch } = draft;
      updateGoal(id, patch);
    } else addGoal(draft);
    setDraft(null);
  };
  const remove = () => {
    if (draft?.id) removeGoal(draft.id);
    setDraft(null);
  };
  const sheet = <GoalSheet draft={draft} onChange={setDraft} onClose={close} onSave={save} onRemove={remove} />;
  return { draft, openEdit, openNew, close, sheet };
}
