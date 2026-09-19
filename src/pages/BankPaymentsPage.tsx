import clsx from 'clsx';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { classifiedTxs, reconcileSpending } from '@/bank/useBankSync';
import { useBankStore } from '@/bank/bankStore';
import { lentOut, partyLabel, spentOf, toSort, type ClassifiedTx, type MerchantToSort } from '@/engine/bankActuals';
import { SPEND_GROUP_META, SPEND_GROUPS } from '@/engine/everyday';
import { formatDayHeading, formatMoney } from '@/engine/format';
import { monthKeyOf } from '@/engine/metrics';
import { expenseName } from '@/engine/taxonomy';
import type { SpendGroup } from '@/engine/types';
import { useT } from '@/i18n';
import { useCurrency, usePlan } from '@/store/selectors';
import { useUiStore } from '@/store/uiStore';
import { accentOf, Amount, Avatar, InRow, Row } from '@/components/bank/SortCard';
import { useExpenseSheet } from '@/components/forms/ExpenseEditor';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { TextField, TogglePill } from '@/components/ui/fields';

type Place = 'all' | 'unsorted' | SpendGroup | 'bills' | 'transfers' | 'people' | 'ignored' | 'in';

/** Where a line sits, for the filter. */
function placeOf(tx: ClassifiedTx): Place {
  if (tx.amount > 0 && tx.class !== 'expense' && tx.class !== 'spend') return 'in';
  switch (tx.class) {
    case 'spend':
      return tx.group ?? 'other';
    case 'unsorted':
      return 'unsorted';
    case 'expense':
      return tx.group ?? 'bills';
    case 'statement':
      return 'bills';
    case 'internal_transfer':
      return 'transfers';
    case 'lent':
      return 'people';
    case 'ignored':
      return 'ignored';
    default:
      return 'all';
  }
}

/**
 * Every line the bank has given, one to a row, to look over and put right: the month from the top bar,
 * a chip row for where lines sit, a search by payee, grouped by day. A money-out row sorts like one in
 * the Home sheet, one time or for the payee.
 */
export function BankPaymentsPage() {
  const plan = usePlan();
  const currency = useCurrency();
  const txs = useBankStore((s) => s.txs);
  const contacts = useBankStore((s) => s.contacts);
  const t = useT().bank;
  const expenses = useExpenseSheet();
  const [params] = useSearchParams();
  const [place, setPlace] = useState<Place>((params.get('group') as Place | null) ?? 'all');
  const [search, setSearch] = useState('');
  const [byPayee, setByPayee] = useState(false);
  const viewMonth = useUiStore((s) => s.viewMonth);
  const setViewMonth = useUiStore((s) => s.setViewMonth);
  const month = monthKeyOf(viewMonth);

  // A deep link names its month once; after that the top bar owns it.
  useEffect(() => {
    const m = params.get('month');
    if (m) setViewMonth(new Date(`${m}-01T12:00:00`));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on arrival only
  }, []);

  // A change here places lines at once instead of at the next read from the bank.
  useEffect(() => reconcileSpending(), [plan.expenses, plan.bank]);

  const { classified, lent } = useMemo(
    () => {
      const classified = classifiedTxs().filter((tx) => !tx.pending);
      return { classified, lent: lentOut(classified) };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- classifiedTxs reads both stores
    [txs, plan, contacts],
  );

  const inMonth = classified.filter((tx) => tx.date.startsWith(month));
  const unsortedCount = inMonth.filter((tx) => tx.class === 'unsorted').length;
  const needle = search.trim().toLowerCase();
  const rows = inMonth.filter(
    (tx) =>
      (place === 'all' || (place === 'in' ? tx.amount > 0 : placeOf(tx) === place)) &&
      (!needle || partyLabel(tx, contacts).toLowerCase().includes(needle) || (tx.description ?? '').toLowerCase().includes(needle)),
  );
  const counted = Math.round(rows.reduce((sum, tx) => sum + spentOf(tx), 0) * 100) / 100;
  const payees = byPayee ? toSort(rows, '', contacts, true) : undefined;
  // Newest day first, as the bank lists them.
  const days = (() => {
    const map = new Map<string, ClassifiedTx[]>();
    for (const tx of rows) map.set(tx.date, [...(map.get(tx.date) ?? []), tx]);
    return [...map.entries()].sort(([a], [b]) => b.localeCompare(a));
  })();

  const places: { value: Place; label: string }[] = [
    { value: 'all', label: t.page.all },
    { value: 'unsorted', label: t.page.unsorted },
    ...SPEND_GROUPS.map((g) => ({ value: g, label: SPEND_GROUP_META[g].label })),
    { value: 'bills', label: t.page.bills },
    { value: 'transfers', label: t.page.transfers },
    { value: 'people', label: t.page.people },
    { value: 'ignored', label: t.page.ignored },
    { value: 'in', label: t.page.moneyIn },
  ];

  const single = (tx: ClassifiedTx): MerchantToSort => ({ key: tx.merchantKey ?? '', label: partyLabel(tx, contacts), count: 1, total: -tx.amount, lastDate: tx.date, lines: [tx] });
  const contribution = (lines: ClassifiedTx[]) => {
    if (!SPEND_GROUPS.includes(place as SpendGroup)) return undefined;
    const amount = lines.reduce((sum, tx) => sum + spentOf(tx), 0);
    const raw = lines.reduce((sum, tx) => sum - tx.amount, 0);
    return Math.abs(amount - raw) >= 0.005 ? t.page.contribution(formatMoney(amount, currency)) : undefined;
  };
  const statusIn = (tx: ClassifiedTx) =>
    tx.class === 'income'
      ? t.page.incomeLabel(plan.income.find((s) => s.id === tx.incomeSourceId)?.name ?? '')
      : tx.class === 'expense'
        ? t.sort.share(expenseName(plan.expenses.find((e) => e.id === tx.expenseId) ?? { name: '', subcategory: 'custom' }))
        : tx.class === 'internal_transfer'
          ? t.sort.transfer
          : t.sort.inIgnore;

  const line = (tx: ClassifiedTx) => {
    const key = tx.id ?? `${tx.date}${tx.amount}`;
    if (tx.amount > 0) {
      return tx.class === 'unsorted' && tx.id ? <InRow key={key} tx={tx} lent={lent} classified={classified} showDate={false} /> : <Plain key={key} tx={tx} label={statusIn(tx)} />;
    }
    if (tx.class === 'statement') return <Plain key={key} tx={tx} label={t.page.statement} contribution={contribution([tx])} />;
    return <Row key={key} merchant={single(tx)} onAddBill={expenses.openNew} contribution={contribution([tx])} showDate={false} />;
  };

  return (
    <div>
      <PageHeader title={t.page.title} subtitle={t.page.subtitle} />
      <Card>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <div className="text-[11.5px] font-semibold uppercase tracking-wide text-faint">{t.page.countsAs}</div>
            <div className="tabular text-[24px] font-semibold leading-tight text-ink">{formatMoney(counted, currency)}</div>
          </div>
          <div className="text-right text-[12.5px] text-muted">
            <div className="tabular">{t.page.payments(rows.length)}</div>
            {unsortedCount > 0 && place !== 'unsorted' && (
              <button type="button" onClick={() => setPlace('unsorted')} className="press mt-0.5 inline-flex">
                <Chip tone="brand">
                  {t.page.unsorted} · {unsortedCount}
                </Chip>
              </button>
            )}
          </div>
        </div>

        <div className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 pb-0.5 scrollbar-none sm:-mx-5 sm:px-5">
          {places.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPlace(p.value)}
              className={clsx(
                'press shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors',
                place === p.value ? 'bg-ink text-card' : 'bg-page text-muted hover:text-ink',
              )}
            >
              {p.label}
              {p.value === 'unsorted' && unsortedCount > 0 && <span className="tabular ml-1 opacity-70">{unsortedCount}</span>}
            </button>
          ))}
        </div>

        <div className="mb-2 flex items-center gap-3">
          <TextField placeholder={t.page.search} value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-0 flex-1 sm:max-w-xs" />
          <TogglePill
            value={byPayee ? 'payee' : 'day'}
            onChange={(v) => setByPayee(v === 'payee')}
            options={[
              { value: 'day', label: t.page.byDay },
              { value: 'payee', label: t.page.byPayee },
            ]}
            className="shrink-0"
          />
        </div>
        {place === 'other' && <p className="mb-2 text-[12px] text-muted">{t.page.otherExplained}</p>}

        {!rows.length ? (
          <p className="py-6 text-center text-[13px] text-muted">{t.page.none}</p>
        ) : payees ? (
          <ul className="divide-y divide-line">
            {payees.map((m) => (
              <Row key={m.key} merchant={m} onAddBill={expenses.openNew} contribution={contribution(m.lines)} cluster />
            ))}
            {rows.filter((tx) => tx.amount > 0 || tx.class === 'statement').map(line)}
          </ul>
        ) : (
          days.map(([date, list]) => {
            const spent = list.reduce((sum, tx) => sum + spentOf(tx), 0);
            return (
              <section key={date} className="pt-3 first:pt-0">
                <div className="flex items-baseline justify-between pb-1 text-[12px] font-semibold text-faint">
                  <span>{formatDayHeading(date)}</span>
                  {spent > 0 && <span className="tabular">{formatMoney(-spent, currency)}</span>}
                </div>
                <ul className="divide-y divide-line">{list.map(line)}</ul>
              </section>
            );
          })
        )}
      </Card>
      {expenses.sheet}
    </div>
  );
}

/** A line that is what it is: money in already explained, or a statement sorted line by line elsewhere. */
function Plain({ tx, label, contribution }: { tx: ClassifiedTx; label: string; contribution?: string }) {
  const currency = useCurrency();
  const contacts = useBankStore((s) => s.contacts);
  const name = partyLabel(tx, contacts);
  return (
    <li className="flex items-center gap-3 py-2.5">
      <Avatar label={name} accent={accentOf(tx)} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-medium text-ink">{name}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted">
          <Chip className="max-w-full truncate">{label}</Chip>
        </div>
        {contribution && <div className="mt-0.5 text-[12px] text-muted">{contribution}</div>}
      </div>
      <Amount value={tx.amount} currency={currency} />
    </li>
  );
}
