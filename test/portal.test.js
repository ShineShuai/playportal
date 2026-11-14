import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import { decode, fitOf, key, open, seal, tagSet } from '../src/match.js';
import { build } from '../tools/build.js';
import { active, binding, checkWrangler, contrastOnWhite, loadConfig } from '../tools/manifest.js';
import { accepted, poolOf } from '../tools/seal.js';
import { loadStyles, registry, scope, selectStyles, templates } from '../tools/styles.js';

const game = (name, extra = {}) => ({
  slug: name, name, worker: `${name}-site`, blurb: { en: 'A blurb.', zh: '说明。' }, hint: { en: 'A hint.', zh: '提示。' }, ...extra,
});
const zigzag = game('zigzag', { alias: { z: ['2'], i: ['1'], g: ['9'], a: ['2', '0'] } });
const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
const tmp = (name) => mkdtempSync(join(tmpdir(), `${name}-`));
const config = loadConfig(); // the real one
const out = tmp('play');
const { data, styles: shipped } = await build(out, 'test', config); // what production ships
// Answer-specific tests use a fixed puzzle, so they do not depend on the real answers.
const fx = await build(tmp('play-fx'), 'test', { ...config, games: [zigzag] });

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
  const tags = tagSet(fx.data.tags);
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
  for (const k of ['aggizz', key('221gga')]) assert.equal((await open(k, fx.data.seals)).u, '/zigzag/');
});

test('the pool is a shuffled bag with every needed token; clues decode', () => {
  const pool = decode(fx.data.pool);
  assert.deepEqual([...pool].sort(), [...poolOf(fx.games, config.puzzle.decoys)].sort());
  assert.notEqual(pool.slice(0, 6).join(''), 'zigzag');
  assert.deepEqual(decode(Object.values(fx.data.clues)[0]), fx.games[0].hint);
});

test('portal.config.json is valid and wrangler.toml matches it', async () => {
  assert.deepEqual(checkWrangler(config.games, toml), []);
  assert.deepEqual(Object.keys(config.styles.enabled).sort(), (await loadStyles()).map((x) => x.id));
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
    assert.ok(!text.includes('portal.config'), `${f} names the config`);
    for (const g of config.games) { // also the disabled ones
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
  assert.deepEqual(styles.map((x) => x.id), Object.keys(config.styles.enabled).sort());
  for (const x of styles) {
    assert.ok(x.css.includes(`:root[data-style="${x.id}"]`), x.id);
    assert.ok(/^[\s\S]*:root\[data-style="[a-z-]+"\]\[data-theme="dark"\]/.test(x.css), `${x.id} has no dark mode`);
  }
  assert.deepEqual(Object.keys(registry(styles)[0]).sort(), ['id', 'motion', 'name', 'themeColor']);
});

test('style validation: a broken style is reported, a good one is accepted', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'styles-'));
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
  const on = Object.keys(config.styles.enabled).filter((id) => config.styles.enabled[id]);
  assert.deepEqual(shipped.map((x) => x.id), on.sort());
  for (const { id, decor } of shipped) {
    assert.ok(css.includes(`/* style: ${id} */`), id);
    assert.ok(html.includes(`"id":"${id}"`), id);
    for (const slot of Object.keys(decor)) {
      assert.ok(html.includes(`<template data-decor="${id}" data-slot="${slot}">`), `${id} ${slot}`);
    }
  }
  assert.ok(!/<template[^>]*>[^]*?\sstyle\s*=/.test(html), 'decoration must not use style attributes (CSP)');
});

// ---- the config ----------------------------------------------------------------------------
const cheap = { ...config, games: [game('abc')] }; // one door: a build in a blink

test('config validation: mistakes are reported, without letters; a disabled game may share a set', () => {
  const dir = tmp('cfg');
  const check = (cfg) => {
    const file = join(dir, 'c.json');
    writeFileSync(file, JSON.stringify(cfg));
    try { loadConfig(file); } catch (e) { return e.message; }
    return '';
  };
  const base = { styles: { enabled: { a: true } }, puzzle: { decoys: 'xy' }, games: [zigzag] };
  assert.equal(check(base), '');
  assert.match(check({ ...base, extra: 1 }), /unknown key "extra"/);
  assert.match(check({ ...base, puzzle: { decoys: 'A!' } }), /puzzle\.decoys/);
  assert.match(check({ ...base, styles: { enabled: { a: 'yes' } } }), /styles\.enabled\.a/);
  assert.match(check({ ...base, games: [{ ...zigzag, hints: {} }] }), /unknown key "hints"/);
  assert.match(check({ ...base, games: [{ ...zigzag, enabled: false }] }), /at least one game/);
  const twin = { ...game('other'), name: 'zigzag' };
  const msg = check({ ...base, games: [zigzag, twin] });
  assert.match(msg, /shares an accepted letter set/);
  assert.ok(!msg.includes('aggizz'), 'no letters in messages');
  assert.equal(check({ ...base, games: [zigzag, { ...twin, enabled: false }] }), '');
  assert.deepEqual(active([zigzag, { ...twin, enabled: false }]), [zigzag]);
});

test('selectStyles: config and folders must agree; a disabled style is dropped', () => {
  const all = [{ id: 'a' }, { id: 'b' }];
  assert.deepEqual(selectStyles(all, { a: true, b: false }).map((x) => x.id), ['a']);
  assert.throws(() => selectStyles(all, { a: true }), /"b".*not in styles\.enabled/);
  assert.throws(() => selectStyles(all, { a: true, b: true, c: true }), /"c".*no folder/);
});

test('a disabled style ships nothing: no css, template, registry entry or font', async () => {
  const all = await loadStyles();
  const off = all.find((x) => x.decor.field) ?? all[0];
  const own = off.fonts.filter((f) => !all.some((y) => y !== off && y.fonts.includes(f)));
  const dir = tmp('off');
  await build(dir, 'test', { ...cheap, styles: { enabled: { ...config.styles.enabled, [off.id]: false } } });
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  assert.ok(!readFileSync(join(dir, 'portal.css'), 'utf8').includes(`style: ${off.id} `));
  assert.ok(!html.includes(`"id":"${off.id}"`) && !html.includes(`data-decor="${off.id}"`));
  assert.ok(html.includes(`"id":"${shipped[0].id === off.id ? shipped[1].id : shipped[0].id}"`));
  for (const f of own) {
    assert.ok(!readdirSync(join(dir, 'fonts')).includes(`${f}.woff2`), f);
    assert.ok(!readFileSync(join(dir, 'fonts.css'), 'utf8').includes(`/fonts/${f}.woff2`), f);
  }
});

test('with every style disabled the page falls back to the plain css', async () => {
  const dir = tmp('none');
  const enabled = Object.fromEntries(Object.keys(config.styles.enabled).map((id) => [id, false]));
  await build(dir, 'test', { ...cheap, styles: { enabled } });
  assert.ok(readFileSync(join(dir, 'index.html'), 'utf8').includes('id="styles">[]</script>'));
  assert.ok(!readdirSync(dir).includes('fonts'));
});

test('a disabled game ships nothing: no door, seal, letter, hint or length', async () => {
  const hidden = { ...game('qwxyk'), enabled: false, blurb: { en: 'Hidden blurb.', zh: '隐藏。' }, hint: { en: 'Hidden hint.', zh: '隐藏提示。' } };
  const dir = tmp('game');
  const res = await build(dir, 'test', { ...config, games: [game('abc'), hidden], puzzle: { decoys: '' } });
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  assert.equal(html.match(/<li class="game"/g).length, 1);
  assert.deepEqual(res.data.lens, [3]);
  assert.deepEqual([...decode(res.data.pool)].sort(), ['a', 'b', 'c']);
  assert.equal(Object.keys(res.data.clues).length, 1);
  assert.ok(!html.includes('Hidden'));
});

test('decoys come from the config', async () => {
  const res = await build(tmp('decoy'), 'test', { ...cheap, puzzle: { decoys: '77' } });
  assert.deepEqual([...decode(res.data.pool)].sort(), ['7', '7', 'a', 'b', 'c']);
});
