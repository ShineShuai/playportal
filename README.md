# play

Portal of <https://play.vintoshine.com/>: a brief page that hides a link to every game behind a
small puzzle, plus the router that serves the games under `/<slug>/`.

- `games.json`: the games (slug, name, Worker, optional `accent` colour #rrggbb with contrast 4.5 on white, aliases, blurb and hint in en/zh). The only file
  that lists games; no game repo carries portal data.
- `src/`: page (`index.html`, `portal.js`, `portal.css`, `lang.js`, `theme.js`), shared `match.js` (seal, open, hint) and the router `worker.js`; `tools/seal.js` builds the sealed data.
- `tools/build.js` writes `dist/`; `tools/manifest.js` validates `games.json` against `wrangler.toml`.
- Games are separate Workers (own repo, own deploy) reached by service binding, so each keeps
  its own deploy rhythm. They live under `/<slug>/` of this host: same origin, so prefix every
  localStorage key per game (`zigzag.*`); this portal uses `portal.*`.

## How the puzzle works
Letters (and look-alike digits, `alias` in `games.json`) drift over the page. Collecting a
multiset of tokens that spells a game name opens it; typing the name does the same. Order does
not matter. The page is static and makes no requests (`default-src 'none'` in `src/_headers`).
`npm run build` seals everything that is an answer:
- the links: AES-GCM ciphertext, key from PBKDF2 of the token multiset, one entry per accepted multiset;
- the hint "4 of 6 letters fit · 2 to swap": 5-byte hashes of every sub-multiset of every accepted
  multiset (about 2 KB for zigzag; the build fails above 13000 hashes, so keep names short);
- the letter pool and the text clues (shown after 3 misses): base64 only, in a shuffled order.
  This is obfuscation: it keeps the answer out of a casual view-source, nothing more.
The page never contains a name, link, hint text or the letters in name order (`npm test` checks).
Letters are visible by design, as they float on the page. Trying all combinations offline can
open the sealed links and the hash table; that is accepted. `/<slug>/` stays public.

## Styles (one a day)
The page shows one style a day: the same all day (local date) and never the same one two days
in a row. `?style=<id>` previews one; the style of the day is `data-style` on `<html>`. Each
style has a light and a dark mode. The set is the folders of `src/styles/`; nothing else lists them.

- **Add** a folder `src/styles/<id>/`, **remove** it by deleting it, **update** it by editing its files.
  `npm test` validates every style and the build ships it. Adding or removing a style changes
  which style falls on which day. The plain `src/portal.css` is only the fallback (no JavaScript);
  to rotate it too, copy its tokens into a style folder.
- `style.json`: `id` (= folder name), `name`, `themeColor` (`light`, `dark`, as `#rrggbb`),
  `motion` (`{"type":"rise"}`, or `{"type":"orbit","rings":[0.86,0.6,0.34],"period":[70,120],"max":11}`:
  ring diameters as a fraction of the sky), `fonts` (names of files in `src/fonts/`).
- `style.css`: write it plainly. The build scopes every rule to `:root[data-style="<id>"]`
  (`@media` is handled; no nested rules; `@keyframes` stay global, so prefix their names).
  Define both modes: `:root { light }` and `:root[data-theme="dark"] { dark }`.
- `decor-head.html` (before the title) and `decor-field.html` (behind the letters) are optional
  decoration. They are inert `<template>`s, no `style=`, `<script>` or `on*` (the content security
  policy blocks them): position things with classes in `style.css`. `{{TOTAL}}` is the number of
  games; `<b class="found">0</b>` is kept up to date. In `#decor-field`, `--d` is the smaller side of the sky.

Tokens a style sets (all optional): colours `--page --surface --ink --text --muted --line
--line-strong --glass --shadow --ground` (page background), letters `--free` (drifting) and `--star`
(caught letters and the line), `--tile/--tilebg` (filled slots), `--name`, `--on/--on-fg` (selected
button), `--focus`; shape `--bw --r-ctl --r-lang --r-slot --r-bar --r-count --r-play --sh-ctl --sh-bar
--tt --ls`; letters `--ch-op --pick-bg/-bd/-fg --line-c/-w/-op/-dash`; hues `--k0 ... --k7`;
fonts `--display --body`. Hooks for anything else: `.intro .games .bar .tools #field`, `.ch` (drifting
letter: `data-k` = hue 0-7, `--rot`), `.pick` (caught letter: `data-k`, `data-n` = 1, 2, ...), `#slots .slot`.

## Layout and fonts
PC (>= 900 px): text, the single row of slots (the tray) and tools in a left column; the sky of
letters fills the right side (styles may rearrange this). Mobile: text on top, sky in the middle,
tools, tray fixed at the bottom. A letter you catch stays lit where it was caught and joins a line
in click order; nothing is joined before. Light and dark follow the system (toggle saved as `portal.theme`).

Fonts are optional and self-hosted (SIL OFL): `npm i --no-save @fontsource-variable/<name> ...`, then
`npm run fonts` copies what the styles ask for into `src/fonts/` (it prints the missing packages).
Without the files the page uses system fonts. There are no external requests either way.

## Add a game
1. The game deploys as its own Worker with `workers_dev = false`, assets under `<slug>/`.
2. `games.json`: new entry. The blurb and hint must not contain the name (tested).
3. `wrangler.toml`: a `[[services]]` block (`binding = "GAME_<SLUG>"`, `service = <worker>`)
   and `"/<slug>"`, `"/<slug>/*"` in `run_worker_first`. `npm test` fails when they differ.
4. Push to `main`: tests, deploy, smoke test (the game must answer 200 through the portal).

## Develop
`npm test` (Node 20 or 22). `npm run dev` builds and serves `dist/` with the page's headers on
<http://localhost:8080> (`PORT=...` to change); `/<slug>/` is not mounted there.

## Deploy (GitHub Actions, `.github/workflows/deploy.yml`)
Every push to `main`. Rollback: revert the commit on `main`.
One-time setup (not in git): GitHub environment `production` with secret `CLOUDFLARE_API_TOKEN`
(Workers Scripts: Edit, Account Settings: Read), variable `CLOUDFLARE_ACCOUNT_ID`, and the custom
domain `play.vintoshine.com` on the Worker `play-portal`.

### Cutover from the zigzag-only host
1. Merge the zigzag patch (it drops the root redirect and its smoke check).
2. First deploy of this repo: Actions -> Deploy -> Run workflow with smoke off.
3. Dashboard: remove `play.vintoshine.com` from `zigzag-site`, add it to `play-portal`.
4. Run the workflow again with smoke on.
