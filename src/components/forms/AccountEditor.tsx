import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatMoney, formatNumber } from '@/engine/format';
import { goalForAccount, isSavingsAccount } from '@/engine/savings';
import { capitalTaxSummary, SUGGESTED_RETURN, wrapperOf } from '@/engine/tax/capital';
import { ACCOUNT_KINDS, accountKindMeta } from '@/engine/taxonomy';
import type { Account, AccountKind } from '@/engine/types';
import { useT } from '@/i18n';
import { usePlanStore } from '@/store/planStore';
import { useCurrency, useGovBondRate, usePlan, useViewDate } from '@/store/selectors';
import { Button } from '@/components/ui/Button';
import { Delta } from '@/components/ui/Delta';
import { ACCOUNT_ACCENT, ACCOUNT_ICON } from '@/components/ui/icons';
import { MoneyField, SelectField, TextField } from '@/components/ui/fields';
import { Sheet } from '@/components/ui/Sheet';
import { ItemRow } from './ItemRow';

type Draft = Omit<Account, 'id'> & { id?: string };

function blank(kind: AccountKind = 'everyday'): Draft {
  return { name: accountKindMeta(kind).label, institution: '', kind, balance: 0 };
}

/** Kinds whose balance earns interest worth asking about. */
const INTEREST_KINDS: AccountKind[] = ['savings', 'emergency', 'other'];
const percent = (n: number) => `${formatNumber(n, 2)} %`;

export function AccountEditor({
  autoOpenAdd = false,
  previous,
}: {
  autoOpenAdd?: boolean;
  /** Balances at the previous month's close, by account id, for a "vs last month" hint per row. */
  previous?: Record<string, number>;
}) {
  const plan = usePlan();
  const currency = useCurrency();
  const { addAccount, updateAccount, removeAccount } = usePlanStore();
  const [editing, setEditing] = useState<Draft | null>(null);
  const t = useT().accounts.editor;

  useEffect(() => {
    if (autoOpenAdd) setEditing(blank());
  }, [autoOpenAdd]);

  const save = () => {
    if (!editing) return;
    if (editing.id) {
      const { id, ...patch } = editing;
      updateAccount(id, patch);
    } else addAccount(editing);
    setEditing(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12.5px] text-muted">
          {plan.accounts.length === 0 ? t.noAccounts : t.accountCount(plan.accounts.length)}
        </p>
        <Button variant="secondary" size="sm" icon={Plus} onClick={() => setEditing(blank())}>
          {t.addAccount}
        </Button>
      </div>

      <div className="space-y-2">
        {plan.accounts.map((a) => (
          <ItemRow
            key={a.id}
            icon={ACCOUNT_ICON[a.kind]}
            accent={ACCOUNT_ACCENT[a.kind]}
            title={a.name}
            onClick={() => setEditing({ ...a })}
            meta={
              <>
                {a.institution && <span>{a.institution}</span>}
                <span>· {accountKindMeta(a.kind).label}</span>
                {wrapperOf(a.kind) === 'unknown' ? (
                  <span className="text-warning">{t.pickWrapper}</span>
                ) : (
                  <RateMeta account={a} />
                )}
                {previous && <Delta before={previous[a.id]} after={a.balance} className="ml-1" />}
              </>
            }
            fields={
              <MoneyField
                size="sm"
                currency={currency}
                value={a.balance}
                onValueChange={(balance) => updateAccount(a.id, { balance })}
                className="min-w-0 flex-1 sm:w-40 sm:flex-none"
              />
            }
            menu={[
              { label: t.editDetails, icon: Pencil, onSelect: () => setEditing({ ...a }) },
              { label: t.remove, icon: Trash2, danger: true, onSelect: () => removeAccount(a.id) },
            ]}
          />
        ))}
        {plan.accounts.length === 0 && (
          <button
            type="button"
            onClick={() => setEditing(blank())}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-page/60 px-3 py-5 text-[13px] font-medium text-brand-700 hover:bg-brand-50"
          >
            <Plus size={14} /> {t.addFirst}
          </button>
        )}
      </div>

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? t.editAccount : t.addAccount}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(null)}>
              {t.cancel}
            </Button>
            <Button onClick={save} disabled={!editing?.name.trim()}>
              {editing?.id ? t.save : t.addAccount}
            </Button>
          </div>
        }
      >
        {editing && <AccountFields draft={editing} onChange={setEditing} />}
      </Sheet>
    </div>
  );
}

function RateMeta({ account: a }: { account: Account }) {
  const wrapper = wrapperOf(a.kind);
  const rate = wrapper === 'cash' ? a.interestRate : a.expectedReturn;
  const t = useT().accounts.editor;
  if (!rate) return null;
  return <span>· {wrapper === 'cash' ? t.interest(percent(rate)) : t.expected(percent(rate))}</span>;
}

function AccountFields({ draft, onChange }: { draft: Draft; onChange: (d: Draft) => void }) {
  const plan = usePlan();
  const currency = useCurrency();
  const now = useViewDate();
  const gov = useGovBondRate();
  const t = useT().accounts.editor;
  const wrapper = wrapperOf(draft.kind);
  const invests = wrapper !== 'cash';
  const goal = draft.id ? goalForAccount(plan, draft.id) : undefined;
  const saves = isSavingsAccount(draft);
  const kinds = ACCOUNT_KINDS.filter((k) => !k.legacy || k.id === draft.kind);

  // The draft in place of the saved account, so the tax preview shares the tax-free level with the other accounts.
  const draftAccount: Account = { ...draft, id: draft.id ?? '__draft__' };
  const summary = capitalTaxSummary(
    { accounts: [...plan.accounts.filter((a) => a.id !== draft.id), draftAccount] },
    now,
    gov,
  );
  const tax = summary.accounts.find((t) => t.accountId === draftAccount.id);
  const money = (n: number) => formatMoney(n, currency);

  const setKind = (kind: AccountKind) => {
    const next: Draft = { ...draft, kind, name: draft.id ? draft.name : accountKindMeta(kind).label };
    if (wrapperOf(kind) !== 'cash' && wrapperOf(kind) !== 'unknown' && next.expectedReturn === undefined) {
      next.expectedReturn = SUGGESTED_RETURN;
    }
    onChange(next);
  };

  return (
    <div className="space-y-4">
      <SelectField
        label={t.type}
        value={draft.kind}
        onValueChange={setKind}
        options={kinds.map((k) => ({ value: k.id, label: k.label }))}
      />
      <p className="-mt-2 text-[12px] text-muted">{accountKindMeta(draft.kind).description}</p>
      <TextField label={t.name} value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} />
      <TextField
        label={t.institution}
        hint={t.optional}
        placeholder={t.institutionPlaceholder}
        value={draft.institution ?? ''}
        onChange={(e) => onChange({ ...draft, institution: e.target.value })}
      />
      <MoneyField
        label={t.currentBalance}
        currency={currency}
        value={draft.balance}
        onValueChange={(balance) => onChange({ ...draft, balance })}
      />

      {(invests || saves || INTEREST_KINDS.includes(draft.kind)) && (
        <div className="grid grid-cols-2 gap-3">
          {invests ? (
            <MoneyField
              label={t.expectedReturn}
              hint={t.yearly}
              currency="%"
              value={draft.expectedReturn ?? 0}
              onValueChange={(v) => onChange({ ...draft, expectedReturn: v > 0 ? v : undefined })}
            />
          ) : (
            <MoneyField
              label={t.interestRate}
              hint={t.yearly}
              currency="%"
              value={draft.interestRate ?? 0}
              onValueChange={(v) => onChange({ ...draft, interestRate: v > 0 ? v : undefined })}
            />
          )}
          <MoneyField
            label={t.monthlyDeposit}
            hint={t.optional}
            currency={currency}
            value={draft.monthlyDeposit ?? 0}
            onValueChange={(v) => onChange({ ...draft, monthlyDeposit: v > 0 ? v : undefined })}
          />
        </div>
      )}
      {saves && (
        <p className="-mt-2 text-[12px] text-muted">{goal ? t.goalOnSavings(goal.name) : t.onSavings}</p>
      )}

      {wrapper === 'af' && (
        <>
          <MoneyField
            label={t.costBasis}
            hint={t.costBasisHint}
            currency={currency}
            value={draft.costBasis ?? 0}
            onValueChange={(v) => onChange({ ...draft, costBasis: v > 0 ? v : undefined })}
          />
          <div className="grid grid-cols-2 gap-3">
            <MoneyField
              label={t.fundShare}
              currency="%"
              max={100}
              value={draft.fundShare ?? 100}
              onValueChange={(v) => onChange({ ...draft, fundShare: Math.min(100, v) })}
            />
            <MoneyField
              label={t.dividendYield}
              hint={t.shares}
              currency="%"
              value={draft.dividendYield ?? 0}
              disabled={(draft.fundShare ?? 100) >= 100}
              onValueChange={(v) => onChange({ ...draft, dividendYield: v > 0 ? v : undefined })}
            />
          </div>
        </>
      )}

      {tax && wrapper !== 'unknown' && (tax.tax >= 1 || tax.taxIfSold >= 1 || wrapper === 'isk' || wrapper === 'kf') && (
        <div className="rounded-xl bg-page px-3 py-2.5 text-[12.5px] text-ink-soft">
          <div className="flex justify-between gap-3">
            <span>
              {t.taxYear(summary.year.year)}
              {summary.year.preliminary && <span className="text-faint">{t.estimate}</span>}
            </span>
            <span className="tabular font-medium text-ink">{money(tax.tax)}</span>
          </div>
          {(wrapper === 'isk' || wrapper === 'kf') && (
            <p className="mt-1 text-[11.5px] text-muted">
              {tax.tax < 1
                ? t.underTaxFree(money(summary.year.taxFree))
                : wrapper === 'kf'
                  ? t.insurerTakes(money(tax.withheld), money(tax.withheld - tax.tax))
                  : t.finalTaxNextSpring}
            </p>
          )}
          {wrapper === 'af' && tax.gain !== undefined && (
            <div className="mt-1 flex justify-between gap-3">
              <span>{tax.gain >= 0 ? t.taxIfSold : t.lossIfSold}</span>
              <span className="tabular font-medium text-ink">{money(tax.gain >= 0 ? tax.taxIfSold : -tax.gain)}</span>
            </div>
          )}
          {tax.netReturn !== (invests ? (draft.expectedReturn ?? 0) : (draft.interestRate ?? 0)) && (
            <div className="mt-1 flex justify-between gap-3">
              <span>{wrapper === 'af' ? t.returnAfterTaxBeforeSelling : t.returnAfterTax}</span>
              <span className="tabular font-medium text-ink">{percent(Math.round(tax.netReturn * 100) / 100)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
