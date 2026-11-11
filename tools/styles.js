// Build only: the style set. One folder per style in src/styles/<id>/ (see README "Styles").
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';

const ROOT = new URL('../src/styles/', import.meta.url);
const GLOBAL_AT = /^@(?:-webkit-)?(?:keyframes|font-face|property|counter-style)\b/i;
const GROUP_AT = /^@(?:media|supports|container|layer)\b/i;
export const SLOTS = ['head', 'field']; // where a style may add decoration: #decor-head, #decor-field
const MOTIONS = ['rise', 'orbit'];
const HEX = /^#[0-9a-f]{6}$/i;

function matching(text, open, id) {
  let depth = 0;
  let quote = null;
  for (let j = open; j < text.length; j++) {
    const c = text[j];
    if (quote) {
      if (c === '\\') j++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return j;
  }
  throw new Error(`style "${id}": unbalanced braces in style.css`);
}

function scopeSelectors(list, id) {
  const prefix = `:root[data-style="${id}"]`;
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const c of list) {
    if (c === '(' || c === '[') depth++;
    if (c === ')' || c === ']') depth--;
    if (c === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += c;
  }
  parts.push(cur);
  return parts.map((raw) => {
    const s = raw.trim();
    if (/^:root\b/.test(s)) return prefix + s.slice(5);
    if (/^html\b/.test(s)) return `html[data-style="${id}"]${s.slice(4)}`;
    if (/^body\b/.test(s)) return `${prefix} body${s.slice(4)}`;
    return `${prefix} ${s}`;
  }).join(', ');
}

function walk(text, id) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i);
    if (open < 0) {
      if (text.slice(i).trim()) throw new Error(`style "${id}": stray text "${text.slice(i).trim().slice(0, 30)}"`);
      break;
    }
    const prelude = text.slice(i, open).trim();
    const close = matching(text, open, id);
    const body = text.slice(open + 1, close);
    if (GLOBAL_AT.test(prelude)) out += `${prelude}{${body}}\n`;
    else if (GROUP_AT.test(prelude)) out += `${prelude}{\n${walk(body, id)}}\n`;
    else if (prelude.startsWith('@')) throw new Error(`style "${id}": ${prelude.split(/\s/)[0]} is not supported`);
    else if (body.includes('{')) throw new Error(`style "${id}": nested rules are not supported (${prelude})`);
    else out += `${scopeSelectors(prelude, id)}{${body}}\n`;
    i = close + 1;
  }
  return out;
}

/** Scopes every rule of a style's CSS to :root[data-style="<id>"]; keyframes and the like stay global. */
export const scope = (css, id) => walk(css.replace(/\/\*[\s\S]*?\*\//g, ''), id);

/** All styles of the set, sorted by id, validated. A style = a folder; nothing else lists it. */
export async function loadStyles(root = ROOT) {
  if (!existsSync(root)) return [];
  const dirs = (await readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  const errors = [];
  const styles = [];
  for (const dir of dirs) {
    const at = `style "${dir}"`;
    const file = (f) => new URL(`${dir}/${f}`, root);
    if (!existsSync(file('style.json')) || !existsSync(file('style.css'))) {
      errors.push(`${at}: needs style.json and style.css`);
      continue;
    }
    const meta = JSON.parse(await readFile(file('style.json'), 'utf8'));
    if (meta.id !== dir || !/^[a-z][a-z0-9-]*$/.test(dir)) errors.push(`${at}: "id" must equal the folder name (a-z, 0-9, -)`);
    if (!meta.name) errors.push(`${at}: "name" is missing`);
    for (const mode of ['light', 'dark']) {
      if (!HEX.test(meta.themeColor?.[mode] ?? '')) errors.push(`${at}: themeColor.${mode} must be #rrggbb`);
    }
    const motion = meta.motion ?? { type: 'rise' };
    if (!MOTIONS.includes(motion.type)) errors.push(`${at}: motion.type must be one of ${MOTIONS.join(', ')}`);
    if (motion.type === 'orbit' && !(Array.isArray(motion.rings) && motion.rings.length && motion.rings.every((r) => r > 0 && r <= 1) && motion.period?.length === 2)) {
      errors.push(`${at}: orbit needs "rings" (diameters 0-1 of the sky) and "period" [min, max] seconds`);
    }
    const decor = {};
    for (const slot of SLOTS) {
      if (!existsSync(file(`decor-${slot}.html`))) continue;
      decor[slot] = (await readFile(file(`decor-${slot}.html`), 'utf8')).trim();
      if (/<script|<style|\sstyle\s*=|\son\w+\s*=/i.test(decor[slot])) errors.push(`${at}: decor-${slot}.html must not use script, style or on* (CSP): style it in style.css`);
    }
    let css = '';
    try { css = scope(await readFile(file('style.css'), 'utf8'), dir); } catch (e) { errors.push(e.message); }
    styles.push({ id: dir, name: meta.name, themeColor: meta.themeColor, motion, fonts: meta.fonts ?? [], css, decor });
  }
  if (errors.length) throw new Error(`src/styles:\n- ${errors.join('\n- ')}`);
  return styles;
}

/** What the page needs to know about the set (no CSS): ids, names, motion, browser colours. */
export const registry = (styles) => styles.map(({ id, name, themeColor, motion }) => ({ id, name, themeColor, motion }));

/** The decoration of every style as inert <template>s; the page clones the active style's. */
export const templates = (styles, total) => styles.flatMap((s) => Object.entries(s.decor).map(([slot, html]) =>
  `<template data-decor="${s.id}" data-slot="${slot}">${html.replaceAll('{{TOTAL}}', total)}</template>`)).join('\n');
