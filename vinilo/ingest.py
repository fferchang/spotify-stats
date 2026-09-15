"""Importación del historial de Spotify.

Acepta las dos formas en que Spotify entrega los datos:

* **Extended Streaming History** (`Streaming_History_Audio_2024.json`): campos
  `ts`, `ms_played`, `master_metadata_*`, `spotify_track_uri`, `skipped`, ...
* **Account data** (`StreamingHistory_music_0.json`): sólo `endTime`,
  `artistName`, `trackName`, `msPlayed`.

Entra carpeta, .zip o bytes sueltos. Los campos sensibles del export
(`ip_addr`, `user_agent_decrypted`, `username`) se descartan al parsear: nunca
tocan la base de datos.
"""
from __future__ import annotations

import io
import json
import time
import zipfile
from pathlib import Path

from . import db
from .util import SEP, as_bool_int, clean_platform, dedup_hash, key2, norm, parse_ts, uri_id

# Campos que se ignoran a propósito por privacidad.
DROPPED_FIELDS = ("ip_addr", "ip_addr_decrypted", "user_agent_decrypted", "username")

INSERT_SQL = """
INSERT OR IGNORE INTO plays (
  ts, ms_played, kind, track_id, track_name, artist_name, album_name,
  episode_id, episode_name, show_name, track_key, artist_key, album_key, show_key,
  platform, country, reason_start, reason_end, shuffle, skipped, offline,
  incognito, medium, dedup
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
"""


def _row_from_record(rec: dict, medium: str):
    """Convierte un registro crudo del export en la tupla que espera `plays`."""
    if not isinstance(rec, dict):
        return None

    ts = parse_ts(rec.get("ts") or rec.get("endTime") or rec.get("end_time"))
    if ts is None:
        return None

    ms = rec.get("ms_played")
    if ms is None:
        ms = rec.get("msPlayed")
    try:
        ms = int(ms or 0)
    except (TypeError, ValueError):
        ms = 0
    if ms < 0:
        ms = 0

    track_name = rec.get("master_metadata_track_name") or rec.get("trackName")
    artist_name = rec.get("master_metadata_album_artist_name") or rec.get("artistName")
    album_name = rec.get("master_metadata_album_album_name") or rec.get("albumName")
    episode_name = rec.get("episode_name")
    show_name = rec.get("episode_show_name")
    audiobook_title = rec.get("audiobook_title")

    if episode_name or show_name or rec.get("spotify_episode_uri"):
        kind = "episode"
    elif audiobook_title or rec.get("audiobook_uri"):
        kind = "audiobook"
        # Reutilizamos las columnas de podcast para el audiolibro.
        show_name = show_name or audiobook_title
        episode_name = episode_name or rec.get("audiobook_chapter_title")
    elif track_name:
        kind = "track"
    else:
        return None  # registro sin contenido identificable

    track_id = uri_id(rec.get("spotify_track_uri"))
    episode_id = uri_id(rec.get("spotify_episode_uri") or rec.get("audiobook_chapter_uri"))

    track_key = key2(artist_name, track_name) if track_name else None
    artist_key = norm(artist_name) or None
    album_key = key2(artist_name, album_name) if album_name else None
    show_key = norm(show_name) or None

    ident = track_id or episode_id or f"{norm(artist_name)}{SEP}{norm(track_name or episode_name)}"
    dedup = dedup_hash(ts, ident, ms)

    return (
        ts, ms, kind, track_id, track_name, artist_name, album_name,
        episode_id, episode_name, show_name, track_key, artist_key, album_key, show_key,
        clean_platform(rec.get("platform")), rec.get("conn_country"),
        rec.get("reason_start"), rec.get("reason_end"),
        as_bool_int(rec.get("shuffle")), as_bool_int(rec.get("skipped")),
        as_bool_int(rec.get("offline")), as_bool_int(rec.get("incognito_mode")),
        medium, dedup,
    )


def _medium_for(name: str) -> str:
    return "video" if "video" in name.lower() else "audio"


def _is_history_file(name: str) -> bool:
    base = Path(name).name.lower()
    if not base.endswith(".json") or base.startswith("."):
        return False
    if "streaminghistory" in base.replace("_", ""):
        return True
    return base.startswith("endsong")  # exports viejos


def import_json_bytes(raw: bytes, filename: str, stats: dict) -> None:
    """Parsea un archivo de historial y vuelca sus filas en `plays`."""
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("utf-8", "replace")
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        stats["errors"].append(f"{filename}: JSON inválido ({exc.msg})")
        return

    if isinstance(data, dict):
        # Algunos exports envuelven la lista en un objeto.
        for value in data.values():
            if isinstance(value, list):
                data = value
                break
    if not isinstance(data, list):
        stats["errors"].append(f"{filename}: se esperaba una lista de reproducciones")
        return

    medium = _medium_for(filename)
    rows = []
    for rec in data:
        row = _row_from_record(rec, medium)
        if row is not None:
            rows.append(row)

    con = db.conn()
    before = con.execute("SELECT COUNT(*) FROM plays").fetchone()[0]
    con.execute("BEGIN")
    try:
        for i in range(0, len(rows), 5000):
            con.executemany(INSERT_SQL, rows[i:i + 5000])
        con.execute("COMMIT")
    except Exception:
        con.execute("ROLLBACK")
        raise
    after = con.execute("SELECT COUNT(*) FROM plays").fetchone()[0]

    added = after - before
    stats["files"] += 1
    stats["parsed"] += len(rows)
    stats["added"] += added
    stats["skipped"] += len(rows) - added
    stats["file_list"].append({"name": Path(filename).name, "rows": len(rows), "added": added})
    con.execute(
        "INSERT INTO files(name,rows,added,imported_at) VALUES(?,?,?,?) "
        "ON CONFLICT(name) DO UPDATE SET rows=excluded.rows, added=excluded.added, "
        "imported_at=excluded.imported_at",
        (Path(filename).name, len(rows), added, int(time.time())),
    )


def import_zip_bytes(raw: bytes, stats: dict, label: str = "archivo.zip") -> None:
    try:
        zf = zipfile.ZipFile(io.BytesIO(raw))
    except zipfile.BadZipFile:
        stats["errors"].append(f"{label}: no es un .zip válido")
        return
    with zf:
        names = [n for n in zf.namelist() if _is_history_file(n)]
        if not names:
            stats["errors"].append(f"{label}: el zip no contiene archivos de historial")
        for name in sorted(names):
            import_json_bytes(zf.read(name), name, stats)


def import_path(path: str | Path, stats: dict) -> None:
    """Importa desde una carpeta (recursivo), un .zip o un .json suelto."""
    p = Path(path).expanduser()
    if not p.exists():
        stats["errors"].append(f"No existe la ruta: {p}")
        return

    if p.is_dir():
        found = sorted(f for f in p.rglob("*.json") if _is_history_file(f.name))
        zips = sorted(p.glob("*.zip"))
        if not found and not zips:
            stats["errors"].append(
                f"No encontré archivos de historial en {p}. "
                "Buscá los que se llaman Streaming_History_*.json o StreamingHistory*.json"
            )
        for f in found:
            import_json_bytes(f.read_bytes(), f.name, stats)
        for z in zips:
            import_zip_bytes(z.read_bytes(), stats, z.name)
        return

    if p.suffix.lower() == ".zip":
        import_zip_bytes(p.read_bytes(), stats, p.name)
    elif p.suffix.lower() == ".json":
        import_json_bytes(p.read_bytes(), p.name, stats)
    else:
        stats["errors"].append(f"Formato no soportado: {p.name} (esperaba .json o .zip)")


def new_stats() -> dict:
    return {"files": 0, "parsed": 0, "added": 0, "skipped": 0, "errors": [], "file_list": []}


def _drop_synced_overlap(stats: dict) -> None:
    """Donde llega el export, manda el export.

    El sync en vivo anota los mismos hechos con menos detalle (sin ms reales,
    sin saltos, sin dispositivo). En cuanto el export cubre ese tramo, las
    filas sincronizadas sobran: son la versión pobre de lo mismo.
    """
    row = db.q1("SELECT MIN(ts) a, MAX(ts) b FROM plays WHERE origin='export'")
    if not row or row["a"] is None:
        return
    cur = db.conn().execute(
        "DELETE FROM plays WHERE origin='sync' AND ts BETWEEN ? AND ?",
        (row["a"], row["b"]))
    if cur.rowcount > 0:
        stats["replaced_sync"] = cur.rowcount


def finalize(stats: dict) -> dict:
    """Reconstruye dimensiones y devuelve un resumen listo para la UI."""
    _drop_synced_overlap(stats)
    db.rebuild_dimensions()
    row = db.q1("SELECT COUNT(*) n, MIN(ts) a, MAX(ts) b FROM plays")
    stats["total_plays"] = row["n"] or 0
    stats["first_ts"] = row["a"]
    stats["last_ts"] = row["b"]
    stats["tracks"] = db.scalar("SELECT COUNT(*) FROM dim_track")
    stats["artists"] = db.scalar("SELECT COUNT(*) FROM dim_artist")
    stats["albums"] = db.scalar("SELECT COUNT(*) FROM dim_album")
    stats["shows"] = db.scalar("SELECT COUNT(*) FROM dim_show")
    stats["synced_rows"] = db.scalar("SELECT COUNT(*) FROM plays WHERE origin='sync'")
    db.set_meta("last_import", int(time.time()))
    return stats
