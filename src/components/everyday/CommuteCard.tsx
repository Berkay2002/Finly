import { Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  cardBreakEvenDays,
  COMMUTE_LINES,
  commuteChanges,
  commuteCounts,
  commuteMonthly,
  commutePrices,
  newCommuter,
} from '@/engine/commute';
import { formatAmount, formatMoney } from '@/engine/format';
import { occurrencesPerMonth } from '@/engine/frequency';
import type { Commute, CommuteMode, CommutePrice, Commuter } from '@/engine/types';
import { newId } from '@/lib/id';
import { usePlanStore } from '@/store/planStore';
import { useCurrency, usePlan } from '@/store/selectors';
import { Button, IconButton } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { CountField, MoneyField, SegmentedControl, Switch, TextField, TogglePill } from '@/components/ui/fields';
import { IconTile } from '@/components/ui/IconTile';
import { Sheet } from '@/components/ui/Sheet';

const MODE_LABELS: Record<CommuteMode, string> = { public: 'Public transport', car: 'Car', active: 'Walk or bike' };

function describe(p: Commuter): string {
  const days = `${formatAmount(p.days)} day${p.days === 1 ? '' : 's'} a week`;
  const how =
    p.mode === 'public'
      ? p.ticket === 'single'
        ? 'single tickets'
        : 'period card'
      : p.mode === 'car'
        ? ['car', p.parking && 'paid parking', (p.passages ?? 0) > 0 && 'congestion charges'].filter(Boolean).join(', ')
        : 'walks or bikes';
  return `${days} · ${how}${p.buysLunch ? ' · buys lunch' : ''}`;
}

/**
 * How the household gets to work or school. One answer sets lunches, tickets or cards, parking and
 * congestion charges, so they cannot disagree with each other. Shown on the Transport page.
 */
export function CommuteCard() {
  const plan = usePlan();
  const currency = useCurrency();
  const [open, setOpen] = useState(false);
  const money = (n: number) => formatMoney(n, currency);
  const commute = plan.commute;
  const counts = commuteCounts(commute);
  const monthly = commuteMonthly(commute, commutePrices(plan));
  const daysPerMonth = occurrencesPerMonth({ times: counts.daysIn, per: 'week' });

  return (
    <Card>
      <CardHeader
        icon={<IconTile icon="nav-transport" accent="orange" size="sm" />}
        title="Commute"
        subtitle={
          commute
            ? 'Sets your lunches, tickets and parking from the days you travel in.'
            : 'Tell us how many days you travel in and how. Lunches, tickets and parking follow from that.'
        }
      />
      {commute && (
        <>
          <ul className="space-y-1.5 text-[13px]">
            {commute.people.map((p) => (
              <li key={p.id} className="flex gap-2">
                <span className="font-medium text-ink">{p.name || 'Someone'}</span>
                <span className="min-w-0 text-muted">{describe(p)}</span>
              </li>
            ))}
          </ul>
          {monthly > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-page px-2.5 py-2">
                <div className="text-[11.5px] text-muted">Per month</div>
                <div className="tabular whitespace-nowrap text-[14px] font-semibold text-ink">{money(monthly)}</div>
              </div>
              {daysPerMonth > 0 && (
                <div className="rounded-xl bg-page px-2.5 py-2">
                  <div className="text-[11.5px] text-muted">Per day in</div>
                  <div className="tabular whitespace-nowrap text-[14px] font-semibold text-ink">{money(monthly / daysPerMonth)}</div>
                </div>
              )}
            </div>
          )}
        </>
      )}
      <div className={clsx('flex justify-end', commute && 'mt-3')}>
        <Button size="sm" variant={commute ? 'secondary' : 'primary'} onClick={() => setOpen(true)}>
          {commute ? 'Edit commute' : 'Set up your commute'}
        </Button>
      </div>
      {open && <CommuteSheet onClose={() => setOpen(false)} />}
    </Card>
  );
}

function CommuteSheet({ onClose }: { onClose: () => void }) {
  const plan = usePlan();
  const currency = useCurrency();
  const setCommute = usePlanStore((s) => s.setCommute);
  const money = (n: number) => formatMoney(n, currency);
  const [people, setPeople] = useState<Commuter[]>(() => plan.commute?.people ?? [newCommuter(newId('cm'), 0)]);
  const [prices, setPrices] = useState<Record<CommutePrice, number>>(() => commutePrices(plan));
  const [keep, setKeep] = useState<Set<CommutePrice>>(new Set());

  const next: Commute = { people };
  const counts = commuteCounts(next);
  const changes = useMemo(() => commuteChanges(plan, { people }, prices), [plan, people, prices]);
  const hasPublic = people.some((p) => p.mode === 'public' && p.days > 0);
  const priceLines = COMMUTE_LINES.filter((l) => l.count(counts) > 0 || (hasPublic && (l.key === 'ticket' || l.key === 'card')));
  const breakEven = cardBreakEvenDays(prices.ticket, prices.card);

  const update = (id: string, patch: Partial<Commuter>) => setPeople((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  return (
    <Sheet
      open
      onClose={onClose}
      title="Your commute"
      subtitle="Days in and how you travel. The items on this page and Work lunches are set from it."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setCommute(next, prices, keep);
              onClose();
            }}
          >
            Save commute
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <ul className="space-y-3">
          {people.map((p, i) => (
            <li key={p.id} className="rounded-xl border border-line bg-page/40 p-3">
              <div className="flex items-end gap-2">
                <TextField label="Who" value={p.name} onChange={(e) => update(p.id, { name: e.target.value })} className="min-w-0 flex-1" />
                <CountField label="Days a week" value={p.days} onValueChange={(days) => update(p.id, { days: Math.min(7, days) })} className="w-28" />
                <IconButton icon={X} label="Remove person" onClick={() => setPeople((ps) => ps.filter((x) => x.id !== p.id))} disabled={people.length <= 1 && i === 0 && !plan.commute} />
              </div>
              <SegmentedControl<CommuteMode>
                className="mt-3"
                value={p.mode}
                onChange={(mode) => update(p.id, { mode, ticket: mode === 'public' ? (p.ticket ?? 'card') : p.ticket })}
                options={(Object.keys(MODE_LABELS) as CommuteMode[]).map((m) => ({ value: m, label: MODE_LABELS[m] }))}
              />
              <div className="mt-3 space-y-2.5">
                {p.mode === 'public' && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[13.5px] font-medium text-ink">Ticket</span>
                    <TogglePill
                      size="md"
                      value={p.ticket ?? 'card'}
                      onChange={(ticket) => update(p.id, { ticket })}
                      options={[
                        { value: 'card', label: 'Period card' },
                        { value: 'single', label: 'Single tickets' },
                      ]}
                    />
                  </div>
                )}
                {p.mode === 'car' && (
                  <>
                    <Switch checked={!!p.parking} onChange={(parking) => update(p.id, { parking })} label="Pays for parking" description="On the days in" />
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block text-[13.5px] font-medium text-ink">Congestion-charge passages</span>
                        <span className="block text-[12px] text-muted">A day, in and out. Stockholm and Göteborg only.</span>
                      </span>
                      <CountField value={p.passages ?? 0} onValueChange={(passages) => update(p.id, { passages })} className="w-20" aria-label="Passages a day" />
                    </div>
                  </>
                )}
                <Switch checked={p.buysLunch} onChange={(buysLunch) => update(p.id, { buysLunch })} label="Buys lunch" description="Rather than bringing it from home" />
              </div>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setPeople((ps) => [...ps, newCommuter(newId('cm'), ps.length)])}
          className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brand-700 hover:underline"
        >
          <Plus size={13} /> Add a person
        </button>

        {priceLines.length > 0 && (
          <div>
            <div className="mb-1 text-[12.5px] font-medium text-ink-soft">What one of each costs</div>
            <div className="grid grid-cols-2 gap-3">
              {priceLines.map((l) => (
                <MoneyField
                  key={l.key}
                  label={l.priceLabel}
                  currency={currency}
                  value={prices[l.key]}
                  onValueChange={(v) => setPrices((ps) => ({ ...ps, [l.key]: v }))}
                />
              ))}
            </div>
            {hasPublic && breakEven !== null && (
              <p className="tabular mt-2 text-[12px] text-muted">
                {breakEven >= 7
                  ? 'At these prices single tickets are cheaper than a card even travelling every day.'
                  : `A period card pays off from ${formatAmount(Math.round(breakEven * 10) / 10)} days a week.`}
                {people
                  .filter((p) => p.mode === 'public' && p.days > 0)
                  .map((p) => {
                    const singles = prices.ticket * occurrencesPerMonth({ times: 2 * p.days, per: 'week' });
                    const onCard = (p.ticket ?? 'card') === 'card';
                    const saving = onCard ? prices.card - singles : singles - prices.card;
                    return saving > 0
                      ? ` ${p.name || 'Someone'} would save ${money(saving)} a month with ${onCard ? 'single tickets' : 'a card'}.`
                      : '';
                  })
                  .join('')}
              </p>
            )}
          </div>
        )}

        {changes.length > 0 && (
          <div className="rounded-xl border border-line bg-page/60 p-3">
            <div className="mb-1.5 text-[12.5px] font-medium text-ink-soft">What saving does</div>
            <ul className="divide-y divide-line text-[12.5px]">
              {changes.map((c) => (
                <li key={c.key} className="flex items-center gap-3 py-1.5">
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-ink">{c.name}</span>
                    <span className="tabular ml-1.5 text-muted">
                      {c.kind === 'remove'
                        ? 'no longer part of the commute'
                        : `${c.price > 0 ? money(c.price) : 'price not set'} × ${formatAmount(Math.round(c.count * 10) / 10)} a ${c.per}`}
                    </span>
                  </div>
                  {c.kind === 'remove' ? (
                    <TogglePill
                      value={keep.has(c.key) ? 'keep' : 'remove'}
                      onChange={(v) =>
                        setKeep((k) => {
                          const n = new Set(k);
                          if (v === 'keep') n.add(c.key);
                          else n.delete(c.key);
                          return n;
                        })
                      }
                      options={[
                        { value: 'remove', label: 'Remove' },
                        { value: 'keep', label: 'Keep' },
                      ]}
                    />
                  ) : (
                    <span className="tabular shrink-0 text-right text-ink">
                      {c.monthly > 0 ? `≈ ${money(c.monthly)}/mo` : '–'}
                      {c.kind === 'add' && <span className="ml-1 text-[11px] text-positive">new</span>}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Sheet>
  );
}
