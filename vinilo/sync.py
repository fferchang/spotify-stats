"""Sincronización en vivo: mantiene el historial al día después del export.

El export de Spotify llega con semanas de retraso y sólo se puede pedir cada
tanto. `GET /me/player/recently-played` devuelve las últimas 50 reproducciones,
así que consultándolo cada media hora el historial sigue creciendo solo.

**Lo que trae el sync es de menor calidad que el export**, y conviene tenerlo
presente:

=========================  ==================  =========================
Campo                      Export              Sync
=========================  ==================  =========================
Qué sonó y cuándo          sí                  sí
Milisegundos escuchados    reales              se asume duración completa
Saltada / aleatorio        sí                  no disponible
Dispositivo / país         sí                  no disponible
Podcasts                   sí                  no (la API los excluye)
=========================  ==================  =========================

Por eso cada fila lleva `origin`, y las tasas de salteo y aleatorio se calculan
sólo sobre las filas que de verdad tienen ese dato. Si más adelante importás un
export nuevo que cubre el mismo período, el export pisa al sync: es la versión
buena de los mismos hechos.
"""
from __future__ import annotations

import threading
import time

from . import db
from .spotify import RateLimited, SpotifyError, client
from .util import SEP, dedup_hash, key2, norm, parse_ts, uri_id

DEFAULT_INTERVAL = 1800   # media hora: 50 reproducciones dan sobra de margen
MIN_INTERVAL = 300
MAX_PAGES = 10

INSERT_SQL = """
INSERT OR IGNORE INTO plays (
  ts, ms_played, kind, track_id, track_name, artist_name, album_name,
  track_key, artist_key, album_key, medium, origin, dedup
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
"""

_lock = threading.Lock()
_state = {
    "enabled": False, "running": False, "last_run": None, "last_error": None,
    "last_added": 0, "total_added": 0, "next_run": None, "stop": False,
}
_thread: threading.Thread | None = None


def state() -> dict:
    with _lock:
        s = dict(_state)
    s["enabled"] = bool(db.get_meta("sync_enabled", False))
    s["interval"] = int(db.get_meta("sync_interval", DEFAULT_INTERVAL) or DEFAULT_INTERVAL)
    s["can_sync"] = client.can_sync()
    s["missing_scopes"] = client.missing_scopes()
    s["synced_rows"] = db.scalar("SELECT COUNT(*) FROM plays WHERE origin='sync'")
    s["cursor"] = db.get_meta("sync_after_ms")
    return s


def _row(item: dict):
    """Convierte un ítem de recently-played en una fila de `plays`."""
    track = item.get("track") or {}
    name = track.get("name")
    if not name:
        return None
    ts = parse_ts(item.get("played_at"))
    if ts is None:
        return None

    artists = track.get("artists") or []
    artist = artists[0].get("name") if artists else None
    album = (track.get("album") or {}).get("name")
    track_id = track.get("id") or uri_id(track.get("uri"))
    # La API no dice cuánto escuchaste: asumimos la pista entera y lo marcamos.
    ms = int(track.get("duration_ms") or 0)

    ident = track_id or f"{norm(artist)}{SEP}{norm(name)}"
    return (
        ts, ms, "track", track_id, name, artist, album,
        key2(artist, name), norm(artist) or None,
        key2(artist, album) if album else None,
        "audio", "sync", dedup_hash(ts, ident, ms),
    )


def run_once() -> dict:
    """Una pasada. Devuelve {added, fetched, error}."""
    if not client.can_sync():
        missing = client.missing_scopes()
        return {"added": 0, "fetched": 0,
                "error": "Falta iniciar sesión con Spotify"
                         + (f" y autorizar: {', '.join(missing)}" if missing else "")}

    after = db.get_meta("sync_after_ms")
    if not after:
        # Primera vez: arrancamos donde termina lo que ya tenemos.
        last = db.scalar("SELECT MAX(ts) FROM plays", default=0)
        after = (last * 1000) if last else int((time.time() - 14 * 86400) * 1000)

    con = db.conn()
    added = fetched = 0
    newest = int(after)

    try:
        for _ in range(MAX_PAGES):
            data = client.recently_played(after=newest, limit=50)
            items = (data or {}).get("items") or []
            if not items:
                break
            fetched += len(items)

            rows = [r for r in (_row(i) for i in items) if r]
            if rows:
                before = con.execute("SELECT COUNT(*) FROM plays").fetchone()[0]
                con.execute("BEGIN")
                try:
                    con.executemany(INSERT_SQL, rows)
                    con.execute("COMMIT")
                except Exception:
                    con.execute("ROLLBACK")
                    raise
                added += con.execute("SELECT COUNT(*) FROM plays").fetchone()[0] - before

            newest = max(newest, max(r[0] for r in rows) * 1000 if rows else newest)
            cur = (data or {}).get("cursors") or {}
            if cur.get("after"):
                newest = max(newest, int(cur["after"]))
            if len(items) < 50:
                break
    except RateLimited as e:
        return {"added": added, "fetched": fetched,
                "error": f"Spotify pidió esperar {e.retry_after}s"}
    except SpotifyError as e:
        return {"added": added, "fetched": fetched, "error": str(e)}

    db.set_meta("sync_after_ms", newest)
    if added:
        db.rebuild_dimensions()
    db.set_meta("sync_last_run", int(time.time()))
    return {"added": added, "fetched": fetched, "error": None}


def _loop() -> None:
    while True:
        with _lock:
            if _state["stop"]:
                break
        try:
            res = run_once()
            with _lock:
                _state["last_run"] = int(time.time())
                _state["last_added"] = res["added"]
                _state["total_added"] += res["added"]
                _state["last_error"] = res["error"]
        except Exception as e:  # noqa: BLE001 — el worker nunca tumba el server
            with _lock:
                _state["last_error"] = f"{type(e).__name__}: {e}"

        interval = max(MIN_INTERVAL,
                       int(db.get_meta("sync_interval", DEFAULT_INTERVAL) or DEFAULT_INTERVAL))
        with _lock:
            _state["next_run"] = int(time.time()) + interval
        # Dormimos a pedacitos para poder frenar sin esperar media hora.
        for _ in range(interval):
            with _lock:
                if _state["stop"]:
                    return
            time.sleep(1)


def start() -> dict:
    global _thread
    if not client.can_sync():
        return {"ok": False, "reason": "hace falta iniciar sesión con Spotify"}
    with _lock:
        if _state["running"]:
            return {"ok": True, "reason": "ya estaba corriendo"}
        _state.update(running=True, stop=False)
    db.set_meta("sync_enabled", True)
    _thread = threading.Thread(target=_runner, daemon=True, name="vinilo-sync")
    _thread.start()
    return {"ok": True}


def _runner() -> None:
    try:
        _loop()
    finally:
        with _lock:
            _state.update(running=False, next_run=None)


def stop() -> dict:
    with _lock:
        _state["stop"] = True
    db.set_meta("sync_enabled", False)
    return {"ok": True}


def autostart() -> None:
    """Se llama al arrancar el servidor: retoma el sync si quedó activado."""
    if db.get_meta("sync_enabled", False) and client.can_sync():
        start()


# --------------------------------------------------------------------------- #
# Rankings propios según Spotify (para contrastar con los nuestros)
# --------------------------------------------------------------------------- #
RANGES = {"short_term": "4 semanas", "medium_term": "6 meses", "long_term": "1 año"}


def spotify_tops(limit: int = 5) -> dict:
    """Lo que Spotify dice que es tu top, para comparar con lo calculado acá.

    Son listas ordenadas y nada más: sin fechas ni cantidad de reproducciones.
    """
    if not client.can_sync():
        return {"error": "hace falta iniciar sesión con Spotify"}
    out: dict = {"ranges": {}}
    try:
        for rng in RANGES:
            entry = {}
            for kind in ("artists", "tracks"):
                data = client.me_top(kind, rng, limit) or {}
                entry[kind] = [{
                    "name": it.get("name"),
                    "artist": ", ".join(a.get("name", "") for a in (it.get("artists") or []))
                              if kind == "tracks" else None,
                } for it in (data.get("items") or [])]
            out["ranges"][rng] = entry
    except SpotifyError as e:
        return {"error": str(e)}
    return out
