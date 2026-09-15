// Traducción de la interfaz.
//
// Las claves SON el texto en español: el castellano es el idioma fuente y no
// necesita diccionario, así que sólo se mantiene el inglés. Si falta una
// traducción se ve el español —desprolijo, pero nunca roto ni vacío—.
//
// Las variables van entre llaves: t('Hola {nombre}', { nombre: 'Fer' }).

import { applyLocale } from './fmt.js';

export const LANGS = { es: 'Español', en: 'English' };

let current = 'es';

const EN = {
  // ── Navegación y armazón ────────────────────────────────────────────────
  'Resumen': 'Overview',
  'Canciones': 'Songs',
  'Artistas': 'Artists',
  'Álbumes': 'Albums',
  'Descubrimientos': 'Discoveries',
  'Hábitos': 'Habits',
  'Podcasts': 'Podcasts',
  'Años': 'Years',
  'Historial': 'History',
  'Ajustes': 'Settings',
  'Secciones': 'Sections',
  'Saltar al contenido': 'Skip to content',
  'Cerrar': 'Close',
  'Todo se calcula en tu máquina.': 'Everything is computed on your machine.',
  'Nada de esto sale de acá.': 'None of it leaves this computer.',

  // ── Filtros ─────────────────────────────────────────────────────────────
  'Período': 'Period',
  '4 semanas': '4 weeks',
  '3 meses': '3 months',
  '6 meses': '6 months',
  '1 año': '1 year',
  'Todo': 'All time',
  'Ordenar por': 'Sort by',
  'Reproducciones': 'Plays',
  'Tiempo': 'Time',
  'Fechas': 'Dates',
  'Desde': 'From',
  'Hasta': 'To',
  'Aplicar': 'Apply',
  'Limpiar': 'Clear',
  'Formato de la lista': 'List layout',
  'Lista': 'List',
  'Mosaico': 'Grid',
  'Tu historial va del {a} al {b}.': 'Your history runs from {a} to {b}.',
  'Elegí las dos fechas.': 'Pick both dates.',
  'La fecha “desde” tiene que ser anterior.': 'The start date has to come first.',
  'Últimas 4 semanas': 'Last 4 weeks',
  'Últimos 3 meses': 'Last 3 months',
  'Últimos 6 meses': 'Last 6 months',
  'Último año': 'Last year',
  'Todo el historial': 'All time',

  // ── Estados generales ───────────────────────────────────────────────────
  'Calculando…': 'Crunching…',
  'Cargando…': 'Loading…',
  'Reintentar': 'Try again',
  'Nada por acá': 'Nothing here',
  'No hay reproducciones en este período.': 'No plays in this period.',
  'Algo salió mal.': 'Something went wrong.',
  'No pude hablar con el servidor local.': "Couldn't reach the local server.",
  'No pude hablar con el servidor local. ¿Sigue corriendo run.py?':
    "Couldn't reach the local server. Is run.py still running?",
  'Cargar más': 'Load more',
  '({n} restantes)': '({n} left)',
  'Guardado.': 'Saved.',

  // ── Bienvenida ──────────────────────────────────────────────────────────
  'Bienvenido a Vinilo': 'Welcome to Vinilo',
  'Tus estadísticas de Spotify, calculadas acá adentro.':
    'Your Spotify stats, computed right here.',
  'Todavía no hay historial': 'No history yet',
  'Pedile a Spotify tu «Historial de reproducción ampliado» desde Cuenta → Privacidad. Cuando llegue el mail con el .zip, importalo y en segundos tenés todo: tus artistas y canciones más escuchadas, a qué hora escuchás, cómo cambió tu gusto año a año.':
    'Request your "Extended streaming history" from Spotify under Account → Privacy. When the .zip arrives by email, import it and you get everything in seconds: your most played artists and songs, what time you listen, how your taste shifted year by year.',
  'Importar mi historial': 'Import my history',

  // ── Resumen ─────────────────────────────────────────────────────────────
  'Tiempo escuchado': 'Time listened',
  '{plays} reproducciones de <b>{artists}</b> artistas y <b>{tracks}</b> canciones distintas.':
    '{plays} plays across <b>{artists}</b> artists and <b>{tracks}</b> different songs.',
  'Mandó <b>{name}</b>, con {plays} escuchas.': '<b>{name}</b> led the way, with {plays} plays.',
  'Son {h} h por día activo, repartidas en {days} de {span} días ({pct}).':
    "That's {h} h per active day, spread over {days} of {span} days ({pct}).",
  'Artista nº 1': 'Top artist',
  'Canción nº 1': 'Top song',
  '{n} reproducciones · {time}': '{n} plays · {time}',
  '{n} por día activo': '{n} per active day',
  '{n} álbumes': '{n} albums',
  'media de {t} por escucha': '{t} average per play',
  'Días con música': 'Days with music',
  '{pct} del período': '{pct} of the period',
  'Se saltea': 'Skipped',
  'de {n} intentos': 'of {n} attempts',
  'En aleatorio': 'On shuffle',
  'del total': 'of the total',
  '{pct} sin conexión': '{pct} offline',
  'Cómo evolucionó': 'How it evolved',
  'por día': 'daily', 'por semana': 'weekly', 'por mes': 'monthly', 'por año': 'yearly',
  'Ver todos': 'See all',
  'Ver todas': 'See all',
  'No hay escuchas en este período': 'No listening in this period',
  'Probá con un rango más amplio, o mirá “Todo el historial”.':
    'Try a wider range, or switch to "All time".',

  // ── Récords ─────────────────────────────────────────────────────────────
  'Récords del período': 'Records for this period',
  'Mejor día': 'Best day',
  '{time} en {n} reproducciones': '{time} across {n} plays',
  ' · sobre todo {name}': ' · mostly {name}',
  'Racha más larga': 'Longest streak',
  '{n} días seguidos': '{n} days in a row',
  'Sesión más larga': 'Longest session',
  '{n} temas sin parar, desde {when}': '{n} tracks nonstop, starting {when}',
  'Obsesión': 'Obsession',
  '{n}× en un día': '{n}× in one day',
  'De madrugada': 'Late night',
  '{n} reproducciones entre las 0 y las 5': '{n} plays between midnight and 5 AM',
  'Hora pico': 'Peak hour',
  'Tu día fuerte es el {day}': 'Your strongest day is {day}',
  'Tus horarios': 'Your schedule',
  'Reproducciones por hora del día': 'Plays by hour of day',
  'Reproducciones por día de la semana': 'Plays by day of week',
  'Reproducciones por mes del año': 'Plays by month of year',
  'tu hora pico': 'your peak hour',

  // ── Listas ──────────────────────────────────────────────────────────────
  '{n} {what} distintos · {plays} reproducciones · {time}':
    '{n} different {what} · {plays} plays · {time}',
  'Sin datos en este período': 'No data in this period',
  '{artist} · {pct} de tus escuchas': '{artist} · {pct} of your listening',
  '{n} días distintos · {pct} de tus escuchas': '{n} different days · {pct} of your listening',
  'repr.': 'plays',
  '{n} reproducciones': '{n} plays',
  'canciones': 'songs', 'artistas': 'artists', 'álbumes': 'albums', 'podcasts': 'podcasts',

  // ── Hábitos ─────────────────────────────────────────────────────────────
  'cuándo, dónde y cómo escuchás': 'when, where and how you listen',
  'Día fuerte': 'Strongest day',
  'Mes fuerte': 'Strongest month',
  'Aleatorio': 'Shuffle',
  'de las reproducciones': 'of all plays',
  '{n} quedaron en nada': '{n} came to nothing',
  'Sin conexión': 'Offline',
  '{n} en sesión privada': '{n} in a private session',
  'modo offline': 'offline mode',
  'El día': 'The day',
  'Por hora': 'By hour',
  'Por franja horaria': 'By time of day',
  'Hora por hora, en detalle': 'Hour by hour, in detail',
  'Madrugada': 'Late night', 'Mañana': 'Morning', 'Tarde': 'Afternoon', 'Noche': 'Evening',
  'La semana y el año': 'The week and the year',
  'Por día de la semana': 'By day of week',
  'Por mes del año': 'By month of year',
  'Calendario': 'Calendar',
  'Cada celda es un día; cuanto más verde, más escuchaste.':
    'Each cell is a day; the greener, the more you listened.',
  '{n} días con música': '{n} days with music',
  'menos': 'less', 'más': 'more',
  'sin escuchas': 'no listening',
  'Dispositivos y lugares': 'Devices and places',
  'Dónde reproducís': 'Where you play',
  'Desde qué país': 'From which country',
  'El export no trae el país de estas reproducciones.':
    "The export doesn't include a country for these plays.",
  'Sale del campo <code>conn_country</code> del export. Tu dirección IP no se guarda.':
    'Taken from the export\'s <code>conn_country</code> field. Your IP address is never stored.',
  'Cómo empiezan y terminan las canciones': 'How songs start and end',
  'Motivo de inicio': 'Start reason',
  'Motivo de fin': 'End reason',
  'Desconocido': 'Unknown',
  'Sin datos': 'No data',

  // ── Descubrimientos ─────────────────────────────────────────────────────
  'Artistas nuevos': 'New artists',
  'primera escucha en este período': 'first heard in this period',
  'Canciones nuevas': 'New songs',
  'nunca antes reproducidas': 'never played before',
  'Artistas que conociste': 'Artists you discovered',
  'Canciones que estrenaste': 'Songs you first played',
  'Ningún artista nuevo: todo lo que sonó ya lo conocías.':
    'No new artists: everything you played, you already knew.',
  'Ninguna canción nueva en este período.': 'No new songs in this period.',
  'desde {date}': 'since {date}',
  'repr. totales': 'plays total',
  'primera vez en toda tu historia, no sólo en el período':
    'first time ever, not just within the period',
  'Lo que sonó por primera vez en toda tu historia dentro de este período.':
    'What played for the very first time ever, within this period.',

  // ── Géneros (si Spotify los repone) ─────────────────────────────────────
  'Géneros': 'Genres',
  'Género nº 1': 'Top genre',
  'Géneros distintos': 'Different genres',
  'Spotify eliminó los géneros de su API en 2026.': 'Spotify removed genres from its API in 2026.',
  'El campo <code>genres</code> ya no viene en el objeto del artista, así que no hay de dónde sacarlos. No es algo que se pueda configurar.':
    'The <code>genres</code> field no longer comes back on the artist object, so there is nowhere to get them from. This is not something you can configure.',

  // ── Años ────────────────────────────────────────────────────────────────
  '{a}–{b} · {n} reproducciones en total': '{a}–{b} · {n} plays in total',
  'artista del año': 'artist of the year',
  'canción del año': 'song of the year',
  '{n} artistas': '{n} artists',
  '{n} canciones': '{n} songs',
  '{n} h por día': '{n} h per day',
  'Importá tu historial para ver el recorrido año por año.':
    'Import your history to see the year-by-year arc.',

  // ── Historial ───────────────────────────────────────────────────────────
  '{n} reproducciones en {label}': '{n} plays in {label}',
  ' que coinciden con “{q}”': ' matching "{q}"',
  'Buscar canción, artista, álbum o episodio': 'Search song, artist, album or episode',
  'Buscar': 'Search',
  'Qué sonó': 'What played',
  'Duró': 'Length',
  'Dispositivo': 'Device',
  'Cómo terminó': 'How it ended',
  'Cuándo': 'When',
  'Cargar 100 más': 'Load 100 more',
  'Sin resultados': 'No results',
  'No encontré reproducciones que coincidan con esa búsqueda en este período.':
    'No plays match that search in this period.',
  'saltada': 'skipped', 'aleatorio': 'shuffle',
  'sincronizado': 'synced',
  'Duración de la pista: el sync no informa cuánto escuchaste':
    "Track length: live sync doesn't report how much you actually listened",
  '(sin título)': '(untitled)',

  // ── Ficha de detalle ────────────────────────────────────────────────────
  'Artista': 'Artist', 'Canción': 'Song', 'Álbum': 'Album', 'Podcast': 'Podcast',
  ' · nº {n} del período': ' · #{n} this period',
  'reproducciones': 'plays',
  'escuchado': 'listened',
  'día': 'day', 'días': 'days',
  'de tu período': 'of your period',
  'Sin reproducciones en el período elegido. Abajo va el total histórico.':
    'No plays in the selected period. The all-time total is below.',
  'Historia completa': 'All-time',
  'en total': 'in total',
  'Primera vez el {first} · última {ago}': 'First played {first} · last {ago}',
  'Cómo se repartió en el período': 'How it spread across the period',
  'A qué hora lo escuchás · pico a las {h}': 'When you listen · peaks at {h}',
  'Sus canciones': 'Their songs',
  'Sus álbumes': 'Their albums',
  'Canciones del álbum': 'Album tracks',
  'Episodios': 'Episodes',
  'Ver a {name}': 'View {name}',
  'el artista': 'the artist',
  'Ver el álbum': 'View album',
  'Abrir en Spotify ↗': 'Open in Spotify ↗',
  'No pude cargar la ficha': "Couldn't load this card",
  'Dura {t}': '{t} long',
  'Salió en {y}': 'Released {y}',

  // ── Ajustes ─────────────────────────────────────────────────────────────
  'Tus datos, tus credenciales, tu máquina.': 'Your data, your credentials, your machine.',
  'Idioma': 'Language',
  'Tu historial': 'Your history',
  'Arrastrá acá la carpeta del export': 'Drop the export folder here',
  'Elegir archivos': 'Choose files',
  'Elegir carpeta': 'Choose folder',
  'Elegir archivos del historial': 'Choose history files',
  'Prefiero escribir la ruta de la carpeta': "I'd rather type the folder path",
  'Importar': 'Import',
  'Importando…': 'Importing…',
  'El servidor lee la carpeta directamente del disco. Más rápido para exports grandes.':
    'The server reads the folder straight off disk. Faster for large exports.',
  'Archivos': 'Files',
  'importados hasta ahora': 'imported so far',
  'desde {date}': 'since {date}',
  '{n} escuchas de podcast': '{n} podcast plays',
  'Ver los {n} archivos importados': 'See the {n} imported files',
  'Archivo': 'File', 'Registros': 'Records', 'Nuevos': 'New',
  'Subiendo {name} ({i} de {n})…': 'Uploading {name} ({i} of {n})…',
  'Listo: {n} reproducciones nuevas de {files} archivos.':
    'Done: {n} new plays from {files} files.',
  'Importadas {n} reproducciones.': 'Imported {n} plays.',
  'Importadas {n} reproducciones de {files} archivos.': 'Imported {n} plays from {files} files.',
  'Esos archivos no parecen del historial de Spotify.':
    "Those files don't look like Spotify history.",
  'Portadas': 'Artwork',
  'Spotify conectado': 'Spotify connected',
  'sesión de usuario': 'user session',
  'Las portadas se traen solas.': 'Artwork is fetched automatically.',
  'Sin conectar.': 'Not connected.',
  'El historial no trae portadas: hay que pedírselas a la Web API. Es gratis y lleva dos minutos.':
    "The history has no artwork: it has to be requested from the Web API. It's free and takes two minutes.",
  'Modo de conexión': 'Connection mode',
  'Client Credentials — sólo ID y Secret, sin login':
    'Client Credentials — just ID and Secret, no login',
  'Sesión de Spotify — iniciás sesión con tu cuenta':
    'Spotify session — you sign in with your account',
  'Hace falta para la sincronización en vivo. Si no, con el primero alcanza.':
    'Required for live sync. Otherwise the first one is enough.',
  'ya guardado — escribí para reemplazarlo': 'already saved — type to replace it',
  '32 caracteres': '32 characters',
  'Queda sólo en <code>data/vinilo.db</code>, en tu disco.':
    'Stored only in <code>data/vinilo.db</code>, on your disk.',
  'Guardar': 'Save',
  'Probar conexión': 'Test connection',
  'Probando…': 'Testing…',
  'Iniciar sesión con Spotify': 'Sign in with Spotify',
  'Cerrar sesión': 'Sign out',
  'Sesión cerrada.': 'Signed out.',
  'Credenciales guardadas.': 'Credentials saved.',
  'Funciona.': 'It works.',
  'No pude conectar.': "Couldn't connect.",
  'Enriquecido': 'Artwork fetching',
  'Traer todo': 'Fetch everything',
  'Trayendo…': 'Fetching…',
  'Pausar': 'Pause',
  'Primero cargá y probá las credenciales.': 'Load and test your credentials first.',
  '{a}/{b} canciones · {c}/{d} artistas · {e}/{f} podcasts':
    '{a}/{b} songs · {c}/{d} artists · {e}/{f} podcasts',
  ' · faltan ~{n} min': ' · ~{n} min left',
  ' · Spotify pidió esperar {n} s': ' · Spotify asked to wait {n} s',
  'Desde febrero de 2026 Spotify eliminó los endpoints en lote, así que cada canción y cada artista son una petición. Se pide en orden de más escuchado a menos, y queda cacheado para siempre.':
    'Since February 2026 Spotify removed its bulk endpoints, so every song and artist costs one request. They are fetched most-played first, and cached forever.',
  'Entrá a {link} y creá una app (el nombre da igual).':
    'Go to {link} and create an app (the name does not matter).',
  'En <b>Redirect URI</b> pegá <code>{uri}</code> y guardá. Hace falta sólo si vas a usar el modo con sesión.':
    'Under <b>Redirect URI</b> paste <code>{uri}</code> and save. Only needed for the session mode.',
  'Copiá el <b>Client ID</b> y el <b>Client Secret</b> acá abajo.':
    'Copy the <b>Client ID</b> and <b>Client Secret</b> below.',

  // ── Sincronización ──────────────────────────────────────────────────────
  'Sincronización en vivo': 'Live sync',
  'Activa.': 'On.',
  'El historial se mantiene solo: Vinilo consulta tus últimas reproducciones cada {n} minutos y las agrega.':
    'Your history keeps itself current: Vinilo checks your recent plays every {n} minutes and appends them.',
  'Necesita iniciar sesión.': 'Sign-in required.',
  'El sync lee <i>tus</i> reproducciones, y eso no se puede con Client Credentials. Cambiá el modo de conexión a «Sesión de Spotify» ahí arriba e iniciá sesión.':
    'Sync reads <i>your</i> plays, which Client Credentials cannot do. Switch the connection mode above to "Spotify session" and sign in.',
  'Falta autorizar el permiso de lectura.': 'Read permission not granted yet.',
  'Volvé a iniciar sesión para conceder: {scopes}.': 'Sign in again to grant: {scopes}.',
  'Necesita iniciar sesión con tu cuenta de Spotify.': 'Requires signing in with your Spotify account.',
  'Estado': 'Status',
  'Sincronizar ahora': 'Sync now',
  'Consultando…': 'Checking…',
  'Activar': 'Turn on', 'Desactivar': 'Turn off',
  'Activa': 'On', 'Activándose…': 'Starting…', 'Desactivada': 'Off',
  'Cada cuánto consultar': 'How often to check',
  'cada 5 minutos': 'every 5 minutes', 'cada 15 minutos': 'every 15 minutes',
  'cada 30 minutos': 'every 30 minutes', 'cada hora': 'hourly', 'cada 3 horas': 'every 3 hours',
  'El buffer de Spotify guarda 50 reproducciones. Media hora deja margen de sobra salvo que escuches sin parar.':
    "Spotify's buffer holds 50 plays. Half an hour leaves plenty of room unless you listen nonstop.",
  'Qué trae el sync y qué no': 'What sync brings and what it does not',
  'Dato': 'Field', 'Export': 'Export', 'Sync en vivo': 'Live sync',
  'Qué sonó y cuándo': 'What played and when',
  'sí': 'yes', 'no disponible': 'not available',
  'Milisegundos escuchados': 'Milliseconds listened',
  'reales': 'actual', 'se asume la pista entera': 'assumes the whole track',
  'Saltada / aleatorio': 'Skipped / shuffle',
  'Dispositivo y país': 'Device and country',
  'la API los excluye': 'the API excludes them',
  'Por eso las tasas de salteo y aleatorio se calculan sólo sobre las filas que traen ese dato, y en el Historial las sincronizadas van marcadas. Si más adelante importás un export que cubre el mismo tramo, el export las reemplaza: es la versión buena de los mismos hechos.':
    'That is why skip and shuffle rates are computed only over rows that actually carry those fields, and synced rows are flagged in History. If you later import an export covering the same stretch, the export replaces them: it is the better record of the same facts.',
  '{n} reproducciones traídas por sync': '{n} plays brought in by sync',
  'última consulta {t}': 'last checked {t}',
  '+{n} en la última': '+{n} on the last run',
  'próxima en {n} min': 'next in {n} min',
  'error: {msg}': 'error: {msg}',
  'Sincronización activada.': 'Live sync turned on.',
  'Sincronización desactivada.': 'Live sync turned off.',
  '{n} reproducciones nuevas.': '{n} new plays.',
  'Ya estabas al día: nada nuevo.': 'Already up to date: nothing new.',
  'Se aplica en la próxima vuelta.': 'Takes effect on the next run.',
  'Según Spotify': 'According to Spotify',
  'Su ranking oficial, para contrastar con el calculado acá.':
    'Their official ranking, to compare against the one computed here.',
  'Traer': 'Fetch',
  'Consultando a Spotify…': 'Asking Spotify…',
  'Spotify no publica cómo pondera estos rankings, así que no tienen por qué coincidir clavado con los de acá. Además no traen ni fechas ni cantidad de reproducciones: son sólo listas ordenadas.':
    'Spotify does not publish how it weighs these rankings, so they need not match the ones here exactly. They also carry no dates or play counts: they are just ordered lists.',

  // ── Preferencias ────────────────────────────────────────────────────────
  'Cómo se cuentan las cosas': 'How things are counted',
  'Duración mínima para contar una reproducción': 'Minimum length for a play to count',
  'Contar todo, incluso 2 segundos': 'Count everything, even 2 seconds',
  '5 segundos': '5 seconds', '30 segundos (lo que usa Spotify)': '30 seconds (what Spotify uses)',
  '1 minuto': '1 minute',
  'Con 30 s no se cuentan los saltos, que en tu historial son muchos. Bajalo a 0 si querés ver el total crudo.':
    'At 30 s, skips do not count — and you have plenty. Drop it to 0 for the raw total.',
  'Zona horaria': 'Time zone',
  'Las marcas del export vienen en UTC; sin esto tu hora pico aparecería corrida.':
    'Export timestamps are in UTC; without this your peak hour would be off.',
  'País para los podcasts': 'Country for podcasts',
  'La API pide un mercado para devolver episodios.': 'The API needs a market to return episodes.',
  'Guardar preferencias': 'Save preferences',
  'Preferencias guardadas.': 'Preferences saved.',

  // ── Privacidad y zona peligrosa ─────────────────────────────────────────
  'Privacidad': 'Privacy',
  'Tu export incluye la dirección IP y el user-agent de cada reproducción. <b>Vinilo los descarta al importar</b>: nunca llegan a la base de datos. Del resto se guarda lo que hace falta para las estadísticas —qué sonó, cuándo, cuánto, en qué dispositivo y desde qué país—.':
    'Your export includes the IP address and user agent of every play. <b>Vinilo drops them on import</b>: they never reach the database. Of the rest, it keeps what the stats need — what played, when, how long, on which device and from which country.',
  'Todo vive en <code>data/vinilo.db</code>, en esta máquina. Lo único que sale a internet son las consultas a la API de Spotify para pedir portadas, y sólo llevan identificadores públicos de canciones y artistas.':
    'Everything lives in <code>data/vinilo.db</code>, on this machine. The only thing that leaves is the Spotify API calls for artwork, which carry nothing but public song and artist identifiers.',
  'Zona peligrosa': 'Danger zone',
  'Borra las {n} reproducciones importadas. Las portadas ya descargadas se conservan, así que reimportar es rápido.':
    'Deletes the {n} imported plays. Artwork already downloaded is kept, so re-importing is fast.',
  'Borrar el historial importado': 'Delete the imported history',
  'Confirmá: esto borra todo': 'Confirm: this deletes everything',
  'Historial borrado.': 'History deleted.',

  // ── Tiempo relativo ─────────────────────────────────────────────────────
  'hoy': 'today', 'ayer': 'yesterday',
  'hace {n} días': '{n} days ago',
  'hace {n} mes': '{n} month ago', 'hace {n} meses': '{n} months ago',
  'hace {n} años': '{n} years ago',
  'sem. del {d}': 'week of {d}',

  // ── Motivos del export ──────────────────────────────────────────────────
  'Terminó sola': 'Finished on its own',
  'Botón siguiente': 'Next button',
  'Botón anterior': 'Previous button',
  'Clic en la lista': 'Clicked in the list',
  'Botón reproducir': 'Play button',
  'Al abrir la app': 'App opened',
  'Control remoto': 'Remote control',
  'Se detuvo': 'Stopped',
  'Cerró sesión': 'Signed out',
  'Error de reproducción': 'Playback error',
  'Salida inesperada': 'Unexpected exit',
  'Salió en pausa': 'Exited while paused',
  'Clic lateral': 'Side click',
  'Ventana emergente': 'Pop-up',
  'Enlace abierto': 'Link opened',
  'Pasó a video': 'Switched to video',
  'Reanudada': 'Resumed',
  'Reproducción automática': 'Autoplay',
};

export function setLang(code) {
  current = LANGS[code] ? code : 'es';
  applyLocale(current);
  document.documentElement.lang = current;
  return current;
}

export const getLang = () => current;

export function t(key, vars) {
  let out = current === 'en' ? (EN[key] ?? key) : key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.split(`{${k}}`).join(v);
    }
  }
  return out;
}
