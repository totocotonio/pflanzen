# Changelog

## v1.14.0 - 2026-08-29

- Küchenkräuter ergänzt: Koriander, Dill, Zitronenmelisse und Kresse.
  Damit sind die üblichen Fensterbank-Kräuter vollständig – die Liste umfasst
  nun 79 Arten.

## v1.13.1 - 2026-08-29

- Pflegehinweise für die Arten ergänzt, die noch keinen hatten, unter anderem
  Petersilie, Salbei, Oregano, Philodendron, Efeu und Fuchsie.

## v1.13.0 - 2026-08-29

- Pflanzenliste von 32 auf 75 Arten erweitert: mehr Grünpflanzen, Palmen,
  Sukkulenten, Blühpflanzen, Kräuter und Balkonpflanzen.
- Sorten, die sich in der Pflege unterscheiden, stehen einzeln drin:
  Monstera deliciosa, Monkey Mask und Variegata; Alocasia allgemein, Zebrina,
  Polly und Frydek; Gummibaum und die panaschierte Tineke.
- Zweitnamen: "Benjamini" findet die Birkenfeige, "Schwiegermutterzunge" den
  Bogenhanf, "Fensterblatt" die Monstera, "ZZ-Pflanze" die Glücksfeder.
  Vorher scheiterte "Benjamini" am botanischen "benjamina".
- Mehrzahl und Umlaute werden erkannt: "Efeutüten", "Orchideen", "Geranien",
  "Kakteen". Bei mehrdeutigen Eingaben gewinnt der genaue Wortstamm, damit
  "Palmen" die Bergpalme findet und nicht die Yuccapalme.

## v1.12.0 - 2026-08-29

- Das Namensfeld schlägt beim Tippen die hinterlegten Zimmerpflanzen vor, so
  dass Schreibweise und Pflegevorschlag zusammenpassen.
- Der Standort ist kein Freitextfeld mehr, sondern ein Dropdown: fünfzehn
  übliche Räume, dazu alle, die in den eigenen Pflanzen schon vorkommen.
  Über "Anderer Standort …" lässt sich weiterhin ein eigener anlegen.
- Das verhindert nebenbei, dass durch Tippfehler zwei Standorte entstehen
  ("Küche" und "Kueche"), die dann getrennte Filter-Chips erzeugen.

## v1.11.0 - 2026-08-29

- Suche in der Pflanzenliste. Durchsucht werden Name, Art, Standort, Notiz,
  Lichtbedarf und Wassermenge; mehrere Wörter müssen alle vorkommen, die
  Reihenfolge spielt keine Rolle ("bad orchidee" findet dasselbe wie
  "orchidee bad").
- Während einer Suche zeigt die Kopfzeile die Trefferzahl, und die
  Standort-Chips treten in den Hintergrund.

## v1.10.0 - 2026-08-29

- Pflegevorschläge: Beim Anlegen erkennt die App gut dreißig verbreitete
  Zimmerpflanzen am Namen oder an der Art und bietet Richtwerte für
  Gießintervall, Licht, Wassermenge, Dünger- und Umtopf-Intervall sowie einen
  Pflegehinweis an. Übernommen wird nur, was noch nicht ausgefüllt ist –
  eigene Eingaben bleiben unangetastet.
- Fotoverlauf: bis zu sechs Bilder je Pflanze mit Datum, als Streifen in der
  Detailansicht. Antippen zeigt das Bild groß, dort lässt es sich auch löschen.
  Die Bilder werden auf 500 px verkleinert, weil sie mitsynchronisiert werden.
- Statistik unter Mehr: Gießvorgänge gesamt und in den letzten 30 Tagen,
  Wasserverbrauch aus den Mengenangaben, ein Balkendiagramm der letzten acht
  Wochen, die Pünktlichkeit je Pflanze und der Verlauf nach Aufgabenart.
- Die Pünktlichkeit vergleicht den tatsächlichen Abstand zwischen zwei
  Gießvorgängen mit dem eingestellten Intervall. Ungewöhnlich lange Pausen,
  etwa im Urlaub, bleiben außen vor, damit sie das Bild nicht verzerren.

## v1.9.0 - 2026-08-29

- Alle fälligen Pflanzen auf einmal gießen: Im Abschnitt "Jetzt gießen" steht
  ein Knopf "Alle N gießen", sobald mehr als eine fällig ist. Rückgängig nimmt
  den ganzen Schwung zurück.
- Umtopfen und Schneiden als eigene Pflegeaufgaben, Intervall in Monaten.
  Düngen, Umtopfen und Schneiden verhalten sich jetzt gleich und stehen im Code
  in einer gemeinsamen Tabelle statt dreimal ausgeschrieben.
- Der Abschnitt "Düngen fällig" auf der Startseite heißt jetzt "Weitere Pflege"
  und zeigt alle drei Aufgabenarten.
- Urlaubsmodus (Koffer-Symbol in der Plan-Ansicht): Zeitraum eingeben, die App
  zeigt, was vor der Abreise noch gegossen werden muss und welche Pflanze
  während der Abwesenheit an welchen Tagen dran ist.
- Die Liste für die Person, die währenddessen gießt, lässt sich per Teilen-Dialog
  weitergeben oder in die Zwischenablage kopieren – mit Standort, Wassermenge
  und den Pflegehinweisen.

## v1.8.2 - 2026-08-29

- Behoben: Der Versand scheiterte mit "Versand fehlgeschlagen". `pywebpush`
  bekam den privaten VAPID-Schlüssel als PEM-Text und reichte ihn an
  `Vapid.from_string()` weiter, das base64-kodiertes DER erwartet – die Folge
  war ein ASN.1-Parsing-Fehler. Der Schlüssel wird jetzt zusätzlich als Datei
  `vapid_private.pem` abgelegt und als Pfad übergeben; damit greift
  `Vapid.from_file()`, das PEM liest. Das Schlüsselpaar bleibt dasselbe,
  bestehende Abos gelten weiter.

## v1.8.1 - 2026-08-29

- Behoben: Die App meldete "Erinnerungen aktiv" und zeigte den Testknopf,
  obwohl beim Server kein Gerät angemeldet war. Frühere Fassungen setzten
  `pushAktiv` schon nach der Berechtigungsabfrage, weil es damals noch keinen
  Push-Server gab; dieser Wert wurde später mitsynchronisiert. Die App prüft
  den Zustand jetzt beim Start gegen das tatsächlich vorhandene Abo und
  korrigiert die Anzeige.
- Der Testknopf meldet das Gerät selbst nach, wenn der Server es nicht kennt,
  statt nur "kein Gerät angemeldet" zu melden.

## v1.8.0 - 2026-08-29

- Rückgängig nach Gießen und Düngen: Die Meldung enthält jetzt einen Knopf, der
  das vorherige Datum wiederherstellt und den Eintrag aus dem Verlauf entfernt.
  Sie bleibt dafür sechs statt zwei Sekunden stehen.
- Bewusst keine Sicherheitsabfrage vor dem Gießen: Das ist der am häufigsten
  benutzte Handgriff der App, eine Rückfrage bei jeder Pflanze würde ihn
  unbrauchbar machen.
- Die Meldung ist jetzt eine Flex-Zeile und passt sich der Breite an, statt bei
  längeren Namen auf drei Zeilen umzubrechen.

## v1.7.1 - 2026-08-29

- Knopf "Beispielpflanzen anlegen" unter Mehr entfernt. Auf dem leeren
  Startbildschirm bleibt das Angebot bestehen, dort erscheint es nur, solange
  noch keine Pflanze angelegt ist.

## v1.7.0 - 2026-08-29

- Vorwarnung bis 7 Tage einstellbar (bisher höchstens 2).
- Die mittlere Kachel auf der Startseite und der Abschnitt "Demnächst" richten
  sich nach dieser Einstellung, statt fest zwei Tage zu zeigen. Die Kachel
  beschriftet sich entsprechend ("in 5 Tagen", bei einem Tag "morgen").
- Ohne Vorwarnung zeigt die Kachel weiterhin die nächsten drei Tage als
  Vorschau, markiert aber nichts orange.

## v1.6.0 - 2026-08-29

- Die drei Kacheln auf der Startseite filtern jetzt die Liste darunter:
  "fällig", "in 2 Tagen" oder alle Pflanzen nach Dringlichkeit sortiert.
  Die aktive Kachel ist in der Akzentfarbe umrandet; ein zweiter Tipp darauf
  oder "Filter aufheben" bringt die normale Ansicht zurück.
- Behoben: Der Knopf für das eigene Symbol blieb als leerer Kreis sichtbar,
  wenn kein Symbol gesetzt war. `.hd-btn` setzt ein eigenes `display` und
  hat damit das `hidden`-Attribut ausgehebelt.

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
