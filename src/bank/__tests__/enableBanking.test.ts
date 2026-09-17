import { describe, expect, it } from 'vitest';
import { KeyFileError, appIdFromFileName, importPem, normalizeTx, pickBalance, signJwt } from '../enableBanking';

const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString());

describe('signJwt', () => {
  it('signs a short-lived RS256 token the public key verifies', async () => {
    const pair = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['sign', 'verify'],
    );
    const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64');
    const key = await importPem(`-----BEGIN PRIVATE KEY-----\n${pkcs8.replace(/(.{64})/g, '$1\n')}\n-----END PRIVATE KEY-----\n`);
    expect(key.extractable).toBe(false);

    const jwt = await signJwt(key, 'app-1', new Date('2026-09-17T12:00:00Z'));
    const [head, body, signature] = jwt.split('.');
    const iat = Date.parse('2026-09-17T12:00:00Z') / 1000;
    expect(decode(head)).toEqual({ typ: 'JWT', alg: 'RS256', kid: 'app-1' });
    expect(decode(body)).toEqual({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat, exp: iat + 600 });
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', pair.publicKey, Buffer.from(signature, 'base64url'), Buffer.from(`${head}.${body}`));
    expect(valid).toBe(true);
  });

  it('says what is wrong with a key file it cannot read', async () => {
    await expect(importPem('-----BEGIN RSA PRIVATE KEY-----\nAAAA\n-----END RSA PRIVATE KEY-----')).rejects.toMatchObject({ problem: 'pkcs1' });
    await expect(importPem('hello')).rejects.toBeInstanceOf(KeyFileError);
    await expect(importPem('-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----')).rejects.toMatchObject({ problem: 'unreadable' });
  });
});

describe('appIdFromFileName', () => {
  it('reads the id out of the name of the downloaded file', () => {
    expect(appIdFromFileName('FA40B2BC-f126-4013-8345-09bf45264764 (1).pem')).toBe('fa40b2bc-f126-4013-8345-09bf45264764');
    expect(appIdFromFileName('key.pem')).toBeNull();
  });
});

describe('pickBalance', () => {
  const b = (balance_type: string, amount: string) => ({ balance_type, balance_amount: { amount, currency: 'SEK' } });

  it('prefers the intraday figures and keeps booked and available apart', () => {
    expect(pickBalance([b('CLBD', '100'), b('ITBD', '90'), b('CLAV', '80'), b('ITAV', '70.50')])).toEqual({ available: 70.5, booked: 90, currency: 'SEK' });
    expect(pickBalance([b('CLBD', '100')])).toEqual({ available: undefined, booked: 100, currency: 'SEK' });
  });

  it('is null when the bank gave nothing usable', () => {
    expect(pickBalance([])).toBeNull();
    expect(pickBalance([b('INFO', '5'), b('ITAV', 'n/a')])).toBeNull();
  });
});

describe('normalizeTx', () => {
  const raw = { transaction_amount: { amount: '250.00', currency: 'SEK' }, booking_date: '2026-09-10', debtor: { name: 'Payer' }, creditor: { name: 'Shop' }, remittance_information: ['Ref', '123'] };

  it('signs the amount by direction and names the other side', () => {
    expect(normalizeTx({ ...raw, credit_debit_indicator: 'CRDT', status: 'BOOK' }, 'h')).toEqual({ account: 'h', date: '2026-09-10', amount: 250, currency: 'SEK', counterparty: 'Payer', counterpartyIban: undefined, description: 'Ref 123' });
    expect(normalizeTx({ ...raw, credit_debit_indicator: 'DBIT', status: 'PDNG' }, 'h')).toMatchObject({ amount: -250, counterparty: 'Shop', pending: true });
  });

  it('drops a line without a usable amount or date', () => {
    expect(normalizeTx({ ...raw, transaction_amount: { amount: 'n/a', currency: 'SEK' } }, 'h')).toBeNull();
    expect(normalizeTx({ transaction_amount: raw.transaction_amount }, 'h')).toBeNull();
  });
});
