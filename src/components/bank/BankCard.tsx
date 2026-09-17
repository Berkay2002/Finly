import { formatDistanceToNow } from 'date-fns';
import { Check, Copy, KeyRound, Landmark, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { addKeyFile, beginAuth, fetchBanks, forgetBank, redirectUrl, saveMapping, suggestedKind, type MappingChoice } from '@/bank/bankActions';
import { useBankStore } from '@/bank/bankStore';
import { appIdFromFileName, type BankInstitution } from '@/bank/enableBanking';
import { syncBank } from '@/bank/useBankSync';
import { ACCOUNT_KINDS } from '@/engine/taxonomy';
import type { AccountKind } from '@/engine/types';
import { dateLocale, useT } from '@/i18n';
import { usePlan } from '@/store/selectors';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { CardHeader } from '@/components/ui/Card';
import { SelectField, TextField } from '@/components/ui/fields';
import { Sheet } from '@/components/ui/Sheet';

type Mode = 'closed' | 'setup' | 'pick';
type OnMessage = (tone: 'success' | 'warning', text: string) => void;

/**
 * Optional bank connection, per account and never for the plan as a whole: it only ever supplies
 * balances. Renders as a section; the caller supplies the surrounding card.
 */
export function BankCard({ onMessage }: { onMessage: OnMessage }) {
  const plan = usePlan();
  const bank = useBankStore();
  const t = useT().bank;
  const [mode, setMode] = useState<Mode>('closed');
  const [confirmForget, setConfirmForget] = useState(false);
  const [busy, setBusy] = useState(false);

  const setup = plan.bank;
  const linked = plan.accounts.filter((a) => a.bank);
  const states = linked.map((a) => bank.accounts[a.bank!.externalId]);
  const reauth = states.some((s) => s?.status === 'reauth');
  const failed = states.find((s) => s?.status === 'error');
  const standalone = typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      onMessage('warning', e instanceof Error ? e.message : t.card.somethingWentWrong);
    } finally {
      setBusy(false);
    }
  };

  const status = !bank.hasKey
    ? { dot: 'bg-faint', text: t.status.noKey }
    : bank.syncing
      ? { dot: 'bg-blue-500 animate-pulse', text: t.status.syncing }
      : reauth
        ? { dot: 'bg-orange-500', text: t.status.reauth }
        : failed
          ? { dot: 'bg-negative', text: t.status.error(failed.error ?? t.status.unknownError) }
          : linked.length === 0
            ? { dot: 'bg-faint', text: t.status.noAccounts }
            : {
                dot: 'bg-positive',
                text: `${t.status.linkedCount(linked.length)} · ${
                  bank.lastSyncedAt ? t.status.synced(formatDistanceToNow(new Date(bank.lastSyncedAt), { addSuffix: true, locale: dateLocale() })) : t.status.never
                }`,
              };

  return (
    <div>
      <CardHeader title={t.card.title} subtitle={t.card.subtitle} />
      {!setup ? (
        plan.isSample ? (
          <p className="text-[12.5px] text-muted">{t.card.sampleHint}</p>
        ) : (
          <Button icon={Landmark} onClick={() => setMode('setup')}>
            {t.card.setUp}
          </Button>
        )
      ) : (
        <div className="space-y-3">
          <div className="flex items-start gap-2 text-[13px] text-ink">
            <span className={clsx('mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full', status.dot)} />
            {status.text}
          </div>
          <div className="flex flex-wrap gap-2">
            {bank.hasKey ? (
              <>
                <Button variant={reauth || linked.length === 0 ? 'primary' : 'secondary'} icon={Landmark} onClick={() => setMode('pick')}>
                  {reauth ? t.card.reconnect : t.card.connectBank}
                </Button>
                {linked.length > 0 && (
                  <Button variant="secondary" icon={RefreshCw} disabled={bank.syncing} onClick={() => void syncBank({ force: true })}>
                    {t.card.syncNow}
                  </Button>
                )}
              </>
            ) : (
              <Button icon={KeyRound} onClick={() => setMode('setup')}>
                {t.card.addKey}
              </Button>
            )}
            {confirmForget ? (
              <>
                <Button
                  variant="danger"
                  icon={Trash2}
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await forgetBank();
                      setConfirmForget(false);
                      onMessage('success', t.card.forgotten);
                    })
                  }
                >
                  {t.card.confirmForget}
                </Button>
                <Button variant="ghost" onClick={() => setConfirmForget(false)}>
                  {t.card.cancel}
                </Button>
              </>
            ) : (
              <Button variant="danger" icon={Trash2} onClick={() => setConfirmForget(true)}>
                {t.card.forget}
              </Button>
            )}
          </div>
          <p className="text-[12px] text-muted">{standalone ? t.card.installedAppHint : t.card.forgetExplainer}</p>
        </div>
      )}

      <SetupSheet
        open={mode === 'setup'}
        onClose={() => setMode('closed')}
        onDone={() => {
          setMode('closed');
          onMessage('success', t.card.keyAdded);
        }}
      />
      <PickBankSheet open={mode === 'pick'} onClose={() => setMode('closed')} />
      <MappingSheet onDone={(count) => count > 0 && onMessage('success', t.card.connected(count))} />
    </div>
  );
}

function CopyLine({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const t = useT().bank.setup;
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-page px-2.5 py-1.5 text-[12px] text-ink">{value}</code>
      <Button
        variant="secondary"
        size="sm"
        icon={copied ? Check : Copy}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            /* clipboard unavailable: the address is on screen */
          }
        }}
      >
        {copied ? t.copied : t.copy}
      </Button>
    </div>
  );
}

function SetupSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const t = useT().bank;
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [appId, setAppId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const origin = typeof window === 'undefined' ? '' : window.location.origin;

  const close = () => {
    setFile(null);
    setAppId('');
    setError(null);
    onClose();
  };

  const steps = [t.setup.step1, t.setup.step2, t.setup.step3, t.setup.step4, t.setup.step5, t.setup.step6];

  return (
    <Sheet
      open={open}
      onClose={close}
      title={t.setup.title}
      subtitle={t.setup.subtitle}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            {t.card.cancel}
          </Button>
          <Button
            disabled={!file || !appId.trim() || busy}
            onClick={async () => {
              if (!file) return;
              setBusy(true);
              setError(null);
              try {
                await addKeyFile(file, appId);
                close();
                onDone();
              } catch (e) {
                setError(e instanceof Error ? e.message : t.card.somethingWentWrong);
              } finally {
                setBusy(false);
              }
            }}
          >
            {t.card.addKey}
          </Button>
        </div>
      }
    >
      <ol className="space-y-3 text-[13px] text-ink">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="tabular mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-page text-[11px] font-medium text-muted">{i + 1}</span>
            <div className="min-w-0 flex-1">
              {step}
              {i === 1 && <CopyLine value={redirectUrl()} />}
              {i === 2 && (
                <>
                  <CopyLine value={`${origin}/privacy`} />
                  <CopyLine value={`${origin}/terms`} />
                </>
              )}
              {i === 5 && (
                <div className="mt-2 space-y-3">
                  <input
                    ref={input}
                    type="file"
                    accept=".pem,application/x-pem-file,text/plain"
                    className="hidden"
                    onChange={(e) => {
                      const picked = e.target.files?.[0] ?? null;
                      setFile(picked);
                      setError(null);
                      if (picked) setAppId(appIdFromFileName(picked.name) ?? '');
                    }}
                  />
                  <Button variant="secondary" icon={KeyRound} onClick={() => input.current?.click()}>
                    {file ? file.name : t.setup.chooseFile}
                  </Button>
                  {file && <TextField label={t.setup.appId} hint={t.setup.appIdHint} value={appId} onChange={(e) => setAppId(e.target.value)} />}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      {error && (
        <Callout tone="warning" className="mt-4">
          {error}
        </Callout>
      )}
    </Sheet>
  );
}

const COUNTRIES = ['SE', 'NO', 'DK', 'FI', 'DE', 'NL', 'FR', 'ES', 'IT', 'GB'];

function PickBankSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT().bank;
  const [country, setCountry] = useState('SE');
  const [banks, setBanks] = useState<BankInstitution[] | null>(null);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<BankInstitution | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setBanks(null);
    setPicked(null);
    setError(null);
    fetchBanks(country)
      .then((list) => !cancelled && setBanks(list))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : t.card.somethingWentWrong));
    return () => {
      cancelled = true;
    };
  }, [open, country]);

  const shown = useMemo(() => (banks ?? []).filter((b) => b.name.toLowerCase().includes(query.trim().toLowerCase())), [banks, query]);
  const names = useMemo(() => new Intl.DisplayNames([dateLocale().code], { type: 'region' }), []);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t.pick.title}
      subtitle={t.pick.subtitle}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t.card.cancel}
          </Button>
          <Button
            disabled={!picked || busy}
            onClick={async () => {
              if (!picked) return;
              setBusy(true);
              setError(null);
              try {
                await beginAuth(picked);
              } catch (e) {
                setError(e instanceof Error ? e.message : t.card.somethingWentWrong);
                setBusy(false);
              }
            }}
          >
            {t.pick.continue}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-[8rem_1fr] gap-3">
          <SelectField label={t.pick.country} value={country} onValueChange={setCountry} options={COUNTRIES.map((c) => ({ value: c, label: names.of(c) ?? c }))} />
          <TextField label={t.pick.search} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {error ? (
          <Callout tone="warning">{error}</Callout>
        ) : !banks ? (
          <p className="text-[13px] text-muted">{t.pick.loading}</p>
        ) : shown.length === 0 ? (
          <p className="text-[13px] text-muted">{t.pick.none}</p>
        ) : (
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {shown.map((b) => (
              <li key={b.name}>
                <button
                  type="button"
                  onClick={() => setPicked(b)}
                  aria-pressed={picked?.name === b.name}
                  className={clsx(
                    'flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-[13.5px] text-ink',
                    picked?.name === b.name ? 'border-brand-400 bg-brand-50' : 'border-line hover:bg-page',
                  )}
                >
                  {b.logo && <img src={b.logo} alt="" className="h-5 w-5 rounded object-contain" loading="lazy" />}
                  {b.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}

/** Opens by itself when a login at the bank left accounts waiting. */
function MappingSheet({ onDone }: { onDone: (count: number) => void }) {
  const t = useT().bank;
  const plan = usePlan();
  const pending = useBankStore((s) => s.pendingMapping);
  const discard = () => useBankStore.getState().setPendingMapping(undefined);
  const [choices, setChoices] = useState<Record<string, MappingChoice>>({});

  // Finly accounts a bank account can feed: not those whose balance comes from holdings.
  const targets = plan.accounts.filter((a) => !a.holdings?.length);
  const kinds = ACCOUNT_KINDS.filter((k) => !k.legacy);

  useEffect(() => {
    if (!pending) return;
    const used = new Set<string>();
    const next: Record<string, MappingChoice> = {};
    for (const found of pending.accounts) {
      // Already tied to this very bank account (a new login, or another device): keep it so.
      const same = targets.find((a) => a.bank?.externalId === found.externalId && !used.has(a.id));
      const kind = suggestedKind(found);
      if (found.currency && found.currency !== plan.currency) next[found.externalId] = { action: 'skip' };
      else if (same) {
        used.add(same.id);
        next[found.externalId] = { action: 'link', accountId: same.id };
      } else next[found.externalId] = kind ? { action: 'create', kind } : { action: 'skip' };
    }
    setChoices(next);
  }, [pending?.id]);

  if (!pending) return null;
  const count = Object.values(choices).filter((c) => c.action !== 'skip').length;

  return (
    <Sheet
      open
      onClose={discard}
      title={t.mapping.title(pending.bank.name)}
      subtitle={t.mapping.subtitle}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={discard}>
            {t.mapping.discard}
          </Button>
          <Button disabled={count === 0} onClick={() => onDone(saveMapping(choices))}>
            {t.mapping.save}
          </Button>
        </div>
      }
    >
      {pending.accounts.length === 0 ? (
        <Callout tone="warning">{t.mapping.empty}</Callout>
      ) : (
        <ul className="space-y-3">
          {pending.accounts.map((found) => {
            const choice = choices[found.externalId] ?? { action: 'skip' };
            const foreign = !!found.currency && found.currency !== plan.currency;
            const takenElsewhere = new Set(
              Object.entries(choices).flatMap(([id, c]) => (id !== found.externalId && c.action === 'link' ? [c.accountId] : [])),
            );
            const value = choice.action === 'link' ? `link:${choice.accountId}` : choice.action;
            return (
              <li key={found.externalId} className="rounded-xl border border-line p-3">
                <div className="text-[13.5px] font-medium text-ink">{found.name}</div>
                {found.iban && <div className="tabular text-[12px] text-muted">{found.iban}</div>}
                {foreign ? (
                  <p className="mt-2 text-[12px] text-warning">{t.mapping.otherCurrency(found.currency)}</p>
                ) : (
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <SelectField
                      value={value}
                      onValueChange={(v) =>
                        setChoices({
                          ...choices,
                          [found.externalId]:
                            v === 'skip'
                              ? { action: 'skip' }
                              : v === 'create'
                                ? { action: 'create', kind: suggestedKind(found) ?? 'everyday' }
                                : { action: 'link', accountId: v.slice(5) },
                        })
                      }
                      options={[
                        { value: 'create', label: t.mapping.create },
                        ...targets.filter((a) => !takenElsewhere.has(a.id)).map((a) => ({ value: `link:${a.id}`, label: t.mapping.linkTo(a.name) })),
                        { value: 'skip', label: t.mapping.skip },
                      ]}
                    />
                    {choice.action === 'create' && (
                      <SelectField<AccountKind>
                        value={choice.kind}
                        onValueChange={(kind) => setChoices({ ...choices, [found.externalId]: { action: 'create', kind } })}
                        options={kinds.map((k) => ({ value: k.id, label: k.label }))}
                      />
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}
