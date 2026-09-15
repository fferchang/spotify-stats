// Componentes compartidos: carátulas con carga diferida, filas, mosaicos,
// avisos y el panel lateral de detalle.

import { api } from './api.js';
import { num, dur, pct, esc, fshort } from './fmt.js';
import { t } from './i18n.js';

/* ─────────────────────────────  Iconos  ───────────────────────────── */
const P = (d, extra = '') =>
  `<svg class="ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}${extra}</svg>`;

export const ICON = {
  resumen: P('<circle cx="10" cy="10" r="7.2"/><circle cx="10" cy="10" r="2"/>'),
  temas: P('<path d="M7 14.5V4.8l8-1.6v9.4"/><circle cx="5.4" cy="14.8" r="1.9"/><circle cx="13.4" cy="12.9" r="1.9"/>'),
  artistas: P('<path d="M10 2.8a2.4 2.4 0 0 1 2.4 2.4v3.6a2.4 2.4 0 1 1-4.8 0V5.2A2.4 2.4 0 0 1 10 2.8z"/><path d="M5.2 9.2a4.8 4.8 0 0 0 9.6 0M10 13.9v3.3"/>'),
  albumes: P('<rect x="2.8" y="2.8" width="14.4" height="14.4" rx="2.4"/><circle cx="10" cy="10" r="3.2"/><circle cx="10" cy="10" r=".6" fill="currentColor"/>'),
  generos: P('<path d="M3.2 8.4V4a.8.8 0 0 1 .8-.8h4.4L17 11.8a1.2 1.2 0 0 1 0 1.7l-3.5 3.5a1.2 1.2 0 0 1-1.7 0L3.2 8.4z"/><circle cx="6.4" cy="6.4" r="1" fill="currentColor" stroke="none"/>'),
  habitos: P('<circle cx="10" cy="10" r="7.2"/><path d="M10 5.8V10l2.8 1.8"/>'),
  podcasts: P('<rect x="8" y="2.6" width="4" height="8" rx="2"/><path d="M5.6 9.2a4.4 4.4 0 0 0 8.8 0M10 13.6v3.8"/>'),
  historial: P('<path d="M3.4 5.6h13M3.4 10h13M3.4 14.4h8.4"/>'),
  anios: P('<rect x="3" y="4.2" width="14" height="12.6" rx="2"/><path d="M6.8 2.6v3.2M13.2 2.6v3.2M3 8.4h14"/>'),
  ajustes: P('<circle cx="10" cy="10" r="2.6"/><path d="M15.8 12.2a1.3 1.3 0 0 0 .26 1.44l.05.05a1.6 1.6 0 1 1-2.26 2.26l-.05-.05a1.3 1.3 0 0 0-1.44-.26 1.3 1.3 0 0 0-.79 1.19v.14a1.6 1.6 0 0 1-3.2 0v-.07a1.3 1.3 0 0 0-.85-1.19 1.3 1.3 0 0 0-1.44.26l-.05.05a1.6 1.6 0 1 1-2.26-2.26l.05-.05a1.3 1.3 0 0 0 .26-1.44 1.3 1.3 0 0 0-1.19-.79h-.14a1.6 1.6 0 0 1 0-3.2h.07a1.3 1.3 0 0 0 1.19-.85 1.3 1.3 0 0 0-.26-1.44l-.05-.05A1.6 1.6 0 1 1 5.97 3.9l.05.05a1.3 1.3 0 0 0 1.44.26h.06a1.3 1.3 0 0 0 .79-1.19v-.14a1.6 1.6 0 0 1 3.2 0v.07a1.3 1.3 0 0 0 .79 1.19 1.3 1.3 0 0 0 1.44-.26l.05-.05a1.6 1.6 0 1 1 2.26 2.26l-.05.05a1.3 1.3 0 0 0-.26 1.44v.06a1.3 1.3 0 0 0 1.19.79h.14a1.6 1.6 0 0 1 0 3.2h-.07a1.3 1.3 0 0 0-1.19.79z"/>'),
  disco: P('<circle cx="10" cy="10" r="7.2"/><circle cx="10" cy="10" r="2.4"/>'),
  fuego: P('<path d="M10 17.4c2.9 0 5-2 5-4.6 0-3.4-3.4-4.2-2.6-8.2-2 .6-4.1 2.8-4.1 5 0 1-.5 1.6-1.1 1.6-.7 0-1.2-.6-1.2-1.6C4.9 10.3 5 11.5 5 12.8c0 2.6 2.1 4.6 5 4.6z"/>'),
  reloj: P('<circle cx="10" cy="10" r="7.2"/><path d="M10 5.8V10l2.8 1.8"/>'),
  luna: P('<path d="M16 11.4A6.6 6.6 0 0 1 8.6 4a6.8 6.8 0 1 0 7.4 7.4z"/>'),
  calendario: P('<rect x="3" y="4.2" width="14" height="12.6" rx="2"/><path d="M6.8 2.6v3.2M13.2 2.6v3.2M3 8.4h14"/>'),
  aviso: P('<circle cx="10" cy="10" r="7.4"/><path d="M10 6.4v4.2M10 13.4h.01"/>'),
};

const ART_PH = {
  tracks: '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M7.4 14.2V5.3l7.2-1.5v8.6a2 2 0 1 1-1.3-1.9V5.4L8.7 6.4v7.3a2 2 0 1 1-1.3-1.9z"/></svg>',
  artists: '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><circle cx="10" cy="7" r="3.4"/><path d="M3.6 17.4a6.4 6.4 0 0 1 12.8 0z"/></svg>',
  albums: '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10 2.4a7.6 7.6 0 1 0 0 15.2 7.6 7.6 0 0 0 0-15.2zm0 5.6a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/></svg>',
  shows: '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><rect x="8" y="2.4" width="4" height="8.4" rx="2"/><path d="M5.2 9.4a.9.9 0 0 1 1.8 0 3 3 0 0 0 6 0 .9.9 0 1 1 1.8 0 4.8 4.8 0 0 1-3.9 4.7v3a.9.9 0 1 1-1.8 0v-3a4.8 4.8 0 0 1-3.9-4.7z"/></svg>',
};

/* ─────────────────────────────  Carátulas  ───────────────────────────── */
export function art(kind, key, cls = '') {
  return `<span class="art ${cls}" data-art="${esc(kind)}" data-key="${esc(key || '')}">
    <span class="art__ph">${ART_PH[kind] || ART_PH.tracks}</span></span>`;
}

const metaCache = new Map();  // "kind:key" -> objeto de metadatos

/** Pinta las carátulas de lo que hay en pantalla y reintenta mientras el
 *  worker sigue trayendo cosas. */
export async function hydrate(kind, keys, root = document, depth = 0) {
  const uniq = [...new Set(keys.filter(Boolean))];
  if (!uniq.length) return;

  const need = uniq.filter((k) => !metaCache.has(`${kind}:${k}`));
  let pending = 0;
  if (need.length) {
    try {
      const res = await api.meta(kind, need);
      for (const k of need) metaCache.set(`${kind}:${k}`, res.items[k] || null);
      pending = res.pending || 0;
    } catch { return; }
  }

  for (const k of uniq) {
    const info = metaCache.get(`${kind}:${k}`);
    const url = info?.img_sm || info?.img;
    if (!url) continue;
    root.querySelectorAll(
      `.art[data-art="${CSS.escape(kind)}"][data-key="${CSS.escape(k)}"]:not(.is-done)`
    ).forEach((slot) => {
      slot.classList.add('is-done');
      const img = new Image();
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.src = url;
      img.addEventListener('load', () => {
        img.classList.add('is-ready');
        slot.querySelector('.art__ph')?.remove();
      });
      img.addEventListener('error', () => img.remove());
      slot.appendChild(img);
    });
  }

  // El worker va llenando de a poco: volvemos a preguntar unas cuantas veces.
  if (pending && depth < 12) {
    const missing = uniq.filter((k) => !metaCache.get(`${kind}:${k}`));
    if (missing.length) {
      missing.forEach((k) => metaCache.delete(`${kind}:${k}`));
      setTimeout(() => hydrate(kind, missing, root, depth + 1), 2200 + depth * 400);
    }
  }
}

export const metaOf = (kind, key) => metaCache.get(`${kind}:${key}`) || null;

/* ─────────────────────────────  Filas y mosaicos  ───────────────────────────── */
export function row(item, kind, sort, opts = {}) {
  const primary = sort === 'ms' ? dur(item.ms) : `${num(item.plays)} ${t('repr.')}`;
  const secondary = sort === 'ms' ? `${num(item.plays)} ${t('repr.')}` : dur(item.ms);
  const sub = item.artist_name
    ? t('{artist} · {pct} de tus escuchas',
        { artist: esc(item.artist_name), pct: pct(item.pct_plays) })
    : t('{n} días distintos · {pct} de tus escuchas',
        { n: num(item.days), pct: pct(item.pct_plays) });
  const barPct = opts.maxValue ? Math.max(1.5, ((sort === 'ms' ? item.ms : item.plays) / opts.maxValue) * 100) : 0;

  return `<button type="button" class="row" data-open="${esc(opts.detailKind || kind)}" data-key="${esc(item.key)}">
    <span class="row__n">${item.rank}</span>
    ${art(kind, item.key, `row__art${kind === 'artists' ? ' art--round' : ''}`)}
    <span class="row__body">
      <span class="row__name">${esc(item.name)}</span>
      <span class="row__meta">${sub}</span>
      ${opts.maxValue ? `<span class="row__bar"><i style="width:${barPct}%"></i></span>` : ''}
    </span>
    <span class="row__val">
      <span class="row__big">${primary}</span>
      <span class="row__small">${secondary}</span>
    </span>
  </button>`;
}

export function rankList(items, kind, sort, opts = {}) {
  if (!items.length) return empty(t('Nada por acá'), t('No hay reproducciones en este período.'));
  // Sin barra de proporción: en un top plano todas salen casi llenas y se leen
  // como un subrayado decorativo en vez de como un dato. Mandan los números.
  const maxValue = opts.bars ? Math.max(...items.map((i) => (sort === 'ms' ? i.ms : i.plays))) : 0;
  return `<div class="rank">${items.map((i) => row(i, kind, sort, { ...opts, maxValue })).join('')}</div>`;
}

export function tile(item, kind, sort) {
  const value = sort === 'ms' ? dur(item.ms) : `${num(item.plays)} ${t('repr.')}`;
  return `<button type="button" class="tile" data-open="${kind.replace(/s$/, '')}" data-key="${esc(item.key)}">
    <span style="position:relative;display:block">
      <span class="tile__rank">${item.rank}</span>
      ${art(kind, item.key, kind === 'artists' ? 'art--round' : '')}
    </span>
    <span>
      <span class="tile__name" title="${esc(item.name)}">${esc(item.name)}</span>
      <span class="tile__meta">${value}${item.artist_name ? ` · ${esc(item.artist_name)}` : ''}</span>
    </span>
  </button>`;
}

export const tileGrid = (items, kind, sort) =>
  (items.length
    ? `<div class="grid">${items.map((i) => tile(i, kind, sort)).join('')}</div>`
    : empty(t('Nada por acá'), t('No hay reproducciones en este período.')));

/* ─────────────────────────────  Bloques varios  ───────────────────────────── */
export const kpi = (label, value, unit, foot) => `<div class="kpi">
  <div class="kpi__label">${label}</div>
  <div class="kpi__value num">${value}${unit ? `<small>${unit}</small>` : ''}</div>
  ${foot ? `<div class="kpi__foot">${foot}</div>` : ''}
</div>`;

export const section = (title, body, opts = {}) => `<section class="sect">
  <div class="sect__head">
    <h2 class="sect__title">${title}</h2>
    ${opts.note ? `<span class="sect__note">${opts.note}</span>` : ''}
    ${opts.link ? `<button type="button" class="sect__link" data-go="${opts.link.to}">${opts.link.text} →</button>` : ''}
  </div>
  ${body}
</section>`;

export const empty = (title, text, action = '') => `<div class="empty">
  <div class="empty__title">${title}</div><p>${text}</p>${action}</div>`;

export const alert = (kind, html) =>
  `<div class="alert alert--${kind}">${ICON.aviso}<div>${html}</div></div>`;

export const loading = (label = t('Calculando…')) =>
  `<div class="stack" aria-busy="true" aria-label="${label}">
    <div class="skel" style="height:112px"></div>
    <div class="cols-3">${'<div class="skel" style="height:84px"></div>'.repeat(3)}</div>
    <div class="skel" style="height:190px"></div>
  </div>`;

/* ─────────────────────────────  Avisos  ───────────────────────────── */
export function toast(msg, kind = '') {
  const box = document.getElementById('toasts');
  const t = document.createElement('div');
  t.className = `toast${kind ? ` toast--${kind}` : ''}`;
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => {
    t.style.transition = 'opacity 180ms, transform 180ms';
    t.style.opacity = '0';
    t.style.transform = 'translateY(6px)';
    setTimeout(() => t.remove(), 200);
  }, kind === 'bad' ? 6500 : 3600);
}

/* ─────────────────────────────  Panel lateral  ───────────────────────────── */
const sheet = () => document.getElementById('sheet');

export function openSheet(html) {
  const s = sheet();
  document.getElementById('sheetBody').innerHTML = html;
  s.hidden = false;
  document.body.style.overflow = 'hidden';
  s.querySelector('.sheet__close')?.focus();
}

export function closeSheet() {
  sheet().hidden = true;
  document.body.style.overflow = '';
}

export const sheetBody = () => document.getElementById('sheetBody');

export function statLine(stats) {
  return `<div class="statline">${stats.map(([v, l]) =>
    `<div><div class="statline__v">${v}</div><div class="statline__l">${l}</div></div>`).join('')}</div>`;
}

export const firstLast = (a, b) =>
  `<span class="mut">${fshort(a)} → ${fshort(b)}</span>`;
