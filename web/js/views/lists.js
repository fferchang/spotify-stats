// Vistas de ranking: canciones, artistas, álbumes y podcasts.
// Comparten paginación, alternancia lista/mosaico e hidratación de carátulas.

import { api } from '../api.js';
import { rankList, tileGrid, hydrate, empty, section } from '../ui.js';
import { num, dur, esc, pct } from '../fmt.js';

const PAGE = 60;

export const SPEC = {
  temas:     { type: 'tracks',  title: 'Canciones', detail: 'track',  layout: 'list' },
  artistas:  { type: 'artists', title: 'Artistas',  detail: 'artist', layout: 'grid' },
  albumes:   { type: 'albums',  title: 'Álbumes',   detail: 'album',  layout: 'grid' },
  podcasts:  { type: 'shows',   title: 'Podcasts',  detail: 'show',   layout: 'list' },
};

const layoutPref = {};

export async function render(params, routeName) {
  const spec = SPEC[routeName];
  const sort = params.sort || 'plays';
  const layout = layoutPref[routeName] || spec.layout;

  const data = await api.top({ ...params, type: spec.type, limit: PAGE, offset: 0 });
  let loaded = data.items.length;

  const body = (items) => (layout === 'grid'
    ? tileGrid(items, spec.type, sort)
    : rankList(items, spec.type, sort, { detailKind: spec.detail }));

  const summaryLine = data.total
    ? `${num(data.total)} ${spec.title.toLowerCase()} distintos · ${num(data.grand_plays)} reproducciones · ${dur(data.grand_ms)}`
    : 'Sin datos en este período';

  const html = `
  <div class="head">
    <h1 class="head__title">${spec.title}</h1>
    <p class="head__sub">${esc(data.range.label)} · ${summaryLine}</p>
  </div>

  ${data.items.length ? `
  <div class="inline" style="margin-bottom:var(--s-4);justify-content:flex-end">
    <div class="seg" role="group" aria-label="Formato de la lista">
      <button type="button" class="seg__btn" data-layout="list"
        aria-pressed="${layout === 'list'}">Lista</button>
      <button type="button" class="seg__btn" data-layout="grid"
        aria-pressed="${layout === 'grid'}">Mosaico</button>
    </div>
  </div>` : ''}

  <div id="listBody">${body(data.items)}</div>

  ${data.total > loaded ? `<div style="text-align:center;margin-top:var(--s-5)">
    <button type="button" class="btn" id="more">Cargar más
      <span class="mut">(${num(data.total - loaded)} restantes)</span></button>
  </div>` : ''}`;

  return {
    html,
    mount(root, ctx) {
      const listBody = root.querySelector('#listBody');
      hydrate(spec.type, data.items.map((i) => i.key), root);

      root.querySelectorAll('[data-layout]').forEach((b) => {
        b.addEventListener('click', () => {
          layoutPref[routeName] = b.dataset.layout;
          ctx.rerender();
        });
      });

      const moreBtn = root.querySelector('#more');
      moreBtn?.addEventListener('click', async () => {
        moreBtn.disabled = true;
        moreBtn.textContent = 'Cargando…';
        try {
          const next = await api.top({ ...params, type: spec.type, limit: PAGE, offset: loaded });
          loaded += next.items.length;
          const frag = document.createElement('div');
          frag.innerHTML = body(next.items);
          const container = layout === 'grid'
            ? listBody.querySelector('.grid') : listBody.querySelector('.rank');
          const incoming = frag.querySelector(layout === 'grid' ? '.grid' : '.rank');
          if (container && incoming) container.append(...incoming.children);
          hydrate(spec.type, next.items.map((i) => i.key), root);

          if (loaded >= data.total) {
            moreBtn.parentElement.remove();
          } else {
            moreBtn.disabled = false;
            moreBtn.innerHTML = `Cargar más <span class="mut">(${num(data.total - loaded)} restantes)</span>`;
          }
        } catch {
          moreBtn.disabled = false;
          moreBtn.textContent = 'Reintentar';
        }
      });
    },
  };
}
