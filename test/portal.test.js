import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { decode, fitOf, key, open, seal, tagSet } from '../src/match.js';
import { build } from '../tools/build.js';
import { binding, checkWrangler, contrastOnWhite, load } from '../tools/manifest.js';
import { accepted, poolOf } from '../tools/seal.js';

const zigzag = { name: 'zigzag', alias: { z: ['2'], i: ['1'], g: ['9'], a: ['2', '0'] } };
const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
const out = mkdtempSync(join(tmpdir(), 'play-'));
const { games, data } = await build(out, 'test'); // one build for the tests below

/** Reference for the hint: maximum matching of tokens to distinct letters of the name. */
function fitRef(tokens, { name, alias = {} }) {
  const owner = Array(name.length).fill(-1);
  const can = (t, j) => t === name[j] || (alias[name[j]] ?? []).includes(t);
  const place = (i, seen) => {
    for (let j = 0; j < name.length; j++) {
      if (!can(tokens[i], j) || seen[j]) continue;
      seen[j] = true;
      if (owner[j] < 0 || place(owner[j], seen)) { owner[j] = i; return true; }
    }
    return false;
  };
  return tokens.reduce((n, _, i) => n + (place(i, []) ? 1 : 0), 0);
}

test('zigzag accepts the plain name and the digit forms', () => {
  const ok = accepted(zigzag.name, zigzag.alias);
  // 2xz 1xi 2xg 1xa, then the two sets of the brief: 2x2 1x1 2xg 1x2 and 2x2 1x1 2xg 1xa
  for (const t of ['zigzag', 'gzzgia', '221gg2', '221gga', '221990', 'z2i9ga']) {
    assert.ok(ok.has(key(t)), t);
  }
  for (const t of ['zigza', 'zigzagg', 'zigzig', 'qigzag', '2219g3']) assert.ok(!ok.has(key(t)), t);
});

test('keys ignore order and case', () => assert.equal(key('ZiG'), key('gZi')));

test('the hint table gives the same count as a maximum matching', async () => {
  const tags = tagSet(data.tags);
  const alphabet = [...'zigzag2190eorst8qx'];
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let n = 0; n < 150; n++) {
    const tray = Array.from({ length: 6 }, () => alphabet[Math.floor(rnd() * alphabet.length)]);
    assert.equal(await fitOf(tray, tags), fitRef(tray, zigzag), tray.join(''));
  }
  assert.equal(await fitOf([...'zigzag'], tags), 6);
  assert.equal(await fitOf([...'qqqqqq'], tags), 0);
});

test('seal and open round-trip; a wrong set opens nothing', async () => {
  const [id, ct] = await seal('aggizz', { u: '/zigzag/' });
  assert.deepEqual(await open('aggizz', { [id]: ct }), { u: '/zigzag/' });
  assert.equal(await open('aggizy', { [id]: ct }), null);
  for (const k of ['aggizz', key('221gga')]) assert.equal((await open(k, data.seals)).u, '/zigzag/');
});

test('the pool is a shuffled bag with every needed token; clues decode', () => {
  const pool = decode(data.pool);
  assert.deepEqual([...pool].sort(), [...poolOf(games)].sort());
  assert.notEqual(pool.slice(0, 6).join(''), 'zigzag');
  assert.deepEqual(decode(Object.values(data.clues)[0]), games[0].hint);
});

test('games.json is valid and wrangler.toml matches it', () => {
  assert.deepEqual(checkWrangler(load(), toml), []);
  assert.equal(binding('a-b'), 'GAME_A_B');
});

test('wrangler check reports a missing game', () => {
  assert.equal(checkWrangler([{ slug: 'x', worker: 'x-site' }], toml).length, 3);
});

test('the build ships no plain answer: no name, link, hint or letter list', () => {
  assert.deepEqual(Object.keys(data).sort(), ['clues', 'lens', 'pool', 'seals', 'tags']);
  assert.deepEqual(readdirSync(out).filter((f) => !f.startsWith('fonts')).sort(),
    ['.assetsignore', '_headers', 'build.json', 'index.html', 'lang.js', 'match.js', 'portal.css', 'portal.js', 'theme.js']);
  for (const f of readdirSync(out).filter((n) => /\.(html|js|css|json)$/.test(n))) {
    const text = readFileSync(join(out, f), 'utf8');
    for (const g of games) {
      assert.ok(!new RegExp(`\\b${g.name}\\b`, 'i').test(text), `${f} contains "${g.name}"`);
      assert.ok(!text.includes(`/${g.slug}/`), `${f} contains the link of ${g.slug}`);
      assert.ok(!text.includes(g.hint.en) && !text.includes(g.hint.zh), `${f} contains a hint`);
      assert.ok(!text.includes(poolOf([g]).join('')), `${f} contains the letter list`);
    }
  }
  assert.ok(readFileSync(join(out, '_headers'), 'utf8').includes("default-src 'none'")); // no requests at all
});

test('accent contrast: blue passes, a light colour does not', () => {
  assert.ok(contrastOnWhite('#3b68ee') >= 4.5);
  assert.ok(contrastOnWhite('#ff9f1c') < 4.5);
});
