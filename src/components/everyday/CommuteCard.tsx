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
  commuterName,
  newCommuter,
} from '@/engine/commute';
import { formatAmount, formatMoney } from '@/engine/format';
import { occurrencesPerMonth } from '@/engine/frequency';
import { expenseName } from '@/engine/taxonomy';
import type { Commute, CommuteMode, CommutePrice, Commuter } from '@/engine/types';
import { messages, useT } from '@/i18n';
import { newId } from '@/lib/id';
import { usePlanStore } from '@/store/planStore';
import { useCurrency, usePlan } from '@/store/selectors';
import { Button, IconButton } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { CountField, MoneyField, SegmentedControl, Switch, TextField, TogglePill } from '@/components/ui/fields';
import { IconTile } from '@/components/ui/IconTile';
import { Sheet } from '@/components/ui/Sheet';

const MODES: CommuteMode[] = ['public', 'car', 'active'];

function describe(p: Commuter): string {
  const t = messages().everyday.commute.describe;
  const days = t.days(formatAmount(p.days), p.days);
  const how =
    p.mode === 'public'
      ? p.ticket === 'single'
        ? t.singleTickets
        : t.periodCard
      : p.mode === 'car'
        ? [t.car, p.parking && t.paidParking, (p.passages ?? 0) > 0 && t.congestionCharges].filter(Boolean).join(', ')
        : t.walksOrBikes;
  return `${days} · ${how}${p.buysLunch ? ` · ${t.buysLunch}` : ''}`;
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
  const tc = useT().everyday.commute;
  const t = tc.card;

  return (
    <Card>
      <CardHeader
        icon={<IconTile icon="nav-transport" accent="orange" size="sm" />}
        title={t.title}
        subtitle={
          commute
            ? t.subtitleSet
            : t.subtitleEmpty
        }
      />
      {commute && (
        <>
          <ul className="space-y-1.5 text-[13px]">
            {commute.people.map((p) => (
              <li key={p.id} className="flex gap-2">
                <span className="font-medium text-ink">{commuterName(p.name) || tc.someone}</span>
                <span className="min-w-0 text-muted">{describe(p)}</span>
              </li>
            ))}
          </ul>
          {monthly > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-page px-2.5 py-2">
                <div className="text-[11.5px] text-muted">{t.perMonth}</div>
                <div className="tabular whitespace-nowrap text-[14px] font-semibold text-ink">{money(monthly)}</div>
              </div>
              {daysPerMonth > 0 && (
                <div className="rounded-xl bg-page px-2.5 py-2">
                  <div className="text-[11.5px] text-muted">{t.perDayIn}</div>
                  <div className="tabular whitespace-nowrap text-[14px] font-semibold text-ink">{money(monthly / daysPerMonth)}</div>
                </div>
              )}
            </div>
          )}
        </>
      )}
      <div className={clsx('flex justify-end', commute && 'mt-3')}>
        <Button size="sm" variant={commute ? 'secondary' : 'primary'} onClick={() => setOpen(true)}>
          {commute ? t.edit : t.setUp}
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
  const t = useT().everyday.commute;
  const ts = t.sheet;
  const [people, setPeople] = useState<Commuter[]>(
    () => plan.commute?.people.map((p) => ({ ...p, name: commuterName(p.name) })) ?? [newCommuter(newId('cm'), 0)],
  );
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
      title={ts.title}
      subtitle={ts.subtitle}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {ts.cancel}
          </Button>
          <Button
            onClick={() => {
              setCommute(next, prices, keep);
              onClose();
            }}
          >
            {ts.save}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <ul className="space-y-3">
          {people.map((p, i) => (
            <li key={p.id} className="rounded-xl border border-line bg-page/40 p-3">
              <div className="flex items-end gap-2">
                <TextField label={ts.who} value={p.name} onChange={(e) => update(p.id, { name: e.target.value })} className="min-w-0 flex-1" />
                <CountField label={ts.daysAWeek} value={p.days} onValueChange={(days) => update(p.id, { days: Math.min(7, days) })} className="w-28" />
                <IconButton icon={X} label={ts.removePerson} onClick={() => setPeople((ps) => ps.filter((x) => x.id !== p.id))} disabled={people.length <= 1 && i === 0 && !plan.commute} />
              </div>
              <SegmentedControl<CommuteMode>
                className="mt-3"
                value={p.mode}
                onChange={(mode) => update(p.id, { mode, ticket: mode === 'public' ? (p.ticket ?? 'card') : p.ticket })}
                options={MODES.map((m) => ({ value: m, label: t.modes[m] }))}
              />
              <div className="mt-3 space-y-2.5">
                {p.mode === 'public' && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[13.5px] font-medium text-ink">{ts.ticket}</span>
                    <TogglePill
                      size="md"
                      value={p.ticket ?? 'card'}
                      onChange={(ticket) => update(p.id, { ticket })}
                      options={[
                        { value: 'card', label: ts.periodCard },
                        { value: 'single', label: ts.singleTickets },
                      ]}
                    />
                  </div>
                )}
                {p.mode === 'car' && (
                  <>
                    <Switch checked={!!p.parking} onChange={(parking) => update(p.id, { parking })} label={ts.paysForParking} description={ts.paysForParkingHint} />
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block text-[13.5px] font-medium text-ink">{ts.passages}</span>
                        <span className="block text-[12px] text-muted">{ts.passagesHint}</span>
                      </span>
                      <CountField value={p.passages ?? 0} onValueChange={(passages) => update(p.id, { passages })} className="w-20" aria-label={ts.passagesAria} />
                    </div>
                  </>
                )}
                <Switch checked={p.buysLunch} onChange={(buysLunch) => update(p.id, { buysLunch })} label={ts.buysLunch} description={ts.buysLunchHint} />
              </div>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setPeople((ps) => [...ps, newCommuter(newId('cm'), ps.length)])}
          className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brand-700 hover:underline"
        >
          <Plus size={13} /> {ts.addPerson}
        </button>

        {priceLines.length > 0 && (
          <div>
            <div className="mb-1 text-[12.5px] font-medium text-ink-soft">{ts.pricesTitle}</div>
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
                  ? ts.singlesCheaper
                  : ts.cardPaysOff(formatAmount(Math.round(breakEven * 10) / 10), Math.round(Math.round(breakEven * 10) / 10))}
                {people
                  .filter((p) => p.mode === 'public' && p.days > 0)
                  .map((p) => {
                    const singles = prices.ticket * occurrencesPerMonth({ times: 2 * p.days, per: 'week' });
                    const onCard = (p.ticket ?? 'card') === 'card';
                    const saving = onCard ? prices.card - singles : singles - prices.card;
                    return saving > 0
                      ? ` ${onCard ? ts.saveWithSingles(p.name || t.someone, money(saving)) : ts.saveWithCard(p.name || t.someone, money(saving))}`
                      : '';
                  })
                  .join('')}
              </p>
            )}
          </div>
        )}

        {changes.length > 0 && (
          <div className="rounded-xl border border-line bg-page/60 p-3">
            <div className="mb-1.5 text-[12.5px] font-medium text-ink-soft">{ts.changesTitle}</div>
            <ul className="divide-y divide-line text-[12.5px]">
              {changes.map((c) => (
                <li key={c.key} className="flex items-center gap-3 py-1.5">
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-ink">{expenseName({ name: c.name, subcategory: c.slug })}</span>
                    <span className="tabular ml-1.5 text-muted">
                      {c.kind === 'remove'
                        ? ts.noLongerPart
                        : ts.changeLine(c.price > 0 ? money(c.price) : ts.priceNotSet, formatAmount(Math.round(c.count * 10) / 10), c.per)}
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
                        { value: 'remove', label: ts.remove },
                        { value: 'keep', label: ts.keep },
                      ]}
                    />
                  ) : (
                    <span className="tabular shrink-0 text-right text-ink">
                      {c.monthly > 0 ? ts.perMonthShort(money(c.monthly)) : '–'}
                      {c.kind === 'add' && <span className="ml-1 text-[11px] text-positive">{ts.new}</span>}
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
