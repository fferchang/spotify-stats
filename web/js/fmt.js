// Formateo de números, tiempos y fechas, sensible al idioma activo.
//
// Los nombres de meses y días se exportan con `let`: en módulos ES las
// importaciones son vínculos vivos, así que `applyLocale()` los cambia y
// quienes los importaron ven el valor nuevo sin recargar nada.

import { t } from './i18n.js';

let LOC = 'es-AR';
let NUM = new Intl.NumberFormat(LOC);
let NUM1 = new Intl.NumberFormat(LOC, { maximumFractionDigits: 1 });
let DATE_LONG = new Intl.DateTimeFormat(LOC, { day: 'numeric', month: 'long', year: 'numeric' });
let DATE_SHORT = new Intl.DateTimeFormat(LOC, { day: '2-digit', month: 'short', year: '2-digit' });
let DATE_DAY = new Intl.DateTimeFormat(LOC, { day: 'numeric', month: 'short' });
let TIME = new Intl.DateTimeFormat(LOC, { hour: '2-digit', minute: '2-digit' });

export let MESES = [];
export let DIAS = [];
export let DIAS_LARGO = [];

/** Reconstruye los formateadores y los nombres de meses/días. */
export function applyLocale(lang) {
  LOC = lang === 'en' ? 'en-US' : 'es-AR';
  NUM = new Intl.NumberFormat(LOC);
  NUM1 = new Intl.NumberFormat(LOC, { maximumFractionDigits: 1 });
  DATE_LONG = new Intl.DateTimeFormat(LOC, { day: 'numeric', month: 'long', year: 'numeric' });
  DATE_SHORT = new Intl.DateTimeFormat(LOC, { day: '2-digit', month: 'short', year: '2-digit' });
  DATE_DAY = new Intl.DateTimeFormat(LOC, { day: 'numeric', month: 'short' });
  TIME = new Intl.DateTimeFormat(LOC, { hour: '2-digit', minute: '2-digit' });

  const shortMonth = new Intl.DateTimeFormat(LOC, { month: 'short' });
  MESES = Array.from({ length: 12 }, (_, m) =>
    shortMonth.format(new Date(2021, m, 15)).replace('.', ''));

  const shortDay = new Intl.DateTimeFormat(LOC, { weekday: 'short' });
  const longDay = new Intl.DateTimeFormat(LOC, { weekday: 'long' });
  // 2024-01-01 fue lunes: así el índice 0 es siempre lunes.
  DIAS = Array.from({ length: 7 }, (_, i) =>
    shortDay.format(new Date(2024, 0, 1 + i)).replace('.', ''));
  DIAS_LARGO = Array.from({ length: 7 }, (_, i) => longDay.format(new Date(2024, 0, 1 + i)));
}

applyLocale('es');

export const num = (n) => NUM.format(Math.round(n || 0));
export const num1 = (n) => NUM1.format(n || 0);
export const pct = (n) => `${NUM1.format(n || 0)} %`;

/** Tiempo escuchado, en la unidad que se lea mejor: "2.443 h" / "18 min". */
export function dur(ms) {
  const min = (ms || 0) / 60000;
  if (min < 1) return `${Math.round((ms || 0) / 1000)} s`;
  if (min < 90) return `${num(min)} min`;
  const h = min / 60;
  return h < 48 ? `${num1(h)} h` : `${num(h)} h`;
}

/** Versión partida en número + unidad, para las cifras grandes. */
export function durParts(ms) {
  const min = (ms || 0) / 60000;
  if (min < 90) return [num(min), 'min'];
  const h = min / 60;
  return h < 48 ? [num1(h), 'h'] : [num(h), 'h'];
}

/** "1 h 24 min" — para duraciones de sesión, donde importa el detalle. */
export function durLong(ms) {
  const total = Math.round((ms || 0) / 60000);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Duración de una pista: 3:45 */
export function clock(ms) {
  const s = Math.round((ms || 0) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const toDate = (v) => (typeof v === 'number' ? new Date(v * 1000) : new Date(`${v}T12:00:00`));

export const fdate = (v) => (v ? DATE_LONG.format(toDate(v)) : '—');
export const fshort = (v) => (v ? DATE_SHORT.format(toDate(v)) : '—');
export const fday = (v) => (v ? DATE_DAY.format(toDate(v)) : '—');
export const ftime = (v) => (v ? TIME.format(toDate(v)) : '—');

export function fdatetime(ts) {
  const d = new Date(ts * 1000);
  return `${DATE_DAY.format(d)} · ${TIME.format(d)}`;
}

/** "hace 3 días" / "3 days ago" */
export function ago(ts) {
  if (!ts) return '—';
  const days = Math.floor((Date.now() / 1000 - ts) / 86400);
  if (days <= 0) return t('hoy');
  if (days === 1) return t('ayer');
  if (days < 30) return t('hace {n} días', { n: days });
  const months = Math.round(days / 30.44);
  if (months < 24) return t(months === 1 ? 'hace {n} mes' : 'hace {n} meses', { n: months });
  return t('hace {n} años', { n: Math.round(days / 365.25) });
}

/** Etiqueta de un bucket de la serie temporal, según granularidad. */
export function bucketLabel(iso, gran) {
  const d = new Date(`${iso}T12:00:00`);
  if (gran === 'year') return String(d.getFullYear());
  if (gran === 'month') return `${MESES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
  if (gran === 'week') return t('sem. del {d}', { d: DATE_DAY.format(d) });
  return DATE_DAY.format(d);
}

export const hourLabel = (h) => `${String(h).padStart(2, '0')}:00`;

/** Traducciones de los códigos crudos del export de Spotify. */
const REASON = {
  trackdone: 'Terminó sola', fwdbtn: 'Botón siguiente', backbtn: 'Botón anterior',
  clickrow: 'Clic en la lista', playbtn: 'Botón reproducir', appload: 'Al abrir la app',
  remote: 'Control remoto', endplay: 'Se detuvo', logout: 'Cerró sesión',
  trackerror: 'Error de reproducción', unknown: 'Desconocido',
  unexpected_exit: 'Salida inesperada', unexpected_exit_while_paused: 'Salió en pausa',
  clickside: 'Clic lateral', popup: 'Ventana emergente', uriopen: 'Enlace abierto',
  switched_to_video: 'Pasó a video', persisted: 'Reanudada', autoplay: 'Reproducción automática',
};
export const reason = (r) => (REASON[r] ? t(REASON[r]) : (r || t('Desconocido')));

export function country(code) {
  if (!code) return t('Desconocido');
  try {
    return new Intl.DisplayNames([LOC], { type: 'region' }).of(code) || code;
  } catch {
    return code;
  }
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
