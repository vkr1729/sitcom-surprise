// src/search.js - multi-source show search (TVMaze + IMDb suggestions, merged)
'use strict';

const SEARCH_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const SEARCH_CACHE_MAX = 200;
const searchCache = new Map();

const FETCH_HEADERS = { 'User-Agent': 'SitcomSurprise/5.1', 'Accept': 'application/json' };

function fetchWithTimeout(url, ms) {
  return fetch(url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(ms) });
}

function metahubPoster(imdbId) {
  return `https://images.metahub.space/poster/medium/${imdbId}/img.jpg`;
}

function normalizeTvmaze(entry) {
  const show = entry && entry.show ? entry.show : entry;
  if (!show) return null;
  const imdbId = show.externals && show.externals.imdb;
  if (!imdbId || !/^tt\d+$/.test(imdbId)) return null;
  return {
    id: imdbId,
    name: show.name || imdbId,
    year: show.premiered ? show.premiered.slice(0, 4) : null,
    poster: (show.image && (show.image.medium || show.image.original)) || metahubPoster(imdbId),
    source: 'tvmaze',
  };
}

function normalizeImdbSuggestion(d) {
  if (!d || typeof d.id !== 'string' || !/^tt\d+$/.test(d.id)) return null;
  const isSeries = d.qid === 'tvSeries' || d.qid === 'tvMiniSeries'
    || (typeof d.q === 'string' && d.q.toLowerCase().includes('tv series'));
  if (!isSeries) return null;
  if (!d.l) return null;
  return {
    id: d.id,
    name: d.l,
    year: typeof d.y === 'number' ? String(d.y) : null,
    poster: (d.i && d.i.imageUrl) || metahubPoster(d.id),
    source: 'imdb',
  };
}

function mergeResults(tvmazeEntries, imdbEntries, query) {
  const q = (query || '').trim().toLowerCase();
  const byId = new Map();
  for (const raw of tvmazeEntries || []) {
    const n = normalizeTvmaze(raw);
    if (n && !byId.has(n.id)) byId.set(n.id, n);
  }
  for (const raw of imdbEntries || []) {
    const n = normalizeImdbSuggestion(raw);
    if (!n) continue;
    const existing = byId.get(n.id);
    if (!existing) {
      byId.set(n.id, n);
    } else {
      if (!existing.year && n.year) existing.year = n.year;
      if ((!existing.poster || existing.poster === metahubPoster(n.id)) && n.poster) existing.poster = n.poster;
      existing.source = 'both';
    }
  }
  const results = Array.from(byId.values());
  results.sort((a, b) => {
    const an = a.name.toLowerCase();
    const bn = b.name.toLowerCase();
    const aExact = an === q ? 0 : an.startsWith(q) ? 1 : 2;
    const bExact = bn === q ? 0 : bn.startsWith(q) ? 1 : 2;
    return aExact - bExact;
  });
  return results.slice(0, 12);
}

async function searchShows(query) {
  const q = (query || '').trim();
  if (q.length < 2) return [];
  const key = q.toLowerCase();
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.at < SEARCH_CACHE_TTL_MS) return cached.results;

  const [tvmazeRes, imdbRes] = await Promise.allSettled([
    fetchWithTimeout(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(q)}`, 8000)
      .then(r => { if (!r.ok) throw new Error(`tvmaze ${r.status}`); return r.json(); }),
    fetchWithTimeout(`https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(q)}.json`, 8000)
      .then(r => { if (!r.ok) throw new Error(`imdb ${r.status}`); return r.json(); })
      .then(j => (j && j.d) || []),
  ]);

  let tvmazeEntries = tvmazeRes.status === 'fulfilled' ? tvmazeRes.value : [];
  const imdbEntries = imdbRes.status === 'fulfilled' ? imdbRes.value : [];
  if (!Array.isArray(tvmazeEntries)) tvmazeEntries = [];

  let results = mergeResults(tvmazeEntries, imdbEntries, q);

  if (results.length === 0) {
    try {
      const single = await fetchWithTimeout(
        `https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(q)}`, 8000
      ).then(r => (r.ok ? r.json() : null));
      const n = normalizeTvmaze(single);
      if (n) results = [n];
    } catch { /* ignore - return empty */ }
  }

  if (searchCache.size >= SEARCH_CACHE_MAX) {
    const oldest = searchCache.keys().next().value;
    searchCache.delete(oldest);
  }
  searchCache.set(key, { results, at: Date.now() });
  return results;
}

module.exports = { searchShows, mergeResults, normalizeTvmaze, normalizeImdbSuggestion, _searchCache: searchCache };
