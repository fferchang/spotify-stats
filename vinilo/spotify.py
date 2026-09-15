"""Cliente de la Spotify Web API (sólo stdlib).

Notas de diseño, importantes porque la API cambió bastante:

* En **febrero de 2026** Spotify eliminó los endpoints en lote
  (`GET /v1/tracks`, `/v1/artists`, `/v1/albums`, ...). Sólo quedan los de
  ítem único, así que el enriquecido va de a una pieza y **cachea todo**
  en SQLite para no volver a pedir lo mismo nunca más.
* `GET /v1/search` bajó su `limit` máximo de 50 a 10.
* `audio-features` y `audio-analysis` están muertos desde nov-2024 para apps
  nuevas: no hay "danceability" ni "energy" y no los pedimos.

Soporta dos modos de autenticación:

* ``client_credentials`` — sólo Client ID + Secret, sin login. Es el camino
  simple y alcanza para el catálogo público (portadas, géneros, duración).
* ``pkce`` — login con tu cuenta de Spotify. Sirve de respaldo si el modo
  anterior deja de tener acceso al catálogo.
"""
from __future__ import annotations

import base64
import hashlib
import json
import secrets
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

from . import db

API = "https://api.spotify.com/v1"
ACCOUNTS = "https://accounts.spotify.com"
UA = "Vinilo/1.0 (+local stats app)"
SCOPES = "user-read-private"


class SpotifyError(Exception):
    def __init__(self, message, status=None):
        super().__init__(message)
        self.status = status


class RateLimited(SpotifyError):
    def __init__(self, retry_after: int):
        super().__init__(f"Spotify pidió esperar {retry_after}s", 429)
        self.retry_after = retry_after


def _post_form(url: str, data: dict, headers: dict | None = None) -> dict:
    body = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    req.add_header("User-Agent", UA)
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            payload = json.loads(raw)
            msg = payload.get("error_description") or payload.get("error") or raw
            if isinstance(msg, dict):
                msg = msg.get("message", raw)
        except json.JSONDecodeError:
            msg = raw[:300]
        raise SpotifyError(f"{e.code}: {msg}", e.code) from None
    except urllib.error.URLError as e:
        raise SpotifyError(f"Sin conexión con Spotify: {e.reason}") from None


class Spotify:
    """Cliente con token cacheado, límite de ritmo y respeto por los 429."""

    def __init__(self):
        self._lock = threading.Lock()
        self._next_call = 0.0
        self.min_interval = 1 / 7  # ~7 req/s, prudente
        self.cooldown_until = 0.0
        self.last_error: str | None = None
        self._pkce_verifiers: dict[str, str] = {}

    # ---------------------------------------------------------------- config
    @property
    def client_id(self) -> str:
        return (db.get_meta("client_id", "") or "").strip()

    @property
    def client_secret(self) -> str:
        return (db.get_meta("client_secret", "") or "").strip()

    @property
    def mode(self) -> str:
        return db.get_meta("auth_mode", "client_credentials") or "client_credentials"

    def configured(self) -> bool:
        if not self.client_id:
            return False
        if self.mode == "client_credentials":
            return bool(self.client_secret)
        return bool(db.get_meta("refresh_token"))

    def status(self) -> dict:
        return {
            "configured": self.configured(),
            "mode": self.mode,
            "has_client_id": bool(self.client_id),
            "has_secret": bool(self.client_secret),
            "logged_in": bool(db.get_meta("refresh_token")),
            "cooldown": max(0, round(self.cooldown_until - time.time())),
            "last_error": self.last_error,
        }

    # ----------------------------------------------------------------- token
    def _token(self) -> str:
        tok = db.get_meta("access_token")
        exp = db.get_meta("token_expires", 0) or 0
        if tok and time.time() < exp - 60:
            return tok

        if self.mode == "pkce":
            refresh = db.get_meta("refresh_token")
            if not refresh:
                raise SpotifyError("Falta iniciar sesión con Spotify")
            payload = _post_form(f"{ACCOUNTS}/api/token", {
                "grant_type": "refresh_token",
                "refresh_token": refresh,
                "client_id": self.client_id,
            })
            if payload.get("refresh_token"):
                db.set_meta("refresh_token", payload["refresh_token"])
        else:
            if not (self.client_id and self.client_secret):
                raise SpotifyError("Faltan el Client ID y el Client Secret")
            basic = base64.b64encode(
                f"{self.client_id}:{self.client_secret}".encode()).decode()
            payload = _post_form(f"{ACCOUNTS}/api/token",
                                 {"grant_type": "client_credentials"},
                                 {"Authorization": f"Basic {basic}"})

        tok = payload.get("access_token")
        if not tok:
            raise SpotifyError("Spotify no devolvió un access_token")
        db.set_meta("access_token", tok)
        db.set_meta("token_expires", time.time() + int(payload.get("expires_in", 3600)))
        return tok

    def reset_token(self) -> None:
        db.set_meta("access_token", None)
        db.set_meta("token_expires", 0)

    # -------------------------------------------------------------- petición
    def get(self, path: str, params: dict | None = None, _retry: int = 0):
        """GET a la API. Devuelve dict, o None si el recurso no existe (404)."""
        now = time.time()
        if now < self.cooldown_until:
            raise RateLimited(int(self.cooldown_until - now) + 1)

        with self._lock:
            wait = self._next_call - time.time()
            if wait > 0:
                time.sleep(wait)
            self._next_call = time.time() + self.min_interval

        url = f"{API}{path}"
        if params:
            url += "?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(url)
        req.add_header("Authorization", f"Bearer {self._token()}")
        req.add_header("User-Agent", UA)

        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                self.last_error = None
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code == 429:
                retry = int(e.headers.get("Retry-After", "5") or 5) + 1
                self.cooldown_until = time.time() + retry
                raise RateLimited(retry) from None
            if e.code == 401 and _retry == 0:
                self.reset_token()
                return self.get(path, params, _retry + 1)
            body = e.read().decode("utf-8", "replace")[:300]
            self.last_error = f"HTTP {e.code}: {body}"
            raise SpotifyError(self.last_error, e.code) from None
        except urllib.error.URLError as e:
            self.last_error = f"Red: {e.reason}"
            raise SpotifyError(self.last_error) from None
        except TimeoutError:
            self.last_error = "Timeout"
            raise SpotifyError("Timeout hablando con Spotify") from None

    # --------------------------------------------------------------- helpers
    @staticmethod
    def pick_images(images) -> tuple[str | None, str | None]:
        """Devuelve (grande, chica) de la lista de imágenes de Spotify."""
        if not images:
            return None, None
        ordered = sorted(images, key=lambda im: -(im.get("width") or 0))
        big = ordered[0].get("url")
        small = ordered[-1].get("url")
        for im in ordered:
            if 200 <= (im.get("width") or 0) <= 400:
                small = im.get("url")
                break
        return big, small

    def track(self, track_id: str):
        return self.get(f"/tracks/{track_id}")

    def artist(self, artist_id: str):
        return self.get(f"/artists/{artist_id}")

    def album(self, album_id: str):
        return self.get(f"/albums/{album_id}")

    def show(self, show_id: str, market: str = "US"):
        return self.get(f"/shows/{show_id}", {"market": market})

    def search(self, query: str, type_: str = "track", limit: int = 5):
        # Desde feb-2026 el máximo de `limit` en /search es 10.
        return self.get("/search", {"q": query, "type": type_, "limit": min(limit, 10)})

    def ping(self) -> dict:
        """Comprueba credenciales pidiendo un tema conocido y estable."""
        try:
            data = self.track("4cOdK2wGLETKBW3PvgPWqT")  # Rick Astley, Never Gonna Give You Up
            if data and data.get("name"):
                return {"ok": True, "detail": f"Catálogo accesible ({data['name']})"}
            return {"ok": False, "detail": "La API respondió pero sin datos del catálogo"}
        except SpotifyError as e:
            return {"ok": False, "detail": str(e)}

    # ------------------------------------------------------------------ PKCE
    def pkce_authorize_url(self, redirect_uri: str) -> str:
        verifier = secrets.token_urlsafe(64)[:96]
        challenge = base64.urlsafe_b64encode(
            hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
        state = secrets.token_urlsafe(16)
        self._pkce_verifiers[state] = verifier
        params = {
            "client_id": self.client_id, "response_type": "code",
            "redirect_uri": redirect_uri, "state": state,
            "scope": SCOPES, "code_challenge_method": "S256",
            "code_challenge": challenge,
        }
        return f"{ACCOUNTS}/authorize?" + urllib.parse.urlencode(params)

    def pkce_exchange(self, code: str, state: str, redirect_uri: str) -> None:
        verifier = self._pkce_verifiers.pop(state, None)
        if not verifier:
            raise SpotifyError("El estado de la autorización no coincide (probá de nuevo)")
        payload = _post_form(f"{ACCOUNTS}/api/token", {
            "grant_type": "authorization_code", "code": code,
            "redirect_uri": redirect_uri, "client_id": self.client_id,
            "code_verifier": verifier,
        })
        if not payload.get("refresh_token"):
            raise SpotifyError("Spotify no devolvió refresh_token")
        db.set_meta("refresh_token", payload["refresh_token"])
        db.set_meta("access_token", payload.get("access_token"))
        db.set_meta("token_expires", time.time() + int(payload.get("expires_in", 3600)))
        db.set_meta("auth_mode", "pkce")

    def logout(self) -> None:
        db.set_meta("refresh_token", None)
        self.reset_token()


client = Spotify()
