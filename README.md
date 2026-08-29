# 🪴 Grünzeug – Pflanzen gießen

Progressive Web App zur Pflege von Zimmerpflanzen: Gießplan, Pflanzen-Datenbank und Push-Erinnerungen. Läuft offline, speichert alles lokal im Browser und ist auf dem Handy als App installierbar.

**Status:** ✅ Live (v1.2.0)
**Live:** https://pflanzen.michaely.de
**© 2026 Torsten Michaely** – Alle Rechte vorbehalten.

---

## Über das Projekt

Grünzeug beantwortet eine einzige Frage zuverlässig: *Welche Pflanze braucht heute Wasser?* Jede Pflanze bekommt ein Gießintervall in Tagen. Aus dem Intervall und dem Datum des letzten Gießens berechnet die App die nächste Fälligkeit und sortiert alles nach Dringlichkeit. Ein Tipp auf das Tropfen-Symbol setzt „zuletzt gegossen" auf heute und schreibt einen Eintrag in den Verlauf.

`localStorage` bleibt der Primärspeicher – die App funktioniert offline vollständig. Wer angemeldet ist, bekommt den Stand zusätzlich auf den Server geschoben, damit Handy und PC dieselben Pflanzen zeigen.

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
✅ **Versionshistorie** – in der App unter Mehr → Über einsehbar

### Konto und Geräte-Sync

✅ **Anmeldung** – Benutzername und Passwort, Sitzung als HttpOnly-Cookie (90 Tage)
✅ **Keine offene Registrierung** – die Seite ist öffentlich erreichbar, Benutzer legt `manage.py` auf dem Server an
✅ **Sync** – Pflanzen, Verlauf und Einstellungen liegen zusätzlich auf dem Server
✅ **Offline-fest** – Änderungen werden gepuffert und nachgeholt, sobald wieder Verbindung besteht
✅ **Konflikterkennung** – jede Änderung erhöht eine Revisionsnummer; hat ein anderes Gerät zwischendurch geschrieben, fragt die App nach, statt fremde Änderungen zu überschreiben
✅ **Ohne Anmeldung nutzbar** – dann bleiben die Daten auf dem Gerät

---

## Tech-Stack

| Komponente | Technologie |
|---|---|
| Frontend | HTML, CSS, Vanilla JavaScript – keine Frameworks, keine externen Libraries |
| Backend | Python, FastAPI, SQLAlchemy, SQLite, bcrypt |
| Design | iOS-orientiertes Dark UI, System-Schriften, `env(safe-area-inset-*)` |
| Speicher | `localStorage`, Schlüssel `pg_data` |
| Offline | Service Worker (`sw.js`), Cache `gruenzeug-v1.2.0` |
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
deploy.py           SFTP-Upload zum LXC (--api lädt auch das Backend hoch)
devserver.py        Lokaler Testserver: API + statische Dateien auf Port 8777

server/
  main.py           FastAPI: Anmeldung, Sitzungen, Datensatz je Benutzer
  manage.py         Benutzer anlegen, Passwort ändern, löschen
  install_api.sh    Setup auf dem LXC (venv, systemd, Nginx-Site)
  gruenzeug.service systemd-Unit
```

---

## API

Alle Antworten JSON, Sitzung über das HttpOnly-Cookie `gz_session`.

| Methode | Pfad | Zweck |
|---|---|---|
| POST | `/api/login` | `{name, passwort}` → setzt das Sitzungs-Cookie |
| POST | `/api/logout` | Sitzung beenden |
| GET | `/api/me` | angemeldeter Benutzer, sonst 401 |
| GET | `/api/data` | `{rev, daten, geaendert}` – `daten` ist `null`, solange nichts gespeichert wurde |
| PUT | `/api/data` | `{rev, daten}` → `{rev}`; bei veralteter `rev` **409** mit dem Serverstand |
| GET | `/api/health` | Erreichbarkeitsprüfung, ohne Anmeldung |

Der Konflikt-Fall (409) ist der Kern des Sync: der Client schickt die Revision, auf der seine Änderung aufsetzt. Stimmt sie nicht mehr, hat ein anderes Gerät geschrieben – die App zeigt dann beide Stände zur Auswahl, statt still zu überschreiben.

### Benutzer anlegen

Auf dem Server, weil das Passwort dabei abgefragt wird:

```bash
cd /opt/gruenzeug-api
venv/bin/python manage.py adduser torsten
venv/bin/python manage.py list
venv/bin/python manage.py passwd torsten
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

1. Cache-Version in `sw.js` (`CACHE`) und die `?v=`-Parameter in `index.html` und `sw.js` hochzählen, sonst liefert der Service Worker alte Dateien aus
2. Version an **fünf** Stellen setzen: Datei `VERSION`, Konstante `VERSION` in `app.js`, Liste `HISTORIE` in `app.js` (wird in der App unter Mehr → Über angezeigt), `CHANGELOG.md` und die Tabelle unten in dieser Datei
3. `git commit` + `git push`
4. `python deploy.py` – bei Änderungen unter `server/` mit `--api`

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
| **v1.2.0** | Anmeldung und Geräte-Sync über eigenes FastAPI-Backend |
| **v1.1.0** | Hell/Dunkel/System umschaltbar, Desktop-Layout ab 768 px |
| **v1.0.0** | Erste Fassung: Gießplan, Pflanzen-Datenbank, Plan-Ansicht, Foto/Emoji, Dünger-Intervall, Winter-Modus, Export/Import, PWA mit Service Worker |

Vollständige Liste in [CHANGELOG.md](CHANGELOG.md).

---

## Lizenz

Privat entwickelt – alle Rechte vorbehalten.
