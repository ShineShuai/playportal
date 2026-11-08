import { key, open } from './match.js';

const $ = (s, r = document) => r.querySelector(s);
const data = JSON.parse($('#data').textContent);
const MAX = Math.max(...data.lens);
const EVERY = 1500;          // ms between new letters
const SPEED = [26, 42];      // px/s a letter rises
const DENSITY = 28000;       // px² of sky per letter on screen
const TEXT = {
  en: { unlocked: 'Unlocked: {n}', miss: 'No game matches. Letters cleared.', take: 'collect', drop: 'remove' },
  zh: { unlocked: '已解锁：{n}', miss: '没有匹配的游戏，已清空。', take: '收集', drop: '移除' },
};
const tx = (k, n = '') => (TEXT[document.documentElement.dataset.lang] ?? TEXT.en)[k].replace('{n}', n);
const say = (k, n) => { $('#status').textContent = tx(k, n); };
const rand = (a, b) => a + Math.random() * (b - a);
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } },
};

const field = $('#field');
const sky = $('#sky');
let tray = [];  // collected letters: the only row of slots
let trail = []; // where each collected letter was caught, in the same order (null: no position)
let fails = 0;
let locked = false;
const unlocked = store.get('portal.unlocked', {});

// ---- tray and trail -----------------------------------------------------------------------
function drawTray() {
  $('#slots').replaceChildren(...Array.from({ length: MAX }, (_, i) => {
    const full = i < tray.length;
    const el = document.createElement(full ? 'button' : 'span');
    el.className = 'slot';
    if (full) {
      el.type = 'button';
      el.textContent = tray[i];
      el.setAttribute('aria-label', `${tray[i]}: ${tx('drop')}`);
      el.onclick = () => {
        if (locked) return;
        tray.splice(i, 1);
        trail.splice(i, 1);
        drawTray();
        drawTrail();
      };
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

/** Stars where letters were caught, joined in click order: nothing is joined before a click. */
function drawTrail() {
  const pts = trail.filter(Boolean);
  const els = [];
  if (pts.length > 1) els.push(node('polyline', { class: 'line', points: pts.map((p) => `${p.x},${p.y}`).join(' ') }));
  pts.forEach((p, i) => els.push(
    node('circle', { class: 'halo', cx: p.x, cy: p.y, r: 16 }),
    node('circle', { class: i === pts.length - 1 ? 'star new' : 'star', cx: p.x, cy: p.y, r: 4.5 }),
  ));
  $('#trail').replaceChildren(...els);
}

function clearAll() {
  tray = [];
  trail = [];
  drawTray();
  drawTrail();
}

async function add(t, point = null) {
  if (locked || tray.length >= MAX) return;
  tray.push(t);
  trail.push(point);
  drawTray();
  drawTrail();
  const snap = tray.join('');
  if (data.lens.includes(snap.length)) {
    const hit = await open(key(snap), data.seals);
    if (snap !== tray.join('')) return; // the tray changed while the key was derived
    if (hit) { clearAll(); return unlock(hit); }
  }
  if (tray.length >= MAX) miss();
}

function miss() {
  locked = true;
  fails += 1;
  say('miss');
  $('.bar').classList.add('shake');
  setTimeout(() => {
    locked = false;
    clearAll();
    $('.bar').classList.remove('shake');
  }, 600);
  if (fails >= 3) document.querySelectorAll('.game:not(.open) .hint').forEach((h) => { h.hidden = false; });
}

// ---- games ------------------------------------------------------------------------------
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
  say('unlocked', hit.n);
}

// ---- drifting letters -------------------------------------------------------------------
let bag = [];
let live = 0;
let motionOff = store.get('portal.motion', 'on') === 'off';
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const capacity = () => Math.max(7, Math.min(16, Math.round((field.clientWidth * field.clientHeight) / DENSITY)));

function draw() {
  if (!bag.length) {
    bag = [...data.pool];
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
    const r = b.getBoundingClientRect();
    const f = field.getBoundingClientRect();
    const point = { x: r.left - f.left + r.width / 2, y: r.top - f.top + r.height / 2 };
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

function drawShelf() { // the same letters without motion: unlimited supply, one of each
  $('#shelf').replaceChildren(...[...new Set(data.pool)].sort().map((t) => {
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
$('#clear').onclick = () => { if (!locked) clearAll(); };
$('#pause').onclick = () => {
  const off = $('#pause').getAttribute('aria-pressed') !== 'true';
  store.set('portal.motion', off ? 'off' : 'on');
  setMotion(off);
};
reduce.addEventListener('change', () => setMotion(store.get('portal.motion', 'on') === 'off'));
$('#typed input').addEventListener('input', async (e) => {
  const t = [...e.target.value.toLowerCase().replace(/\s+/g, '')];
  if (!data.lens.includes(t.length)) return;
  const hit = await open(key(t), data.seals);
  if (hit) { e.target.value = ''; unlock(hit); }
});
setMotion(motionOff);
setInterval(() => spawn(false), EVERY);
