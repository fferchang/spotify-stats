#!/usr/bin/env python3
"""Vinilo — tus estadísticas de Spotify, calculadas en tu propia máquina.

Uso:
    python run.py                        # abre la app en el navegador
    python run.py --import "C:\\ruta\\export"   # importa y abre
    python run.py --port 8420 --no-browser

Sólo usa la biblioteca estándar de Python 3.10+. No hay nada que instalar.
"""
from __future__ import annotations

import argparse
import os
import socket
import sys
import threading
import time
import webbrowser
from datetime import datetime
from pathlib import Path

# La consola de Windows usa cp1252 y revienta con acentos o flechas.
for stream in (sys.stdout, sys.stderr):
    try:
        # line_buffering para que el banner salga ya, aunque se redirija a un archivo.
        stream.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
    except (AttributeError, ValueError):
        pass

sys.path.insert(0, str(Path(__file__).resolve().parent))

from vinilo import db, ingest, server, sync  # noqa: E402
from vinilo.spotify import client  # noqa: E402

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
GREEN, DIM, BOLD, OFF = "\033[38;5;79m", "\033[2m", "\033[1m", "\033[0m"


def supports_color() -> bool:
    if os.name == "nt" and not os.environ.get("WT_SESSION"):
        try:  # habilita secuencias ANSI en la consola clásica de Windows
            import ctypes
            k = ctypes.windll.kernel32
            k.SetConsoleMode(k.GetStdHandle(-11), 7)
            return True
        except Exception:
            return False
    return sys.stdout.isatty()


def paint(text: str, *codes: str) -> str:
    return "".join(codes) + text + OFF if COLOR else text


COLOR = supports_color()


def free_port(host: str, preferred: int) -> int:
    for port in [preferred] + [preferred + i for i in range(1, 20)]:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind((host, port))
                return port
            except OSError:
                continue
    raise SystemExit(f"No encontré un puerto libre cerca de {preferred}")


def local_tz_offset() -> int:
    """Desfase local en segundos (Argentina = -10800)."""
    return int(-time.timezone if not time.daylight else -time.altzone)


def human(ts) -> str:
    return datetime.fromtimestamp(ts).strftime("%d/%m/%Y") if ts else "—"


def main() -> None:
    ap = argparse.ArgumentParser(description="Vinilo — estadísticas locales de Spotify")
    ap.add_argument("--import", dest="import_path", metavar="RUTA",
                    help="carpeta, .zip o .json del historial a importar al arrancar")
    ap.add_argument("--port", type=int, default=8420)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--db", default=str(DATA / "vinilo.db"))
    ap.add_argument("--no-browser", action="store_true")
    args = ap.parse_args()

    DATA.mkdir(exist_ok=True)
    db.init(args.db)

    if db.get_meta("tz_offset") is None:
        db.set_meta("tz_offset", local_tz_offset())

    print()
    print(paint("  ▌ Vinilo", BOLD, GREEN) + paint("  ·  estadísticas de Spotify, en tu máquina", DIM))
    print(paint("  " + "─" * 58, DIM))

    if args.import_path:
        print(f"  Importando {args.import_path} ...")
        st = ingest.new_stats()
        ingest.import_path(args.import_path, st)
        ingest.finalize(st)
        for err in st["errors"]:
            print(paint(f"  ! {err}", DIM))
        print(f"  {st['added']:,} reproducciones nuevas de {st['files']} archivos"
              .replace(",", "."))

    first, last = db.q1("SELECT MIN(ts) a, MAX(ts) b FROM plays")[:2]
    total = db.scalar("SELECT COUNT(*) FROM plays")
    if total:
        print(f"  {total:,}".replace(",", ".") + " reproducciones  ·  "
              f"{human(first)} → {human(last)}  ·  "
              f"{db.scalar('SELECT COUNT(*) FROM dim_artist'):,}".replace(",", ".") + " artistas")
    else:
        print(paint("  Todavía no hay datos: subí tu historial desde la web.", DIM))

    if not client.configured():
        print(paint("  Sin credenciales de Spotify: no habrá portadas ni géneros "
                    "(se configura en Ajustes).", DIM))

    sync.autostart()
    if db.get_meta("sync_enabled", False):
        print(paint("  Sincronización en vivo activada.", DIM))

    port = free_port(args.host, args.port)
    server.serve(args.host, port)
    url = f"http://{args.host}:{port}"

    print()
    print("  " + paint(url, BOLD, GREEN))
    print(paint("  Ctrl+C para salir", DIM))
    print()

    if not args.no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()

    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        print(paint("\n  Listo. Tus datos quedan en data/ y no salieron de acá.\n", DIM))


if __name__ == "__main__":
    main()
