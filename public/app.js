// public/app.js - Sitcom Surprise
'use strict';
(function () {
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');
  const favoritesList = document.getElementById('favorites-list');
  const showCount = document.getElementById('show-count');
  const installBtn = document.getElementById('install-btn');
  const installOutput = document.getElementById('install-output');
  const installLink = document.getElementById('install-link');
  const installUrl = document.getElementById('install-url');
  const copyBtn = document.getElementById('copy-btn');
  const percentSlider = document.getElementById('percent-slider');
  const percentInput = document.getElementById('percent-input');
  const percentDesc = document.getElementById('percent-desc');
  const percentClearBtn = document.getElementById('percent-clear');

  const favorites = new Map();
  let topPercent = 20;
  let topPercentIsAll = false;

  // Default examples so configurator doesn't look empty
  const DEFAULT_SHOWS = [
    { id: 'tt0898266', name: 'The Big Bang Theory', poster: 'https://images.metahub.space/poster/medium/tt0898266/img.jpg' },
    { id: 'tt2575988', name: 'Silicon Valley', poster: 'https://images.metahub.space/poster/medium/tt2575988/img.jpg' },
    { id: 'tt0108778', name: 'Friends', poster: 'https://images.metahub.space/poster/medium/tt0108778/img.jpg' },
  ];

  function updatePercentDesc() {
    if (topPercentIsAll || topPercent === 100) {
      percentDesc.textContent = '100% — all episodes, fully random';
      return;
    }
    if (topPercent >= 50) percentDesc.textContent = `Top ${topPercent}% — wide selection by rating`;
    else if (topPercent >= 20) percentDesc.textContent = `Top ${topPercent}% — highest rated episodes`;
    else percentDesc.textContent = `Top ${topPercent}% — only the very best`;
  }

  function setTopPercent(v, isAllFlag = false) {
    if (isAllFlag) {
      topPercentIsAll = true; topPercent = 100;
      percentSlider.value = 100; percentInput.value = ''; percentInput.placeholder = 'all (100)';
      updatePercentDesc(); updateInstallBtn(); return;
    }
    topPercentIsAll = false;
    let num = parseInt(v, 10);
    if (isNaN(num) || v === '' || v == null) { topPercent = 100; percentInput.placeholder = '100'; }
    else topPercent = Math.max(1, Math.min(100, num));
    percentSlider.value = topPercent;
    if (document.activeElement !== percentInput) percentInput.value = topPercent === 100 && v === '' ? '' : topPercent;
    updatePercentDesc(); updateInstallBtn();
  }

  percentSlider.addEventListener('input', (e) => { topPercentIsAll = false; setTopPercent(e.target.value); percentInput.value = e.target.value; });
  percentInput.addEventListener('input', (e) => { const val = e.target.value.trim(); if (val === '') { setTopPercent(100); return; } setTopPercent(val); });
  percentClearBtn.addEventListener('click', () => setTopPercent(null, true));
  updatePercentDesc();

  let searchTimeout;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const query = searchInput.value.trim();
    if (query.length < 2) { searchResults.innerHTML = ''; return; }
    searchTimeout = setTimeout(() => searchShows(query), 350);
  });

  async function searchShows(query) {
    try {
      // Server-side multi-source search (TVMaze + IMDb merged): no CORS issues,
      // covers shows TVMaze misses, and keeps working when one source is down.
      const res = await fetch(`/search/${encodeURIComponent(query)}.json`);
      if (!res.ok) throw new Error(`search ${res.status}`);
      const data = await res.json();
      renderSearchResults(data.results || []);
    } catch { searchResults.innerHTML = '<p class="error">Search failed. Please try again.</p>'; }
  }

  function showCardHtml(show, isAdded) {
    const poster = show.poster || '';
    const year = show.year || '?';
    return `
      <div class="show-card ${isAdded ? 'added' : ''}" data-id="${show.id}">
        <div class="poster-wrap">${poster ? `<img src="${encodeURI(poster)}" alt="" loading="lazy">` : '<div class="no-poster">No Image</div>'}</div>
        <div class="show-info"><span class="show-title" title="${escapeHtml(show.name)}">${escapeHtml(show.name)}</span><span class="show-year">${escapeHtml(String(year))}</span></div>
        <button class="btn-add" data-add="${show.id}">${isAdded ? '✓ Added' : '+ Add'}</button>
      </div>`;
  }

  const searchIndex = new Map();
  const favIndex = new Map();

  function renderSearchResults(results) {
    searchIndex.clear();
    for (const r of results) searchIndex.set(r.id, r);
    if (results.length === 0) {
      searchResults.innerHTML = '<p class="empty-state">No shows found. Try a different spelling.</p>';
      return;
    }
    searchResults.innerHTML = results
      .map(r => showCardHtml(r, favorites.has(r.id)))
      .join('');
  }

  searchResults.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-add]');
    if (!btn) return;
    const show = searchIndex.get(btn.dataset.add);
    if (show) toggleShow(show);
  });

  function toggleShow(show) {
    if (favorites.has(show.id)) favorites.delete(show.id);
    else favorites.set(show.id, { id: show.id, name: show.name, poster: show.poster || '' });
    renderFavorites();
    searchResults.innerHTML = Array.from(searchIndex.values())
      .map(r => showCardHtml(r, favorites.has(r.id)))
      .join('');
    updateInstallBtn();
  }
  // Back-compat for any cached page still calling the old global
  window.__addShow = function (id) {
    const show = searchIndex.get(id) || favIndex.get(id);
    if (show) toggleShow(show);
  };

  function renderFavorites() {
    favIndex.clear();
    for (const s of favorites.values()) favIndex.set(s.id, s);
    if (favorites.size === 0) {
      favoritesList.innerHTML = '<p class="empty-state">No shows yet. Search above to add your favorites!</p>';
      showCount.textContent = '0'; return;
    }
    showCount.textContent = favorites.size;
    favoritesList.innerHTML = Array.from(favorites.values()).map(show => `
      <div class="show-card favorite" data-id="${show.id}">
        <div class="poster-wrap">${show.poster ? `<img src="${encodeURI(show.poster)}" alt="" loading="lazy">` : '<div class="no-poster">No Image</div>'}</div>
        <div class="show-info"><span class="show-title" title="${escapeHtml(show.name)}">${escapeHtml(show.name)}</span></div>
        <button class="btn-remove" data-remove="${show.id}">✕ Remove</button>
      </div>`).join('');
  }

  favoritesList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove]');
    if (!btn) return;
    const show = favIndex.get(btn.dataset.remove);
    if (show) toggleShow(show);
  });

  function updateInstallBtn() {
    const hasShows = favorites.size > 0;
    installBtn.disabled = !hasShows;
    if (hasShows) installOutput.classList.add('hidden');
  }

  installBtn.addEventListener('click', () => {
    if (favorites.size === 0) return;
    const config = { shows: Array.from(favorites.values()).map(s => ({ id: s.id, name: s.name })), topPercent: topPercentIsAll ? 100 : topPercent };
    // TextEncoder-based base64url: safe for unicode names (btoa throws on non-latin1)
    const bytes = new TextEncoder().encode(JSON.stringify(config));
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const encoded = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const base = window.location.origin;
    const manifestUrl = `${base}/${encoded}/manifest.json`;
    const stremioUrl = `stremio://${base.replace(/^https?:\/\//, '')}/${encoded}/manifest.json`;
    installLink.href = stremioUrl; installUrl.value = manifestUrl;
    installOutput.classList.remove('hidden');
  });

  copyBtn.addEventListener('click', () => {
    installUrl.select(); navigator.clipboard.writeText(installUrl.value);
    copyBtn.textContent = '✓ Copied'; setTimeout(() => copyBtn.textContent = 'Copy', 2000);
  });

  function escapeHtml(str) { if (!str) return ''; return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }

  // Load default examples if empty
  (function loadDefaults() {
    if (favorites.size === 0) {
      for (const s of DEFAULT_SHOWS) favorites.set(s.id, s);
      renderFavorites(); updateInstallBtn();
    }
  })();
})();
