import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { classifiedTxs, reconcileSpending } from '@/bank/useBankSync';
import { useBankStore } from '@/bank/bankStore';
import { lentOut, matchesBankPlace, partyLabel, spentOf, toSort, type BankPlace, type ClassifiedTx, type MerchantToSort } from '@/engine/bankActuals';
import { SPEND_GROUP_META, SPEND_GROUPS } from '@/engine/everyday';
import type { SpendGroup } from '@/engine/types';
import { formatDate, formatMoney, formatMonthKey } from '@/engine/format';
import { expenseName } from '@/engine/taxonomy';
import { useT } from '@/i18n';
import { useCurrency, usePlan } from '@/store/selectors';
import { InRow, Row } from '@/components/bank/SortCard';
import { useExpenseSheet } from '@/components/forms/ExpenseEditor';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { SelectField, Switch, TextField } from '@/components/ui/fields';

type Place = BankPlace;

/**
 * Every line the bank has given, one to a row, to look over and put right: filtered by month and place,
 * searched by payee. A money-out row sorts like one in the Home sheet, one time or for the payee.
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

  // A change here places lines at once instead of at the next read from the bank.
  useEffect(() => reconcileSpending(), [plan.expenses, plan.bank]);

  const { classified, months, lent } = useMemo(
    () => {
      const classified = classifiedTxs().filter((tx) => !tx.pending);
      const months = [...new Set(classified.map((tx) => tx.date.slice(0, 7)))].sort().reverse();
      return { classified, months, lent: lentOut(classified) };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- classifiedTxs reads both stores
    [txs, plan, contacts],
  );
  const [month, setMonth] = useState(params.get('month') ?? months[0] ?? '');

  const needle = search.trim().toLowerCase();
  const rows = classified.filter(
    (tx) =>
      tx.date.startsWith(month) &&
      matchesBankPlace(tx, place) &&
      (!needle || partyLabel(tx, contacts).toLowerCase().includes(needle) || (tx.description ?? '').toLowerCase().includes(needle)),
  );
  const netSpent = Math.round(rows.reduce((sum, tx) => sum + spentOf(tx), 0) * 100) / 100;
  const counted = SPEND_GROUPS.includes(place as SpendGroup) ? Math.max(0, netSpent) : netSpent;
  // One row a payee, its lines together, to set where it goes once; money in and statements stay one to a line.
  const payees = byPayee ? toSort(rows, '', contacts, true) : undefined;

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

  return (
    <div>
      <PageHeader title={t.page.title} subtitle={t.page.subtitle} showMonth={false} />
      <Card>
        <div className="mb-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end sm:gap-3">
          <SelectField label={t.page.month} size="sm" value={month} onValueChange={setMonth} options={months.map((m) => ({ value: m, label: formatMonthKey(m) }))} className="sm:w-40" />
          <SelectField label={t.page.place} size="sm" value={place} onValueChange={setPlace} options={places} className="sm:w-44" />
          <TextField label={t.page.search} value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-0 flex-1 max-sm:col-span-2 sm:max-w-xs" />
          <Switch checked={byPayee} onChange={setByPayee} description={t.page.byPayee} className="max-sm:col-span-2" />
        </div>
        <p className="tabular mb-1 text-[12.5px] text-muted">{t.page.summary(rows.length, formatMoney(counted, currency))}</p>
        {place === 'other' && <p className="mb-2 text-[12px] text-muted">{t.page.otherExplained}</p>}
        {rows.length ? (
          <ul className="divide-y divide-line">
            {payees?.map((m) => <Row key={m.key} merchant={m} onAddBill={expenses.openNew} contribution={contribution(m.lines)} />)}
            {rows.map((tx) =>
              tx.amount > 0 ? (
                tx.class === 'unsorted' && tx.id ? (
                  <InRow key={tx.id} tx={tx} lent={lent} classified={classified} />
                ) : (
                  <Plain key={tx.id ?? `${tx.date}${tx.amount}`} tx={tx} label={statusIn(tx)} />
                )
              ) : tx.class === 'statement' ? (
                <Plain key={tx.id ?? `${tx.date}${tx.amount}`} tx={tx} label={t.page.statement} contribution={contribution([tx])} />
              ) : payees ? null : (
                <Row key={tx.id ?? `${tx.date}${tx.amount}`} merchant={single(tx)} onAddBill={expenses.openNew} contribution={contribution([tx])} />
              ),
            )}
          </ul>
        ) : (
          <p className="text-[13px] text-muted">{t.page.none}</p>
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
  return (
    <li className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-medium text-ink">{partyLabel(tx, contacts)}</div>
        <div className="tabular text-[12px] text-muted">
          {formatDate(tx.date)} · {formatMoney(tx.amount, currency)}
        </div>
        {contribution && <div className="text-[12px] text-muted">{contribution}</div>}
      </div>
      <span className="shrink-0 text-[12.5px] text-muted">{label}</span>
    </li>
  );
}
