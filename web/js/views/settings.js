// Vista "Ajustes": importar el historial, conectar Spotify y ajustar el cálculo.

import { api } from '../api.js';
import { section, alert, toast, kpi, empty } from '../ui.js';
import { num, dur, esc, fshort, fdate } from '../fmt.js';

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
  const redirect = `${location.origin}/auth/callback`;
  const authParams = new URLSearchParams(location.hash.split('?')[1] || '');

  const offsets = [];
  for (let h = -12; h <= 14; h++) offsets.push(h);

  const html = `
  <div class="head">
    <h1 class="head__title">Ajustes</h1>
    <p class="head__sub">Tus datos, tus credenciales, tu máquina.</p>
  </div>

  ${authParams.get('auth') === 'ok' ? alert('ok', '<b>Listo.</b> Sesión de Spotify iniciada.') : ''}
  ${authParams.get('auth_error') ? alert('bad', `<b>No se pudo autorizar.</b> ${esc(authParams.get('auth_error'))}`) : ''}

  ${section('Tu historial', `
    <div class="drop" id="drop" tabindex="0" role="button"
         aria-label="Elegir archivos del historial">
      <div class="drop__title">Arrastrá acá la carpeta del export</div>
      <p class="drop__hint">
        O el <code>.zip</code> tal como te lo mandó Spotify, o los
        <code>Streaming_History_*.json</code> sueltos.<br>
        También sirve <code>StreamingHistory*.json</code> del export básico.
      </p>
      <div class="inline" style="justify-content:center;margin-top:var(--s-4)">
        <button type="button" class="btn btn--primary" id="pickFiles">Elegir archivos</button>
        <button type="button" class="btn" id="pickDir">Elegir carpeta</button>
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
        Prefiero escribir la ruta de la carpeta
      </summary>
      <div class="inline" style="margin-top:var(--s-3)">
        <input type="text" id="pathInput" placeholder="C:\\Users\\vos\\Downloads\\Spotify Extended Streaming History"
          style="flex:1;min-width:260px;padding:8px var(--s-3);background:var(--plane);
                 border:1px solid var(--line-2);border-radius:var(--r-sm);font-size:13px">
        <button type="button" class="btn btn--primary" id="importPath">Importar</button>
      </div>
      <p class="sect__note" style="margin-top:var(--s-2)">
        El servidor lee la carpeta directamente del disco. Más rápido para exports grandes.
      </p>
    </details>

    ${boot.has_data ? `
    <div class="kpis" style="margin-top:var(--s-5)">
      ${kpi('Reproducciones', num(boot.totals.plays), '', `desde ${fshort(boot.first_ts)}`)}
      ${kpi('Artistas', num(boot.totals.artists), '', `${num(boot.totals.albums)} álbumes`)}
      ${kpi('Canciones', num(boot.totals.tracks), '', `${num(boot.totals.episodes)} escuchas de podcast`)}
      ${kpi('Archivos', num(boot.files.length), '', 'importados hasta ahora')}
    </div>
    ${boot.files.length ? `<details style="margin-top:var(--s-4)">
      <summary style="cursor:pointer;color:var(--ink-3);font-size:13px">
        Ver los ${boot.files.length} archivos importados</summary>
      <div class="tablewrap" style="margin-top:var(--s-3)"><table class="tbl">
        <thead><tr><th>Archivo</th><th class="n">Registros</th><th class="n">Nuevos</th></tr></thead>
        <tbody>${boot.files.map((f) => `<tr><td>${esc(f.name)}</td>
          <td class="n">${num(f.rows)}</td><td class="n">${num(f.added)}</td></tr>`).join('')}</tbody>
      </table></div>
    </details>` : ''}` : alert('warn',
      '<b>Todavía no importaste nada.</b> Pedí tu historial en Spotify → Privacidad → ' +
      '«Historial de reproducción ampliado». Tarda hasta 30 días en llegar.')}
  `)}

  ${section('Portadas y géneros', `
    ${sp.configured
      ? alert('ok', `<b>Spotify conectado</b> (modo ${sp.mode === 'pkce' ? 'sesión de usuario' : 'client credentials'}).
          Las portadas y los géneros se traen solos.`)
      : alert('warn', `<b>Sin conectar.</b> El historial no trae ni portadas ni géneros:
          hay que pedírselos a la Web API. Es gratis y lleva dos minutos.`)}

    <ol class="steps" style="margin:var(--s-4) 0">
      <li>Entrá a <a href="https://developer.spotify.com/dashboard" target="_blank"
          rel="noopener noreferrer" style="color:var(--accent)">developer.spotify.com/dashboard</a>
          y creá una app (el nombre da igual).</li>
      <li>En <b>Redirect URI</b> pegá <code>${esc(redirect)}</code> y guardá.
          Hace falta sólo si vas a usar el modo con sesión.</li>
      <li>Copiá el <b>Client ID</b> y el <b>Client Secret</b> acá abajo.</li>
    </ol>

    <div class="form">
      <div class="field">
        <label class="field__label" for="mode">Modo de conexión</label>
        <select id="mode">
          <option value="client_credentials" ${sp.mode !== 'pkce' ? 'selected' : ''}>
            Client Credentials — sólo ID y Secret, sin login</option>
          <option value="pkce" ${sp.mode === 'pkce' ? 'selected' : ''}>
            Sesión de Spotify — iniciás sesión con tu cuenta</option>
        </select>
        <p class="field__hint">Empezá por el primero. Si Spotify te corta el acceso al
          catálogo, el segundo es el plan B.</p>
      </div>
      <div class="field">
        <label class="field__label" for="cid">Client ID</label>
        <input type="text" id="cid" autocomplete="off" spellcheck="false"
          placeholder="${sp.has_client_id ? 'ya guardado — escribí para reemplazarlo' : '32 caracteres'}">
      </div>
      <div class="field" id="secretField" ${sp.mode === 'pkce' ? 'hidden' : ''}>
        <label class="field__label" for="csec">Client Secret</label>
        <input type="password" id="csec" autocomplete="off"
          placeholder="${sp.has_secret ? 'ya guardado — escribí para reemplazarlo' : '32 caracteres'}">
        <p class="field__hint">Queda sólo en <code>data/vinilo.db</code>, en tu disco.</p>
      </div>
      <div class="inline">
        <button type="button" class="btn btn--primary" id="saveCreds">Guardar</button>
        <button type="button" class="btn" id="testCreds">Probar conexión</button>
        <a class="btn" id="loginBtn" href="/auth/login"
           ${sp.mode === 'pkce' ? '' : 'hidden'}>Iniciar sesión con Spotify</a>
        ${sp.logged_in ? '<button type="button" class="btn btn--ghost" id="logoutBtn">Cerrar sesión</button>' : ''}
      </div>
      <div id="credResult"></div>
    </div>

    <div class="card card--pad" style="margin-top:var(--s-5)">
      <div class="inline" style="justify-content:space-between">
        <div>
          <div class="sect__title" style="font-size:15px">Enriquecido</div>
          <p class="sect__note" id="enrichNote">—</p>
        </div>
        <div class="inline">
          <button type="button" class="btn btn--primary" id="enrichStart">Traer todo</button>
          <button type="button" class="btn" id="enrichStop" hidden>Pausar</button>
        </div>
      </div>
      <div class="bar" style="margin-top:var(--s-3)"><i id="enrichBar" style="width:0%"></i></div>
      <p class="sect__note" style="margin-top:var(--s-3)">
        Desde febrero de 2026 Spotify eliminó los endpoints en lote, así que cada
        canción y cada artista son una petición. Se pide en orden de más escuchado
        a menos, y queda cacheado para siempre.
      </p>
    </div>
  `)}

  ${section('Cómo se cuentan las cosas', `
    <div class="form">
      <div class="field">
        <label class="field__label" for="minms">Duración mínima para contar una reproducción</label>
        <select id="minms">
          <option value="0" ${cfg.min_ms === 0 ? 'selected' : ''}>Contar todo, incluso 2 segundos</option>
          <option value="5000" ${cfg.min_ms === 5000 ? 'selected' : ''}>5 segundos</option>
          <option value="30000" ${cfg.min_ms === 30000 ? 'selected' : ''}>30 segundos (lo que usa Spotify)</option>
          <option value="60000" ${cfg.min_ms === 60000 ? 'selected' : ''}>1 minuto</option>
        </select>
        <p class="field__hint">Con 30 s no se cuentan los saltos, que en tu historial
          son muchos. Bajalo a 0 si querés ver el total crudo.</p>
      </div>
      <div class="field">
        <label class="field__label" for="tz">Zona horaria</label>
        <select id="tz">${offsets.map((h) => `<option value="${h * 3600}"
          ${cfg.tz_offset === h * 3600 ? 'selected' : ''}>UTC${h >= 0 ? '+' : ''}${h}${
            h === -3 ? ' — Argentina' : ''}</option>`).join('')}</select>
        <p class="field__hint">Las marcas del export vienen en UTC. Sin esto, tu hora
          pico aparecería corrida.</p>
      </div>
      <div class="field">
        <label class="field__label" for="market">País para los podcasts</label>
        <input type="text" id="market" value="${esc(cfg.market || 'AR')}" maxlength="2"
          style="max-width:90px;text-transform:uppercase">
        <p class="field__hint">La API pide un mercado para devolver episodios.</p>
      </div>
      <div><button type="button" class="btn btn--primary" id="savePrefs">Guardar preferencias</button></div>
    </div>
  `)}

  ${section('Privacidad', `
    <div class="card card--pad">
      <p style="font-size:13.5px;color:var(--ink-2);max-width:68ch">
        Tu export incluye la dirección IP y el user-agent de cada reproducción.
        <b>Vinilo los descarta al importar</b>: nunca llegan a la base de datos.
        Del resto se guarda lo que hace falta para las estadísticas —qué sonó,
        cuándo, cuánto, en qué dispositivo y desde qué país—.
      </p>
      <p style="font-size:13.5px;color:var(--ink-2);margin-top:var(--s-3);max-width:68ch">
        Todo vive en <code>data/vinilo.db</code>, en esta máquina. Lo único que sale
        a internet son las consultas a la API de Spotify para pedir portadas, y sólo
        llevan identificadores públicos de canciones y artistas.
      </p>
    </div>
  `)}

  ${boot.has_data ? section('Zona peligrosa', `
    <div class="card card--pad">
      <p style="font-size:13.5px;color:var(--ink-2);margin-bottom:var(--s-3)">
        Borra las ${num(boot.totals.plays)} reproducciones importadas. Las portadas
        ya descargadas se conservan, así que reimportar es rápido.
      </p>
      <button type="button" class="btn btn--danger" id="resetBtn">Borrar el historial importado</button>
    </div>
  `) : ''}`;

  return {
    html,
    mount(root, ctx) {
      /* ---------------------------- importar ---------------------------- */
      const drop = root.querySelector('#drop');
      const prog = root.querySelector('#importProgress');
      const bar = root.querySelector('#impBar');
      const note = root.querySelector('#impNote');

      async function sendFiles(files) {
        const list = [...files].filter((f) => HIST_RE.test(f.name));
        if (!list.length) {
          toast('Esos archivos no parecen del historial de Spotify.', 'bad');
          return;
        }
        prog.hidden = false;
        let added = 0;
        let failed = 0;
        for (let i = 0; i < list.length; i++) {
          const f = list[i];
          note.textContent = `Subiendo ${f.name} (${i + 1} de ${list.length})…`;
          bar.style.width = `${(i / list.length) * 100}%`;
          try {
            const res = await api.importUpload(f.name, await f.arrayBuffer(), i === list.length - 1);
            added += res.added || 0;
            (res.errors || []).forEach((e) => toast(e, 'bad'));
          } catch (e) {
            failed++;
            toast(`${f.name}: ${e.message}`, 'bad');
          }
        }
        bar.style.width = '100%';
        note.textContent = `Listo: ${num(added)} reproducciones nuevas de ${list.length} archivos.`;
        if (failed < list.length) {
          toast(`Importadas ${num(added)} reproducciones.`, 'ok');
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
      ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('is-over')));
      drop.addEventListener('drop', async (e) => {
        e.preventDefault();
        const items = [...(e.dataTransfer.items || [])];
        const entries = items.map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
        if (entries.some((en) => en.isDirectory)) {
          const out = [];
          for (const en of entries) await walkEntry(en, out);
          return sendFiles(out);
        }
        sendFiles(e.dataTransfer.files);
      });

      root.querySelector('#importPath')?.addEventListener('click', async (e) => {
        const path = root.querySelector('#pathInput').value.trim();
        if (!path) return;
        e.target.disabled = true;
        e.target.textContent = 'Importando…';
        try {
          const res = await api.importPath(path);
          (res.errors || []).forEach((msg) => toast(msg, 'bad'));
          if (res.added || res.files) {
            toast(`Importadas ${num(res.added)} reproducciones de ${res.files} archivos.`, 'ok');
            setTimeout(() => ctx.reload(), 700);
          }
        } catch (err) {
          toast(err.message, 'bad');
        } finally {
          e.target.disabled = false;
          e.target.textContent = 'Importar';
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
          toast('Credenciales guardadas.', 'ok');
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
        out.innerHTML = '<p class="mut">Probando…</p>';
        try {
          const r = await api.spotifyTest();
          out.innerHTML = alert(r.ok ? 'ok' : 'bad',
            r.ok ? `<b>Funciona.</b> ${esc(r.detail)}` : `<b>No pude conectar.</b> ${esc(r.detail)}`);
          if (r.ok) api.enrichStart(true).catch(() => {});
        } catch (err) {
          out.innerHTML = alert('bad', esc(err.message));
        } finally {
          e.target.disabled = false;
        }
      });

      root.querySelector('#logoutBtn')?.addEventListener('click', async () => {
        await api.spotifyLogout();
        toast('Sesión cerrada.');
        ctx.reload();
      });

      /* -------------------------- enriquecido --------------------------- */
      const eNote = root.querySelector('#enrichNote');
      const eBar = root.querySelector('#enrichBar');
      const eStart = root.querySelector('#enrichStart');
      const eStop = root.querySelector('#enrichStop');
      let poll;

      const paint = (st) => {
        const c = st.counts || {};
        const done = (c.tracks_done || 0) + (c.artists_done || 0);
        const total = (c.tracks_total || 0) + (c.artists_total || 0);
        eBar.style.width = `${total ? (done / total) * 100 : 0}%`;
        eStop.hidden = !st.running;
        eStart.disabled = st.running;
        eStart.textContent = st.running ? 'Trayendo…' : 'Traer todo';
        const eta = st.eta_s ? ` · faltan ~${Math.ceil(st.eta_s / 60)} min` : '';
        const cool = st.cooldown ? ` · Spotify pidió esperar ${st.cooldown} s` : '';
        eNote.textContent =
          `${num(c.tracks_done || 0)}/${num(c.tracks_total || 0)} canciones · ` +
          `${num(c.artists_done || 0)}/${num(c.artists_total || 0)} artistas · ` +
          `${num(c.shows_done || 0)}/${num(c.shows_total || 0)} podcasts${eta}${cool}`;
      };

      const tick = async () => {
        try { paint(await api.enrichStatus()); } catch { /* servidor caído */ }
      };
      tick();
      poll = setInterval(tick, 2000);
      ctx.onLeave(() => clearInterval(poll));

      eStart.addEventListener('click', async () => {
        const r = await api.enrichStart(true);
        if (!r.ok) toast(r.reason === 'faltan credenciales de Spotify'
          ? 'Primero cargá y probá las credenciales.' : r.reason, 'bad');
        tick();
      });
      eStop.addEventListener('click', async () => { await api.enrichStop(); tick(); });

      /* -------------------------- preferencias -------------------------- */
      root.querySelector('#savePrefs').addEventListener('click', async (e) => {
        e.target.disabled = true;
        try {
          await api.saveConfig({
            min_ms: Number(root.querySelector('#minms').value),
            tz_offset: Number(root.querySelector('#tz').value),
            market: root.querySelector('#market').value.trim().toUpperCase() || 'AR',
          });
          toast('Preferencias guardadas.', 'ok');
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
          e.target.textContent = 'Confirmá: esto borra todo';
          setTimeout(() => {
            if (!e.target.isConnected) return;
            e.target.dataset.armed = '0';
            e.target.textContent = 'Borrar el historial importado';
          }, 5000);
          return;
        }
        await api.reset();
        toast('Historial borrado.');
        ctx.reload();
      });
    },
  };
}
