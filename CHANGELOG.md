# Changelog

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
