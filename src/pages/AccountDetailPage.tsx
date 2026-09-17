import { ArrowLeft, Pencil, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { formatDate, formatMoney, formatPercent, formatTime } from '@/engine/format';
import { holdingsGain } from '@/engine/holdings';
import { wrapperOf } from '@/engine/tax/capital';
import { accountKindMeta } from '@/engine/taxonomy';
import { useT } from '@/i18n';
import { quoteQuery, refreshQuotes, useQuoteStatus } from '@/lib/quotes';
import { usePlanStore } from '@/store/planStore';
import { useCurrency, usePlan, usePreviousSnapshot } from '@/store/selectors';
import { AccountSheet, type AccountDraft } from '@/components/forms/AccountEditor';
import { HoldingsEditor } from '@/components/forms/HoldingsEditor';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, IconButton, LinkButton } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { IconTile } from '@/components/ui/IconTile';
import { StatCard } from '@/components/ui/StatCard';

/** An ISK, KF or AF account with what it holds. Reached from its row on Accounts; not in the menu. */
export function AccountDetailPage() {
  const { id } = useParams();
  const plan = usePlan();
  const currency = useCurrency();
  const closed = usePreviousSnapshot();
  const updateAccount = usePlanStore((s) => s.updateAccount);
  const quoteStatus = useQuoteStatus();
  const [editing, setEditing] = useState<AccountDraft | null>(null);
  const t = useT().accounts;
  const td = t.detail;

  const account = plan.accounts.find((a) => a.id === id);
  if (!account || wrapperOf(account.kind) === 'cash') return <Navigate to="/accounts" replace />;

  const money = (n: number) => formatMoney(n, currency);
  const holdings = account.holdings ?? [];
  const cash = holdings.length ? (account.cash ?? 0) : 0;
  const gain = holdingsGain(holdings);
  const pricedAt = holdings.map((h) => h.priceAt ?? '').sort().at(-1) || undefined;
  // A price from more than 3 days back, with no fetch this visit, has likely missed a trading day.
  const stale =
    quoteStatus.failed ||
    (!quoteStatus.fetchedAt && pricedAt !== undefined && Date.now() - Date.parse(pricedAt) > 3 * 86_400_000);
  const freshness = !holdings.length ? undefined : stale ? (
    <span className="text-warning">{td.notUpdated(pricedAt && formatDate(pricedAt))}</span>
  ) : quoteStatus.fetchedAt ? (
    td.updatedAt(formatTime(quoteStatus.fetchedAt))
  ) : (
    pricedAt && td.pricesFrom(formatDate(pricedAt))
  );
  const refresh = () =>
    void refreshQuotes(quoteQuery(holdings, currency), true).then((result) => {
      if (result) usePlanStore.getState().refreshHoldings(result);
    });

  return (
    <div>
      <PageHeader
        title={account.name}
        subtitle={[account.institution, accountKindMeta(account.kind).label].filter(Boolean).join(' · ')}
        showMonth={false}
        actions={
          <>
            <LinkButton to="/accounts" variant="secondary" icon={ArrowLeft}>
              {td.back}
            </LinkButton>
            <Button variant="secondary" icon={Pencil} onClick={() => setEditing({ ...account })}>
              {t.editor.editAccount}
            </Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          icon="account-investment"
          accent="purple"
          label={td.value}
          value={money(account.balance)}
          trend={{ before: closed?.byAccount?.[account.id], after: account.balance }}
          sub={t.editor.holdingCount(holdings.length)}
        />
        <StatCard
          icon="stat-income"
          accent="green"
          label={td.gain}
          value={gain ? formatMoney(gain.amount, currency, { sign: true }) : '–'}
          sub={gain ? td.gainSub(`${gain.share >= 0 ? '+' : '-'}${formatPercent(Math.abs(gain.share), 1)}`) : td.noGain}
        />
        <StatCard
          icon="card-allocation"
          accent="blue"
          label={td.inHoldings}
          value={money(account.balance - cash)}
          sub={td.ofValue(formatPercent(account.balance > 0 ? (account.balance - cash) / account.balance : 0))}
        />
        <StatCard icon="account-cash" accent="yellow" label={td.cash} value={money(cash)} sub={td.notInvested} />
      </div>

      <Card>
        <CardHeader
          icon={<IconTile icon="card-allocation" accent="purple" size="sm" />}
          title={t.editor.holdings}
          subtitle={freshness}
        >
          {holdings.length > 0 && (
            <IconButton
              icon={RefreshCw}
              size={16}
              label={td.refresh}
              disabled={quoteStatus.refreshing}
              onClick={refresh}
              className={quoteStatus.refreshing ? 'animate-spin' : undefined}
            />
          )}
        </CardHeader>
        <HoldingsEditor
          kind={account.kind}
          holdings={holdings}
          cash={cash}
          currency={currency}
          onChange={(next) =>
            // With the last holding gone the balance is typed again, starting from the cash that is left.
            updateAccount(account.id, next.holdings.length ? next : { holdings: undefined, cash: undefined, balance: next.cash })
          }
        />
        <p className="mt-3 text-[11.5px] text-muted">{t.editor.holdingsHint}</p>
      </Card>

      <AccountSheet draft={editing} onChange={setEditing} />
    </div>
  );
}
