// Vista "Historial": el registro crudo, buscable. Una fila por reproducción.

import { api } from '../api.js';
import { art, hydrate, empty } from '../ui.js';
import { num, dur, clock, esc, fdatetime, reason } from '../fmt.js';

const PAGE = 100;
let lastQuery = '';

const rowHtml = (p) => {
  const isEp = !!p.episode_name;
  const name = isEp ? p.episode_name : (p.track_name || '(sin título)');
  const sub = isEp ? p.show_name : [p.artist_name, p.album_name].filter(Boolean).join(' · ');
  const flags = [
    p.skipped ? 'saltada' : '',
    p.shuffle ? 'aleatorio' : '',
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
    <td class="n mut">${clock(p.ms_played)}</td>
    <td class="mut" style="font-size:12.5px">${esc(p.platform || '')}</td>
    <td class="mut" style="font-size:12.5px">${esc(reason(p.reason_end))}${flags ? ` · ${flags}` : ''}</td>
    <td class="n mut" style="font-size:12.5px">${fdatetime(p.ts)}</td>
  </tr>`;
};

export async function render(params) {
  const q = lastQuery;
  const data = await api.history({ ...params, limit: PAGE, offset: 0, q });
  let loaded = data.items.length;

  const html = `
  <div class="head">
    <h1 class="head__title">Historial</h1>
    <p class="head__sub">${num(data.total)} reproducciones en ${esc(params.label || 'el período')}${
      q ? ` que coinciden con “${esc(q)}”` : ''}</p>
  </div>

  <div class="inline" style="margin-bottom:var(--s-4)">
    <input type="search" id="q" value="${esc(q)}" placeholder="Buscar canción, artista, álbum o episodio"
      style="flex:1;min-width:220px;padding:9px var(--s-3);background:var(--surface);
             border:1px solid var(--line-2);border-radius:var(--r-sm);font-size:13.5px">
    <button type="button" class="btn btn--primary" id="doSearch">Buscar</button>
    ${q ? '<button type="button" class="btn btn--ghost" id="clearSearch">Limpiar</button>' : ''}
  </div>

  ${data.items.length ? `
  <div class="card" style="padding:0;overflow:hidden">
    <div class="tablewrap"><table class="tbl">
      <thead><tr>
        <th></th><th>Qué sonó</th><th class="n">Duró</th>
        <th>Dispositivo</th><th>Cómo terminó</th><th class="n">Cuándo</th>
      </tr></thead>
      <tbody id="histBody">${data.items.map(rowHtml).join('')}</tbody>
    </table></div>
  </div>
  ${data.total > loaded ? `<div style="text-align:center;margin-top:var(--s-5)">
    <button type="button" class="btn" id="more">Cargar 100 más</button></div>` : ''}`
  : empty('Sin resultados', q
      ? 'No encontré reproducciones que coincidan con esa búsqueda en este período.'
      : 'No hay reproducciones en este período.')}`;

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
        more.textContent = 'Cargando…';
        try {
          const next = await api.history({ ...params, limit: PAGE, offset: loaded, q });
          loaded += next.items.length;
          root.querySelector('#histBody').insertAdjacentHTML('beforeend',
            next.items.map(rowHtml).join(''));
          hydrate('tracks', next.items.map((i) => i.track_key).filter(Boolean), root);
          if (loaded >= data.total) more.parentElement.remove();
          else { more.disabled = false; more.textContent = 'Cargar 100 más'; }
        } catch {
          more.disabled = false;
          more.textContent = 'Reintentar';
        }
      });
    },
  };
}
