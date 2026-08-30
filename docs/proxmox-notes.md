<!--
Beschreibung für die Proxmox-Notes des Containers (LXC 127, 192.168.178.37).
In Proxmox: Container auswählen → Summary → Notes → Stift-Symbol → einfügen.
Proxmox rendert Markdown; Bilder nur als Link, deshalb das Icon von der
Live-Seite statt aus dem privaten Repo.
Bei Änderungen an der Infrastruktur hier mitpflegen.
-->

![Grünzeug](https://pflanzen.michaely.de/icon-192.png)

# 🪴 Grünzeug — Pflanzen gießen

Progressive Web App für Gießplan, Pflegeaufgaben und Erinnerungen.
Statisches Frontend über nginx, dazu eine kleine FastAPI für Anmeldung,
Geräte-Sync und Web Push.

**Live:** https://pflanzen.michaely.de
**Repo:** https://github.com/totocotonio/pflanzen (privat)

---

## Dienste

| Dienst | Was | Port |
|---|---|---|
| `nginx` | liefert die App aus, reicht `/api/` weiter | 80 |
| `gruenzeug` | FastAPI (uvicorn), Anmeldung + Sync + Push | 127.0.0.1:8500 |
| `gruenzeug-push.timer` | prüft alle 15 Min, ob Erinnerungen fällig sind | — |

Nur nginx ist von außen erreichbar. Die API lauscht ausschließlich auf localhost.

## Pfade

```
/opt/gruenzeug/            Frontend (index.html, app.js, style.css, sw.js)
/opt/gruenzeug-api/        Backend
  ├── main.py              API: Anmeldung, Sync, Push-Endpunkte
  ├── push.py              VAPID-Schlüssel, Versand
  ├── cron.py              ermittelt Fälliges, verschickt Erinnerungen
  ├── manage.py            Benutzerverwaltung
  ├── gruenzeug.db         SQLite: Benutzer, Sitzungen, Pflanzendaten
  ├── vapid.json           VAPID-Schlüsselpaar  ⚠ nicht löschen
  ├── vapid_private.pem    derselbe Schlüssel als Datei für pywebpush
  └── venv/                virtuelle Umgebung
/etc/nginx/sites-available/gruenzeug
```

## Erreichbarkeit

`pflanzen.michaely.de` → Nginx Proxy Manager auf **192.168.178.156**
(Proxy Host 55) → dieser Container auf Port 80, Let's Encrypt, Force SSL.

> ⚠ **„Cache Assets" muss im Proxy Host AUS bleiben.** Sonst verwirft der
> NPM die Cache-Header und liefert `sw.js` stundenlang aus dem Zwischen-
> speicher — dann bleiben installierte Apps auf einer alten Version hängen.

## Befehle

```bash
systemctl status gruenzeug
journalctl -u gruenzeug -n 50 --no-pager
systemctl list-timers gruenzeug-push.timer

# zeigt an, was verschickt würde, ohne es zu senden
cd /opt/gruenzeug-api && venv/bin/python cron.py --trocken

# Benutzer anlegen (es gibt bewusst keine Registrierung in der App)
cd /opt/gruenzeug-api && venv/bin/python manage.py adduser <name>
venv/bin/python manage.py list
venv/bin/python manage.py passwd <name>
```

## Deployment

Vom Laptop aus, kein Git auf dem Server:

```bash
python deploy.py          # nur Frontend
python deploy.py --api    # mit Backend, startet den Dienst neu
```

## Sichern

```bash
sqlite3 /opt/gruenzeug-api/gruenzeug.db ".backup /root/gruenzeug-$(date +%F).db"
```

Die beiden VAPID-Dateien gehören mit ins Backup. Gehen sie verloren, werden
alle Push-Abos ungültig und jedes Gerät muss sich neu anmelden.

## Wartung

Sicherheitsupdates laufen automatisch (`unattended-upgrades`, nur
`trixie-security`, **kein** automatischer Neustart). Normale Updates bleiben
manuell.

```bash
journalctl -u unattended-upgrades -n 30     # was wurde installiert
cat /var/run/reboot-required 2>/dev/null    # Neustart nötig?
```

**Speicher:** Normalbetrieb rund 200 MB, Höchststand mit laufendem apt 597 MB.
1 GB genügt, 512 MB wären zu knapp.

## Merkposten

- Zeitzone steht auf **Europe/Berlin** — `cron.py` vergleicht die eingestellte
  Uhrzeit mit der lokalen Serverzeit. Unter UTC käme eine für 9:00 gesetzte
  Erinnerung im Sommer um 11 Uhr.
- Neue Datenbankspalten gehören in `spalten_ergaenzen()` in `main.py`.
  SQLAlchemy legt beim Start nur fehlende Tabellen an, keine fehlenden Spalten.
- Auf dem iPhone gibt es Benachrichtigungen nur, wenn die Seite über
  *Teilen → Zum Home-Bildschirm* installiert wurde (ab iOS 16.4).

---

© 2026 Torsten Michaely — Alle Rechte vorbehalten
