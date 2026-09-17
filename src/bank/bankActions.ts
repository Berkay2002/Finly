import { messages } from '@/i18n';
import type { AccountKind } from '@/engine/types';
import { usePlanStore } from '@/store/planStore';
import { PENDING_AUTH_MS, useBankStore } from './bankStore';
import {
  PROVIDER,
  appIdFromFileName,
  createSession,
  deleteSession,
  importPem,
  listBanks,
  signJwt,
  startAuth,
  KeyFileError,
  type BankInstitution,
  type FoundAccount,
} from './enableBanking';
import { clearKey, loadKey, saveKey } from './keyStore';
import { syncBank } from './useBankSync';

/** Where the bank sends the person back to; it has to be registered with the provider to the letter. */
export const redirectUrl = () => `${window.location.origin}/bank/callback`;

async function token(): Promise<string> {
  const key = await loadKey();
  const appId = usePlanStore.getState().plan.bank?.appId;
  if (!key || !appId) {
    useBankStore.getState().setHasKey(false);
    throw new Error(messages().bank.callback.noKey);
  }
  return signJwt(key, appId);
}

/** Takes the downloaded key file onto this device. The first key also starts the plan's bank setup. */
export async function addKeyFile(file: File, typedAppId?: string): Promise<void> {
  const t = messages().bank.setup;
  const appId = typedAppId?.trim().toLowerCase() || appIdFromFileName(file.name);
  if (!appId) throw new Error(t.noAppId);
  const { plan, setBankSetup } = usePlanStore.getState();
  if (plan.bank && plan.bank.appId !== appId) throw new Error(t.wrongKeyForPlan);
  let key: CryptoKey;
  try {
    key = await importPem(await file.text());
  } catch (e) {
    throw new Error(e instanceof KeyFileError && e.problem === 'pkcs1' ? t.pkcs1 : t.unreadable);
  }
  await saveKey(key);
  useBankStore.getState().setHasKey(true);
  if (!plan.bank) setBankSetup({ provider: PROVIDER, appId, sessions: [] });
}

export async function fetchBanks(country: string): Promise<BankInstitution[]> {
  return listBanks(await token(), country);
}

/** Off to the bank. What comes back is checked against the state kept here. */
export async function beginAuth(bank: BankInstitution): Promise<void> {
  const state = crypto.randomUUID();
  const url = await startAuth(await token(), bank, redirectUrl(), state);
  useBankStore.getState().setPendingAuth({ state, bank, startedAt: new Date().toISOString() });
  window.location.assign(url);
}

// The code from the bank works once; StrictMode would otherwise spend it twice.
let completing: Promise<void> | null = null;

/** Back from the bank: trade the code for a session, and leave its accounts waiting to be mapped. */
export function completeAuth(params: URLSearchParams): Promise<void> {
  completing ??= (async () => {
    const t = messages().bank.callback;
    const bank = useBankStore.getState();
    const pending = bank.pendingAuth;
    bank.setPendingAuth(undefined);
    const code = params.get('code');
    if (params.get('error') || !code) throw new Error(params.get('error_description') ?? t.cancelled);
    if (!pending || pending.state !== params.get('state') || Date.now() - Date.parse(pending.startedAt) > PENDING_AUTH_MS) throw new Error(t.expired);
    const session = await createSession(await token(), code);
    useBankStore.getState().setPendingMapping({ ...session, bank: pending.bank });
  })().finally(() => {
    completing = null;
  });
  return completing;
}

export type MappingChoice = { action: 'skip' } | { action: 'create'; kind: AccountKind } | { action: 'link'; accountId: string };

/** The bank's own label for an account, as a first guess at what it is for. Cards and loans are left out. */
export function suggestedKind(found: FoundAccount): AccountKind | null {
  if (found.type === 'SVGS') return 'savings';
  if (!found.type || found.type === 'CACC' || found.type === 'TRAN') return 'everyday';
  return null;
}

/** Ties the found accounts to Finly accounts, keeps the session with the plan, and reads the balances. */
export function saveMapping(choices: Record<string, MappingChoice>): number {
  const pending = useBankStore.getState().pendingMapping;
  const store = usePlanStore.getState();
  const setup = store.plan.bank;
  if (!pending || !setup) return 0;

  const taken = pending.accounts.filter((f) => (choices[f.externalId]?.action ?? 'skip') !== 'skip');
  for (const found of taken) {
    const choice = choices[found.externalId];
    const link = { provider: PROVIDER, externalId: found.externalId, ...(found.iban ? { iban: found.iban } : {}) };
    // One bank account feeds one Finly account.
    for (const a of usePlanStore.getState().plan.accounts) if (a.bank?.externalId === found.externalId) store.updateAccount(a.id, { bank: undefined });
    if (choice.action === 'link') store.updateAccount(choice.accountId, { bank: link });
    else if (choice.action === 'create') store.addAccount({ name: found.name, institution: pending.bank.name, kind: choice.kind, balance: 0, bank: link });
  }

  // A new login at a bank replaces the earlier one there.
  const sessions = setup.sessions.filter((s) => !(s.aspsp === pending.bank.name && s.country === pending.bank.country));
  store.setBankSetup({
    ...setup,
    sessions: [
      ...sessions,
      {
        id: pending.id,
        aspsp: pending.bank.name,
        country: pending.bank.country,
        validUntil: pending.validUntil,
        accounts: Object.fromEntries(taken.map((f) => [f.externalId, f.uid])),
      },
    ],
  });
  useBankStore.getState().setPendingMapping(undefined);
  void syncBank({ force: true });
  return taken.length;
}

/** Ends the consent at the bank where possible, drops the key, and hands every account back to manual. */
export async function forgetBank(): Promise<void> {
  const sessions = usePlanStore.getState().plan.bank?.sessions ?? [];
  const jwt = await token().catch(() => null);
  if (jwt) await Promise.all(sessions.map((s) => deleteSession(jwt, s.id).catch(() => undefined)));
  await clearKey();
  useBankStore.getState().forget();
  usePlanStore.getState().setBankSetup(undefined);
}
