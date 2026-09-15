// Arranque, router por hash y barra de filtros.

import { api } from './api.js';
import { ICON, closeSheet, empty, loading, toast, alert } from './ui.js';
import { num, esc, fshort } from './fmt.js';
import { openDetail } from './views/detail.js';

import * as overview from './views/overview.js';
import * as lists from './views/lists.js';
import * as patterns from './views/patterns.js';
import * as genres from './views/genres.js';
import * as historyView from './views/history.js';
import * as years from './views/years.js';
import * as settings from './views/settings.js';

const ROUTES = {
  resumen:   { title: 'Resumen',    icon: 'resumen',   mod: overview },
  temas:     { title: 'Canciones',  icon: 'temas',     mod: lists },
  artistas:  { title: 'Artistas',   icon: 'artistas',  mod: lists },
  albumes:   { title: 'Álbumes',    icon: 'albumes',   mod: lists },
  generos:   { title: 'Géneros',    icon: 'generos',   mod: genres },
  habitos:   { title: 'Hábitos',    icon: 'habitos',   mod: patterns },
  podcasts:  { title: 'Podcasts',   icon: 'podcasts',  mod: lists },
  anios:     { title: 'Años',       icon: 'anios',     mod: years },
  historial: { title: 'Historial',  icon: 'historial', mod: historyView },
  ajustes:   { title: 'Ajustes',    icon: 'ajustes',   mod: settings },
};

const PERIODS = [
  ['4w', '4 semanas'], ['3m', '3 meses'], ['6m', '6 meses'],
  ['1y', '1 año'], ['all', 'Todo'],
];

const state = {
  route: 'resumen',
  params: { period: '6m', sort: 'plays', from: '', to: '' },
  boot: null,
  leaveHooks: [],
};

const main = () => document.getElementById('main');

/* ─────────────────────────────  Hash  ───────────────────────────── */
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query] = raw.split('?');
  const route = ROUTES[path] ? path : 'resumen';
  const q = new URLSearchParams(query || '');
  return {
    route,
    params: {
      period: q.get('period') || state.params.period,
      sort: q.get('sort') || state.params.sort,
      from: q.get('from') || '',
      to: q.get('to') || '',
    },
  };
}

function writeHash(route = state.route, params = state.params) {
  const q = new URLSearchParams();
  if (params.from && params.to) {
    q.set('from', params.from);
    q.set('to', params.to);
  } else if (params.period) {
    q.set('period', params.period);
  }
  if (params.sort !== 'plays') q.set('sort', params.sort);
  const next = `#/${route}${q.toString() ? `?${q}` : ''}`;
  if (location.hash !== next) {
    history.pushState(null, '', next);
  }
}

/* ─────────────────────────────  Navegación  ───────────────────────────── */
function buildNav() {
  document.getElementById('navList').innerHTML = Object.entries(ROUTES).map(([key, r]) => {
    if (key === 'podcasts' && !state.boot?.totals?.episodes) return '';
    return `<li><a class="nav__link" href="#/${key}" data-route="${key}"
      title="${r.title}">${ICON[r.icon]}<span>${r.title}</span></a></li>`;
  }).join('');
}

function markNav() {
  document.querySelectorAll('.nav__link').forEach((a) => {
    if (a.dataset.route === state.route) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

/* ─────────────────────────────  Filtros  ───────────────────────────── */
function buildFilters() {
  const yearChips = (state.boot?.years || []).slice(0, 8).map((y) => [y, y]);
  const all = [...PERIODS.slice(0, 4), ...yearChips, PERIODS[4]];
  document.getElementById('periodChips').innerHTML = all.map(([v, label]) =>
    `<button type="button" class="chip" data-period="${v}"
      aria-pressed="false">${label}</button>`).join('');
  syncFilters();
}

function syncFilters() {
  const custom = !!(state.params.from && state.params.to);
  document.querySelectorAll('[data-period]').forEach((c) => {
    c.setAttribute('aria-pressed', String(!custom && c.dataset.period === state.params.period));
  });
  document.querySelectorAll('[data-sort]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.sort === state.params.sort));
  });
  document.getElementById('dateFrom').value = state.params.from || '';
  document.getElementById('dateTo').value = state.params.to || '';

  const hint = document.getElementById('rangeHint');
  const b = state.boot;
  hint.textContent = b?.first_ts
    ? `Tu historial va del ${fshort(b.first_ts)} al ${fshort(b.last_ts)}.`
    : '';

  // La barra de filtros no aporta nada en Ajustes.
  document.getElementById('filters').hidden = state.route === 'ajustes';
}

/* ─────────────────────────────  Render  ───────────────────────────── */
let renderToken = 0;

async function renderView() {
  const token = ++renderToken;
  state.leaveHooks.forEach((fn) => { try { fn(); } catch { /* ignorar */ } });
  state.leaveHooks = [];

  markNav();
  syncFilters();

  const route = ROUTES[state.route];
  if (!state.boot?.has_data && state.route !== 'ajustes') {
    main().innerHTML = welcome();
    main().querySelector('[data-go]')?.focus();
    return;
  }

  main().innerHTML = loading();

  const ctx = {
    rerender: () => renderView(),
    reload: () => boot().then(() => renderView()),
    onLeave: (fn) => state.leaveHooks.push(fn),
  };

  try {
    const params = { ...state.params, label: rangeLabel() };
    const view = await route.mod.render(params, state.route, state.boot);
    if (token !== renderToken) return;   // llegó tarde: ya cambió la vista
    main().innerHTML = view.html;
    view.mount?.(main(), ctx);
    window.scrollTo(0, 0);
  } catch (err) {
    if (err.name === 'AbortError' || token !== renderToken) return;
    main().innerHTML = `<div class="head"><h1 class="head__title">${route.title}</h1></div>
      ${alert('bad', `<b>Algo salió mal.</b> ${esc(err.message)}`)}
      <div style="margin-top:var(--s-4)">
        <button type="button" class="btn btn--primary" id="retry">Reintentar</button></div>`;
    main().querySelector('#retry')?.addEventListener('click', () => renderView());
  }
}

const rangeLabel = () => {
  if (state.params.from && state.params.to) return `${state.params.from} → ${state.params.to}`;
  return (PERIODS.find((p) => p[0] === state.params.period) || [null, state.params.period])[1];
};

const welcome = () => `
  <div class="head">
    <h1 class="head__title">Bienvenido a Vinilo</h1>
    <p class="head__sub">Tus estadísticas de Spotify, calculadas acá adentro.</p>
  </div>
  ${empty('Todavía no hay historial',
    'Pedile a Spotify tu «Historial de reproducción ampliado» desde Cuenta → Privacidad. ' +
    'Cuando llegue el mail con el .zip, importalo y en segundos tenés todo: ' +
    'tus artistas y canciones más escuchadas, a qué hora escuchás, cómo cambió tu gusto año a año.',
    '<button type="button" class="btn btn--primary" data-go="ajustes">Importar mi historial</button>')}`;

/* ─────────────────────────────  Widget de enriquecido  ───────────────────────────── */
let enrichTimer = null;

async function watchEnrich() {
  const box = document.getElementById('enrichWidget');
  try {
    const st = await api.enrichStatus();
    const c = st.counts || {};
    const done = (c.tracks_done || 0) + (c.artists_done || 0);
    const total = (c.tracks_total || 0) + (c.artists_total || 0);
    if (!st.running || !total) {
      box.hidden = true;
      if (!st.running) { clearInterval(enrichTimer); enrichTimer = null; }
      return;
    }
    box.hidden = false;
    const label = { tracks: 'canciones', artists: 'artistas', podcasts: 'podcasts' }[st.phase] || 'datos';
    box.innerHTML = `<strong>Trayendo ${label}…</strong>
      ${num(done)} de ${num(total)}${st.eta_s ? ` · ~${Math.ceil(st.eta_s / 60)} min` : ''}
      <div class="bar"><i style="width:${(done / total) * 100}%"></i></div>`;
  } catch {
    box.hidden = true;
  }
}

function pollEnrich() {
  if (enrichTimer) return;
  watchEnrich();
  enrichTimer = setInterval(watchEnrich, 2500);
}

/* ─────────────────────────────  Arranque  ───────────────────────────── */
async function boot() {
  try {
    state.boot = await api.bootstrap();
  } catch (err) {
    main().innerHTML = alert('bad',
      `<b>No pude hablar con el servidor local.</b> ${esc(err.message)}`);
    return false;
  }
  buildNav();
  buildFilters();
  if (state.boot.spotify.configured) pollEnrich();
  return true;
}

function wire() {
  // Período
  document.getElementById('periodChips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-period]');
    if (!chip) return;
    state.params.period = chip.dataset.period;
    state.params.from = state.params.to = '';
    writeHash();
    renderView();
  });

  // Orden
  document.querySelectorAll('[data-sort]').forEach((b) => b.addEventListener('click', () => {
    state.params.sort = b.dataset.sort;
    writeHash();
    api.saveConfig({ sort: b.dataset.sort }).catch(() => {});
    renderView();
  }));

  // Rango personalizado
  const dr = document.getElementById('daterange');
  const customBtn = document.getElementById('customBtn');
  customBtn.addEventListener('click', () => {
    dr.hidden = !dr.hidden;
    customBtn.setAttribute('aria-expanded', String(!dr.hidden));
  });
  document.getElementById('applyRange').addEventListener('click', () => {
    const from = document.getElementById('dateFrom').value;
    const to = document.getElementById('dateTo').value;
    if (!from || !to) return toast('Elegí las dos fechas.', 'bad');
    if (from > to) return toast('La fecha “desde” tiene que ser anterior.', 'bad');
    state.params.from = from;
    state.params.to = to;
    writeHash();
    renderView();
  });
  document.getElementById('clearRange').addEventListener('click', () => {
    state.params.from = state.params.to = '';
    writeHash();
    renderView();
  });

  // Delegación: abrir ficha / navegar
  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (go) {
      e.preventDefault();
      location.hash = `#/${go.dataset.go}`;
      return;
    }
    const open = e.target.closest('[data-open]');
    if (open && open.dataset.key) {
      e.preventDefault();
      openDetail(open.dataset.open, open.dataset.key,
        { ...state.params, label: rangeLabel() });
    }
  });

  // Panel lateral
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-close-sheet]')) closeSheet();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('sheet').hidden) closeSheet();
  });

  window.addEventListener('hashchange', () => {
    const { route, params } = parseHash();
    const changed = route !== state.route
      || JSON.stringify(params) !== JSON.stringify(state.params);
    state.route = route;
    state.params = params;
    if (changed) renderView();
  });
}

(async function start() {
  const parsed = parseHash();
  state.route = parsed.route;
  state.params = parsed.params;

  wire();
  if (!(await boot())) return;

  // Preferencia de orden guardada en el servidor, si no vino en la URL.
  if (!new URLSearchParams(location.hash.split('?')[1] || '').get('sort')) {
    state.params.sort = state.boot.config.sort || 'plays';
  }
  if (!location.hash) writeHash();
  renderView();

  // Si hay credenciales pero falta metadata, el worker arranca solo.
  if (state.boot.spotify.configured && !state.boot.enrich.running) {
    api.enrichStart(true).then(pollEnrich).catch(() => {});
  }
})();
