"""Worker en segundo plano que trae portadas, géneros y metadatos.

Como los endpoints en lote ya no existen (feb-2026), cada tema y cada artista
cuesta una petición. Dos decisiones que salen de ahí:

1. **Se pide en orden de reproducciones**, de más a menos. Lo que ves primero
   en pantalla se llena primero; el resto va cayendo solo.
2. **Todo se cachea en SQLite para siempre.** Una vez traído un tema, no se
   vuelve a pedir nunca, ni aunque reimportes el historial.

Además hay atajos que evitan peticiones: la portada del álbum y el `album_id`
vienen dentro del objeto `track`, y el id de cada artista viene dentro de los
temas ya traídos. Sólo la foto y los géneros del artista necesitan su propia
llamada.
"""
from __future__ import annotations

import json
import threading
import time

from . import db
from .spotify import RateLimited, SpotifyError, client
from .util import norm

_state_lock = threading.Lock()
_state = {
    "running": False, "phase": "idle", "done": 0, "total": 0,
    "started": None, "finished": None, "errors": [], "last": None,
    "cooldown": 0, "stop_requested": False,
}
_thread: threading.Thread | None = None
_priority: list[tuple[str, str]] = []  # [(kind, id)]


def state() -> dict:
    with _state_lock:
        s = dict(_state)
    s["errors"] = s["errors"][-8:]
    s["counts"] = counts()
    if s["running"] and s["done"] and s["started"]:
        rate = s["done"] / max(1e-6, time.time() - s["started"])
        s["eta_s"] = round(max(0, s["total"] - s["done"]) / rate) if rate else None
    else:
        s["eta_s"] = None
    return s


def counts() -> dict:
    return {
        "tracks_total": db.scalar("SELECT COUNT(*) FROM dim_track WHERE track_id IS NOT NULL"),
        "tracks_done": db.scalar(
            "SELECT COUNT(*) FROM dim_track d JOIN sp_track s ON s.id = d.track_id"),
        "artists_total": db.scalar("SELECT COUNT(*) FROM dim_artist"),
        "artists_done": db.scalar(
            "SELECT COUNT(*) FROM link_artist l JOIN sp_artist s ON s.id = l.artist_id"),
        "albums_done": db.scalar(
            "SELECT COUNT(*) FROM dim_album d JOIN sp_track s ON s.id = d.track_id "
            "WHERE s.img IS NOT NULL"),
        "albums_total": db.scalar("SELECT COUNT(*) FROM dim_album"),
        "shows_total": db.scalar("SELECT COUNT(*) FROM dim_show"),
        "shows_done": db.scalar(
            "SELECT COUNT(*) FROM link_show l JOIN sp_show s ON s.id = l.show_id"),
    }


def _note(msg: str) -> None:
    with _state_lock:
        _state["errors"].append({"t": int(time.time()), "msg": msg[:200]})


# --------------------------------------------------------------------------- #
# Guardado
# --------------------------------------------------------------------------- #
def _save_track(data: dict) -> None:
    album = data.get("album") or {}
    big, small = client.pick_images(album.get("images"))
    artists = data.get("artists") or []
    db.conn().execute("""
        INSERT INTO sp_track(id,name,artist_ids,artist_names,album_id,album_name,img,img_sm,
                             duration_ms,popularity,release_date,explicit,preview,fetched)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, img=excluded.img,
            img_sm=excluded.img_sm, album_id=excluded.album_id, fetched=excluded.fetched
    """, (
        data.get("id"), data.get("name"),
        json.dumps([a.get("id") for a in artists]),
        json.dumps([a.get("name") for a in artists]),
        album.get("id"), album.get("name"), big, small,
        data.get("duration_ms"), data.get("popularity"),
        album.get("release_date"), 1 if data.get("explicit") else 0,
        data.get("preview_url"), int(time.time()),
    ))


def _save_artist(data: dict) -> None:
    big, small = client.pick_images(data.get("images"))
    db.conn().execute("""
        INSERT INTO sp_artist(id,name,img,img_sm,genres,popularity,followers,fetched)
        VALUES(?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, img=excluded.img,
            img_sm=excluded.img_sm, genres=excluded.genres, fetched=excluded.fetched
    """, (
        data.get("id"), data.get("name"), big, small,
        json.dumps(data.get("genres") or []), data.get("popularity"),
        ((data.get("followers") or {}).get("total")), int(time.time()),
    ))


def _save_show(data: dict) -> None:
    big, small = client.pick_images(data.get("images"))
    db.conn().execute("""
        INSERT INTO sp_show(id,name,img,img_sm,publisher,fetched) VALUES(?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET img=excluded.img, img_sm=excluded.img_sm,
            fetched=excluded.fetched
    """, (data.get("id"), data.get("name"), big, small,
          data.get("publisher"), int(time.time())))


# --------------------------------------------------------------------------- #
# Derivaciones sin coste de red
# --------------------------------------------------------------------------- #
def derive_links() -> None:
    """Rellena ids de artista y álbum a partir de los temas ya traídos.

    Los objetos `track` incluyen el álbum completo (con portada) y los ids de
    sus artistas, así que esto no gasta ni una petición.
    """
    con = db.conn()

    # Artistas: nombre normalizado -> id, tomado de los temas en caché.
    mapping: dict[str, str] = {}
    for r in db.q("SELECT artist_ids, artist_names FROM sp_track "
                  "WHERE artist_ids IS NOT NULL AND artist_ids <> '[]'"):
        try:
            ids = json.loads(r["artist_ids"]) or []
            names = json.loads(r["artist_names"]) or []
        except (json.JSONDecodeError, TypeError):
            continue
        for aid, nm in zip(ids, names):
            if aid and nm:
                mapping.setdefault(norm(nm), aid)

    pending = db.q("SELECT artist_key FROM link_artist WHERE artist_id IS NULL")
    updates = [(mapping[r["artist_key"]], r["artist_key"])
               for r in pending if r["artist_key"] in mapping]
    if updates:
        con.execute("BEGIN")
        con.executemany("UPDATE link_artist SET artist_id=? WHERE artist_key=?", updates)
        con.execute("COMMIT")

    # Álbumes: el id sale del tema representativo del álbum.
    con.execute("""
        UPDATE link_album SET album_id = (
            SELECT s.album_id FROM dim_album d JOIN sp_track s ON s.id = d.track_id
            WHERE d.album_key = link_album.album_key)
        WHERE album_id IS NULL
    """)
    # Y la portada ya vino dentro del track: la copiamos sin pedir nada.
    con.execute("""
        INSERT OR IGNORE INTO sp_album(id,name,img,img_sm,release_date,artist_names,fetched)
        SELECT album_id, album_name, img, img_sm, release_date, artist_names, strftime('%s','now')
        FROM sp_track WHERE album_id IS NOT NULL AND img IS NOT NULL
    """)


# --------------------------------------------------------------------------- #
# Plan de trabajo
# --------------------------------------------------------------------------- #
def _pending_tracks(limit: int = 100000):
    return db.q("""SELECT d.track_key, d.track_id FROM dim_track d
                   LEFT JOIN sp_track s ON s.id = d.track_id
                   WHERE d.track_id IS NOT NULL AND s.id IS NULL
                   ORDER BY d.plays DESC LIMIT ?""", (limit,))


def _pending_artists(limit: int = 100000):
    return db.q("""SELECT l.artist_key, l.artist_id FROM link_artist l
                   JOIN dim_artist d ON d.artist_key = l.artist_key
                   LEFT JOIN sp_artist s ON s.id = l.artist_id
                   WHERE l.artist_id IS NOT NULL AND s.id IS NULL
                   ORDER BY d.plays DESC LIMIT ?""", (limit,))


def _pending_shows(limit: int = 1000):
    return db.q("""SELECT d.show_key, d.episode_id FROM dim_show d
                   LEFT JOIN link_show l ON l.show_key = d.show_key
                   WHERE d.episode_id IS NOT NULL AND (l.show_id IS NULL)
                   ORDER BY d.plays DESC LIMIT ?""", (limit,))


def pending_total() -> int:
    derive_links()
    return len(_pending_tracks()) + len(_pending_artists()) + len(_pending_shows())


# La UI habla en plural ("tracks", "albums"); el worker, en singular. La portada
# de un álbum se obtiene pidiendo su tema representativo, así que ambos van a
# "track".
_JOB_KIND = {
    "tracks": "track", "track": "track",
    "albums": "track", "album": "track",
    "artists": "artist", "artist": "artist",
    "shows": "episode", "episode": "episode",
}


def queue_priority(kind: str, ids: list[str]) -> int:
    """La UI empuja acá lo que está mostrando para que se traiga primero."""
    job_kind = _JOB_KIND.get(kind)
    if not job_kind:
        return 0
    added = 0
    with _state_lock:
        have = set(_priority)
        for i in ids:
            if i and (job_kind, i) not in have:
                _priority.insert(0, (job_kind, i))
                have.add((job_kind, i))
                added += 1
        del _priority[400:]
    return added


# --------------------------------------------------------------------------- #
# Bucle principal
# --------------------------------------------------------------------------- #
def _fetch_one(kind: str, ident: str) -> bool:
    try:
        if kind == "track":
            data = client.track(ident)
            if data:
                _save_track(data)
                return True
        elif kind == "artist":
            data = client.artist(ident)
            if data:
                _save_artist(data)
                return True
        elif kind == "episode":
            data = client.get(f"/episodes/{ident}", {"market": db.get_meta("market", "AR") or "AR"})
            if data and data.get("show"):
                _save_show(data["show"])
                db.conn().execute(
                    "UPDATE link_show SET show_id=?, status='ok' WHERE show_key IN "
                    "(SELECT show_key FROM dim_show WHERE episode_id=?)",
                    (data["show"].get("id"), ident))
                return True
        return False
    except RateLimited as e:
        with _state_lock:
            _state["cooldown"] = e.retry_after
        time.sleep(min(e.retry_after, 30))
        with _state_lock:
            _state["cooldown"] = 0
        return False
    except SpotifyError as e:
        _note(f"{kind} {ident}: {e}")
        if e.status in (401, 403):
            raise
        return False


def _run(full: bool) -> None:
    try:
        derive_links()
        limit = 100000 if full else 400
        plan: list[tuple[str, str]] = []
        plan += [("track", r["track_id"]) for r in _pending_tracks(limit)]
        plan += [("artist", r["artist_id"]) for r in _pending_artists(limit)]
        plan += [("episode", r["episode_id"]) for r in _pending_shows()]

        with _state_lock:
            _state.update(running=True, phase="tracks", done=0, total=len(plan),
                          started=time.time(), finished=None, stop_requested=False)

        seen: set[tuple[str, str]] = set()
        i = 0
        while True:
            with _state_lock:
                if _state["stop_requested"]:
                    break
                job = _priority.pop(0) if _priority else None
            if job is None:
                # Cada tanto re-derivamos: los temas nuevos destraban artistas.
                if i and i % 250 == 0:
                    derive_links()
                    extra = [("artist", r["artist_id"]) for r in _pending_artists(limit)]
                    known = set(plan)
                    new = [e for e in extra if e not in known]
                    if new:
                        plan.extend(new)
                        with _state_lock:
                            _state["total"] = len(plan)
                if i >= len(plan):
                    break
                job = plan[i]
                i += 1
            if job in seen:
                continue
            seen.add(job)

            with _state_lock:
                _state["phase"] = {"track": "tracks", "artist": "artists",
                                   "episode": "podcasts"}.get(job[0], "otros")
                _state["last"] = job[1]
            try:
                _fetch_one(job[0], job[1])
            except SpotifyError as e:
                _note(f"Enriquecido detenido: {e}")
                break
            with _state_lock:
                _state["done"] += 1

        derive_links()
    except Exception as e:  # noqa: BLE001 - el worker nunca debe tumbar el server
        _note(f"Error inesperado: {e}")
    finally:
        with _state_lock:
            _state.update(running=False, phase="done", finished=time.time())


def start(full: bool = True) -> dict:
    global _thread
    with _state_lock:
        if _state["running"]:
            return {"ok": False, "reason": "ya estaba corriendo"}
    if not client.configured():
        return {"ok": False, "reason": "faltan credenciales de Spotify"}
    _thread = threading.Thread(target=_run, args=(full,), daemon=True, name="vinilo-enrich")
    _thread.start()
    return {"ok": True}


def stop() -> dict:
    with _state_lock:
        _state["stop_requested"] = True
    return {"ok": True}


# --------------------------------------------------------------------------- #
# Lectura de metadatos para la UI
# --------------------------------------------------------------------------- #
def images_for(kind: str, keys: list[str]) -> dict:
    """Mapa clave -> {img, img_sm, ...} para pintar portadas en las listas."""
    if not keys:
        return {}
    marks = ",".join("?" * len(keys))
    out: dict[str, dict] = {}

    if kind == "tracks":
        rows = db.q(f"""SELECT d.track_key k, s.img, s.img_sm, s.duration_ms, s.popularity,
                               s.release_date, s.preview, s.album_id
                        FROM dim_track d JOIN sp_track s ON s.id = d.track_id
                        WHERE d.track_key IN ({marks})""", keys)
    elif kind == "artists":
        rows = db.q(f"""SELECT l.artist_key k, s.img, s.img_sm, s.genres, s.popularity,
                               s.followers, s.id AS artist_id
                        FROM link_artist l JOIN sp_artist s ON s.id = l.artist_id
                        WHERE l.artist_key IN ({marks})""", keys)
    elif kind == "albums":
        rows = db.q(f"""SELECT d.album_key k, s.img, s.img_sm, s.release_date, s.album_id
                        FROM dim_album d JOIN sp_track s ON s.id = d.track_id
                        WHERE d.album_key IN ({marks})""", keys)
    elif kind == "shows":
        rows = db.q(f"""SELECT l.show_key k, s.img, s.img_sm, s.publisher, s.id AS show_id
                        FROM link_show l JOIN sp_show s ON s.id = l.show_id
                        WHERE l.show_key IN ({marks})""", keys)
    else:
        return {}

    for r in rows:
        d = dict(r)
        d.pop("k", None)
        if d.get("genres"):
            try:
                d["genres"] = json.loads(d["genres"])
            except (json.JSONDecodeError, TypeError):
                d["genres"] = []
        out[r["k"]] = d
    return out


def missing_ids(kind: str, keys: list[str]) -> list[str]:
    """Ids de Spotify aún sin traer, para empujar a la cola de prioridad."""
    if not keys:
        return []
    marks = ",".join("?" * len(keys))
    if kind == "tracks":
        rows = db.q(f"""SELECT d.track_id i FROM dim_track d
                        LEFT JOIN sp_track s ON s.id = d.track_id
                        WHERE d.track_key IN ({marks}) AND d.track_id IS NOT NULL
                          AND s.id IS NULL""", keys)
    elif kind == "artists":
        rows = db.q(f"""SELECT l.artist_id i FROM link_artist l
                        LEFT JOIN sp_artist s ON s.id = l.artist_id
                        WHERE l.artist_key IN ({marks}) AND l.artist_id IS NOT NULL
                          AND s.id IS NULL""", keys)
    elif kind == "albums":
        rows = db.q(f"""SELECT d.track_id i FROM dim_album d
                        LEFT JOIN sp_track s ON s.id = d.track_id
                        WHERE d.album_key IN ({marks}) AND d.track_id IS NOT NULL
                          AND s.id IS NULL""", keys)
    else:
        return []
    return [r["i"] for r in rows if r["i"]]
