// src/tvmaze.js - persistent cache, configurable top %
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days persistent
const MEMORY_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function getCacheFilePath() {
  try {
    const xdg = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
    const dir = path.join(xdg, 'sitcom-surprise');
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, 'episodes.json');
  } catch {
    const fallbackDir = path.join(__dirname, '..', 'cache');
    try { fs.mkdirSync(fallbackDir, { recursive: true }); } catch {}
    return path.join(fallbackDir, 'episodes.json');
  }
}

const CACHE_FILE = getCacheFilePath();
const memoryCache = new Map();
let fileCacheLoaded = false;

function loadFileCache() {
  if (fileCacheLoaded) return;
  fileCacheLoaded = true;
  try {
    if (!fs.existsSync(CACHE_FILE)) return;
    const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    const now = Date.now();
    let loaded = 0, expired = 0;
    for (const [key, entry] of Object.entries(parsed)) {
      if (!entry || !Array.isArray(entry.episodes)) continue;
      if (now - (entry.cachedAt || 0) < CACHE_TTL_MS) {
        memoryCache.set(key, entry);
        loaded++;
      } else expired++;
    }
    console.log(`[TVMaze] Loaded ${loaded} entries from persistent cache (${expired} expired) — ${CACHE_FILE}`);
  } catch (e) {
    console.warn(`[TVMaze] Failed to load file cache: ${e.message}`);
  }
}

function saveFileCache() {
  try {
    const obj = {};
    for (const [k, v] of memoryCache.entries()) {
      if (v && v.episodes && v.cachedAt) obj[k] = v;
    }
    const tmp = CACHE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj));
    fs.renameSync(tmp, CACHE_FILE);
  } catch (e) {
    console.warn(`[TVMaze] Failed to save file cache: ${e.message}`);
  }
}

let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveFileCache();
  }, 1000);
}

const FETCH_HEADERS = { 'User-Agent': 'SitcomSurprise/5.0', 'Accept': 'application/json' };

async function lookupShowId(imdbId) {
  const res = await fetch(`https://api.tvmaze.com/lookup/shows?imdb=${imdbId}`, {
    headers: FETCH_HEADERS,
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`TVmaze lookup failed for ${imdbId}: ${res.status}`);
  const show = await res.json();
  if (!show || !show.id) throw new Error(`TVmaze returned null for ${imdbId}`);
  return show.id;
}

async function fetchAllEpisodes(tvmazeId) {
  const res = await fetch(`https://api.tvmaze.com/shows/${tvmazeId}/episodes`, {
    headers: FETCH_HEADERS,
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`TVmaze episodes fetch failed for show ${tvmazeId}: ${res.status}`);
  const episodes = await res.json();
  if (!Array.isArray(episodes)) throw new Error(`TVmaze returned invalid episodes for show ${tvmazeId}`);
  return episodes;
}

/**
 * Filter episodes to top X% by rating.
 * - If topPercent empty/null => 100% all videos
 * - Sort by rating descending and take top pct%
 * @param {Array} episodes TVmaze episodes
 * @param {number} topPercent 1-100
 */
function filterTopEpisodes(episodes, topPercent) {
  let tp;
  if (topPercent == null || topPercent === '' || String(topPercent).toLowerCase() === 'all') {
    tp = 100;
  } else {
    tp = Math.round(Number(topPercent));
    if (!Number.isFinite(tp) || tp < 1) tp = 20;
    if (tp > 100) tp = 100;
  }
  const pct = tp / 100;

  // Only regular episodes
  let regular = episodes.filter(ep => ep.type === 'regular');
  if (regular.length === 0) return [];

  if (tp === 100) {
    // All episodes: sort by rating desc, nulls at end, then shuffle? Keep sorted for display but random picker uses random index
    regular.sort((a, b) => {
      const ra = a.rating?.average ?? -1;
      const rb = b.rating?.average ?? -1;
      return rb - ra;
    });
    return regular.map(ep => ({
      season: ep.season,
      number: ep.number,
      name: ep.name || `Episode ${ep.number}`,
      rating: ep.rating?.average ?? null,
      id: ep.id,
    }));
  }

  // For <100%: sort by rating desc, filter out unrated? Keep unrated at end but still include if they fall within top %? 
  // Simpler: sort, then cutoff - this matches "top 20% of episodes by imdb rating" literally
  // Episodes without rating go to end and likely won't be in top % unless 100%
  regular.sort((a, b) => {
    const ra = a.rating?.average ?? -1;
    const rb = b.rating?.average ?? -1;
    return rb - ra;
  });

  const cutoff = Math.max(1, Math.ceil(regular.length * pct));
  const top = regular.slice(0, cutoff);
  return top.map(ep => ({
    season: ep.season,
    number: ep.number,
    name: ep.name || `Episode ${ep.number}`,
    rating: ep.rating?.average ?? null,
    id: ep.id,
  }));
}

function cacheKey(imdbId, topPercent) {
  let tp;
  if (topPercent == null || topPercent === '') tp = 100;
  else {
    tp = Math.round(Number(topPercent));
    if (!Number.isFinite(tp)) tp = 100;
    if (tp < 1) tp = 1;
    if (tp > 100) tp = 100;
  }
  return `${imdbId}:${tp}`;
}

async function getTopEpisodes(imdbId, topPercent) {
  loadFileCache();

  let tp;
  if (topPercent == null || topPercent === '' || topPercent === undefined) tp = 100;
  else {
    tp = Math.round(Number(topPercent));
    if (!Number.isFinite(tp) || tp < 1) tp = 100;
    if (tp > 100) tp = 100;
  }
  if (arguments.length === 1) tp = 100;

  const key = cacheKey(imdbId, tp);
  const cached = memoryCache.get(key);
  if (cached && Date.now() - cached.cachedAt < MEMORY_TTL_MS) {
    return cached.episodes;
  }

  console.log(`[TVMaze] CACHE MISS for ${imdbId} top=${tp}% — fetching`);
  const tvmazeId = await lookupShowId(imdbId);
  const allEpisodes = await fetchAllEpisodes(tvmazeId);
  const top = filterTopEpisodes(allEpisodes, tp);

  const entry = { episodes: top, cachedAt: Date.now(), topPercent: tp, totalEpisodes: allEpisodes.length };
  memoryCache.set(key, entry);
  scheduleSave();
  console.log(`[TVMaze] Cached ${top.length}/${allEpisodes.length} for ${imdbId} top ${tp}%`);

  // Also cache 100% for free if we fetched all
  if (tp !== 100) {
    const allKey = cacheKey(imdbId, 100);
    if (!memoryCache.has(allKey)) {
      memoryCache.set(allKey, {
        episodes: filterTopEpisodes(allEpisodes, 100),
        cachedAt: Date.now(),
        topPercent: 100,
        totalEpisodes: allEpisodes.length,
      });
      scheduleSave();
    }
  }

  return top;
}

async function pickRandomEpisode(imdbId, topPercent) {
  const effectiveTp = topPercent == null || topPercent === '' ? 100 : topPercent;
  const top = await getTopEpisodes(imdbId, effectiveTp);
  if (top.length === 0) throw new Error(`No episodes found for ${imdbId}`);
  const idx = Math.floor(Math.random() * top.length);
  return top[idx];
}

module.exports = {
  getTopEpisodes,
  pickRandomEpisode,
  filterTopEpisodes,
  _cache: memoryCache,
  _loadFileCache: loadFileCache,
  _saveFileCache: saveFileCache,
  _getCacheFile: getCacheFilePath,
};
