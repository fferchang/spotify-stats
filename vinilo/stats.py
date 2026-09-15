"""Motor de estadísticas: todo lo que la UI pregunta sale de acá.

Convenciones:

* Los timestamps se guardan en UTC. El desfase local (`tz_offset`, en segundos)
  se aplica al agrupar por hora/día/mes, para que "escuchás a las 2 AM" sea
  tu 2 AM y no la de Greenwich.
* `min_ms` filtra reproducciones demasiado cortas para contar como escucha
  (por defecto 30 s, el mismo umbral que usa Spotify para contar un "stream").
* Los rangos se anclan a la **última reproducción del historial**, no a hoy:
  así un export de hace tres meses sigue mostrando "últimas 4 semanas" con datos.
"""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone

from . import db

DAY = 86400
PERIODS = {"4w": 28, "3m": 91, "6m": 182, "1y": 365, "2y": 730, "5y": 1826}
PERIOD_LABELS = {
    "4w": "Últimas 4 semanas", "3m": "Últimos 3 meses", "6m": "Últimos 6 meses",
    "1y": "Último año", "2y": "Últimos 2 años", "5y": "Últimos 5 años",
}


# --------------------------------------------------------------------------- #
# Rango temporal
# --------------------------------------------------------------------------- #
def bounds() -> tuple[int | None, int | None]:
    row = db.q1("SELECT MIN(ts) a, MAX(ts) b FROM plays")
    return (row["a"], row["b"]) if row else (None, None)


def _local_day_start(ts: int, off: int) -> int:
    """Epoch UTC del comienzo del día local que contiene `ts`."""
    return ((ts + off) // DAY) * DAY - off


def _day_epoch(d: date, off: int) -> int:
    return int(datetime(d.year, d.month, d.day, tzinfo=timezone.utc).timestamp()) - off


def _fmt_day(ts: int, off: int) -> str:
    return datetime.fromtimestamp(ts + off, timezone.utc).strftime("%d/%m/%Y")


def resolve_range(period: str | None, frm=None, to=None, off: int = 0) -> dict:
    first, last = bounds()
    if first is None:
        now = int(datetime.now(timezone.utc).timestamp())
        return {"start": now, "end": now + 1, "period": "all", "label": "Sin datos",
                "anchor": now, "days": 0, "first": now, "last": now}

    def parse_date(v, end_of_day=False):
        if v in (None, ""):
            return None
        try:
            if isinstance(v, (int, float)) or str(v).isdigit():
                return int(v)
            d = datetime.strptime(str(v)[:10], "%Y-%m-%d").date()
        except (ValueError, TypeError):
            return None
        secs = _day_epoch(d, off)
        return secs + DAY if end_of_day else secs

    anchor = last
    end = anchor + 1
    period = (period or "all").lower()
    label = "Todo el historial"

    if frm or to:
        start = parse_date(frm) or first
        end = parse_date(to, end_of_day=True) or (last + 1)
        if end <= start:
            end = start + DAY
        period = "custom"
        label = f"{_fmt_day(start, off)} → {_fmt_day(end - 1, off)}"
    elif period in PERIODS:
        start = _local_day_start(anchor, off) - (PERIODS[period] - 1) * DAY
        label = PERIOD_LABELS[period]
    elif period == "ytd":
        y = datetime.fromtimestamp(anchor + off, timezone.utc).year
        start = _day_epoch(date(y, 1, 1), off)
        label = f"{y} hasta la fecha"
    elif period.isdigit() and len(period) == 4:
        y = int(period)
        start = _day_epoch(date(y, 1, 1), off)
        end = _day_epoch(date(y + 1, 1, 1), off)
        label = str(y)
    else:
        period, start = "all", first

    start = max(int(start), 0)
    return {
        "start": start, "end": int(end), "period": period, "label": label,
        "anchor": anchor, "days": max(1, (int(end) - start) // DAY),
        "first": first, "last": last,
    }


# --------------------------------------------------------------------------- #
# Filtro común
# --------------------------------------------------------------------------- #
class Filt:
    """Genera el WHERE compartido por todas las consultas.

    `w(alias)` devuelve la cláusula con las columnas calificadas, para poder
    reutilizarla igual en consultas con y sin JOIN.
    """

    def __init__(self, rng: dict, min_ms: int = 30000, kind: str = "track", off: int = 0):
        self.rng, self.min_ms, self.kind, self.off = rng, int(min_ms), kind, int(off)

    def w(self, alias: str = "") -> str:
        a = f"{alias}." if alias else ""
        clause = f"{a}ts >= ? AND {a}ts < ? AND {a}ms_played >= ?"
        if self.kind:
            clause += f" AND {a}kind = ?"
        return clause

    @property
    def params(self) -> tuple:
        p = (self.rng["start"], self.rng["end"], self.min_ms)
        return p + ((self.kind,) if self.kind else ())

    def hour(self, alias: str = "") -> str:
        a = f"{alias}." if alias else ""
        return f"CAST(strftime('%H', {a}ts + {self.off}, 'unixepoch') AS INT)"

    def localdate(self, alias: str = "") -> str:
        a = f"{alias}." if alias else ""
        return f"date({a}ts + {self.off}, 'unixepoch')"


def _bucket_expr(gran: str, off: int, alias: str = "") -> str:
    a = f"{alias}." if alias else ""
    off = int(off)
    return {
        "day": f"date({a}ts + {off}, 'unixepoch')",
        "week": f"date({a}ts + {off}, 'unixepoch', '-6 days', 'weekday 1')",
        "month": f"strftime('%Y-%m-01', {a}ts + {off}, 'unixepoch')",
        "year": f"strftime('%Y-01-01', {a}ts + {off}, 'unixepoch')",
    }[gran]


def pick_granularity(rng: dict) -> str:
    span = (rng["end"] - rng["start"]) // DAY
    if span <= 70:
        return "day"
    if span <= 400:
        return "week"
    if span <= 2600:
        return "month"
    return "year"


# --------------------------------------------------------------------------- #
# Resumen
# --------------------------------------------------------------------------- #
def summary(f: Filt) -> dict:
    row = db.q1(f"""
        SELECT COUNT(*) plays, COALESCE(SUM(ms_played),0) ms,
               COUNT(DISTINCT track_key) tracks,
               COUNT(DISTINCT artist_key) artists,
               COUNT(DISTINCT album_key) albums,
               COUNT(DISTINCT {f.localdate()}) days,
               AVG(ms_played) avg_ms
        FROM plays WHERE {f.w()}
    """, f.params)

    # Sin filtro de duración: sirve para medir cuánto se saltea.
    raw = db.q1("""
        SELECT COUNT(*) plays, COALESCE(SUM(ms_played),0) ms,
               SUM(CASE WHEN skipped=1 THEN 1 ELSE 0 END) skipped,
               SUM(CASE WHEN shuffle=1 THEN 1 ELSE 0 END) shuffled,
               SUM(CASE WHEN offline=1 THEN 1 ELSE 0 END) offline,
               SUM(CASE WHEN incognito=1 THEN 1 ELSE 0 END) incognito
        FROM plays WHERE ts >= ? AND ts < ? AND kind = ?
    """, (f.rng["start"], f.rng["end"], f.kind))

    lo = max(f.rng["start"], f.rng.get("first") or f.rng["start"])
    hi = min(f.rng["end"], (f.rng.get("last") or f.rng["end"]) + 1)
    span_days = max(1, (hi - lo) // DAY)

    days, ms = row["days"] or 0, row["ms"] or 0
    raw_plays = raw["plays"] or 0
    return {
        "plays": row["plays"] or 0, "ms": ms,
        "minutes": round(ms / 60000), "hours": round(ms / 3600000, 1),
        "tracks": row["tracks"] or 0, "artists": row["artists"] or 0,
        "albums": row["albums"] or 0,
        "days_active": days, "days_span": span_days,
        "coverage": round(100 * days / span_days, 1) if span_days else 0,
        "ms_per_active_day": round(ms / days) if days else 0,
        "plays_per_active_day": round((row["plays"] or 0) / days, 1) if days else 0,
        "avg_play_ms": round(row["avg_ms"] or 0),
        "raw_plays": raw_plays, "raw_ms": raw["ms"] or 0,
        "skip_rate": round(100 * (raw["skipped"] or 0) / raw_plays, 1) if raw_plays else 0,
        "shuffle_rate": round(100 * (raw["shuffled"] or 0) / raw_plays, 1) if raw_plays else 0,
        "offline_rate": round(100 * (raw["offline"] or 0) / raw_plays, 1) if raw_plays else 0,
        "incognito": raw["incognito"] or 0,
    }


# --------------------------------------------------------------------------- #
# Rankings
# --------------------------------------------------------------------------- #
_TOP_SPEC = {
    "tracks": ("track_key", "dim_track"),
    "artists": ("artist_key", "dim_artist"),
    "albums": ("album_key", "dim_album"),
    "shows": ("show_key", "dim_show"),
}


def top(f: Filt, what: str, sort: str = "plays", limit: int = 50, offset: int = 0) -> dict:
    col, dim = _TOP_SPEC[what]
    order = "ms DESC, plays DESC" if sort == "ms" else "plays DESC, ms DESC"
    has_artist = what in ("tracks", "albums")

    total = db.scalar(f"SELECT COUNT(DISTINCT {col}) FROM plays WHERE {f.w()} AND {col} IS NOT NULL",
                      f.params)
    grand = db.q1(f"SELECT COUNT(*) p, COALESCE(SUM(ms_played),0) m FROM plays WHERE {f.w()}", f.params)

    cols = [
        f"p.{col} AS key", "COUNT(*) AS plays", "SUM(p.ms_played) AS ms",
        "MIN(p.ts) AS first_ts", "MAX(p.ts) AS last_ts",
        f"COUNT(DISTINCT {f.localdate('p')}) AS days", "d.name AS name",
        "d.artist_name AS artist_name" if has_artist else "NULL AS artist_name",
        "d.artist_key AS artist_key" if has_artist else "NULL AS artist_key",
        "d.album_key AS album_key" if what == "tracks" else "NULL AS album_key",
        "d.episode_id AS track_id" if what == "shows" else "d.track_id AS track_id",
    ]
    rows = db.q(f"""
        SELECT {", ".join(cols)}
        FROM plays p LEFT JOIN {dim} d ON d.{col} = p.{col}
        WHERE {f.w('p')} AND p.{col} IS NOT NULL
        GROUP BY p.{col} ORDER BY {order} LIMIT ? OFFSET ?
    """, f.params + (limit, offset))

    gp, gm = (grand["p"] or 1), (grand["m"] or 1)
    items = [{
        "rank": offset + i + 1, "key": r["key"], "name": r["name"] or "(desconocido)",
        "artist_name": r["artist_name"], "artist_key": r["artist_key"],
        "album_key": r["album_key"], "track_id": r["track_id"],
        "plays": r["plays"], "ms": r["ms"], "days": r["days"],
        "first_ts": r["first_ts"], "last_ts": r["last_ts"],
        "pct_plays": round(100 * r["plays"] / gp, 2),
        "pct_ms": round(100 * r["ms"] / gm, 2),
    } for i, r in enumerate(rows)]
    return {"items": items, "total": total, "sort": sort,
            "grand_plays": grand["p"], "grand_ms": grand["m"]}


# --------------------------------------------------------------------------- #
# Series temporales y patrones
# --------------------------------------------------------------------------- #
def timeline(f: Filt, gran: str | None = None) -> dict:
    gran = gran or pick_granularity(f.rng)
    expr = _bucket_expr(gran, f.off)
    rows = db.q(f"""SELECT {expr} AS b, COUNT(*) plays, SUM(ms_played) ms,
                    COUNT(DISTINCT artist_key) artists
                    FROM plays WHERE {f.w()} GROUP BY b ORDER BY b""", f.params)
    found = {r["b"]: r for r in rows}

    # Rellenamos los huecos: un eje X con saltos miente sobre las pausas.
    out = []
    cur = datetime.fromtimestamp(f.rng["start"] + f.off, timezone.utc).date()
    stop = datetime.fromtimestamp(max(f.rng["end"] - 1, f.rng["start"]) + f.off, timezone.utc).date()
    if gran == "week":
        cur -= timedelta(days=cur.weekday())
    elif gran == "month":
        cur = cur.replace(day=1)
    elif gran == "year":
        cur = cur.replace(month=1, day=1)

    guard = 0
    while cur <= stop and guard < 20000:
        guard += 1
        r = found.get(cur.isoformat())
        out.append({"t": cur.isoformat(), "plays": r["plays"] if r else 0,
                    "ms": r["ms"] if r else 0, "artists": r["artists"] if r else 0})
        if gran == "day":
            cur += timedelta(days=1)
        elif gran == "week":
            cur += timedelta(days=7)
        elif gran == "month":
            cur = (cur.replace(day=28) + timedelta(days=5)).replace(day=1)
        else:
            cur = cur.replace(year=cur.year + 1)
    return {"granularity": gran, "points": out}


def patterns(f: Filt) -> dict:
    hours, hours_ms = [0] * 24, [0] * 24
    for r in db.q(f"SELECT {f.hour()} h, COUNT(*) c, SUM(ms_played) m "
                  f"FROM plays WHERE {f.w()} GROUP BY h", f.params):
        if r["h"] is not None:
            hours[r["h"]], hours_ms[r["h"]] = r["c"], r["m"]

    wd, wd_ms = [0] * 7, [0] * 7
    for r in db.q(f"SELECT CAST(strftime('%w', ts + {f.off}, 'unixepoch') AS INT) w, "
                  f"COUNT(*) c, SUM(ms_played) m FROM plays WHERE {f.w()} GROUP BY w", f.params):
        if r["w"] is not None:
            i = (r["w"] - 1) % 7  # strftime %w: 0=domingo; queremos 0=lunes
            wd[i], wd_ms[i] = r["c"], r["m"]

    months = [0] * 12
    for r in db.q(f"SELECT CAST(strftime('%m', ts + {f.off}, 'unixepoch') AS INT) m, "
                  f"COUNT(*) c FROM plays WHERE {f.w()} GROUP BY m", f.params):
        if r["m"]:
            months[r["m"] - 1] = r["c"]

    def breakdown(col, limit=12):
        rows = db.q(f"SELECT {col} k, COUNT(*) c, SUM(ms_played) m FROM plays "
                    f"WHERE {f.w()} AND {col} IS NOT NULL GROUP BY k "
                    f"ORDER BY c DESC LIMIT {int(limit)}", f.params)
        return [{"key": r["k"], "plays": r["c"], "ms": r["m"]} for r in rows]

    return {"hours": hours, "hours_ms": hours_ms, "weekday": wd, "weekday_ms": wd_ms,
            "months": months, "platform": breakdown("platform"),
            "country": breakdown("country"), "reason_start": breakdown("reason_start", 8),
            "reason_end": breakdown("reason_end", 8)}


def calendar(f: Filt) -> dict:
    rows = db.q(f"SELECT {f.localdate()} d, COUNT(*) c, SUM(ms_played) m "
                f"FROM plays WHERE {f.w()} GROUP BY d ORDER BY d", f.params)
    return {"days": [{"d": r["d"], "plays": r["c"], "ms": r["m"]} for r in rows]}


# --------------------------------------------------------------------------- #
# Récords
# --------------------------------------------------------------------------- #
def records(f: Filt) -> dict:
    out: dict = {}

    best = db.q1(f"""SELECT {f.localdate()} d, COUNT(*) c, SUM(ms_played) m
                     FROM plays WHERE {f.w()} GROUP BY d ORDER BY m DESC LIMIT 1""", f.params)
    if best and best["d"]:
        tt = db.q1(f"""SELECT t.name, t.artist_name, COUNT(*) c
                       FROM plays p LEFT JOIN dim_track t ON t.track_key = p.track_key
                       WHERE {f.w('p')} AND {f.localdate('p')} = ?
                       GROUP BY p.track_key ORDER BY c DESC LIMIT 1""", f.params + (best["d"],))
        out["best_day"] = {"date": best["d"], "plays": best["c"], "ms": best["m"],
                           "top_track": tt["name"] if tt else None,
                           "top_artist": tt["artist_name"] if tt else None}

    # Racha de días consecutivos con escuchas.
    days = [r["d"] for r in db.q(f"SELECT DISTINCT {f.localdate()} d FROM plays "
                                 f"WHERE {f.w()} ORDER BY d", f.params)]
    best_len, best_end, cur_len, prev = 0, None, 0, None
    for ds in days:
        d = date.fromisoformat(ds)
        cur_len = cur_len + 1 if prev and (d - prev).days == 1 else 1
        if cur_len > best_len:
            best_len, best_end = cur_len, d
        prev = d
    if best_end:
        out["streak"] = {"days": best_len,
                         "start": (best_end - timedelta(days=best_len - 1)).isoformat(),
                         "end": best_end.isoformat()}

    # Sesión más larga: reproducciones separadas por menos de 30 minutos.
    rows = db.q(f"SELECT ts, ms_played FROM plays WHERE {f.w()} ORDER BY ts", f.params)
    GAP = 1800
    s_start, s_ms, s_n = None, 0, 0
    b_ms, b_n, b_start, b_end, prev_end = 0, 0, None, None, None
    for r in rows:
        t, m = r["ts"], r["ms_played"]
        if prev_end is not None and t - prev_end <= GAP:
            s_ms, s_n = s_ms + m, s_n + 1
        else:
            if s_ms > b_ms:
                b_ms, b_n, b_start, b_end = s_ms, s_n, s_start, prev_end
            s_start, s_ms, s_n = t, m, 1
        prev_end = t + m // 1000
    if s_ms > b_ms:
        b_ms, b_n, b_start, b_end = s_ms, s_n, s_start, prev_end
    if b_start:
        out["longest_session"] = {"ms": b_ms, "plays": b_n, "start": b_start, "end": b_end}

    # Obsesión: más repeticiones de un mismo tema en un solo día.
    ob = db.q1(f"""SELECT t.name, t.artist_name, p.track_key, {f.localdate('p')} d, COUNT(*) c
                   FROM plays p LEFT JOIN dim_track t ON t.track_key = p.track_key
                   WHERE {f.w('p')} AND p.track_key IS NOT NULL
                   GROUP BY p.track_key, d ORDER BY c DESC LIMIT 1""", f.params)
    if ob:
        out["obsession"] = {"name": ob["name"], "artist": ob["artist_name"],
                            "key": ob["track_key"], "date": ob["d"], "plays": ob["c"]}

    total = db.scalar(f"SELECT COUNT(*) FROM plays WHERE {f.w()}", f.params, 1) or 1
    night = db.scalar(f"SELECT COUNT(*) FROM plays WHERE {f.w()} AND {f.hour()} BETWEEN 0 AND 4",
                      f.params)
    out["night_owl"] = {"plays": night, "pct": round(100 * night / total, 1)}

    fp = db.q1(f"""SELECT p.ts, t.name, t.artist_name
                   FROM plays p LEFT JOIN dim_track t ON t.track_key = p.track_key
                   WHERE {f.w('p')} ORDER BY p.ts ASC LIMIT 1""", f.params)
    if fp:
        out["first_play"] = {"ts": fp["ts"], "name": fp["name"], "artist": fp["artist_name"]}
    return out


def discoveries(f: Filt, limit: int = 40) -> dict:
    """Artistas y temas escuchados por primera vez en toda tu historia dentro del rango."""
    a = db.q("""SELECT x.artist_key key, d.name, x.first_ts, x.total FROM (
                  SELECT artist_key, MIN(ts) first_ts, COUNT(*) total FROM plays
                  WHERE kind='track' AND ms_played >= ? AND artist_key IS NOT NULL
                  GROUP BY artist_key) x
                LEFT JOIN dim_artist d ON d.artist_key = x.artist_key
                WHERE x.first_ts >= ? AND x.first_ts < ?
                ORDER BY x.total DESC LIMIT ?""",
             (f.min_ms, f.rng["start"], f.rng["end"], limit))
    t = db.q("""SELECT x.track_key key, d.name, d.artist_name, d.artist_key, d.track_id,
                       x.first_ts, x.total FROM (
                  SELECT track_key, MIN(ts) first_ts, COUNT(*) total FROM plays
                  WHERE kind='track' AND ms_played >= ? AND track_key IS NOT NULL
                  GROUP BY track_key) x
                LEFT JOIN dim_track d ON d.track_key = x.track_key
                WHERE x.first_ts >= ? AND x.first_ts < ?
                ORDER BY x.total DESC LIMIT ?""",
             (f.min_ms, f.rng["start"], f.rng["end"], limit))
    n_art = db.scalar("""SELECT COUNT(*) FROM (SELECT artist_key, MIN(ts) ft FROM plays
        WHERE kind='track' AND ms_played >= ? AND artist_key IS NOT NULL GROUP BY artist_key)
        WHERE ft >= ? AND ft < ?""", (f.min_ms, f.rng["start"], f.rng["end"]))
    n_trk = db.scalar("""SELECT COUNT(*) FROM (SELECT track_key, MIN(ts) ft FROM plays
        WHERE kind='track' AND ms_played >= ? AND track_key IS NOT NULL GROUP BY track_key)
        WHERE ft >= ? AND ft < ?""", (f.min_ms, f.rng["start"], f.rng["end"]))
    return {"artists": [dict(r) for r in a], "tracks": [dict(r) for r in t],
            "count_artists": n_art, "count_tracks": n_trk}


# --------------------------------------------------------------------------- #
# Géneros (dependen de los metadatos de la Web API)
# --------------------------------------------------------------------------- #
def genres(f: Filt, limit: int = 30) -> dict:
    rows = db.q(f"""SELECT p.artist_key, COUNT(*) c, SUM(p.ms_played) m, a.genres
                    FROM plays p
                    JOIN link_artist l ON l.artist_key = p.artist_key
                    JOIN sp_artist a ON a.id = l.artist_id
                    WHERE {f.w('p')} AND a.genres IS NOT NULL AND a.genres <> '[]'
                    GROUP BY p.artist_key""", f.params)

    agg: dict[str, dict] = {}
    covered = 0
    for r in rows:
        try:
            gs = json.loads(r["genres"]) or []
        except (json.JSONDecodeError, TypeError):
            continue
        covered += r["c"]
        for g in gs:
            e = agg.setdefault(g, {"genre": g, "plays": 0, "ms": 0, "artists": 0})
            e["plays"] += r["c"]
            e["ms"] += r["m"]
            e["artists"] += 1

    total = db.scalar(f"SELECT COUNT(*) FROM plays WHERE {f.w()}", f.params, 1) or 1
    items = sorted(agg.values(), key=lambda x: -x["plays"])[:limit]
    for it in items:
        it["pct"] = round(100 * it["plays"] / total, 2)
    return {"items": items, "coverage": round(100 * covered / total, 1), "known_artists": len(rows)}


# --------------------------------------------------------------------------- #
# Fichas de detalle
# --------------------------------------------------------------------------- #
_DETAIL_COL = {"artist": "artist_key", "track": "track_key",
               "album": "album_key", "show": "show_key"}


def detail(kind: str, key: str, f: Filt) -> dict:
    col = _DETAIL_COL[kind]

    agg = db.q1(f"""SELECT COUNT(*) plays, COALESCE(SUM(ms_played),0) ms,
                    MIN(ts) first_ts, MAX(ts) last_ts,
                    COUNT(DISTINCT {f.localdate()}) days
                    FROM plays WHERE {f.w()} AND {col} = ?""", f.params + (key,))
    ever = db.q1(f"""SELECT COUNT(*) plays, COALESCE(SUM(ms_played),0) ms,
                     MIN(ts) first_ts, MAX(ts) last_ts
                     FROM plays WHERE {col} = ? AND ms_played >= ?""", (key, f.min_ms))
    grand = db.scalar(f"SELECT COUNT(*) FROM plays WHERE {f.w()}", f.params, 1) or 1
    rank = db.scalar(f"""SELECT COUNT(*) + 1 FROM (
                SELECT {col} k, COUNT(*) c FROM plays WHERE {f.w()} AND {col} IS NOT NULL
                GROUP BY k HAVING c > ?)""", f.params + (agg["plays"] or 0,), 1)

    hours = [0] * 24
    for r in db.q(f"SELECT {f.hour()} h, COUNT(*) c FROM plays "
                  f"WHERE {f.w()} AND {col} = ? GROUP BY h", f.params + (key,)):
        if r["h"] is not None:
            hours[r["h"]] = r["c"]

    gran = pick_granularity(f.rng)
    series = [{"t": r["b"], "plays": r["c"], "ms": r["m"]} for r in db.q(
        f"""SELECT {_bucket_expr(gran, f.off)} b, COUNT(*) c, SUM(ms_played) m FROM plays
            WHERE {f.w()} AND {col} = ? GROUP BY b ORDER BY b""", f.params + (key,))]

    out = {
        "kind": kind, "key": key, "plays": agg["plays"] or 0, "ms": agg["ms"] or 0,
        "days": agg["days"] or 0, "first_ts": agg["first_ts"], "last_ts": agg["last_ts"],
        "ever_plays": ever["plays"] or 0, "ever_ms": ever["ms"] or 0,
        "ever_first_ts": ever["first_ts"], "ever_last_ts": ever["last_ts"],
        "pct_of_total": round(100 * (agg["plays"] or 0) / grand, 2),
        "rank": rank, "granularity": gran, "series": series, "hours": hours,
    }

    if kind == "artist":
        d = db.q1("SELECT name, track_id FROM dim_artist WHERE artist_key = ?", (key,))
        out["name"] = (d["name"] if d else None) or key
        out["track_id"] = d["track_id"] if d else None
        out["top_tracks"] = [dict(r) for r in db.q(
            f"""SELECT p.track_key key, t.name, t.track_id, COUNT(*) plays, SUM(p.ms_played) ms
                FROM plays p LEFT JOIN dim_track t ON t.track_key = p.track_key
                WHERE {f.w('p')} AND p.artist_key = ? AND p.track_key IS NOT NULL
                GROUP BY p.track_key ORDER BY plays DESC LIMIT 10""", f.params + (key,))]
        out["top_albums"] = [dict(r) for r in db.q(
            f"""SELECT p.album_key key, al.name, al.track_id, COUNT(*) plays, SUM(p.ms_played) ms
                FROM plays p LEFT JOIN dim_album al ON al.album_key = p.album_key
                WHERE {f.w('p')} AND p.artist_key = ? AND p.album_key IS NOT NULL
                GROUP BY p.album_key ORDER BY plays DESC LIMIT 8""", f.params + (key,))]

    elif kind == "track":
        d = db.q1("SELECT name, artist_name, artist_key, album_name, album_key, track_id "
                  "FROM dim_track WHERE track_key = ?", (key,))
        for k in ("name", "artist_name", "artist_key", "album_name", "album_key", "track_id"):
            out[k] = d[k] if d else None
        out["name"] = out["name"] or key

    elif kind == "album":
        d = db.q1("SELECT name, artist_name, artist_key, track_id FROM dim_album "
                  "WHERE album_key = ?", (key,))
        for k in ("name", "artist_name", "artist_key", "track_id"):
            out[k] = d[k] if d else None
        out["tracks"] = [dict(r) for r in db.q(
            f"""SELECT p.track_key key, t.name, t.track_id, COUNT(*) plays, SUM(p.ms_played) ms
                FROM plays p LEFT JOIN dim_track t ON t.track_key = p.track_key
                WHERE {f.w('p')} AND p.album_key = ? AND p.track_key IS NOT NULL
                GROUP BY p.track_key ORDER BY plays DESC LIMIT 30""", f.params + (key,))]

    elif kind == "show":
        d = db.q1("SELECT name, episode_id FROM dim_show WHERE show_key = ?", (key,))
        out["name"] = (d["name"] if d else None) or key
        out["episodes"] = [dict(r) for r in db.q(
            f"""SELECT episode_name name, COUNT(*) plays, SUM(ms_played) ms FROM plays
                WHERE {f.w()} AND show_key = ? AND episode_name IS NOT NULL
                GROUP BY episode_name ORDER BY plays DESC LIMIT 25""", f.params + (key,))]
    return out


# --------------------------------------------------------------------------- #
# Historial y búsqueda
# --------------------------------------------------------------------------- #
def history(f: Filt, limit: int = 100, offset: int = 0, query: str = "") -> dict:
    where = f.w("p")
    params = f.params
    if query:
        where += (" AND (p.track_name LIKE ? OR p.artist_name LIKE ? "
                  "OR p.album_name LIKE ? OR p.episode_name LIKE ?)")
        like = f"%{query}%"
        params = params + (like, like, like, like)

    total = db.scalar(f"SELECT COUNT(*) FROM plays p WHERE {where}", params)
    rows = db.q(f"""
        SELECT p.ts, p.ms_played, p.track_name, p.artist_name, p.album_name,
               p.episode_name, p.show_name, p.platform, p.shuffle, p.skipped,
               p.reason_start, p.reason_end, p.track_key, p.artist_key, p.album_key,
               t.track_id
        FROM plays p LEFT JOIN dim_track t ON t.track_key = p.track_key
        WHERE {where} ORDER BY p.ts DESC LIMIT ? OFFSET ?""", params + (limit, offset))
    return {"items": [dict(r) for r in rows], "total": total}


def years(min_ms: int, off: int) -> list[dict]:
    rows = db.q(f"""SELECT strftime('%Y', ts + {int(off)}, 'unixepoch') y, COUNT(*) plays,
                    SUM(ms_played) ms, COUNT(DISTINCT artist_key) artists,
                    COUNT(DISTINCT track_key) tracks
                    FROM plays WHERE kind='track' AND ms_played >= ?
                    GROUP BY y ORDER BY y""", (min_ms,))
    out = []
    for r in rows:
        f = Filt(resolve_range(r["y"], off=off), min_ms=min_ms, off=off)
        ta = top(f, "artists", limit=1)["items"]
        tt = top(f, "tracks", limit=1)["items"]
        out.append({"year": r["y"], "plays": r["plays"], "ms": r["ms"],
                    "artists": r["artists"], "tracks": r["tracks"],
                    "top_artist": ta[0] if ta else None, "top_track": tt[0] if tt else None})
    return out
