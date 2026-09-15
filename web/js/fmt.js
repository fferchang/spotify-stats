// Formateo de números, tiempos y fechas. Todo en es-AR.

const NUM = new Intl.NumberFormat('es-AR');
const NUM1 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });
const DATE_LONG = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
const DATE_SHORT = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', year: '2-digit' });
const DATE_DAY = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' });
const TIME = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' });

export const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const DIAS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
export const DIAS_LARGO = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

export const num = (n) => NUM.format(Math.round(n || 0));
export const num1 = (n) => NUM1.format(n || 0);
export const pct = (n) => `${NUM1.format(n || 0)} %`;

/** Tiempo escuchado, en la unidad que se lea mejor: "2.494 h" / "18 min". */
export function dur(ms) {
  const min = (ms || 0) / 60000;
  if (min < 1) return `${Math.round((ms || 0) / 1000)} s`;
  if (min < 90) return `${num(min)} min`;
  const h = min / 60;
  if (h < 48) return `${num1(h)} h`;
  return `${num(h)} h`;
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

/** "hace 3 días", "hace 2 meses" */
export function ago(ts) {
  if (!ts) return '—';
  const days = Math.floor((Date.now() / 1000 - ts) / 86400);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 30) return `hace ${days} días`;
  const months = Math.round(days / 30.44);
  if (months < 24) return `hace ${months} ${months === 1 ? 'mes' : 'meses'}`;
  return `hace ${Math.round(days / 365.25)} años`;
}

/** Etiqueta de un bucket de la serie temporal, según granularidad. */
export function bucketLabel(iso, gran) {
  const d = new Date(`${iso}T12:00:00`);
  if (gran === 'year') return String(d.getFullYear());
  if (gran === 'month') return `${MESES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
  if (gran === 'week') return `sem. del ${d.getDate()} ${MESES[d.getMonth()]}`;
  return DATE_DAY.format(d);
}

export const hourLabel = (h) => `${String(h).padStart(2, '0')}:00`;

/** Traducciones de los códigos crudos del export de Spotify. */
export const REASON = {
  trackdone: 'Terminó sola', fwdbtn: 'Botón siguiente', backbtn: 'Botón anterior',
  clickrow: 'Clic en la lista', playbtn: 'Botón reproducir', appload: 'Al abrir la app',
  remote: 'Control remoto', endplay: 'Se detuvo', logout: 'Cerró sesión',
  trackerror: 'Error de reproducción', unknown: 'Desconocido', unexpected_exit: 'Salida inesperada',
  unexpected_exit_while_paused: 'Salió en pausa', clickside: 'Clic lateral',
  popup: 'Ventana emergente', uriopen: 'Enlace abierto', switched_to_video: 'Pasó a video',
  persisted: 'Reanudada', autoplay: 'Reproducción automática',
};
export const reason = (r) => REASON[r] || r || 'Desconocido';

const REGION = new Intl.DisplayNames(['es'], { type: 'region' });
export function country(code) {
  if (!code) return 'Desconocido';
  try { return REGION.of(code) || code; } catch { return code; }
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Las claves internas usan  como separador artista/título. */
export const keyTitle = (k) => String(k || '').split('').pop();
