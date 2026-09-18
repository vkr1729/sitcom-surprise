'use strict';
const assert = require('node:assert/strict');
const { describe, it, before, after } = require('node:test');
const { encodeConfig } = require('../src/config');

const PORT = 3200 + Math.floor(Math.random() * 900);
const BASE = `http://localhost:${PORT}`;
let server;

before(async () => {
  const app = require('../src/index');
  await new Promise((resolve) => { server = app.listen(PORT, resolve); });
});

after(() => { if (server) server.close(); });

describe('freshness: cacheMaxAge and SWR', () => {
  const cfg = { shows: [{ id: 'tt0898266', name: 'The Big Bang Theory' }], topPercent: 100 };
  const configStr = encodeConfig(cfg);

  it('meta responses carry cacheMaxAge:0 so Stremio re-fetches every open', async () => {
    const meta = await (await fetch(`${BASE}/${configStr}/meta/series/shuffle:tt0898266.json`)).json();
    assert.ok(meta.meta);
    assert.equal(meta.cacheMaxAge, 0);
  });

  it('catalog carries a finite cacheMaxAge', async () => {
    const catalog = await (await fetch(`${BASE}/${configStr}/catalog/series/shuffle.json`)).json();
    assert.ok(Array.isArray(catalog.metas));
    assert.ok(Number.isFinite(catalog.cacheMaxAge) && catalog.cacheMaxAge > 0);
  });

  it('stale cache is served when the network fails (no "No metadata found")', async () => {
    const tvmaze = require('../src/tvmaze');
    const fresh = await tvmaze.getTopEpisodes('tt0898266', 100);
    assert.ok(fresh.length > 0);

    const origFetch = global.fetch;
    // Simulate an upstream outage: fail TVMaze/IMDb calls, but let localhost (the addon) through
    global.fetch = (url, opts) => {
      const s = String(url);
      if (s.includes('127.0.0.1') || s.includes('localhost')) return origFetch(url, opts);
      return Promise.reject(new Error('simulated outage'));
    };
    // expire the fresh entry so the SWR path (not fresh-hit path) is exercised,
    // but keep it within the 30-day stale window
    for (const entry of tvmaze._cache.values()) entry.cachedAt = Date.now() - 25 * 60 * 60 * 1000;
    try {
      const meta = await (await fetch(`${BASE}/${configStr}/meta/series/shuffle:tt0898266.json`)).json();
      assert.ok(meta.meta, 'should serve stale cache instead of null meta');
      assert.equal(meta.meta.videos.length, 1);
      assert.match(meta.meta.videos[0].id, /^tt0898266:\d+:\d+$/);
    } finally {
      global.fetch = origFetch;
      tvmaze._cache.clear();
    }
  });
});
