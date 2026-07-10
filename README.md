# 🎁 Sitcom Surprise

One tile per TV show in Stremio. Single click → surprise random episode.

![Logo](public/logo.png)

**Live:** https://sitcom-surprise.vercel.app — HTTPS, 16/16 tests passing.

## Features

- **One Tile Per Show** — single row, `org.stremio.sitcomsurprise`
- **True Single Click** — meta returns `videos=[tt:S:E]` + `behaviorHints.defaultVideoId = tt:S:E`, `cacheMaxAge:0` for new surprise every open
- **Top % Filter** — leave empty for 100% fully random, or 1-100% by rating
- **Persistent Cache** — 30 days persistent, memory + file cache
- **Bulletproof Meta** — never returns `null` for valid shows, fallback name if config stale, handles url-encoded ids, error meta still returns video to avoid "No metadata found"

## Quick Start

- Configurator: https://sitcom-surprise.vercel.app/configure/ — search TVmaze, manage favorites, set top %, generate install link
- Manifest: `/<base64url(JSON shows,topPercent)>/manifest.json` → single catalog `shuffle`
- Catalog: `/.../catalog/series/shuffle.json` → tiles with `shuffle:tt...`
- Meta: `/.../meta/series/shuffle:tt....json` → random episode + defaultVideoId
- Stream: returns `[]` — relies on other addons for `tt:S:E` playback

## Tech

- `src/index.js` — express, single catalog handler, bulletproof meta (fallback if show not in config, handles encoded colon, never null for valid imdb)
- `src/config.js` — topPercent empty → 100
- `src/tvmaze.js` — lookup imdb→tvmaze id, fetch episodes, `filterTopEpisodes` configurable, persistent cache 30d
- `public/` — configurator, logos, vercel.json routes
- Tests: 16 pass

## Hosting

- Vercel: project `sitcom-surprise`, auto HTTPS, prod live
- GitHub: https://github.com/vkr1729/sitcom-surprise

MIT
