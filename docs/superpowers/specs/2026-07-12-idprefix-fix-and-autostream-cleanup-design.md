# Fix Greedy `idPrefixes` + Strip Auto-Stream Remnants

**Date:** 2026-07-12
**Status:** Approved
**Scope:** Bug fix + dead code cleanup across 6 files

---

## Problem Statement

Two issues compound to cause the addon to apply top% filtering and random episode selection to **all** TV series in Stremio, not just configured shows:

1. **Greedy manifest `idPrefixes`**: The manifest declares `idPrefixes: ['shuffle:', 'tt']` for meta and stream resources. The `'tt'` prefix causes Stremio to route meta requests for *every* IMDb series to this addon.

2. **Fallback meta for non-configured shows**: The meta handler creates a fake show object for any IMDb ID not in the user's config, then proceeds to call `pickRandomEpisode()` with the user's `topPercent` — applying the surprise behavior to shows the user never intended.

Additionally, the codebase contains remnants of a failed "Auto Play First Stream" feature (commit `c014e93`) that was never successfully completed. These remnants add dead code paths, a dead config field, and UI elements for a non-functional feature.

## Desired Behavior

| Source | ID format | This addon handles? | Behavior |
|---|---|---|---|
| This addon's catalog tile | `shuffle:tt0898266` | Yes (`shuffle:` prefix match) | Random episode from top X% |
| Stremio search / other catalog | `tt0898266` | No (no `tt` prefix in manifest) | Stremio uses normal meta from other addons — all episodes shown |

## Changes

### 1. Manifest: Remove `'tt'` from `idPrefixes`

**File:** `src/index.js` (lines 60-66)

Revert meta and stream resource `idPrefixes` to `['shuffle:']` only. Keep top-level `idPrefixes` as `['shuffle:']` (already correct in pre-feature code, but currently has `'tt'`).

```diff
 resources: [
   'catalog',
-  { name: 'meta', types: ['series'], idPrefixes: ['shuffle:', 'tt'] },
-  { name: 'stream', types: ['series'], idPrefixes: ['shuffle:', 'tt'] },
+  { name: 'meta', types: ['series'], idPrefixes: ['shuffle:'] },
+  { name: 'stream', types: ['series'], idPrefixes: ['shuffle:'] },
 ],
 types: ['series'],
-idPrefixes: ['shuffle:', 'tt'],
+idPrefixes: ['shuffle:'],
```

**Note:** The `stremioAddonsConfig` signature block (lines 69-73) is the legitimate stremio-addons.net registry verification. It MUST be preserved.

### 2. Meta handler: Guard non-configured shows

**File:** `src/index.js` (lines 126-129)

Replace the fallback-create-fake-show path with a null meta response.

```diff
 if (!show) {
-  console.warn(`[Meta] Show ${imdbId} not in config [...], using fallback`);
-  show = { id: imdbId, name: imdbId };
+  console.warn(`[Meta] Show ${imdbId} not in config, returning null`);
+  return res.json({ meta: null });
 }
```

### 3. Catalog handler: Remove `autoStream` branch

**File:** `src/index.js` (lines 86-108)

Revert `catalogHandler` from `async` with the `if (cfg.autoStream)` / `else` branching back to the original simple synchronous `map`:

```diff
-async function catalogHandler(req, res) {
+function catalogHandler(req, res) {
   const cfg = req.addonConfig || DEFAULT_CFG;
   const extra = parseExtra(req.params.extra);
   ...
   const paged = filtered.slice(skip, skip + 100);
-
-  let metas;
-  if (cfg.autoStream) {
-    metas = await Promise.all(paged.map(async (show) => {
-      ...autoStream logic...
-    }));
-  } else {
-    metas = paged.map(show => ({
-      ...
-    }));
-  }
+  const metas = paged.map(show => ({
+    id: `shuffle:${show.id}`,
+    type: 'series',
+    name: show.name,
+    poster: `https://images.metahub.space/poster/medium/${show.id}/img.jpg`,
+    background: `https://images.metahub.space/background/medium/${show.id}/img.jpg`,
+    logo: `https://images.metahub.space/logo/medium/${show.id}/img.png`,
+    description: `🎲 Surprise! One click → random ${cfg.topPercent === 100 ? 'episode' : `top ${cfg.topPercent}% episode`} of ${show.name}`,
+    posterShape: 'poster',
+    behaviorHints: { defaultVideoId: null },
+  }));
   res.json({ metas });
```

### 4. Config: Remove `autoStream` field

**File:** `src/config.js` (line 39)

```diff
-    config.autoStream = !!config.autoStream;
-
     return config;
```

### 5. Configurator UI: Remove auto-stream section

**File:** `public/index.html`
- Remove the entire `<section id="autostream-section">` block (lines 47-56)
- Fix step numbering: "5. Install Addon" → "4. Install Addon"

**File:** `public/app.js`
- Remove `autostreamToggle` DOM reference (line 17)
- Remove `autoStream` variable declaration (line 21)
- Remove `autostreamToggle` event listener (lines 22-24)
- Remove `autoStream` from config JSON in install handler (line 119)

**File:** `public/style.css`
- Remove `.toggle-label` and `.toggle-text` CSS rules (lines 76-79)

### 6. Tests: Remove `autoStream` expectation

**File:** `tests/config.test.js` (line 14)

```diff
-    assert.deepStrictEqual(decoded, { ...cfg, autoStream: false });
+    assert.deepStrictEqual(decoded, cfg);
```

## What Stays Unchanged

- `stremioAddonsConfig` signature block — legitimate registry verification
- Video field naming (`name` instead of `title`, `number` field, static `released` date) — correct Stremio format
- `pickRandomEpisode` / `filterTopEpisodes` / `getTopEpisodes` in `tvmaze.js` — core logic untouched
- Stream handler — already returns `{ streams: [] }`, harmless
- All other existing tests

## Testing Strategy

1. Run existing test suite (`npm test`) — all 16 tests should pass after the config test fix
2. Verify: meta request for `shuffle:tt0898266` returns random episode with top% filter
3. Verify: meta request for bare `tt0898266` returns `{ meta: null }`
4. Verify: configurator generates config without `autoStream` field
5. Verify: manifest `idPrefixes` contains only `['shuffle:']`

## Risk Assessment

- **Low risk**: All changes are removals of dead code or tightening of scope
- **No new logic introduced** — only restoring pre-feature behavior + adding one guard
- **Backward compatible**: Existing install links with `autoStream: false` in their config will still decode correctly (the field is simply ignored)
