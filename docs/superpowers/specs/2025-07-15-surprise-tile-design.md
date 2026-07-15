# Surprise Tile — Design Spec

## Goal

Add a "🎲 Surprise" tile as the **first item** in the Sitcom Surprise catalog. Clicking it auto-plays a random episode from a randomly-selected show in the user's configured list. The tile uses the extension logo and a custom-generated poster.

## Behavior

1. **Catalog**: The Surprise tile appears at index 0, before all per-show tiles.
2. **Click → Meta**: Stremio requests `meta/series/shuffle:surprise.json`. The server:
   - Picks a random show from `cfg.shows`
   - Calls `pickRandomEpisode(show.id, cfg.topPercent)` (existing function)
   - Returns meta with `behaviorHints.defaultVideoId` set to the episode's `imdbId:season:number`
3. **Auto-Play**: Stremio auto-plays the episode via the existing stream resolution pipeline.
4. **Every open = new surprise**: Each meta request re-rolls the random selection.

## Tile Appearance

| Field         | Value                                                                 |
|---------------|-----------------------------------------------------------------------|
| `id`          | `shuffle:surprise`                                                    |
| `type`        | `series`                                                              |
| `name`        | `🎲 Surprise`                                                        |
| `poster`      | `/surprise-poster.png` (custom generated asset, served from `public/`)|
| `logo`        | Extension logo (`getLogoUrl(req)` — same as manifest logo)            |
| `background`  | Same as poster or omitted                                             |
| `description` | `🎲 Random show, random episode — pure surprise!`                    |
| `posterShape` | `poster`                                                              |

## Files Changed

### `src/index.js`

1. **`catalogHandler`**: Prepend the Surprise tile meta object to the `metas` array before returning. The tile uses a sentinel ID `shuffle:surprise`. Search filtering: include the tile if the search term matches "surprise". Skip/pagination: only include it when `skip === 0`.

2. **`handleMeta`**: Add an early check for `shuffle:surprise` before the existing IMDB-based lookup:
   - Extract shows from `cfg.shows`
   - Pick a random show: `cfg.shows[Math.floor(Math.random() * cfg.shows.length)]`
   - Call `pickRandomEpisode(show.id, cfg.topPercent)`
   - Return meta with the randomly-chosen show's name, poster, and the episode as `defaultVideoId`

### `public/surprise-poster.png`

New asset — the generated poster image. Served by the existing `express.static` middleware.

### No changes to

- `src/config.js` — no config schema changes
- `src/tvmaze.js` — reuses existing `pickRandomEpisode`
- `public/app.js`, `public/index.html`, `public/style.css` — configuration page unchanged

## Edge Cases

- **Single show configured**: Surprise tile still works — it picks that one show and a random episode.
- **Search**: If user searches "surprise", the tile appears. Other searches exclude it.
- **Pagination**: Surprise tile only appears on the first page (`skip === 0`).
- **Error handling**: If `pickRandomEpisode` fails for the randomly-chosen show, fall back to S01E01 of that show (same pattern as existing error handling in `handleMeta`).

## Verification

1. `GET /catalog/series/shuffle.json` → first item has `id: "shuffle:surprise"`
2. `GET /meta/series/shuffle:surprise.json` → returns valid meta with a `defaultVideoId`
3. Repeated requests to the meta endpoint return different episodes (probabilistic)
4. Configured catalog (`/:config/catalog/...`) also shows the Surprise tile first
5. Existing per-show tiles still work unchanged
