import { messages } from '@/i18n';
import type { AccountKind } from '@/engine/types';
import { usePlanStore } from '@/store/planStore';
import { PENDING_AUTH_MS, useBankStore } from './bankStore';
import {
  PROVIDER,
  appIdFromFileName,
  createSession,
  deleteSession,
  getRawBalances,
  getRawTransactions,
  importPem,
  listBanks,
  signJwt,
  startAuth,
  KeyFileError,
  type BankInstitution,
  type FoundAccount,
} from './enableBanking';
import { clearKey, loadKey, saveKey } from './keyStore';
import { downloadText } from '@/lib/download';
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

async function readKeyFile(file: File): Promise<{ pem: string; key: CryptoKey }> {
  const t = messages().bank.setup;
  try {
    const pem = await file.text();
    return { pem, key: await importPem(pem) };
  } catch (e) {
    throw new Error(e instanceof KeyFileError && e.problem === 'pkcs1' ? t.pkcs1 : t.unreadable);
  }
}

/**
 * Opt-in: the key file travels with the synced plan, so every device that joins with the sync phrase
 * can read the bank by itself. The file is asked for again because the stored key cannot be read out.
 */
export async function shareKey(file: File): Promise<void> {
  const appId = usePlanStore.getState().plan.bank?.appId;
  if (!appId) throw new Error(messages().bank.callback.noKey);
  const { pem, key } = await readKeyFile(file);
  // A wrong file would lock every other device out: the provider has to accept it first.
  await listBanks(await signJwt(key, appId), 'SE').catch(() => {
    throw new Error(messages().bank.setup.wrongKeyForPlan);
  });
  await saveKey(key);
  useBankStore.getState().setHasKey(true);
  useBankStore.getState().setSharedPem(pem);
}

/** Other devices drop the key on their next sync; this one keeps it. */
export const stopSharingKey = () => useBankStore.getState().setSharedPem(undefined);

/** Called by sync after another device's copy was taken: `previous` is what this device shared before. */
export async function installSharedKey(pem: string | undefined, previous: string | undefined): Promise<void> {
  if (pem === previous) return;
  try {
    if (pem) {
      await saveKey(await importPem(pem));
      useBankStore.getState().setHasKey(true);
      void syncBank({ force: true });
    } else {
      // Sharing was switched off elsewhere: a key that came through sync goes with it.
      await clearKey();
      useBankStore.getState().setHasKey(false);
    }
  } catch {
    /* an unreadable key leaves this device as it was: balances still arrive through the plan */
  }
}

/** Takes the downloaded key file onto this device. The first key also starts the plan's bank setup. */
export async function addKeyFile(file: File, typedAppId?: string): Promise<void> {
  const t = messages().bank.setup;
  const appId = typedAppId?.trim().toLowerCase() || appIdFromFileName(file.name);
  if (!appId) throw new Error(t.noAppId);
  const { plan, setBankSetup } = usePlanStore.getState();
  if (plan.bank && plan.bank.appId !== appId) throw new Error(t.wrongKeyForPlan);
  const { key } = await readKeyFile(file);
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

/**
 * Saves what the bank sends for every connected account, untouched, as a file: the last 90 days of
 * lines and the balance list. For looking at which fields a bank fills in before building on them.
 */
export async function downloadRawBank(now: Date = new Date()): Promise<void> {
  const { plan } = usePlanStore.getState();
  const sessions = plan.bank?.sessions ?? [];
  const jwt = await token();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90).toISOString().slice(0, 10);
  const accounts = [];
  for (const a of plan.accounts) {
    const id = a.bank?.externalId;
    const session = id && [...sessions].reverse().find((s) => s.accounts[id]);
    if (!id || !session) continue;
    const uid = session.accounts[id];
    accounts.push({
      name: a.name,
      kind: a.kind,
      bank: session.aspsp,
      balances: await getRawBalances(jwt, uid).catch((e: unknown) => ({ error: String(e) })),
      transactions: await getRawTransactions(jwt, uid, from).catch((e: unknown) => ({ error: String(e) })),
    });
  }
  downloadText(`finly-bank-raw-${now.toISOString().slice(0, 10)}.json`, JSON.stringify({ exportedAt: now.toISOString(), from, accounts }, null, 2));
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
