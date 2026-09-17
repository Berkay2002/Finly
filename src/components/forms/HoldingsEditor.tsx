import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { formatMoney, formatNumber } from '@/engine/format';
import { holdingValue } from '@/engine/holdings';
import type { Holding } from '@/engine/types';
import { useT } from '@/i18n';
import { newId } from '@/lib/id';
import { fetchQuotes, quoteQuery, searchInstruments, type Instrument } from '@/lib/quotes';
import { Button, IconButton } from '@/components/ui/Button';
import { DeltaBadge, change } from '@/components/ui/Delta';
import { Label, MoneyField, TextField } from '@/components/ui/fields';

/**
 * Cash and holdings of an ISK, KF or AF account. A holding is picked from an Avanza search, then given
 * a quantity and average price; its price is fetched right away so the total shows before saving.
 */
export function HoldingsEditor({
  holdings,
  cash,
  currency,
  onChange,
}: {
  holdings: Holding[];
  cash: number;
  currency: string;
  onChange: (patch: { holdings?: Holding[]; cash?: number }) => void;
}) {
  const t = useT().accounts.editor;
  const [open, setOpen] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const update = (id: string, patch: Partial<Holding>) =>
    onChange({ holdings: holdings.map((h) => (h.id === id ? { ...h, ...patch } : h)) });

  // The price is fetched before the holding is added, so a foreign one has its exchange rate from the start.
  const pick = async (found: Instrument) => {
    const result = await fetchQuotes(quoteQuery([{ orderbookId: found.orderbookId, currency: found.currency }], currency));
    const q = result?.quotes[found.orderbookId];
    const holding: Holding = {
      id: newId('hld'),
      orderbookId: found.orderbookId,
      isin: q?.isin,
      name: found.name,
      type: found.type,
      currency: found.currency,
      quantity: 0,
      avgPrice: 0,
      price: q?.price ?? found.price,
      fx: result?.fx[found.currency] ?? (found.currency === currency ? 1 : undefined),
    };
    setSearching(false);
    setOpen(holding.id);
    onChange({ holdings: [...holdings, holding], cash });
  };

  return (
    <div className="space-y-3">
      {holdings.length > 0 && (
        <MoneyField label={t.cash} hint={t.cashHint} currency={currency} value={cash} onValueChange={(v) => onChange({ cash: v })} />
      )}
      <div className="space-y-2">
        <Label hint={holdings.length > 0 ? t.holdingCount(holdings.length) : undefined}>{t.holdings}</Label>
        {holdings.map((h) => {
          const gain = h.price !== undefined ? change(h.avgPrice, h.price) : null;
          return (
            <div key={h.id} className="rounded-xl border border-line bg-card">
              <button
                type="button"
                onClick={() => setOpen(open === h.id ? null : h.id)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-ink">{h.name}</span>
                  <span className="block text-[11.5px] text-muted">
                    {t.holdingTypes[h.type]} · {formatNumber(h.quantity, 4)} × {formatNumber(h.price ?? h.avgPrice, 2)} {h.currency}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="tabular block text-[13px] font-medium text-ink">{formatMoney(holdingValue(h), currency)}</span>
                  {gain !== null && <DeltaBadge c={gain} className="text-[11.5px]" />}
                </span>
              </button>
              {open === h.id && (
                <div className="flex items-end gap-2 border-t border-line px-3 py-2.5">
                  <MoneyField
                    size="sm"
                    label={t.quantity}
                    currency=""
                    value={h.quantity}
                    onValueChange={(quantity) => update(h.id, { quantity })}
                    className="min-w-0 flex-1"
                  />
                  <MoneyField
                    size="sm"
                    label={t.avgPrice}
                    hint={t.avgPriceHint(h.currency)}
                    currency={h.currency}
                    value={h.avgPrice}
                    onValueChange={(avgPrice) => update(h.id, { avgPrice })}
                    className="min-w-0 flex-1"
                  />
                  <IconButton
                    icon={Trash2}
                    size={16}
                    label={t.removeHolding}
                    onClick={() => onChange({ holdings: holdings.filter((x) => x.id !== h.id) })}
                  />
                </div>
              )}
            </div>
          );
        })}
        {searching ? (
          <InstrumentSearch onPick={pick} />
        ) : (
          <Button variant="secondary" size="sm" icon={Plus} onClick={() => setSearching(true)}>
            {t.addHolding}
          </Button>
        )}
        <p className="text-[11.5px] text-faint">{t.holdingsHint}</p>
      </div>
    </div>
  );
}

function InstrumentSearch({ onPick }: { onPick: (found: Instrument) => void }) {
  const t = useT().accounts.editor;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Instrument[] | null | undefined>(undefined);

  useEffect(() => {
    if (query.trim().length < 2) return setResults(undefined);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const found = await searchInstruments(query, controller.signal);
      if (!controller.signal.aborted) setResults(found);
    }, 300);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className="space-y-1.5">
      <TextField autoFocus type="search" placeholder={t.searchPlaceholder} value={query} onChange={(e) => setQuery(e.target.value)} />
      {results === null && <p className="text-[12px] text-muted">{t.searchUnavailable}</p>}
      {results?.length === 0 && <p className="text-[12px] text-muted">{t.noMatches}</p>}
      {results && results.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
          {results.map((r) => (
            <li key={r.orderbookId}>
              <button
                type="button"
                onClick={() => onPick(r)}
                className={clsx('flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-page')}
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-ink">{r.name}</span>
                  <span className="block text-[11.5px] text-muted">{t.holdingTypes[r.type]}</span>
                </span>
                {r.price !== undefined && (
                  <span className="tabular shrink-0 text-[12.5px] text-ink-soft">
                    {formatNumber(r.price, 2)} {r.currency}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
