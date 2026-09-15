// Vista "Descubrimientos": lo que sonó por primera vez en toda tu historia.
//
// Antes esta vista era "Géneros". En febrero de 2026 Spotify eliminó el campo
// `genres` del objeto artista, así que ya no hay de dónde sacarlos: no es algo
// que se pueda configurar ni arreglar desde acá. El bloque sigue en el código
// y aparece solo si algún día el dato vuelve; mientras tanto, lo que manda son
// los descubrimientos, que se calculan con el historial propio.

import { api } from '../api.js';
import { hbars } from '../charts.js';
import { section, empty, alert, kpi, hydrate, art } from '../ui.js';
import { num, pct, esc, fshort } from '../fmt.js';
import { t } from '../i18n.js';

const miniRow = (item, kind, sub) => `
  <button type="button" class="row" data-open="${kind === 'artists' ? 'artist' : 'track'}"
          data-key="${esc(item.key)}" style="grid-template-columns:44px minmax(0,1fr) auto">
    ${art(kind, item.key, `row__art${kind === 'artists' ? ' art--round' : ''}`)}
    <span class="row__body">
      <span class="row__name">${esc(item.name || item.key)}</span>
      <span class="row__meta">${sub}</span>
    </span>
    <span class="row__val">
      <span class="row__big">${num(item.total)}</span>
      <span class="row__small">${t('repr. totales')}</span>
    </span>
  </button>`;

export async function render(params) {
  const [disc, g] = await Promise.all([
    api.discoveries({ ...params, limit: 24 }),
    api.genres(params).catch(() => ({ items: [] })),
  ]);

  const head = `<div class="head">
    <h1 class="head__title">${t('Descubrimientos')}</h1>
    <p class="head__sub">${esc(params.label || '')} · ${
      t('Lo que sonó por primera vez en toda tu historia dentro de este período.')}</p>
  </div>`;

  const body = `
    <div class="kpis">
      ${kpi(t('Artistas nuevos'), num(disc.count_artists), '', t('primera escucha en este período'))}
      ${kpi(t('Canciones nuevas'), num(disc.count_tracks), '', t('nunca antes reproducidas'))}
    </div>

    <div class="cols-2" style="margin-top:var(--s-5)">
      <section>
        <div class="sect__head"><h2 class="sect__title">${t('Artistas que conociste')}</h2></div>
        ${disc.artists.length
          ? `<div class="rank">${disc.artists.map((a) =>
              miniRow(a, 'artists', t('desde {date}', { date: fshort(a.first_ts) }))).join('')}</div>`
          : `<p class="mut">${t('Ningún artista nuevo: todo lo que sonó ya lo conocías.')}</p>`}
      </section>
      <section>
        <div class="sect__head"><h2 class="sect__title">${t('Canciones que estrenaste')}</h2></div>
        ${disc.tracks.length
          ? `<div class="rank">${disc.tracks.map((x) => miniRow(x, 'tracks',
              `${esc(x.artist_name || '')} · ${fshort(x.first_ts)}`)).join('')}</div>`
          : `<p class="mut">${t('Ninguna canción nueva en este período.')}</p>`}
      </section>
    </div>`;

  // Sólo si Spotify repone el campo alguna vez.
  const genreBlock = g.items?.length
    ? section(t('Géneros'), `<div class="card card--pad">
        ${hbars(g.items.map((x, i) => ({
          label: esc(x.genre), value: x.plays,
          text: `${num(x.plays)} · ${pct(x.pct)}`,
          color: i === 0 ? 'var(--accent)' : 'var(--s1)',
        })))}</div>`)
    : section(t('Géneros'), alert('warn',
        `<b>${t('Spotify eliminó los géneros de su API en 2026.')}</b> ${
          t('El campo <code>genres</code> ya no viene en el objeto del artista, '
            + 'así que no hay de dónde sacarlos. No es algo que se pueda configurar.')}`));

  return {
    html: `${head}${body}${genreBlock}`,
    mount(root) {
      hydrate('artists', disc.artists.map((a) => a.key), root);
      hydrate('tracks', disc.tracks.map((x) => x.key), root);
    },
  };
}
