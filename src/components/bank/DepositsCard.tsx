import { useMemo } from 'react';
import { classifiedTxs, reconcileIncome } from '@/bank/useBankSync';
import { useBankStore } from '@/bank/bankStore';
import { partyLabel, type ClassifiedTx } from '@/engine/bankActuals';
import { formatDate, formatMoney } from '@/engine/format';
import { useT } from '@/i18n';
import { usePlanStore } from '@/store/planStore';
import { useCurrency, usePlan } from '@/store/selectors';
import { Card, CardHeader } from '@/components/ui/Card';
import { SelectField } from '@/components/ui/fields';

const RECENT_DAYS = 45;
const SHOWN = 6;

/**
 * Money that came in and matches no income yet. Pointing one out teaches the income its sender and
 * day; from then on it is recognised without asking. Shows nothing without a connected bank.
 */
export function DepositsCard() {
  const plan = usePlan();
  const currency = useCurrency();
  const txs = useBankStore((s) => s.txs);
  const updateIncome = usePlanStore((s) => s.updateIncome);
  const t = useT().bank.income;

  const deposits = useMemo(() => {
    const since = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString().slice(0, 10);
    return classifiedTxs().filter((tx) => tx.class === 'unsorted' && tx.amount > 0 && !tx.pending && tx.date >= since).slice(0, SHOWN);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- classifiedTxs reads both stores
  }, [txs, plan]);

  if (!deposits.length || !plan.income.length) return null;

  const assign = (tx: ClassifiedTx, incomeId: string) => {
    updateIncome(incomeId, {
      bankMatch: { counterparty: tx.counterparty ?? tx.description, day: new Date(`${tx.date}T00:00:00`).getDate() },
      destinationAccountId: plan.accounts.find((a) => a.bank?.externalId === tx.account)?.id,
    });
    reconcileIncome();
  };

  return (
    <Card>
      <CardHeader title={t.depositsTitle} subtitle={t.depositsSubtitle} />
      <ul className="divide-y divide-line">
        {deposits.map((tx, i) => (
          <li key={`${tx.account}-${tx.date}-${tx.amount}-${i}`} className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-medium text-ink">{partyLabel(tx) || t.unknownSender}</div>
              <div className="tabular text-[12px] text-muted">
                {formatDate(tx.date)} · {formatMoney(tx.amount, tx.currency || currency)}
              </div>
            </div>
            <SelectField
              size="sm"
              value=""
              placeholder={t.thisIs}
              onValueChange={(id) => assign(tx, id)}
              options={plan.income.map((src) => ({ value: src.id, label: src.name }))}
              className="w-36 shrink-0"
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}
