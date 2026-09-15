// Vista "Historial": el registro crudo, buscable. Una fila por reproducción.

import { api } from '../api.js';
import { art, hydrate, empty } from '../ui.js';
import { num, dur, clock, esc, fdatetime, reason } from '../fmt.js';
import { t } from '../i18n.js';

const PAGE = 100;
let lastQuery = '';

const rowHtml = (p) => {
  const isEp = !!p.episode_name;
  const name = isEp ? p.episode_name : (p.track_name || t('(sin título)'));
  const sub = isEp ? p.show_name : [p.artist_name, p.album_name].filter(Boolean).join(' · ');
  const synced = p.origin === 'sync';
  const flags = [
    p.skipped ? t('saltada') : '',
    p.shuffle ? t('aleatorio') : '',
  ].filter(Boolean).join(' · ');
  return `<tr data-open="${isEp ? 'show' : 'track'}"
      data-key="${esc(isEp ? '' : p.track_key || '')}" style="cursor:${isEp ? 'default' : 'pointer'}">
    <td style="width:44px">${art('tracks', p.track_key || '', '')}</td>
    <td>
      <div style="font-weight:550;overflow:hidden;text-overflow:ellipsis;
           white-space:nowrap;max-width:34ch">${esc(name)}</div>
      <div class="mut" style="font-size:12px;overflow:hidden;text-overflow:ellipsis;
           white-space:nowrap;max-width:34ch">${esc(sub || '')}</div>
    </td>
    <td class="n mut">${synced ? `<span title="${t('Duración de la pista: el sync no informa cuánto escuchaste')}">${clock(p.ms_played)}*</span>` : clock(p.ms_played)}</td>
    <td class="mut" style="font-size:12.5px">${synced ? `<span class="pill">${t('sincronizado')}</span>` : esc(p.platform || '')}</td>
    <td class="mut" style="font-size:12.5px">${synced ? '—' : `${esc(reason(p.reason_end))}${flags ? ` · ${flags}` : ''}`}</td>
    <td class="n mut" style="font-size:12.5px">${fdatetime(p.ts)}</td>
  </tr>`;
};

export async function render(params) {
  const q = lastQuery;
  const data = await api.history({ ...params, limit: PAGE, offset: 0, q });
  let loaded = data.items.length;

  const html = `
  <div class="head">
    <h1 class="head__title">${t('Historial')}</h1>
    <p class="head__sub">${t('{n} reproducciones en {label}',
      { n: num(data.total), label: esc(params.label || '') })}${
      q ? t(' que coinciden con “{q}”', { q: esc(q) }) : ''}</p>
  </div>

  <div class="inline" style="margin-bottom:var(--s-4)">
    <input type="search" id="q" value="${esc(q)}" placeholder="${t('Buscar canción, artista, álbum o episodio')}"
      style="flex:1;min-width:220px;padding:9px var(--s-3);background:var(--surface);
             border:1px solid var(--line-2);border-radius:var(--r-sm);font-size:13.5px">
    <button type="button" class="btn btn--primary" id="doSearch">${t('Buscar')}</button>
    ${q ? `<button type="button" class="btn btn--ghost" id="clearSearch">${t('Limpiar')}</button>` : ''}
  </div>

  ${data.items.length ? `
  <div class="card" style="padding:0;overflow:hidden">
    <div class="tablewrap"><table class="tbl">
      <thead><tr>
        <th></th><th>${t('Qué sonó')}</th><th class="n">${t('Duró')}</th>
        <th>${t('Dispositivo')}</th><th>${t('Cómo terminó')}</th><th class="n">${t('Cuándo')}</th>
      </tr></thead>
      <tbody id="histBody">${data.items.map(rowHtml).join('')}</tbody>
    </table></div>
  </div>
  ${data.total > loaded ? `<div style="text-align:center;margin-top:var(--s-5)">
    <button type="button" class="btn" id="more">${t('Cargar 100 más')}</button></div>` : ''}`
  : empty(t('Sin resultados'), q
      ? t('No encontré reproducciones que coincidan con esa búsqueda en este período.')
      : t('No hay reproducciones en este período.'))}`;

  return {
    html,
    mount(root, ctx) {
      hydrate('tracks', data.items.map((i) => i.track_key).filter(Boolean), root);

      const input = root.querySelector('#q');
      const search = () => { lastQuery = input.value.trim(); ctx.rerender(); };
      root.querySelector('#doSearch')?.addEventListener('click', search);
      input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });
      root.querySelector('#clearSearch')?.addEventListener('click', () => {
        lastQuery = ''; ctx.rerender();
      });

      const more = root.querySelector('#more');
      more?.addEventListener('click', async () => {
        more.disabled = true;
        more.textContent = t('Cargando…');
        try {
          const next = await api.history({ ...params, limit: PAGE, offset: loaded, q });
          loaded += next.items.length;
          root.querySelector('#histBody').insertAdjacentHTML('beforeend',
            next.items.map(rowHtml).join(''));
          hydrate('tracks', next.items.map((i) => i.track_key).filter(Boolean), root);
          if (loaded >= data.total) more.parentElement.remove();
          else { more.disabled = false; more.textContent = t('Cargar 100 más'); }
        } catch {
          more.disabled = false;
          more.textContent = t('Reintentar');
        }
      });
    },
  };
}
