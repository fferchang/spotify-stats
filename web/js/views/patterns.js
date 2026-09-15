// Vista "Hábitos": cuándo, dónde y cómo escuchás.

import { api } from '../api.js';
import { barsChart, clockChart, calendarHeat, hbars } from '../charts.js';
import { kpi, section, empty } from '../ui.js';
import {
  num, pct, esc, reason, country, hourLabel, DIAS, DIAS_LARGO, MESES,
} from '../fmt.js';
import { t } from '../i18n.js';

const FRANJAS = [
  ['Madrugada', 0, 5],
  ['Mañana', 6, 11],
  ['Tarde', 12, 17],
  ['Noche', 18, 23],
];

export async function render(params) {
  const [d, cal] = await Promise.all([
    api.patterns(params),
    api.calendar(params).catch(() => ({ days: [] })),
  ]);
  const p = d.patterns;
  const s = d.summary;

  if (!s.plays) {
    return {
      html: `<div class="head"><h1 class="head__title">${t('Hábitos')}</h1></div>
        ${empty(t('Sin datos'), t('No hay reproducciones en este período.'))}`,
      mount() {},
    };
  }

  const totalHours = p.hours.reduce((a, b) => a + b, 0) || 1;
  const franjaItems = FRANJAS.map(([label, a, b], i) => {
    const v = p.hours.slice(a, b + 1).reduce((x, y) => x + y, 0);
    return { label: t(label), value: v, text: pct((v / totalHours) * 100), color: `var(--s${i + 1})` };
  });

  const peakHour = p.hours.indexOf(Math.max(...p.hours));
  const peakDay = p.weekday.indexOf(Math.max(...p.weekday));
  const peakMonth = p.months.indexOf(Math.max(...p.months));
  const totalPlat = p.platform.reduce((a, b) => a + b.plays, 0) || 1;

  const html = `
  <div class="head">
    <h1 class="head__title">${t('Hábitos')}</h1>
    <p class="head__sub">${esc(t(d.range.label))} · ${t('cuándo, dónde y cómo escuchás')}</p>
  </div>

  <div class="kpis">
    ${kpi(t('Hora pico'), hourLabel(peakHour), '',
      t('{n} reproducciones', { n: num(p.hours[peakHour]) }))}
    ${kpi(t('Día fuerte'), DIAS[peakDay], '',
      `${DIAS_LARGO[peakDay]} · ${t('{n} reproducciones', { n: num(p.weekday[peakDay]) })}`)}
    ${kpi(t('Mes fuerte'), MESES[peakMonth], '',
      t('{n} reproducciones', { n: num(p.months[peakMonth]) }))}
    ${kpi(t('Aleatorio'), pct(s.shuffle_rate), '', t('de las reproducciones'))}
    ${kpi(t('Se saltea'), pct(s.skip_rate), '',
      t('{n} quedaron en nada', { n: num(s.raw_plays - s.plays) }))}
    ${kpi(t('Sin conexión'), pct(s.offline_rate), '',
      s.incognito ? t('{n} en sesión privada', { n: num(s.incognito) }) : t('modo offline'))}
  </div>

  ${section(t('El día'), `<div class="cols-2">
    <div class="card card--pad">
      <div class="sect__note" style="margin-bottom:var(--s-3)">${t('Por hora')}</div>
      <div class="chartbox" id="clock" style="display:flex;justify-content:center"></div>
    </div>
    <div class="card card--pad">
      <div class="sect__note" style="margin-bottom:var(--s-3)">${t('Por franja horaria')}</div>
      ${hbars(franjaItems)}
      <div class="sect__note" style="margin:var(--s-5) 0 var(--s-3)">${t('Hora por hora, en detalle')}</div>
      <div class="chartbox" id="hours"></div>
    </div>
  </div>`)}

  ${section(t('La semana y el año'), `<div class="cols-2">
    <div class="card card--pad">
      <div class="sect__note" style="margin-bottom:var(--s-3)">${t('Por día de la semana')}</div>
      <div class="chartbox" id="wd"></div>
    </div>
    <div class="card card--pad">
      <div class="sect__note" style="margin-bottom:var(--s-3)">${t('Por mes del año')}</div>
      <div class="chartbox" id="mo"></div>
    </div>
  </div>`)}

  ${cal.days.length ? section(t('Calendario'), `
    <div class="card card--pad">
      <div class="sect__note" style="margin-bottom:var(--s-3)">
        ${t('Cada celda es un día; cuanto más verde, más escuchaste.')}
      </div>
      <div class="cal"><div class="chartbox" id="cal"></div></div>
    </div>`, { note: t('{n} días con música', { n: num(cal.days.length) }) }) : ''}

  ${section(t('Dispositivos y lugares'), `<div class="cols-2">
    <div class="card card--pad">
      <div class="sect__note" style="margin-bottom:var(--s-3)">${t('Dónde reproducís')}</div>
      ${hbars(p.platform.map((x, i) => ({
        label: esc(x.key), value: x.plays,
        text: pct((x.plays / totalPlat) * 100),
        color: i === 0 ? 'var(--accent)' : 'var(--s1)',
      })))}
    </div>
    <div class="card card--pad">
      <div class="sect__note" style="margin-bottom:var(--s-3)">${t('Desde qué país')}</div>
      ${p.country.length ? hbars(p.country.map((x, i) => ({
        label: esc(country(x.key)), value: x.plays,
        text: num(x.plays), color: i === 0 ? 'var(--accent)' : 'var(--s1)',
      }))) : `<p class="mut">${t('El export no trae el país de estas reproducciones.')}</p>`}
      <p class="sect__note" style="margin-top:var(--s-4)">
        ${t('Sale del campo <code>conn_country</code> del export. Tu dirección IP no se guarda.')}
      </p>
    </div>
  </div>`)}

  ${section(t('Cómo empiezan y terminan las canciones'), `<div class="cols-2">
    <div class="card card--pad">
      <div class="sect__note" style="margin-bottom:var(--s-3)">${t('Motivo de inicio')}</div>
      ${hbars(p.reason_start.map((x) => ({
        label: esc(reason(x.key)), value: x.plays, text: num(x.plays), color: 'var(--s3)',
      })))}
    </div>
    <div class="card card--pad">
      <div class="sect__note" style="margin-bottom:var(--s-3)">${t('Motivo de fin')}</div>
      ${hbars(p.reason_end.map((x) => ({
        label: esc(reason(x.key)), value: x.plays, text: num(x.plays), color: 'var(--s2)',
      })))}
    </div>
  </div>`)}`;

  return {
    html,
    mount(root) {
      clockChart(root.querySelector('#clock'), p.hours);
      barsChart(root.querySelector('#hours'), p.hours,
        p.hours.map((_, h) => hourLabel(h)), {
          height: 118, labelEvery: 3,
          shortLabels: p.hours.map((_, h) => (h % 3 ? '' : String(h))),
        });
      barsChart(root.querySelector('#wd'), p.weekday, DIAS, { highlight: true, height: 150 });
      barsChart(root.querySelector('#mo'), p.months, MESES, { highlight: true, height: 150 });
      const calBox = root.querySelector('#cal');
      if (calBox) calendarHeat(calBox, cal.days);
    },
  };
}
