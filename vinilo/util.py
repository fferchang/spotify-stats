"""Helpers compartidos: normalización de texto, fechas y formato."""
from __future__ import annotations

import functools
import hashlib
import re
import unicodedata
from datetime import datetime, timezone

_WS = re.compile(r"\s+")
SEP = "\u001f"  # separador interno para claves compuestas


@functools.lru_cache(maxsize=100_000)
def norm(s: str | None) -> str:
    """Normaliza un nombre para agrupar variantes (mayúsculas, acentos, espacios).

    'Beyoncé  ' y 'beyonce' caen en la misma clave. No toca sufijos como
    '(Remastered)' a propósito: son versiones distintas y el usuario espera verlas
    separadas cuando de verdad lo son.
    """
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s).casefold()
    s = "".join(c for c in s if not unicodedata.combining(c))
    return _WS.sub(" ", s).strip()


def key2(a: str | None, b: str | None) -> str:
    return norm(a) + SEP + norm(b)


def uri_id(uri: str | None) -> str | None:
    """'spotify:track:4cO...' -> '4cO...'. Tolera IDs pelados y URLs."""
    if not uri:
        return None
    uri = uri.strip()
    if uri.startswith("spotify:"):
        parts = uri.split(":")
        return parts[-1] if len(parts) >= 3 and parts[-1] else None
    if "open.spotify.com" in uri:
        tail = uri.split("?")[0].rstrip("/").split("/")[-1]
        return tail or None
    return uri or None


def dedup_hash(ts: int, ident: str, ms: int) -> str:
    raw = f"{ts}|{ident}|{ms}".encode("utf-8", "replace")
    return hashlib.blake2b(raw, digest_size=12).hexdigest()


def parse_ts(raw) -> int | None:
    """Devuelve epoch UTC en segundos. Acepta los dos formatos del export."""
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        v = int(raw)
        return v // 1000 if v > 10_000_000_000 else v
    s = str(raw).strip()
    if not s:
        return None
    try:
        # Extendido: '2020-01-21T20:59:32Z'
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        # Básico: '2023-01-01 00:00'
        for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
            try:
                dt = datetime.strptime(s, fmt)
                break
            except ValueError:
                continue
        else:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp())


def as_bool_int(v) -> int | None:
    if v is None:
        return None
    if isinstance(v, bool):
        return int(v)
    if isinstance(v, str):
        low = v.strip().lower()
        if low in ("true", "1", "yes"):
            return 1
        if low in ("false", "0", "no"):
            return 0
        return None
    return int(bool(v))


def clean_platform(p: str | None) -> str:
    """Agrupa el campo `platform` (muy ruidoso) en familias de dispositivo."""
    if not p:
        return "Desconocido"
    s = p.lower()
    pairs = [
        ("android", "Android"), ("ios", "iOS"), ("iphone", "iOS"), ("ipad", "iPadOS"),
        ("watchos", "Apple Watch"), ("osx", "macOS"), ("os x", "macOS"), ("darwin", "macOS"),
        ("mac", "macOS"), ("windows", "Windows"), ("webplayer", "Reproductor web"),
        ("web_player", "Reproductor web"), ("partner", "Dispositivo conectado"),
        ("cast", "Chromecast"), ("sonos", "Sonos"), ("playstation", "PlayStation"),
        ("xbox", "Xbox"), ("linux", "Linux"), ("tv", "TV"),
    ]
    for needle, label in pairs:
        if needle in s:
            return label
    return p.split()[0][:24].title() or "Desconocido"
