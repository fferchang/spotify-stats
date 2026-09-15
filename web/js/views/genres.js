// Vista "Géneros" + descubrimientos del período.
// Los géneros salen de los metadatos del artista en la Web API, así que
// dependen del enriquecido: si falta, lo decimos claro en vez de mostrar cero.

import { api } from '../api.js';
import { hbars } from '../charts.js';
import { section, empty, alert, kpi, hydrate, art } from '../ui.js';
import { num, dur, pct, esc, fshort } from '../fmt.js';

export async function render(params, _route, boot) {
  const [g, disc] = await Promise.all([
    api.genres(params),
    api.discoveries({ ...params, limit: 24 }).catch(() => null),
  ]);

  const noCreds = !boot?.spotify?.configured;
  const head = `<div class="head">
    <h1 class="head__title">Géneros y descubrimientos</h1>
    <p class="head__sub">${esc(params.label || '')}</p>
  </div>`;

  let genreBlock;
  if (!g.items.length) {
    genreBlock = noCreds
      ? alert('warn', `<b>Falta conectar Spotify.</b> Los géneros no vienen en el
          historial: hay que pedírselos a la Web API artista por artista.
          Cargá tus credenciales en <button type="button" class="sect__link"
          data-go="ajustes" style="display:inline">Ajustes</button> y aparecen solos.`)
      : alert('warn', `<b>Todavía no hay géneros.</b> El enriquecido sigue trayendo
          artistas desde Spotify; volvé en un rato y esta página se llena sola.`);
  } else {
    const top = g.items[0];
    genreBlock = `
      <div class="kpis" style="margin-bottom:var(--s-5)">
        ${kpi('Género nº 1', esc(top.genre), '', `${num(top.plays)} reproducciones`)}
        ${kpi('Géneros distintos', num(g.items.length), '', 'entre los más escuchados')}
        ${kpi('Artistas con género', num(g.known_artists), '', `cubre ${pct(g.coverage)} de tus escuchas`)}
      </div>
      <div class="card card--pad">
        ${hbars(g.items.map((x, i) => ({
          label: esc(x.genre), value: x.plays,
          text: `${num(x.plays)} · ${pct(x.pct)}`,
          color: i === 0 ? 'var(--accent)' : 'var(--s1)',
        })))}
      </div>
      ${g.coverage < 85 ? `<p class="sect__note" style="margin-top:var(--s-3)">
        Calculado sobre el ${pct(g.coverage)} de tus reproducciones: es lo que se
        pudo cruzar con artistas ya traídos de Spotify. El número sube a medida
        que avanza el enriquecido.</p>` : ''}`;
  }

  const discBlock = disc ? section('Descubrimientos', `
    <div class="kpis" style="margin-bottom:var(--s-5)">
      ${kpi('Artistas nuevos', num(disc.count_artists), '', 'primera escucha en este período')}
      ${kpi('Canciones nuevas', num(disc.count_tracks), '', 'nunca antes reproducidas')}
    </div>
    <div class="cols-2">
      <div>
        <div class="sect__note" style="margin-bottom:var(--s-3)">Artistas que conociste</div>
        ${disc.artists.length ? `<div class="rank">${disc.artists.map((a) => `
          <button type="button" class="row" data-open="artist" data-key="${esc(a.key)}"
                  style="grid-template-columns:44px minmax(0,1fr) auto">
            ${art('artists', a.key, 'row__art art--round')}
            <span class="row__body">
              <span class="row__name">${esc(a.name || a.key)}</span>
              <span class="row__meta">desde ${fshort(a.first_ts)}</span>
            </span>
            <span class="row__val"><span class="row__big">${num(a.total)}</span><br>
              <span class="row__small">repr. totales</span></span>
          </button>`).join('')}</div>`
        : '<p class="mut">Ningún artista nuevo: todo lo que sonó ya lo conocías.</p>'}
      </div>
      <div>
        <div class="sect__note" style="margin-bottom:var(--s-3)">Canciones que estrenaste</div>
        ${disc.tracks.length ? `<div class="rank">${disc.tracks.map((t) => `
          <button type="button" class="row" data-open="track" data-key="${esc(t.key)}"
                  style="grid-template-columns:44px minmax(0,1fr) auto">
            ${art('tracks', t.key, 'row__art')}
            <span class="row__body">
              <span class="row__name">${esc(t.name || t.key)}</span>
              <span class="row__meta">${esc(t.artist_name || '')} · ${fshort(t.first_ts)}</span>
            </span>
            <span class="row__val"><span class="row__big">${num(t.total)}</span><br>
              <span class="row__small">repr. totales</span></span>
          </button>`).join('')}</div>`
        : '<p class="mut">Ninguna canción nueva en este período.</p>'}
      </div>
    </div>`, { note: 'primera vez en toda tu historia, no sólo en el período' }) : '';

  return {
    html: `${head}${genreBlock}${discBlock}`,
    mount(root) {
      if (disc) {
        hydrate('artists', disc.artists.map((a) => a.key), root);
        hydrate('tracks', disc.tracks.map((t) => t.key), root);
      }
    },
  };
}
