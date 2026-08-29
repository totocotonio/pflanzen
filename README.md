# 🪴 Grünzeug – Pflanzen gießen

Progressive Web App zur Pflege von Zimmerpflanzen: Gießplan, Pflanzen-Datenbank und Push-Erinnerungen. Läuft offline, speichert alles lokal im Browser und ist auf dem Handy als App installierbar.

**Status:** ✅ Live (v1.14.0)
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
✅ **Rückgängig** – die Meldung nach dem Gießen oder Düngen enthält sechs Sekunden lang einen Rückgängig-Knopf
✅ **Farbcodierung** – grün (heute fällig), orange (demnächst), rot (überfällig)
✅ **Fortschrittsbalken** – zeigt, wie weit das Intervall aufgebraucht ist
✅ **Kacheln als Filter** – Tippen auf „fällig", „in 2 Tagen" oder „Pflanzen" zeigt nur diese Auswahl
✅ **Winter-Modus** – verlängert alle Intervalle um Faktor 1,5; automatisch von November bis Februar
✅ **Vorwarnung** – 0 bis 7 Tage vor Fälligkeit; Kachel und „Demnächst“ folgen der Einstellung
✅ **Plan-Ansicht** – die nächsten 14 Tage nach Kalendertagen gruppiert

### Pflanzen-Datenbank

✅ **Pflanze anlegen** – Name mit Vorschlägen, Art, Standort per Dropdown, Gießintervall, Wassermenge
✅ **Foto oder Emoji** – Kamera-/Galerie-Foto wird auf 400 px verkleinert und als JPEG in den localStorage gelegt; alternativ 15 Emoji zur Auswahl
✅ **Pflegevorschläge** – 80 Arten und Sorten mit Richtwerten für Intervall, Licht, Menge und Pflegehinweis; erkennt Zweitnamen („Benjamini"), Mehrzahl („Efeutüten") und Umlaut-Schreibweisen
✅ **Fotoverlauf** – bis zu sechs Bilder je Pflanze mit Datum, Großansicht per Antippen
✅ **Statistik** – Gießvorgänge je Woche, Wasserverbrauch, Pünktlichkeit je Pflanze
✅ **Suche** – über Name, Art, Standort, Notiz, Licht und Menge; mehrere Wörter in beliebiger Reihenfolge
✅ **Standort-Filter** – Chips über dem Raster, Räume werden automatisch aus den Pflanzen gesammelt
✅ **Lichtbedarf & Notizen** – Freitext für Umtopfen, Schädlinge, Besonderheiten
✅ **Pflegeaufgaben** – Düngen (in Tagen), Umtopfen und Schneiden (in Monaten), je Pflanze einzeln einstellbar
✅ **Alle auf einmal** – ein Knopf hakt alle fälligen Pflanzen ab, Rückgängig nimmt den ganzen Schwung zurück
✅ **Urlaubsmodus** – Zeitraum eingeben: was vorher zu gießen ist, was währenddessen fällig wird, als Liste zum Weitergeben
✅ **Verlauf** – die letzten acht Gieß- und Düngevorgänge je Pflanze
✅ **Beispielpflanzen** – acht typische Zimmerpflanzen auf Knopfdruck, angeboten auf dem leeren Startbildschirm
✅ **Löschen** – einzeln in der Detailansicht, alles auf einmal unter Mehr → Daten

### App & Daten

✅ **PWA** – installierbar auf iOS und Android, eigener Startbildschirm, Standalone-Modus
✅ **Offline** – Service Worker cached alle Assets (Network-First für HTML, Cache-First für Rest)
✅ **Export / Import** – vollständiges JSON-Backup aller Pflanzen, Verläufe und Einstellungen
✅ **Push-Erinnerungen** – täglich zur frei wählbaren Uhrzeit, aber nur wenn etwas fällig ist
✅ **Versionshistorie** – in der App unter Mehr → Über einsehbar

### Personalisierung

✅ **Begrüßung mit Namen** – tageszeitabhängig, statt der Überschrift „Heute"
✅ **Acht Akzentfarben** – Grün, Blau, Türkis, Violett, Pink, Rot, Orange, Gelb; je Farbe ein eigener Ton für hell und dunkel
✅ **Hintergrund** – sechs Verläufe oder ein eigenes Foto; Flächen werden dann durchscheinend, Fotos bekommen einen Schleier für die Lesbarkeit
✅ **Eigenes Symbol** – 15 Emoji oder ein eigenes Foto im Kopf der Startseite
✅ **App-Name** – ersetzt „Grünzeug" in Kopfzeile, Anmeldung und Browser-Tab
✅ **Startansicht** – Heute, Pflanzen oder Plan

Alles gehört zum Konto und wird mitsynchronisiert – zwei Konten können unterschiedlich aussehen.

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
| Offline | Service Worker (`sw.js`), Cache `gruenzeug-v1.14.0` |
| Icons | in `gen_icons.py` mit Pillow generiert |
| Push | Web Push API + VAPID, pywebpush, systemd-Timer alle 15 Minuten |
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
  main.py                 FastAPI: Anmeldung, Sitzungen, Datensatz, Push-Endpunkte
  push.py                 VAPID-Schlüssel, Abo-Tabelle, Versand
  cron.py                 ermittelt fällige Pflanzen und verschickt die Erinnerungen
  manage.py               Benutzer anlegen, Passwort ändern, löschen
  install_api.sh          Setup auf dem LXC (venv, systemd, Timer, Nginx-Site)
  gruenzeug.service       systemd-Unit der API
  gruenzeug-push.timer    alle 15 Minuten
  gruenzeug-push.service  einmaliger Lauf von cron.py
```

---

## Erinnerungen

Ein systemd-Timer ruft alle 15 Minuten `cron.py` auf. Für jedes angemeldete Gerät wird geprüft, ob die eingestellte Uhrzeit erreicht ist, ob heute schon gesendet wurde und ob überhaupt eine Pflanze fällig ist. Nur dann geht eine Nachricht raus – pro Tag höchstens eine.

Die Fälligkeit rechnet `cron.py` mit derselben Regel wie das Frontend, Winterfaktor eingeschlossen.

```bash
cd /opt/gruenzeug-api
venv/bin/python cron.py --trocken     # zeigt an, was verschickt würde
systemctl list-timers gruenzeug-push.timer
journalctl -u gruenzeug-push -n 20 --no-pager
```

**Auf dem iPhone** stellt Safari die Notification-API nur bereit, wenn die Seite über „Teilen → Zum Home-Bildschirm" installiert wurde (ab iOS 16.4). Im normalen Safari-Tab gibt es keine Benachrichtigungen; die App erklärt das an Ort und Stelle.

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
| GET | `/api/push/key` | öffentlicher VAPID-Schlüssel (ohne Anmeldung, der Client braucht ihn zum Abonnieren) |
| POST | `/api/push/subscribe` | Gerät anmelden bzw. Uhrzeit ändern |
| POST | `/api/push/unsubscribe` | Gerät abmelden |
| POST | `/api/push/test` | Testnachricht an alle Geräte des Kontos |

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
    "duengerInt": 30,          // Tage, 0 = aus
    "duengerLetzt": "2026-08-01",
    "umtopfenMon": 12,         // Monate, 0 = aus
    "umtopfenLetzt": "2025-03-14",
    "schneidenMon": 6,
    "schneidenLetzt": "",
    "licht": "Hell, ohne direkte Sonne",
    "notiz": "Im Frühjahr umtopfen",
    "fotos": [{ "id": "…", "bild": "data:image/jpeg;base64,…", "ts": 1756483200000 }],
    "created": 1756483200000
  }],
  "logs": [{ "id": "…", "plantId": "l8x2k9a", "typ": "wasser", "ts": 1756483200000 }],
  "settings": { "winter": "auto", "vorwarn": 2, "pushZeit": "09:00", "pushAktiv": false }
}
```

`typ` ist `"wasser"`, `"duenger"`, `"umtopfen"` oder `"schneiden"`. `winter` ist `"auto"`, `"0"` oder `"1"`.

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
| **v1.14.0** | Küchenkräuter ergänzt (80 Arten) |
| **v1.13.0** | Pflanzenliste auf 75 Arten erweitert, Zweitnamen und Mehrzahl |
| **v1.12.0** | Namensvorschläge, Standort als Dropdown |
| **v1.11.0** | Suche in der Pflanzenliste |
| **v1.10.0** | Pflegevorschläge nach Art, Fotoverlauf, Statistik |
| **v1.9.0** | Sammel-Gießen, Umtopfen/Schneiden, Urlaubsmodus |
| **v1.8.2** | Versand der Benachrichtigungen repariert (VAPID-Schlüsselformat) |
| **v1.8.1** | Push-Zustand wird gegen das tatsächliche Abo geprüft |
| **v1.8.0** | Rückgängig nach Gießen und Düngen |
| **v1.7.1** | Knopf für Beispielpflanzen unter Mehr entfernt |
| **v1.7.0** | Vorwarnung bis 7 Tage, Kachel folgt der Einstellung |
| **v1.6.0** | Kennzahl-Kacheln filtern die Liste auf der Startseite |
| **v1.5.0** | Push-Erinnerungen mit VAPID, Timer und Testnachricht |
| **v1.4.0** | Personalisierung: Name, Akzentfarbe, Hintergrund, Symbol, App-Name, Startansicht |
| **v1.3.0** | Beispielpflanzen, Löschen direkt in der Detailansicht |
| **v1.2.0** | Anmeldung und Geräte-Sync über eigenes FastAPI-Backend |
| **v1.1.0** | Hell/Dunkel/System umschaltbar, Desktop-Layout ab 768 px |
| **v1.0.0** | Erste Fassung: Gießplan, Pflanzen-Datenbank, Plan-Ansicht, Foto/Emoji, Dünger-Intervall, Winter-Modus, Export/Import, PWA mit Service Worker |

Vollständige Liste in [CHANGELOG.md](CHANGELOG.md).

---

## Lizenz

Privat entwickelt – alle Rechte vorbehalten.
