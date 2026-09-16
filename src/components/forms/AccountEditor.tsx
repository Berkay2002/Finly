import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ACCOUNT_KINDS, accountKindMeta } from '@/engine/taxonomy';
import type { Account, AccountKind } from '@/engine/types';
import { usePlanStore } from '@/store/planStore';
import { useCurrency, usePlan } from '@/store/selectors';
import { Button } from '@/components/ui/Button';
import { ACCOUNT_ACCENT, ACCOUNT_ICON } from '@/components/ui/icons';
import { MoneyField, SelectField, TextField } from '@/components/ui/fields';
import { Sheet } from '@/components/ui/Sheet';
import { ItemRow } from './ItemRow';

type Draft = Omit<Account, 'id'> & { id?: string };

function blank(kind: AccountKind = 'everyday'): Draft {
  return { name: accountKindMeta(kind).label, institution: '', kind, balance: 0 };
}

export function AccountEditor({ autoOpenAdd = false }: { autoOpenAdd?: boolean }) {
  const plan = usePlan();
  const currency = useCurrency();
  const { addAccount, updateAccount, removeAccount } = usePlanStore();
  const [editing, setEditing] = useState<Draft | null>(null);

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
          {plan.accounts.length === 0 ? 'No accounts yet.' : `${plan.accounts.length} account${plan.accounts.length === 1 ? '' : 's'}`}
        </p>
        <Button variant="secondary" size="sm" icon={Plus} onClick={() => setEditing(blank())}>
          Add account
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
              { label: 'Edit details', icon: Pencil, onSelect: () => setEditing({ ...a }) },
              { label: 'Remove', icon: Trash2, danger: true, onSelect: () => removeAccount(a.id) },
            ]}
          />
        ))}
        {plan.accounts.length === 0 && (
          <button
            type="button"
            onClick={() => setEditing(blank())}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-page/60 px-3 py-5 text-[13px] font-medium text-brand-700 hover:bg-brand-50"
          >
            <Plus size={14} /> Add your first account
          </button>
        )}
      </div>

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit account' : 'Add account'}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={!editing?.name.trim()}>
              {editing?.id ? 'Save' : 'Add account'}
            </Button>
          </div>
        }
      >
        {editing && (
          <div className="space-y-4">
            <SelectField
              label="Type"
              value={editing.kind}
              onValueChange={(kind: AccountKind) =>
                setEditing({ ...editing, kind, name: editing.id ? editing.name : accountKindMeta(kind).label })
              }
              options={ACCOUNT_KINDS.map((k) => ({ value: k.id, label: k.label }))}
            />
            <p className="-mt-2 text-[12px] text-muted">{accountKindMeta(editing.kind).description}</p>
            <TextField label="Name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <TextField
              label="Bank or provider"
              hint="(optional)"
              placeholder="e.g. Swedbank, Avanza"
              value={editing.institution ?? ''}
              onChange={(e) => setEditing({ ...editing, institution: e.target.value })}
            />
            <MoneyField
              label="Current balance"
              currency={currency}
              value={editing.balance}
              onValueChange={(balance) => setEditing({ ...editing, balance })}
            />
          </div>
        )}
      </Sheet>
    </div>
  );
}
