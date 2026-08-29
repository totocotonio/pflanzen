#!/usr/bin/env python3
"""Lokaler Testserver für die Entwicklung.

Liefert API und statische Dateien aus einer Quelle, damit sich das Frontend
genauso verhält wie hinter Nginx (relative /api-Aufrufe, gleiche Herkunft).

    python devserver.py        ->  http://localhost:8777

Legt beim ersten Start den Benutzer "test" mit dem Passwort "test12345" an.
Die Testdatenbank liegt im Temp-Verzeichnis, nicht im Projekt.
"""
import os
import sys
import tempfile

BASIS = os.path.dirname(os.path.abspath(__file__))
os.environ.setdefault("GRUENZEUG_DB", os.path.join(tempfile.gettempdir(), "gz_dev.db"))
os.environ["GRUENZEUG_UNSICHER"] = "1"          # ohne HTTPS kein Secure-Cookie
sys.path.insert(0, os.path.join(BASIS, "server"))

import bcrypt
import uvicorn
from fastapi.staticfiles import StaticFiles

import main

s = main.SessionLocal()
if not s.query(main.User).filter(main.User.name == "test").first():
    s.add(main.User(name="test",
                    passwort_hash=bcrypt.hashpw(b"test12345", bcrypt.gensalt()).decode()))
    s.commit()
    print('Testbenutzer angelegt: test / test12345')
s.close()

main.app.mount("/", StaticFiles(directory=BASIS, html=True), name="static")

if __name__ == "__main__":
    print("Grünzeug läuft auf http://localhost:8777  (Datenbank: %s)" % os.environ["GRUENZEUG_DB"])
    uvicorn.run(main.app, host="127.0.0.1", port=8777, log_level="warning")
