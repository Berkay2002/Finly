import { Plus, X } from 'lucide-react';
import clsx from 'clsx';
import { formatMoney } from '@/engine/format';
import { useT } from '@/i18n';
import { tabOf, useDraftStore, type AffordTab, type DraftValues } from '@/store/draftStore';
import { usePlanStore } from '@/store/planStore';
import { useCurrency, usePlan } from '@/store/selectors';
import { Icon } from '@/components/ui/Icon';
import type { PictureName } from '@/components/ui/pictures';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/fields';

// ponytail: phone borrows the laptop picture until goal-phone.png exists (docs/icon-prompts.md).
export const TOOL_ICONS: Record<AffordTab, PictureName> = {
  car: 'goal-car',
  home: 'goal-home',
  computer: 'goal-laptop',
  phone: 'goal-laptop',
  trip: 'goal-plane',
  other: 'goal-gift',
  monthly: 'stat-cost',
};

const same = (a: DraftValues | undefined, b: DraftValues | undefined) => JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});

/** Saved "Can I afford this?" scenarios, one tap to reopen; they live in the plan, so they sync. */
export function SavedList() {
  const scenarios = usePlan().scenarios ?? [];
  const tab = useDraftStore(tabOf);
  const openIds = useDraftStore((s) => s.openIds);
  const open = useDraftStore((s) => s.open);
  const remove = usePlanStore((s) => s.removeScenario);
  const a = useT().planning.afford;
  if (!scenarios.length) return null;

  // Opening replaces what is typed into that tool, so ask first when that has not been saved.
  const unsaved = (target: string) => {
    const { drafts, openIds } = useDraftStore.getState();
    const from = scenarios.find((x) => x.id === openIds[target as AffordTab]);
    return !same(drafts[target as AffordTab], from?.values);
  };

  return (
    <div className="mb-3">
      <div className="mb-2 text-[12.5px] font-medium text-ink-soft">{a.saved}</div>
      <div className="flex flex-wrap gap-2">
        {scenarios.map((x) => {
          const active = tab === x.tool && openIds[tab] === x.id;
          return (
            <span
              key={x.id}
              className={clsx(
                'inline-flex items-center rounded-full border text-[12.5px] font-medium transition',
                active ? 'border-brand-200 bg-brand-50 text-ink' : 'border-line text-muted hover:text-ink',
              )}
            >
              <button
                type="button"
                aria-pressed={active}
                className="inline-flex items-center gap-1.5 py-1 pl-1.5 pr-1"
                onClick={() => {
                  if (active || (unsaved(x.tool) && !window.confirm(a.discardChanges))) return;
                  open(x.tool as AffordTab, x.values, x.id);
                }}
              >
                <Icon icon={TOOL_ICONS[x.tool as AffordTab] ?? 'goal-target'} size={22} />
                {x.name}
              </button>
              <button
                type="button"
                aria-label={a.removeLabel(x.name)}
                className="mr-1 rounded-full p-1 text-muted hover:bg-page hover:text-ink"
                onClick={() => window.confirm(a.removeScenario(x.name)) && remove(x.id)}
              >
                <X size={13} />
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** Name, save and start over, for the tool on screen. */
export function SaveBar() {
  const tab = useDraftStore(tabOf);
  const values = useDraftStore((s) => s.drafts[tab]);
  const openId = useDraftStore((s) => s.openIds[tab]);
  const { open, clear, setValue } = useDraftStore.getState();
  const save = usePlanStore((s) => s.saveScenario);
  const scenarios = usePlan().scenarios ?? [];
  const currency = useCurrency();
  const a = useT().planning.afford;

  const current = scenarios.find((x) => x.id === openId);
  const unsaved = !same(values, current?.values);
  const typed = String(values?._name ?? '');
  const price = Number(values?.priceFrom ?? values?.amount ?? 0);
  const auto = [String(values?.name || (tab === 'monthly' ? a.modeMonthly : a.kinds[tab])), price > 0 && formatMoney(price, currency)].filter(Boolean).join(' · ');

  const store = (id?: string) => {
    const v = values ?? {};
    open(tab, v, save({ id, tool: tab, name: typed.trim() || auto, values: v, savedAt: new Date().toISOString() }));
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-line p-2">
      <TextField
        aria-label={a.scenarioName}
        placeholder={auto}
        value={typed}
        onChange={(e) => setValue(tab, '_name', e.target.value)}
        className="min-w-[10rem] flex-1"
        inputClassName="h-8"
      />
      {current && unsaved && <span className="text-[12px] text-muted">{a.unsaved}</span>}
      <Button size="sm" variant="soft" disabled={!unsaved || !values} onClick={() => store(current?.id)}>
        {current ? a.saveChanges : a.save}
      </Button>
      {current && (
        <Button size="sm" variant="secondary" onClick={() => store()}>
          {a.saveAsNew}
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        icon={Plus}
        disabled={!values && !openId}
        onClick={() => (!unsaved || window.confirm(a.discardChanges)) && clear(tab)}
      >
        {a.newScenario}
      </Button>
    </div>
  );
}
