// Vista "Hábitos": cuándo, dónde y cómo escuchás.

import { api } from '../api.js';
import { barsChart, clockChart, calendarHeat, hbars } from '../charts.js';
import { kpi, section, empty, alert } from '../ui.js';
import {
  num, num1, dur, pct, esc, reason, country, hourLabel,
  DIAS, DIAS_LARGO, MESES,
} from '../fmt.js';

const franjas = [
  ['Madrugada', 0, 5, 'de 0 a 5'],
  ['Mañana', 6, 11, 'de 6 a 11'],
  ['Tarde', 12, 17, 'de 12 a 17'],
  ['Noche', 18, 23, 'de 18 a 23'],
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
      html: `<div class="head"><h1 class="head__title">Hábitos</h1></div>
        ${empty('Sin datos', 'No hay reproducciones en este período.')}`,
      mount() {},
    };
  }

  const totalHours = p.hours.reduce((a, b) => a + b, 0) || 1;
  const franjaItems = franjas.map(([label, a, b, hint], i) => {
    const v = p.hours.slice(a, b + 1).reduce((x, y) => x + y, 0);
    return {
      label, value: v, text: `${pct((v / totalHours) * 100)}`,
      color: `var(--s${i + 1})`, hint,
    };
  });

  const peakHour = p.hours.indexOf(Math.max(...p.hours));
  const peakDay = p.weekday.indexOf(Math.max(...p.weekday));
  const peakMonth = p.months.indexOf(Math.max(...p.months));
  const totalPlat = p.platform.reduce((a, b) => a + b.plays, 0) || 1;

  const html = `
  <div class="head">
    <h1 class="head__title">Hábitos</h1>
    <p class="head__sub">${esc(d.range.label)} · cuándo, dónde y cómo escuchás</p>
  </div>

  <div class="kpis">
    ${kpi('Hora pico', hourLabel(peakHour), '', `${num(p.hours[peakHour])} reproducciones`)}
    ${kpi('Día fuerte', DIAS_LARGO[peakDay].slice(0, 3) + '.', '',
      `${DIAS_LARGO[peakDay]} · ${num(p.weekday[peakDay])} repr.`)}
    ${kpi('Mes fuerte', MESES[peakMonth], '', `${num(p.months[peakMonth])} reproducciones`)}
    ${kpi('Aleatorio', pct(s.shuffle_rate), '', 'de las reproducciones')}
    ${kpi('Se saltea', pct(s.skip_rate), '', `${num(s.raw_plays - s.plays)} quedaron en nada`)}
    ${kpi('Sin conexión', pct(s.offline_rate), '', s.incognito ? `${num(s.incognito)} en sesión privada` : 'modo offline')}
  </div>

  ${section('El día', `<div class="cols-2">
    <div class="card card--pad">
      <div class="sect__note" style="margin-bottom:var(--s-3)">Por hora</div>
      <div class="chartbox" id="clock" style="display:flex;justify-content:center"></div>
    </div>
    <div class="card card--pad">
      <div class="sect__note" style="margin-bottom:var(--s-3)">Por franja horaria</div>
      ${hbars(franjaItems)}
      <div class="sect__note" style="margin:var(--s-5) 0 var(--s-3)">Hora por hora, en detalle</div>
      <div class="chartbox" id="hours"></div>
    </div>
  </div>`)}

  ${section('La semana y el año', `<div class="cols-2">
    <div class="card card--pad">
      <div class="sect__note" style="margin-bottom:var(--s-3)">Por día de la semana</div>
      <div class="chartbox" id="wd"></div>
    </div>
    <div class="card card--pad">
      <div class="sect__note" style="margin-bottom:var(--s-3)">Por mes del año</div>
      <div class="chartbox" id="mo"></div>
    </div>
  </div>`)}

  ${cal.days.length ? section('Calendario', `
    <div class="card card--pad">
      <div class="sect__note" style="margin-bottom:var(--s-3)">
        Cada celda es un día; cuanto más verde, más escuchaste.
      </div>
      <div class="cal"><div class="chartbox" id="cal"></div></div>
    </div>`, { note: `${num(cal.days.length)} días con música` }) : ''}

  ${section('Dispositivos y lugares', `<div class="cols-2">
    <div class="card card--pad">
      <div class="sect__note" style="margin-bottom:var(--s-3)">Dónde reproducís</div>
      ${hbars(p.platform.map((x, i) => ({
        label: esc(x.key), value: x.plays,
        text: `${pct((x.plays / totalPlat) * 100)}`,
        color: i === 0 ? 'var(--accent)' : 'var(--s1)',
      })))}
    </div>
    <div class="card card--pad">
      <div class="sect__note" style="margin-bottom:var(--s-3)">Desde qué país</div>
      ${p.country.length ? hbars(p.country.map((x, i) => ({
        label: esc(country(x.key)), value: x.plays,
        text: num(x.plays), color: i === 0 ? 'var(--accent)' : 'var(--s1)',
      }))) : '<p class="mut">El export no trae el país de estas reproducciones.</p>'}
      <p class="sect__note" style="margin-top:var(--s-4)">
        Sale del campo <code>conn_country</code> del export. Tu dirección IP no se guarda.
      </p>
    </div>
  </div>`)}

  ${section('Cómo empiezan y terminan las canciones', `<div class="cols-2">
    <div class="card card--pad">
      <div class="sect__note" style="margin-bottom:var(--s-3)">Motivo de inicio</div>
      ${hbars(p.reason_start.map((x) => ({
        label: esc(reason(x.key)), value: x.plays, text: num(x.plays), color: 'var(--s3)',
      })))}
    </div>
    <div class="card card--pad">
      <div class="sect__note" style="margin-bottom:var(--s-3)">Motivo de fin</div>
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
