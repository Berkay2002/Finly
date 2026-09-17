/**
 * Enable Banking, the one place that knows the provider. Each person brings their own application:
 * its private key signs a short-lived token here in the browser, and /api/bank passes the call on
 * (the provider sends no CORS headers). Everything returned is in Finly's own shapes, so nothing
 * outside this file depends on the provider.
 */

import type { BankTx } from '@/engine/bankActuals';

export const PROVIDER = 'enable-banking';
const PROXY = '/api/bank';

export interface BankInstitution {
  name: string;
  country: string;
  logo?: string;
  /** Longest consent the bank gives, in seconds. */
  maxConsent?: number;
}

/** A bank account found in a session, before it is tied to a Finly account. */
export interface FoundAccount {
  /** Stable across sessions and devices. */
  externalId: string;
  /** What this session reads the account under. */
  uid: string;
  name: string;
  iban?: string;
  currency: string;
  /** The bank's own idea of the account: 'CACC' current, 'SVGS' savings, 'CARD'… A suggestion only. */
  type?: string;
}

export interface NewSession {
  id: string;
  validUntil: string;
  accounts: FoundAccount[];
}

export interface BankBalance {
  booked?: number;
  available?: number;
  currency: string;
}

export class BankError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
  /** The consent ran out or was withdrawn: the person has to log in at the bank again. */
  get needsLogin(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

/** Thrown for a key file this browser cannot read; `pkcs1` has a one-line fix worth showing. */
export class KeyFileError extends Error {
  constructor(readonly problem: 'pkcs1' | 'unreadable') {
    super(problem);
  }
}

/** The application id is the key file's name: `<uuid>.pem`. */
export function appIdFromFileName(name: string): string | null {
  return /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(name)?.[1].toLowerCase() ?? null;
}

/** The key as one that can sign but never be read back out, so it cannot leave this browser. */
export async function importPem(pem: string): Promise<CryptoKey> {
  if (pem.includes('BEGIN RSA PRIVATE KEY')) throw new KeyFileError('pkcs1');
  if (!pem.includes('BEGIN PRIVATE KEY')) throw new KeyFileError('unreadable');
  try {
    const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, '')), (c) => c.charCodeAt(0));
    return await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  } catch {
    throw new KeyFileError('unreadable');
  }
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlJson = (value: unknown) => b64url(new TextEncoder().encode(JSON.stringify(value)));

/** A token good for ten minutes: long enough for one round of calls, short enough to be worthless if seen. */
export async function signJwt(key: CryptoKey, appId: string, now: Date = new Date()): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000);
  const head = b64urlJson({ typ: 'JWT', alg: 'RS256', kid: appId });
  const body = b64urlJson({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat, exp: iat + 600 });
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(new Uint8Array(signature))}`;
}

async function call<T>(jwt: string, method: 'GET' | 'POST' | 'DELETE', path: string, query: Record<string, string> = {}, body?: unknown): Promise<T> {
  const res = await fetch(`${PROXY}?${new URLSearchParams({ path, ...query })}`, {
    method,
    headers: { authorization: `Bearer ${jwt}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
  if (!res.ok) throw new BankError(json?.message ?? json?.error ?? `Bank service answered ${res.status}`, res.status);
  return json as T;
}

export async function listBanks(jwt: string, country: string): Promise<BankInstitution[]> {
  const { aspsps } = await call<{ aspsps: { name: string; country: string; logo?: string; maximum_consent_validity?: number }[] }>(
    jwt,
    'GET',
    '/aspsps',
    { country, psu_type: 'personal' },
  );
  return aspsps.map((a) => ({ name: a.name, country: a.country, logo: a.logo, maxConsent: a.maximum_consent_validity }));
}

/** Starts a login at the bank; the answer is the address to send the person to. */
export async function startAuth(jwt: string, bank: BankInstitution, redirectUrl: string, state: string, now: Date = new Date()): Promise<string> {
  // As long as the bank allows, less a day so a clock difference never pushes it over.
  const seconds = Math.max(86_400, (bank.maxConsent ?? 90 * 86_400) - 86_400);
  const { url } = await call<{ url: string }>(jwt, 'POST', '/auth', {}, {
    access: { valid_until: new Date(now.getTime() + seconds * 1000).toISOString() },
    aspsp: { name: bank.name, country: bank.country },
    state,
    redirect_url: redirectUrl,
    psu_type: 'personal',
  });
  return url;
}

interface RawAccount {
  uid?: string;
  identification_hash?: string;
  name?: string;
  product?: string;
  details?: string;
  currency?: string;
  cash_account_type?: string;
  account_id?: { iban?: string };
}

/** Trades the code the bank sent back for a session and the accounts it may read. */
export async function createSession(jwt: string, code: string): Promise<NewSession> {
  const raw = await call<{ session_id: string; accounts?: RawAccount[]; access?: { valid_until?: string } }>(jwt, 'POST', '/sessions', {}, { code });
  return {
    id: raw.session_id,
    validUntil: raw.access?.valid_until ?? new Date(Date.now() + 90 * 86_400_000).toISOString(),
    accounts: (raw.accounts ?? []).flatMap((a) =>
      a.uid && a.identification_hash
        ? [
            {
              externalId: a.identification_hash,
              uid: a.uid,
              name: a.name || a.product || a.details || a.account_id?.iban || a.uid,
              iban: a.account_id?.iban,
              currency: a.currency ?? '',
              type: a.cash_account_type,
            },
          ]
        : [],
    ),
  };
}

interface RawBalance {
  balance_type?: string;
  balance_amount?: { amount?: string; currency?: string };
}

const AVAILABLE = ['ITAV', 'CLAV', 'XPCD'];
const BOOKED = ['ITBD', 'CLBD'];

/** The booked and the available figure out of the bank's list of balance kinds; the intraday ones first. */
export function pickBalance(balances: RawBalance[]): BankBalance | null {
  const find = (types: string[]) => {
    for (const type of types) {
      const hit = balances.find((b) => b.balance_type === type);
      const amount = Number(hit?.balance_amount?.amount);
      if (hit && Number.isFinite(amount)) return { amount, currency: hit.balance_amount?.currency ?? '' };
    }
    return undefined;
  };
  const available = find(AVAILABLE);
  const booked = find(BOOKED);
  const any = available ?? booked;
  if (!any) return null;
  return { available: available?.amount, booked: booked?.amount, currency: any.currency };
}

export async function getBalance(jwt: string, uid: string): Promise<BankBalance | null> {
  const { balances } = await call<{ balances?: RawBalance[] }>(jwt, 'GET', `/accounts/${uid}/balances`);
  return pickBalance(balances ?? []);
}

interface RawTx {
  transaction_amount?: { amount?: string; currency?: string };
  credit_debit_indicator?: string;
  status?: string;
  booking_date?: string;
  value_date?: string;
  transaction_date?: string;
  creditor?: { name?: string };
  debtor?: { name?: string };
  creditor_account?: { iban?: string };
  debtor_account?: { iban?: string };
  remittance_information?: string[];
}

/** One line from the bank in Finly's shape, or null when it has no usable amount or date. */
export function normalizeTx(raw: RawTx, account: string): BankTx | null {
  const amount = Number(raw.transaction_amount?.amount);
  const date = raw.booking_date ?? raw.value_date ?? raw.transaction_date;
  if (!Number.isFinite(amount) || !date) return null;
  const incoming = raw.credit_debit_indicator === 'CRDT';
  const description = raw.remittance_information?.filter(Boolean).join(' ').trim() || undefined;
  return {
    account,
    date: date.slice(0, 10),
    amount: incoming ? Math.abs(amount) : -Math.abs(amount),
    currency: raw.transaction_amount?.currency ?? '',
    // The other side: whoever paid when money came in, whoever was paid when it went out.
    counterparty: (incoming ? raw.debtor?.name : raw.creditor?.name) || undefined,
    counterpartyIban: (incoming ? raw.debtor_account?.iban : raw.creditor_account?.iban) || undefined,
    description,
    ...(raw.status === 'PDNG' ? { pending: true } : {}),
  };
}

// ponytail: 20 pages is thousands of lines for one account; raise it if a bank pages very finely.
const MAX_PAGES = 20;

/** Everything on the account from `from` (YYYY-MM-DD) on, following the bank's pages. */
export async function getTransactions(jwt: string, uid: string, account: string, from: string): Promise<BankTx[]> {
  const out: BankTx[] = [];
  let key: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const res = await call<{ transactions?: RawTx[]; continuation_key?: string }>(jwt, 'GET', `/accounts/${uid}/transactions`, {
      date_from: from,
      ...(key ? { continuation_key: key } : {}),
    });
    for (const raw of res.transactions ?? []) {
      const tx = normalizeTx(raw, account);
      if (tx) out.push(tx);
    }
    key = res.continuation_key;
    if (!key) break;
  }
  return out;
}

/** Ends the session, which also closes the consent at the bank where the bank allows it. */
export async function deleteSession(jwt: string, sessionId: string): Promise<void> {
  await call(jwt, 'DELETE', `/sessions/${sessionId}`);
}
