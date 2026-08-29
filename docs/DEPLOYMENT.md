# Deployment – Grünzeug

## Überblick

Das Frontend ist eine statische PWA, dazu kommt ein kleines FastAPI-Backend für Anmeldung und Geräte-Sync. Nginx liefert die Dateien aus und reicht `/api/` an die App auf Port 8500 weiter.

```
Laptop (Windows)                LXC 192.168.178.37              Nginx Proxy Manager
─────────────────               ──────────────────              ───────────────────
pflanzen_gießen/    ──SFTP──►   /opt/gruenzeug/      (statisch)
  python deploy.py                  nginx :80        ◄──:80──   pflanzen.michaely.de
  python deploy.py --api        /opt/gruenzeug-api/             Let's Encrypt, Force SSL
                                  uvicorn 127.0.0.1:8500
                                  systemd: gruenzeug
                                  SQLite: gruenzeug.db
```

Nur Nginx ist von außen erreichbar; die API lauscht ausschließlich auf 127.0.0.1.

---

## Warum HTTPS zwingend ist

Service Worker und die Push API sind an einen *secure context* gebunden. Browser erlauben sie nur über HTTPS oder auf `localhost`. Über `http://192.168.178.37` würde die App zwar angezeigt, aber:

- keine Installation als PWA
- kein Offline-Betrieb
- keine Push-Benachrichtigungen

Deshalb läuft der Zugriff über den Nginx Proxy Manager mit Let's Encrypt.

---

## Erstinstallation

### 1. SSH-Key hinterlegen

In der Proxmox-Konsole des Containers:

```bash
mkdir -p /root/.ssh
echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBDk2MZu5dycdfXwwnnSqSxlj9aGZV/+rB9pEsKdC+BP torst@Torsten-Laptop' >> /root/.ssh/authorized_keys
chmod 700 /root/.ssh && chmod 600 /root/.ssh/authorized_keys
```

### 2. Nginx einrichten

`install.sh` auf den Container kopieren und ausführen:

```bash
bash install.sh
```

Das Skript installiert Nginx, legt `/opt/gruenzeug/` an und schreibt die Site-Konfiguration nach `/etc/nginx/sites-available/gruenzeug`.

### 3. Dateien hochladen

Vom Laptop aus:

```bash
python deploy.py
```

### 4. Proxy Host im NPM anlegen

Der NPM läuft als Docker-Stack auf `192.168.178.156` (`npm-app-1` + MariaDB `npm-db-1`), Admin-UI auf Port 81. Angelegt ist Proxy Host **55** mit Zertifikat **143** (`npm-143`, gültig bis 27.11.2026).

| Feld | Wert |
|---|---|
| Domain | `pflanzen.michaely.de` |
| Scheme | `http` |
| Forward Hostname | `192.168.178.37` |
| Forward Port | `80` |
| Block Common Exploits | an |
| Cache Assets | **aus** (siehe unten) |
| SSL | Let's Encrypt, Force SSL an, HTTP/2 an |

#### ⚠️ „Cache Assets" muss aus bleiben

Ist die Option an, greift im NPM `conf.d/include/assets.conf`. Die enthält:

```nginx
proxy_ignore_headers Set-Cookie Cache-Control Expires X-Accel-Expires;
proxy_hide_header Cache-Control;
proxy_cache_valid any 30m;
```

Der NPM wirft damit die Cache-Header vom LXC weg und setzt eigene. Konkret wird `sw.js` – das dort bewusst mit `no-cache` ausgeliefert wird – im Proxy 30 Minuten zwischengespeichert und beim Client mit mehreren Stunden `max-age` versehen. Nach einem Deploy bekommen bestehende Installationen dann stundenlang den alten Service Worker und damit die alte App.

Der LXC setzt die Header bereits sinnvoll (30 Tage für Assets mit `?v=`-Parameter, `no-cache` für `sw.js`, `index.html` und `manifest.json`). Das NPM-Caching bringt hier nichts und schadet.

Prüfen lässt sich das von außen:

```bash
curl -sI https://pflanzen.michaely.de/sw.js | grep -i cache-control
# soll:  Cache-Control: no-cache
# falsch: Cache-Control: max-age=23544
```

Vorher muss die Subdomain per DNS auf die öffentliche IP zeigen (CNAME auf `serverdienste.selfhost.eu`, wie bei den anderen Projekten).

---

## Backend einrichten

```bash
python deploy.py --api          # lädt server/ nach /opt/gruenzeug-api/
```

Dann einmalig auf dem Container:

```bash
bash /opt/gruenzeug-api/install_api.sh
```

Das Skript legt die virtuelle Umgebung an, installiert die Abhängigkeiten, richtet den systemd-Service `gruenzeug` ein und schreibt die Nginx-Site mit der `/api/`-Weiterleitung.

### Benutzer anlegen

Es gibt bewusst keine Registrierung in der App – die Seite ist öffentlich erreichbar. Benutzer werden auf dem Server angelegt, das Passwort wird dabei interaktiv abgefragt:

```bash
cd /opt/gruenzeug-api
venv/bin/python manage.py adduser torsten
```

Weitere Befehle: `list`, `passwd <name>`, `deluser <name>`.

### Datenbank

`/opt/gruenzeug-api/gruenzeug.db` (SQLite). Enthält Benutzer, Sitzungen und je Benutzer einen JSON-Datensatz mit Pflanzen, Verlauf und Einstellungen. Sichern:

```bash
sqlite3 /opt/gruenzeug-api/gruenzeug.db ".backup /root/gruenzeug-$(date +%F).db"
```

---

## Laufende Updates

```bash
python deploy.py                # nur Frontend
python deploy.py --api          # Frontend + Backend, startet den Dienst neu
```

Lädt die Dateien per SFTP hoch. Beim Frontend ist kein Neustart nötig – Nginx liest die Dateien bei jedem Request frisch.

### ⚠️ Cache-Versionen mitziehen

Der Service Worker cached alle Assets. Wird nur der Dateiinhalt geändert, bekommen bestehende Clients weiter die alte Version. Bei **jeder** Änderung an `index.html`, `app.js`, `style.css` oder `sw.js` deshalb:

1. In `sw.js` die Konstante `CACHE` hochzählen (`gruenzeug-v1.0.0` → `gruenzeug-v1.0.1`)
2. In `sw.js` die `?v=`-Parameter im `ASSETS`-Array anpassen
3. In `index.html` die `?v=`-Parameter bei `style.css` und `app.js` anpassen
4. In `app.js` die Konstante `VERSION` setzen
5. `VERSION`, `CHANGELOG.md` und die Tabelle in `README.md` aktualisieren

Nginx liefert `sw.js`, `index.html` und `manifest.json` mit `Cache-Control: no-cache` aus, damit der Browser die neue Service-Worker-Datei überhaupt bemerkt.

---

## Nützliche Befehle auf dem Container

```bash
systemctl status gruenzeug                  # API
journalctl -u gruenzeug -n 50 --no-pager    # API-Logs
curl -s localhost:8500/api/health           # API direkt (ohne Nginx)
systemctl status nginx
nginx -t                                    # Konfiguration prüfen
systemctl reload nginx                      # nach Config-Änderung
tail -f /var/log/nginx/gruenzeug.error.log
ls -la /opt/gruenzeug/                      # was liegt wirklich da?
```

---

## Erinnerungen (Push)

Eingerichtet über `install_api.sh`, das den Timer gleich mit aktiviert:

```bash
systemctl status gruenzeug-push.timer
systemctl list-timers gruenzeug-push.timer
cd /opt/gruenzeug-api && venv/bin/python cron.py --trocken
```

**VAPID-Schlüssel** liegen in `/opt/gruenzeug-api/vapid.json` (Rechte 600) und werden beim ersten Abruf von `/api/push/key` erzeugt. Daneben liegt derselbe private Schlüssel als `vapid_private.pem`.

⚠️ **Der private Schlüssel muss pywebpush als Dateipfad übergeben werden, nicht als PEM-Text.** Bekommt `webpush()` einen mehrzeiligen PEM-String, landet er in `Vapid.from_string()`, das base64-kodiertes DER erwartet – der Versand scheitert dann mit „Could not deserialize key data … ASN.1 parsing error". Mit einem Pfad greift `Vapid.from_file()`, das PEM versteht. `push.py` legt die PEM-Datei deshalb automatisch an. Diese Datei nicht löschen und nicht ins Repo aufnehmen: mit neuen Schlüsseln werden alle bestehenden Abos ungültig und jedes Gerät müsste sich neu anmelden. Beim Sichern der Datenbank gehört sie mit dazu.

**Zeitzone:** Der Container läuft auf `Europe/Berlin`. Das ist keine Kosmetik – `cron.py` vergleicht die eingestellte Uhrzeit mit der lokalen Serverzeit. Stünde er auf UTC, käme eine für 09:00 eingestellte Erinnerung im Sommer um 11 Uhr.

```bash
timedatectl                      # muss Europe/Berlin zeigen
```

---

## Stolperstellen

**Der Service Worker darf die API nicht cachen.** In der ersten Fassung tat er das: `/api/data` kam aus dem Cache, die App rechnete mit einem veralteten Serverstand und meldete „aktuell", obwohl der Server etwas anderes hatte. `sw.js` nimmt Pfade unter `/api/` deshalb ausdrücklich vom Caching aus – diese Zeile nicht entfernen.

**Cookies brauchen HTTPS.** Das Sitzungs-Cookie wird mit `Secure` gesetzt. Über `http://192.168.178.37` funktioniert die Anmeldung deshalb nicht. Für lokale Entwicklung setzt `devserver.py` die Umgebungsvariable `GRUENZEUG_UNSICHER=1`, die das Flag entfernt – auf dem Server darf sie nicht gesetzt sein.

---

## Offene Punkte

- **Push-Server**: Web Push braucht einen Absender mit VAPID-Schlüsselpaar. Der Dienst `gruenzeug` ist der natürliche Ort dafür – Benutzer und Datensätze liegen schon dort, es fehlen die Endpunkte für Subscriptions und ein täglicher Cronjob, der die fälligen Pflanzen ermittelt. In `app.js` sind `PUSH_SERVER` und `VAPID_PUBLIC` vorbereitet, aktuell leer; solange sie leer sind, fragt die App nur die Berechtigung ab und meldet, dass der Server fehlt.
