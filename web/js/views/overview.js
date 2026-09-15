// Vista "Resumen": una cifra grande, el contexto alrededor y los récords.

import { api } from '../api.js';
import { areaChart, barsChart, clockChart } from '../charts.js';
import { ICON, art, hydrate, kpi, rankList, section, tileGrid, empty } from '../ui.js';
import {
  num, num1, dur, durParts, durLong, clock, pct, esc, fdate, fshort, fdatetime,
  hourLabel, DIAS, DIAS_LARGO, MESES,
} from '../fmt.js';
import { t } from '../i18n.js';

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
      <span class="kpi__foot" style="display:block">${
        t('{n} reproducciones · {time}', { n: num(item.plays), time: dur(item.ms) })}</span>
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
      html: `<div class="head"><h1 class="head__title">${t('Resumen')}</h1>
        <p class="head__sub">${esc(t(d.range.label))}</p></div>
        ${empty(t('No hay escuchas en este período'),
          t('Probá con un rango más amplio, o mirá “Todo el historial”.'))}`,
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
    <h1 class="head__title">${t('Resumen')}</h1>
    <p class="head__sub">${esc(t(d.range.label))} · ${fshort(d.range.start)} → ${fshort(d.range.end - 1)}</p>
  </div>

  <div class="hero">
    <div class="hero__main">
      <div class="hero__eyebrow">${t('Tiempo escuchado')}</div>
      <div class="hero__figure num">${figure}<small>${unit}</small></div>
      <p class="hero__caption">
        ${t('{plays} reproducciones de <b>{artists}</b> artistas y <b>{tracks}</b> canciones distintas.',
          { plays: num(s.plays), artists: num(s.artists), tracks: num(s.tracks) })}
        ${topArtist ? t('Mandó <b>{name}</b>, con {plays} escuchas.',
          { name: esc(topArtist.name), plays: num(topArtist.plays) }) : ''}
      </p>
      <p class="hero__caption mut" style="font-size:13px;margin-top:var(--s-2)">
        ${t('Son {h} h por día activo, repartidas en {days} de {span} días ({pct}).', {
          h: num1(s.ms / 3600000 / Math.max(1, s.days_active)),
          days: num(s.days_active), span: num(s.days_span), pct: pct(s.coverage),
        })}
      </p>
    </div>
    <div class="hero__side">
      ${feature(topArtist, 'artists', t('Artista nº 1'))}
      ${feature(d.top_tracks[0], 'tracks', t('Canción nº 1'))}
    </div>
  </div>

  <div class="kpis" style="margin-top:var(--s-5)">
    ${kpi(t('Reproducciones'), num(s.plays), '',
      t('{n} por día activo', { n: num1(s.plays_per_active_day) }))}
    ${kpi(t('Artistas'), num(s.artists), '', t('{n} álbumes', { n: num(s.albums) }))}
    ${kpi(t('Canciones'), num(s.tracks), '', t('media de {t} por escucha', { t: clock(s.avg_play_ms) }))}
    ${kpi(t('Días con música'), num(s.days_active), '', t('{pct} del período', { pct: pct(s.coverage) }))}
    ${kpi(t('Se saltea'), pct(s.skip_rate), '', t('de {n} intentos', { n: num(s.rate_base || s.raw_plays) }))}
    ${kpi(t('En aleatorio'), pct(s.shuffle_rate), '',
      s.offline_rate > 1 ? t('{pct} sin conexión', { pct: pct(s.offline_rate) }) : t('del total'))}
  </div>

  ${section(t('Cómo evolucionó'), `
    <div class="card card--pad"><div class="chartbox" id="tl"></div></div>`,
    { note: t({ day: 'por día', week: 'por semana', month: 'por mes', year: 'por año' }[d.timeline.granularity]) })}

  <div class="cols-2" style="margin-top:var(--s-7)">
    <section>
      <div class="sect__head">
        <h2 class="sect__title">${t('Artistas')}</h2>
        <button type="button" class="sect__link" data-go="artistas">${t('Ver todos')}</button>
      </div>
      ${tileGrid(d.top_artists, 'artists', sort)}
    </section>
    <section>
      <div class="sect__head">
        <h2 class="sect__title">${t('Canciones')}</h2>
        <button type="button" class="sect__link" data-go="temas">${t('Ver todas')}</button>
      </div>
      ${rankList(d.top_tracks, 'tracks', sort, { detailKind: 'track' })}
    </section>
  </div>

  ${section(t('Récords del período'), `<div class="cols-3">
    ${r.best_day ? recordCard(ICON.fuego, t('Mejor día'), fdate(r.best_day.date),
      t('{time} en {n} reproducciones', { time: dur(r.best_day.ms), n: num(r.best_day.plays) })
      + (r.best_day.top_artist ? t(' · sobre todo {name}', { name: esc(r.best_day.top_artist) }) : '')) : ''}
    ${r.streak ? recordCard(ICON.calendario, t('Racha más larga'),
      t('{n} días seguidos', { n: num(r.streak.days) }),
      `${fshort(r.streak.start)} → ${fshort(r.streak.end)}`) : ''}
    ${r.longest_session ? recordCard(ICON.reloj, t('Sesión más larga'), durLong(r.longest_session.ms),
      t('{n} temas sin parar, desde {when}',
        { n: num(r.longest_session.plays), when: fdatetime(r.longest_session.start) })) : ''}
    ${r.obsession ? recordCard(ICON.disco, t('Obsesión'),
      t('{n}× en un día', { n: num(r.obsession.plays) }),
      `${esc(r.obsession.name || '')} — ${esc(r.obsession.artist || '')}, ${fshort(r.obsession.date)}`) : ''}
    ${recordCard(ICON.luna, t('De madrugada'), pct(r.night_owl?.pct || 0),
      t('{n} reproducciones entre las 0 y las 5', { n: num(r.night_owl?.plays || 0) }))}
    ${recordCard(ICON.reloj, t('Hora pico'), hourLabel(peakHour),
      t('Tu día fuerte es el {day}', { day: DIAS_LARGO[peakDay] }))}
  </div>`)}

  ${section(t('Tus horarios'), `<div class="cols-2">
    <div class="card card--pad">
      <div class="sect__note" style="margin-bottom:var(--s-3)">${t('Reproducciones por hora del día')}</div>
      <div class="chartbox" id="clock" style="display:flex;justify-content:center"></div>
    </div>
    <div class="card card--pad">
      <div class="sect__note" style="margin-bottom:var(--s-3)">${t('Reproducciones por día de la semana')}</div>
      <div class="chartbox" id="wd"></div>
      <div class="sect__note" style="margin:var(--s-5) 0 var(--s-3)">${t('Reproducciones por mes del año')}</div>
      <div class="chartbox" id="mo"></div>
    </div>
  </div>`)}`;

  return {
    html,
    mount(root) {
      areaChart(root.querySelector('#tl'), d.timeline.points, {
        metric: sort === 'ms' ? 'ms' : 'plays',
        granularity: d.timeline.granularity,
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
