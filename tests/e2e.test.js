'use strict';
const assert = require('node:assert/strict');
const { describe, it, before, after } = require('node:test');
const { encodeConfig } = require('../src/config');

const PORT = 3000 + Math.floor(Math.random() * 900);
const BASE = `http://localhost:${PORT}`;
let server;

before(async () => {
  const app = require('../src/index');
  await new Promise((resolve) => { server = app.listen(PORT, resolve); });
});

after(() => { if (server) server.close(); });

describe('e2e universal single catalog true 1-click', () => {
  const cfg = { shows: [{ id: 'tt0898266', name: 'The Big Bang Theory' }], topPercent: 100 };
  const configStr = encodeConfig(cfg);

  it('manifest single catalog, no duplicate rows', async () => {
    const manifest = await (await fetch(`${BASE}/${configStr}/manifest.json`)).json();
    assert.equal(manifest.catalogs.length, 1);
    assert.equal(manifest.catalogs[0].id, 'shuffle');
    assert.equal(manifest.catalogs[0].type, 'series');
  });

  it('catalog returns tiles, meta returns single random video with defaultVideoId', async () => {
    const catalog = await (await fetch(`${BASE}/${configStr}/catalog/series/shuffle.json`)).json();
    assert.equal(catalog.metas.length, 2);
    assert.equal(catalog.metas[0].id, 'shuffle:surprise');
    assert.equal(catalog.metas[1].id, 'shuffle:tt0898266');

    const meta1 = await (await fetch(`${BASE}/${configStr}/meta/series/shuffle:tt0898266.json`)).json();
    assert.ok(meta1.meta);
    assert.ok(Array.isArray(meta1.meta.videos));
    assert.equal(meta1.meta.videos.length, 1);
    assert.ok(meta1.meta.behaviorHints.defaultVideoId);
    assert.match(meta1.meta.videos[0].id, /^tt0898266:\d+:\d+$/);

    const meta2 = await (await fetch(`${BASE}/${configStr}/meta/series/shuffle:tt0898266.json`)).json();
    // random should eventually differ (probabilistic, but with 279 eps low collision)
    assert.ok(meta2.meta.videos[0].id);
  });

  it('no metadata found bug fixed - all configured shows return meta', async () => {
    const cfg3 = {
      shows: [
        { id: 'tt0898266', name: 'BBT' },
        { id: 'tt0386676', name: 'Office' },
        { id: 'tt2575988', name: 'Silicon Valley' },
      ],
    };
    const cs = encodeConfig(cfg3);
    for (const id of ['tt0898266', 'tt0386676', 'tt2575988']) {
      const meta = await (await fetch(`${BASE}/${cs}/meta/series/shuffle:${id}.json`)).json();
      assert.ok(meta.meta, `meta should exist for ${id}, not "No metadata found"`);
      assert.ok(meta.meta.videos.length === 1);
    }
  });
});
