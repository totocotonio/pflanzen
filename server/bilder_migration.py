"""Bildspeicher umstellen: --kompakt migriert, --inline bereitet Code-Rollback vor.

Vorher Datenbank sichern. Pro Konto eine Transaktion; Revisionsnummern bleiben
gleich. Bilder liegen weiterhin in derselben SQLite-Datei und deren Backups.
"""
import argparse
import json

import bilder
from main import Bild, Datensatz, SessionLocal, User, Version, schreibtransaktion


def migrieren(kompakt=True):
    anzahl = 0
    with SessionLocal() as s:
        ids = [id_ for (id_,) in s.query(User.id).all()]
        for user_id in ids:
            schreibtransaktion(s)
            for modell in (Datensatz, Version):
                key = modell.user_id if modell is Datensatz else modell.id
                schluessel = [id_ for (id_,) in s.query(key).filter(modell.user_id == user_id).all()]
                # Große historische JSON-Stände einzeln laden, nicht alle
                # zwanzig Bildbestände gleichzeitig im Arbeitsspeicher halten.
                for id_ in schluessel:
                    zeile = s.get(modell, id_)
                    original = json.loads(zeile.inhalt)
                    voll = bilder.inline(original, s, Bild, user_id)
                    neu = bilder.kompakt(voll, s, Bild, user_id) if kompakt else voll
                    if bilder.inline(neu, s, Bild, user_id) != voll:
                        raise RuntimeError("Bildmigration verändert den Datensatz")
                    zeile.inhalt = json.dumps(neu, ensure_ascii=False, separators=(",", ":"))
                    s.flush()
                    s.expunge(zeile)
                    anzahl += 1
            s.commit()
    return anzahl


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--kompakt", action="store_true")
    mode.add_argument("--inline", action="store_true")
    args = parser.parse_args()
    print(f"{migrieren(args.kompakt)} Daten-/Versionsstände geprüft und umgestellt.")
