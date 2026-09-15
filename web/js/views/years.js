// Vista "Años": una fila por año, para ver de un vistazo cómo cambió tu gusto.

import { api } from '../api.js';
import { sparkline } from '../charts.js';
import { art, hydrate, empty } from '../ui.js';
import { num, num1, dur, esc } from '../fmt.js';
import { t } from '../i18n.js';

export async function render() {
  const { years } = await api.years();
  if (!years.length) {
    return {
      html: `<div class="head"><h1 class="head__title">${t('Años')}</h1></div>
        ${empty(t('Sin datos'), t('Importá tu historial para ver el recorrido año por año.'))}`,
      mount() {},
    };
  }

  const maxMs = Math.max(...years.map((y) => y.ms));
  const rows = [...years].reverse();

  const html = `
  <div class="head">
    <h1 class="head__title">${t('Años')}</h1>
    <p class="head__sub">${t('{a}–{b} · {n} reproducciones en total', {
      a: years[0].year, b: years[years.length - 1].year,
      n: num(years.reduce((acc, y) => acc + y.plays, 0)) })}</p>
  </div>

  <div class="stack">
    ${rows.map((y) => `
    <article class="card" style="display:grid;grid-template-columns:minmax(0,1fr) auto;
             gap:var(--s-4);align-items:center">
      <div style="min-width:0">
        <div class="inline" style="gap:var(--s-3);align-items:baseline">
          <span style="font-size:30px;font-weight:680;letter-spacing:-.03em">${y.year}</span>
          <span class="mut">${dur(y.ms)} · ${t('{n} reproducciones', { n: num(y.plays) })}</span>
        </div>
        <div class="bar" style="margin:var(--s-3) 0"><i style="width:${(y.ms / maxMs) * 100}%"></i></div>
        <div class="inline" style="gap:var(--s-5)">
          <span class="mut" style="font-size:12.5px">${t('{n} artistas', { n: num(y.artists) })}</span>
          <span class="mut" style="font-size:12.5px">${t('{n} canciones', { n: num(y.tracks) })}</span>
          <span class="mut" style="font-size:12.5px">${t('{n} h por día', { n: num1(y.ms / 3600000 / 365) })}</span>
        </div>
      </div>

      <div style="display:flex;gap:var(--s-4)">
        ${y.top_artist ? `<button type="button" class="tile" data-open="artist"
            data-key="${esc(y.top_artist.key)}" style="width:96px">
          ${art('artists', y.top_artist.key, 'art--round')}
          <span>
            <span class="tile__name">${esc(y.top_artist.name)}</span>
            <span class="tile__meta">${t('artista del año')}</span>
          </span>
        </button>` : ''}
        ${y.top_track ? `<button type="button" class="tile" data-open="track"
            data-key="${esc(y.top_track.key)}" style="width:96px">
          ${art('tracks', y.top_track.key)}
          <span>
            <span class="tile__name">${esc(y.top_track.name)}</span>
            <span class="tile__meta">${t('canción del año')}</span>
          </span>
        </button>` : ''}
      </div>
    </article>`).join('')}
  </div>`;

  return {
    html,
    mount(root) {
      hydrate('artists', rows.map((y) => y.top_artist?.key).filter(Boolean), root);
      hydrate('tracks', rows.map((y) => y.top_track?.key).filter(Boolean), root);
    },
  };
}
