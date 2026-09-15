# Vinilo

Tus estadísticas de Spotify, calculadas en tu propia máquina a partir del
historial de reproducción que te entrega Spotify.

Canciones y artistas más escuchados, filtros por período (4 semanas, 6 meses,
un año, un año calendario, todo, o el rango de fechas que quieras), portadas y
géneros traídos de la Web API, gráficos de cuándo escuchás y récords del estilo
«tu racha más larga fue de 164 días».

**Sin dependencias.** Sólo Python 3.10 o superior. No hay `pip install`, no hay
`npm install`, no hay build.

```bash
python run.py
```

Abre `http://127.0.0.1:8420` en tu navegador. Listo.

---

## Cómo conseguir tu historial

1. Entrá a [Spotify → Cuenta → Privacidad](https://www.spotify.com/account/privacy/).
2. Marcá **«Historial de reproducción ampliado»** (*Extended streaming history*),
   no el paquete básico. Es el que trae todo desde que te hiciste la cuenta.
3. Confirmá desde el mail que te llega. La preparación puede tardar hasta 30 días.
4. Cuando llegue el `.zip`, arrastralo a la pantalla de **Ajustes** de Vinilo.

También sirve el export básico (`StreamingHistory0.json`), pero sólo trae los
últimos 12 meses y no incluye los identificadores de Spotify, así que las
portadas hay que buscarlas por nombre.

Importar de una vez:

```bash
python run.py --import "C:\Users\vos\Downloads\Spotify Extended Streaming History"
```

Reimportar es seguro: las reproducciones se deduplican por marca de tiempo, así
que podés volver a tirar el mismo archivo sin inflar los números.

---

## Portadas y géneros

El historial no trae ni imágenes ni géneros: sólo texto. Para eso hace falta una
app de Spotify (gratis, dos minutos):

1. Entrá a [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
   y creá una app. El nombre da igual.
2. En **Redirect URI** pegá `http://127.0.0.1:8420/auth/callback`.
   (Sólo hace falta si vas a usar el modo con sesión.)
3. Copiá el **Client ID** y el **Client Secret** en Ajustes → *Portadas y géneros*.
4. Tocá **Probar conexión**. Si responde bien, el enriquecido arranca solo.

Podés seguir el avance desde la barra lateral. Todo queda cacheado en la base:
una vez traída una canción, no se vuelve a pedir nunca más.

### Sobre los cambios de la API en 2026

En **febrero de 2026** Spotify eliminó los endpoints en lote —`GET /v1/tracks`,
`/v1/artists`, `/v1/albums` y varios más— y bajó el `limit` de `/search` de 50 a
10. Vinilo usa sólo los endpoints de ítem único que siguen vivos, y compensa así:

- **Pide en orden de más escuchado a menos.** Lo que ves en pantalla se llena
  primero; el resto va cayendo en segundo plano.
- **Aprovecha lo que viene de arriba.** El objeto `track` ya incluye el álbum con
  su portada y los ids de los artistas, así que los álbumes salen gratis y sólo la
  foto y los géneros del artista necesitan su propia llamada.
- **Cachea para siempre**, con reintentos y respeto por los `429`.

Para un historial de ~6.700 canciones y ~2.700 artistas, la primera pasada
completa tarda entre 20 y 30 minutos. Podés usar la app mientras tanto.

`audio-features` y `audio-analysis` están dados de baja desde noviembre de 2024,
así que no hay estadísticas de «energía» ni «bailabilidad». No hay forma de
conseguirlas con una app nueva.

Hay dos modos de conexión:

| Modo | Qué necesita | Cuándo usarlo |
|---|---|---|
| **Client Credentials** | Client ID + Secret | Por defecto. No requiere login. |
| **Sesión de Spotify** (PKCE) | Client ID + iniciar sesión | Plan B si el primero pierde acceso al catálogo. |

---

## Privacidad

Tu export incluye **la dirección IP y el user-agent de cada reproducción**.
Vinilo los descarta al parsear: nunca llegan a la base de datos. Se guarda lo que
hace falta para las estadísticas —qué sonó, cuándo, cuánto tiempo, en qué tipo de
dispositivo y desde qué país—.

Todo vive en `data/vinilo.db`, en tu disco. Lo único que sale a internet son las
consultas a la API de Spotify para pedir portadas, y sólo llevan identificadores
públicos de canciones y artistas.

El `.gitignore` excluye `data/`, cualquier `.db` y los `Streaming_History_*.json`,
para que no se te escape nada al hacer commit.

---

## Qué muestra

**Resumen** — tiempo total, tu artista y canción número uno, evolución en el
tiempo, y los récords del período: mejor día, racha más larga de días seguidos,
sesión más larga sin parar, la canción que más repetiste en un solo día.

**Canciones · Artistas · Álbumes · Podcasts** — rankings completos con
paginación, en lista o mosaico, ordenables por reproducciones o por tiempo.

**Géneros** — agregados a partir de los géneros que Spotify le asigna a cada
artista, ponderados por tus escuchas. Incluye los descubrimientos del período:
artistas y canciones que sonaron por primera vez *en toda tu historia*.

**Hábitos** — reloj de 24 horas, día de la semana, mes del año, calendario de
todo el período, reparto por dispositivo y país, y por qué empiezan y terminan
tus canciones (`trackdone`, `fwdbtn`, …).

**Años** — un resumen por año con el artista y la canción de cada uno.

**Historial** — el registro crudo, buscable, con duración y dispositivo.

Cualquier artista, canción o álbum abre una ficha lateral con su historia
completa, sus horarios y su ranking.

---

## Opciones

```
python run.py --import RUTA     carpeta, .zip o .json a importar al arrancar
python run.py --port 8420       puerto (busca el siguiente libre si está ocupado)
python run.py --no-browser      no abrir el navegador
python run.py --db RUTA         usar otra base de datos
```

En **Ajustes** podés cambiar:

- **Duración mínima para contar una reproducción.** Por defecto 30 segundos, el
  mismo umbral que usa Spotify para contar un *stream*. Bajalo a 0 para ver el
  total crudo, saltos incluidos.
- **Zona horaria.** Las marcas del export vienen en UTC; sin esto tu hora pico
  aparecería corrida.
- **País** para los episodios de podcast.

---

## Cómo está armado

```
run.py              punto de entrada: importa, levanta el servidor, abre el navegador
vinilo/
  db.py             esquema SQLite y reconstrucción de dimensiones
  ingest.py         parseo del export (extendido y básico, carpeta/zip/bytes)
  stats.py          el motor: rangos, rankings, patrones, récords, fichas
  spotify.py        cliente de la Web API (client credentials y PKCE)
  enrich.py         worker en segundo plano de portadas y géneros
  server.py         servidor HTTP y API JSON
web/
  index.html        el armazón
  css/app.css       un solo sistema de estilos
  js/               módulos ES: gráficos SVG a mano, sin librerías
data/               tu base de datos (ignorada por git)
```

Las reproducciones van en una tabla indexada por tiempo; las tablas `dim_*` se
reconstruyen tras cada importación y resuelven, por cada clave, cuál es la
variante de nombre más reproducida —así «Song» y «Song» de dos álbumes distintos
cuentan como una sola—. Las consultas por rango son agregaciones de SQLite: un
historial de 79.000 reproducciones responde en menos de 300 ms.
