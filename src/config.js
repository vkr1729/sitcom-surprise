// src/config.js
'use strict';

function encodeConfig(config) {
  return Buffer.from(JSON.stringify(config)).toString('base64url');
}

function decodeConfig(base64String) {
  try {
    const json = Buffer.from(base64String, 'base64url').toString('utf-8');
    const config = JSON.parse(json);

    if (!Array.isArray(config.shows)) {
      throw new Error('Invalid config: missing "shows" array');
    }
    if (config.shows.length === 0) {
      throw new Error('Invalid config: at least 1 show required');
    }

    config.shows = config.shows
      .filter(s => s && typeof s.id === 'string' && s.id.match(/^tt\d+$/))
      .map(s => ({ id: s.id, name: (s.name || s.id).toString().slice(0, 100) }));

    if (config.shows.length === 0) {
      throw new Error('Invalid config: no valid shows');
    }

    // topPercent: if not populated include all 100%
    let topPercent = config.topPercent;
    if (topPercent == null || topPercent === '') {
      topPercent = 100;
    } else {
      topPercent = Math.round(Number(topPercent));
      if (!Number.isFinite(topPercent) || topPercent < 1) topPercent = 20;
      if (topPercent > 100) topPercent = 100;
    }
    config.topPercent = topPercent;

    config.autoStream = !!config.autoStream;

    return config;
  } catch (err) {
    if (err.message.startsWith('Invalid config')) throw err;
    throw new Error(`Failed to decode config: ${err.message}`);
  }
}

module.exports = { encodeConfig, decodeConfig };
