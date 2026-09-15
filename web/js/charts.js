// Gráficos en SVG, escritos a mano. Sin dependencias.
//
// Reglas que sigue este archivo:
// · Marcas finas, extremos redondeados de 4px apoyados en la línea base.
// · Rejilla y ejes recesivos; el dato manda.
// · Capa de hover en todos: cruceta + tooltip en área, tooltip por marca en barras.
// · Una sola serie => sin leyenda (el título ya la nombra).

import { num, dur, bucketLabel, hourLabel, DIAS, MESES } from './fmt.js';
import { t } from './i18n.js';

const NS = 'http://www.w3.org/2000/svg';
const HEAT = ['var(--h0)', 'var(--h1)', 'var(--h2)', 'var(--h3)', 'var(--h4)', 'var(--h5)'];

const el = (tag, attrs = {}) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

function niceMax(v) {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  const r = v / mag;
  return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * mag;
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/** Redibuja cuando cambia el ancho del contenedor. */
export function responsive(box, draw) {
  const run = () => { const w = box.clientWidth; if (w > 40) draw(w); };
  run();
  box._ro?.disconnect();
  box._ro = new ResizeObserver(debounce(run, 120));
  box._ro.observe(box);
}

/* ─────────────────────────────  Tooltip  ───────────────────────────── */
function tooltip(box) {
  let tip = box.querySelector(':scope > .tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'tip';
    box.appendChild(tip);
  }
  return {
    show(x, y, html) {
      tip.innerHTML = html;
      tip.style.left = `${Math.max(4, Math.min(box.clientWidth - 4, x))}px`;
      tip.style.top = `${y - 10}px`;
      tip.classList.add('is-on');
    },
    hide() { tip.classList.remove('is-on'); },
  };
}

/* ─────────────────────────────  Área temporal  ───────────────────────────── */
export function areaChart(box, points, opts = {}) {
  const metric = opts.metric || 'ms';
  const gran = opts.granularity || 'day';
  const fmtV = metric === 'ms' ? dur : num;
  const unit = metric === 'ms' ? t('escuchado') : t('reproducciones');

  responsive(box, (W) => {
    box.querySelectorAll(':scope > svg').forEach((s) => s.remove());
    const H = opts.height || 190;
    const pad = { t: 12, r: 6, b: 22, l: 44 };
    const iw = Math.max(10, W - pad.l - pad.r);
    const ih = H - pad.t - pad.b;

    const vals = points.map((p) => p[metric] || 0);
    const max = niceMax(Math.max(...vals, 1));
    const n = points.length;
    const X = (i) => pad.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
    const Y = (v) => pad.t + ih - (v / max) * ih;

    const svg = el('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, height: H,
      role: 'img', 'aria-label': opts.label || t('Cómo evolucionó') });

    // Rejilla horizontal + etiquetas del eje Y.
    for (let i = 0; i <= 3; i++) {
      const v = (max / 3) * i;
      const y = Y(v);
      svg.appendChild(el('line', { class: 'grid-line', x1: pad.l, x2: W - pad.r, y1: y, y2: y }));
      const t = el('text', { x: pad.l - 8, y: y + 3.5, 'text-anchor': 'end' });
      t.textContent = i === 0 ? '0' : fmtV(v).replace(/\s?(min|h)$/, '');
      svg.appendChild(t);
    }

    const line = points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p[metric] || 0).toFixed(1)}`).join(' ');
    svg.appendChild(el('path', {
      d: `${line} L${X(n - 1).toFixed(1)} ${pad.t + ih} L${X(0).toFixed(1)} ${pad.t + ih} Z`,
      fill: 'var(--accent)', 'fill-opacity': '.13',
    }));
    svg.appendChild(el('path', {
      d: line, fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    }));

    // Etiquetas del eje X: sólo las que entran sin pisarse.
    const step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 78))));
    for (let i = 0; i < n; i += step) {
      const t = el('text', { x: X(i), y: H - 5, 'text-anchor': 'middle' });
      t.textContent = bucketLabel(points[i].t, gran);
      svg.appendChild(t);
    }
    svg.appendChild(el('line', { class: 'axis-line', x1: pad.l, x2: W - pad.r,
      y1: pad.t + ih, y2: pad.t + ih }));

    // Cruceta + punto activo.
    const cross = el('line', { class: 'axis-line', y1: pad.t, y2: pad.t + ih,
      stroke: 'var(--line-2)', opacity: 0 });
    const dot = el('circle', { r: 4, fill: 'var(--accent)', stroke: 'var(--surface)',
      'stroke-width': 2, opacity: 0 });
    svg.append(cross, dot);

    const hit = el('rect', { x: pad.l, y: pad.t, width: iw, height: ih, fill: 'transparent' });
    svg.appendChild(hit);
    const tip = tooltip(box);

    const onMove = (ev) => {
      const r = svg.getBoundingClientRect();
      const px = ((ev.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(n - 1, Math.round(((px - pad.l) / iw) * (n - 1))));
      const p = points[i];
      if (!p) return;
      const x = X(i);
      const y = Y(p[metric] || 0);
      cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.setAttribute('opacity', 1);
      dot.setAttribute('cx', x); dot.setAttribute('cy', y); dot.setAttribute('opacity', 1);
      tip.show((x / W) * box.clientWidth, (y / H) * H,
        `<b>${bucketLabel(p.t, gran)}</b>${fmtV(p[metric])} ${unit}` +
        (metric === 'ms' ? `<span> · ${num(p.plays)} ${t('repr.')}</span>` : ''));
    };
    const onLeave = () => { cross.setAttribute('opacity', 0); dot.setAttribute('opacity', 0); tip.hide(); };
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerleave', onLeave);

    box.insertBefore(svg, box.firstChild);
  });
}

/* ─────────────────────────────  Barras verticales  ───────────────────────────── */
export function barsChart(box, values, labels, opts = {}) {
  const fmtV = opts.metric === 'ms' ? dur : num;
  responsive(box, (W) => {
    box.querySelectorAll(':scope > svg').forEach((s) => s.remove());
    const H = opts.height || 150;
    const pad = { t: 10, r: 2, b: 20, l: 2 };
    const iw = Math.max(10, W - pad.l - pad.r);
    const ih = H - pad.t - pad.b;
    const max = Math.max(...values, 1);
    const n = values.length;
    const slot = iw / n;
    const bw = Math.max(3, Math.min(opts.maxBar || 34, slot - 2)); // 2px de aire entre barras

    const svg = el('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, height: H,
      role: 'img', 'aria-label': opts.label || '' });
    const tip = tooltip(box);
    const peak = values.indexOf(max);

    values.forEach((v, i) => {
      const h = Math.max(v > 0 ? 2 : 0, (v / max) * ih);
      const x = pad.l + i * slot + (slot - bw) / 2;
      const y = pad.t + ih - h;
      const bar = el('rect', {
        x, y, width: bw, height: h, rx: Math.min(4, bw / 2),
        fill: opts.highlight && i === peak ? 'var(--accent)' : 'var(--s1)',
        'fill-opacity': opts.highlight && i !== peak ? '.55' : '1',
      });
      svg.appendChild(bar);

      const hit = el('rect', { x: pad.l + i * slot, y: pad.t, width: slot, height: ih, fill: 'transparent' });
      hit.addEventListener('pointerenter', () => {
        bar.setAttribute('fill-opacity', '1');
        tip.show(((x + bw / 2) / W) * box.clientWidth, y, `<b>${labels[i]}</b>${fmtV(v)}`);
      });
      hit.addEventListener('pointerleave', () => {
        bar.setAttribute('fill-opacity', opts.highlight && i !== peak ? '.55' : '1');
        tip.hide();
      });
      svg.appendChild(hit);
    });

    const every = opts.labelEvery || 1;
    labels.forEach((l, i) => {
      if (i % every) return;
      const t = el('text', { x: pad.l + i * slot + slot / 2, y: H - 5, 'text-anchor': 'middle' });
      t.textContent = opts.shortLabels ? opts.shortLabels[i] : l;
      svg.appendChild(t);
    });

    box.insertBefore(svg, box.firstChild);
  });
}

/* ─────────────────────────────  Reloj de 24 horas  ───────────────────────────── */
export function clockChart(box, hours, opts = {}) {
  responsive(box, (W) => {
    box.querySelectorAll(':scope > svg').forEach((s) => s.remove());
    const size = Math.min(W, opts.max || 280);
    const c = size / 2;
    const rIn = size * 0.26;
    const rOut = size * 0.46;
    const max = Math.max(...hours, 1);

    const svg = el('svg', { class: 'chart', viewBox: `0 0 ${size} ${size}`,
      width: size, height: size, role: 'img',
      'aria-label': t('Reproducciones por hora del día') });
    svg.style.margin = '0 auto';

    svg.appendChild(el('circle', { cx: c, cy: c, r: rIn - 6, fill: 'none',
      stroke: 'var(--grid)', 'stroke-width': 1 }));
    svg.appendChild(el('circle', { cx: c, cy: c, r: rOut, fill: 'none',
      stroke: 'var(--grid)', 'stroke-width': 1 }));

    const peak = hours.indexOf(max);
    const tip = tooltip(box);
    const A = (h) => (h / 24) * Math.PI * 2 - Math.PI / 2;

    hours.forEach((v, h) => {
      const a0 = A(h) + 0.022;
      const a1 = A(h + 1) - 0.022;
      const r = rIn + (v / max) * (rOut - rIn);
      const p = (ang, rad) => [c + Math.cos(ang) * rad, c + Math.sin(ang) * rad];
      const [x0, y0] = p(a0, rIn); const [x1, y1] = p(a1, rIn);
      const [x2, y2] = p(a1, r);   const [x3, y3] = p(a0, r);
      const seg = el('path', {
        d: `M${x0} ${y0} A${rIn} ${rIn} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${r} ${r} 0 0 0 ${x3} ${y3} Z`,
        fill: h === peak ? 'var(--accent)' : 'var(--s1)',
        'fill-opacity': h === peak ? 1 : 0.62,
      });
      svg.appendChild(seg);

      seg.addEventListener('pointerenter', () => {
        seg.setAttribute('fill-opacity', 1);
        const [tx, ty] = p((a0 + a1) / 2, rOut + 6);
        tip.show((tx / size) * box.clientWidth - (box.clientWidth - size) / 2 * 0, ty,
          `<b>${hourLabel(h)}</b>${num(v)} ${t('reproducciones')}`);
      });
      seg.addEventListener('pointerleave', () => {
        seg.setAttribute('fill-opacity', h === peak ? 1 : 0.62);
        tip.hide();
      });
    });

    [0, 6, 12, 18].forEach((h) => {
      const a = A(h);
      const t = el('text', {
        x: c + Math.cos(a) * (rOut + 14), y: c + Math.sin(a) * (rOut + 14) + 4,
        'text-anchor': 'middle',
      });
      t.textContent = `${h}h`;
      svg.appendChild(t);
    });

    const big = el('text', { x: c, y: c - 2, 'text-anchor': 'middle' });
    big.setAttribute('style', 'font-size:22px;font-weight:660;fill:var(--ink)');
    big.textContent = hourLabel(peak);
    const sub = el('text', { x: c, y: c + 15, 'text-anchor': 'middle' });
    sub.textContent = t('tu hora pico');
    svg.append(big, sub);

    box.insertBefore(svg, box.firstChild);
  });
}

/* ─────────────────────────────  Calendario  ───────────────────────────── */
export function calendarHeat(box, days, opts = {}) {
  const byDate = new Map(days.map((d) => [d.d, d]));
  const vals = days.map((d) => d.ms).filter((v) => v > 0).sort((a, b) => a - b);
  // Cuantiles: un día normal no debe quedar del mismo color que un maratón.
  const qt = (p) => vals.length ? vals[Math.min(vals.length - 1, Math.floor(vals.length * p))] : 0;
  const cuts = [qt(0.2), qt(0.45), qt(0.7), qt(0.9)];
  const level = (ms) => {
    if (!ms) return 0;
    for (let i = 0; i < cuts.length; i++) if (ms <= cuts[i]) return i + 1;
    return 5;
  };

  const first = days[0] ? new Date(`${days[0].d}T12:00:00`) : new Date();
  const last = days.length ? new Date(`${days[days.length - 1].d}T12:00:00`) : new Date();
  const start = new Date(first);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // alinear al lunes

  box.innerHTML = '';
  const months = document.createElement('div');
  months.className = 'cal__months';
  const grid = document.createElement('div');
  grid.className = 'cal__grid';

  const tip = tooltip(box);
  let cursor = new Date(start);
  let weeks = 0;
  let lastMonth = -1;
  const monthCells = [];

  while (cursor <= last && weeks < 400) {
    for (let d = 0; d < 7; d++) {
      const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
      const rec = byDate.get(iso);
      const cell = document.createElement('div');
      cell.className = 'cal__cell';
      const lv = level(rec?.ms || 0);
      cell.style.background = HEAT[lv];
      cell.style.gridRow = d + 1;
      if (cursor > last) cell.style.visibility = 'hidden';
      cell.addEventListener('pointerenter', (ev) => {
        const r = box.getBoundingClientRect();
        tip.show(ev.clientX - r.left, ev.clientY - r.top,
          rec ? `<b>${iso}</b>${dur(rec.ms)} · ${num(rec.plays)} ${t('repr.')}`
              : `<b>${iso}</b><span>${t('sin escuchas')}</span>`);
      });
      cell.addEventListener('pointerleave', () => tip.hide());
      grid.appendChild(cell);
      if (d === 0) {
        monthCells.push(cursor.getMonth() !== lastMonth ? MESES[cursor.getMonth()] : '');
        lastMonth = cursor.getMonth();
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks++;
  }

  months.style.gridTemplateColumns = `repeat(${weeks}, 14px)`;
  months.innerHTML = monthCells.map((m) => `<span>${m}</span>`).join('');

  const scale = document.createElement('div');
  scale.className = 'cal__scale';
  scale.innerHTML = `<span>${t('menos')}</span>${HEAT.map((c) => `<i style="background:${c}"></i>`).join('')}<span>${t('más')}</span>`;

  box.append(months, grid, scale);
}

/* ─────────────────────────────  Barras horizontales  ───────────────────────────── */
export function hbars(items, opts = {}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  const color = opts.color || 'var(--accent)';
  return `<div class="hbars">${items.map((i) => `
    <div class="hbar">
      <span class="hbar__label" title="${i.label}">${i.label}</span>
      <span class="hbar__track"><i class="hbar__fill" style="width:${Math.max(2, (i.value / max) * 100)}%;background:${i.color || color}"></i></span>
      <span class="hbar__val">${i.text}</span>
    </div>`).join('')}</div>`;
}

/* ─────────────────────────────  Sparkline  ───────────────────────────── */
export function sparkline(values, w = 92, h = 26) {
  if (!values?.length) return '';
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) =>
    `${((i / Math.max(1, values.length - 1)) * w).toFixed(1)},${(h - (v / max) * (h - 3) - 1.5).toFixed(1)}`);
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">
    <polyline points="${pts.join(' ')}" fill="none" stroke="var(--accent)"
      stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

export { DIAS, MESES };
