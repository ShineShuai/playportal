import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { accepted, key, open, poolOf, seal } from '../src/match.js';
import { build } from '../tools/build.js';
import { binding, checkWrangler, contrastOnWhite, load } from '../tools/manifest.js';

const zigzag = { name: 'zigzag', alias: { z: ['2'], i: ['1'], g: ['9'], a: ['2', '0'] } };
const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');

test('zigzag accepts the plain name and the digit forms', () => {
  const ok = accepted(zigzag.name, zigzag.alias);
  // 2xz 1xi 2xg 1xa, then the two sets of the brief: 2x2 1x1 2xg 1x2 and 2x2 1x1 2xg 1xa
  for (const t of ['zigzag', 'gzzgia', '221gg2', '221gga', '221990', 'z2i9ga']) {
    assert.ok(ok.has(key(t)), t);
  }
  for (const t of ['zigza', 'zigzagg', 'zigzig', 'qigzag', '2219g3']) assert.ok(!ok.has(key(t)), t);
});

test('keys ignore order and case', () => assert.equal(key('ZiG'), key('gZi')));

test('every accepted set has a letter or alias in the pool', () => {
  const pool = new Set(poolOf([zigzag]));
  for (const k of accepted(zigzag.name, zigzag.alias)) for (const t of k) assert.ok(pool.has(t), t);
});

test('seal and open round-trip; a wrong set opens nothing', async () => {
  const [id, ct] = await seal('aggizz', { u: '/zigzag/' });
  assert.deepEqual(await open('aggizz', { [id]: ct }), { u: '/zigzag/' });
  assert.equal(await open('aggizy', { [id]: ct }), null);
});

test('games.json is valid and wrangler.toml matches it', () => {
  const games = load();
  assert.deepEqual(checkWrangler(games, toml), []);
  assert.equal(binding('a-b'), 'GAME_A_B');
});

test('wrangler check reports a missing game', () => {
  const g = [{ slug: 'x', worker: 'x-site' }];
  assert.equal(checkWrangler(g, toml).length, 3);
});

test('the build seals every accepted set and never prints a name', async () => {
  const out = mkdtempSync(join(tmpdir(), 'play-'));
  const { games, data } = await build(out, 'test');
  const sets = games.reduce((n, g) => n + accepted(g.name, g.alias).size, 0);
  assert.equal(Object.keys(data.seals).length, sets);
  assert.deepEqual(readdirSync(out).filter((f) => !f.startsWith('fonts')).sort(),
    ['.assetsignore', '_headers', 'build.json', 'index.html', 'lang.js', 'match.js', 'portal.css', 'portal.js', 'theme.js']);
  for (const g of games) {
    const re = new RegExp(`\\b${g.name}\\b`, 'i');
    for (const f of ['index.html', 'portal.js', 'match.js']) {
      assert.ok(!re.test(readFileSync(join(out, f), 'utf8')), `${f} contains "${g.name}"`);
    }
    const hit = await open(key(g.name), data.seals);
    assert.equal(hit.u, `/${g.slug}/`);
    assert.equal(hit.n, g.name);
  }
});

test('accent contrast: blue passes, a light colour does not', () => {
  assert.ok(contrastOnWhite('#3b68ee') >= 4.5);
  assert.ok(contrastOnWhite('#ff9f1c') < 4.5);
});
