// Vistas de ranking: canciones, artistas, álbumes y podcasts.
// Comparten paginación, alternancia lista/mosaico e hidratación de carátulas.

import { api } from '../api.js';
import { rankList, tileGrid, hydrate } from '../ui.js';
import { num, dur, esc } from '../fmt.js';
import { t } from '../i18n.js';

const PAGE = 60;

export const SPEC = {
  temas:    { type: 'tracks',  title: 'Canciones', plural: 'canciones', detail: 'track',  layout: 'list' },
  artistas: { type: 'artists', title: 'Artistas',  plural: 'artistas',  detail: 'artist', layout: 'grid' },
  albumes:  { type: 'albums',  title: 'Álbumes',   plural: 'álbumes',   detail: 'album',  layout: 'grid' },
  podcasts: { type: 'shows',   title: 'Podcasts',  plural: 'podcasts',  detail: 'show',   layout: 'list' },
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
    ? t('{n} {what} distintos · {plays} reproducciones · {time}', {
        n: num(data.total), what: t(spec.plural),
        plays: num(data.grand_plays), time: dur(data.grand_ms),
      })
    : t('Sin datos en este período');

  const html = `
  <div class="head">
    <h1 class="head__title">${t(spec.title)}</h1>
    <p class="head__sub">${esc(t(data.range.label))} · ${summaryLine}</p>
  </div>

  ${data.items.length ? `
  <div class="inline" style="margin-bottom:var(--s-4);justify-content:flex-end">
    <div class="seg" role="group" aria-label="${t('Formato de la lista')}">
      <button type="button" class="seg__btn" data-layout="list"
        aria-pressed="${layout === 'list'}">${t('Lista')}</button>
      <button type="button" class="seg__btn" data-layout="grid"
        aria-pressed="${layout === 'grid'}">${t('Mosaico')}</button>
    </div>
  </div>` : ''}

  <div id="listBody">${body(data.items)}</div>

  ${data.total > loaded ? `<div style="text-align:center;margin-top:var(--s-5)">
    <button type="button" class="btn" id="more">${t('Cargar más')}
      <span class="mut">${t('({n} restantes)', { n: num(data.total - loaded) })}</span></button>
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
        moreBtn.textContent = t('Cargando…');
        try {
          const next = await api.top({ ...params, type: spec.type, limit: PAGE, offset: loaded });
          loaded += next.items.length;
          const frag = document.createElement('div');
          frag.innerHTML = body(next.items);
          const container = listBody.querySelector(layout === 'grid' ? '.grid' : '.rank');
          const incoming = frag.querySelector(layout === 'grid' ? '.grid' : '.rank');
          if (container && incoming) container.append(...incoming.children);
          hydrate(spec.type, next.items.map((i) => i.key), root);

          if (loaded >= data.total) {
            moreBtn.parentElement.remove();
          } else {
            moreBtn.disabled = false;
            moreBtn.innerHTML = `${t('Cargar más')} <span class="mut">${
              t('({n} restantes)', { n: num(data.total - loaded) })}</span>`;
          }
        } catch {
          moreBtn.disabled = false;
          moreBtn.textContent = t('Reintentar');
        }
      });
    },
  };
}
