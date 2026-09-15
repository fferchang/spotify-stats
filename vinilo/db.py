"""Capa SQLite: esquema, conexiones por hilo y reconstrucción de dimensiones."""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from pathlib import Path

_local = threading.local()
_DB_PATH: Path | None = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);

-- Una fila por reproducción. Nunca guardamos IP ni user-agent.
CREATE TABLE IF NOT EXISTS plays (
  id           INTEGER PRIMARY KEY,
  ts           INTEGER NOT NULL,        -- epoch UTC (segundos)
  ms_played    INTEGER NOT NULL,
  kind         TEXT NOT NULL,           -- track | episode | audiobook
  track_id     TEXT,
  track_name   TEXT,
  artist_name  TEXT,
  album_name   TEXT,
  episode_id   TEXT,
  episode_name TEXT,
  show_name    TEXT,
  track_key    TEXT,
  artist_key   TEXT,
  album_key    TEXT,
  show_key     TEXT,
  platform     TEXT,
  country      TEXT,
  reason_start TEXT,
  reason_end   TEXT,
  shuffle      INTEGER,
  skipped      INTEGER,
  offline      INTEGER,
  incognito    INTEGER,
  medium       TEXT,                    -- audio | video
  dedup        TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS ix_plays_ts      ON plays(ts);
CREATE INDEX IF NOT EXISTS ix_plays_kind_ts ON plays(kind, ts);
CREATE INDEX IF NOT EXISTS ix_plays_artist  ON plays(artist_key, ts);
CREATE INDEX IF NOT EXISTS ix_plays_track   ON plays(track_key, ts);
CREATE INDEX IF NOT EXISTS ix_plays_album   ON plays(album_key, ts);
CREATE INDEX IF NOT EXISTS ix_plays_show    ON plays(show_key, ts);

CREATE TABLE IF NOT EXISTS files (
  name TEXT PRIMARY KEY, rows INTEGER, added INTEGER, imported_at INTEGER
);

-- Dimensiones: se reconstruyen tras cada importación.
CREATE TABLE IF NOT EXISTS dim_track (
  track_key TEXT PRIMARY KEY, name TEXT, artist_name TEXT, artist_key TEXT,
  album_name TEXT, album_key TEXT, track_id TEXT, plays INTEGER, ms INTEGER
);
CREATE TABLE IF NOT EXISTS dim_artist (
  artist_key TEXT PRIMARY KEY, name TEXT, plays INTEGER, ms INTEGER, track_id TEXT
);
CREATE TABLE IF NOT EXISTS dim_album (
  album_key TEXT PRIMARY KEY, name TEXT, artist_name TEXT, artist_key TEXT,
  plays INTEGER, ms INTEGER, track_id TEXT
);
CREATE TABLE IF NOT EXISTS dim_show (
  show_key TEXT PRIMARY KEY, name TEXT, plays INTEGER, ms INTEGER, episode_id TEXT
);
CREATE INDEX IF NOT EXISTS ix_dimtrack_artist ON dim_track(artist_key);
CREATE INDEX IF NOT EXISTS ix_dimalbum_artist ON dim_album(artist_key);

-- Vínculo clave-local -> id de Spotify (sobrevive a la reconstrucción de dims).
CREATE TABLE IF NOT EXISTS link_artist (artist_key TEXT PRIMARY KEY, artist_id TEXT, status TEXT DEFAULT 'pending', tries INTEGER DEFAULT 0, updated INTEGER);
CREATE TABLE IF NOT EXISTS link_album  (album_key  TEXT PRIMARY KEY, album_id  TEXT, status TEXT DEFAULT 'pending', tries INTEGER DEFAULT 0, updated INTEGER);
CREATE TABLE IF NOT EXISTS link_track  (track_key  TEXT PRIMARY KEY, track_id  TEXT, status TEXT DEFAULT 'pending', tries INTEGER DEFAULT 0, updated INTEGER);
CREATE TABLE IF NOT EXISTS link_show   (show_key   TEXT PRIMARY KEY, show_id   TEXT, status TEXT DEFAULT 'pending', tries INTEGER DEFAULT 0, updated INTEGER);

-- Caché de metadatos de la Web API (portadas, géneros, duración...).
CREATE TABLE IF NOT EXISTS sp_track (
  id TEXT PRIMARY KEY, name TEXT, artist_ids TEXT, artist_names TEXT,
  album_id TEXT, album_name TEXT, img TEXT, img_sm TEXT, duration_ms INTEGER,
  popularity INTEGER, release_date TEXT, explicit INTEGER, preview TEXT, fetched INTEGER
);
CREATE TABLE IF NOT EXISTS sp_artist (
  id TEXT PRIMARY KEY, name TEXT, img TEXT, img_sm TEXT, genres TEXT,
  popularity INTEGER, followers INTEGER, fetched INTEGER
);
CREATE TABLE IF NOT EXISTS sp_album (
  id TEXT PRIMARY KEY, name TEXT, img TEXT, img_sm TEXT, release_date TEXT,
  total_tracks INTEGER, label TEXT, artist_names TEXT, fetched INTEGER
);
CREATE TABLE IF NOT EXISTS sp_show (
  id TEXT PRIMARY KEY, name TEXT, img TEXT, img_sm TEXT, publisher TEXT, fetched INTEGER
);
"""


def init(path: str | Path) -> None:
    global _DB_PATH
    _DB_PATH = Path(path)
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = conn()
    con.executescript(SCHEMA)
    con.commit()


def conn() -> sqlite3.Connection:
    """Conexión por hilo (el servidor y el worker de enriquecido corren en hilos)."""
    c = getattr(_local, "con", None)
    if c is None:
        if _DB_PATH is None:
            raise RuntimeError("db.init() no fue llamado")
        c = sqlite3.connect(str(_DB_PATH), timeout=30, isolation_level=None)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode=WAL")
        c.execute("PRAGMA synchronous=NORMAL")
        c.execute("PRAGMA busy_timeout=30000")
        c.execute("PRAGMA temp_store=MEMORY")
        c.execute("PRAGMA cache_size=-40000")
        _local.con = c
    return c


def q(sql: str, params=()) -> list[sqlite3.Row]:
    return conn().execute(sql, params).fetchall()


def q1(sql: str, params=()):
    return conn().execute(sql, params).fetchone()


def scalar(sql: str, params=(), default=0):
    row = q1(sql, params)
    if row is None or row[0] is None:
        return default
    return row[0]


def get_meta(key: str, default=None):
    row = q1("SELECT v FROM meta WHERE k=?", (key,))
    if row is None:
        return default
    try:
        return json.loads(row["v"])
    except (json.JSONDecodeError, TypeError):
        return default


def set_meta(key: str, value) -> None:
    conn().execute(
        "INSERT INTO meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v",
        (key, json.dumps(value)),
    )


def rebuild_dimensions() -> None:
    """Recalcula dim_* eligiendo, por clave, la variante de nombre más reproducida.

    Preferimos variantes que traen `track_id`: son las únicas que permiten pedir
    la portada a la Web API.
    """
    c = conn()
    c.execute("BEGIN")
    try:
        c.execute("DELETE FROM dim_track")
        c.execute("""
            INSERT INTO dim_track(track_key,name,artist_name,artist_key,album_name,album_key,track_id,plays,ms)
            SELECT track_key, track_name, artist_name, artist_key, album_name, album_key, track_id, tot_c, tot_s
            FROM (
              SELECT *,
                     ROW_NUMBER() OVER (PARTITION BY track_key
                        ORDER BY (track_id IS NOT NULL) DESC, c DESC, s DESC) AS rn,
                     SUM(c) OVER (PARTITION BY track_key) AS tot_c,
                     SUM(s) OVER (PARTITION BY track_key) AS tot_s
              FROM (
                SELECT track_key, track_name, artist_name, artist_key, album_name, album_key,
                       track_id, COUNT(*) AS c, SUM(ms_played) AS s
                FROM plays
                WHERE kind='track' AND track_key IS NOT NULL AND length(track_key) > 1
                GROUP BY track_key, track_name, artist_name, artist_key, album_name, album_key, track_id
              )
            ) WHERE rn = 1
        """)

        c.execute("DELETE FROM dim_artist")
        c.execute("""
            INSERT INTO dim_artist(artist_key,name,plays,ms,track_id)
            SELECT d.artist_key,
                   (SELECT artist_name FROM dim_track t WHERE t.artist_key=d.artist_key
                     ORDER BY t.plays DESC LIMIT 1),
                   SUM(d.plays), SUM(d.ms),
                   (SELECT track_id FROM dim_track t WHERE t.artist_key=d.artist_key
                     AND t.track_id IS NOT NULL ORDER BY t.plays DESC LIMIT 1)
            FROM dim_track d GROUP BY d.artist_key
        """)

        c.execute("DELETE FROM dim_album")
        c.execute("""
            INSERT INTO dim_album(album_key,name,artist_name,artist_key,plays,ms,track_id)
            SELECT d.album_key,
                   (SELECT album_name FROM dim_track t WHERE t.album_key=d.album_key
                     ORDER BY t.plays DESC LIMIT 1),
                   (SELECT artist_name FROM dim_track t WHERE t.album_key=d.album_key
                     ORDER BY t.plays DESC LIMIT 1),
                   MIN(d.artist_key), SUM(d.plays), SUM(d.ms),
                   (SELECT track_id FROM dim_track t WHERE t.album_key=d.album_key
                     AND t.track_id IS NOT NULL ORDER BY t.plays DESC LIMIT 1)
            FROM dim_track d
            WHERE d.album_key IS NOT NULL AND length(d.album_key) > 1
            GROUP BY d.album_key
        """)

        c.execute("DELETE FROM dim_show")
        c.execute("""
            INSERT INTO dim_show(show_key,name,plays,ms,episode_id)
            SELECT show_key,
                   (SELECT show_name FROM plays p2 WHERE p2.show_key=p.show_key
                     AND p2.show_name IS NOT NULL LIMIT 1),
                   COUNT(*), SUM(ms_played),
                   (SELECT episode_id FROM plays p3 WHERE p3.show_key=p.show_key
                     AND p3.episode_id IS NOT NULL LIMIT 1)
            FROM plays p
            WHERE kind='episode' AND show_key IS NOT NULL AND length(show_key) > 1
            GROUP BY show_key
        """)

        # Sembramos los vínculos con lo que ya sabemos del propio historial.
        c.execute("""
            INSERT INTO link_track(track_key, track_id, status, tries, updated)
            SELECT track_key, track_id, 'pending', 0, 0 FROM dim_track WHERE track_id IS NOT NULL
            ON CONFLICT(track_key) DO UPDATE SET track_id=COALESCE(link_track.track_id, excluded.track_id)
        """)
        c.execute("""
            INSERT OR IGNORE INTO link_artist(artist_key, artist_id, status, tries, updated)
            SELECT artist_key, NULL, 'pending', 0, 0 FROM dim_artist
        """)
        c.execute("""
            INSERT OR IGNORE INTO link_album(album_key, album_id, status, tries, updated)
            SELECT album_key, NULL, 'pending', 0, 0 FROM dim_album
        """)
        c.execute("""
            INSERT OR IGNORE INTO link_show(show_key, show_id, status, tries, updated)
            SELECT show_key, NULL, 'pending', 0, 0 FROM dim_show
        """)
        c.execute("COMMIT")
    except Exception:
        c.execute("ROLLBACK")
        raise
    set_meta("dims_built_at", int(time.time()))
