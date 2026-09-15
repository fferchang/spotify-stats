// Vista "Ajustes": idioma, importar el historial, conectar Spotify y ajustar el cálculo.

import { api } from '../api.js';
import { section, alert, toast, kpi } from '../ui.js';
import { num, esc, fshort } from '../fmt.js';
import { t, LANGS } from '../i18n.js';

const HIST_RE = /(streaming[_ ]?history.*\.json|endsong.*\.json|\.zip)$/i;

/* Recorre una carpeta arrastrada al navegador. */
async function walkEntry(entry, out, depth = 0) {
  if (!entry || depth > 6) return;
  if (entry.isFile) {
    const file = await new Promise((res) => entry.file(res, () => res(null)));
    if (file && HIST_RE.test(file.name)) out.push(file);
    return;
  }
  if (entry.isDirectory) {
    const reader = entry.createReader();
    let batch;
    do {
      batch = await new Promise((res) => reader.readEntries(res, () => res([])));
      for (const e of batch) await walkEntry(e, out, depth + 1);
    } while (batch.length);
  }
}

export async function render(_params, _route, boot) {
  const cfg = boot.config || {};
  const sp = boot.spotify || {};
  const sync = boot.sync || {};
  const redirect = `${location.origin}/auth/callback`;
  const authParams = new URLSearchParams(location.hash.split('?')[1] || '');

  const offsets = [];
  for (let h = -12; h <= 14; h++) offsets.push(h);

  const dashLink = '<a href="https://developer.spotify.com/dashboard" target="_blank"'
    + ' rel="noopener noreferrer" style="color:var(--accent)">developer.spotify.com/dashboard</a>';

  const html = `
  <div class="head">
    <h1 class="head__title">${t('Ajustes')}</h1>
    <p class="head__sub">${t('Tus datos, tus credenciales, tu máquina.')}</p>
  </div>

  ${authParams.get('auth') === 'ok' ? alert('ok', `<b>${t('Guardado.')}</b>`) : ''}
  ${authParams.get('auth_error')
    ? alert('bad', `<b>${t('No pude conectar.')}</b> ${esc(authParams.get('auth_error'))}`) : ''}

  ${section(t('Idioma'), `
    <div class="form"><div class="field" style="max-width:260px">
      <select id="lang">${Object.entries(LANGS).map(([code, name]) =>
        `<option value="${code}" ${(cfg.lang || 'es') === code ? 'selected' : ''}>${name}</option>`).join('')}</select>
    </div></div>`)}

  ${section(t('Tu historial'), `
    <div class="drop" id="drop" tabindex="0" role="button"
         aria-label="${t('Elegir archivos del historial')}">
      <div class="drop__title">${t('Arrastrá acá la carpeta del export')}</div>
      <p class="drop__hint">
        <code>Streaming_History_*.json</code> · <code>StreamingHistory*.json</code> · <code>.zip</code>
      </p>
      <div class="inline" style="justify-content:center;margin-top:var(--s-4)">
        <button type="button" class="btn btn--primary" id="pickFiles">${t('Elegir archivos')}</button>
        <button type="button" class="btn" id="pickDir">${t('Elegir carpeta')}</button>
      </div>
      <input type="file" id="fileInput" multiple accept=".json,.zip" hidden>
      <input type="file" id="dirInput" webkitdirectory hidden>
    </div>

    <div id="importProgress" hidden style="margin-top:var(--s-4)">
      <div class="bar"><i id="impBar" style="width:0%"></i></div>
      <p class="sect__note" id="impNote" style="margin-top:var(--s-2)"></p>
    </div>

    <details style="margin-top:var(--s-4)">
      <summary style="cursor:pointer;color:var(--ink-3);font-size:13px">
        ${t('Prefiero escribir la ruta de la carpeta')}
      </summary>
      <div class="inline" style="margin-top:var(--s-3)">
        <input type="text" id="pathInput" placeholder="C:\\Users\\…\\Spotify Extended Streaming History"
          style="flex:1;min-width:260px;padding:8px var(--s-3);background:var(--plane);
                 border:1px solid var(--line-2);border-radius:var(--r-sm);font-size:13px">
        <button type="button" class="btn btn--primary" id="importPath">${t('Importar')}</button>
      </div>
      <p class="sect__note" style="margin-top:var(--s-2)">
        ${t('El servidor lee la carpeta directamente del disco. Más rápido para exports grandes.')}
      </p>
    </details>

    ${boot.has_data ? `
    <div class="kpis" style="margin-top:var(--s-5)">
      ${kpi(t('Reproducciones'), num(boot.totals.plays), '',
        t('desde {date}', { date: fshort(boot.first_ts) }))}
      ${kpi(t('Artistas'), num(boot.totals.artists), '',
        t('{n} álbumes', { n: num(boot.totals.albums) }))}
      ${kpi(t('Canciones'), num(boot.totals.tracks), '',
        t('{n} escuchas de podcast', { n: num(boot.totals.episodes) }))}
      ${kpi(t('Archivos'), num(boot.files.length), '', t('importados hasta ahora'))}
    </div>
    ${boot.files.length ? `<details style="margin-top:var(--s-4)">
      <summary style="cursor:pointer;color:var(--ink-3);font-size:13px">
        ${t('Ver los {n} archivos importados', { n: boot.files.length })}</summary>
      <div class="tablewrap" style="margin-top:var(--s-3)"><table class="tbl">
        <thead><tr><th>${t('Archivo')}</th><th class="n">${t('Registros')}</th>
          <th class="n">${t('Nuevos')}</th></tr></thead>
        <tbody>${boot.files.map((f) => `<tr><td>${esc(f.name)}</td>
          <td class="n">${num(f.rows)}</td><td class="n">${num(f.added)}</td></tr>`).join('')}</tbody>
      </table></div>
    </details>` : ''}` : ''}
  `)}

  ${section(t('Portadas'), `
    ${sp.configured
      ? alert('ok', `<b>${t('Spotify conectado')}</b> (${
          sp.mode === 'pkce' ? t('sesión de usuario') : 'client credentials'}). ${
          t('Las portadas se traen solas.')}`)
      : alert('warn', `<b>${t('Sin conectar.')}</b> ${
          t('El historial no trae portadas: hay que pedírselas a la Web API. '
            + 'Es gratis y lleva dos minutos.')}`)}

    <ol class="steps" style="margin:var(--s-4) 0">
      <li>${t('Entrá a {link} y creá una app (el nombre da igual).', { link: dashLink })}</li>
      <li>${t('En <b>Redirect URI</b> pegá <code>{uri}</code> y guardá. '
        + 'Hace falta sólo si vas a usar el modo con sesión.', { uri: esc(redirect) })}</li>
      <li>${t('Copiá el <b>Client ID</b> y el <b>Client Secret</b> acá abajo.')}</li>
    </ol>

    <div class="form">
      <div class="field">
        <label class="field__label" for="mode">${t('Modo de conexión')}</label>
        <select id="mode">
          <option value="client_credentials" ${sp.mode !== 'pkce' ? 'selected' : ''}>${
            t('Client Credentials — sólo ID y Secret, sin login')}</option>
          <option value="pkce" ${sp.mode === 'pkce' ? 'selected' : ''}>${
            t('Sesión de Spotify — iniciás sesión con tu cuenta')}</option>
        </select>
        <p class="field__hint">${
          t('Hace falta para la sincronización en vivo. Si no, con el primero alcanza.')}</p>
      </div>
      <div class="field">
        <label class="field__label" for="cid">Client ID</label>
        <input type="text" id="cid" autocomplete="off" spellcheck="false"
          placeholder="${sp.has_client_id
            ? t('ya guardado — escribí para reemplazarlo') : t('32 caracteres')}">
      </div>
      <div class="field" id="secretField" ${sp.mode === 'pkce' ? 'hidden' : ''}>
        <label class="field__label" for="csec">Client Secret</label>
        <input type="password" id="csec" autocomplete="off"
          placeholder="${sp.has_secret
            ? t('ya guardado — escribí para reemplazarlo') : t('32 caracteres')}">
        <p class="field__hint">${t('Queda sólo en <code>data/vinilo.db</code>, en tu disco.')}</p>
      </div>
      <div class="inline">
        <button type="button" class="btn btn--primary" id="saveCreds">${t('Guardar')}</button>
        <button type="button" class="btn" id="testCreds">${t('Probar conexión')}</button>
        <a class="btn" id="loginBtn" href="/auth/login"
           ${sp.mode === 'pkce' ? '' : 'hidden'}>${t('Iniciar sesión con Spotify')}</a>
        ${sp.logged_in ? `<button type="button" class="btn btn--ghost" id="logoutBtn">${
          t('Cerrar sesión')}</button>` : ''}
      </div>
      <div id="credResult"></div>
    </div>

    <div class="card card--pad" style="margin-top:var(--s-5)">
      <div class="inline" style="justify-content:space-between">
        <div>
          <div class="sect__title" style="font-size:15px">${t('Enriquecido')}</div>
          <p class="sect__note" id="enrichNote">—</p>
        </div>
        <div class="inline">
          <button type="button" class="btn btn--primary" id="enrichStart">${t('Traer todo')}</button>
          <button type="button" class="btn" id="enrichStop" hidden>${t('Pausar')}</button>
        </div>
      </div>
      <div class="bar" style="margin-top:var(--s-3)"><i id="enrichBar" style="width:0%"></i></div>
      <p class="sect__note" style="margin-top:var(--s-3)">
        ${t('Desde febrero de 2026 Spotify eliminó los endpoints en lote, así que cada '
          + 'canción y cada artista son una petición. Se pide en orden de más escuchado '
          + 'a menos, y queda cacheado para siempre.')}
      </p>
    </div>
  `)}

  ${section(t('Sincronización en vivo'), `
    ${sync.can_sync
      ? alert('ok', `<b>${t('Activa.')}</b> ${
          t('El historial se mantiene solo: Vinilo consulta tus últimas reproducciones '
            + 'cada {n} minutos y las agrega.',
            { n: Math.round((sync.interval || 1800) / 60) })}`)
      : sp.mode !== 'pkce'
        ? alert('warn', `<b>${t('Necesita iniciar sesión.')}</b> ${
            t('El sync lee <i>tus</i> reproducciones, y eso no se puede con Client '
              + 'Credentials. Cambiá el modo de conexión a «Sesión de Spotify» ahí arriba '
              + 'e iniciá sesión.')}`)
        : sync.missing_scopes?.length
          ? alert('warn', `<b>${t('Falta autorizar el permiso de lectura.')}</b> ${
              t('Volvé a iniciar sesión para conceder: {scopes}.',
                { scopes: `<code>${sync.missing_scopes.join('</code>, <code>')}</code>` })}`)
          : alert('warn', `<b>${t('Necesita iniciar sesión con tu cuenta de Spotify.')}</b>`)}

    <div class="card card--pad" style="margin-top:var(--s-4)">
      <div class="inline" style="justify-content:space-between;align-items:flex-start">
        <div>
          <div class="sect__title" style="font-size:15px">${t('Estado')}</div>
          <p class="sect__note" id="syncNote">—</p>
        </div>
        <div class="inline">
          <button type="button" class="btn" id="syncNow"
            ${sync.can_sync ? '' : 'disabled'}>${t('Sincronizar ahora')}</button>
          <button type="button" class="btn ${sync.enabled ? '' : 'btn--primary'}" id="syncToggle"
            ${sync.can_sync ? '' : 'disabled'}>${
              sync.enabled ? t('Desactivar') : t('Activar')}</button>
        </div>
      </div>
      <div class="field" style="margin-top:var(--s-4);max-width:260px">
        <label class="field__label" for="syncInterval">${t('Cada cuánto consultar')}</label>
        <select id="syncInterval">
          ${[[300, 'cada 5 minutos'], [900, 'cada 15 minutos'], [1800, 'cada 30 minutos'],
             [3600, 'cada hora'], [10800, 'cada 3 horas']].map(([v, l]) =>
            `<option value="${v}" ${Number(cfg.sync_interval) === v ? 'selected' : ''}>${
              t(l)}</option>`).join('')}
        </select>
        <p class="field__hint">${t('El buffer de Spotify guarda 50 reproducciones. Media hora '
          + 'deja margen de sobra salvo que escuches sin parar.')}</p>
      </div>
    </div>

    <details style="margin-top:var(--s-4)">
      <summary style="cursor:pointer;color:var(--ink-3);font-size:13px">
        ${t('Qué trae el sync y qué no')}</summary>
      <div class="tablewrap" style="margin-top:var(--s-3)"><table class="tbl">
        <thead><tr><th>${t('Dato')}</th><th>${t('Export')}</th>
          <th>${t('Sync en vivo')}</th></tr></thead>
        <tbody>
          <tr><td>${t('Qué sonó y cuándo')}</td><td>${t('sí')}</td><td>${t('sí')}</td></tr>
          <tr><td>${t('Milisegundos escuchados')}</td><td>${t('reales')}</td>
            <td class="mut">${t('se asume la pista entera')}</td></tr>
          <tr><td>${t('Saltada / aleatorio')}</td><td>${t('sí')}</td>
            <td class="mut">${t('no disponible')}</td></tr>
          <tr><td>${t('Dispositivo y país')}</td><td>${t('sí')}</td>
            <td class="mut">${t('no disponible')}</td></tr>
          <tr><td>${t('Podcasts')}</td><td>${t('sí')}</td>
            <td class="mut">${t('la API los excluye')}</td></tr>
        </tbody>
      </table></div>
      <p class="sect__note" style="margin-top:var(--s-3)">
        ${t('Por eso las tasas de salteo y aleatorio se calculan sólo sobre las filas que '
          + 'traen ese dato, y en el Historial las sincronizadas van marcadas. Si más '
          + 'adelante importás un export que cubre el mismo tramo, el export las reemplaza: '
          + 'es la versión buena de los mismos hechos.')}
      </p>
    </details>

    ${sync.can_sync ? `
    <div class="card card--pad" style="margin-top:var(--s-4)">
      <div class="inline" style="justify-content:space-between">
        <div>
          <div class="sect__title" style="font-size:15px">${t('Según Spotify')}</div>
          <p class="sect__note">${t('Su ranking oficial, para contrastar con el calculado acá.')}</p>
        </div>
        <button type="button" class="btn" id="loadTops">${t('Traer')}</button>
      </div>
      <div id="topsBox" style="margin-top:var(--s-4)"></div>
    </div>` : ''}
  `)}

  ${section(t('Cómo se cuentan las cosas'), `
    <div class="form">
      <div class="field">
        <label class="field__label" for="minms">${
          t('Duración mínima para contar una reproducción')}</label>
        <select id="minms">
          ${[[0, 'Contar todo, incluso 2 segundos'], [5000, '5 segundos'],
             [30000, '30 segundos (lo que usa Spotify)'], [60000, '1 minuto']].map(([v, l]) =>
            `<option value="${v}" ${cfg.min_ms === v ? 'selected' : ''}>${t(l)}</option>`).join('')}
        </select>
        <p class="field__hint">${t('Con 30 s no se cuentan los saltos, que en tu historial '
          + 'son muchos. Bajalo a 0 si querés ver el total crudo.')}</p>
      </div>
      <div class="field">
        <label class="field__label" for="tz">${t('Zona horaria')}</label>
        <select id="tz">${offsets.map((h) => `<option value="${h * 3600}"
          ${cfg.tz_offset === h * 3600 ? 'selected' : ''}>UTC${
            h >= 0 ? '+' : ''}${h}</option>`).join('')}</select>
        <p class="field__hint">${t('Las marcas del export vienen en UTC; sin esto tu hora '
          + 'pico aparecería corrida.')}</p>
      </div>
      <div class="field">
        <label class="field__label" for="market">${t('País para los podcasts')}</label>
        <input type="text" id="market" value="${esc(cfg.market || 'AR')}" maxlength="2"
          style="max-width:90px;text-transform:uppercase">
        <p class="field__hint">${t('La API pide un mercado para devolver episodios.')}</p>
      </div>
      <div><button type="button" class="btn btn--primary" id="savePrefs">${
        t('Guardar preferencias')}</button></div>
    </div>
  `)}

  ${section(t('Privacidad'), `
    <div class="card card--pad">
      <p style="font-size:13.5px;color:var(--ink-2);max-width:68ch">
        ${t('Tu export incluye la dirección IP y el user-agent de cada reproducción. '
          + '<b>Vinilo los descarta al importar</b>: nunca llegan a la base de datos. '
          + 'Del resto se guarda lo que hace falta para las estadísticas —qué sonó, '
          + 'cuándo, cuánto, en qué dispositivo y desde qué país—.')}
      </p>
      <p style="font-size:13.5px;color:var(--ink-2);margin-top:var(--s-3);max-width:68ch">
        ${t('Todo vive en <code>data/vinilo.db</code>, en esta máquina. Lo único que sale '
          + 'a internet son las consultas a la API de Spotify para pedir portadas, y sólo '
          + 'llevan identificadores públicos de canciones y artistas.')}
      </p>
    </div>
  `)}

  ${boot.has_data ? section(t('Zona peligrosa'), `
    <div class="card card--pad">
      <p style="font-size:13.5px;color:var(--ink-2);margin-bottom:var(--s-3)">
        ${t('Borra las {n} reproducciones importadas. Las portadas ya descargadas se '
          + 'conservan, así que reimportar es rápido.', { n: num(boot.totals.plays) })}
      </p>
      <button type="button" class="btn btn--danger" id="resetBtn">${
        t('Borrar el historial importado')}</button>
    </div>
  `) : ''}`;

  return {
    html,
    mount(root, ctx) {
      /* ---------------------------- idioma ------------------------------ */
      root.querySelector('#lang').addEventListener('change', async (e) => {
        await api.saveConfig({ lang: e.target.value });
        ctx.reload();   // boot() aplica el idioma y vuelve a dibujar todo
      });

      /* ---------------------------- importar ---------------------------- */
      const drop = root.querySelector('#drop');
      const prog = root.querySelector('#importProgress');
      const bar = root.querySelector('#impBar');
      const note = root.querySelector('#impNote');

      async function sendFiles(files) {
        const list = [...files].filter((f) => HIST_RE.test(f.name));
        if (!list.length) {
          toast(t('Esos archivos no parecen del historial de Spotify.'), 'bad');
          return;
        }
        prog.hidden = false;
        let added = 0;
        let failed = 0;
        for (let i = 0; i < list.length; i++) {
          const f = list[i];
          note.textContent = t('Subiendo {name} ({i} de {n})…',
            { name: f.name, i: i + 1, n: list.length });
          bar.style.width = `${(i / list.length) * 100}%`;
          try {
            const res = await api.importUpload(f.name, await f.arrayBuffer(), i === list.length - 1);
            added += res.added || 0;
            (res.errors || []).forEach((err) => toast(err, 'bad'));
          } catch (err) {
            failed++;
            toast(`${f.name}: ${err.message}`, 'bad');
          }
        }
        bar.style.width = '100%';
        note.textContent = t('Listo: {n} reproducciones nuevas de {files} archivos.',
          { n: num(added), files: list.length });
        if (failed < list.length) {
          toast(t('Importadas {n} reproducciones.', { n: num(added) }), 'ok');
          setTimeout(() => ctx.reload(), 700);
        }
      }

      root.querySelector('#pickFiles').addEventListener('click', (e) => {
        e.stopPropagation();
        root.querySelector('#fileInput').click();
      });
      root.querySelector('#pickDir').addEventListener('click', (e) => {
        e.stopPropagation();
        root.querySelector('#dirInput').click();
      });
      root.querySelector('#fileInput').addEventListener('change', (e) => sendFiles(e.target.files));
      root.querySelector('#dirInput').addEventListener('change', (e) => sendFiles(e.target.files));
      drop.addEventListener('click', () => root.querySelector('#fileInput').click());
      drop.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          root.querySelector('#fileInput').click();
        }
      });
      ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => {
        e.preventDefault();
        drop.classList.add('is-over');
      }));
      ['dragleave', 'drop'].forEach((ev) =>
        drop.addEventListener(ev, () => drop.classList.remove('is-over')));
      drop.addEventListener('drop', async (e) => {
        e.preventDefault();
        const items = [...(e.dataTransfer.items || [])];
        const entries = items.map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
        if (entries.some((en) => en.isDirectory)) {
          const out = [];
          for (const en of entries) await walkEntry(en, out);
          sendFiles(out);
          return;
        }
        sendFiles(e.dataTransfer.files);
      });

      root.querySelector('#importPath')?.addEventListener('click', async (e) => {
        const path = root.querySelector('#pathInput').value.trim();
        if (!path) return;
        e.target.disabled = true;
        e.target.textContent = t('Importando…');
        try {
          const res = await api.importPath(path);
          (res.errors || []).forEach((msg) => toast(msg, 'bad'));
          if (res.added || res.files) {
            toast(t('Importadas {n} reproducciones de {files} archivos.',
              { n: num(res.added), files: res.files }), 'ok');
            setTimeout(() => ctx.reload(), 700);
          }
        } catch (err) {
          toast(err.message, 'bad');
        } finally {
          e.target.disabled = false;
          e.target.textContent = t('Importar');
        }
      });

      /* ---------------------------- Spotify ----------------------------- */
      const modeSel = root.querySelector('#mode');
      modeSel.addEventListener('change', () => {
        root.querySelector('#secretField').hidden = modeSel.value === 'pkce';
        root.querySelector('#loginBtn').hidden = modeSel.value !== 'pkce';
      });

      root.querySelector('#saveCreds').addEventListener('click', async (e) => {
        const patch = { auth_mode: modeSel.value };
        const cid = root.querySelector('#cid').value.trim();
        const csec = root.querySelector('#csec').value.trim();
        if (cid) patch.client_id = cid;
        if (csec) patch.client_secret = csec;
        e.target.disabled = true;
        try {
          await api.saveConfig(patch);
          toast(t('Credenciales guardadas.'), 'ok');
          ctx.reload();
        } catch (err) {
          toast(err.message, 'bad');
        } finally {
          e.target.disabled = false;
        }
      });

      root.querySelector('#testCreds').addEventListener('click', async (e) => {
        const out = root.querySelector('#credResult');
        e.target.disabled = true;
        out.innerHTML = `<p class="mut">${t('Probando…')}</p>`;
        try {
          const r = await api.spotifyTest();
          out.innerHTML = alert(r.ok ? 'ok' : 'bad',
            r.ok ? `<b>${t('Funciona.')}</b> ${esc(r.detail)}`
                 : `<b>${t('No pude conectar.')}</b> ${esc(r.detail)}`);
          if (r.ok) api.enrichStart(true).catch(() => {});
        } catch (err) {
          out.innerHTML = alert('bad', esc(err.message));
        } finally {
          e.target.disabled = false;
        }
      });

      root.querySelector('#logoutBtn')?.addEventListener('click', async () => {
        await api.spotifyLogout();
        toast(t('Sesión cerrada.'));
        ctx.reload();
      });

      /* -------------------------- enriquecido --------------------------- */
      const eNote = root.querySelector('#enrichNote');
      const eBar = root.querySelector('#enrichBar');
      const eStart = root.querySelector('#enrichStart');
      const eStop = root.querySelector('#enrichStop');

      const paintEnrich = (st) => {
        const c = st.counts || {};
        const done = (c.tracks_done || 0) + (c.artists_done || 0);
        const total = (c.tracks_total || 0) + (c.artists_total || 0);
        eBar.style.width = `${total ? (done / total) * 100 : 0}%`;
        eStop.hidden = !st.running;
        eStart.disabled = st.running;
        eStart.textContent = st.running ? t('Trayendo…') : t('Traer todo');
        eNote.textContent = t('{a}/{b} canciones · {c}/{d} artistas · {e}/{f} podcasts', {
          a: num(c.tracks_done || 0), b: num(c.tracks_total || 0),
          c: num(c.artists_done || 0), d: num(c.artists_total || 0),
          e: num(c.shows_done || 0), f: num(c.shows_total || 0),
        })
          + (st.eta_s ? t(' · faltan ~{n} min', { n: Math.ceil(st.eta_s / 60) }) : '')
          + (st.cooldown ? t(' · Spotify pidió esperar {n} s', { n: st.cooldown }) : '');
      };

      const tickEnrich = async () => {
        try { paintEnrich(await api.enrichStatus()); } catch { /* servidor caído */ }
      };
      tickEnrich();
      const enrichPoll = setInterval(tickEnrich, 2000);
      ctx.onLeave(() => clearInterval(enrichPoll));

      eStart.addEventListener('click', async () => {
        const r = await api.enrichStart(true);
        if (!r.ok) toast(t('Primero cargá y probá las credenciales.'), 'bad');
        tickEnrich();
      });
      eStop.addEventListener('click', async () => { await api.enrichStop(); tickEnrich(); });

      /* ---------------------------- sync -------------------------------- */
      const syncNote = root.querySelector('#syncNote');
      const syncToggle = root.querySelector('#syncToggle');
      const syncNowBtn = root.querySelector('#syncNow');

      const paintSync = (st) => {
        if (!syncNote) return;
        const bits = [st.enabled && st.running ? t('Activa')
          : st.enabled ? t('Activándose…') : t('Desactivada')];
        if (st.synced_rows) {
          bits.push(t('{n} reproducciones traídas por sync', { n: num(st.synced_rows) }));
        }
        if (st.last_run) {
          bits.push(t('última consulta {t}',
            { t: new Date(st.last_run * 1000).toLocaleTimeString() }));
        }
        if (st.last_added) bits.push(t('+{n} en la última', { n: num(st.last_added) }));
        if (st.next_run && st.running) {
          bits.push(t('próxima en {n} min',
            { n: Math.max(0, Math.round((st.next_run - Date.now() / 1000) / 60)) }));
        }
        if (st.last_error) bits.push(t('error: {msg}', { msg: st.last_error }));
        syncNote.textContent = bits.join(' · ');
        if (syncToggle) {
          syncToggle.textContent = st.enabled ? t('Desactivar') : t('Activar');
          syncToggle.classList.toggle('btn--primary', !st.enabled);
        }
      };

      if (syncNote) {
        const tickSync = async () => {
          try { paintSync(await api.syncStatus()); } catch { /* servidor caído */ }
        };
        tickSync();
        const syncPoll = setInterval(tickSync, 5000);
        ctx.onLeave(() => clearInterval(syncPoll));

        syncToggle?.addEventListener('click', async () => {
          syncToggle.disabled = true;
          try {
            const st = await api.syncStatus();
            const res = st.enabled ? await api.syncStop() : await api.syncStart();
            if (res.ok === false) toast(res.reason, 'bad');
            else {
              toast(st.enabled ? t('Sincronización desactivada.')
                               : t('Sincronización activada.'), 'ok');
            }
            paintSync(res.state || await api.syncStatus());
          } catch (err) {
            toast(err.message, 'bad');
          } finally {
            syncToggle.disabled = false;
          }
        });

        syncNowBtn?.addEventListener('click', async () => {
          syncNowBtn.disabled = true;
          syncNowBtn.textContent = t('Consultando…');
          try {
            const r = await api.syncNow();
            if (r.error) toast(r.error, 'bad');
            else if (r.added) {
              toast(t('{n} reproducciones nuevas.', { n: num(r.added) }), 'ok');
              ctx.reload();
            } else toast(t('Ya estabas al día: nada nuevo.'), 'ok');
            paintSync(r.state || await api.syncStatus());
          } catch (err) {
            toast(err.message, 'bad');
          } finally {
            syncNowBtn.disabled = false;
            syncNowBtn.textContent = t('Sincronizar ahora');
          }
        });

        root.querySelector('#syncInterval')?.addEventListener('change', async (e) => {
          await api.saveConfig({ sync_interval: Number(e.target.value) });
          toast(`${t('Guardado.')} ${t('Se aplica en la próxima vuelta.')}`, 'ok');
        });
      }

      root.querySelector('#loadTops')?.addEventListener('click', async (e) => {
        const box = root.querySelector('#topsBox');
        e.target.disabled = true;
        box.innerHTML = `<p class="mut">${t('Consultando a Spotify…')}</p>`;
        try {
          const tops = await api.spotifyTops(5);
          if (tops.error) {
            box.innerHTML = alert('bad', esc(tops.error));
            return;
          }
          const LABEL = { short_term: '4 semanas', medium_term: '6 meses', long_term: '1 año' };
          box.innerHTML = `<div class="cols-3">${Object.entries(tops.ranges).map(([k, v]) => `
            <div>
              <div class="kpi__label">${t('Artistas')} · ${t(LABEL[k] || k)}</div>
              <ol style="margin-top:var(--s-2);font-size:13px;line-height:1.7">
                ${v.artists.map((a, i) =>
                  `<li><span class="mut">${i + 1}.</span> ${esc(a.name)}</li>`).join('')}
              </ol>
              <div class="kpi__label" style="margin-top:var(--s-3)">${t('Canciones')}</div>
              <ol style="margin-top:var(--s-2);font-size:13px;line-height:1.7">
                ${v.tracks.map((a, i) => `<li><span class="mut">${i + 1}.</span> ${esc(a.name)}
                  <span class="mut">${esc(a.artist || '')}</span></li>`).join('')}
              </ol>
            </div>`).join('')}</div>
            <p class="sect__note" style="margin-top:var(--s-4)">${
              t('Spotify no publica cómo pondera estos rankings, así que no tienen por qué '
                + 'coincidir clavado con los de acá. Además no traen ni fechas ni cantidad de '
                + 'reproducciones: son sólo listas ordenadas.')}</p>`;
        } catch (err) {
          box.innerHTML = alert('bad', esc(err.message));
        } finally {
          e.target.disabled = false;
        }
      });

      /* -------------------------- preferencias -------------------------- */
      root.querySelector('#savePrefs').addEventListener('click', async (e) => {
        e.target.disabled = true;
        try {
          await api.saveConfig({
            min_ms: Number(root.querySelector('#minms').value),
            tz_offset: Number(root.querySelector('#tz').value),
            market: root.querySelector('#market').value.trim().toUpperCase() || 'AR',
          });
          toast(t('Preferencias guardadas.'), 'ok');
          ctx.reload();
        } catch (err) {
          toast(err.message, 'bad');
        } finally {
          e.target.disabled = false;
        }
      });

      /* ------------------------------ reset ----------------------------- */
      root.querySelector('#resetBtn')?.addEventListener('click', async (e) => {
        if (e.target.dataset.armed !== '1') {
          e.target.dataset.armed = '1';
          e.target.textContent = t('Confirmá: esto borra todo');
          setTimeout(() => {
            if (!e.target.isConnected) return;
            e.target.dataset.armed = '0';
            e.target.textContent = t('Borrar el historial importado');
          }, 5000);
          return;
        }
        await api.reset();
        toast(t('Historial borrado.'));
        ctx.reload();
      });
    },
  };
}
