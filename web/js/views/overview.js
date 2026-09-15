// Vista "Resumen": una cifra grande, el contexto alrededor y los récords.

import { api } from '../api.js';
import { areaChart, barsChart, clockChart } from '../charts.js';
import {
  ICON, art, hydrate, kpi, rankList, section, tileGrid, empty, alert,
} from '../ui.js';
import {
  num, num1, dur, durParts, durLong, clock, pct, esc, fdate, fshort, fdatetime,
  hourLabel, DIAS, DIAS_LARGO, MESES,
} from '../fmt.js';

const feature = (item, kind, label) => {
  if (!item) return '<div class="card"></div>';
  return `<button type="button" class="card" data-open="${kind.replace(/s$/, '')}"
      data-key="${esc(item.key)}"
      style="display:flex;gap:var(--s-4);align-items:center;text-align:left;cursor:pointer;width:100%">
    <span style="width:72px;flex:none">${art(kind, item.key, kind === 'artists' ? 'art--round' : '')}</span>
    <span style="min-width:0">
      <span class="kpi__label" style="display:block">${label}</span>
      <span style="display:block;font-size:17px;font-weight:620;letter-spacing:-.015em;margin-top:4px;
            overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(item.name)}</span>
      <span class="kpi__foot" style="display:block">${num(item.plays)} reproducciones · ${dur(item.ms)}</span>
    </span>
  </button>`;
};

const recordCard = (icon, label, value, foot) => `<div class="card">
  <div class="inline" style="color:var(--ink-3);font-size:11px;font-weight:600;
       letter-spacing:.07em;text-transform:uppercase">${icon}${label}</div>
  <div style="font-size:19px;font-weight:640;letter-spacing:-.02em;margin-top:8px;line-height:1.25">${value}</div>
  ${foot ? `<div class="kpi__foot">${foot}</div>` : ''}
</div>`;

export async function render(params) {
  const d = await api.overview(params);
  const s = d.summary;
  const sort = params.sort || 'plays';

  if (!s.plays) {
    return {
      html: `<div class="head"><h1 class="head__title">Resumen</h1>
        <p class="head__sub">${esc(d.range.label)}</p></div>
        ${empty('No hay escuchas en este período',
          'Probá con un rango más amplio, o mirá “Todo el historial”.')}`,
      mount() {},
    };
  }

  const [figure, unit] = durParts(s.ms);
  const topArtist = d.top_artists[0];
  const peakHour = d.patterns.hours.indexOf(Math.max(...d.patterns.hours));
  const peakDay = d.patterns.weekday.indexOf(Math.max(...d.patterns.weekday));
  const r = d.records || {};

  const html = `
  <div class="head">
    <h1 class="head__title">Resumen</h1>
    <p class="head__sub">${esc(d.range.label)} · ${fshort(d.range.start)} → ${fshort(d.range.end - 1)}</p>
  </div>

  <div class="hero">
    <div class="hero__main">
      <div class="hero__eyebrow">Tiempo escuchado</div>
      <div class="hero__figure num">${figure}<small>${unit}</small></div>
      <p class="hero__caption">
        ${num(s.plays)} reproducciones de <b>${num(s.artists)}</b> artistas
        y <b>${num(s.tracks)}</b> canciones distintas.
        ${topArtist ? `Mandó <b>${esc(topArtist.name)}</b>, con ${num(topArtist.plays)} escuchas.` : ''}
      </p>
      <p class="hero__caption mut" style="font-size:13px;margin-top:var(--s-2)">
        Son ${num1(s.ms / 3600000 / Math.max(1, s.days_active))} h por día activo,
        repartidas en ${num(s.days_active)} de ${num(s.days_span)} días (${pct(s.coverage)}).
      </p>
    </div>
    <div class="hero__side">
      ${feature(topArtist, 'artists', 'Artista nº 1')}
      ${feature(d.top_tracks[0], 'tracks', 'Canción nº 1')}
    </div>
  </div>

  <div class="kpis" style="margin-top:var(--s-5)">
    ${kpi('Reproducciones', num(s.plays), '', `${num1(s.plays_per_active_day)} por día activo`)}
    ${kpi('Artistas', num(s.artists), '', `${num(s.albums)} álbumes`)}
    ${kpi('Canciones', num(s.tracks), '', `media de ${clock(s.avg_play_ms)} por escucha`)}
    ${kpi('Días con música', num(s.days_active), '', `${pct(s.coverage)} del período`)}
    ${kpi('Se saltea', pct(s.skip_rate), '', `de ${num(s.raw_plays)} intentos`)}
    ${kpi('En aleatorio', pct(s.shuffle_rate), '', s.offline_rate > 1 ? `${pct(s.offline_rate)} sin conexión` : 'del total')}
  </div>

  ${section('Cómo evolucionó', `
    <div class="card card--pad"><div class="chartbox" id="tl"></div></div>`,
    { note: { day: 'por día', week: 'por semana', month: 'por mes', year: 'por año' }[d.timeline.granularity] })}

  <div class="cols-2" style="margin-top:var(--s-7)">
    <section>
      <div class="sect__head">
        <h2 class="sect__title">Artistas</h2>
        <button type="button" class="sect__link" data-go="artistas">Ver todos</button>
      </div>
      ${tileGrid(d.top_artists, 'artists', sort)}
    </section>
    <section>
      <div class="sect__head">
        <h2 class="sect__title">Canciones</h2>
        <button type="button" class="sect__link" data-go="temas">Ver todas</button>
      </div>
      ${rankList(d.top_tracks, 'tracks', sort, { detailKind: 'track' })}
    </section>
  </div>

  ${section('Récords del período', `<div class="cols-3">
    ${r.best_day ? recordCard(ICON.fuego, 'Mejor día', fdate(r.best_day.date),
      `${dur(r.best_day.ms)} en ${num(r.best_day.plays)} reproducciones` +
      (r.best_day.top_artist ? ` · sobre todo ${esc(r.best_day.top_artist)}` : '')) : ''}
    ${r.streak ? recordCard(ICON.calendario, 'Racha más larga', `${num(r.streak.days)} días seguidos`,
      `${fshort(r.streak.start)} → ${fshort(r.streak.end)}`) : ''}
    ${r.longest_session ? recordCard(ICON.reloj, 'Sesión más larga', durLong(r.longest_session.ms),
      `${num(r.longest_session.plays)} temas sin parar, desde ${fdatetime(r.longest_session.start)}`) : ''}
    ${r.obsession ? recordCard(ICON.disco, 'Obsesión', `${num(r.obsession.plays)}× en un día`,
      `${esc(r.obsession.name || '')} — ${esc(r.obsession.artist || '')}, el ${fshort(r.obsession.date)}`) : ''}
    ${recordCard(ICON.luna, 'De madrugada', `${pct(r.night_owl?.pct || 0)}`,
      `${num(r.night_owl?.plays || 0)} reproducciones entre las 0 y las 5`)}
    ${recordCard(ICON.reloj, 'Hora pico', hourLabel(peakHour),
      `Tu día fuerte es el ${DIAS_LARGO[peakDay]}`)}
  </div>`)}

  ${section('Tus horarios', `<div class="cols-2">
    <div class="card card--pad">
      <div class="sect__note" style="margin-bottom:var(--s-3)">Reproducciones por hora del día</div>
      <div class="chartbox" id="clock" style="display:flex;justify-content:center"></div>
    </div>
    <div class="card card--pad">
      <div class="sect__note" style="margin-bottom:var(--s-3)">Reproducciones por día de la semana</div>
      <div class="chartbox" id="wd"></div>
      <div class="sect__note" style="margin:var(--s-5) 0 var(--s-3)">Reproducciones por mes del año</div>
      <div class="chartbox" id="mo"></div>
    </div>
  </div>`)}`;

  return {
    html,
    mount(root) {
      areaChart(root.querySelector('#tl'), d.timeline.points, {
        metric: sort === 'ms' ? 'ms' : 'plays',
        granularity: d.timeline.granularity,
        label: 'Evolución de la escucha',
        height: 210,
      });
      clockChart(root.querySelector('#clock'), d.patterns.hours);
      barsChart(root.querySelector('#wd'), d.patterns.weekday, DIAS, { highlight: true, height: 128 });
      barsChart(root.querySelector('#mo'), d.patterns.months, MESES, { highlight: true, height: 110 });

      hydrate('artists', d.top_artists.map((i) => i.key), root);
      hydrate('tracks', d.top_tracks.map((i) => i.key), root);
    },
  };
}
