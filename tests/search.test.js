'use strict';
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { mergeResults, normalizeTvmaze, normalizeImdbSuggestion } = require('../src/search');

function tvmazeShow(name, imdb, premiered = '2005-08-04') {
  return { show: { name, premiered, externals: { imdb }, image: { medium: 'http://img/x.jpg' } } };
}

describe('search merge', () => {
  it('finds a show with an apostrophe in the name (Sunny regression)', () => {
    const results = mergeResults(
      [tvmazeShow("It's Always Sunny in Philadelphia", 'tt0472954')],
      [],
      'always sunny'
    );
    assert.equal(results.length, 1);
    assert.equal(results[0].id, 'tt0472954');
    assert.equal(results[0].name, "It's Always Sunny in Philadelphia");
  });

  it('merges IMDb-only shows TVMaze misses', () => {
    const results = mergeResults(
      [],
      [{ id: 'tt9999999', l: 'Some New Sitcom', qid: 'tvSeries', y: 2026, i: { imageUrl: 'http://img/y.jpg' } }],
      'some new'
    );
    assert.equal(results.length, 1);
    assert.equal(results[0].id, 'tt9999999');
    assert.equal(results[0].source, 'imdb');
  });

  it('dedupes shows present in both sources', () => {
    const results = mergeResults(
      [tvmazeShow('Friends', 'tt0108778', '1994-09-22')],
      [{ id: 'tt0108778', l: 'Friends', qid: 'tvSeries', y: 1994 }],
      'friends'
    );
    assert.equal(results.length, 1);
    assert.equal(results[0].source, 'both');
  });

  it('drops TVMaze entries without an IMDb id', () => {
    const results = mergeResults(
      [{ show: { name: 'No Imdb Show', premiered: '2020-01-01', externals: {}, image: null } }],
      [],
      'no imdb'
    );
    assert.equal(results.length, 0);
  });

  it('drops non-series IMDb suggestions', () => {
    const results = mergeResults(
      [],
      [{ id: 'tt1234567', l: 'A Movie', qid: 'feature', y: 2020 }],
      'a movie'
    );
    assert.equal(results.length, 0);
  });

  it('normalizes unicode names without throwing', () => {
    const n = normalizeImdbSuggestion({ id: 'tt7654321', l: 'Café ☕ Show', qid: 'tvSeries', y: 2024 });
    assert.equal(n.name, 'Café ☕ Show');
    const t = normalizeTvmaze({ name: 'Café ☕ Show', premiered: '2024-01-01', externals: { imdb: 'tt7654321' }, image: null });
    assert.equal(t.name, 'Café ☕ Show');
  });
});
