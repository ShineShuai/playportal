// Builds dist/ from portal.config.json: the page (teasers; answers only sealed, hashed or encoded),
// scripts, the enabled styles and their fonts. The config itself never ships.
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { buildData } from './seal.js';
import { active, loadConfig } from './manifest.js';
import { loadStyles, registry, selectStyles, templates } from './styles.js';

const src = (f) => new URL(`../src/${f}`, import.meta.url);
const cardId = (slug) => createHash('sha256').update(slug).digest('hex').slice(0, 8);
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const bi = (o) => `<span lang="en">${esc(o.en)}</span><span lang="zh">${esc(o.zh)}</span>`;

export async function build(out = 'dist', sha = process.env.GITHUB_SHA ?? 'dev', config = loadConfig()) {
  const games = active(config.games);
  const styles = selectStyles(await loadStyles(), config.styles.enabled);
  const data = await buildData(games, cardId, config.puzzle.decoys);
  const teasers = games.map((g) => {
    const n = g.name.length;
    return `<li class="game" data-id="${cardId(g.slug)}" data-accent="${g.accent ?? '#3b68ee'}">
        <p class="blurb">${bi(g.blurb)}</p>
        <p class="meta"><span lang="en">${n} letters</span><span lang="zh">${n} 个字符</span></p>
        <p class="hint" hidden></p>
        <a class="play" hidden><span lang="en">Play</span><span lang="zh">开始玩</span></a>
      </li>`;
  }).join('\n      ');
  // Optional self-hosted variable fonts src/fonts/<family>.woff2: only those an enabled style asks for
  const wanted = new Set(styles.flatMap((s) => s.fonts).map((f) => `${f}.woff2`));
  const fontFiles = existsSync(src('fonts/')) ? (await readdir(src('fonts/'))).filter((f) => wanted.has(f)).sort() : [];
  const html = (await readFile(src('index.html'), 'utf8'))
    .replace('{{TEASERS}}', () => teasers)
    .replaceAll('{{TOTAL}}', games.length)
    .replace('{{FONTS}}', fontFiles.length ? '<link rel="stylesheet" href="/fonts.css">' : '')
    .replace('{{STYLES}}', () => JSON.stringify(registry(styles)).replaceAll('<', '\\u003c'))
    .replace('{{DECOR}}', () => templates(styles, games.length))
    .replace('{{DATA}}', () => JSON.stringify(data).replaceAll('<', '\\u003c'));

  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  await writeFile(`${out}/index.html`, html);
  for (const f of ['portal.js', 'match.js', 'lang.js', 'theme.js', 'style.js', '_headers']) {
    await copyFile(src(f), `${out}/${f}`);
  }
  const css = [await readFile(src('portal.css'), 'utf8'), ...styles.map((x) => `/* style: ${x.id} */\n${x.css}`)].join('\n');
  await writeFile(`${out}/portal.css`, css);
  if (fontFiles.length) {
    await mkdir(`${out}/fonts`);
    let css = '';
    for (const f of fontFiles) {
      await copyFile(src(`fonts/${f}`), `${out}/fonts/${f}`);
      const family = f.replace('.woff2', '').split('-').map((w) => w.replace(/^./, (c) => c.toUpperCase())).join(' ');
      css += `@font-face{font-family:"${family}";src:url(/fonts/${f}) format("woff2");font-weight:200 900;font-display:swap}\n`;
    }
    await writeFile(`${out}/fonts.css`, css);
  }
  await writeFile(`${out}/.assetsignore`, '_headers\n');
  await writeFile(`${out}/build.json`, `${JSON.stringify({ sha, built: new Date().toISOString() })}\n`);
  return { games, data, styles };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { games, data, styles } = await build(process.argv[2]);
  console.log(`Built ${games.length} game(s), ${Object.keys(data.seals).length} sealed links, ${styles.length} style(s)`);
}
