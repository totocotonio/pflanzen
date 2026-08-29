# 🪴 Grünzeug – Pflanzen gießen

Progressive Web App zur Pflege von Zimmerpflanzen: Gießplan, Pflanzen-Datenbank und Push-Erinnerungen. Läuft offline, speichert alles lokal im Browser und ist auf dem Handy als App installierbar.

**Status:** ✅ Live (v1.0.0)
**Live:** https://pflanzen.michaely.de
**© 2026 Torsten Michaely** – Alle Rechte vorbehalten.

---

## Über das Projekt

Grünzeug beantwortet eine einzige Frage zuverlässig: *Welche Pflanze braucht heute Wasser?* Jede Pflanze bekommt ein Gießintervall in Tagen. Aus dem Intervall und dem Datum des letzten Gießens berechnet die App die nächste Fälligkeit und sortiert alles nach Dringlichkeit. Ein Tipp auf das Tropfen-Symbol setzt „zuletzt gegossen" auf heute und schreibt einen Eintrag in den Verlauf.

Die App ist bewusst ohne Backend gebaut: alle Daten liegen im `localStorage` des Geräts. Nur die Push-Erinnerungen brauchen einen Server, weil Web Push zwingend einen Absender mit VAPID-Schlüsseln benötigt.

---

## Features

### Gießplan

Der Kern der App. Die Ansicht **Heute** zeigt oben drei Kennzahlen (fällig, in zwei Tagen fällig, Gesamtzahl) und darunter die Pflanzen gruppiert nach Dringlichkeit.

✅ **Fälligkeitsberechnung** – letztes Gießdatum + Intervall, tagesgenau
✅ **Ein-Tipp-Gießen** – Tropfen-Button in Liste und Detailansicht, mit Haptik-Feedback
✅ **Farbcodierung** – grün (heute fällig), orange (demnächst), rot (überfällig)
✅ **Fortschrittsbalken** – zeigt, wie weit das Intervall aufgebraucht ist
✅ **Winter-Modus** – verlängert alle Intervalle um Faktor 1,5; automatisch von November bis Februar
✅ **Vorwarnung** – wahlweise 0, 1 oder 2 Tage vor Fälligkeit
✅ **Plan-Ansicht** – die nächsten 14 Tage nach Kalendertagen gruppiert

### Pflanzen-Datenbank

✅ **Pflanze anlegen** – Name, Art, Standort, Gießintervall, Wassermenge
✅ **Foto oder Emoji** – Kamera-/Galerie-Foto wird auf 400 px verkleinert und als JPEG in den localStorage gelegt; alternativ 15 Emoji zur Auswahl
✅ **Standort-Filter** – Chips über dem Raster, Räume werden automatisch aus den Pflanzen gesammelt
✅ **Lichtbedarf & Notizen** – Freitext für Umtopfen, Schädlinge, Besonderheiten
✅ **Düngen** – optionales zweites Intervall mit eigener Fälligkeit
✅ **Verlauf** – die letzten acht Gieß- und Düngevorgänge je Pflanze

### App & Daten

✅ **PWA** – installierbar auf iOS und Android, eigener Startbildschirm, Standalone-Modus
✅ **Offline** – Service Worker cached alle Assets (Network-First für HTML, Cache-First für Rest)
✅ **Export / Import** – vollständiges JSON-Backup aller Pflanzen, Verläufe und Einstellungen
✅ **Push-Erinnerungen** – Web Push zur frei wählbaren Uhrzeit _(Server-Teil folgt)_

---

## Tech-Stack

| Komponente | Technologie |
|---|---|
| Frontend | HTML, CSS, Vanilla JavaScript – keine Frameworks, keine externen Libraries |
| Design | iOS-orientiertes Dark UI, System-Schriften, `env(safe-area-inset-*)` |
| Speicher | `localStorage`, Schlüssel `pg_data` |
| Offline | Service Worker (`sw.js`), Cache `gruenzeug-v1.0.0` |
| Icons | in `gen_icons.py` mit Pillow generiert |
| Push | Web Push API + VAPID (Server folgt) |
| Hosting | LXC Container auf Proxmox |

---

## Dateien

```
index.html          Markup: 4 Ansichten (Heute, Pflanzen, Plan, Mehr) + 2 Sheets
style.css           Komplettes Stylesheet, CSS-Variablen in :root
app.js              Gesamte Logik: State, Fälligkeit, Rendering, Push
sw.js               Service Worker: Caching + Push-Empfang
manifest.json       PWA-Manifest
gen_icons.py        Erzeugt alle Icons neu (python gen_icons.py)
deploy.py           SFTP-Upload zum LXC
```

---

## Datenmodell

Alles liegt unter dem localStorage-Schlüssel `pg_data`:

```jsonc
{
  "v": 1,
  "plants": [{
    "id": "l8x2k9a",          // generiert
    "name": "Monstera",
    "art": "Monstera deliciosa",
    "raum": "Wohnzimmer",
    "emoji": "🪴",
    "foto": "data:image/jpeg;base64,...",  // oder null
    "intervall": 7,            // Tage
    "letzt": "2026-08-29",     // ISO-Datum, zuletzt gegossen
    "menge": "300 ml",
    "duengerInt": 30,          // 0 = Düngen aus
    "duengerLetzt": "2026-08-01",
    "licht": "Hell, ohne direkte Sonne",
    "notiz": "Im Frühjahr umtopfen",
    "created": 1756483200000
  }],
  "logs": [{ "id": "…", "plantId": "l8x2k9a", "typ": "wasser", "ts": 1756483200000 }],
  "settings": { "winter": "auto", "vorwarn": 2, "pushZeit": "09:00", "pushAktiv": false }
}
```

`typ` ist `"wasser"` oder `"duenger"`. `winter` ist `"auto"`, `"0"` oder `"1"`.

---

## Server-Konfiguration

```
Server:    LXC 127 auf Proxmox (Debian 13)
IP:        192.168.178.37
Pfad:      /opt/gruenzeug/
Webserver: nginx 1.26 (Site: /etc/nginx/sites-available/gruenzeug)
Proxy:     Nginx Proxy Manager auf 192.168.178.156 (Docker), Proxy Host 55
Domain:    pflanzen.michaely.de, Let's Encrypt, Force SSL + HTTP/2
```

Es läuft kein Anwendungscode auf dem Container – Nginx liefert nur statische Dateien aus. Entsprechend gibt es keinen systemd-Service für die App und nach einem Deploy ist kein Neustart nötig.

---

## Deployment

```bash
python deploy.py
```

Lädt die statischen Dateien per SFTP (paramiko) nach `/opt/gruenzeug/`. Kein Git-Deploy auf dem Server.

Nach jeder Änderung an `index.html`, `app.js`, `style.css` oder `sw.js`:

1. Cache-Version in `sw.js` (`CACHE`) und die `?v=`-Parameter in `index.html` hochzählen, sonst liefert der Service Worker alte Dateien aus
2. `VERSION`, `CHANGELOG.md` und die Konstante `VERSION` in `app.js` setzen
3. `git commit` + `git push`
4. `python deploy.py`

---

## Icons neu erzeugen

```bash
python gen_icons.py
```

Erzeugt `icon-192.png`, `icon-512.png`, `icon-maskable.png`, `apple-touch-icon.png` und `favicon.ico` aus einem geometrisch gezeichneten Blatt – keine Bilddateien als Quelle nötig.

---

## Versionshistorie

| Version | Änderungen |
|---------|-----------|
| **v1.0.0** | Erste Fassung: Gießplan, Pflanzen-Datenbank, Plan-Ansicht, Foto/Emoji, Dünger-Intervall, Winter-Modus, Export/Import, PWA mit Service Worker |

Vollständige Liste in [CHANGELOG.md](CHANGELOG.md).

---

## Lizenz

Privat entwickelt – alle Rechte vorbehalten.
