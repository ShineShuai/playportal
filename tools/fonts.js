// Copies the variable fonts that the styles ask for ("fonts" in style.json) into src/fonts/,
// from node_modules/@fontsource-variable/<name> (SIL OFL). The build serves them from the site itself.
import { copyFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { loadStyles } from './styles.js';

const need = [...new Set((await loadStyles()).flatMap((s) => s.fonts))].sort();
await mkdir('src/fonts', { recursive: true });
const missing = [];
for (const f of need) {
  const from = `node_modules/@fontsource-variable/${f}/files/${f}-latin-wght-normal.woff2`;
  if (existsSync(from)) {
    await copyFile(from, `src/fonts/${f}.woff2`);
    console.log(`copied ${f}`);
  } else missing.push(f);
}
if (missing.length) {
  console.log(`Missing: npm i --no-save ${missing.map((f) => `@fontsource-variable/${f}`).join(' ')}\nthen run npm run fonts again.`);
}
