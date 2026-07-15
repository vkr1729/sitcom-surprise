// src/index.js - Sitcom Surprise - single catalog, true single-click, bulletproof meta
'use strict';
const express = require('express');
const path = require('path');
const { decodeConfig } = require('./config');
const { pickRandomEpisode, getTopEpisodes } = require('./tvmaze');

const app = express();

const ADDON_ID = 'org.stremio.sitcomsurprise';
const ADDON_NAME = 'Sitcom Surprise';
const ADDON_VERSION = '5.0.0';
const DEFAULT_CFG = { shows: [{ id: 'tt0898266', name: 'The Big Bang Theory' }], topPercent: 100 };

function getLogoUrl(req) {
  const fallback = 'https://sitcom-surprise.vercel.app/logo.png';
  if (!req) return fallback;
  const host = req.get('host');
  if (!host) return fallback;
  return `https://${host}/logo.png`;
}

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use('/configure', express.static(path.join(__dirname, '..', 'public')));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/', (req, res) => res.redirect('/configure'));

app.param('config', (req, res, next, configParam) => {
  if (configParam === 'default') {
    req.addonConfig = DEFAULT_CFG;
    return next();
  }
  try {
    req.addonConfig = decodeConfig(configParam);
    next();
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

function buildManifest(cfg, req) {
  const logo = getLogoUrl(req);
  return {
    id: ADDON_ID,
    version: ADDON_VERSION,
    name: ADDON_NAME,
    description: `One tile per show. One click = surprise random episode from ${cfg.topPercent === 100 ? 'all episodes' : `top ${cfg.topPercent}% by rating`}.`,
    logo,
    resources: [
      'catalog',
      { name: 'meta', types: ['series'], idPrefixes: ['shuffle:'] },
      { name: 'stream', types: ['series'], idPrefixes: ['shuffle:'] },
    ],
    types: ['series'],
    idPrefixes: ['shuffle:'],
    catalogs: [{ type: 'series', id: 'shuffle', name: ADDON_NAME }],
    behaviorHints: { configurable: true, configurationRequired: false },
    stremioAddonsConfig: {
      issuer: 'https://stremio-addons.net',
      signature: 'eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..SJlrGzhzvmlgE3T3Pk5mXQ.swO7lehOLqeaZgmRj1sU4GPVi5keX36xOTNQj78csMQXkV7pzYI4nGSWUB06Qdhn30qYDBeEyVtX4gksplpAkzfDHX1XX3b59YiQRvzuP5HqjR4Nq4T2Pli-ipgH1KCu.GqL2GUbwQmpd9g4SGFDgCA',
    },
  };
}

function parseExtra(extraStr) {
  if (!extraStr) return {};
  try {
    const sp = new URLSearchParams(extraStr);
    const obj = {};
    for (const [k, v] of sp.entries()) obj[k] = v;
    return obj;
  } catch { return {}; }
}

function getSurprisePosterUrl(req) {
  const fallback = 'https://sitcom-surprise.vercel.app/surprise-poster.png';
  if (!req) return fallback;
  const host = req.get('host');
  if (!host) return fallback;
  return `https://${host}/surprise-poster.png`;
}

function catalogHandler(req, res) {
  const cfg = req.addonConfig || DEFAULT_CFG;
  const extra = parseExtra(req.params.extra);
  const search = (extra.search || '').toLowerCase();
  let filtered = cfg.shows;
  if (search) filtered = filtered.filter(s => s.name.toLowerCase().includes(search));
  const skip = parseInt(extra.skip || '0', 10) || 0;
  const paged = filtered.slice(skip, skip + 100);

  const metas = paged.map(show => ({
    id: `shuffle:${show.id}`,
    type: 'series',
    name: show.name,
    poster: `https://images.metahub.space/poster/medium/${show.id}/img.jpg`,
    background: `https://images.metahub.space/background/medium/${show.id}/img.jpg`,
    logo: `https://images.metahub.space/logo/medium/${show.id}/img.png`,
    description: `🎲 Surprise! One click → random ${cfg.topPercent === 100 ? 'episode' : `top ${cfg.topPercent}% episode`} of ${show.name}`,
    posterShape: 'poster',
    behaviorHints: { defaultVideoId: null },
  }));

  // Prepend the Surprise tile on the first page
  if (skip === 0 && (!search || '🎲 surprise'.includes(search))) {
    const surpriseTile = {
      id: 'shuffle:surprise',
      type: 'series',
      name: '🎲 Surprise',
      poster: getSurprisePosterUrl(req),
      background: getSurprisePosterUrl(req),
      logo: getLogoUrl(req),
      description: '🎲 Random show, random episode — pure surprise!',
      posterShape: 'poster',
      behaviorHints: { defaultVideoId: null },
    };
    metas.unshift(surpriseTile);
  }

  res.json({ metas });
  for (const show of paged) getTopEpisodes(show.id, cfg.topPercent).catch(() => {});
}

async function handleMeta(req, res) {
  const rawId = req.params.id;
  const decodedId = (() => {
    try { return decodeURIComponent(rawId); } catch { return rawId; }
  })();

  let cfg = req.addonConfig || DEFAULT_CFG;

  // --- Surprise tile: pick a random show, then a random episode ---
  if (decodedId === 'shuffle:surprise' || decodedId === 'shuffle%3Asurprise') {
    const shows = cfg.shows || [];
    if (shows.length === 0) return res.json({ meta: null });
    const show = shows[Math.floor(Math.random() * shows.length)];

    try {
      const episode = await pickRandomEpisode(show.id, cfg.topPercent || 100);
      const videoId = `${show.id}:${episode.season}:${episode.number}`;
      const epLabel = `S${String(episode.season).padStart(2, '0')}E${String(episode.number).padStart(2, '0')}`;

      return res.json({
        meta: {
          id: 'shuffle:surprise',
          type: 'series',
          name: '🎲 Surprise',
          poster: `https://images.metahub.space/poster/medium/${show.id}/img.jpg`,
          background: `https://images.metahub.space/background/medium/${show.id}/img.jpg`,
          logo: getLogoUrl(req),
          description: `🎲 Surprise picked ${show.name}! ${epLabel} — ${episode.name}${episode.rating != null ? ` (★${episode.rating})` : ''}. New surprise every open!`,
          releaseInfo: `${episode.season}`,
          imdbRating: episode.rating != null ? String(episode.rating) : undefined,
          behaviorHints: { defaultVideoId: videoId },
          videos: [
            {
              id: videoId,
              name: `${show.name} ${epLabel} — ${episode.name}`,
              season: episode.season,
              number: episode.number,
              episode: episode.number,
              overview: `🎲 Surprise! Randomly picked ${show.name} ${epLabel}: ${episode.name}`,
              released: '2020-01-01T00:00:00.000Z',
            },
          ],
        },
      });
    } catch (err) {
      console.error(`[Meta] Surprise error for ${show.id}:`, err.message);
      const fallbackVideoId = `${show.id}:1:1`;
      return res.json({
        meta: {
          id: 'shuffle:surprise',
          type: 'series',
          name: '🎲 Surprise',
          poster: `https://images.metahub.space/poster/medium/${show.id}/img.jpg`,
          background: `https://images.metahub.space/background/medium/${show.id}/img.jpg`,
          logo: getLogoUrl(req),
          description: `⚠️ Could not fetch episodes for ${show.name}: ${err.message}. Retrying next open will get a surprise!`,
          releaseInfo: '1',
          behaviorHints: { defaultVideoId: fallbackVideoId },
          videos: [
            {
              id: fallbackVideoId,
              name: `${show.name} S01E01 (Retry)`,
              season: 1,
              number: 1,
              episode: 1,
              overview: `Error: ${err.message}. Will retry with random episode on next open.`,
              released: '2020-01-01T00:00:00.000Z',
            },
          ],
        },
      });
    }
  }

  // --- Per-show tile: existing behavior ---
  const imdbMatch = decodedId.match(/(shuffle:)(tt\d+)/);
  const imdbId = imdbMatch ? imdbMatch[2] : null;

  if (!imdbId) {
    console.warn(`[Meta] No valid shuffle ID found: ${rawId}`);
    return res.json({ meta: null });
  }

  let show = cfg.shows ? cfg.shows.find(s => s.id === imdbId) : null;
  if (!show) {
    console.warn(`[Meta] Show ${imdbId} not in config, returning null`);
    return res.json({ meta: null });
  }

  try {
    const episode = await pickRandomEpisode(imdbId, cfg.topPercent || 100);
    const videoId = `${imdbId}:${episode.season}:${episode.number}`;
    const epLabel = `S${String(episode.season).padStart(2, '0')}E${String(episode.number).padStart(2, '0')}`;

    res.json({
      meta: {
        id: `shuffle:${imdbId}`,
        type: 'series',
        name: show.name,
        poster: `https://images.metahub.space/poster/medium/${imdbId}/img.jpg`,
        background: `https://images.metahub.space/background/medium/${imdbId}/img.jpg`,
        logo: `https://images.metahub.space/logo/medium/${imdbId}/img.png`,
        description: `🎲 Surprise — ${cfg.topPercent === 100 ? 'All episodes' : `Top ${cfg.topPercent}%`} · ${epLabel} — ${episode.name}${episode.rating != null ? ` (★${episode.rating})` : ''}. New surprise every open!`,
        releaseInfo: `${episode.season}`,
        imdbRating: episode.rating != null ? String(episode.rating) : undefined,
        behaviorHints: { defaultVideoId: videoId },
        videos: [
          {
            id: videoId,
            name: `${epLabel} ${episode.name}`,
            season: episode.season,
            number: episode.number,
            episode: episode.number,
            overview: `Surprise pick from ${cfg.topPercent === 100 ? 'all episodes' : `top ${cfg.topPercent}%`}. ${show.name} ${epLabel}: ${episode.name}`,
            released: '2020-01-01T00:00:00.000Z',
          },
        ],
      },
    });
  } catch (err) {
    console.error(`[Meta] Error for ${imdbId}:`, err.message);
    const fallbackVideoId = `${imdbId}:1:1`;
    res.json({
      meta: {
        id: `shuffle:${imdbId}`,
        type: 'series',
        name: show.name,
        poster: `https://images.metahub.space/poster/medium/${imdbId}/img.jpg`,
        background: `https://images.metahub.space/background/medium/${imdbId}/img.jpg`,
        logo: `https://images.metahub.space/logo/medium/${imdbId}/img.png`,
        description: `⚠️ Could not fetch episodes: ${err.message}. Retrying next open will get a surprise!`,
        releaseInfo: '1',
        behaviorHints: { defaultVideoId: fallbackVideoId },
        videos: [
          {
            id: fallbackVideoId,
            name: 'S01E01 (Retry)',
            season: 1,
            number: 1,
            episode: 1,
            overview: `Error: ${err.message}. Will retry with random episode on next open.`,
            released: '2020-01-01T00:00:00.000Z',
          },
        ],
      },
    });
  }
}

async function handleStream(req, res) {
  res.json({ streams: [], cacheMaxAge: 0 });
}

// Manifest
app.get('/manifest.json', (req, res) => {
  res.json(buildManifest(DEFAULT_CFG, req));
});
app.get('/:config/manifest.json', (req, res) => {
  res.json(buildManifest(req.addonConfig, req));
  for (const show of req.addonConfig.shows) {
    getTopEpisodes(show.id, req.addonConfig.topPercent).catch(() => {});
  }
});
app.get('/:config/manifest', (req, res) => res.json(buildManifest(req.addonConfig, req)));

// Root catalog/meta without config
app.get('/catalog/series/shuffle.json', catalogHandler);
app.get('/catalog/series/shuffle/:extra.json', catalogHandler);
app.get('/catalog/:type/:id.json', catalogHandler);
app.get('/catalog/:type/:id/:extra.json', catalogHandler);
app.get('/meta/series/:id.json', handleMeta);
app.get('/meta/:type/:id.json', handleMeta);

// Configured catalog/meta (main flow)
app.get('/:config/catalog/series/shuffle.json', catalogHandler);
app.get('/:config/catalog/series/shuffle/:extra.json', catalogHandler);
app.get('/:config/catalog/:type/:id.json', catalogHandler);
app.get('/:config/catalog/:type/:id/:extra.json', catalogHandler);
app.get('/:config/meta/series/:id.json', handleMeta);
app.get('/:config/meta/:type/:id.json', handleMeta);
app.get('/:config/stream/series/:id.json', handleStream);
app.get('/:config/stream/:type/:id.json', handleStream);

// Stream for root as well
app.get('/stream/series/:id.json', handleStream);
app.get('/stream/:type/:id.json', handleStream);

try {
  const { _loadFileCache } = require('./tvmaze');
  _loadFileCache();
  console.log('[Startup] Persistent cache loaded');
} catch (e) {
  console.warn('[Startup] Cache load failed', e.message);
}

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => console.log(`${ADDON_NAME} v${ADDON_VERSION} running at http://localhost:${PORT}`));
}
module.exports = app;
