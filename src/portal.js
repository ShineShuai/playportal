import { key, open } from './match.js';

const $ = (s, r = document) => r.querySelector(s);
const data = JSON.parse($('#data').textContent);
const MAX = Math.max(...data.lens);
const LIMIT = { wide: 10, narrow: 6 }; // letters on screen at once
const EVERY = 2500;                    // ms between new letters
const LIFE = [36, 56];                 // s a letter needs to cross the page
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

let tray = [];
let fails = 0;
let locked = false;
const unlocked = store.get('portal.unlocked', {});

// ---- tray -------------------------------------------------------------------------------
function drawTray() {
  $('#slots').replaceChildren(...Array.from({ length: MAX }, (_, i) => {
    const full = i < tray.length;
    const el = document.createElement(full ? 'button' : 'span');
    el.className = 'slot';
    if (full) {
      el.type = 'button';
      el.textContent = tray[i];
      el.setAttribute('aria-label', `${tray[i]}: ${tx('drop')}`);
      el.onclick = () => { if (!locked) { tray.splice(i, 1); drawTray(); } };
    }
    return el;
  }));
}

async function add(t) {
  if (locked || tray.length >= MAX) return;
  tray.push(t);
  drawTray();
  const snap = tray.join('');
  if (data.lens.includes(snap.length)) {
    const hit = await open(key(snap), data.seals);
    if (snap !== tray.join('')) return; // the tray changed while the key was derived
    if (hit) { tray = []; drawTray(); return unlock(hit, true); }
  }
  if (tray.length >= MAX) miss();
}

function miss() {
  locked = true;
  fails += 1;
  say('miss');
  $('.bar').classList.add('shake');
  setTimeout(() => {
    tray = [];
    locked = false;
    drawTray();
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
  const name = document.createElement('span');
  name.className = 'sr';
  name.textContent = n;
  $('.slots', li).replaceChildren(name, ...[...n].map((c, k) => {
    const l = document.createElement('span');
    l.className = 'l';
    l.setAttribute('aria-hidden', 'true');
    l.textContent = c;
    l.style.setProperty('--i', k);
    return l;
  }));
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
const sky = $('#sky');
let bag = [];
let live = 0;
let motionOff = store.get('portal.motion', 'on') === 'off';
const reduce = matchMedia('(prefers-reduced-motion: reduce)');

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

function laneX() { // outside the text column when there is room, anywhere on narrow screens
  const w = innerWidth;
  const m = (w - Math.min(w, 46 * 16)) / 2; // 46rem: the page column
  if (m < 56) return rand(8, w - 56);
  return Math.random() < 0.5 ? rand(8, m - 48) : rand(w - m + 8, w - 56);
}

function spawn(early) {
  if (motionOff || document.hidden || live >= (innerWidth < 640 ? LIMIT.narrow : LIMIT.wide)) return;
  const t = draw();
  const life = rand(...LIFE);
  const b = document.createElement('button');
  const s = document.createElement('span');
  s.textContent = t;
  b.append(s);
  b.type = 'button';
  b.className = 'ch';
  b.setAttribute('aria-label', `${tx('take')} ${t}`);
  b.style.cssText = `left:${laneX()}px;--life:${life}s;--delay:${early ? -rand(0, life * 0.8) : 0}s;` +
    `--sway:${rand(6, 16)}px;--swt:${rand(4, 7)}s`;
  b.onclick = () => {
    const next = document.activeElement === b ? b.nextElementSibling ?? sky.firstElementChild : null;
    b.remove();
    live -= 1;
    if (next && next !== b) next.focus();
    add(t);
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
  if (!motionOff) for (let i = 0; i < 6; i++) spawn(true);
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
$('#clear').onclick = () => { if (!locked) { tray = []; drawTray(); } };
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
