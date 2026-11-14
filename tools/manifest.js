// Reads and validates portal.config.json (and its consistency with wrangler.toml).
// Build and test only: the config never ships. Messages name slugs and fields, never letters.
import { readFileSync } from 'node:fs';
import { accepted } from './seal.js';

const root = new URL('../', import.meta.url);
export const CONFIG = new URL('portal.config.json', root);
export const MAX_ACCEPTED = 400;
const GAME_KEYS = ['slug', 'enabled', 'name', 'worker', 'accent', 'alias', 'blurb', 'hint'];

/** Contrast ratio of a #rrggbb colour against white (the text on tiles and buttons). */
export function contrastOnWhite(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05);
}
export const binding = (slug) => `GAME_${slug.toUpperCase().replaceAll('-', '_')}`;
/** The games the portal shows; a game is on unless it says `"enabled": false`. */
export const active = (games) => games.filter((g) => g.enabled !== false);

function checkGame(g, errors) {
  const at = `game "${g.slug}"`;
  for (const k of Object.keys(g)) if (!GAME_KEYS.includes(k)) errors.push(`${at}: unknown key "${k}"`);
  if (!/^[a-z0-9-]+$/.test(g.slug ?? '')) errors.push(`${at}: slug must match [a-z0-9-]+`);
  if (g.enabled !== undefined && typeof g.enabled !== 'boolean') errors.push(`${at}: enabled must be true or false`);
  if (!/^[a-z]{2,12}$/.test(g.name ?? '')) errors.push(`${at}: name must be 2-12 letters a-z`);
  if (g.accent !== undefined) {
    if (!/^#[0-9a-f]{6}$/i.test(g.accent)) errors.push(`${at}: accent must be #rrggbb`);
    else if (contrastOnWhite(g.accent) < 4.5) errors.push(`${at}: accent needs contrast 4.5 with white text`);
  }
  if (!g.worker) errors.push(`${at}: worker (the game's Worker name) is missing`);
  for (const field of ['blurb', 'hint']) {
    for (const lang of ['en', 'zh']) {
      const text = g[field]?.[lang];
      if (!text) errors.push(`${at}: ${field}.${lang} is missing`);
      else if (text.toLowerCase().includes(g.name)) errors.push(`${at}: ${field}.${lang} names the game`);
    }
  }
  for (const [ch, list] of Object.entries(g.alias ?? {})) {
    if (!g.name.includes(ch)) errors.push(`${at}: an alias key is not a letter of the name`);
    for (const t of list) {
      if (!/^[a-z0-9]$/.test(t)) errors.push(`${at}: alias tokens must be one of a-z, 0-9`);
    }
  }
  if (g.name && accepted(g.name, g.alias).size > MAX_ACCEPTED) {
    errors.push(`${at}: more than ${MAX_ACCEPTED} accepted sets`);
  }
}

/** { styles: { enabled }, puzzle: { decoys }, games }: all games, also the disabled ones. */
export function loadConfig(file = CONFIG) {
  const cfg = JSON.parse(readFileSync(file, 'utf8'));
  const errors = [];
  const unknown = (o, keys, at) => {
    for (const k of Object.keys(o ?? {})) if (!keys.includes(k)) errors.push(`${at}: unknown key "${k}"`);
  };
  unknown(cfg, ['styles', 'puzzle', 'games'], 'config');

  const enabled = cfg.styles?.enabled;
  unknown(cfg.styles, ['enabled'], 'styles');
  if (!enabled || typeof enabled !== 'object' || Array.isArray(enabled)) {
    errors.push('styles.enabled must be an object {"<style id>": true | false}');
  } else {
    for (const [id, on] of Object.entries(enabled)) {
      if (typeof on !== 'boolean') errors.push(`styles.enabled.${id} must be true or false`);
    }
  }

  unknown(cfg.puzzle, ['decoys'], 'puzzle');
  if (typeof cfg.puzzle?.decoys !== 'string' || !/^[a-z0-9]*$/.test(cfg.puzzle.decoys)) {
    errors.push('puzzle.decoys must be a string of a-z, 0-9');
  }

  const games = cfg.games;
  if (!Array.isArray(games)) errors.push('games must be a list');
  else {
    const slugs = new Set();
    const keys = new Map();
    for (const g of games) {
      checkGame(g, errors);
      if (slugs.has(g.slug)) errors.push(`game "${g.slug}": duplicate slug`);
      slugs.add(g.slug);
    }
    const on = active(games);
    if (!on.length) errors.push('games: at least one game must be enabled');
    for (const g of on.filter((x) => /^[a-z]{2,12}$/.test(x.name ?? ''))) { // a letter set opens one door
      for (const k of accepted(g.name, g.alias)) {
        if (keys.has(k) && keys.get(k) !== g.slug) errors.push(`game "${g.slug}": shares an accepted letter set with "${keys.get(k)}"`);
        keys.set(k, g.slug);
      }
    }
  }
  if (errors.length) throw new Error(`portal.config.json:\n- ${[...new Set(errors)].join('\n- ')}`);
  return cfg;
}

/** Every game needs its service binding and both of its paths in run_worker_first. */
export function checkWrangler(games, toml) {
  const errors = [];
  const blocks = toml.split('[[services]]').slice(1).map((b) => b.split(/\n\[/)[0]);
  const first = /run_worker_first\s*=\s*\[([^\]]*)\]/.exec(toml)?.[1] ?? '';
  for (const g of games) {
    const ok = blocks.some(
      (b) => b.includes(`binding = "${binding(g.slug)}"`) && b.includes(`service = "${g.worker}"`));
    if (!ok) errors.push(`wrangler.toml: no [[services]] ${binding(g.slug)} -> ${g.worker}`);
    for (const p of [`/${g.slug}`, `/${g.slug}/*`]) {
      if (!first.includes(`"${p}"`)) errors.push(`wrangler.toml: run_worker_first lacks "${p}"`);
    }
  }
  return errors;
}
