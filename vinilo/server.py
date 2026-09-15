"""Servidor HTTP local (stdlib) que sirve la UI y expone la API JSON."""
from __future__ import annotations

import json
import mimetypes
import threading
import traceback
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from . import db, enrich, ingest, stats, sync
from .spotify import SpotifyError, client

WEB_DIR = Path(__file__).resolve().parent.parent / "web"
MAX_UPLOAD = 400 * 1024 * 1024  # 400 MB: alcanza para el .zip entero de Spotify

DEFAULTS = {
    "lang": "es",
    "min_ms": 30000,
    "sync_interval": sync.DEFAULT_INTERVAL,
    "tz_offset": 0,
    "market": "AR",
    "auth_mode": "client_credentials",
    "sort": "plays",
}


def cfg(key: str):
    v = db.get_meta(key, None)
    return DEFAULTS.get(key) if v is None else v


def _filt(qs: dict, kind: str = "track") -> stats.Filt:
    off = int(cfg("tz_offset") or 0)
    rng = stats.resolve_range(qs.get("period"), qs.get("from"), qs.get("to"), off)
    min_ms = qs.get("min_ms")
    min_ms = int(min_ms) if (min_ms or "").isdigit() else int(cfg("min_ms") or 0)
    return stats.Filt(rng, min_ms=min_ms, kind=kind, off=off)


def _int(qs: dict, key: str, default: int, lo: int = 0, hi: int = 1000) -> int:
    raw = qs.get(key)
    try:
        return max(lo, min(hi, int(raw)))
    except (TypeError, ValueError):
        return default


class Handler(BaseHTTPRequestHandler):
    server_version = "Vinilo"
    protocol_version = "HTTP/1.1"

    # ------------------------------------------------------------ utilidades
    def log_message(self, fmt, *args):  # silencia el log por request
        pass

    def _send(self, code: int, body: bytes, ctype: str, extra: dict | None = None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def json(self, data, code: int = 200):
        body = json.dumps(data, ensure_ascii=False, default=str).encode("utf-8")
        self._send(code, body, "application/json; charset=utf-8",
                   {"Cache-Control": "no-store"})

    def fail(self, message: str, code: int = 400):
        self.json({"error": message}, code)

    def read_body(self) -> bytes:
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return b""
        if length > MAX_UPLOAD:
            raise ValueError(f"archivo demasiado grande ({length // 1048576} MB)")
        chunks, left = [], length
        while left > 0:
            chunk = self.rfile.read(min(left, 1 << 20))
            if not chunk:
                break
            chunks.append(chunk)
            left -= len(chunk)
        return b"".join(chunks)

    def read_json(self) -> dict:
        raw = self.read_body()
        if not raw:
            return {}
        try:
            data = json.loads(raw.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return {}
        return data if isinstance(data, dict) else {}

    @property
    def base_url(self) -> str:
        host = self.headers.get("Host") or f"127.0.0.1:{self.server.server_port}"
        return f"http://{host}"

    # -------------------------------------------------------------- despacho
    def do_GET(self):
        self._dispatch("GET")

    def do_HEAD(self):
        self._dispatch("GET")

    def do_POST(self):
        self._dispatch("POST")

    def _dispatch(self, method: str):
        parsed = urllib.parse.urlparse(self.path)
        path = urllib.parse.unquote(parsed.path)
        qs = {k: v[0] for k, v in urllib.parse.parse_qs(parsed.query).items()}
        try:
            if path.startswith("/api/") or path.startswith("/auth/"):
                self.api(method, path, qs)
            elif method == "GET":
                self.static(path)
            else:
                self.fail("Ruta no encontrada", 404)
        except BrokenPipeError:
            pass
        except SpotifyError as e:
            self.fail(str(e), 502)
        except Exception as e:  # noqa: BLE001
            traceback.print_exc()
            self.fail(f"{type(e).__name__}: {e}", 500)

    # --------------------------------------------------------------- estáticos
    def static(self, path: str):
        rel = "index.html" if path in ("/", "") else path.lstrip("/")
        target = (WEB_DIR / rel).resolve()
        try:
            target.relative_to(WEB_DIR.resolve())
        except ValueError:
            return self.fail("Ruta inválida", 403)
        if not target.is_file():
            target = WEB_DIR / "index.html"  # SPA: todo lo demás cae en el índice
            if not target.is_file():
                return self.fail("Falta la carpeta web/", 404)
        ctype = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
            ctype += "; charset=utf-8"
        self._send(200, target.read_bytes(), ctype, {"Cache-Control": "no-cache"})

    # --------------------------------------------------------------------- API
    def api(self, method: str, path: str, qs: dict):
        route = path.rstrip("/") or path

        # ---- estado general ------------------------------------------------
        if route == "/api/bootstrap":
            first, last = stats.bounds()
            return self.json({
                "has_data": first is not None,
                "first_ts": first, "last_ts": last,
                "totals": {
                    "plays": db.scalar("SELECT COUNT(*) FROM plays"),
                    "tracks": db.scalar("SELECT COUNT(*) FROM dim_track"),
                    "artists": db.scalar("SELECT COUNT(*) FROM dim_artist"),
                    "albums": db.scalar("SELECT COUNT(*) FROM dim_album"),
                    "shows": db.scalar("SELECT COUNT(*) FROM dim_show"),
                    "episodes": db.scalar("SELECT COUNT(*) FROM plays WHERE kind='episode'"),
                },
                "config": {k: cfg(k) for k in DEFAULTS},
                "spotify": client.status(),
                "enrich": enrich.state(),
                "sync": sync.state(),
                "files": [dict(r) for r in db.q(
                    "SELECT name, rows, added, imported_at FROM files ORDER BY name")],
                "years": [r["y"] for r in db.q(
                    "SELECT DISTINCT strftime('%Y', ts, 'unixepoch') y FROM plays ORDER BY y DESC")],
            })

        if route == "/api/config":
            if method == "POST":
                data = self.read_json()
                for k in ("min_ms", "tz_offset", "market", "sort", "sync_interval", "lang",
                          "client_id", "client_secret", "auth_mode"):
                    if k in data:
                        v = data[k]
                        if k == "sync_interval":
                            try:
                                v = max(sync.MIN_INTERVAL, int(v))
                            except (TypeError, ValueError):
                                continue
                        if k in ("min_ms", "tz_offset"):
                            try:
                                v = int(v)
                            except (TypeError, ValueError):
                                continue
                        db.set_meta(k, v)
                if any(k in data for k in ("client_id", "client_secret", "auth_mode")):
                    client.reset_token()
            return self.json({"config": {k: cfg(k) for k in DEFAULTS},
                              "spotify": client.status()})

        # ---- estadísticas --------------------------------------------------
        if route == "/api/overview":
            f = _filt(qs)
            return self.json({
                "range": f.rng, "summary": stats.summary(f),
                "timeline": stats.timeline(f),
                "patterns": stats.patterns(f),
                "records": stats.records(f),
                "top_artists": stats.top(f, "artists", cfg("sort"), 6)["items"],
                "top_tracks": stats.top(f, "tracks", cfg("sort"), 6)["items"],
                "top_albums": stats.top(f, "albums", cfg("sort"), 6)["items"],
            })

        if route == "/api/top":
            what = qs.get("type", "tracks")
            if what not in stats._TOP_SPEC:
                return self.fail("tipo inválido")
            kind = "episode" if what == "shows" else "track"
            f = _filt(qs, kind)
            res = stats.top(f, what, qs.get("sort") or cfg("sort"),
                            _int(qs, "limit", 50, 1, 500), _int(qs, "offset", 0, 0, 100000))
            res["range"] = f.rng
            return self.json(res)

        if route == "/api/timeline":
            f = _filt(qs)
            return self.json(stats.timeline(f, qs.get("granularity")))

        if route == "/api/patterns":
            f = _filt(qs)
            return self.json({"range": f.rng, "patterns": stats.patterns(f),
                              "summary": stats.summary(f)})

        if route == "/api/calendar":
            f = _filt(qs)
            return self.json(stats.calendar(f))

        if route == "/api/records":
            f = _filt(qs)
            return self.json(stats.records(f))

        if route == "/api/discoveries":
            f = _filt(qs)
            return self.json(stats.discoveries(f, _int(qs, "limit", 40, 1, 200)))

        if route == "/api/genres":
            f = _filt(qs)
            return self.json(stats.genres(f, _int(qs, "limit", 30, 1, 100)))

        if route == "/api/detail":
            kind, key = qs.get("kind"), qs.get("key")
            if kind not in stats._DETAIL_COL or not key:
                return self.fail("faltan kind o key")
            f = _filt(qs, "episode" if kind == "show" else "track")
            return self.json(stats.detail(kind, key, f))

        if route == "/api/history":
            f = _filt(qs, qs.get("kind") or "track")
            return self.json(stats.history(f, _int(qs, "limit", 100, 1, 500),
                                           _int(qs, "offset", 0, 0, 1000000),
                                           (qs.get("q") or "").strip()))

        if route == "/api/years":
            return self.json({"years": stats.years(int(cfg("min_ms") or 0),
                                                   int(cfg("tz_offset") or 0))})

        # ---- metadatos -----------------------------------------------------
        if route == "/api/meta" and method == "POST":
            data = self.read_json()
            kind = data.get("kind", "tracks")
            keys = [k for k in (data.get("keys") or []) if isinstance(k, str)][:300]
            out = {"items": enrich.images_for(kind, keys)}
            if client.configured():
                missing = enrich.missing_ids(kind, keys)
                if missing:
                    enrich.queue_priority(kind, missing)
                    if not enrich.state()["running"]:
                        enrich.start(full=True)
                out["pending"] = len(missing)
            return self.json(out)

        # ---- importación ---------------------------------------------------
        if route == "/api/import/path" and method == "POST":
            raw_path = (self.read_json().get("path") or "").strip().strip('"')
            if not raw_path:
                return self.fail("Indicá una carpeta o archivo")
            st = ingest.new_stats()
            ingest.import_path(raw_path, st)
            return self.json(ingest.finalize(st))

        if route == "/api/import/upload" and method == "POST":
            name = qs.get("name") or "archivo.json"
            raw = self.read_body()
            st = ingest.new_stats()
            if name.lower().endswith(".zip") or raw[:2] == b"PK":
                ingest.import_zip_bytes(raw, st, name)
            else:
                ingest.import_json_bytes(raw, name, st)
            final = qs.get("final") == "1"
            return self.json(ingest.finalize(st) if final else st)

        if route == "/api/import/finish" and method == "POST":
            return self.json(ingest.finalize(ingest.new_stats()))

        if route == "/api/reset" and method == "POST":
            if self.read_json().get("confirm") != "BORRAR":
                return self.fail("Falta confirmación")
            c = db.conn()
            c.execute("BEGIN")
            for t in ("plays", "files", "dim_track", "dim_artist", "dim_album", "dim_show",
                      "link_track", "link_artist", "link_album", "link_show"):
                c.execute(f"DELETE FROM {t}")
            c.execute("COMMIT")
            c.execute("VACUUM")
            return self.json({"ok": True})

        # ---- Spotify -------------------------------------------------------
        if route == "/api/spotify/test" and method == "POST":
            return self.json(client.ping())

        if route == "/api/spotify/logout" and method == "POST":
            sync.stop()
            client.logout()
            return self.json({"ok": True, "spotify": client.status()})

        if route == "/api/sync/status":
            return self.json(sync.state())

        if route == "/api/sync/now" and method == "POST":
            res = sync.run_once()
            res["state"] = sync.state()
            return self.json(res)

        if route == "/api/sync/start" and method == "POST":
            return self.json({**sync.start(), "state": sync.state()})

        if route == "/api/sync/stop" and method == "POST":
            return self.json({**sync.stop(), "state": sync.state()})

        if route == "/api/spotify/tops":
            return self.json(sync.spotify_tops(_int(qs, "limit", 5, 1, 20)))

        if route == "/api/enrich/status":
            return self.json(enrich.state())

        if route == "/api/enrich/start" and method == "POST":
            return self.json(enrich.start(full=self.read_json().get("full", True)))

        if route == "/api/enrich/stop" and method == "POST":
            return self.json(enrich.stop())

        if route == "/auth/login":
            if not client.client_id:
                return self.fail("Cargá primero el Client ID")
            url = client.pkce_authorize_url(f"{self.base_url}/auth/callback")
            self.send_response(302)
            self.send_header("Location", url)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return None

        if route == "/auth/callback":
            if qs.get("error"):
                msg = f"Spotify rechazó la autorización: {qs['error']}"
            else:
                try:
                    client.pkce_exchange(qs.get("code", ""), qs.get("state", ""),
                                         f"{self.base_url}/auth/callback")
                    msg = None
                    if db.get_meta("sync_enabled", False):
                        sync.start()
                except SpotifyError as e:
                    msg = str(e)
            dest = "/#/ajustes" + ("?auth_error=" + urllib.parse.quote(msg) if msg else "?auth=ok")
            self.send_response(302)
            self.send_header("Location", dest)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return None

        return self.fail(f"No existe {route}", 404)


def serve(host: str, port: int) -> ThreadingHTTPServer:
    httpd = ThreadingHTTPServer((host, port), Handler)
    httpd.daemon_threads = True
    t = threading.Thread(target=httpd.serve_forever, daemon=True, name="vinilo-http")
    t.start()
    return httpd
