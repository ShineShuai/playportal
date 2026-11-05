// Shared by the build (Node) and the page (browser). A game opens when the collected tokens
// form one of its accepted multisets; the link is sealed under a key derived from that multiset.
const enc = new TextEncoder();
const dec = new TextDecoder();
export const SALT = 'play:v1';
export const ITER = 100_000;

export const key = (tokens) => [...tokens].map((t) => t.toLowerCase()).sort().join('');

/** Every token multiset that spells `name`: a letter may be replaced by one of its aliases. */
export function accepted(name, alias = {}) {
  let sets = new Set(['']);
  for (const ch of name) {
    const next = new Set();
    for (const s of sets) for (const o of [ch, ...(alias[ch] ?? [])]) next.add(key(s + o));
    sets = next;
  }
  return sets;
}

/** What drifts over the page: every letter and every alias as often as it can be needed. */
export function poolOf(games, decoys = 'eorst8') {
  const pool = [];
  for (const { name, alias = {} } of games) {
    const count = {};
    for (const ch of name) {
      count[ch] = (count[ch] ?? 0) + 1;
      pool.push(ch);
    }
    for (const [ch, list] of Object.entries(alias)) {
      for (const t of list) pool.push(...Array(count[ch] ?? 1).fill(t));
    }
  }
  return [...pool, ...decoys];
}

const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const b64 = (b) => btoa(String.fromCharCode(...b));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

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
