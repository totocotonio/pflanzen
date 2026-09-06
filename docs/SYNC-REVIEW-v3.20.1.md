# Speicher- und Sync-Prüfung – v3.20.1

Datum: 6. September 2026. Ausgangspunkt: `c216bcd` (v3.20.0).
Umfang: gezielte Prüfung von Persistenz, Geräte-Sync und Wiederherstellung.
Keine Änderungen an Produktivdaten, kein Deployment und keine Push-Nachrichten.

## Befunde und Korrekturen

| Auslöser | Bisheriges Verhalten | Korrektur |
|---|---|---|
| Während eines langsamen Uploads wird eine weitere Pflanze bearbeitet | Die erste Antwort setzt `dirty=false`, obwohl die neue Änderung nicht übertragen wurde | Ein lokaler Änderungszähler identifiziert den übertragenen Stand; weitere Änderungen lösen einen Folgeupload aus |
| Sync startet vor dem Laden aus IndexedDB | Fehlende Bilder können zum Server hochgeladen werden | Vor dem Upload Bilder laden; bei Lesefehlern sichtbar anhalten |
| Export nach fehlgeschlagenem Foto-Laden | Unvollständige Sicherung wird trotzdem angeboten | Export abbrechen und Ursache melden |
| Eine GET-Antwort trifft nach einem neueren Upload ein | Alte Daten können den lokalen Stand ersetzen | Laufende Uploads und seit Anfragebeginn geänderte lokale Serverrevisionen haben Vorrang |
| Zwei Geräte schreiben dieselbe Revision | Beide können Erfolg erhalten, obwohl ein Stand überschrieben wurde | SQLite-Schreibtransaktion mit `BEGIN IMMEDIATE` vor dem Lesen und Vergleichen der Revision |
| Zwei erste Uploads gleichzeitig | Einer kann mit einem Datenbankfehler statt HTTP 409 scheitern | Dieselbe Transaktion umfasst auch erstmaliges Anlegen |
| Wiederherstellung parallel zu Uploads | Revision und vorheriger Stand sind nicht gegen parallele Schreiber abgesichert | Wiederherstellung verwendet dieselbe Schreibreservierung |
| Abmelden mit offenen Änderungen | Die Markierung für offene Änderungen wird gelöscht | Die Markierung bleibt erhalten; die Revision wird weiterhin zurückgesetzt, damit sie nicht für ein anderes Konto benutzt wird |
| Lokaler Speicher voll | Die Meldung verspricht bereits Daten auf dem Server | Meldung weist auf den tatsächlichen lokalen Fehler und die notwendige Prüfung hin |
| Konfliktentscheidung mit anschließend fehlgeschlagenem Upload | Erfolg wird vor der Serverantwort gemeldet | Auf Upload warten; Erfolg nur nach bestätigter Sicherung |
| Bekannte Anmeldung ist beim Start abgelaufen | Das Sync-Warnbanner wird nicht zuverlässig aktualisiert | Auth-Fehler speichern und Banner neu zeichnen |

`schreibtransaktion` beendet die unveränderte Lesetransaktion der
Benutzerauflösung. Die Sitzungsverlängerung wurde bereits committed. Danach
reserviert SQLite den Schreibzugriff bis Commit oder Rollback; andere Prozesse
warten ebenfalls. Diese Lösung ist bewusst auf das bestehende SQLite-Backend
zugeschnitten und benötigt keine Schemaänderung. Bei langer Schreiblast kann
weiterhin das SQLite-Wartelimit erreicht werden; der Client behält den offenen
Stand bei einem fehlgeschlagenen Upload.

## Verifikation

- JavaScript: 11 Tests bestanden (Node.js 24.18.0, Windows).
- Python: 8 Tests bestanden (Python 3.12, temporäre SQLite-Datei).
- Vergleich derselben Tests mit unverändertem v3.20.0: 7 JavaScript-Tests
  scheiterten; im Backend scheiterten 2 Tests und 1 Test endete mit einem
  Datenbankfehler. Der parallele Update-Test erhielt zweimal HTTP-Erfolg statt
  einmal Erfolg und einmal Konflikt. Zeitabhängige Fehler müssen nicht in jedem
  Lauf gleich auftreten; der Test mit einer veralteten Session prüft den
  Revisionsfehler zusätzlich gezielt.
- Die API-Tests decken HTTP-Roundtrip, Konfliktantworten, fehlende und abgelaufene
  Anmeldung sowie den Schutz fremder Versionsstände ab.
- Die JavaScript-Tests verwenden echte Funktionen aus `app.js`, aber simulieren
  Netzwerk, Zeitgeber, Speicher und Teile der Oberfläche. Sie sind keine
  Browser-End-to-End-Tests und kein Nachweis für iOS-/Android-PWA-Verhalten.
- GitHub Actions ist für beide Suiten eingerichtet. Ein lokaler Testlauf ist
  keine Aussage darüber, ob der spätere GitHub-Lauf bereits erfolgreich war.

Ausführung siehe [README](../README.md#tests-und-sync-prüfung).
`APP_SOURCE` bzw. `SERVER_SOURCE` können für Vergleichsläufe auf eine separate
Quelldatei bzw. ein separates Serververzeichnis zeigen.

## Verbleibende Grenzen und nächste Schritte

- Fotos und Pflanzendaten werden weiterhin gemeinsam hochgeladen. Separate
  Bildübertragung ist ein eigenständiger Umbau mit API- und Migrationsplanung.
- Lokale Metadaten und Bilder liegen weiterhin in zwei Speichern. Diese Prüfung
  macht deren Schreibvorgänge nicht atomar. Fehler beim Schreiben von Bildern,
  Speicherbereinigung und die ursprüngliche Bildmigration benötigen eine eigene
  Prüfung mit echten Browser-Speicherfehlern.
- Die Konfliktentscheidung wählt weiterhin einen Gesamtstand. Ein Abbrechen
  dieser bestehenden Rückfrage bedeutet weiterhin „lokalen Stand hochladen“;
  ein Dialog mit expliziten Aktionen und einer echten Abbruchoption ist sinnvoll.
- Kontowechsel sowie mehrere Tabs mit gemeinsamem localStorage benötigen eine
  eigene Prüfung; diese Version führt keine getrennten lokalen Kontospeicher ein.
- Die Heute-Ansicht, modulare Aufteilung und Urlaubsvertretung gehören nicht zu
  dieser Fehlerkorrektur. Sie bleiben mögliche folgende Arbeitspakete.

## Versionierung und Auslieferung

Patchversion **3.20.1**: `VERSION`, App-Konstante und App-Historie, README,
Changelog, Service-Worker-Cache sowie HTML-Assetparameter werden gemeinsam
aktualisiert. Frontend und Backend müssen gemeinsam ausgeliefert werden:
`python deploy.py --api`. Das Deployment wurde im Rahmen dieser Prüfung nicht
ausgeführt. Vor dem Einsatz auf echten Geräten sind ein Browser-Smoke-Test und
ein Test mit zwei Geräten und einem separaten Testkonto vorgesehen.
