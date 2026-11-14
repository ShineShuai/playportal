// Build only: everything that knows an answer. The page gets ciphertext and hashes from here.
import { b64, encode, seal, tag } from '../src/match.js';
import { key } from '../src/match.js';

export const MAX_TAGS = 13_000; // 5 bytes each: about 64 KB of hint table on the page

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
export function poolOf(games, decoys = '') {
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

function shuffled(items) { // fixed seed: the same build gives the same page
  let s = 0x9e3779b9;
  const rnd = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Every non-empty sub-multiset (as a key) of the given sets. */
export function subsets(sets) {
  const out = new Set();
  for (const a of sets) {
    for (let m = 1; m < 1 << a.length; m++) {
      let k = '';
      for (let i = 0; i < a.length; i++) if (m & (1 << i)) k += a[i];
      out.add(k);
    }
  }
  return out;
}

/** The data block of the page. No plain name, link, hint or letter list in it. */
export async function buildData(games, cardId, decoys = '') {
  const seals = {};
  await Promise.all(games.flatMap((g) => [...accepted(g.name, g.alias)].map(async (k) => {
    const [id, ct] = await seal(k, { i: cardId(g.slug), n: g.name, u: `/${g.slug}/` });
    seals[id] = ct;
  })));
  const all = new Set(games.flatMap((g) => [...subsets(accepted(g.name, g.alias))]));
  const tags = [...new Set(await Promise.all([...all].map(tag)))].sort();
  if (tags.length > MAX_TAGS) throw new Error(`hint table has ${tags.length} tags (max ${MAX_TAGS}): shorten names or aliases`);
  return {
    lens: [...new Set(games.map((g) => g.name.length))].sort((a, b) => a - b),
    pool: encode(shuffled(poolOf(games, decoys))),
    seals,
    tags: b64(Buffer.from(tags.join(''), 'hex')),
    clues: Object.fromEntries(games.map((g) => [cardId(g.slug), encode(g.hint)])),
  };
}
