// Builds dist/: the page (teasers and sealed links from games.json), scripts, styles, headers.
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { accepted, poolOf, seal } from '../src/match.js';
import { load } from './manifest.js';

const src = (f) => new URL(`../src/${f}`, import.meta.url);
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const bi = (o) => `<span lang="en">${esc(o.en)}</span><span lang="zh">${esc(o.zh)}</span>`;
const cardId = (slug) => createHash('sha256').update(slug).digest('hex').slice(0, 8);

export async function build(out = 'dist', sha = process.env.GITHUB_SHA ?? 'dev') {
  const games = load();
  const seals = {};
  await Promise.all(games.flatMap((g) => [...accepted(g.name, g.alias)].map(async (k) => {
    const [id, ct] = await seal(k, { i: cardId(g.slug), n: g.name, u: `/${g.slug}/` });
    seals[id] = ct;
  })));
  const data = {
    lens: [...new Set(games.map((g) => g.name.length))].sort((a, b) => a - b),
    pool: poolOf(games),
    seals,
  };
  const teasers = games.map((g) => {
    const n = g.name.length;
    return `<li class="game" data-id="${cardId(g.slug)}" data-accent="${g.accent ?? '#3b68ee'}">
        <p class="blurb">${bi(g.blurb)}</p>
        <p class="meta"><span lang="en">${n} letters</span><span lang="zh">${n} 个字符</span></p>
        <p class="hint" hidden>${bi(g.hint)}</p>
        <a class="play" hidden><span lang="en">Play</span><span lang="zh">开始玩</span></a>
      </li>`;
  }).join('\n      ');
  // Optional self-hosted variable fonts: src/fonts/<family>.woff2 (e.g. unbounded, manrope)
  const fontFiles = existsSync(src('fonts/')) ? (await readdir(src('fonts/'))).filter((f) => f.endsWith('.woff2')).sort() : [];
  const html = (await readFile(src('index.html'), 'utf8'))
    .replace('{{TEASERS}}', () => teasers)
    .replaceAll('{{TOTAL}}', games.length)
    .replace('{{FONTS}}', fontFiles.length ? '<link rel="stylesheet" href="/fonts.css">' : '')
    .replace('{{DATA}}', () => JSON.stringify(data).replaceAll('<', '\\u003c'));

  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  await writeFile(`${out}/index.html`, html);
  for (const f of ['portal.js', 'match.js', 'lang.js', 'theme.js', 'portal.css', '_headers']) {
    await copyFile(src(f), `${out}/${f}`);
  }
  if (fontFiles.length) {
    await mkdir(`${out}/fonts`);
    let css = '';
    for (const f of fontFiles) {
      await copyFile(src(`fonts/${f}`), `${out}/fonts/${f}`);
      const family = f.replace('.woff2', '').replace(/^./, (c) => c.toUpperCase());
      css += `@font-face{font-family:"${family}";src:url(/fonts/${f}) format("woff2");font-weight:200 900;font-display:swap}\n`;
    }
    await writeFile(`${out}/fonts.css`, css);
  }
  await writeFile(`${out}/.assetsignore`, '_headers\n');
  await writeFile(`${out}/build.json`, `${JSON.stringify({ sha, built: new Date().toISOString() })}\n`);
  return { games, data };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { games, data } = await build(process.argv[2]);
  console.log(`Built ${games.length} game(s), ${Object.keys(data.seals).length} sealed links`);
}
