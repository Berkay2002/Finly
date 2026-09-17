import clsx from 'clsx';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatMoney, formatNumber, formatPercent } from '@/engine/format';
import { applyTrade, holdingsGain, holdingValue, tickerOf, type Trade } from '@/engine/holdings';
import { CAPITAL_TAX_RATE, wrapperOf } from '@/engine/tax/capital';
import type { AccountKind, Holding } from '@/engine/types';
import { useT } from '@/i18n';
import { logoDevEnabled } from '@/lib/brandLogo';
import { newId } from '@/lib/id';
import { fetchQuotes, quoteQuery, searchInstruments, type Instrument } from '@/lib/quotes';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { Button, IconButton } from '@/components/ui/Button';
import { IconTile } from '@/components/ui/IconTile';
import { MoneyField, SegmentedControl, Switch, TextField } from '@/components/ui/fields';

const signedPercent = (c: number, digits = 1) => `${c >= 0 ? '+' : '-'}${formatPercent(Math.abs(c), digits)}`;

/**
 * Cash and holdings of an ISK, KF or AF account, edited in place on the account's page. A holding is
 * picked from a search, then given a quantity and average price. Tap a holding to correct it, buy more
 * or sell some.
 */
export function HoldingsEditor({
  kind,
  holdings,
  cash,
  currency,
  onChange,
}: {
  kind: AccountKind;
  holdings: Holding[];
  cash: number;
  currency: string;
  onChange: (patch: { holdings: Holding[]; cash: number }) => void;
}) {
  const t = useT().accounts.editor;
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState<'search' | Holding | null>(null);
  const [mode, setMode] = useState<'edit' | Trade['side']>('edit');
  // Largest first, but frozen while a holding is open so it does not jump away as it is edited.
  const [order, setOrder] = useState<string[]>([]);
  const byValue = [...holdings].sort((a, b) => holdingValue(b) - holdingValue(a));
  const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : Infinity);
  const rows = open ? [...holdings].sort((a, b) => rank(a.id) - rank(b.id)) : byValue;

  const update = (id: string, patch: Partial<Holding>) =>
    onChange({ holdings: holdings.map((h) => (h.id === id ? { ...h, ...patch } : h)), cash });

  return (
    <div className="space-y-2">
      {holdings.length === 0 && !adding && <p className="text-[13px] text-muted">{t.noHoldings}</p>}
      {rows.map((h) => {
        const gain = holdingsGain([h]);
        // What would round to "0 %" says nothing, like a market that has not opened yet.
        const today = h.dayChange !== undefined && Math.abs(h.dayChange) >= 0.0005 ? h.dayChange : undefined;
        return (
          <div key={h.id} className="rounded-xl border border-line bg-card">
            <button
              type="button"
              aria-expanded={open === h.id}
              onClick={() => {
                setOrder(byValue.map((x) => x.id));
                setOpen(open === h.id ? null : h.id);
                setMode('edit');
              }}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
            >
              <HoldingMark holding={h} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium text-ink">{h.name}</span>
                <span className="block text-[11.5px] text-muted">
                  {t.units(formatNumber(h.quantity, 4))}
                  {/* Phones keep to quantity and today's move; the prices are one tap away. */}
                  <span className="hidden sm:inline">
                    {h.avgPrice > 0 && ` · ${t.avgShort} ${formatNumber(h.avgPrice, 2)}`}
                    {` · ${formatNumber(h.price ?? h.avgPrice, 2)} ${h.currency}`}
                  </span>
                  {today !== undefined && (
                    <>
                      {' · '}
                      <span className={today >= 0 ? 'text-positive' : 'text-negative'}>{t.today(signedPercent(today))}</span>
                    </>
                  )}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="tabular block text-[13.5px] font-medium text-ink">{formatMoney(holdingValue(h), currency)}</span>
                {gain && Math.round(gain.amount) !== 0 && (
                  <span className={clsx('tabular block text-[11.5px] font-medium', gain.amount >= 0 ? 'text-positive' : 'text-negative')}>
                    {formatMoney(gain.amount, currency, { sign: true })} ({signedPercent(gain.share, 0)})
                  </span>
                )}
              </span>
            </button>
            {open === h.id && (
              <div className="space-y-3 border-t border-line px-3 py-3">
                <SegmentedControl
                  value={mode}
                  onChange={setMode}
                  className="sm:max-w-xs"
                  options={[
                    { value: 'edit', label: t.editHolding },
                    { value: 'buy', label: t.buyMore },
                    { value: 'sell', label: t.sell },
                  ]}
                />
                {mode === 'edit' ? (
                  <div className="flex items-end gap-2">
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
                      currency={h.currency}
                      value={h.avgPrice}
                      onValueChange={(avgPrice) => update(h.id, { avgPrice })}
                      className="min-w-0 flex-1"
                    />
                    <IconButton
                      icon={Trash2}
                      size={16}
                      label={t.removeHolding}
                      onClick={() => onChange({ holdings: holdings.filter((x) => x.id !== h.id), cash })}
                    />
                  </div>
                ) : (
                  <TradeForm
                    key={mode}
                    holding={h}
                    side={mode}
                    currency={currency}
                    taxedOnSale={wrapperOf(kind) === 'af'}
                    onConfirm={(trade) => {
                      const next = applyTrade({ holdings, cash }, h.id, trade);
                      onChange({ holdings: next.holdings, cash: next.cash });
                      setMode('edit');
                      if (!next.holdings.some((x) => x.id === h.id)) setOpen(null);
                    }}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
      {adding === 'search' ? (
        <InstrumentSearch currency={currency} onPick={setAdding} onCancel={() => setAdding(null)} />
      ) : adding ? (
        <AddHolding
          draft={adding}
          onCancel={() => setAdding('search')}
          onAdd={(holding) => {
            setAdding(null);
            onChange({ holdings: [...holdings, holding], cash });
          }}
        />
      ) : (
        <Button variant="secondary" size="sm" icon={Plus} onClick={() => setAdding('search')}>
          {t.addHolding}
        </Button>
      )}
      {holdings.length > 0 && (
        <MoneyField
          label={t.cash}
          hint={t.cashHint}
          currency={currency}
          value={cash}
          onValueChange={(v) => onChange({ holdings, cash: v })}
          className="pt-2 sm:max-w-[240px]"
        />
      )}
    </div>
  );
}

/**
 * A stock's company logo, looked up by ISIN or ticker: a name lookup lands on the wrong company too often
 * ("Dell Technologies C"). Funds, ETFs and stocks with neither get the investment tile.
 */
function HoldingMark({ holding: h }: { holding: Pick<Holding, 'name' | 'type' | 'isin'> }) {
  const ticker = h.isin ? undefined : tickerOf(h.name);
  return h.type === 'stock' && (h.isin || ticker) && logoDevEnabled() ? (
    <BrandLogo isin={h.isin} ticker={ticker} size="sm" />
  ) : (
    <IconTile icon="goal-trending" accent="purple" size="sm" />
  );
}

/** A picked instrument, not saved until it has a quantity. The average price starts at today's price. */
function AddHolding({ draft, onAdd, onCancel }: { draft: Holding; onAdd: (h: Holding) => void; onCancel: () => void }) {
  const t = useT().accounts.editor;
  const [quantity, setQuantity] = useState(0);
  const [avgPrice, setAvgPrice] = useState(draft.avgPrice);
  return (
    <div className="space-y-3 rounded-xl border border-line bg-card px-3 py-3">
      <div className="flex items-center gap-3">
        <HoldingMark holding={draft} />
        <span className="min-w-0">
          <span className="block truncate text-[13.5px] font-medium text-ink">{draft.name}</span>
          <span className="block text-[11.5px] text-muted">
            {[t.holdingTypes[draft.type], draft.market, draft.price !== undefined && `${formatNumber(draft.price, 2)} ${draft.currency}`]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
      </div>
      <div className="flex items-end gap-2">
        <MoneyField autoFocus size="sm" label={t.quantity} currency="" value={quantity} onValueChange={setQuantity} className="min-w-0 flex-1" />
        <MoneyField size="sm" label={t.avgPrice} currency={draft.currency} value={avgPrice} onValueChange={setAvgPrice} className="min-w-0 flex-1" />
      </div>
      <div className="flex gap-2 sm:justify-end">
        <Button variant="ghost" onClick={onCancel} className="flex-1 sm:flex-none">
          {t.cancel}
        </Button>
        <Button disabled={!(quantity > 0)} onClick={() => onAdd({ ...draft, quantity, avgPrice })} className="flex-1 sm:flex-none">
          {t.addHolding}
        </Button>
      </div>
    </div>
  );
}

/** Buy more or sell some at a price (today's by default). Selling moves the money to cash; buying takes it. */
function TradeForm({
  holding: h,
  side,
  currency,
  taxedOnSale,
  onConfirm,
}: {
  holding: Holding;
  side: Trade['side'];
  currency: string;
  /** AF: a sale's gain is taxed. */
  taxedOnSale: boolean;
  onConfirm: (trade: Trade) => void;
}) {
  const t = useT().accounts.editor;
  const [quantity, setQuantity] = useState(0);
  const [price, setPrice] = useState(h.price ?? h.avgPrice);
  const [useCash, setUseCash] = useState(true);
  const trade: Trade = { side, quantity: side === 'sell' ? Math.min(quantity, h.quantity) : quantity, price, useCash };
  const preview = applyTrade({ holdings: [h], cash: 0 }, h.id, trade);
  const money = (n: number, sign = false) => formatMoney(n, currency, { sign });

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <MoneyField
          size="sm"
          label={t.quantity}
          currency=""
          max={side === 'sell' ? h.quantity : undefined}
          value={quantity}
          onValueChange={setQuantity}
          className="min-w-0 flex-1"
        />
        {side === 'sell' && (
          <Button variant="ghost" size="sm" className="mb-0.5" onClick={() => setQuantity(h.quantity)}>
            {t.all}
          </Button>
        )}
        <MoneyField size="sm" label={t.price} currency={h.currency} value={price} onValueChange={setPrice} className="min-w-0 flex-1" />
      </div>
      <Switch checked={useCash} onChange={setUseCash} label={side === 'buy' ? t.payFromCash : t.addToCash} className="[&_span]:text-[12.5px]" />
      {trade.quantity > 0 && (
        <dl className="space-y-1 rounded-lg bg-page px-3 py-2 text-[12.5px]">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-soft">{t.tradeTotal}</dt>
            <dd className="tabular font-medium text-ink">{money(trade.quantity * price * (h.fx ?? 1))}</dd>
          </div>
          {side === 'buy' && h.avgPrice > 0 && (
            <div className="flex justify-between gap-3">
              <dt className="text-ink-soft">{t.newAvgPrice}</dt>
              <dd className="tabular font-medium text-ink">
                {formatNumber(preview.holdings[0].avgPrice, 2)} {h.currency}
              </dd>
            </div>
          )}
          {side === 'sell' && h.avgPrice > 0 && (
            <div className="flex justify-between gap-3">
              <dt className="text-ink-soft">{preview.gain >= 0 ? t.gainOnSale : t.lossOnSale}</dt>
              <dd className={preview.gain >= 0 ? 'tabular font-medium text-positive' : 'tabular font-medium text-negative'}>
                {money(preview.gain, true)}
              </dd>
            </div>
          )}
          {side === 'sell' && taxedOnSale && preview.gain >= 1 && (
            <p className="text-[11.5px] text-muted">{t.afTaxOnSale(money(preview.gain * CAPITAL_TAX_RATE))}</p>
          )}
        </dl>
      )}
      <div className="flex sm:justify-end">
        <Button disabled={!(trade.quantity > 0)} onClick={() => onConfirm(trade)} className="w-full sm:w-auto">
          {side === 'buy' ? t.buyMore : t.sell}
        </Button>
      </div>
    </div>
  );
}

/**
 * Finds an instrument and fetches its price before handing it on, so a foreign one has its exchange rate
 * from the start. The results are locked while that fetch runs.
 */
function InstrumentSearch({
  currency,
  onPick,
  onCancel,
}: {
  currency: string;
  onPick: (draft: Holding) => void;
  onCancel: () => void;
}) {
  const t = useT().accounts.editor;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Instrument[] | null | undefined>(undefined);
  const [fetching, setFetching] = useState<string | null>(null);

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

  const pick = async (found: Instrument) => {
    if (fetching) return;
    setFetching(found.orderbookId);
    const result = await fetchQuotes(quoteQuery([{ orderbookId: found.orderbookId, currency: found.currency }], currency));
    const q = result?.quotes[found.orderbookId];
    const price = q?.price ?? found.price;
    onPick({
      id: newId('hld'),
      orderbookId: found.orderbookId,
      isin: q?.isin,
      name: found.name,
      type: found.type,
      market: found.market,
      currency: found.currency,
      quantity: 0,
      avgPrice: price ?? 0,
      price,
      fx: result?.fx[found.currency] ?? (found.currency === currency ? 1 : undefined),
      dayChange: q?.change,
    });
  };

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <TextField
          autoFocus
          type="search"
          placeholder={t.searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onCancel()}
          className="min-w-0 flex-1"
        />
        <Button variant="ghost" onClick={onCancel}>
          {t.cancel}
        </Button>
      </div>
      {results === null && <p className="text-[12px] text-muted">{t.searchUnavailable}</p>}
      {results?.length === 0 && <p className="text-[12px] text-muted">{t.noMatches}</p>}
      {results && results.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card" aria-busy={fetching !== null}>
          {results.map((r) => (
            <li key={r.orderbookId}>
              <button
                type="button"
                disabled={fetching !== null}
                onClick={() => pick(r)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left enabled:hover:bg-page disabled:cursor-wait"
              >
                <span className={clsx('min-w-0', fetching && fetching !== r.orderbookId && 'opacity-50')}>
                  <span className="block truncate text-[13px] font-medium text-ink">{r.name}</span>
                  <span className="block text-[11.5px] text-muted">{[t.holdingTypes[r.type], r.market].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="tabular shrink-0 text-[12.5px] text-ink-soft">
                  {fetching === r.orderbookId ? t.fetchingPrice : r.price !== undefined && `${formatNumber(r.price, 2)} ${r.currency}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
