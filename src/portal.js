import { decode, fitOf, key, open, tagSet } from './match.js';

// Static page, no requests: an answer exists here only as ciphertext, hashes or encoded text.
const $ = (s, r = document) => r.querySelector(s);
const data = JSON.parse($('#data').textContent);
const pool = decode(data.pool);  // the letters that drift (a bag of them)
const tags = tagSet(data.tags);  // hashes behind the "N of M fit" hint
const MAX = Math.max(...data.lens);
const EVERY = 1500;          // ms between new letters
const SPEED = [26, 42];      // px/s a letter rises
const DENSITY = 28000;       // px² of sky per letter on screen
const TEXT = {
  en: {
    unlocked: 'Unlocked: {n}', take: 'collect', drop: 'remove', full: 'The row is full: remove a letter first.',
    fit: '{k} of {n} letters fit · {m} to swap',
  },
  zh: {
    unlocked: '已解锁：{n}', take: '收集', drop: '移除', full: '格子已满：请先移除一个字符。',
    fit: '{n} 个中 {k} 个正确 · 需换 {m} 个',
  },
};
const tx = (k, v = {}) => (TEXT[document.documentElement.dataset.lang] ?? TEXT.en)[k]
  .replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
const say = (text) => { $('#status').textContent = text; };
const rand = (a, b) => a + Math.random() * (b - a);
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } },
};
const field = $('#field');
const sky = $('#sky');
let tray = [];  // collected letters: the only row of slots
let trail = []; // the caught letters that stay in the sky {x, y, el}, in tray order (null: none)
let fails = 0;
const unlocked = store.get('portal.unlocked', {});

// ---- tray, trail and hint -----------------------------------------------------------------
const hideFit = () => { $('#fit').hidden = true; };
function showFit({ fit, of }) {
  if (fit === undefined) return;
  const text = tx('fit', { k: fit, n: of, m: of - fit });
  $('#fit').textContent = text;
  $('#fit').hidden = false;
  say(text);
}

function shake() {
  const bar = $('.bar');
  bar.classList.remove('shake');
  void bar.offsetWidth;
  bar.classList.add('shake');
}
$('.bar').addEventListener('animationend', (e) => {
  if (e.animationName === 'shake') e.currentTarget.classList.remove('shake');
});

function drawTray() {
  $('#slots').replaceChildren(...Array.from({ length: MAX }, (_, i) => {
    const full = i < tray.length;
    const el = document.createElement(full ? 'button' : 'span');
    el.className = 'slot';
    if (full) {
      el.type = 'button';
      el.textContent = tray[i];
      el.setAttribute('aria-label', `${tray[i]}: ${tx('drop')}`);
      el.onclick = () => removeAt(i);
    }
    return el;
  }));
}

const SVG = 'http://www.w3.org/2000/svg';
function node(tag, attrs) {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

/** The caught letters, joined in click order: nothing is joined before a click. */
function drawTrail() {
  const pts = trail.filter(Boolean);
  $('#trail').replaceChildren(...(pts.length > 1
    ? [node('polyline', { class: 'line', points: pts.map((p) => `${p.x},${p.y}`).join(' ') })]
    : []));
}

/** A caught letter stays where it was caught, lit, and clicking it takes it back out of the row. */
function pin(t, glyph) {
  const f = field.getBoundingClientRect();
  const x = glyph.left - f.left + glyph.width / 2;
  const y = glyph.top - f.top + glyph.height / 2;
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'pick';
  el.textContent = t;
  el.setAttribute('aria-label', `${t}: ${tx('drop')}`);
  el.style.cssText = `left:${x}px;top:${y}px`;
  el.onclick = () => removeAt(trail.findIndex((p) => p?.el === el));
  $('#picks').append(el);
  return { x, y, el };
}

function removeAt(i) {
  if (i < 0) return;
  tray.splice(i, 1);
  trail.splice(i, 1).forEach((p) => p?.el.remove());
  hideFit();
  drawTray();
  drawTrail();
}

function clearAll() {
  trail.forEach((p) => p?.el.remove());
  tray = [];
  trail = [];
  drawTray();
  drawTrail();
}

/** Do these letters open a game? A miss says how many of them fit. */
async function guess(letters) {
  const hit = await open(key(letters), data.seals);
  if (hit) return { ok: true, hit };
  const res = { ok: false, fit: await fitOf(letters, tags), of: letters.length };
  showFit(res);
  fails += 1;
  shake();
  if (fails >= 3) revealHints();
  return res;
}

async function add(t, point = null) {
  if (tray.length >= MAX) { say(tx('full')); shake(); return; }
  hideFit();
  tray.push(t);
  trail.push(point);
  drawTray();
  drawTrail();
  const snap = tray.join('');
  if (!data.lens.includes(snap.length)) return;
  const res = await guess(tray);
  if (res?.ok && snap === tray.join('')) { clearAll(); unlock(res.hit); }
}

// ---- games ------------------------------------------------------------------------------
function revealHints() { // the text clue is encoded in the page and decoded only now
  for (const li of document.querySelectorAll('.game:not(.open)')) {
    const el = $('.hint', li);
    const clue = data.clues[li.dataset.id];
    if (!el.hidden || !clue) continue;
    const h = decode(clue);
    el.replaceChildren(...['en', 'zh'].map((lang) => {
      const s = document.createElement('span');
      s.lang = lang;
      s.textContent = h[lang];
      return s;
    }));
    el.hidden = false;
  }
}

function reveal({ i, n, u }, fresh) {
  const li = $(`.game[data-id="${i}"]`);
  if (!li || !/^\/[a-z0-9-]+\/$/.test(u)) return;
  li.classList.add('open');
  li.classList.toggle('fresh', fresh);
  const name = document.createElement('strong');
  name.className = 'name';
  name.textContent = n;
  $('.meta', li).replaceChildren(name);
  $('.hint', li).hidden = true;
  const link = $('.play', li);
  link.href = u;
  link.hidden = false;
  document.querySelectorAll('.found').forEach((f) => { f.textContent = document.querySelectorAll('.game.open').length; });
  if (fresh) link.focus();
}

function unlock(hit) {
  unlocked[hit.i] = hit;
  store.set('portal.unlocked', unlocked);
  reveal(hit, true);
  say(tx('unlocked', { n: hit.n }));
}

// ---- drifting letters -------------------------------------------------------------------
let bag = [];
let live = 0;
let motionOff = store.get('portal.motion', 'on') === 'off';
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const capacity = () => Math.max(7, Math.min(16, Math.round((field.clientWidth * field.clientHeight) / DENSITY)));

function draw() { // a freshly shuffled bag: every needed letter turns up once per bag
  if (!bag.length) {
    bag = [...pool];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }
  return bag.pop();
}

function spawn(early) {
  const w = field.clientWidth;
  const h = field.clientHeight;
  if (motionOff || document.hidden || !w || live >= capacity()) return;
  const t = draw();
  const life = (h + 60) / rand(...SPEED);
  const b = document.createElement('button');
  const s = document.createElement('span');
  s.textContent = t;
  b.append(s);
  b.type = 'button';
  b.className = 'ch';
  b.setAttribute('aria-label', `${tx('take')} ${t}`);
  b.style.cssText = `left:${rand(4, Math.max(8, w - 52))}px;--life:${life}s;` +
    `--delay:${early ? -rand(0, life * 0.8) : 0}s;--from:${h + 10}px;--to:-50px;` +
    `--sway:${rand(6, 16)}px;--swt:${rand(4, 7)}s`;
  b.onclick = () => {
    if (tray.length >= MAX) { say(tx('full')); shake(); return; } // keep the letter on the page
    const point = pin(t, s.getBoundingClientRect()); // where the letter is drawn right now
    const next = document.activeElement === b ? b.nextElementSibling ?? sky.firstElementChild : null;
    b.remove();
    live -= 1;
    if (next && next !== b) next.focus();
    add(t, point);
  };
  b.addEventListener('animationend', (e) => { if (e.target === b) { b.remove(); live -= 1; } });
  sky.append(b);
  live += 1;
}

function setMotion(off) {
  motionOff = off || reduce.matches;
  sky.replaceChildren();
  live = 0;
  $('#pause').setAttribute('aria-pressed', String(motionOff));
  $('#shelf').hidden = !motionOff;
  if (!motionOff) for (let i = 0; i < Math.ceil(capacity() * 0.7); i++) spawn(true);
}

function drawShelf() { // the same letters without motion: one button each, unlimited supply
  $('#shelf').replaceChildren(...[...new Set(pool)].sort().map((t) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = t;
    b.setAttribute('aria-label', `${tx('take')} ${t}`);
    b.onclick = () => add(t);
    return b;
  }));
}

// ---- start ------------------------------------------------------------------------------
document.querySelectorAll('.game').forEach((li) => li.style.setProperty('--accent', li.dataset.accent));
for (const hit of Object.values(unlocked)) reveal(hit, false);
$('#bar').hidden = false;
$('#tools').hidden = false;
drawTray();
drawShelf();
$('#clear').onclick = () => { hideFit(); clearAll(); };
$('#pause').onclick = () => {
  const off = $('#pause').getAttribute('aria-pressed') !== 'true';
  store.set('portal.motion', off ? 'off' : 'on');
  setMotion(off);
};
reduce.addEventListener('change', () => setMotion(store.get('portal.motion', 'on') === 'off'));
const know = $('#know');
const name = $('#name');
const toggleName = (show) => {
  name.hidden = !show;
  know.setAttribute('aria-expanded', String(show));
  if (show) name.focus();
};
know.onclick = () => toggleName(name.hidden);
name.addEventListener('keydown', (e) => { if (e.key === 'Escape') { toggleName(false); know.focus(); } });
name.addEventListener('input', async (e) => {
  const t = [...e.target.value.toLowerCase().replace(/\s+/g, '')];
  if (!data.lens.includes(t.length)) return;
  const res = await guess(t);
  if (res?.ok) { e.target.value = ''; unlock(res.hit); }
});
setMotion(motionOff);
setInterval(() => spawn(false), EVERY);
