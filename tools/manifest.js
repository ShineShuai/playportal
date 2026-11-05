// Reads and validates games.json (and its consistency with wrangler.toml).
import { readFileSync } from 'node:fs';
import { accepted } from '../src/match.js';

const root = new URL('../', import.meta.url);
export const MAX_ACCEPTED = 400;
export const binding = (slug) => `GAME_${slug.toUpperCase().replaceAll('-', '_')}`;

export function load(file = new URL('games.json', root)) {
  const { games } = JSON.parse(readFileSync(file, 'utf8'));
  const errors = [];
  const slugs = new Set();
  const keys = new Map();
  for (const g of games) {
    const at = `game "${g.slug}"`;
    if (!/^[a-z0-9-]+$/.test(g.slug ?? '')) errors.push(`${at}: slug must match [a-z0-9-]+`);
    if (slugs.has(g.slug)) errors.push(`${at}: duplicate slug`);
    slugs.add(g.slug);
    if (!/^[a-z]{2,12}$/.test(g.name ?? '')) errors.push(`${at}: name must be 2-12 letters a-z`);
    if (!g.worker) errors.push(`${at}: worker (the game's Worker name) is missing`);
    for (const field of ['blurb', 'hint']) {
      for (const lang of ['en', 'zh']) {
        const text = g[field]?.[lang];
        if (!text) errors.push(`${at}: ${field}.${lang} is missing`);
        else if (text.toLowerCase().includes(g.name)) errors.push(`${at}: ${field}.${lang} names the game`);
      }
    }
    for (const [ch, list] of Object.entries(g.alias ?? {})) {
      if (!g.name.includes(ch)) errors.push(`${at}: alias for "${ch}", which is not in the name`);
      for (const t of list) {
        if (!/^[a-z0-9]$/.test(t)) errors.push(`${at}: alias token "${t}" must be one of a-z, 0-9`);
      }
    }
    const set = accepted(g.name, g.alias);
    if (set.size > MAX_ACCEPTED) errors.push(`${at}: ${set.size} accepted sets, more than ${MAX_ACCEPTED}`);
    for (const k of set) {
      if (keys.has(k) && keys.get(k) !== g.slug) errors.push(`${at}: shares set "${k}" with ${keys.get(k)}`);
      keys.set(k, g.slug);
    }
  }
  if (errors.length) throw new Error(`games.json:\n- ${errors.join('\n- ')}`);
  return games;
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
