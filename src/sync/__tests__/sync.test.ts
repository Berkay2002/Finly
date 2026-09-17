import { describe, expect, it } from 'vitest';
import { NOW, prdExamplePlan } from '@/engine/__tests__/fixtures';
import { buildSnapshot } from '@/engine/history';
import { decryptJson, deriveKey, deriveSyncId, encryptJson, fromHex, generateSecret, toHex } from '../crypto';
import { PhraseError, describePhraseError, normalizePhrase, phraseToSecret, secretToPhrase } from '../phrase';
import { fromPayload, resolveConflict, toPayload } from '../resolve';

describe('phrase', () => {
  it('round-trips a random secret through 12 words', () => {
    for (let i = 0; i < 20; i++) {
      const secret = generateSecret();
      const words = secretToPhrase(secret);
      expect(words).toHaveLength(12);
      expect(toHex(phraseToSecret(words))).toBe(toHex(secret));
    }
  });

  it('normalises case and whitespace', () => {
    const words = secretToPhrase(generateSecret());
    const typed = `  ${words.slice(0, 6).join('   ').toUpperCase()}\n${words.slice(6).join(' ')} `;
    expect(normalizePhrase(typed)).toEqual(words);
  });

  it('names the problem with a bad phrase', () => {
    const words = secretToPhrase(generateSecret());
    expect(() => phraseToSecret(words.slice(0, 11))).toThrow(PhraseError);
    expect(describePhraseError(new PhraseError('length'))).toContain('12 words');
    expect(() => phraseToSecret([...words.slice(0, 11), 'finly'])).toThrow(expect.objectContaining({ problem: 'word', word: 'finly' }));
    // swap the first two words: still valid words, checksum (almost surely) fails
    const swapped = [words[1], words[0], ...words.slice(2)];
    if (swapped.join() !== words.join()) {
      let problem: string | undefined;
      try {
        phraseToSecret(swapped);
      } catch (e) {
        problem = (e as PhraseError).problem;
      }
      expect(problem === 'checksum' || problem === undefined).toBe(true);
    }
  });
});

describe('crypto', () => {
  it('derives a stable 64-hex id that differs from the key material', async () => {
    const secret = fromHex('7f'.repeat(16));
    const id = await deriveSyncId(secret);
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    expect(await deriveSyncId(secret)).toBe(id);
    expect(await deriveSyncId(generateSecret())).not.toBe(id);
  });

  it('encrypts and decrypts a whole plan with history, with a fresh IV each time', async () => {
    const key = await deriveKey(generateSecret());
    const plan = prdExamplePlan();
    const payload = toPayload({ plan, snapshots: { '2026-08': buildSnapshot(plan, '2026-08', NOW) } });
    const a = await encryptJson(key, payload);
    const b = await encryptJson(key, payload);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    const back = fromPayload(await decryptJson(key, a));
    expect(back.plan.userName).toBe('Test');
    expect(back.snapshots['2026-08'].plan?.expenses).toHaveLength(plan.expenses.length);
    // gzip earns its keep: the blob is a fraction of the JSON
    expect(a.ciphertext.length).toBeLessThan(JSON.stringify(payload).length / 3);
  });

  it('rejects a wrong key and tampered data', async () => {
    const key = await deriveKey(generateSecret());
    const sealed = await encryptJson(key, { hello: 1 });
    await expect(decryptJson(await deriveKey(generateSecret()), sealed)).rejects.toThrow();
    const tampered = { ...sealed, ciphertext: sealed.ciphertext.slice(0, -4) + 'AAAA' };
    await expect(decryptJson(key, tampered)).rejects.toThrow();
    expect(() => fromPayload({ hello: 1 })).toThrow();
  });

  it('carries the bank key only when it is shared, and never inside the plan', () => {
    const data = { plan: prdExamplePlan(), snapshots: {} };
    expect('bankKey' in toPayload(data)).toBe(false);
    expect('bankKey' in fromPayload(toPayload(data))).toBe(false);
    const shared = toPayload(data, '-----BEGIN PRIVATE KEY-----');
    expect(fromPayload(shared).bankKey).toBe('-----BEGIN PRIVATE KEY-----');
    expect(JSON.stringify(shared.plan)).not.toContain('PRIVATE KEY');
    expect(fromPayload({ ...shared, bankKey: 42 }).bankKey).toBeUndefined();
  });
});

describe('resolveConflict', () => {
  const at = (iso: string) => {
    const plan = prdExamplePlan();
    plan.updatedAt = iso;
    return plan;
  };

  it('lets the newer plan win and keeps every closed month', () => {
    const older = at('2026-09-01T10:00:00.000Z');
    const newer = at('2026-09-02T10:00:00.000Z');
    const snapA = buildSnapshot(older, '2026-07', NOW);
    const snapB = buildSnapshot(newer, '2026-08', NOW);
    const shared = { ...buildSnapshot(newer, '2026-06', NOW), income: 1 };
    const r = resolveConflict(
      { plan: older, snapshots: { '2026-07': snapA, '2026-06': { ...shared, income: 2 } } },
      { plan: newer, snapshots: { '2026-08': snapB, '2026-06': shared } },
    );
    expect(r.winner).toBe('remote');
    expect(r.merged.plan.updatedAt).toBe(newer.updatedAt);
    expect(Object.keys(r.merged.snapshots).sort()).toEqual(['2026-06', '2026-07', '2026-08']);
    expect(r.merged.snapshots['2026-06'].income).toBe(1);
  });

  it('keeps the local copy on a tie', () => {
    const a = at('2026-09-01T10:00:00.000Z');
    const b = at('2026-09-01T10:00:00.000Z');
    b.userName = 'Other';
    expect(resolveConflict({ plan: a, snapshots: {} }, { plan: b, snapshots: {} }).winner).toBe('local');
  });
});
