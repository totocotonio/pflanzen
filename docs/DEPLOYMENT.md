# Deployment – Grünzeug

## Überblick

Grünzeug ist eine rein statische PWA. Der Server liefert nur Dateien aus, es läuft kein Anwendungscode auf dem Container. Deshalb reicht Nginx; es gibt keinen systemd-Service für die App selbst.

```
Laptop (Windows)                LXC 192.168.178.37           Nginx Proxy Manager
─────────────────               ──────────────────           ───────────────────
pflanzen_gießen/    ──SFTP──►   /opt/gruenzeug/    ◄──:80──   pflanzen.michaely.de
  python deploy.py               nginx                        Let's Encrypt, Force SSL
```

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

| Feld | Wert |
|---|---|
| Domain | `pflanzen.michaely.de` |
| Scheme | `http` |
| Forward Hostname | `192.168.178.37` |
| Forward Port | `80` |
| Block Common Exploits | an |
| SSL | Let's Encrypt, Force SSL an, HTTP/2 an |

Vorher muss die Subdomain per DNS auf die öffentliche IP zeigen (CNAME auf `serverdienste.selfhost.eu`, wie bei den anderen Projekten).

---

## Laufende Updates

```bash
python deploy.py
```

Lädt die statischen Dateien per SFTP nach `/opt/gruenzeug/`. Kein Neustart nötig – Nginx liest die Dateien bei jedem Request frisch.

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
systemctl status nginx
nginx -t                                    # Konfiguration prüfen
systemctl reload nginx                      # nach Config-Änderung
tail -f /var/log/nginx/gruenzeug.error.log
ls -la /opt/gruenzeug/                      # was liegt wirklich da?
```

---

## Offene Punkte

- **Push-Server**: Web Push braucht einen Absender mit VAPID-Schlüsselpaar. Vorbild ist der `womo-push`-Container (LXC 125): FastAPI + pywebpush, systemd-Service, täglicher Cronjob. In `app.js` sind die Konstanten `PUSH_SERVER` und `VAPID_PUBLIC` dafür schon vorbereitet, aktuell leer. Solange sie leer sind, fragt die App nur die Benachrichtigungs-Berechtigung ab und meldet, dass der Server noch fehlt.
