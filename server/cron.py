#!/usr/bin/env python3
"""Verschickt die Gieß-Erinnerungen.

Läuft per systemd-Timer alle 15 Minuten. Für jedes Push-Abo wird geprüft:
ist die eingestellte Uhrzeit erreicht, wurde heute noch nicht gesendet und
gibt es überhaupt etwas zu gießen? Nur dann geht eine Nachricht raus.

Aufruf:  venv/bin/python cron.py [--trocken]
"""
import json
import sys
from datetime import date, datetime, timedelta

import main
import push

TROCKEN = "--trocken" in sys.argv
PushAbo = main.PushAbo


def eff_intervall(pflanze, einstellungen):
    """Gießintervall inklusive Winterfaktor – gleiche Regel wie im Frontend."""
    intervall = int(pflanze.get("intervall") or 7)
    modus = str(einstellungen.get("winter", "auto"))
    if modus == "1":
        winter = True
    elif modus == "0":
        winter = False
    else:
        winter = datetime.now().month in (11, 12, 1, 2)
    return max(1, round(intervall * (1.5 if winter else 1)))


def faellige(daten):
    """Namen der Pflanzen, die heute oder früher dran sind."""
    einstellungen = daten.get("settings") or {}
    heute = date.today()
    treffer = []
    for p in daten.get("plants") or []:
        letzt = p.get("letzt")
        if not letzt:
            continue
        try:
            jahr, monat, tag = (int(x) for x in str(letzt).split("-"))
            naechste = date(jahr, monat, tag) + timedelta(days=eff_intervall(p, einstellungen))
        except (ValueError, TypeError):
            continue
        if naechste <= heute:
            treffer.append(p.get("name") or "Pflanze")
    return treffer


def nachricht(namen):
    anzahl = len(namen)
    if anzahl == 1:
        return "Zeit zum Gießen", f"{namen[0]} braucht Wasser."
    if anzahl <= 3:
        return "Zeit zum Gießen", ", ".join(namen) + " brauchen Wasser."
    return "Zeit zum Gießen", f"{namen[0]}, {namen[1]} und {anzahl - 2} weitere brauchen Wasser."


def main_lauf():
    jetzt = datetime.now()
    heute_iso = jetzt.date().isoformat()
    s = main.SessionLocal()
    gesendet = uebersprungen = entfernt = 0

    for abo in s.query(PushAbo).all():
        if abo.zuletzt == heute_iso:
            uebersprungen += 1
            continue

        try:
            stunde, minute = (int(x) for x in abo.zeit.split(":"))
        except ValueError:
            stunde, minute = 9, 0
        faellig_ab = jetzt.replace(hour=stunde, minute=minute, second=0, microsecond=0)
        if jetzt < faellig_ab:
            uebersprungen += 1
            continue

        datensatz = s.get(main.Datensatz, abo.user_id)
        if not datensatz:
            uebersprungen += 1
            continue

        namen = faellige(json.loads(datensatz.inhalt))
        if not namen:
            # Nichts zu tun – Tag trotzdem abhaken, damit nicht alle 15 Minuten geprüft wird
            abo.zuletzt = heute_iso
            uebersprungen += 1
            continue

        titel, text = nachricht(namen)
        if TROCKEN:
            benutzer = s.get(main.User, abo.user_id)
            print(f"  [trocken] an {benutzer.name if benutzer else abo.user_id}: {titel} – {text}")
            gesendet += 1
            continue

        erfolg, hinweis = push.senden(abo, titel, text)
        if erfolg:
            abo.zuletzt = heute_iso
            gesendet += 1
        elif hinweis == "abgemeldet":
            s.delete(abo)
            entfernt += 1
        else:
            print(f"  Fehler bei Abo {abo.id}: {hinweis}")

    s.commit()
    s.close()
    print(f"{jetzt:%Y-%m-%d %H:%M} – gesendet: {gesendet}, übersprungen: {uebersprungen}, "
          f"abgemeldete Abos entfernt: {entfernt}")


if __name__ == "__main__":
    main_lauf()
