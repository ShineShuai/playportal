import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import { decode, fitOf, key, open, seal, tagSet } from '../src/match.js';
import { build } from '../tools/build.js';
import { binding, checkWrangler, contrastOnWhite, load } from '../tools/manifest.js';
import { accepted, poolOf } from '../tools/seal.js';
import { loadStyles, registry, scope, templates } from '../tools/styles.js';

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
    ['.assetsignore', '_headers', 'build.json', 'index.html', 'lang.js', 'match.js', 'portal.css', 'portal.js', 'style.js', 'theme.js']);
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

// ---- the style set -------------------------------------------------------------------------
const STYLE_IDS = ['arcade', 'aurora', 'bauhaus', 'bento', 'clay', 'orbit', 'rebus', 'sunrise', 'tiles'];
const styleSrc = readFileSync(new URL('../src/style.js', import.meta.url), 'utf8');
function runStyle(list, { search = '', date = new Date(2026, 10, 11) } = {}) {
  const attrs = {};
  const metas = ['light', 'dark'].map((m) => ({ media: `(prefers-color-scheme: ${m})`, content: '',
    getAttribute(k) { return k === 'media' ? this.media : null; }, setAttribute(k, v) { if (k === 'content') this.content = v; } }));
  const ctx = {
    document: { documentElement: { setAttribute: (k, v) => { attrs[k] = v; } }, getElementById: () => ({ textContent: JSON.stringify(list) }), querySelectorAll: () => metas },
    location: { search },
    Date: class extends Date { constructor(...a) { super(...(a.length ? a : [date])); } },
  };
  ctx.window = ctx;
  vm.runInNewContext(styleSrc, ctx);
  return { attrs, metas, api: ctx.portalStyle };
}
const fake = (id) => ({ id, name: id, themeColor: { light: '#ffffff', dark: '#000000' } });

test('scope: every rule is scoped to its style; keyframes stay global; groups recurse', () => {
  const out = scope(':root{--a:1}\n:root[data-theme="dark"]{--a:2}\nh1, .x > p:not(.y){color:red}\n@media (min-width: 900px){ main{margin:0} }\n@keyframes k{from{opacity:0}to{opacity:1}}\nhtml[data-lang="zh"] h1{x:y}', 'orbit');
  assert.ok(out.includes(':root[data-style="orbit"]{--a:1}'));
  assert.ok(out.includes(':root[data-style="orbit"][data-theme="dark"]{--a:2}'));
  assert.ok(out.includes(':root[data-style="orbit"] h1, :root[data-style="orbit"] .x > p:not(.y){color:red}'));
  assert.ok(out.includes('@media (min-width: 900px){\n:root[data-style="orbit"] main{margin:0}'));
  assert.ok(out.includes('@keyframes k{from{opacity:0}to{opacity:1}}'));
  assert.ok(out.includes('html[data-style="orbit"][data-lang="zh"] h1{x:y}'));
  assert.throws(() => scope('a{b:c', 'x'), /unbalanced/);
  assert.throws(() => scope('a{b{c:d}}', 'x'), /nested/);
  assert.throws(() => scope('@import "x";\na{b:c}', 'x'));
});

test('the style set loads, is sorted and validated', async () => {
  const styles = await loadStyles();
  assert.deepEqual(styles.map((x) => x.id), STYLE_IDS);
  for (const x of styles) {
    assert.ok(x.css.includes(`:root[data-style="${x.id}"]`), x.id);
    assert.ok(/^[\s\S]*:root\[data-style="[a-z-]+"\]\[data-theme="dark"\]/.test(x.css), `${x.id} has no dark mode`);
  }
  assert.deepEqual(Object.keys(registry(styles)[0]).sort(), ['id', 'motion', 'name', 'themeColor']);
});

test('style validation: a broken style is reported, a good one is accepted', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'styles-'));
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const add = (id, meta, css = ':root{--a:1}', decor = {}) => {
    mkdirSync(join(dir, id), { recursive: true });
    writeFileSync(join(dir, id, 'style.json'), JSON.stringify(meta));
    if (css !== null) writeFileSync(join(dir, id, 'style.css'), css);
    for (const [slot, html] of Object.entries(decor)) writeFileSync(join(dir, id, `decor-${slot}.html`), html);
  };
  const ok = { id: 'good', name: 'Good', themeColor: { light: '#ffffff', dark: '#000000' } };
  add('good', ok, ':root{--a:1}', { field: '<i class="x">{{TOTAL}}</i>' });
  const root = new URL(`file://${dir}/`);
  const styles = await loadStyles(root);
  assert.equal(styles[0].motion.type, 'rise');
  assert.equal(templates(styles, 3), '<template data-decor="good" data-slot="field"><i class="x">3</i></template>');
  add('wrongid', { ...ok, id: 'other' });
  add('nocolor', { id: 'nocolor', name: 'x', themeColor: { light: 'white', dark: '#000000' } });
  add('badorbit', { ...ok, id: 'badorbit', motion: { type: 'orbit' } });
  add('csp', { ...ok, id: 'csp' }, ':root{--a:1}', { head: '<i style="color:red"></i>' });
  add('nocss', { ...ok, id: 'nocss' }, null);
  const err = await loadStyles(root).catch((e) => e.message);
  for (const needle of ['"wrongid"', '"nocolor"', '"badorbit"', '"csp"', '"nocss"']) assert.ok(err.includes(needle), needle);
});

test('style.js: one style a day, never the same twice in a row, every style turns up', () => {
  const { api } = runStyle([fake('a'), fake('b')]);
  for (let n = 1; n <= 8; n++) {
    const seen = new Set();
    let last = -1;
    for (let day = 20_000; day < 22_000; day++) {
      const i = api.pick(n, day);
      assert.ok(i >= 0 && i < n);
      if (n > 1) assert.notEqual(i, last, `n=${n} day=${day}`);
      assert.equal(i, api.pick(n, day)); // the same all day
      seen.add(i);
      last = i;
    }
    assert.equal(seen.size, n, `n=${n}`);
  }
});

test('style.js: sets data-style and the browser colours; ?style= previews; empty set is harmless', () => {
  const list = [fake('x'), { ...fake('y'), themeColor: { light: '#111111', dark: '#222222' } }];
  const a = runStyle(list);
  assert.equal(a.attrs['data-style'], list[a.api.pick(2, a.api.today())].id);
  const b = runStyle(list, { search: '?style=y' });
  assert.equal(b.attrs['data-style'], 'y');
  assert.deepEqual(b.metas.map((m) => m.content), ['#111111', '#222222']);
  assert.equal(runStyle(list, { search: '?style=nope' }).attrs['data-style'], a.attrs['data-style'] === 'x' ? 'x' : 'y' && a.attrs['data-style']);
  assert.equal(runStyle([]).attrs['data-style'], undefined);
  assert.equal(runStyle([fake('only')]).attrs['data-style'], 'only');
});

test('the build ships every style: scoped css, inert decoration templates, the registry', () => {
  const css = readFileSync(join(out, 'portal.css'), 'utf8');
  const html = readFileSync(join(out, 'index.html'), 'utf8');
  for (const id of STYLE_IDS) {
    assert.ok(css.includes(`/* style: ${id} */`), id);
    assert.ok(html.includes(`"id":"${id}"`), id);
  }
  for (const id of ['arcade', 'aurora', 'clay', 'orbit']) {
    assert.ok(html.includes(`<template data-decor="${id}" data-slot="field">`), id);
  }
  assert.ok(html.includes('<template data-decor="rebus" data-slot="head">'));
  assert.ok(!/<template[^>]*>[^]*?\sstyle\s*=/.test(html), 'decoration must not use style attributes (CSP)');
});
