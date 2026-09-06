# Heute-Ansicht – v3.21.0

Stand: 06.09.2026. Ausgangspunkt: v3.20.1 (`81eb748`).

## Problem und Ergebnis

Die vorherige Heute-Ansicht zeigte demnächst fällige Gießtermine bereits vor
heute fälliger Pflege. Ihre Kennzahl „fällig“ berücksichtigte ausschließlich
Gießen. Bei größeren Beständen waren Pflegeaufgaben dadurch schwer zu erreichen.

Die neue Ansicht zeigt oben alle offenen Aufgaben und bietet drei Filter:
**Gießen**, **Pflege**, **Demnächst**. Die Gieß-Runde ist ab zwei fälligen Pflanzen
direkt aus dem Überblick erreichbar. „Alle Pflanzen ansehen“ öffnet den gesamten
aktiven Bestand. Nochmaliges Antippen einer Filterkachel oder „Alle Aufgaben“
führt zurück zur vollständigen Aufgabenansicht.

Reihenfolge: fällige Behandlung, Gießen, weitere Pflege (nach Überfälligkeit),
Sammelaufgaben, Eingewöhnung und zuletzt die Vorschau auf kommende Gießtermine.
Allgemeine Saison-, Standort- und Wetterhinweise stehen in einem aufklappbaren
Bereich. Frostwarnungen und der Hinweis auf Pflanzen mit Problemen bleiben
direkt sichtbar. Die vorhandenen Aktionen und Fälligkeitsregeln werden weiter
verwendet; die Version verändert keine Pflanzendaten oder Sync-Schnittstellen.

## Was die Zahlen bedeuten

- Gießen zählt aktive Pflanzen, deren Wasserpflege heute oder früher fällig ist.
  Wie bisher gehören auch Nachfüllen bzw. Wasserwechsel dazu.
- Pflege zählt sichtbare fällige Aufgabenkarten: normale/eigene Pflegeaufgaben
  einzeln, pro fälliger Sammelaufgabe eine Karte, pro Pflanze mit fälliger
  Behandlung oder Eingewöhnung jeweils eine Karte. Mehrere offene Teilschritte
  derselben Behandlung sind eine Karte, keine Schätzung der Handgriffe.
- Der Überblick addiert Gießen und Pflege. Nach dem letzten fälligen Schritt
  verschwindet die entsprechende Karte; die Zahlen werden neu berechnet.
- Demnächst zählt kommende Gießtermine innerhalb der bestehenden Vorwarnung.
  Bei deaktivierter Vorwarnung gilt weiterhin die bisherige Dreitagesvorschau.
- Archivierte Pflanzen zählen nicht mit. Zukünftige Aufgaben zählen nicht als
  heute offen. „Alles erledigt“ erscheint auch dann, wenn eine Vorschau existiert.

## Bedienung und Darstellung

Filter sind echte Buttons mit `aria-pressed` und sichtbarem Tastaturfokus.
Abhakflächen auf der Heute-Ansicht sind mindestens 44 × 44 px groß.
Standort, Menge und Fälligkeit dürfen in der Zeile umbrechen. Die vorhandenen
Farbvariablen werden für Hell-/Dunkelmodus und Personalisierung verwendet.
Die Hinweise verwenden ein natives `details`-Element, dessen Aufklappzustand
beim Abhaken erhalten bleibt.

## Prüfungen

`tests/heute.browser.cjs` prüft im echten Browser mit separaten Testdaten:

1. Korrekte Zahlen und fällige Pflege vor der Vorschau.
2. Pflegefilter, Abhaken, Rückgängig und Zurücksetzen des Filters.
3. Gießen und Rückgängig mit aktualisierten Zahlen.
4. Gesamter Bestand, Gieß-Runde und Vorschau erreichbar.
5. Nur Pflege fällig, vollständig erledigter und leerer Bestand.
6. Behandlung, Eingewöhnung und Sammelaufgaben im Pflegefilter.
7. Archivierte Pflanzen aus Aufgaben und Zahlen ausgeschlossen.
8. Kein horizontaler Überlauf bei 320, 390 und 1280 px; Hell/Dunkel.
9. Keine JavaScript-Laufzeitfehler in diesen Szenarien.

Lokal erfolgreich mit Microsoft Edge und Playwright 1.62.1. Screenshots der
mobilen hellen/dunklen sowie der Desktop-Ansicht werden visuell geprüft.
Die 11 bestehenden JavaScript-Sync-Regressionen bestehen weiterhin.
GitHub Actions führt zusätzlich zu den 19 bisherigen Regressionstests die
Browser-Prüfung mit Chromium aus. Ein Browser-Kontext ersetzt keinen physischen
iOS-/Android-PWA-Test; Installation und Push wurden hier nicht neu geprüft.

## Version und Deployment

Version 3.21.0 in App, Versionsdatei, App-Historie, HTML-Assetparametern,
Service Worker, README und Changelog. Neue npm-Abhängigkeiten dienen ausschließlich
den Tests; das Frontend bleibt ohne Frameworks und externe Laufzeitbibliotheken.
Nur statische Dateien müssen ausgeliefert werden (`python deploy.py`).
Deployment und abschließende Live-Prüfung stehen noch aus.
