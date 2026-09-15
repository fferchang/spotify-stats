// Vista "Años": una fila por año, para ver de un vistazo cómo cambió tu gusto.

import { api } from '../api.js';
import { sparkline } from '../charts.js';
import { art, hydrate, empty } from '../ui.js';
import { num, num1, dur, esc } from '../fmt.js';

export async function render() {
  const { years } = await api.years();
  if (!years.length) {
    return {
      html: `<div class="head"><h1 class="head__title">Años</h1></div>
        ${empty('Sin datos', 'Importá tu historial para ver el recorrido año por año.')}`,
      mount() {},
    };
  }

  const maxMs = Math.max(...years.map((y) => y.ms));
  const rows = [...years].reverse();

  const html = `
  <div class="head">
    <h1 class="head__title">Años</h1>
    <p class="head__sub">${years[0].year}–${years[years.length - 1].year} ·
      ${num(years.reduce((a, y) => a + y.plays, 0))} reproducciones en total</p>
  </div>

  <div class="stack">
    ${rows.map((y) => `
    <article class="card" style="display:grid;grid-template-columns:minmax(0,1fr) auto;
             gap:var(--s-4);align-items:center">
      <div style="min-width:0">
        <div class="inline" style="gap:var(--s-3);align-items:baseline">
          <span style="font-size:30px;font-weight:680;letter-spacing:-.03em">${y.year}</span>
          <span class="mut">${dur(y.ms)} · ${num(y.plays)} reproducciones</span>
        </div>
        <div class="bar" style="margin:var(--s-3) 0"><i style="width:${(y.ms / maxMs) * 100}%"></i></div>
        <div class="inline" style="gap:var(--s-5)">
          <span class="mut" style="font-size:12.5px">${num(y.artists)} artistas</span>
          <span class="mut" style="font-size:12.5px">${num(y.tracks)} canciones</span>
          <span class="mut" style="font-size:12.5px">${num1(y.ms / 3600000 / 365)} h por día</span>
        </div>
      </div>

      <div style="display:flex;gap:var(--s-4)">
        ${y.top_artist ? `<button type="button" class="tile" data-open="artist"
            data-key="${esc(y.top_artist.key)}" style="width:96px">
          ${art('artists', y.top_artist.key, 'art--round')}
          <span>
            <span class="tile__name">${esc(y.top_artist.name)}</span>
            <span class="tile__meta">artista del año</span>
          </span>
        </button>` : ''}
        ${y.top_track ? `<button type="button" class="tile" data-open="track"
            data-key="${esc(y.top_track.key)}" style="width:96px">
          ${art('tracks', y.top_track.key)}
          <span>
            <span class="tile__name">${esc(y.top_track.name)}</span>
            <span class="tile__meta">canción del año</span>
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
