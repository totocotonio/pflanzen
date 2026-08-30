#!/usr/bin/env python3
"""Benutzerverwaltung für die Grünzeug-API.

Es gibt bewusst keine offene Registrierung – die Seite ist öffentlich
erreichbar. Benutzer werden hier auf dem Server angelegt.

    python manage.py adduser torsten     # fragt das Passwort ab
    python manage.py passwd torsten      # Passwort ändern
    python manage.py list                # Benutzer anzeigen
    python manage.py deluser name        # Benutzer und Daten löschen

© 2026 Torsten Michaely – Alle Rechte vorbehalten
"""
import getpass
import sys

import bcrypt

from main import Datensatz, Sitzung, SessionLocal, User


def frage_passwort() -> str:
    p1 = getpass.getpass("Passwort: ")
    if len(p1) < 8:
        sys.exit("Passwort muss mindestens 8 Zeichen haben.")
    if p1 != getpass.getpass("Wiederholen: "):
        sys.exit("Passwörter stimmen nicht überein.")
    return p1


def hash_von(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    befehl = sys.argv[1]
    s = SessionLocal()

    if befehl == "list":
        for u in s.query(User).all():
            d = s.get(Datensatz, u.id)
            pflanzen = len((d and __import__("json").loads(d.inhalt).get("plants")) or [])
            print(f"  {u.name:20} angelegt {u.erstellt:%d.%m.%Y}   {pflanzen} Pflanzen, rev {d.rev if d else 0}")

    elif befehl == "adduser":
        if len(sys.argv) < 3:
            sys.exit("Aufruf: python manage.py adduser <name>")
        name = sys.argv[2].strip()
        if s.query(User).filter(User.name == name).first():
            sys.exit(f"Benutzer '{name}' gibt es schon.")
        s.add(User(name=name, passwort_hash=hash_von(frage_passwort())))
        s.commit()
        print(f"Benutzer '{name}' angelegt.")

    elif befehl == "passwd":
        if len(sys.argv) < 3:
            sys.exit("Aufruf: python manage.py passwd <name>")
        u = s.query(User).filter(User.name == sys.argv[2].strip()).first()
        if not u:
            sys.exit("Benutzer nicht gefunden.")
        u.passwort_hash = hash_von(frage_passwort())
        # Alle Sitzungen beenden, damit ein geändertes Passwort wirklich greift
        s.query(Sitzung).filter(Sitzung.user_id == u.id).delete()
        s.commit()
        print(f"Passwort für '{u.name}' geändert, alle Sitzungen beendet.")

    elif befehl == "deluser":
        if len(sys.argv) < 3:
            sys.exit("Aufruf: python manage.py deluser <name>")
        u = s.query(User).filter(User.name == sys.argv[2].strip()).first()
        if not u:
            sys.exit("Benutzer nicht gefunden.")
        if input(f"'{u.name}' mit allen Daten löschen? [nein/ja] ") != "ja":
            sys.exit("Abgebrochen.")
        s.query(Sitzung).filter(Sitzung.user_id == u.id).delete()
        s.query(Datensatz).filter(Datensatz.user_id == u.id).delete()
        s.delete(u)
        s.commit()
        print("Gelöscht.")

    else:
        sys.exit(__doc__)

    s.close()


if __name__ == "__main__":
    main()
