/**
 * Everything that leaves the device goes through here. Web Crypto only, so it runs unchanged in
 * the browser and in Node for tests.
 *
 * From one 16-byte secret two independent values are derived with HKDF: a sync id the server
 * stores the blob under, and an AES-GCM key the server never sees. Knowing the id does not give
 * the key, and vice versa.
 */

const subtle = globalThis.crypto.subtle;
const SALT = new TextEncoder().encode('finly-sync-v1');
const ID_INFO = new TextEncoder().encode('finly-sync-id');
const KEY_INFO = new TextEncoder().encode('finly-sync-key');

export const SECRET_BYTES = 16;
export const IV_BYTES = 12;

/** TS 5.9 types `Uint8Array` over `ArrayBufferLike`; Web Crypto wants a plain `ArrayBuffer`. */
function buf(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function generateSecret(): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(SECRET_BYTES));
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) throw new Error('Not a hex string');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function hkdf(secret: Uint8Array, info: Uint8Array, bits: number): Promise<ArrayBuffer> {
  const base = await subtle.importKey('raw', buf(secret), 'HKDF', false, ['deriveBits']);
  return subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: buf(SALT), info: buf(info) }, base, bits);
}

/** 64 hex characters. Safe to hand to the server. */
export async function deriveSyncId(secret: Uint8Array): Promise<string> {
  return toHex(new Uint8Array(await hkdf(secret, ID_INFO, 256)));
}

/** AES-GCM-256, not extractable. Stays in the browser. */
export async function deriveKey(secret: Uint8Array): Promise<CryptoKey> {
  const raw = await hkdf(secret, KEY_INFO, 256);
  return subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export interface Sealed {
  ciphertext: string; // base64
  iv: string; // base64
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([buf(bytes)]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([buf(bytes)]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** JSON → gzip → AES-GCM with a fresh IV. Compression keeps years of history well under 1 MB. */
export async function encryptJson(key: CryptoKey, value: unknown): Promise<Sealed> {
  const plain = await gzip(new TextEncoder().encode(JSON.stringify(value)));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipher = await subtle.encrypt({ name: 'AES-GCM', iv: buf(iv) }, key, buf(plain));
  return { ciphertext: toBase64(new Uint8Array(cipher)), iv: toBase64(iv) };
}

/** Throws when the key is wrong or the data was tampered with. */
export async function decryptJson<T>(key: CryptoKey, sealed: Sealed): Promise<T> {
  const plain = await subtle.decrypt(
    { name: 'AES-GCM', iv: buf(fromBase64(sealed.iv)) },
    key,
    buf(fromBase64(sealed.ciphertext)),
  );
  const json = new TextDecoder().decode(await gunzip(new Uint8Array(plain)));
  return JSON.parse(json) as T;
}
