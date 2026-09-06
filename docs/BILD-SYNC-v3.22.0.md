# Getrennter Bild-Sync – v3.22.0

06.09.2026. Ausgangspunkt: v3.21.0 (`1fdfaa6`).

## Verhalten

Beim Gießen wurden bisher Pflanzen, Einstellungen und sämtliche Fotos als ein
JSON-Datensatz hochgeladen. Neue Clients berechnen nun SHA-256 über den exakten
Data-URI-Text eines Bildes. Sie fragen nach fehlenden Kennungen, laden ausschließlich
fehlende Inhalte hoch und schreiben erst danach den kompakten Pflanzenstand.
Die inhaltlich gleiche Data-URI wird innerhalb eines Kontos nur einmal gespeichert,
auch wenn sie als Haupt-, Verlaufs-, Profil- und Hintergrundbild benutzt wird.

Beim Lesen werden Bildverweise vor der Übernahme vollständig aufgelöst. Lokale
Bildinhalte werden wiederverwendet; fehlende Bilder werden einzeln geladen und
gegen ihre Kennung geprüft. Im Arbeitsspeicher der App stehen weiterhin vollständige
Data-URIs. Anzeige, JSON-Export und Import benötigen deshalb keine Serververbindung,
sobald die Daten vollständig lokal geladen sind.

Fehlgeschlagene Bildtransfers lassen Änderungen offen. Metadaten dürfen keine
nicht vorhandenen oder fremden Bilder referenzieren. Während eines Uploads wird
mit einem festen Schnappschuss gearbeitet; zwischenzeitliche Änderungen werden
mit der anschließend gültigen Revision nachgesendet.

## API und Kompatibilität

Alle neuen Endpunkte verlangen dieselbe Anmeldung wie `/api/data`.

| Endpunkt | Zweck |
|---|---|
| `POST /api/bilder/abgleichen` mit `{ids: [...]}` | Fehlende Kennungen des eigenen Kontos zurückgeben |
| `PUT /api/bilder/{sha256}` mit `{inhalt: "data:image/..."}` | Unveränderlichen Bildinhalt ablegen; Hash prüfen; Wiederholung erlaubt |
| `GET /api/bilder/{sha256}` | Eigenes Bild als JSON laden; `private, no-store` |
| `GET /api/data?bilder=referenzen` | Kompakter Datensatz, alte Inline-Bilder bei Bedarf übernehmen |
| `PUT /api/data?bilder=referenzen` | Kompakte Konfliktantworten für neue Clients |
| `POST /api/versionen/{id}/wiederherstellen?bilder=referenzen` | Frühere Version mit auflösbaren Bildverweisen zurückgeben |

Ohne den Parameter bleibt die Antwort für ältere Clients inline, einschließlich
Konflikten und Wiederherstellungen. Alte Uploads mit Inline-Bildern bleiben möglich.
Das Backend normalisiert sie vor dem Speichern. Verweise tragen das Präfix
`gzbild:`; nur die bekannten Bildfelder werden umgestellt, keine Notizen oder
sonstigen Texte. Legacy-Clients sparen weiterhin keine Upload-Bandbreite, bis
sie die neue App-Version laden.

Ein neues Bild darf höchstens 8 MiB Data-URI-Text enthalten; die bestehende
80-MiB-Grenze für JSON-Uploads bleibt bestehen. Die Migration vorhandener
Inline-Inhalte erzwingt keine nachträgliche Verkleinerung. Bildlisten werden
gebündelt abgeglichen, der Client verwendet Pakete mit höchstens 500 Kennungen.

## Speicherung, Migration und Rollback

Die SQLite-Tabelle `bild` verwendet `(user_id, id)` als Primärschlüssel. Gleiche
Hashes anderer Konten gewähren keinen Zugriff. Die normale Datenbanksicherung
enthält damit auch alle Bilder; ein zusätzlicher Dateiordner ist nicht nötig.
Beim Löschen eines Kontos entfernt `manage.py` auch seine Bilder, historischen
Stände und Push-Abos, damit keine Inhalte an später wiederverwendeten IDs hängen.

`server/bilder_migration.py --kompakt` stellt aktuelle und historische Stände
pro Konto in einer Transaktion um. Jeder umgestellte Stand wird wieder aufgelöst
und mit seinem vollständigen Inhalt verglichen. Revisionen bleiben unverändert.
Eine erneute Ausführung ist möglich. Die SQLite-Dateigröße schrumpft dabei nicht
zwangsläufig, weil SQLite frei gewordene Seiten behalten kann.

Vor einem Rollback auf Backend-Code vor v3.22.0: aktuellen Datenstand sichern,
API-Schreibzugriffe stoppen, mit dem neuen Code und derselben Datenbank
`bilder_migration.py --inline` ausführen, danach vorherigen Code zurückspielen und
die API starten. Die zusätzliche Tabelle kann liegen bleiben. Nicht einfach den
alten Backend-Code über eine Datenbank mit Bildverweisen starten und nicht
pauschal eine alte Datenbanksicherung zurückspielen: seitdem gespeicherte
Änderungen könnten sonst verloren gehen.

Die lokale IndexedDB bleibt erhalten. Neue Vorhanden-Markierungen unterscheiden
bewusst entfernte Haupt-/Profil-/Hintergrundbilder von noch nicht geladenen Bildern;
alte Datensätze ohne Markierung werden weiterhin nachgeladen. Bilder aus einer
vollständig geladenen Serverantwort werden nicht durch alte lokale Slots ersetzt.

## Prüfungen

- 16 Python-Tests: die 8 bisherigen API-Sync-Tests und 8 neue Tests für
  Deduplizierung, alte Clients, fehlende Bilder, Kontotrennung, Konflikte,
  Wiederherstellung und Migration samt Rückmigration.
- 11 bestehende JavaScript-Sync-Regressionen; der Bildtransport wird dort isoliert.
- Echter Browser, zwei getrennte Kontexte: Erstübertragung, Bildwechsel,
  Offline-Neuladen, Export/Import, Entfernen, historische Fotos, Offline-Änderung,
  Fehler beim Bild-Upload und gleichzeitige Bearbeitung während eines Bild-Uploads.
- Messfall mit einer Pflanze und demselben Testbild in vier Bildfeldern:
  Gieß-Metadaten 773 statt 53.732 Bytes JSON; kein erneuter Bild-PUT. Dies ist
  ein konkreter Testfall, keine garantierte Ersparnis für jeden Bestand. Der
  kleine Kennungsabgleich sowie HTTP-Header sind in diesen JSON-Zahlen nicht enthalten.
- Die Browser-Prüfung der Heute-Ansicht bleibt Bestandteil von GitHub Actions.

Lokal erfolgreich mit Edge/Playwright 1.62.1 und Python 3.12. Physische
iOS-/Android-Geräte und Push-Versand wurden nicht neu getestet.

## Grenzen

- Unbenutzte Serverbilder werden zunächst nicht automatisch gelöscht. So bleiben
  frühere Versionen und abgebrochene Abgleiche sicher; eine spätere Bereinigung
  muss aktuelle und historische Referenzen berücksichtigen.
- Es gibt weiterhin einen ganzen Metadatensatz pro Konto, keinen feldweisen
  Konfliktabgleich. Die bestehende Konfliktentscheidung bleibt erhalten.
- localStorage und IndexedDB sind weiterhin getrennte lokale Speichervorgänge.
  Diese Änderung macht deren Schreibvorgänge nicht atomar und ersetzt keine
  Sicherung bei einem abrupten Browserabbruch oder vollem Gerätespeicher.

## Deployment

Frontend und Backend gemeinsam mit `python deploy.py --api` ausliefern.
Das Skript startet zuerst die kompatible API, dann lädt es das Frontend hoch.
`bild-sync.js` gehört zu Deployment und Service-Worker-Cache. Version 3.22.0
steht in App, Versionsdatei, Historie, HTML-/Cacheparametern und Dokumentation.
Am 06.09.2026 produktiv ausgeliefert; Code-Stand `25bcb00` auf `main`.
GitHub Actions für diesen Stand erfolgreich:
[Testlauf](https://github.com/totocotonio/pflanzen/actions/runs/34040647368).

- Vorab sämtliche vorhandenen Deployment-Dateien mit v3.21.0 verglichen.
- Code und SQLite-Datenbank gesichert unter
  `/opt/gruenzeug-releases/v3.22.0-preflight/rollback-20260906T145513Z`
  (geschütztes Verzeichnis auf dem Server).
- Alle 16 API-Tests mit den Produktionsbibliotheken erfolgreich.
- Migration an einer Serverkopie: 21 Daten-/Versionsstände und 57 Bilder;
  Hin-/Rückmigration und Wiederholung erhalten Inhalte und Revisionen.
  Die JSON-Stände schrumpften von 199.280.746 auf 560.074 Bytes; die Bilder
  werden zusätzlich einmalig gespeichert. Dies ist keine Messung der gesamten DB-Datei.
- Frontend und Backend ausgeliefert, alle Dateien mit dem lokalen Release
  abgeglichen. Produktiv 21 Stände migriert; alle Bildreferenzen auflösbar,
  57 Bilder vorhanden, SQLite-Integritätsprüfung erfolgreich.
- API und Nginx sowie Push-/Backup-Timer aktiv. Interner Health-Endpunkt und
  öffentliches HTTPS erfolgreich, Bildabruf ohne Anmeldung korrekt mit HTTP 401.
  HTML und Service Worker mit `no-cache`, neue JavaScript-Datei erreichbar.
- Live-App in frischem Edge-Browserkontext online und nach Offline-Neuladen
  ohne JavaScript-Fehler; neuer Bildbaustein in beiden Fällen verfügbar.
- HTTPS wurde vom Entwicklungsrechner geprüft: Der serverinterne Zugriff auf
  den öffentlichen Hostnamen trifft auf ein selbstsigniertes Zertifikat.
  Die externe Zertifikatsprüfung war erfolgreich; keine Prüfung wurde deaktiviert.
