'use strict';
const assert = require('node:assert/strict');
const { describe, it, before, after } = require('node:test');
const { encodeConfig } = require('../src/config');

const TEST_CONFIG = {
  shows: [{ id: 'tt0898266', name: 'The Big Bang Theory' }, { id: 'tt0386676', name: 'The Office' }],
  topPercent: 100,
};
const configStr = encodeConfig(TEST_CONFIG);
const PORT = 3100 + Math.floor(Math.random() * 900);
let server;

before(async () => {
  const app = require('../src/index');
  await new Promise((resolve) => { server = app.listen(PORT, resolve); });
});

after(() => { if (server) server.close(); });

describe('catalog single row', () => {
  it('returns one tile per show in single series catalog shuffle', async () => {
    const url = `http://localhost:${PORT}/${configStr}/catalog/series/shuffle.json`;
    const res = await fetch(url);
    const data = await res.json();
    assert.equal(data.metas.length, 3);
    assert.equal(data.metas[0].id, 'shuffle:surprise');
    assert.equal(data.metas[1].id, 'shuffle:tt0898266');
    assert.equal(data.metas[1].type, 'series');
  });

  it('legacy catalog ids still work but return same single list', async () => {
    const url = `http://localhost:${PORT}/${configStr}/catalog/series/shuffle_series.json`;
    const res = await fetch(url);
    assert.equal(res.status, 200);
  });
});

describe('manifest single catalog', () => {
  it('has only one catalog (no duplicate rows)', async () => {
    const url = `http://localhost:${PORT}/${configStr}/manifest.json`;
    const data = await (await fetch(url)).json();
    assert.equal(data.catalogs.length, 1);
    assert.equal(data.catalogs[0].id, 'shuffle');
    assert.equal(data.catalogs[0].type, 'series');
    assert.ok(data.logo.startsWith('https://'));
  });

  it('handles extra args skip/search', async () => {
    const base = `http://localhost:${PORT}/${configStr}`;
    const res1 = await fetch(`${base}/catalog/series/shuffle/skip=0.json`);
    assert.equal(res1.status, 200);
    const res2 = await fetch(`${base}/catalog/series/shuffle/search=Big.json`);
    const d2 = await res2.json();
    assert.equal(d2.metas.length, 1);
  });
});
