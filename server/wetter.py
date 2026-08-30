#!/usr/bin/env python3
"""Wetterlage für die Umgebungshinweise.

Zimmerpflanzen stehen drinnen – das Wetter wirkt trotzdem, nur indirekt:

* Unter etwa 15 Grad Außentemperatur läuft die Heizung. Trockene Heizungsluft
  ist die häufigste Ursache für braune Blattspitzen und Spinnmilben.
* Über 28 Grad trocknen Töpfe deutlich schneller aus, besonders am Südfenster.
* Bei Frost wird das Fensterbrett nachts zur Kältefalle, und beim Lüften zieht
  eiskalte Luft über die Blätter.
* In trüben Wochen wächst kaum etwas, entsprechend weniger Wasser wird
  verbraucht.

Daten kommen von Open-Meteo: frei nutzbar, ohne Schlüssel. Der Abruf läuft
bewusst über diesen Server – so baut kein Gerät der Nutzer eine Verbindung
nach außen auf, und Open-Meteo sieht nur die IP des Servers.

© 2026 Torsten Michaely – Alle Rechte vorbehalten
"""
from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request

API = "https://api.open-meteo.com/v1/forecast"
GEO = "https://geocoding-api.open-meteo.com/v1/search"

# Zwei Stunden reichen: Die abgeleitete Lage ändert sich nicht schneller,
# und der Cache hält uns von unnötigen Abrufen ab.
CACHE_DAUER = 2 * 3600
_cache: dict[str, tuple[float, dict]] = {}

# Schwellen. Bewusst großzügig gewählt, damit die Hinweise nicht bei jedem
# Wetterwechsel hin- und herspringen.
HEIZ_GRENZE = 15.0      # Tagesmittel darunter: Heizung läuft
HITZE_GRENZE = 28.0     # Tagesmaximum darüber: Töpfe trocknen schneller
FROST_GRENZE = 1.0      # Nachtminimum darunter: Kältefalle am Fenster
TRUEB_STUNDEN = 2.0     # Sonnenschein am Tag darunter: kaum Wachstum


def _hole(url: str, felder: dict) -> dict:
    voll = url + "?" + urllib.parse.urlencode(felder)
    with urllib.request.urlopen(voll, timeout=12) as antwort:
        return json.load(antwort)


def orte_suchen(begriff: str, anzahl: int = 5) -> list[dict]:
    """Ortssuche für die Einstellung. Liefert Name, Region und Koordinaten."""
    begriff = (begriff or "").strip()
    if len(begriff) < 2:
        return []
    try:
        daten = _hole(GEO, {"name": begriff, "count": anzahl,
                            "language": "de", "format": "json"})
    except Exception:
        return []

    raus = []
    for e in daten.get("results") or []:
        teile = [e.get("admin1"), e.get("country")]
        raus.append({
            "name": e.get("name") or "",
            "region": ", ".join(t for t in teile if t),
            "lat": round(float(e.get("latitude", 0)), 4),
            "lon": round(float(e.get("longitude", 0)), 4),
        })
    return raus


def _mittel(werte) -> float | None:
    zahlen = [float(w) for w in werte if w is not None]
    return sum(zahlen) / len(zahlen) if zahlen else None


def lage(lat: float, lon: float) -> dict:
    """Die abgeleitete Lage an diesem Ort.

    Zurück kommt kein Wetterbericht, sondern das, was für Zimmerpflanzen
    zählt: läuft die Heizung, ist es zu heiß, droht Frost, ist es trüb – und
    was das fürs Gießen bedeutet.

    Gerechnet wird über drei vergangene und drei kommende Tage. Ein einzelner
    warmer Nachmittag soll die Lage nicht kippen.
    """
    schluessel = f"{round(lat, 2)},{round(lon, 2)}"
    zwischen = _cache.get(schluessel)
    if zwischen and time.time() - zwischen[0] < CACHE_DAUER:
        return zwischen[1]

    daten = _hole(API, {
        "latitude": lat, "longitude": lon,
        "daily": "temperature_2m_max,temperature_2m_min,sunshine_duration",
        "timezone": "Europe/Berlin",
        "past_days": 3, "forecast_days": 3,
    })
    tag = daten.get("daily") or {}
    tmax = tag.get("temperature_2m_max") or []
    tmin = tag.get("temperature_2m_min") or []
    sonne = tag.get("sunshine_duration") or []

    # Index 3 ist heute (drei vergangene Tage stehen davor)
    heute = 3 if len(tmax) > 3 else max(0, len(tmax) - 1)
    rueckblick = slice(max(0, heute - 2), heute + 1)
    ausblick = slice(heute, heute + 3)

    max_rueck = [t for t in tmax[rueckblick] if t is not None]
    min_aus = [t for t in tmin[ausblick] if t is not None]
    mittel = _mittel([(a + b) / 2 for a, b in zip(tmax[rueckblick], tmin[rueckblick])
                      if a is not None and b is not None])
    sonnenstunden = _mittel([s / 3600 for s in sonne[rueckblick] if s is not None])

    heizperiode = mittel is not None and mittel < HEIZ_GRENZE
    hitze = len([t for t in max_rueck if t >= HITZE_GRENZE]) >= 2
    frost = bool(min_aus) and min(min_aus) <= FROST_GRENZE
    trueb = sonnenstunden is not None and sonnenstunden < TRUEB_STUNDEN

    # Nur in eine Richtung: Hitze lässt früher gießen. Das Verlängern im
    # Winter macht weiterhin der Winter-Modus – sonst zählt beides doppelt.
    faktor = 0.8 if hitze else 1.0

    # Die einzelnen Naechte, damit eine Warnung sagen kann, welche gemeint ist.
    # "Heute Nacht 4 Grad" ist etwas anderes als "irgendwann wird es kalt".
    zeiten = tag.get("time") or []
    naechte = []
    for i in range(heute, min(heute + 3, len(tmin))):
        if tmin[i] is None or i >= len(zeiten):
            continue
        naechte.append({"datum": zeiten[i], "tmin": round(float(tmin[i]), 1)})

    ergebnis = {
        "stand": int(time.time()),
        "naechte": naechte,
        "tmax": round(tmax[heute], 1) if heute < len(tmax) and tmax[heute] is not None else None,
        "tmin": round(tmin[heute], 1) if heute < len(tmin) and tmin[heute] is not None else None,
        "mittel": round(mittel, 1) if mittel is not None else None,
        "sonnenstunden": round(sonnenstunden, 1) if sonnenstunden is not None else None,
        "heizperiode": heizperiode,
        "hitze": hitze,
        "frost": frost,
        "trueb": trueb,
        "faktor": faktor,
    }
    _cache[schluessel] = (time.time(), ergebnis)
    return ergebnis


def lage_sicher(lat, lon) -> dict | None:
    """Wie `lage`, aber ohne Ausnahme – Wetter ist nie kritisch genug dafür."""
    try:
        return lage(float(lat), float(lon))
    except Exception as fehler:                          # noqa: BLE001
        print("Wetter nicht abrufbar:", fehler)
        return None


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        for o in orte_suchen(" ".join(sys.argv[1:])):
            print(o)
    else:
        print(json.dumps(lage(52.52, 13.40), indent=2, ensure_ascii=False))
