#!/usr/bin/env python3
"""Tägliche Sicherung der Datenbank.

Läuft per systemd-Timer. Nutzt die SQLite-Backup-Schnittstelle statt einer
Dateikopie – die ist auch dann konsistent, wenn gerade geschrieben wird.

Die VAPID-Schlüssel werden mitgesichert: Ohne sie sind nach einer
Wiederherstellung alle Push-Abos ungültig.

Aufruf:  venv/bin/python backup.py

© 2026 Torsten Michaely – Alle Rechte vorbehalten
"""
import gzip
import os
import shutil
import sqlite3
from datetime import date, datetime, timedelta

BASIS = os.path.dirname(os.path.abspath(__file__))

# Dieselbe Herkunft wie in main.py: Wer die Datenbank per Umgebungsvariable
# woanders hinlegt, soll nicht unbemerkt eine falsche Datei sichern.
QUELLE = os.environ.get("GRUENZEUG_DB", os.path.join(BASIS, "gruenzeug.db"))
ZIEL = os.environ.get("GRUENZEUG_BACKUP", "/var/backups/gruenzeug")
TAGE = 7


def sichern() -> str:
    if not os.path.exists(QUELLE):
        raise FileNotFoundError(f"Datenbank nicht gefunden: {QUELLE}")
    os.makedirs(ZIEL, exist_ok=True)
    stempel = date.today().isoformat()
    datei = os.path.join(ZIEL, f"gruenzeug-{stempel}.db")

    # .backup statt Dateikopie: konsistent auch bei gleichzeitigen Schreibzugriffen
    quelle = sqlite3.connect(f"file:{QUELLE}?mode=ro", uri=True)
    ziel = sqlite3.connect(datei)
    with ziel:
        quelle.backup(ziel)
    ziel.close()
    quelle.close()

    with open(datei, "rb") as roh, gzip.open(datei + ".gz", "wb") as gepackt:
        shutil.copyfileobj(roh, gepackt)
    os.remove(datei)

    # Schlüssel dazu, sonst nützt die Datenbank für Push nichts mehr
    for name in ("vapid.json", "vapid_private.pem"):
        pfad = os.path.join(BASIS, name)
        if os.path.exists(pfad):
            shutil.copy2(pfad, os.path.join(ZIEL, name))

    return datei + ".gz"


def aufraeumen() -> int:
    grenze = date.today() - timedelta(days=TAGE)
    weg = 0
    for name in os.listdir(ZIEL):
        if not name.startswith("gruenzeug-") or not name.endswith(".db.gz"):
            continue
        try:
            wann = date.fromisoformat(name[len("gruenzeug-"):-len(".db.gz")])
        except ValueError:
            continue
        if wann < grenze:
            os.remove(os.path.join(ZIEL, name))
            weg += 1
    return weg


def liste() -> list[dict]:
    """Vorhandene Sicherungen, neueste zuerst."""
    if not os.path.isdir(ZIEL):
        return []
    raus = []
    for name in sorted(os.listdir(ZIEL), reverse=True):
        if not name.startswith("gruenzeug-") or not name.endswith(".db.gz"):
            continue
        pfad = os.path.join(ZIEL, name)
        try:
            raus.append({
                "datum": name[len("gruenzeug-"):-len(".db.gz")],
                "bytes": os.path.getsize(pfad),
                "zeit": datetime.fromtimestamp(os.path.getmtime(pfad)).strftime("%H:%M"),
            })
        except OSError:
            continue
    return raus


if __name__ == "__main__":
    datei = sichern()
    groesse = os.path.getsize(datei) / 1024
    entfernt = aufraeumen()
    print(f"{datetime.now():%Y-%m-%d %H:%M} – gesichert: {os.path.basename(datei)} "
          f"({groesse:.0f} KB), ältere entfernt: {entfernt}")
