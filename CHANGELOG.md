# Changelog

## v1.5.0 - 2026-08-29

- Push-Erinnerungen funktionieren jetzt wirklich: ein systemd-Timer prüft alle
  15 Minuten, ob bei jemandem die eingestellte Uhrzeit erreicht ist, und schickt
  eine Nachricht, sofern überhaupt etwas zu gießen ist. Pro Tag höchstens eine.
- Der Text nennt die Pflanzen: bei bis zu drei mit Namen, darüber gekürzt.
- Testnachricht auf Knopfdruck, sobald die Erinnerungen aktiv sind.
- Uhrzeit ändern meldet die neue Zeit sofort an den Server.
- VAPID-Schlüssel werden serverseitig erzeugt und liegen in `vapid.json`; der
  Client holt den öffentlichen Teil über `/api/push/key`, statt ihn im Quelltext
  zu führen.
- Klare Auskunft statt "nicht unterstützt": Die App unterscheidet jetzt, ob die
  Anmeldung fehlt, der Browser Benachrichtigungen blockiert, oder ob es ein
  iPhone ist, auf dem die Seite erst zum Home-Bildschirm hinzugefügt werden muss
  – dort mit Schritt-für-Schritt-Anleitung.
- Zeitzone des Servers auf Europe/Berlin gesetzt. Vorher lief er auf UTC, "09:00"
  wäre also um 11 Uhr deutscher Zeit angekommen.

## v1.4.0 - 2026-08-29

- Eigener Name: die Startseite begrüßt tageszeitabhängig ("Guten Morgen, Torsten")
  statt nur "Heute" anzuzeigen.
- Acht Akzentfarben statt festem Grün – wirkt auf Knöpfe, Fortschrittsbalken,
  aktiven Tab und die Fälligkeitsmarkierungen. Je Farbe ein eigener Wert für
  hell und dunkel.
- Hintergrund wählbar: sechs Verläufe (Wald, Dämmerung, Meer, Sand, Rosé, Nacht)
  oder ein eigenes Foto. Bei eigenem Hintergrund werden die Flächen durch-
  scheinend, damit das Bild sichtbar bleibt; über Fotos liegt ein Schleier für
  die Lesbarkeit.
- Eigenes Symbol im Kopf der Startseite: 15 Emoji oder ein eigenes Foto.
- Name der App änderbar (Kopfzeile, Anmeldung, Browser-Tab).
- Startansicht wählbar: Heute, Pflanzen oder Plan.
- Alle Einstellungen gehören zum Konto und werden zwischen den Geräten
  synchronisiert; Torsten und Jule können unterschiedlich einstellen.
- Behoben: Im hellen Modus blieb die Akzentfarbe grün. Die helle Palette war
  zusätzlich auf `body` definiert und überschrieb damit den per JS auf `<html>`
  gesetzten Wert.

## v1.3.0 - 2026-08-29

- Beispielpflanzen zum Ausprobieren: acht typische Zimmerpflanzen mit üblichen
  Gießintervallen, anlegbar über den leeren Startbildschirm oder unter
  Mehr → Daten. Sie verhalten sich wie selbst angelegte Pflanzen und lassen
  sich einzeln oder gesammelt wieder löschen.
- Pflanze löschen jetzt direkt in der Detailansicht statt nur über den Umweg
  Bearbeiten.

## v1.2.0 - 2026-08-29

- Anmeldung mit Benutzername und Passwort; die Seite ist öffentlich erreichbar,
  deshalb gibt es keine offene Registrierung – Benutzer legt `manage.py` auf dem
  Server an.
- Geräte-Sync: Pflanzen, Verlauf und Einstellungen liegen zusätzlich auf dem
  Server, Handy und PC zeigen denselben Stand.
- localStorage bleibt Primärspeicher, die App funktioniert offline weiter;
  Änderungen werden nachgeholt, sobald wieder Verbindung besteht.
- Revisionsnummer je Datensatz: hat ein anderes Gerät zwischendurch geschrieben,
  fragt die App nach, statt fremde Änderungen stillschweigend zu überschreiben.
- Neuer Bereich "Konto" unter Mehr mit Anmeldename, Sync-Status und Abmelden.
- Nutzung ohne Anmeldung weiterhin möglich (Daten bleiben dann auf dem Gerät).
- Backend: FastAPI + SQLite auf dem LXC, Nginx reicht `/api/` durch,
  Sitzungen als HttpOnly-Cookie, Passwörter mit bcrypt, Bremse gegen Raten.
- Umschalter für Hell und Dunkel direkt in der Kopfzeile der Startseite.
- Versionshistorie in der App unter Mehr → Über.
- Behoben: Der Service Worker hatte die API-Antworten zwischengespeichert.
  Dadurch arbeitete die App mit einem veralteten Serverstand und meldete
  "aktuell", obwohl der Server einen anderen Stand hatte.

## v1.1.0 - 2026-08-29

- Erscheinungsbild umschaltbar: System, Hell oder Dunkel (Mehr → Darstellung).
- Helle Palette für alle Flächen, Tabbar, Sheets und Formulare ergänzt.
- Statusleistenfarbe und `color-scheme` folgen dem gewählten Erscheinungsbild.
- Desktop-Layout ab 768 px: Inhalt zentriert, größeres Raster, Hover-Zustände,
  Tabbar als schwebende Leiste, Sheets als Dialoge in der Bildschirmmitte.

## v1.0.0 - 2026-08-29

- Erste Fassung von Grünzeug als Progressive Web App.
- Ansicht "Heute" mit Kennzahlen, Dringlichkeits-Sortierung und Ein-Tipp-Gießen.
- Pflanzen-Datenbank mit Name, Art, Standort, Wassermenge, Lichtbedarf und Notizen.
- Foto-Upload mit Verkleinerung auf 400 px, alternativ 15 Emoji zur Auswahl.
- Optionales Dünger-Intervall mit eigener Fälligkeitsanzeige.
- Plan-Ansicht über die nächsten 14 Tage, nach Kalendertagen gruppiert.
- Winter-Modus: Gießintervalle mal 1,5, automatisch von November bis Februar.
- Vorwarnung 0/1/2 Tage vor Fälligkeit einstellbar.
- Standort-Filter, Räume werden automatisch aus den Pflanzen gesammelt.
- Verlauf der letzten Gieß- und Düngevorgänge je Pflanze.
- Export und Import aller Daten als JSON.
- Service Worker: Network-First für HTML, Cache-First für Assets, Push-Empfang vorbereitet.
- Icons per `gen_icons.py` aus geometrischem Blatt-Motiv erzeugt.
