'use strict';
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { encodeConfig, decodeConfig } = require('../src/config');

describe('config', () => {
  it('round-trips universal', () => {
    const cfg = {
      shows: [{ id: 'tt0898266', name: 'BBT' }, { id: 'tt0386676', name: 'Office' }],
      topPercent: 20,
    };
    const encoded = encodeConfig(cfg);
    const decoded = decodeConfig(encoded);
    assert.deepStrictEqual(decoded, { ...cfg, autoStream: false });
  });

  it('defaults to 100% when topPercent missing', () => {
    const raw = Buffer.from(JSON.stringify({ shows: [{ id: 'tt0898266' }] })).toString('base64url');
    assert.equal(decodeConfig(raw).topPercent, 100);
  });

  it('throws on empty shows', () => {
    const bad = Buffer.from(JSON.stringify({ shows: [] })).toString('base64url');
    assert.throws(() => decodeConfig(bad), /at least 1 show/);
  });

  it('normalizes topPercent', () => {
    const mk = (tp) => {
      const s = Buffer.from(JSON.stringify({ shows: [{ id: 'tt0898266' }], topPercent: tp })).toString('base64url');
      return decodeConfig(s).topPercent;
    };
    assert.equal(mk(20), 20);
    assert.equal(mk(100), 100);
    assert.equal(mk(null), 100);
    assert.equal(mk(''), 100);
  });
});
