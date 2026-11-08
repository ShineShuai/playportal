// Shared by the build (Node) and the page (browser). It knows no answer: only how to seal and
// open. In the page an answer exists only as ciphertext (the links), hashes (the hint table) and
// encoded text (pool and clues; obfuscation, not secrecy).
const enc = new TextEncoder();
const dec = new TextDecoder();
export const SALT = 'play:v1';
export const ITER = 100_000;
export const TAG_BYTES = 5;

export const key = (tokens) => [...tokens].map((t) => t.toLowerCase()).sort().join('');
export const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
export const b64 = (b) => {
  let s = '';
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192));
  return btoa(s);
};
export const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const encode = (value) => b64(enc.encode(JSON.stringify(value)));
export const decode = (s) => JSON.parse(dec.decode(unb64(s)));

async function derive(k) {
  const { subtle } = globalThis.crypto;
  const base = await subtle.importKey('raw', enc.encode(k), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(
    await subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(SALT), iterations: ITER }, base, 480),
  );
  const aes = await subtle.importKey('raw', bits.slice(0, 32), 'AES-GCM', false, ['encrypt', 'decrypt']);
  return { id: hex(bits.slice(32, 40)), iv: bits.slice(40, 52), aes };
}

/** -> [id, ciphertext]; the key is unique per entry, so the derived IV is never reused. */
export async function seal(k, payload) {
  const { id, iv, aes } = await derive(k);
  const ct = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, aes, enc.encode(JSON.stringify(payload)));
  return [id, b64(new Uint8Array(ct))];
}

/** The payload, or null when the multiset opens nothing. */
export async function open(k, seals) {
  const { id, iv, aes } = await derive(k);
  if (!seals[id]) return null;
  try {
    const pt = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aes, unb64(seals[id]));
    return JSON.parse(dec.decode(pt));
  } catch {
    return null;
  }
}

/** Short hash of a sorted token string (a sub-multiset of an answer). */
export async function tag(k) {
  const d = await globalThis.crypto.subtle.digest('SHA-256', enc.encode(`hint:${SALT}:${k}`));
  return hex(new Uint8Array(d).subarray(0, TAG_BYTES));
}

/** The Set of tags carried by the page (concatenated TAG_BYTES hashes, base64). */
export function tagSet(s) {
  const b = unb64(s);
  const set = new Set();
  for (let i = 0; i + TAG_BYTES <= b.length; i += TAG_BYTES) set.add(hex(b.subarray(i, i + TAG_BYTES)));
  return set;
}

/** How many of the tokens fit an answer: the size of the largest sub-multiset found in the table. */
export async function fitOf(tokens, tags) {
  const t = [...tokens].map((c) => c.toLowerCase()).sort();
  const masks = Array.from({ length: (1 << t.length) - 1 }, (_, i) => i + 1);
  const size = (m) => t.reduce((n, _, i) => n + ((m >> i) & 1), 0);
  masks.sort((a, b) => size(b) - size(a));
  const seen = new Set();
  for (const m of masks) {
    const k = t.filter((_, i) => (m >> i) & 1).join('');
    if (seen.has(k)) continue;
    seen.add(k);
    if (tags.has(await tag(k))) return k.length;
  }
  return 0;
}
