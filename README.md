# 🎁 Sitcom Surprise

One tile per TV show in Stremio. Single click → surprise random episode.

![Logo](public/logo.png)

**Live:** https://sitcom-surprise.vercel.app — HTTPS, 25/25 tests passing.

## Features

- **One Tile Per Show** — single row, `org.stremio.sitcomsurprise`
- **True Single Click** — meta returns `videos=[tt:S:E]` + `behaviorHints.defaultVideoId = tt:S:E`, `cacheMaxAge:0` for new surprise every open
- **Multi-Source Search** — server-side `/search/:query.json` merges TVMaze + IMDb suggestions (deduped, IMDb-id only, series only), with singlesearch fallback; apostrophes/unicode safe
- **Top % Filter** — leave empty for 100% fully random, or 1-100% by rating
- **Fresh, Never Stale** — episode cache fresh 24h, stale-while-revalidate up to 30d (instant serve + background refresh); Stremio re-fetches meta every open; stale cache served on upstream outage instead of "No metadata found"
- **Persistent Cache** — 30 days persistent, memory + file cache
- **Bulletproof Meta** — never returns `null` for valid shows, fallback name if config stale, handles url-encoded ids, error meta still returns video to avoid "No metadata found"

## Quick Start

- Configurator: https://sitcom-surprise.vercel.app/configure/ — multi-source search (TVMaze + IMDb), manage favorites, set top %, generate install link
- Search API: `/search/:query.json` → merged results `[{id, name, year, poster, source}]`
- Manifest: `/<base64url(JSON shows,topPercent)>/manifest.json` → single catalog `shuffle`
- Catalog: `/.../catalog/series/shuffle.json` → tiles with `shuffle:tt...`
- Meta: `/.../meta/series/shuffle:tt....json` → random episode + defaultVideoId
- Stream: returns `[]` — relies on other addons for `tt:S:E` playback

## Tech

- `src/index.js` — express, single catalog handler, bulletproof meta (fallback if show not in config, handles encoded colon, never null for valid imdb)
- `src/search.js` — server-side multi-source search (TVMaze + IMDb suggestions), merged/deduped, 1h cache
- `src/config.js` — topPercent empty → 100
- `src/tvmaze.js` — lookup imdb→tvmaze id, fetch episodes, `filterTopEpisodes` configurable, SWR cache (24h fresh, 30d stale), persistent memory + file
- `public/` — configurator, logos, vercel.json routes
- Tests: 25 pass

## Hosting

- Vercel: project `sitcom-surprise`, auto HTTPS, prod live
- GitHub: https://github.com/vkr1729/sitcom-surprise

MIT
