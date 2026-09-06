# Natürliche Gestaltung – v3.23.0

Die Gestaltung orientiert sich an der vom Nutzer gewünschten ruhigen Wirkung
der öffentlich gezeigten Planta-App: heller Salbeiton, weiße Flächen, dunkles
Grün und Pflanzenbilder im Vordergrund. Eigenständige Umsetzung mit vorhandenen
Grünzeug-Komponenten; keine fremden Fotos, Logos, Schriften oder Grafiken eingebaut.

## Ansichten

- Heute: klar gegliederter Tagesüberblick, großzügige Karten, dunkelgrüne
  Gieß-Runde und größere Bilder in Gieß- und Pflegeaufgaben. Wasser ist blau,
  Pflege im Zähler ockerfarben. Überfälligkeit bleibt als Text erkennbar.
- Pflanzen: quadratische größere Bilder, Standort unter dem Pflanzennamen,
  Umbruch langer Namen und 44-Pixel-Gießaktionen.
- Detail: größeres Titelbild, luftigere Pflegekarten und einheitliche Rundungen.
- Navigation: aktiver Bereich zusätzlich mit hinterlegtem Symbol markiert.

Die bestehende helle Grundpalette bleibt salbeigrün; der grüne Standardakzent
wird dunkler. Eigene Farbwahl, Hintergründe und Dunkelmodus werden berücksichtigt.
Gießintervalle, Sync und Datenformat bleiben unverändert. Kein Backend-Update
und keine Datenmigration erforderlich.

## Prüfung

Bestehende Browserprüfung für Gießen, Pflege, Rückgängig, Filter, Gieß-Runde,
Vorschau, Archiv und leeren Bestand; zusätzlich Sammlung und Detail mit langem
Pflanzennamen bei 320, 390 und 1280 Pixeln sowie Hell/Dunkel. Screenshots dienen
der visuellen Kontrolle. Tastaturfokus sichtbar, reduzierte Bewegung berücksichtigt.
Physische iOS-/Android-Geräte wurden nicht geprüft.

## Deployment

Frontend-Deployment mit `python deploy.py`. Vorher Live-Dateien mit v3.22.0
abgleichen und sichern. Danach Dateivergleich, HTTPS und Offline-Neuladen prüfen.
Am 06.09.2026 produktiv ausgeliefert, Code-Commit `1b0d136` auf `main`.

- [GitHub Actions](https://github.com/totocotonio/pflanzen/actions/runs/34041443300):
  16 Python-Tests, 11 JavaScript-Tests, Syntaxprüfungen und beide Browser-Suiten grün.
- Lokale Edge-Prüfung mit Screenshots: Heute, Pflanzen und Detail bei 320/390/1280 px,
  Hell/Dunkel; kein horizontaler Überlauf und keine JavaScript-Laufzeitfehler.
- Vorab alle statischen Serverdateien gegen v3.22.0 verglichen.
- Sicherung von Frontend und Datenbank mit erfolgreicher Integritätsprüfung:
  `/opt/gruenzeug-releases/v3.23.0-1b0d136/rollback-20260906T151022Z`.
- Alle ausgelieferten Dateien entsprechen dem Release; öffentliche HTTPS-Abrufe
  erfolgreich, HTML/Service Worker mit `no-cache`, API und Dienste/Timer aktiv.
- Frischer Browserkontext: Version 3.23.0 online und nach Offline-Neuladen
  verfügbar, ohne JavaScript-Fehler.

Bei Bedarf lässt sich das gesicherte Frontend zurückspielen; eine Rücksetzung
der Datenbank ist für diese Gestaltungsänderung nicht erforderlich.
