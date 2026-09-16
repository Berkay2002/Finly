import { entropyToMnemonic, mnemonicToEntropy } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

/** Why a typed phrase was rejected. */
export type PhraseProblem = 'length' | 'word' | 'checksum';

export class PhraseError extends Error {
  constructor(
    public readonly problem: PhraseProblem,
    public readonly word?: string,
  ) {
    super(problem);
    this.name = 'PhraseError';
  }
}

export const PHRASE_WORDS = 12;

/** Lower-cases, strips accents and splits on any whitespace. */
export function normalizePhrase(text: string): string[] {
  return text
    .normalize('NFKD')
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
}

/** 16 random bytes → 12 English words with the standard 4-bit checksum. */
export function secretToPhrase(secret: Uint8Array): string[] {
  return entropyToMnemonic(secret, wordlist).split(' ');
}

/** 12 words → the 16-byte secret. Throws `PhraseError` with the first problem found. */
export function phraseToSecret(words: string[]): Uint8Array {
  if (words.length !== PHRASE_WORDS) throw new PhraseError('length');
  const unknown = words.find((w) => !wordlist.includes(w));
  if (unknown !== undefined) throw new PhraseError('word', unknown);
  try {
    return mnemonicToEntropy(words.join(' '), wordlist);
  } catch {
    throw new PhraseError('checksum');
  }
}

/** A message the user can act on. */
export function describePhraseError(e: unknown): string {
  if (!(e instanceof PhraseError)) return 'That phrase could not be read.';
  switch (e.problem) {
    case 'length':
      return `A sync phrase has ${PHRASE_WORDS} words.`;
    case 'word':
      return `"${e.word}" is not a word from the list. Check the spelling.`;
    case 'checksum':
      return 'The phrase does not check out. One word is probably wrong or out of order.';
  }
}
