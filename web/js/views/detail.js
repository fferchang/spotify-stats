// Contenido del panel lateral: la ficha de un artista, canción, álbum o podcast.

import { api } from '../api.js';
import { areaChart, barsChart } from '../charts.js';
import { art, hydrate, metaOf, openSheet, sheetBody, statLine, toast } from '../ui.js';
import {
  num, num1, dur, durLong, clock, pct, esc, fdate, fshort, ago, hourLabel,
} from '../fmt.js';

const KIND_META = {
  artist: { label: 'Artista', artKind: 'artists', round: true },
  track:  { label: 'Canción', artKind: 'tracks',  round: false },
  album:  { label: 'Álbum',   artKind: 'albums',  round: false },
  show:   { label: 'Podcast', artKind: 'shows',   round: false },
};

const miniList = (items, kind, total) => {
  if (!items?.length) return '';
  const max = Math.max(...items.map((i) => i.plays), 1);
  return `<div class="rank">${items.map((i, n) => `
    <button type="button" class="row" data-open="${kind}" data-key="${esc(i.key)}"
            style="grid-template-columns:24px 36px minmax(0,1fr) auto">
      <span class="row__n">${n + 1}</span>
      ${art(kind === 'artist' ? 'artists' : kind === 'album' ? 'albums' : 'tracks', i.key,
        `row__art${kind === 'artist' ? ' art--round' : ''}`)}
      <span class="row__body">
        <span class="row__name">${esc(i.name || '(sin título)')}</span>
        <span class="row__bar"><i style="width:${Math.max(2, (i.plays / max) * 100)}%"></i></span>
      </span>
      <span class="row__val">
        <span class="row__big">${num(i.plays)}</span><br>
        <span class="row__small">${dur(i.ms)}</span>
      </span>
    </button>`).join('')}</div>`;
};

export async function openDetail(kind, key, params) {
  if (!key) return;
  const km = KIND_META[kind];
  if (!km) return;

  openSheet(`<div class="stack" aria-busy="true">
    <div class="skel" style="height:120px"></div>
    <div class="skel" style="height:72px"></div>
    <div class="skel" style="height:160px"></div>
  </div>`);

  let d;
  try {
    d = await api.detail({ ...params, kind, key });
  } catch (e) {
    sheetBody().innerHTML = `<div class="empty"><div class="empty__title">No pude cargar la ficha</div>
      <p>${esc(e.message)}</p></div>`;
    return;
  }

  const meta = metaOf(km.artKind, key) || {};
  const genres = (meta.genres || []).slice(0, 6);
  const inRange = d.plays > 0;

  const sub = {
    artist: genres.length ? genres.map((g) => esc(g)).join(' · ') : 'Artista',
    track: [d.artist_name, d.album_name].filter(Boolean).map(esc).join(' · '),
    album: esc(d.artist_name || ''),
    show: 'Podcast',
  }[kind];

  const extras = [];
  if (kind === 'track') {
    if (meta.duration_ms) extras.push(`Dura ${clock(meta.duration_ms)}`);
    if (meta.release_date) extras.push(`Salió en ${meta.release_date.slice(0, 4)}`);
    if (meta.popularity != null) extras.push(`Popularidad ${meta.popularity}/100`);
  }
  if (kind === 'artist' && meta.followers) {
    extras.push(`${num(meta.followers)} seguidores en Spotify`);
  }

  const peak = d.hours.indexOf(Math.max(...d.hours));

  sheetBody().innerHTML = `
  <div class="sheet__hero">
    <span class="sheet__art" style="display:block">
      ${art(km.artKind, key, km.round ? 'art--round' : '')}
    </span>
    <div style="min-width:0">
      <div class="sheet__kicker">${km.label}${inRange ? ` · nº ${d.rank} del período` : ''}</div>
      <h2 class="sheet__name" id="sheetTitle">${esc(d.name || key)}</h2>
      ${sub ? `<div class="sheet__sub">${sub}</div>` : ''}
    </div>
  </div>

  ${inRange ? statLine([
    [num(d.plays), 'reproducciones'],
    [dur(d.ms), 'escuchado'],
    [num(d.days), d.days === 1 ? 'día' : 'días'],
    [pct(d.pct_of_total), 'de tu período'],
  ]) : `<div class="alert alert--warn">Sin reproducciones en el período elegido.
        Abajo va el total histórico.</div>`}

  <div class="stack" style="margin-top:var(--s-4)">
    ${extras.length ? `<p class="mut" style="font-size:12.5px">${extras.join(' · ')}</p>` : ''}

    <div class="card" style="padding:var(--s-3) var(--s-4)">
      <div class="sect__note">Historia completa</div>
      <div class="inline" style="margin-top:6px;gap:var(--s-5)">
        <span><b>${num(d.ever_plays)}</b> <span class="mut">reproducciones</span></span>
        <span><b>${dur(d.ever_ms)}</b> <span class="mut">en total</span></span>
      </div>
      <p class="mut" style="font-size:12.5px;margin-top:6px">
        Primera vez el ${fdate(d.ever_first_ts)} · última ${ago(d.ever_last_ts)}
      </p>
    </div>

    ${d.series?.length > 1 ? `<div class="card card--pad">
      <div class="sect__note" style="margin-bottom:var(--s-3)">Cómo se repartió en el período</div>
      <div class="chartbox" id="dSeries"></div>
    </div>` : ''}

    ${inRange ? `<div class="card card--pad">
      <div class="sect__note" style="margin-bottom:var(--s-3)">
        A qué hora lo escuchás · pico a las ${hourLabel(peak)}
      </div>
      <div class="chartbox" id="dHours"></div>
    </div>` : ''}

    ${kind === 'artist' && d.top_tracks?.length ? `<div>
      <div class="sect__head"><h3 class="sect__title">Sus canciones</h3></div>
      ${miniList(d.top_tracks, 'track')}</div>` : ''}

    ${kind === 'artist' && d.top_albums?.length ? `<div>
      <div class="sect__head"><h3 class="sect__title">Sus álbumes</h3></div>
      ${miniList(d.top_albums, 'album')}</div>` : ''}

    ${kind === 'album' && d.tracks?.length ? `<div>
      <div class="sect__head"><h3 class="sect__title">Canciones del álbum</h3></div>
      ${miniList(d.tracks, 'track')}</div>` : ''}

    ${kind === 'show' && d.episodes?.length ? `<div>
      <div class="sect__head"><h3 class="sect__title">Episodios</h3></div>
      <div class="rank">${d.episodes.map((e, i) => `<div class="row" style="cursor:default;
          grid-template-columns:24px minmax(0,1fr) auto">
        <span class="row__n">${i + 1}</span>
        <span class="row__body"><span class="row__name">${esc(e.name)}</span></span>
        <span class="row__val"><span class="row__big">${num(e.plays)}</span><br>
          <span class="row__small">${dur(e.ms)}</span></span>
      </div>`).join('')}</div></div>` : ''}

    ${kind === 'track' && d.artist_key ? `<div class="inline">
      <button type="button" class="btn" data-open="artist" data-key="${esc(d.artist_key)}">
        Ver a ${esc(d.artist_name || 'el artista')}</button>
      ${d.album_key ? `<button type="button" class="btn" data-open="album"
        data-key="${esc(d.album_key)}">Ver el álbum</button>` : ''}
    </div>` : ''}

    ${kind === 'album' && d.artist_key ? `<div class="inline">
      <button type="button" class="btn" data-open="artist" data-key="${esc(d.artist_key)}">
        Ver a ${esc(d.artist_name || 'el artista')}</button>
    </div>` : ''}

    ${(meta.artist_id || meta.album_id || d.track_id) ? `<a class="btn"
      href="https://open.spotify.com/${kind === 'artist' ? 'artist' : kind === 'album' ? 'album' : 'track'}/${
        esc(kind === 'artist' ? meta.artist_id : kind === 'album' ? meta.album_id : d.track_id)}"
      target="_blank" rel="noopener noreferrer">Abrir en Spotify ↗</a>` : ''}
  </div>`;

  const root = sheetBody();
  hydrate(km.artKind, [key], root);
  if (kind === 'artist') {
    hydrate('tracks', (d.top_tracks || []).map((t) => t.key), root);
    hydrate('albums', (d.top_albums || []).map((a) => a.key), root);
  }
  if (kind === 'album') hydrate('tracks', (d.tracks || []).map((t) => t.key), root);

  const sBox = root.querySelector('#dSeries');
  if (sBox) {
    areaChart(sBox, d.series, {
      metric: 'plays', granularity: d.granularity, height: 150,
      label: `Reproducciones de ${d.name || key}`,
    });
  }
  const hBox = root.querySelector('#dHours');
  if (hBox) {
    barsChart(hBox, d.hours, d.hours.map((_, h) => hourLabel(h)), {
      height: 104, labelEvery: 4,
      shortLabels: d.hours.map((_, h) => (h % 4 ? '' : String(h))),
      highlight: true,
    });
  }
}
