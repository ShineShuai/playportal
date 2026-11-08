// Local server: builds dist/ and serves it with the page's security headers.
//   npm run dev      then open http://localhost:8080  (PORT=... to change); /<slug>/ is not mounted.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { build } from './build.js';

await build('dist', 'dev');
const csp = readFileSync('dist/_headers', 'utf8').match(/Content-Security-Policy: (.*)/)[1];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2' };
const port = Number(process.env.PORT ?? 8080);
createServer(async (req, res) => {
  let path = normalize(new URL(req.url, 'http://x').pathname).replace(/^(\.\.[/\\])+/, '');
  if (path.endsWith('/')) path += 'index.html';
  const hidden = path.includes('_headers') || path.includes('.assetsignore');
  try {
    if (hidden) throw new Error('hidden');
    const body = await readFile(join('dist', path));
    res.writeHead(200, {
      'content-type': types[extname(path)] ?? 'text/plain', 'content-security-policy': csp,
      'x-content-type-options': 'nosniff',
    });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(port, () => console.log(`http://localhost:${port}`));
