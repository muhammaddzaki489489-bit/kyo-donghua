/* =============================================
   DonghuaVerse — app.js  v3
   Mapping field API sesuai response asli
============================================= */

const API = 'https://www.sankavollerei.web.id/anime/donghua';
const API_DONGHUB = 'https://www.sankavollerei.web.id/anime/donghub';

const state = {
  currentPage : 'home',
  previousPage: 'home',
  prevDetailSlug: null,
  initialized : {},
  searchKw    : '',
  genreSlug   : '',
  genreName   : '',
};

const $ = id => document.getElementById(id);

// Hentikan iframe player (audio/video) supaya gak tetep jalan di background
function stopPlayer() {
  const f = document.getElementById('playerFrame');
  if (f) {
    f.src = 'about:blank';
    f.remove();
  }
}

/* ============================================================
   NAVIGATION
============================================================ */
function showPage(id) {
  // Stop audio/video iframe kalau pindah dari halaman episode
  if (state.currentPage === 'episode' && id !== 'episode') {
    stopPlayer();
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link,.mobile-link,.bn-item').forEach(l => l.classList.remove('active'));
  const page = $(`page-${id}`);
  if (!page) return;
  page.classList.add('active');
  document.querySelectorAll(`[data-page="${id}"]`).forEach(l => l.classList.add('active'));
  // Update bottom nav
  document.querySelectorAll('.bn-item').forEach(l => {
    l.classList.toggle('active', l.dataset.page === id);
  });
  state.currentPage = id;
  if (!state.initialized[id]) {
    state.initialized[id] = true;
    switch (id) {
      case 'home':      loadHome(1);      break;
      case 'ongoing':   loadOngoing(1);   break;
      case 'completed': loadCompleted(1); break;
      case 'latest':    loadLatest(1);    break;
      case 'schedule':  loadSchedule();   break;
      case 'genres':    loadGenres();     break;
      case 'seasons':   initSeasons();    break;
    }
  }
  closeMobileMenu();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('[data-page]').forEach(l =>
  l.addEventListener('click', e => { e.preventDefault(); showPage(l.dataset.page); })
);

const hamburger = $('hamburger');
const mobileMenu = $('mobileMenu');
if (hamburger) {
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('open');
    if (mobileMenu) mobileMenu.classList.toggle('open');
  });
}
function closeMobileMenu() {
  if (hamburger) hamburger.classList.remove('open');
  if (mobileMenu) mobileMenu.classList.remove('open');
}
window.addEventListener('scroll', () =>
  $('navbar').classList.toggle('scrolled', window.scrollY > 20)
);

$('searchBtn').addEventListener('click', () => doSearch($('searchInput').value.trim()));
$('searchInput').addEventListener('keydown', e => e.key === 'Enter' && doSearch($('searchInput').value.trim()));

let _searchDebounce = null;
$('searchInput').addEventListener('input', e => {
  const kw = e.target.value.trim();
  clearTimeout(_searchDebounce);
  if (!kw) {
    // langsung balik ke home normal saat kosong
    clearHomeSearch();
    return;
  }
  _searchDebounce = setTimeout(() => doSearch(kw), 400);
});

function doSearch(kw) {
  if (!kw) { clearHomeSearch(); return; }
  state.searchKw = kw;
  if (state.currentPage !== 'home') showPage('home');
  state.initialized['home'] = true;
  loadHomeSearch(kw, 1);
}

// Tampilkan hasil pencarian di halaman home, sembunyikan konten home normal
async function loadHomeSearch(kw, page = 1) {
  const results = $('homeSearchResults');
  const normal = $('homeNormalContent');
  const pag = $('homePagination');
  normal.style.display = 'none';
  pag.style.display = 'none';
  results.style.display = 'block';
  results.innerHTML = `
    <div class="home-section-title">
      <span class="hs-dot latest"></span>Hasil pencarian: "${esc(kw)}"
    </div>
    <div class="grid-container" id="homeSearchGrid">${loadingHTML()}</div>
    <div class="pagination" id="homeSearchPagination"></div>`;
  const grid = $('homeSearchGrid');
  try {
    const data = await fetchAPI(`/search/${encodeURIComponent(kw)}/${page}`);
    const raw = data.data || data.results || data.search_result || [];
    if (!raw.length) {
      grid.innerHTML = emptyHTML(`Tidak ada hasil untuk "${esc(kw)}"`);
      $('homeSearchPagination').innerHTML = '';
      return;
    }
    renderDetailCards(grid, raw);
    renderPagination('homeSearchPagination', page, data.totalPage || data.last_page || 1,
      p => loadHomeSearch(kw, p));
  } catch (err) {
    grid.innerHTML = errorHTML(() => loadHomeSearch(kw, page));
  }
}

// Balik ke tampilan home normal (dipanggil saat search dihapus)
function clearHomeSearch() {
  state.searchKw = '';
  const results = $('homeSearchResults');
  const normal = $('homeNormalContent');
  const pag = $('homePagination');
  results.style.display = 'none';
  results.innerHTML = '';
  normal.style.display = '';
  pag.style.display = '';
}

/* ============================================================
   FETCH
============================================================ */
async function fetchAPI(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Normalisasi 1 item donghub jadi format yg dipakai card/latest renderer
function normalizeDonghubItem(i) {
  return {
    title : i.title || i.judul || '',
    slug  : (i.slug || i.anime_slug || i.url || '').replace(/\/+$/,''),
    poster: i.poster || i.thumbnail || i.image || '',
    status: i.status || '',
    type  : i.type || 'Donghua',
    sub   : i.sub || 'Sub',
    episode: i.episode || i.current_episode || i.latest_episode || '',
    href  : i.href || ''
  };
}

// Ambil data "latest" — coba donghua dulu, kalau gagal/kosong/telat fallback ke donghub
async function fetchLatestData(page = 1) {
  try {
    const data = await fetchAPI(`/latest/${page}`);
    const items = data.latest_donghua || [];
    if (items.length) {
      return { latest_donghua: items, totalPage: data.totalPage || 1, _source: 'donghua' };
    }
    throw new Error('latest_donghua kosong');
  } catch (e) {
    // Fallback ke donghub kalau donghua telat / error / kosong
    try {
      const res = await fetch(`${API_DONGHUB}/latest/${page}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      const raw = j.latest_donghua || j.data || j.results || [];
      return {
        latest_donghua: raw.map(normalizeDonghubItem),
        totalPage: j.totalPage || j.last_page || 1,
        _source: 'donghub'
      };
    } catch (e2) {
      // Kedua sumber gagal — lempar error asli
      throw e;
    }
  }
}



/* ============================================================
   PARTICLES
============================================================ */
(function() {
  const c = $('bgParticles');
  for (let i = 0; i < 30; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = Math.random() * 100 + '%';
    p.style.setProperty('--dur',   (6 + Math.random() * 8) + 's');
    p.style.setProperty('--delay', (Math.random() * 8)     + 's');
    c.appendChild(p);
  }
})();

/* ============================================================
   AZ FILTER
============================================================ */
// AZ filter dihapus dari home

/* ============================================================
   SLUG HELPERS
   /home latest_release  → href = /donghua/episode/SLUG  → episode
   /home completed_donghua → href = /donghua/detail/SLUG → detail
   /latest latest_donghua  → href = /donghua/detail/SLUG → detail
   /ongoing ongoing_donghua → slug = detail slug
   /completed completed_donghua → slug = detail slug
============================================================ */

// Ambil slug episode dari href /donghua/episode/SLUG
function epSlugFromHref(href) {
  if (!href) return '';
  const m = href.match(/\/episode\/([^?#]+)/);
  return m ? m[1].replace(/\/+$/, '') : '';
}

// Ambil slug detail dari href /donghua/detail/SLUG atau dari item.slug
function detailSlugFrom(item) {
  if (item.href) {
    const m = item.href.match(/\/detail\/([^?#]+)/);
    if (m) return m[1].replace(/\/+$/, '');
  }
  // slug field biasanya sudah berupa detail slug (ongoing, completed, latest)
  return (item.slug || '').replace(/\/+$/, '');
}

/* ============================================================
   HOME — ambil dari ongoing + completed
   ongoing_donghua & completed_donghua punya slug bersih (detail slug)
============================================================ */
async function loadHome(page = 1) {
  const grid = $('homeNormalContent');
  grid.innerHTML = loadingHTML();
  try {
    const [latestData, completedData] = await Promise.all([
      fetchLatestData(page),
      fetchAPI(`/completed/1`)
    ]);
    const latestItems = (latestData.latest_donghua || []).map(i => ({
      ...i, _mode: 'detail', _slug: (i.slug||'').replace(/\/+$/,'')
    }));
    const completedItems = (completedData.completed_donghua || []).map(i => ({
      ...i, _mode: 'detail', _slug: (i.slug||'').replace(/\/+$/,'')
    }));

    let html = '';

    // Update Terbaru Donghua
    if (latestItems.length) {
      html += `
        <div class="home-section-title">
          <span class="hs-dot latest"></span>Donghua Terbaru
          <span class="hs-count">${latestItems.length}</span>
        </div>
        <div class="grid-container">
          ${latestItems.map((item, idx) => cardHTML(item, idx)).join('')}
        </div>`;
    }

    // Sudah Tamat Donghua
    if (completedItems.length) {
      html += `
        <div class="home-section-title" style="margin-top:32px">
          <span class="hs-dot completed"></span>Donghua Tamat
          <span class="hs-count">${completedItems.length}</span>
        </div>
        <div class="grid-container">
          ${completedItems.map((item, idx) => cardHTML(item, idx)).join('')}
        </div>`;
    }

    if (!html) { grid.innerHTML = emptyHTML('Tidak ada data'); return; }
    grid.innerHTML = html;

    grid.querySelectorAll('.anime-card').forEach(card => {
      card.addEventListener('click', () => {
        if (card.dataset.slug) {
          loadDetail(card.dataset.slug);
        }
      });
    });

    renderPagination('homePagination', page, latestData.totalPage || 1,
      p => { state.initialized['home'] = true; loadHome(p); });
  } catch (err) {
    grid.innerHTML = errorHTML(() => loadHome(page));
  }
}


async function loadAZList(letter, page = 1) {
  const grid = $('homeNormalContent');
  grid.innerHTML = loadingHTML();
  try {
    const data = await fetchAPI(`/az-list/${letter}/${page}`);
    const items = (data.data || data.donghua_list || data.anime_list || []);
    renderDetailCards(grid, items);
    renderPagination('homePagination', page, data.totalPage || data.last_page || 1,
      p => loadAZList(letter, p));
  } catch (err) { grid.innerHTML = errorHTML(() => loadAZList(letter, page)); }
}

/* ============================================================
   ONGOING  → { ongoing_donghua: [{title,slug,poster,status,...}] }
   slug = detail slug
============================================================ */
async function loadOngoing(page = 1) {
  const grid = $('ongoingGrid');
  grid.innerHTML = loadingHTML();
  try {
    const data = await fetchAPI(`/ongoing/${page}`);
    renderDetailCards(grid, data.ongoing_donghua || []);
    renderPagination('ongoingPagination', page, data.totalPage || 1,
      p => { state.initialized['ongoing'] = true; loadOngoing(p); });
  } catch (err) { grid.innerHTML = errorHTML(() => loadOngoing(page)); }
}

/* ============================================================
   COMPLETED → { completed_donghua: [{title,slug,poster,...}] }
   slug = detail slug
============================================================ */
async function loadCompleted(page = 1) {
  const grid = $('completedGrid');
  grid.innerHTML = loadingHTML();
  try {
    const data = await fetchAPI(`/completed/${page}`);
    renderDetailCards(grid, data.completed_donghua || []);
    renderPagination('completedPagination', page, data.totalPage || 1,
      p => { state.initialized['completed'] = true; loadCompleted(p); });
  } catch (err) { grid.innerHTML = errorHTML(() => loadCompleted(page)); }
}

/* ============================================================
   LATEST → { latest_donghua: [{title,slug,poster,href→/detail/,...}] }
   slug = detail slug, klik → detail
============================================================ */
async function loadLatest(page = 1) {
  const grid = $('latestGrid');
  grid.innerHTML = loadingHTML();
  try {
    const data = await fetchLatestData(page);
    renderLatestCards(grid, data.latest_donghua || []);
    renderPagination('latestPagination', page, data.totalPage || 1,
      p => { state.initialized['latest'] = true; loadLatest(p); });
  } catch (err) { grid.innerHTML = errorHTML(() => loadLatest(page)); }
}

/* ============================================================
   SCHEDULE → { schedule: [{day, donghua_list:[{title,slug,poster,episode,release_time,href}]}] }
============================================================ */
async function loadSchedule() {
  const c = $('scheduleContainer');
  c.innerHTML = loadingHTML();
  try {
    const data = await fetchAPI('/schedule');
    const schedule = data.schedule || [];
    if (!schedule.length) {
      c.innerHTML = emptyHTML('Tidak ada data jadwal'); return;
    }
    c.innerHTML = schedule.map(day => {
      const list = day.donghua_list || [];
      const items = list.map(a => {
        const slug = detailSlugFrom(a);
        const poster = a.poster || a.thumbnail || '';
        return `
          <div class="schedule-item" data-slug="${esc(slug)}">
            <div class="schedule-item-thumb">
              ${poster
                ? `<img src="${esc(poster)}" alt="${esc(a.title || '')}" loading="lazy"
                        onerror="this.parentNode.innerHTML='<div class=\\'card-thumb-placeholder\\'>動</div>'">`
                : `<div class="card-thumb-placeholder">動</div>`}
            </div>
            <div class="schedule-item-body">
              <div class="schedule-item-title">${esc(a.title || '')}</div>
              <div class="schedule-item-ep">
                ${a.episode ? `Ep ${esc(a.episode)}` : ''}
                ${a.release_time ? ` · ${esc(a.release_time)}` : ''}
              </div>
            </div>
          </div>`;
      }).join('');
      return `
        <div class="schedule-day">
          <div class="schedule-day-header">
            <span class="day-name">${esc(day.day || '')}</span>
            <span class="day-badge">${list.length} donghua</span>
          </div>
          <div class="schedule-list">${items || '<p style="color:var(--text-dim);font-size:13px;padding:8px">Tidak ada tayang</p>'}</div>
        </div>`;
    }).join('');

    c.querySelectorAll('.schedule-item').forEach(item =>
      item.addEventListener('click', () => {
        if (item.dataset.slug) loadDetail(item.dataset.slug);
      })
    );
  } catch (err) {
    c.innerHTML = `<div class="error-state"><span class="err-code">!</span><p>Gagal memuat jadwal</p>
      <button class="retry-btn" onclick="loadSchedule()">Coba Lagi</button></div>`;
  }
}

/* ============================================================
   GENRES → { data:[{name,slug}] }
============================================================ */
async function loadGenres() {
  const c = $('genreListContainer');
  c.innerHTML = loadingHTML();
  try {
    const data = await fetchAPI('/genres');
    const genres = data.data || data.genres || [];
    if (!genres.length) { c.innerHTML = emptyHTML('Tidak ada genre'); return; }
    c.innerHTML = genres.map(g =>
      `<div class="genre-chip" data-slug="${esc(g.slug)}" data-name="${esc(g.name)}">${esc(g.name)}</div>`
    ).join('');
    c.querySelectorAll('.genre-chip').forEach(chip =>
      chip.addEventListener('click', () =>
        showGenreDetail(chip.dataset.slug, chip.dataset.name, 1))
    );
  } catch (err) {
    c.innerHTML = `<div class="error-state"><span class="err-code">!</span><p>Gagal memuat genre</p>
      <button class="retry-btn" onclick="loadGenres()">Coba Lagi</button></div>`;
  }
}

async function showGenreDetail(slug, name, page = 1) {
  state.genreSlug = slug; state.genreName = name;
  $('genreListContainer').style.display = 'none';
  $('genreDetailSection').style.display = 'block';
  $('genreDetailTitle').textContent = `Genre: ${name}`;
  const grid = $('genreGrid');
  grid.innerHTML = loadingHTML();
  try {
    const data = await fetchAPI(`/genres/${slug}/${page}`);
    const raw = data.data || data.donghua_list || data.results || [];
    renderDetailCards(grid, raw);
    renderPagination('genrePagination', page, data.totalPage || data.last_page || 1,
      p => showGenreDetail(slug, name, p));
  } catch (err) { grid.innerHTML = errorHTML(() => showGenreDetail(slug, name, page)); }
}

$('backFromGenre').addEventListener('click', () => {
  $('genreDetailSection').style.display = 'none';
  $('genreListContainer').style.display = 'grid';
});

/* ============================================================
   SEASONS
============================================================ */
function initSeasons() {
  const sel = $('yearSelector');
  const now = new Date().getFullYear();
  for (let y = now; y >= 2015; y--) {
    const b = document.createElement('button');
    b.className = 'year-btn' + (y === now ? ' active' : '');
    b.dataset.year = y; b.textContent = y;
    sel.appendChild(b);
  }
  sel.addEventListener('click', e => {
    const b = e.target.closest('.year-btn');
    if (!b) return;
    sel.querySelectorAll('.year-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    loadSeasons(b.dataset.year);
  });
  loadSeasons(now);
}

async function loadSeasons(year) {
  const grid = $('seasonsGrid');
  grid.innerHTML = loadingHTML();
  try {
    const data = await fetchAPI(`/seasons/${year}`);
    const raw = data.data || data.donghua_list || data.results || [];
    renderDetailCards(grid, raw);
  } catch (err) { grid.innerHTML = errorHTML(() => loadSeasons(year)); }
}

/* Pencarian sekarang dirender langsung di home, lihat loadHomeSearch() */


/* ============================================================
   DETAIL
   Response: { title, alter_title, poster, status, type,
               episodes_count, studio, network, released,
               duration, season, country, genres:[{name,slug}],
               synopsis, episode_list:[{title,slug,episode}] }
   CATATAN: "status" di root = status donghua (Ongoing/Completed)
            BUKAN status HTTP
============================================================ */
async function loadDetail(slug) {
  if (!slug) { showToast('Slug tidak valid', 'error'); return; }
  // Simpan halaman sebelumnya, tapi jangan simpan 'episode' atau 'detail'
  if (state.currentPage !== 'episode' && state.currentPage !== 'detail') {
    state.previousPage = state.currentPage;
  }
  showPage('detail');
  state.initialized['detail'] = true;
  const c = $('detailContainer');
  c.innerHTML = loadingHTML();
  try {
    const cleanSlug = slug.replace(/\/+$/, '');
    const data = await fetchAPI(`/detail/${cleanSlug}`);
    // data.title harus ada — kalau tidak berarti response error
    if (!data.title) throw new Error('No title in response');
    renderDetail(c, data, cleanSlug);
  } catch (err) {
    console.error('loadDetail error:', err, 'slug:', slug);
    c.innerHTML = `<div class="error-state"><span class="err-code">!</span>
      <p>Gagal memuat detail<br><small style="color:var(--text-dim)">${esc(slug)}</small></p>
      <button class="retry-btn" onclick="loadDetail('${esc(slug)}')">Coba Lagi</button></div>`;
  }
}

function renderDetail(c, d, slug) {
  const title    = d.title || 'Unknown';
  const altTitle = d.alter_title || '';
  const poster   = d.poster || '';
  const synopsis = d.synopsis || d.description || 'Tidak ada sinopsis.';
  const genres   = d.genres || [];
  const epList   = d.episodes_list || d.episode_list || d.episodes || [];

  // Badge chips: status, type, eps, durasi, tahun, dll
  const badges = [
    d.status, d.type, d.episodes_count, d.duration, d.season,
    d.network, d.country
  ].filter(Boolean);

  const badgeHTML = badges.map(b =>
    `<span class="detail-badge">${esc(b)}</span>`
  ).join('');

  const genreHTML = genres.map(g =>
    `<span class="genre-tag" data-slug="${esc(g.slug)}" data-name="${esc(g.name)}">${esc(g.name)}</span>`
  ).join('');

  // Episode list — horizontal scroll, nomor saja
  const epHTML = epList.map((ep, i) => {
    const epSlug  = (ep.slug || '').replace(/\/+$/, '');
    const rawEp   = ep.episode || ep.title || ep.name || ep.ep || '';
    const numMatch = rawEp.match(/Episode\s+(\S+)/i);
    const epLabel  = numMatch ? numMatch[1] : (rawEp || String(epList.length - i));
    return `<div class="ep-chip" data-slug="${esc(epSlug)}">${esc(epLabel)}</div>`;
  }).join('');

  // Sinopsis singkat (3 baris), expandable
  c.innerHTML = `
    <div class="dh-hero" style="background-image:url('${esc(poster)}')">
      <div class="dh-hero-overlay"></div>
      <div class="dh-hero-content">
        <div class="dh-poster-wrap">
          ${poster
            ? `<img src="${esc(poster)}" alt="${esc(title)}" class="dh-poster-img"
                    onerror="this.parentNode.innerHTML='<div class=\\'card-thumb-placeholder\\'>動</div>'">`
            : `<div class="card-thumb-placeholder">動</div>`}
        </div>
        <div class="dh-hero-info">
          ${altTitle ? `<p class="dh-alt-title">${esc(altTitle)}</p>` : ''}
          <h1 class="dh-title">${esc(title)}</h1>
          <div class="dh-badges">${badgeHTML}</div>
        </div>
      </div>
    </div>

    <div class="dh-body">
      ${genreHTML ? `<div class="dh-genres">${genreHTML}</div>` : ''}

      <div class="dh-synopsis-wrap">
        <h3 class="dh-section-label">Sinopsis</h3>
        <p class="dh-synopsis collapsed" id="dhSynopsis">${esc(synopsis)}</p>
        <button class="dh-expand-btn" id="dhExpandBtn">Selengkapnya ▾</button>
      </div>

      ${epList.length ? `
        <div class="dh-eps-wrap">
          <div class="dh-eps-header">
            <h3 class="dh-section-label">Episode List</h3>
            <span class="dh-eps-count">${epList.length} eps</span>
          </div>
          <div class="dh-ep-scroll">${epHTML}</div>
        </div>` : ''}

      <div class="dh-meta-table">
        ${[
          ['Studio',  d.studio],
          ['Network', d.network],
          ['Rilis',   d.released || d.released_on],
          ['Update',  d.updated_on],
          ['Negara',  d.country],
          ['Rating',  d.rating],
        ].filter(r=>r[1]).map(([l,v])=>`
          <div class="dh-meta-row">
            <span class="dh-meta-label">${l}</span>
            <span class="dh-meta-val">${esc(String(v))}</span>
          </div>`).join('')}
      </div>
    </div>`;

  // Expand sinopsis
  const syn = document.getElementById('dhSynopsis');
  const btn = document.getElementById('dhExpandBtn');
  if (syn && btn) {
    btn.addEventListener('click', () => {
      syn.classList.toggle('collapsed');
      btn.textContent = syn.classList.contains('collapsed') ? 'Selengkapnya ▾' : 'Sembunyikan ▴';
    });
  }

  // Episode klik
  c.querySelectorAll('.ep-chip').forEach(chip =>
    chip.addEventListener('click', () => {
      const s = chip.dataset.slug;
      if (s) { state.prevDetailSlug = slug; loadEpisode(s); }
    })
  );

  // Genre klik
  c.querySelectorAll('.genre-tag').forEach(tag =>
    tag.addEventListener('click', () => {
      showPage('genres');
      if (!state.initialized['genres']) {
        state.initialized['genres'] = true;
        loadGenres().then(() => showGenreDetail(tag.dataset.slug, tag.dataset.name, 1));
      } else {
        showGenreDetail(tag.dataset.slug, tag.dataset.name, 1);
      }
    })
  );
}
$('backFromDetail').addEventListener('click', () => {
  showPage(state.previousPage || 'home');
});

/* ============================================================
   EPISODE
   Response: { episode, streaming:{servers:[{name,url}]},
               download_url:{download_url_360p:{Mirror:url,...},...},
               donghua_details:{title,slug,poster} }
============================================================ */
// Cek apakah server mengandung watermark/iklan anichin, dailymotion, dll yang gak diinginkan
function isBadServer(s) {
  const name = (s.name || s.server || '').toLowerCase();
  const url  = (s.url || '').toLowerCase();
  const bad  = ['anichin', 'dailymotion', '[ads]', 'premium'];
  return bad.some(b => name.includes(b) || url.includes(b));
}

async function loadEpisode(slug) {
  if (!slug) return;
  showPage('episode');
  state.initialized['episode'] = true;
  const c = $('episodeContainer');
  c.innerHTML = loadingHTML();
  const cleanSlug = slug.replace(/\/+$/, '');

  try {
    // Coba donghua API dulu, filter server yang ada watermark/iklan
    try {
      const res = await fetch(`${API}/episode/${cleanSlug}`);
      if (res.ok) {
        const data = await res.json();
        const allServers = data.streaming?.servers || [];
        const cleanServers = allServers.filter(s => !isBadServer(s));
        if (cleanServers.length) {
          data.streaming.servers = cleanServers;
          data._source = 'donghua';
          renderEpisode(c, data, cleanSlug);
          return;
        }
      }
    } catch(e) {}

    // Fallback ke donghub kalau donghua gagal / kosong / semua server kena filter
    const r = await fetch(`${API_DONGHUB}/episode/${cleanSlug}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    if (!(j.data && j.data.streams && j.data.streams.length)) throw new Error('No streams from donghub');

    const d = j.data;
    const nav = d.navigation || {};
    const info = d.anime_info || {};
    const allStreams = d.streams || [];
    const cleanStreams = allStreams.filter(s => !isBadServer(s));

    renderEpisode(c, {
      _source: 'donghub',
      episode: d.title || cleanSlug,
      streaming: { servers: (cleanStreams.length ? cleanStreams : allStreams).map(s=>({name:s.server,url:s.url,quality:s.quality})) },
      download_url: {},
      donghua_details: { title:info.title||'', slug:nav.all_slug||'', poster:info.thumbnail||'' },
      _nav: nav
    }, cleanSlug);
  } catch (err) {
    c.innerHTML = `<div class="error-state"><span class="err-code">!</span>
      <p>Gagal memuat episode</p>
      <button class="retry-btn" onclick="loadEpisode('${esc(cleanSlug)}')">Coba Lagi</button></div>`;
  }
}

function renderEpisode(c, d, slug) {
  // Support 2 format: donghub (d.data.streams) dan donghua (d.streaming.servers)
  const isDonghub = d._source === 'donghub' && d.data;
  const dd = isDonghub ? d.data : d;

  const epTitle = isDonghub ? (dd.title || 'Episode') : (d.episode || d.title || 'Episode');
  const info    = isDonghub ? (dd.anime_info || {}) : (d.donghua_details || {});
  const infoTitle  = info.title || '';
  const infoPoster = info.thumbnail || info.poster || '';
  const infoSlug   = isDonghub ? (dd.navigation?.all_slug || '') : (info.slug || '');

  // Servers
  let servers = [];
  if (isDonghub) {
    servers = (dd.streams || []).map(s => ({ name: s.server, url: s.url }));
  } else {
    const streaming = d.streaming || {};
    servers = (streaming.servers || []).filter(s => !isBadServer(s));
    if (!servers.length) servers = streaming.servers || [];
  }

  // Default server: index 0
  const defaultIdx = 0;
  const firstUrl = servers[defaultIdx]?.url || '';

  const serverLabel = s => {
    if (s.quality) return /p$/i.test(String(s.quality)) ? String(s.quality) : `${s.quality}p`;
    const m = (s.name || '').match(/(\d{3,4})p/i);
    if (m) return m[0];
    return s.name || 'Auto';
  };
  const serverBtns = servers.map((s, i) =>
    `<button class="sv-btn ${i===defaultIdx?'active':''}" data-url="${esc(s.url||'')}">${esc(serverLabel(s))}</button>`
  ).join('');

  // Downloads
  let dlHTML = '';
  const qualityInfo = {
    '360': { label: '360p (Hemat)', badge: 'Low', badgeColor: '#a855f7' },
    '480': { label: '480p (Standar)', badge: 'SD', badgeColor: '#3b82f6' },
    '720': { label: '720p (Bagus)', badge: 'HD', badgeColor: '#f59e0b' },
    '1080': { label: '1080p (Full HD)', badge: 'FHD', badgeColor: '#22c55e' },
  };

  if (isDonghub) {
    const dls = dd.downloads || [];
    if (dls.length) {
      dlHTML = dls.map(dl => {
        const q = (dl.quality||'').replace('p','');
        const info = qualityInfo[q] || { label: dl.quality||'HD', badge: 'HD', badgeColor: '#f59e0b' };
        return `
          <a class="dl-card" href="${esc(dl.url||'#')}" target="_blank" rel="noopener">
            <div class="dl-card-left">
              <div class="dl-card-title">${info.label}</div>
            </div>
            <span class="dl-card-badge" style="background:${info.badgeColor}">${info.badge}</span>
          </a>`;
      }).join('');
    }
  } else {
    const dlObj = d.download_url || {};
    dlHTML = Object.entries(dlObj).map(([qKey, links]) => {
      const q = qKey.replace('download_url_','').replace('p','');
      const info = qualityInfo[q] || { label: q+'p', badge: 'HD', badgeColor: '#f59e0b' };
      const provBtns = Object.entries(links).map(([prov, url]) =>
        `<a class="dl-prov-btn" href="${esc(url)}" target="_blank" rel="noopener">${esc(prov)}</a>`
      ).join('');
      return `
        <div class="dl-card">
          <div class="dl-card-left">
            <div class="dl-card-title">${info.label}</div>
            <div class="dl-prov-list">${provBtns}</div>
          </div>
          <span class="dl-card-badge" style="background:${info.badgeColor}">${info.badge}</span>
        </div>`;
    }).join('');
  }

  // Prev/Next nav (donghub only)
  const nav = isDonghub ? (dd.navigation || {}) : {};
  const prevSlug = nav.prev_slug || '';
  const nextSlug = nav.next_slug || '';

  c.innerHTML = `
    ${infoTitle ? `
      <div class="ep-info-bar" id="epBackInfo" data-slug="${esc(infoSlug)}">
        ${infoPoster ? `<img src="${esc(infoPoster)}" class="ep-info-poster" alt="">` : ''}
        <div class="ep-info-text">
          <div class="ep-info-now">SEDANG MENONTON</div>
          <div class="ep-info-title">${esc(infoTitle)}</div>
          <div class="ep-info-ep">${esc(epTitle.match(/Episode\s+\S+/i)?.[0] || epTitle)}</div>
        </div>
        <span class="ep-info-arrow">›</span>
      </div>` : ''}

    <div class="ep-player-wrap" id="epPlayerWrap">
      ${firstUrl
        ? `<div class="ep-player-frame" id="epPlayerFrame">
             <iframe id="playerFrame" src="${esc(firstUrl)}" allowfullscreen
               allow="autoplay; fullscreen; picture-in-picture"></iframe>
             <!-- Prev/Next overlay -->
             ${prevSlug ? `<button class="ep-overlay-btn ep-prev-btn" id="epPrevBtn">
               <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5" stroke="white" stroke-width="2"/></svg>
             </button>` : ''}
             ${nextSlug ? `<button class="ep-overlay-btn ep-next-btn" id="epNextBtn">
               <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19" stroke="white" stroke-width="2"/></svg>
             </button>` : ''}
             <!-- Fullscreen button -->
             <button class="ep-fullscreen-btn" id="epFullscreenBtn">
               <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                 <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
                 <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
               </svg>
             </button>
           </div>`
        : `<div class="ep-player-frame ep-no-stream">
             <span class="empty-icon">映</span><p>Tidak ada server streaming</p>
           </div>`}
    </div>

    ${servers.length > 1 ? `
      <div class="ep-servers">
        <div class="ep-servers-label">Kualitas</div>
        <div class="ep-servers-list">${serverBtns}</div>
      </div>` : ''}

    ${dlHTML ? `
      <button class="dl-trigger-btn" id="dlTriggerBtn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Download
      </button>

      <!-- Download Modal -->
      <div class="dl-modal-overlay" id="dlModalOverlay">
        <div class="dl-modal">
          <div class="dl-modal-header">
            <span class="dl-modal-title">Pilih Kualitas</span>
            <button class="dl-modal-close" id="dlModalClose">✕</button>
          </div>
          <div class="dl-modal-body">${dlHTML}</div>
        </div>
      </div>` : ''}
  `;

  c.querySelectorAll('.sv-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      c.querySelectorAll('.sv-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const f = $('playerFrame');
      if (f) f.src = btn.dataset.url;
    })
  );

  const bar = document.getElementById('epBackInfo');
  if (bar && infoSlug) bar.addEventListener('click', () => loadDetail(infoSlug));

  // Prev/Next buttons
  const prevBtn = document.getElementById('epPrevBtn');
  const nextBtn = document.getElementById('epNextBtn');
  if (prevBtn) prevBtn.addEventListener('click', () => loadEpisode(prevSlug));
  if (nextBtn) nextBtn.addEventListener('click', () => loadEpisode(nextSlug));

  // Fullscreen button
  const fsBtn = document.getElementById('epFullscreenBtn');
  const playerFrame = document.getElementById('epPlayerFrame');
  if (fsBtn && playerFrame) {
    fsBtn.addEventListener('click', () => {
      const isFs = playerFrame.classList.toggle('ep-fullscreen');
      fsBtn.innerHTML = isFs
        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
            <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/>
            <line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/>
           </svg>`
        : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
            <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
            <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
           </svg>`;
      // Sembunyikan/tampilkan elemen lain saat fullscreen
      const container = $('episodeContainer');
      container.querySelectorAll('.ep-info-bar, .ep-nav, .ep-servers, .ep-download, .dl-trigger-btn, #backFromEpisode-wrap').forEach(el => {
        el.style.display = isFs ? 'none' : '';
      });
      document.body.classList.toggle('player-fullscreen', isFs);
    });
  }

  // Download modal
  const dlBtn = document.getElementById('dlTriggerBtn');
  const dlOverlay = document.getElementById('dlModalOverlay');
  const dlClose = document.getElementById('dlModalClose');
  if (dlBtn && dlOverlay) {
    dlBtn.addEventListener('click', () => dlOverlay.classList.add('show'));
    dlClose.addEventListener('click', () => dlOverlay.classList.remove('show'));
    dlOverlay.addEventListener('click', e => {
      if (e.target === dlOverlay) dlOverlay.classList.remove('show');
    });
  }
}

$('backFromEpisode').addEventListener('click', () => {
  // Dari episode → balik ke detail (kalau ada)
  if (state.prevDetailSlug) {
    loadDetail(state.prevDetailSlug);
  } else {
    showPage(state.previousPage || 'home');
  }
});

/* ============================================================
   RENDER HELPERS
============================================================ */

// Cards yang klik → buka detail (slug = detail slug)
function renderDetailCards(grid, items) {
  if (!items || !items.length) { grid.innerHTML = emptyHTML('Tidak ada data tersedia'); return; }
  grid.innerHTML = items.map((item, idx) => {
    const slug = detailSlugFrom(item);
    return cardHTML({ ...item, _mode: 'detail', _slug: slug }, idx);
  }).join('');
  grid.querySelectorAll('.anime-card').forEach(card =>
    card.addEventListener('click', () => {
      if (card.dataset.slug) loadDetail(card.dataset.slug);
    })
  );
}

// Template HTML untuk 1 card
function cardHTML(item, idx) {
  const slug   = item._slug || '';
  const mode   = item._mode || 'detail';
  const title  = item.title || 'Unknown';
  const poster = item.poster || '';
  const status = (item.status || '').toLowerCase();
  const ep     = item.current_episode || item.latest_episode || item.episode || '';

  const badgeClass = status.includes('ongoing')  ? 'badge-ongoing' :
                     status.includes('complet')  ? 'badge-completed' : '';
  const badgeLabel = status.includes('ongoing')  ? 'Ongoing' :
                     status.includes('complet')  ? 'Tamat' : '';

  return `
    <div class="anime-card" data-slug="${esc(slug)}" data-mode="${mode}" style="animation-delay:${idx*0.04}s">
      <div class="card-thumb">
        ${poster
          ? `<img src="${esc(poster)}" alt="${esc(title)}" loading="lazy"
                  onerror="this.parentNode.innerHTML='<div class=\\'card-thumb-placeholder\\'>動</div>'">`
          : `<div class="card-thumb-placeholder">動</div>`}
        ${badgeLabel ? `<span class="card-badge ${badgeClass}">${badgeLabel}</span>` : ''}
        ${ep ? `<span class="card-ep">${esc(ep)}</span>` : ''}
        <div class="card-overlay"><span class="card-overlay-btn">Lihat Detail</span></div>
      </div>
      <div class="card-info">
        <div class="card-title" title="${esc(title)}">${esc(title)}</div>
      </div>
    </div>`;
}

// Latest cards (klik → detail)
function renderLatestCards(grid, items) {
  if (!items || !items.length) { grid.innerHTML = emptyHTML('Tidak ada update terbaru'); return; }
  grid.innerHTML = items.map((item, idx) => {
    const slug  = detailSlugFrom(item);
    const title = item.title || 'Unknown';
    const poster = item.poster || '';
    return `
      <div class="latest-card" data-slug="${esc(slug)}" style="animation-delay:${idx*0.05}s">
        <div class="latest-thumb">
          ${poster
            ? `<img src="${esc(poster)}" alt="${esc(title)}" loading="lazy"
                    onerror="this.parentNode.innerHTML='<div class=\\'card-thumb-placeholder\\' style=\\'font-size:28px\\'>動</div>'">`
            : `<div class="card-thumb-placeholder" style="font-size:28px">動</div>`}
        </div>
        <div class="latest-info">
          <div class="latest-title">${esc(title)}</div>
          <div class="latest-ep">${esc(item.type || 'Donghua')} · ${esc(item.sub || 'Sub')}</div>
          <div class="latest-date">${esc(item.status || '')}</div>
        </div>
      </div>`;
  }).join('');
  grid.querySelectorAll('.latest-card').forEach(card =>
    card.addEventListener('click', () => { if (card.dataset.slug) loadDetail(card.dataset.slug); })
  );
}

/* ============================================================
   PAGINATION
============================================================ */
function renderPagination(containerId, current, total, cb) {
  const c = $(containerId);
  if (!c || total <= 1) { if (c) c.innerHTML = ''; return; }
  let pages = total <= 7
    ? Array.from({ length: total }, (_, i) => i + 1)
    : [1, ...(current > 3 ? ['...'] : []),
       ...Array.from({ length: 3 }, (_, i) => current - 1 + i).filter(p => p > 1 && p < total),
       ...(current < total - 2 ? ['...'] : []), total];
  c.innerHTML = `
    <button class="page-btn" ${current<=1?'disabled':''} data-p="${current-1}">‹ Prev</button>
    ${pages.map(p => p === '...'
      ? `<span style="color:var(--text-dim);padding:0 4px">…</span>`
      : `<button class="page-btn ${p===current?'active':''}" data-p="${p}">${p}</button>`
    ).join('')}
    <button class="page-btn" ${current>=total?'disabled':''} data-p="${current+1}">Next ›</button>`;
  c.querySelectorAll('.page-btn:not([disabled])').forEach(btn =>
    btn.addEventListener('click', () => {
      const p = parseInt(btn.dataset.p);
      if (p && p !== current) { cb(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    })
  );
}

/* ============================================================
   UTILS
============================================================ */
function loadingHTML() {
  return `<div class="loading-state"><div class="loader"></div><p>Memuat data...</p></div>`;
}
function emptyHTML(msg) {
  return `<div class="empty-state" style="grid-column:1/-1"><span class="empty-icon">空</span><p>${msg}</p></div>`;
}
function errorHTML(retryFn) {
  const id = 'r' + Math.random().toString(36).slice(2);
  setTimeout(() => { const b = document.getElementById(id); if (b) b.addEventListener('click', retryFn); }, 50);
  return `<div class="error-state" style="grid-column:1/-1">
    <span class="err-code">!</span><p>Gagal memuat data</p>
    <button class="retry-btn" id="${id}">Coba Lagi</button></div>`;
}
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
// alias
const escHtml = esc;

function showToast(msg, type = '') {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast${type?' '+type:''} show`;
  setTimeout(() => t.classList.remove('show'), 3000);
}

/* ============================================================
   INIT
============================================================ */
showPage('home');

// Bottom nav search button → fokus search input
const bnSearch = document.getElementById('bnSearch');
if (bnSearch) {
  bnSearch.addEventListener('click', e => {
    e.preventDefault();
    const input = $('searchInput');
    if (input) {
      input.focus();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
}

/* ============================================================
   ANIME DETAIL & EPISODE
   API: /anime/:id/:slug → {result:{id,url,judul,cover,sinopsis,genre[],
        studio,score,status,rilis,total_episode,episode_list:[{ep,url}]}}
   Watch: /watch/:id/:slug/:ep → {result:{stream:[{label,file}],download:[]}}
============================================================ */
async function loadAnimeDetail(slug) {
  if (!slug) { showToast('Slug anime kosong', 'error'); return; }
  state.previousPage = state.currentPage !== 'detail' && state.currentPage !== 'episode'
    ? state.currentPage : state.previousPage;

  // Kalau slug adalah episode slug (mengandung -episode-), buka sebagai episode langsung
  if (/-episode-/i.test(slug)) {
    loadAnimeEpisode(slug);
    return;
  }

  state.currentAnimeSlug = slug;
  state.isAnimeMode = true;
  showPage('detail');
  state.initialized['detail'] = true;
  const c = $('detailContainer');
  c.innerHTML = loadingHTML();
  try {
    const data = await fetchAnime(`/detail/${slug}`);
    const d = data.data || {};
    renderAnimeDetail(c, d, slug);
  } catch (err) {
    c.innerHTML = `<div class="error-state"><span class="err-code">!</span>
      <p>Gagal memuat detail anime</p>
      <button class="retry-btn" onclick="loadAnimeDetail('${slug}')">Coba Lagi</button></div>`;
  }
}


async function loadAnimeEpisode(epSlug) {
  state.currentAnimeSlug = epSlug;
  showPage('episode');
  state.initialized['episode'] = true;
  const c = $('episodeContainer');

  c.innerHTML = loadingHTML();
  const timer = null;

  try {
    const data = await fetchAnime(`/episode/${epSlug}`);
    const d = data.data || {};
    const streams   = d.streams   || [];
    const downloads = d.downloads || [];
    const title     = d.title     || '';
    const animeSlug = d.anime_slug || '';
    // Map field server → name, url
    const mappedStreams = streams.map(s => ({ name: s.server || s.label || 'Server', url: s.url || s.file || '' }));
    renderAnimeEpisode(c, { streams: mappedStreams, downloads, title, animeSlug }, epSlug);
  } catch (err) {
    c.innerHTML = `<div class="error-state"><span class="err-code">!</span>
      <p>Gagal memuat episode</p>
      <button class="retry-btn" onclick="loadAnimeEpisode('${epSlug}')">🔄 Coba Lagi</button></div>`;
  }
}

function renderAnimeEpisode(c, d, epSlug) {
  const streams   = d.streams || d.stream || [];
  const downloads = d.downloads || d.download || [];

  // Default ke 720p kalau ada, fallback ke index 0
  const preferIdx = streams.findIndex(s => String(s.quality) === '720');
  const defIdx = preferIdx >= 0 ? preferIdx : 0;
  const firstUrl = streams[defIdx]?.url || streams[defIdx]?.file || '';

  const serverBtns = streams.map((s, i) =>
    `<button class="sv-btn ${i===defIdx?'active':''}" data-url="${esc(s.url||s.file||'')}">${esc(s.quality ? s.quality+'p' : s.label||`Server ${i+1}`)}</button>`
  ).join('');

  const dlHTML = downloads.map(dl => {
    const qGroup = dl.quality_group || dl.quality || dl.label || 'Download';
    const links  = dl.links || (dl.url ? [{provider:'Download', url: dl.url}] : []);
    // Badge warna berdasarkan kualitas
    const isHD  = qGroup.includes('720') || qGroup.includes('1080');
    const isFHD = qGroup.includes('1080');
    const badge = isFHD ? 'FHD' : isHD ? 'HD' : qGroup.includes('480') ? 'SD' : 'Low';
    const color = isFHD ? '#22c55e' : isHD ? '#f59e0b' : qGroup.includes('480') ? '#3b82f6' : '#a855f7';
    // Tandai recommended
    const provBtns = links.map(l =>
      `<a class="dl-prov-btn${l.recommended?' dl-recommended':''}" href="${esc(l.url||l)}" target="_blank" rel="noopener">
        ${esc(l.provider||l.name||'Download')}${l.recommended?' ★':''}
      </a>`
    ).join('');
    return `
      <div class="dl-card">
        <div class="dl-card-left">
          <div class="dl-card-title">${esc(qGroup)}</div>
          <div class="dl-prov-list">${provBtns}</div>
        </div>
        <span class="dl-card-badge" style="background:${color}">${badge}</span>
      </div>`;
  }).join('');

  c.innerHTML = `
    <div class="ep-info-bar" id="epBackInfo" style="cursor:pointer">
      <div class="ep-info-text">
        <div class="ep-info-now">SEDANG MENONTON</div>
        <div class="ep-info-title">${esc(slug.replace(/-/g,' '))}</div>
        <div class="ep-info-ep">Episode ${esc(ep)}</div>
      </div>
      <span class="ep-info-arrow">›</span>
    </div>

    <div class="ep-player-wrap">
      ${firstUrl
        ? `<div class="ep-player-frame" id="epPlayerFrame">
             <iframe id="playerFrame" src="${esc(firstUrl)}" allowfullscreen
               allow="autoplay; fullscreen; picture-in-picture"></iframe>
             <button class="ep-fullscreen-btn" id="epFullscreenBtn">
               <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                 <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
                 <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
               </svg>
             </button>
           </div>`
        : `<div class="ep-player-frame ep-no-stream"><span class="empty-icon">映</span><p>Tidak ada stream</p></div>`}
    </div>

    ${streams.length > 1 ? `
      <div class="ep-servers">
        <div class="ep-servers-label">Server</div>
        <div class="ep-servers-list">${serverBtns}</div>
      </div>` : ''}

    ${dlHTML ? `
      <button class="dl-trigger-btn" id="dlTriggerBtn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Download
      </button>
      <div class="dl-modal-overlay" id="dlModalOverlay">
        <div class="dl-modal">
          <div class="dl-modal-header">
            <span class="dl-modal-title">Pilih Kualitas</span>
            <button class="dl-modal-close" id="dlModalClose">✕</button>
          </div>
          <div class="dl-modal-body">${dlHTML}</div>
        </div>
      </div>` : ''}
  `;

  // Server switch
  c.querySelectorAll('.sv-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      c.querySelectorAll('.sv-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const f = $('playerFrame'); if (f) f.src = btn.dataset.url;
    })
  );

  // Back to detail
  const bar = document.getElementById('epBackInfo');
  if (bar) bar.addEventListener('click', () => loadAnimeDetail(d.animeSlug || state.currentAnimeSlug));

  // Download modal
  const dlBtn = document.getElementById('dlTriggerBtn');
  const dlOverlay = document.getElementById('dlModalOverlay');
  const dlClose = document.getElementById('dlModalClose');
  if (dlBtn && dlOverlay) {
    dlBtn.addEventListener('click', () => dlOverlay.classList.add('show'));
    dlClose?.addEventListener('click', () => dlOverlay.classList.remove('show'));
    dlOverlay.addEventListener('click', e => { if (e.target === dlOverlay) dlOverlay.classList.remove('show'); });
  }

  // Fullscreen landscape (CSS rotate)
  const fsBtn = document.getElementById('epFullscreenBtn');
  const playerFrame = document.getElementById('epPlayerFrame');
  if (fsBtn && playerFrame) {
    fsBtn.addEventListener('click', () => {
      const isFs = playerFrame.classList.toggle('ep-fullscreen');
      document.body.classList.toggle('player-fullscreen', isFs);
      // Update ikon tombol
      fsBtn.innerHTML = isFs
        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
            <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/>
            <line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/>
           </svg>`
        : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
            <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
            <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
           </svg>`;
      // Scroll ke atas saat masuk fullscreen
      if (isFs) window.scrollTo(0, 0);
    });
  }
}
