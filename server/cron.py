#!/usr/bin/env python3
"""Verschickt die Erinnerungen.

Läuft per systemd-Timer alle 15 Minuten. Für jedes Push-Abo wird geprüft:
ist die eingestellte Uhrzeit erreicht, wurde heute noch nicht gesendet und
gibt es überhaupt etwas zu tun? Nur dann geht eine Nachricht raus.

Die Fälligkeit wird nach denselben Regeln gerechnet wie im Frontend –
Winterfaktor je Pflanze eingeschlossen. Weichen beide voneinander ab,
erinnert der Server an Dinge, die die App gar nicht als fällig anzeigt.

Aufruf:  venv/bin/python cron.py [--trocken]

© 2026 Torsten Michaely – Alle Rechte vorbehalten
"""
import calendar
import json
import sys
from datetime import date, datetime, timedelta

import main
import push

TROCKEN = "--trocken" in sys.argv
PushAbo = main.PushAbo

# Muss zur Tabelle AUFGABEN in app.js passen
AUFGABEN = [
    {"int": "duengerInt", "letzt": "duengerLetzt", "einheit": "tage", "verb": "düngen"},
    {"int": "umtopfenMon", "letzt": "umtopfenLetzt", "einheit": "monate", "verb": "umtopfen"},
    {"int": "schneidenMon", "letzt": "schneidenLetzt", "einheit": "monate", "verb": "schneiden"},
]


def als_datum(text):
    """ISO-Datum aus den Daten, None wenn leer oder unbrauchbar."""
    try:
        jahr, monat, tag = (int(x) for x in str(text).split("-"))
        return date(jahr, monat, tag)
    except (ValueError, TypeError, AttributeError):
        return None


def plus_monate(d, anzahl):
    """Monate addieren, ohne über das Monatsende hinauszuschießen."""
    jahr = d.year + (d.month - 1 + anzahl) // 12
    monat = (d.month - 1 + anzahl) % 12 + 1
    tag = min(d.day, calendar.monthrange(jahr, monat)[1])
    return date(jahr, monat, tag)


def ist_winter(einstellungen):
    modus = str(einstellungen.get("winter", "auto"))
    if modus == "1":
        return True
    if modus == "0":
        return False
    return datetime.now().month in (11, 12, 1, 2)


def eff_intervall(pflanze, einstellungen):
    """Gießintervall inklusive Winterruhe – dieselbe Regel wie im Frontend.

    Ein eigener Winterwert der Pflanze schlägt die allgemeine Einstellung.
    """
    intervall = int(pflanze.get("intervall") or 7)
    if not ist_winter(einstellungen):
        return max(1, intervall)
    eigen = float(pflanze.get("winterFaktor") or 0)
    faktor = eigen if eigen else 1.5
    return max(1, round(intervall * faktor))


def offene_punkte(daten):
    """Was heute ansteht: (Pflanzen zum Gießen, Aufgaben als Text)."""
    einstellungen = daten.get("settings") or {}
    heute = date.today()
    giessen, aufgaben = [], []

    for p in daten.get("plants") or []:
        if p.get("archiviert"):
            continue                      # archivierte zählen nirgends mit

        letzt = als_datum(p.get("letzt"))
        if letzt and letzt + timedelta(days=eff_intervall(p, einstellungen)) <= heute:
            giessen.append(p.get("name") or "Pflanze")

        for a in AUFGABEN:
            try:
                intervall = int(p.get(a["int"]) or 0)
            except (TypeError, ValueError):
                continue
            stand = als_datum(p.get(a["letzt"]))
            if not intervall or not stand:
                continue
            faellig = (plus_monate(stand, intervall) if a["einheit"] == "monate"
                       else stand + timedelta(days=intervall))
            if faellig <= heute:
                aufgaben.append((p.get("name") or "Pflanze", a["verb"]))

    return giessen, aufgaben


def nachricht(giessen, aufgaben):
    """Titel und Text. Gießen steht vorne, weil es das Dringendere ist."""
    teile = []

    if giessen:
        anzahl = len(giessen)
        if anzahl == 1:
            teile.append(f"{giessen[0]} braucht Wasser.")
        elif anzahl <= 3:
            teile.append(", ".join(giessen) + " brauchen Wasser.")
        else:
            teile.append(f"{giessen[0]}, {giessen[1]} und {anzahl - 2} weitere brauchen Wasser.")

    if aufgaben:
        # Nach Tätigkeit bündeln: "Orchidee und Monstera düngen"
        nach_verb = {}
        for name, verb in aufgaben:
            nach_verb.setdefault(verb, []).append(name)
        stuecke = []
        for verb, namen in nach_verb.items():
            if len(namen) == 1:
                stuecke.append(f"{namen[0]} {verb}")
            elif len(namen) == 2:
                stuecke.append(f"{namen[0]} und {namen[1]} {verb}")
            else:
                stuecke.append(f"{len(namen)} Pflanzen {verb}")
        satz = ", ".join(stuecke) + "."
        teile.append(("Außerdem: " + satz) if giessen else satz[0].upper() + satz[1:])

    titel = "Zeit zum Gießen" if giessen else "Pflanzenpflege"
    return titel, " ".join(teile)


def main_lauf():
    jetzt = datetime.now()
    heute_iso = jetzt.date().isoformat()
    s = main.SessionLocal()
    gesendet = uebersprungen = entfernt = 0

    for abo in s.query(PushAbo).all():
        if abo.zuletzt == heute_iso:
            uebersprungen += 1
            continue

        # Auf "In 2 Stunden" gedrückt? Dann bis dahin Ruhe.
        if abo.nicht_vor:
            try:
                if jetzt < datetime.fromisoformat(abo.nicht_vor):
                    uebersprungen += 1
                    continue
            except ValueError:
                abo.nicht_vor = ""

        try:
            stunde, minute = (int(x) for x in abo.zeit.split(":"))
        except ValueError:
            stunde, minute = 9, 0
        if jetzt < jetzt.replace(hour=stunde, minute=minute, second=0, microsecond=0):
            uebersprungen += 1
            continue

        datensatz = s.get(main.Datensatz, abo.user_id)
        if not datensatz:
            uebersprungen += 1
            continue

        giessen, aufgaben = offene_punkte(json.loads(datensatz.inhalt))
        if not giessen and not aufgaben:
            # Nichts zu tun – Tag abhaken, damit nicht alle 15 Minuten gerechnet wird
            abo.zuletzt = heute_iso
            uebersprungen += 1
            continue

        titel, text = nachricht(giessen, aufgaben)
        if TROCKEN:
            benutzer = s.get(main.User, abo.user_id)
            print(f"  [trocken] an {benutzer.name if benutzer else abo.user_id}: {titel} – {text}")
            gesendet += 1
            continue

        erfolg, hinweis = push.senden(abo, titel, text)
        if erfolg:
            abo.zuletzt = heute_iso
            abo.nicht_vor = ""
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
