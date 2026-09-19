import { describe, expect, it } from 'vitest';
import { encryptJson } from '@/sync/crypto';

/** The worker script decrypts what the app encrypted: the two must stay in step. */
describe('push-sw.js', () => {
  it('round-trips a reminder through finlyDecrypt', async () => {
    const g = globalThis as unknown as Record<string, unknown>;
    g.self = globalThis;
    g.addEventListener ??= () => undefined;
    // @ts-expect-error plain worker script, no types
    await import('../../../public/push-sw.js');
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const body = { title: 'Rent is due tomorrow', body: '9 500 kr', url: '/?open=bills' };
    const decrypt = (globalThis as unknown as { finlyDecrypt: (k: CryptoKey, s: unknown) => Promise<unknown> }).finlyDecrypt;
    expect(await decrypt(key, await encryptJson(key, body))).toEqual(body);
  });
});
