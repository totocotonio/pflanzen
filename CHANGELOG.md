# Changelog

## v3.14.0 - 2026-09-01

### Fotovergleich

Pflanzenwachstum sieht man im Alltag nicht. Es passiert über Monate, und das
Auge hat kein Gedächtnis für Zwischenstände – man erinnert sich nicht, wie
klein sie mal war. Die Fotos lagen längst im Verlauf, nur nebeneinander in
einer Reihe.

- **Zwei Aufnahmen direkt gegenübergestellt**, mit dem Abstand dazwischen:
  „10 Monate dazwischen", „2,5 Jahre dazwischen".
- Beim Öffnen stehen automatisch **ältestes und neuestes Bild** nebeneinander –
  der größte Abstand zeigt am meisten. Beide lassen sich frei wählen.
- Die Reihenfolge richtet sich nach dem Datum, nicht nach der Auswahl: Wer
  versehentlich das neuere als „Vorher" antippt, bekommt trotzdem die richtige
  Anordnung.
- Bewusst nebeneinander statt als Wischvergleich: Aufnahmen aus der Hand sind
  nie deckungsgleich, ein Überblenden würde nur springen.
- Der Knopf erscheint in der Galerie, sobald zwei Fotos da sind.

## v3.13.3 - 2026-09-01

### „Große Etiketten" war nicht erklärt

Der Schalter stand als nackte Beschriftung zwischen Pflanzenliste und
Druckknopf. Was er tut, musste man raten.

- Jetzt steht dabei: **zwei statt drei pro Reihe, mit größerem QR-Code – für
  Kübel und Zimmerbäume, wo ein kleines Schild untergeht.**
- Dazu die Angabe, wie viele Etiketten auf eine Seite passen (15 klein, 8 groß).
- Der Schalter steht unter einer eigenen Überschrift „Größe" statt heimatlos
  zwischen zwei Blöcken.

### Behoben: Ausgeschaltete Schieberegler waren unsichtbar

Beim Nachsehen aufgefallen: Der Schalter war gar nicht zu sehen.

- `.field input` setzt Breite und Hintergrund für Formularfelder und ist
  spezifischer als `.schalter`. Ein **ausgeschalteter** Schieberegler wurde
  dadurch auf volle Breite gezogen und durchsichtig gemacht – also unsichtbar.
- **Eingeschaltet fiel es nie auf**, weil `.schalter:checked` die allgemeine
  Regel schlägt und den grünen Hintergrund setzt.
- Das betraf alle Schieberegler der App: „steht gerade draußen",
  „Wochenrückblick sonntags", „Schädlings-Hinweise" – immer nur im
  ausgeschalteten Zustand.

## v3.13.2 - 2026-09-01

### Behoben: Standort-Chip bei den Etiketten wählte das Falsche

Ein Klick auf „Wohnzimmer" schaltete den Raum **um**, statt ihn auszuwählen. Da
beim Öffnen alles ausgewählt ist, hieß das in der Praxis: Wohnzimmer weg, die
sechs anderen bleiben – genau das Gegenteil dessen, was man erwartet.

- Der Chip wählt jetzt **genau diesen Raum** und sonst nichts. Ein zweiter
  Klick auf denselben Chip nimmt wieder alle.
- Der aktive Chip ist markiert, damit sichtbar ist, was gerade gilt.
- Die Anzahl steht am Chip: „Wohnzimmer (2)".

## v3.13.1 - 2026-09-01

### Behoben: Der Etikettendruck ergab ein weißes Blatt

Zwei Ursachen, die erst zusammen das leere Blatt ergaben:

- **Eine ältere Druckregel blendete den Bogen aus.** Für den Druck eines
  einzelnen QR-Codes stand seit Langem `body > *:not(.sheet) { display: none }`
  im Stylesheet – gedacht dafür, beim Drucken aus einem offenen Blatt heraus
  alles andere wegzulassen. Beim Etikettenbogen ist kein Blatt offen, also traf
  die Regel auch ihn. Sie nimmt ihn jetzt aus.
- **Der Körper der Seite schneidet ab.** Die App scrollt in einem inneren
  Container, `body` selbst ist genau eine Bildschirmhöhe hoch und hat
  `overflow: hidden`. Beim Drucken wäre damit alles ab der ersten Reihe
  verlorengegangen. Das Druckstylesheet hebt beides jetzt auf.

Außerdem wird die Druckklasse erst nach `afterprint` entfernt, nicht nach einem
festen Timeout: `window.print()` kehrt in manchen Browsern sofort zurück,
während der Dialog noch offen ist – die Seite hätte sich mitten im Aufbau
zurückgestellt.

Geprüft mit den echten Druckregeln: Auf der Seite bleibt nur der Bogen, drei
Spalten, acht Etiketten mit geladenen QR-Codes.

## v3.13.0 - 2026-09-01

### Düngerrechner

Die App sagte „düngen", aber nicht womit und wie viel. Auf der Flasche steht
dann „5–10 ml auf 1 Liter" – für welche Pflanze, in welcher Jahreszeit, in
welchem Substrat? Zu viel Dünger verbrennt die Wurzeln, zu wenig bringt nichts,
und beides sieht am Anfang gleich aus.

- **Sechs Düngertypen**, nach Art zugeordnet: Grünpflanzen, Blühpflanzen,
  Kakteen, Orchideen, Kräuter, Hydro. Jeweils mit der Begründung – „Mehr
  Phosphor, weniger Stickstoff, sonst gibt es Blätter statt Blüten."
- Gerechnet wird auf **die Gießmenge, die ohnehin an der Pflanze steht.**
- Die Dosis **halbiert sich** bei Jungpflanzen, im Winter und in Räumen unter
  18 Grad – und **fällt ganz weg**, wenn es der Pflanze schlecht geht, sie ein
  Steckling ist oder es unter 15 Grad hat. Der Grund steht dabei.

Beim Testen korrigiert: Die Rechnung lieferte anfangs Werte wie „0,3 ml auf
250 ml". Das kann niemand abmessen – eine Zahl, die praktisch nutzlos ist, ist
schlimmer als keine. Jetzt steht dort **die Anzahl Tropfen** (rund 0,05 ml je
Tropfen), und daneben der einfachere Weg: „2 ml auf 1 Liter – das reicht für
drei Pflanzen dieser Größe."

### Wassermenge für die Runde

- Der Knopf „Gieß-Runde starten" nennt die **Gesamtmenge**: „🚿 Gieß-Runde
  starten · 2,4 Liter". Eine Kanne fasst meist 1,5 – gut zu wissen, bevor man
  loszieht.
- Während der Runde steht dabei, wie viel noch fehlt.

## v3.12.0 - 2026-09-01

### Schädlings-Frühwarnung

Schädlinge kommen nicht zufällig. Spinnmilben erscheinen, wenn die Heizung
angeht und die Luftfeuchte fällt – jedes Jahr, zuverlässig, und bei den
Pflanzen über dem Heizkörper zuerst. Trauermücken kommen im Winter, weil dann
langsamer verdunstet wird. Blattläuse im Frühjahr mit dem frischen Austrieb.

Die App weiß inzwischen, wer wo steht und wann geheizt wird. Damit lässt sich
vorher warnen statt hinterher helfen – und das ist bei Schädlingen der
Unterschied zwischen zwei Wattestäbchen und sechs Wochen Behandlung.

- **Vier Schädlinge mit ihrer Saison:** Spinnmilben (Oktober bis März),
  Trauermücken (November bis März), Blattläuse (März bis Juni), Schildläuse
  (November bis Februar).
- Die App nennt **die Pflanzen, bei denen es zuerst losgeht** – die an der
  Heizung, unter der Klimaanlage, im feuchten oder dunklen Raum.
- Dazu **woran man den Anfang erkennt** („Blattunterseiten gegen das Licht
  halten") und ein direkter Weg zum passenden Behandlungsplan.
- Ein Hinweis kommt **höchstens einmal im Monat** je Schädling. „Kontrolliert,
  alles sauber" legt ihn bis zum nächsten Monat weg und landet im Verlauf.
- Abschaltbar unter Mehr → Erinnerungen.

Beim Testen korrigiert: Die Auswahl der gefährdeten Pflanzen zählte anfangs
auch die Wetterlage mit. „Heizperiode" trifft aber auf jede Pflanze in der
Wohnung zu – damit wurden alle als gefährdet gemeldet und die Aussage „bei
diesen zuerst" war wertlos. Jetzt zählen nur die Merkmale der Pflanze selbst;
die Jahreszeit steckt ohnehin schon in der Saison.

## v3.11.0 - 2026-09-01

### Wochenrückblick

- Sonntags um 18 Uhr eine Zusammenfassung per Push: „Diese Woche: 12-mal
  gegossen, 3 Aufgaben erledigt, eine Notiz. Eine Pflanze ist überfällig."
- Der Rückblick soll nicht nur loben – **was liegengeblieben ist, steht dabei.**
  Bewusst aufgeschobene Pflanzen zählen dabei nicht als überfällig.
- **Abschaltbar** unter Mehr → Erinnerungen.
- Gab es nichts zu berichten, kommt auch nichts. Eine Nachricht „Diese Woche:
  nichts" braucht niemand.
- Wie die Frostwarnung ein eigener Kanal mit eigener Merkspalte, sonst würde er
  die Tageserinnerung verdrängen.

### Nachgebessert

- In der Frostwarnung und im Rückblick standen „draussen", „vertraegt" und
  „ueberfaellig" – die Umschreibungen aus dem Quelltext waren in die
  Push-Nachrichten gerutscht. Jetzt mit Umlauten, wie im Rest der App.

## v3.10.0 - 2026-09-01

### Etikettenbogen

Den QR-Code gab es einzeln – für jede Pflanze eine eigene Ansicht und ein
eigener Druckvorgang. Wer zwanzig Töpfe beschriften will, klickt sich damit
einen Nachmittag lang durch.

- **Mehr → QR-Codes drucken** legt alle auf einen Bogen: drei nebeneinander,
  gestrichelte Schnittkanten, ein Druckvorgang.
- Auswahl je Pflanze oder gleich ein ganzer Standort. Große Etiketten (zwei
  pro Reihe) für Kübel und Zimmerbäume.
- Auf dem Etikett stehen **Name, Standort, Wassermenge und Intervall** – das
  reicht oft schon, ohne überhaupt zu scannen.
- Gedruckt wird über ein Druckstylesheet: Die App verschwindet dabei, nur der
  Bogen kommt aufs Papier. Der Druckdialog öffnet erst, wenn alle QR-Bilder
  wirklich geladen sind – sonst bleiben Lücken auf der Seite.

## v3.9.0 - 2026-09-01

### Gartenjahr

Der Plan zeigte vierzehn Tage. Das reicht fürs Gießen und für nichts sonst:
Umtopfen gehört ins Frühjahr, Rückschnitt vor den Austrieb, Stecklinge in den
Sommer, Düngepause in den Herbst. Wer das verpasst, merkt es erst ein Jahr
später.

- Zwei Ansichten im Plan-Tab: **14 Tage** wie bisher und **Gartenjahr**.
- Zwölf Monate mit dem, was jeweils ansteht – von „Sparsam gießen, die meisten
  Winterverluste sind ertrunkene Wurzeln" im Januar über die Eisheiligen im Mai
  bis zur Spinnmilbenzeit ab November.
- Zu jedem Monat listet die App auf, **welche deiner Pflanzen dann dran sind**:
  hochgerechnet aus den Intervallen für Düngen, Umtopfen, Schneiden und die
  eigenen Aufgaben, plus „kann raus" im Mai und „muss rein" im Oktober für
  Pflanzen, die im Sommer draußen stehen.
- Der laufende Monat steht oben und ist aufgeklappt; rückwärts blättern gibt es
  nicht, das bringt hier nichts.

## v3.8.1 - 2026-08-30

### Behoben: Das Handy aktualisierte sich beim Öffnen nicht

Zwei Ursachen, beide echt:

- **Ein wartender Service Worker meldet sich nie wieder.** Seit v2.5.0 wartet
  eine neue Fassung auf Zustimmung im Banner, statt sich sofort zu übernehmen.
  Das Banner erschien aber nur, wenn die neue Fassung *während* der laufenden
  Sitzung gefunden wurde. Lag sie beim Start schon bereit und man übersah das
  Banner, blieb das Gerät dauerhaft auf der alten Fassung – `updatefound`
  feuert nur beim Finden, nicht beim Warten, und wurde nie wieder ausgelöst.
- **Beim Öffnen wird jetzt ohne Nachfrage übernommen.** Die App wurde gerade
  gestartet, dort stört ein Wechsel niemanden. Gefragt wird nur noch, wenn die
  neue Fassung mitten in der Sitzung eintrifft – da wäre ein Neuladen lästig.
- Nach jeder Prüfung (stündlich und beim Zurückholen in den Vordergrund) sieht
  die App außerdem nach, ob etwas bereitliegt, statt sich allein auf
  `updatefound` zu verlassen.

### Und der Server cachte die Startseite

- Die nginx-Konfiguration setzte `Cache-Control: no-cache` nur für
  `/index.html`. Wer die App über `https://pflanzen.michaely.de/` öffnet – also
  ohne Dateinamen – landete in der allgemeinen Location, wo kein Header gesetzt
  war. Der Browser durfte die Seite dann heuristisch zwischenspeichern.
- Jetzt gilt `no-cache` auch dort. Auf dem Server bereits angewendet.

## v3.8.0 - 2026-08-30

### Lichtmessung

Zu wenig Licht ist die häufigste Ursache dafür, dass eine Zimmerpflanze nicht
wächst, lange dünne Triebe bildet und irgendwann eingeht – und die Ursache, die
man am schlechtesten schätzt. Das Auge gleicht Helligkeit so stark aus, dass
ein Platz, der „hell genug" aussieht, oft ein Zehntel des Lichts hat, das die
Pflanze bräuchte.

Drei Wege, je nachdem was das Gerät hergibt:

- **Schattenprobe.** Weißes Blatt an den Platz, Hand 30 cm darüber, mittags.
  Scharfer Schatten mit klaren Kanten, deutlicher Schatten mit weichen Rändern,
  schwacher verwaschener Schatten, gar keiner – vier Stufen. Die Methode, die
  Gärtner benutzen, seit es Gärtner gibt, und die erstaunlich zuverlässig ist.
- **Fensterrechner** aus Himmelsrichtung, Abstand und Verschattung. Licht nimmt
  mit dem Quadrat des Abstands ab – dass ein Meter vom Fenster schon die Hälfte
  kostet und drei Meter über 90 %, unterschätzen fast alle. Zwischen November
  und Februar rechnet die App zusätzlich mit 45 %.
- **Kameramessung**, wo das Gerät die Belichtungswerte herausgibt. Aus
  Belichtungszeit und ISO lässt sich die Beleuchtungsstärke rechnen, so wie es
  Belichtungsmesser seit jeher tun.

**Auf dem iPhone geht der dritte Weg nicht.** Safari reicht Belichtungszeit und
ISO nicht an Web-Apps weiter – anders als bei einer nativ installierten App,
die direkt an die Kamera-API kommt. Die App sagt das an Ort und Stelle, statt
eine Zahl anzuzeigen, die nicht stimmt.

Alle drei liefern einen **Bereich, keine Zahl auf die Stelle genau.** Das ist
Absicht: Scheingenauigkeit wäre schlechter als eine ehrliche Spanne.

- Das Ergebnis wird mit dem Bedarf der Art verglichen: **passt**, **knapp**
  („Sie überlebt, wächst aber langsam und bildet längere Triebe") oder **zu
  dunkel**. Unter 500 Lux kommt der Hinweis, dass dort praktisch keine
  Zimmerpflanze mehr wächst.
- Der gemessene Wert lässt sich direkt als Lichtangabe der Pflanze übernehmen.

## v3.7.0 - 2026-08-30

### Pflanzen im Freien mit Frostwarnung

Eine verpasste Frostnacht kostet die Pflanze. Nicht „schadet ihr" – kostet sie.
Bei einer Zitrone auf dem Balkon reicht eine einzige Nacht mit vier Grad.

- Jede Pflanze lässt sich als **„im Sommer draußen"** oder **„ganzjährig
  draußen"** kennzeichnen, dazu eine von vier **Kältestufen**: sehr empfindlich
  (12 °C, Monstera und Alocasia), empfindlich (8 °C, Zitrus), robust (3 °C,
  Olive und Oleander), frosthart (−5 °C).
- Die Werte sind bewusst vorsichtig: Im Topf auf dem Balkon wird es regelmäßig
  ein bis zwei Grad kälter als im Wetterbericht in zwei Metern Höhe.
- Sinkt das Nachtminimum laut Vorhersage unter die Grenze, erscheint eine
  Warnkarte oben auf der Startseite – mit Namen und einem Knopf „Alle
  reingeholt". Sind die dran, rückt die Warnung auf die nächste betroffene
  Nacht weiter.
- **Per Push, aber nachmittags.** Die Warnung geht ab 16 Uhr raus, nicht mit der
  Gießerinnerung um neun – morgens ist sie nutzlos, man will sie, wenn noch
  Zeit bleibt, die Töpfe reinzutragen. Dafür ein eigener Kanal mit eigener
  Merkspalte, sonst würde eine der beiden Nachrichten ausfallen.
- Im Frühjahr kommt der Hinweis, wenn die Nächte dauerhaft mild genug sind
  („sie könnte raus"), im Herbst der umgekehrte.
- Der Wetterdienst liefert dafür jetzt die einzelnen Nachtminima der nächsten
  drei Tage. „Heute Nacht 4 Grad" ist etwas anderes als „irgendwann wird es
  kalt".

## v3.6.0 - 2026-08-30

### Sicherungen aus der App anstoßen

Die nächtliche Sicherung läuft per systemd-Timer, von Hand ging sie bisher nur
per SSH. Für einen kurzen Blick vor einer größeren Änderung ist das zu
umständlich.

- **Mehr → Sicherungen auf dem Server** zeigt, welche es gibt, von wann und wie
  groß. **„Jetzt sichern"** stößt eine an.
- Zwei neue Endpunkte, beide nur für angemeldete Nutzer: `GET /api/backup`
  (Liste) und `POST /api/backup` (auslösen). Eine Bremse von einer Minute
  verhindert Dauerfeuer; mehr braucht es nicht, weil der Dateiname das Datum
  enthält und ein zweiter Lauf am selben Tag nur überschreibt.

### Nebenbei behoben

- **`backup.py` fand die Datenbank anders als `main.py`.** Wer sie per
  `GRUENZEUG_DB` woanders hinlegt, hätte unbemerkt eine falsche oder gar keine
  Datei gesichert. Beide nutzen jetzt dieselbe Herkunft, und fehlt die Quelle,
  bricht die Sicherung mit klarer Meldung ab statt still etwas Leeres zu
  schreiben.
- Das Zielverzeichnis lässt sich über `GRUENZEUG_BACKUP` setzen.

## v3.5.0 - 2026-08-30

### „Alle Daten löschen" ist die gefährlichste Schaltfläche der App

Sie räumt nicht nur dieses Gerät leer, sondern schiebt den leeren Stand über
den Sync innerhalb von Sekunden auf alle anderen. Eine einzelne Rückfrage im
Vorbeigehen war dafür zu wenig – und sie stimmte nicht einmal.

- Statt einer Ja/Nein-Frage jetzt eine Übersicht: **wie viele Pflanzen,
  Verlaufseinträge und Fotos** verschwinden, und dass die Einstellungen bleiben.
- Der alte Satz „Das lässt sich nicht rückgängig machen" war **falsch**, seit es
  frühere Stände gibt. Jetzt steht der Weg zurück dabei – beziehungsweise der
  klare Hinweis, dass es ohne Anmeldung tatsächlich keinen gibt.
- Der Löschknopf ist gesperrt, bis eine Bestätigung angehakt wurde.
- Direkt daneben ein Knopf **„Vorher sichern (JSON)"**.
- **Die Fotos werden mitgelöscht.** Vorher blieben sie in IndexedDB liegen –
  nach „Alle Daten löschen" war der Speicher also weiterhin belegt.

## v3.4.2 - 2026-08-30

- **Der Export wartet jetzt auf die Bilder.** Seit v3.4.1 liegen sie in
  IndexedDB und stehen kurz nach dem Start noch nicht im Datensatz – wer in
  diesem Moment exportierte, bekam ein Backup ohne Fotos, ohne es zu merken.
  Ein still unvollständiges Backup ist schlimmer als gar keins.
- Nach dem Export steht in der Meldung, wie groß die Datei ist und wie viele
  Bilder darin sind. So sieht man sofort, ob es vollständig ist.
- Wird ein Backup ohne Fotos eingespielt, setzt die App die vorhandenen Bilder
  wieder ein und sagt in der Meldung, dass das Backup keine enthielt.

## v3.4.1 - 2026-08-30

### Behoben: „Speichern fehlgeschlagen", obwohl alles gespeichert schien

Gemeldet: Die Meldung erschien, aber die Daten waren da.

- Ursache: **Der localStorage war voll.** Ein Handyfoto wiegt als Base64 100
  bis 200 KB, bei sechs Bildern je Pflanze plus Hauptbild ist das Limit von
  rund 5 MB schnell erreicht. Dann schlägt jedes Speichern fehl – auch für
  Dinge, die nichts mit Fotos zu tun haben.
- Dass trotzdem alles vorhanden schien, lag am Sync: Die Daten standen im
  Arbeitsspeicher und gingen an den Server. Nur der lokale Zwischenspeicher
  blieb auf dem alten Stand – beim nächsten Start hätte das auffallen können.
- **Fotos liegen jetzt in IndexedDB**, wo deutlich mehr Platz ist. Im
  localStorage steht nur noch der Rest. In einem Testlauf: 3 KB statt vorher
  über 100 KB für vier Bilder – und das skaliert.
- Für den Sync ändert sich nichts: Der Server bekommt weiter den vollständigen
  Datensatz mit Bildern, damit sie auf allen Geräten ankommen.
- Bilder, die der Server nicht kennt, werden nach dem Abgleich aus dem lokalen
  Speicher wieder eingesetzt – ein älterer Serverstand löscht sie nicht.
- Sollte der Speicher trotzdem einmal voll sein, sagt die Meldung jetzt die
  Wahrheit: „Auf diesem Gerät ist kein Platz mehr – deine Daten liegen aber auf
  dem Server."

### Speicherübersicht

- Unter **Mehr → Daten** steht, wie viel Platz Daten und Bilder belegen.
- Bilder ohne zugehörige Pflanze lassen sich dort entfernen. Bewusst nur auf
  Knopfdruck: Liefert der Server einmal einen älteren Stand, sähen die lokalen
  Bilder für einen Moment verwaist aus – und wären bei automatischem Aufräumen
  weg.

## v3.4.0 - 2026-08-30

### Temperaturbereiche je Raum

Der Winter-Modus verlängert das Gießintervall pauschal für die ganze Wohnung.
Das trifft es selten: Das Wohnzimmer hat im Januar 22 Grad, das Schlafzimmer
14. Für eine Pflanze ist das ein anderer Planet.

- Jeder Standort bekommt **zwei Temperaturbereiche**, einen für den Sommer und
  einen für den Winter. Vorlagen für 14 typische Räume, vom Bad bis zum
  Wintergarten und Keller.
- **Wo Werte eingetragen sind, ersetzen sie den pauschalen Winter-Modus.** Ein
  geheiztes Wohnzimmer mit 22 Grad im Januar braucht keine Verlängerung – vor
  dieser Fassung bekam es sie trotzdem.
- Sieben Stufen von ×0,75 (über 27 Grad) bis ×2,4 (unter 8 Grad), jeweils mit
  Erklärung: „Bei 12 bis 15 Grad ruht die Pflanze. Das ist für viele Arten
  sogar gut – sie brauchen die kühle Ruhephase, um im Frühjahr zu blühen."
- **Unter 15 Grad wird nicht mehr gedüngt.** Da wächst nichts, was die
  Nährstoffe verbrauchen könnte; sie versalzen nur die Erde.
- Der artspezifische Winterwert bleibt gültig: Ein Kaktus will trocken stehen,
  auch wenn sein Zimmer warm ist – dort gewinnt der höhere der beiden Werte.
- Ist ein Ort fürs Wetter gesetzt, entscheidet die **Heizperiode** statt des
  Kalenders, welcher der beiden Bereiche gilt.
- Ein kalter oder heißer Raum setzt automatisch die Merkmale „kalt" und
  „Hitze", damit die Ursachensuche sie kennt.
- Der Push-Versand rechnet mit denselben Regeln.

### Filter „Braucht Hilfe"

- Neuer Chip in der Pflanzenliste: alle Pflanzen mit schlechterem Zustand oder
  laufender Behandlung, mit Anzahl.
- Auf der Startseite steht eine Zeile darüber, mit direktem Weg dorthin.

## v3.3.0 - 2026-08-30

### Zustand der Pflanze – und die App richtet sich danach

Ein Gießplan rechnet stur nach Kalender. Das geht gut, solange es der Pflanze
gut geht – und genau dann, wenn es das nicht tut, ist es falsch.

- Drei Stufen in der Detailansicht: **geht ihr gut / schwächelt / geht ihr
  schlecht.**
- **Das Gießintervall wird verlängert**, nicht verkürzt: bei „schwächelt" um
  20 %, bei „geht ihr schlecht" um 40 %. Eine geschwächte Pflanze verbraucht
  weniger, und nasse Erde macht Wurzelprobleme schlimmer.
- **Düngen wird pausiert**, solange es ihr schlecht geht. Salz verbrennt
  beschädigte Wurzeln, statt beim Erholen zu helfen – nach der falschen
  Wassermenge der häufigste Grund, warum eine kränkelnde Pflanze am Ende
  eingeht.
- Die Karte sagt jedes Mal dazu, **was sich ändert und warum** („Gießen alle 14
  statt 10 Tage"), und bietet direkt den Weg zur Ursachensuche an.
- Der Zustand steht im Kopfbild, in der Pflanzenliste und im Verlauf.
- Der Push-Versand rechnet mit denselben Regeln.

### Peperomien fehlten ganz

Gemeldet für die Peperomia caperata: Die App schlug zweimal wöchentlich gießen
vor. Für dickfleischige Blätter ist das viel zu häufig.

- Ursache: **Peperomia stand mit keiner einzigen Art in der Liste.** Ohne
  Treffer greift kein Vorschlag, und es blieb beim Standardwert.
- Ergänzt: **Peperomia** (allgemein), **Zwergpfeffer / Peperomia caperata**,
  **Wassermelonen-Peperomie / Peperomia argyreia** und **Dickblatt-Peperomie /
  Peperomia obtusifolia** – alle mit 12 bis 14 Tagen, Winterruhe ×2 bis ×2,5
  und dem Hinweis, dass Staunässe sie schneller umbringt als Trockenheit.

## v3.2.0 - 2026-08-30

### Stecklinge und Jungpflanzen

Ein Steckling ist keine kleine Zimmerpflanze, sondern ein Stück Pflanze ohne
Wurzeln. Er kann kein Wasser aufnehmen, verdunstet aber weiter.

- Neue **Lebensphase** je Pflanze: Steckling, Jungpflanze oder ausgewachsen.
  Sie steht neben der Haltung, nicht darin – ein Steckling kann im Wasserglas,
  in Anzuchterde, in Sphagnum-Moos oder in Perlite stecken.
- Zu jeder der **vier Bewurzelungsmethoden** die übliche Dauer, der passende
  Hinweis und ein Fortschritt: „Wurzeln kommen meist nach 2 bis 6 Wochen",
  später „Länger als 6 Wochen ohne Wurzeln – sitzt der Schnitt unter einem
  Blattknoten?"
- **Kein Dünger bis zur Bewurzelung** – die Felder werden ausgeblendet, und der
  Push meldet sich nicht. Danach halbe Dosis: Beim Übergang zur Jungpflanze
  setzt die App das Düngeintervall auf den doppelten Abstand.
- Übergänge mit einem Knopf: „Hat Wurzeln" und „Ist ausgewachsen", beides im
  Verlauf festgehalten. Beim Wasserglas topft die App gleich mit ein.
- Zweite Anleitung: **Stecklinge schneiden und bewurzeln**, elf Schritte – vom
  Schnitt einen halben Zentimeter unter dem Blattknoten (der häufigste Fehler)
  bis zum Eintopfen bei 3 bis 5 cm Wurzellänge.

## v3.1.0 - 2026-08-30

### Anleitung zum Umtopfen

Die App sagt, wann etwas fällig ist. Beim Gießen reicht das. Beim Umtopfen
nicht: Da hängt viel daran, dass man es richtig macht, und die häufigsten
Fehler passieren aus Unwissen – zu großer Topf, zu tief gesetzt, danach sofort
gedüngt.

- **Zehn Schritte, immer nur einer auf dem Schirm**, mit Fortschrittsbalken.
- Vorweg eine Übersicht: bester Zeitpunkt (Februar bis Mai), Dauer, die fünf
  Anzeichen, dass es soweit ist, und die Materialliste.
- Zu jedem Schritt steht der Fehler dabei, den man an dieser Stelle macht: „Der
  häufigste Fehler: zu groß. Die Erde in der Mitte bleibt dann wochenlang nass."
- Am Ende lässt sich **„umgetopft" direkt eintragen**, ohne noch einmal zu
  suchen.
- Erreichbar aus der Pflanze heraus – bei fälligem Umtopfen steht der Knopf
  gleich bei der Aufgabe – und unter **Mehr → Anleitungen**.
- Die Struktur ist auf weitere Anleitungen ausgelegt.

## v3.0.0 - 2026-08-30

### Eigene Pflegeaufgaben

Düngen, Umtopfen, Schneiden und Spülen sind fest eingebaut, weil fast jede
Pflanze sie braucht. Alles andere ist zu verschieden: Die Monstera braucht
einen Stützstab, die Orchidee will abgeduscht werden, die Zitrone kontrolliert
man im Winter wöchentlich auf Schildläuse.

- Jede Pflanze kann jetzt **eigene Aufgaben** bekommen: Name, Symbol aus 20
  Emoji, Intervall in Tagen oder Monaten, zuletzt erledigt. Bis zu zehn Stück.
- **Zehn Vorlagen** für den schnellen Start: Zurückschneiden, Auf Schädlinge
  kontrollieren, Blätter abstauben, Abduschen, Verblühtes ausputzen, Topf
  drehen, Untersetzer leeren, Erde lockern, Stütze prüfen, Luftwurzeln
  befeuchten.
- Sie verhalten sich wie die eingebauten: eigene Statuskachel, „Heute zu tun",
  „Weitere Pflege" in der Tagesansicht, „Alles erledigen", Nachtragen,
  Rückgängig, **und Push-Erinnerung** („Monstera abduschen").
- Damit das nicht doppelt gepflegt werden muss, liefert `aufgabenVon(p)` feste
  und eigene Aufgaben in einer Form; alle Stellen arbeiten darauf.

### Kommentare im Verlauf

Das Feld „Notizen" an der Pflanze ist ein Steckbrief – Dinge, die dauerhaft
gelten. Was man unterwegs festhalten will, hat dagegen ein Datum.

- **Notizen mit Datum** landen im Verlauf: „neues Blatt", „Erde gewechselt",
  „linke Seite kahl geworden".
- **Jeder Verlaufseintrag lässt sich antippen und kommentieren** – auch ein
  Gießvorgang („mit Regenwasser") oder eine beendete Behandlung.
- Der Verlauf zeigt acht Einträge, „Alle zeigen" klappt den Rest auf. Einträge
  lassen sich löschen.

### Übersichtlichere Detailansicht

Mit Behandlungen, Umgebung, Fotos und Verlauf war die Ansicht lang geworden.

- **Pflege, Fotoverlauf, Verlauf und „Mehr zu dieser Pflanze" klappen auf und
  zu.** Oben bleibt, was täglich zählt: Bild, Status, was heute zu tun ist.
- Welche Abschnitte offen sind, merkt sich die App geräteweise.
- Der Abschnitt „Pflege" listet jetzt auch alle Intervalle auf einen Blick,
  inklusive der eigenen Aufgaben und der aktuellen Hitze-Verkürzung.

## v2.8.0 - 2026-08-30

### Fälligkeit um beliebig viele Tage verschieben

Die Pflanze ist fällig, aber die Erde ist noch feucht. Gießen wäre falsch,
ignorieren hilft nicht – morgen steht sie wieder da, dann überfällig.

- Bisher gab es nur zwei Möglichkeiten: gießen (und damit das volle Intervall
  neu starten) oder überfällig stehen lassen. Zwischen „morgen nochmal
  schauen" und „in zehn Tagen wieder" fehlte alles dazwischen.
- **Später erinnern** verschiebt die Fälligkeit um eine frei wählbare Anzahl
  Tage: acht Vorschläge von morgen bis 14 Tage, dazu ein Feld für jede andere
  Zahl bis 180.
- **Der Rhythmus bleibt unangetastet.** `letzt` wird nicht verändert – wird
  danach gegossen, zählt der tatsächliche Abstand, nicht der aufgeschobene.
  Die Pünktlichkeit in der Statistik bleibt damit ehrlich.
- Die zuletzt gewählte Zahl ist beim nächsten Mal vorausgewählt.
- Erreichbar aus der Detailansicht und aus der Gieß-Runde („Noch nicht – später
  erinnern"); die Runde läuft danach an derselben Stelle weiter.
- Der Status zeigt „Verschoben, in 5 Tagen"; der Aufschub lässt sich jederzeit
  aufheben, und Gießen räumt ihn von selbst weg.
- Der Push-Versand hält sich daran – aber nur beim Gießen. Düngen, Umtopfen und
  eine laufende Behandlung melden sich weiter.

### Nachgezogen

- Die beiden neuen Blätter aus v2.7.0 (Ort) und dieser Fassung hatten nicht die
  Struktur der übrigen: ohne `backdrop` und `panel` schwebte der Inhalt
  ohne Hintergrund über der Seite.

## v2.7.0 - 2026-08-30

### Umgebung der Pflanze

Zwei Pflanzen derselben Art brauchen völlig Unterschiedliches, je nachdem, wo
sie stehen. Über der Heizung trocknet die Luft aus und Spinnmilben kommen;
unter der Klimaanlage passiert dasselbe, nur im Sommer. Am Südfenster
verdunstet im August das Doppelte, im dunklen Flur fast nichts.

- Jede Pflanze bekommt deshalb Merkmale ihres Platzes, als Mehrfachauswahl in
  der Bearbeiten-Maske: **Heizung, Klimaanlage, direkte Mittagssonne, Zugluft,
  kalter Boden, feuchter Raum, wenig Tageslicht.**
- Die Merkmale stehen als Chips in der Detailansicht.

### Wetter

Zimmerpflanzen stehen drinnen – trotzdem entscheidet das Wetter draußen, ob die
Heizung läuft, wie schnell die Töpfe austrocknen und wie viel Licht ankommt.

- Neue Einstellung **Ort**, per Suchfeld gesetzt. Die Daten kommen von
  Open-Meteo, abgerufen **vom Grünzeug-Server**: Kein Gerät baut dafür eine
  Verbindung nach außen auf, Open-Meteo sieht nur die Server-IP.
- Abgeleitet wird nicht das Wetter, sondern was für Pflanzen zählt:
  **Heizperiode** (Tagesmittel unter 15 °C), **Hitze** (zweimal über 28 °C in
  drei Tagen), **Frost** (Nachtminimum unter 1 °C in den nächsten Tagen),
  **trüb** (unter zwei Sonnenstunden am Tag). Gerechnet über drei vergangene
  und drei kommende Tage, damit ein einzelner warmer Nachmittag die Lage nicht
  kippt.
- Bei Hitze werden alle Pflanzen **20 % früher fällig**, mit dem Merkmal
  „direkte Mittagssonne" **30 %**. Eine Zeile über der Tagesliste sagt, warum.
- Bewusst nur in eine Richtung: Verlängert wird weiter über den Winter-Modus.
  Beides zusammen würde doppelt zählen und die Pflanze stünde im Januar sechs
  Wochen trocken.
- Der Push-Versand rechnet mit denselben Regeln (`wetter.py` liegt auch auf
  dem Server, Ergebnisse werden zwei Stunden zwischengespeichert).

### Problem-Hilfe kennt die Lage

- 14 Ursachen sind mit den Merkmalen verknüpft, bei denen sie wahrscheinlich
  sind. Passende Ursachen stehen jetzt **oben**, mit einer Marke „Passt zu
  <Pflanze>: steht an der Heizung".
- Bei „Braune Blattspitzen" im Januar über der Heizung ist die Antwort damit
  gefunden, bevor man den Rest gelesen hat.
- „Aufgefallen" nennt zusätzlich die kritischen Kombinationen: Heizperiode plus
  Heizung, Hitze plus Mittagssonne, Frost plus Zugluft, trübe Tage plus
  Dunkelheit.

## v2.6.0 - 2026-08-30

### Behandlungspläne

- Bisher endete die Problem-Hilfe beim Ratschlag: Symptom wählen, mögliche
  Ursachen lesen – und dann? Wer die Ursache erkannt hatte, konnte das nirgends
  festhalten.
- Jede Ursache hat jetzt einen Knopf **„Das ist es → Behandlungsplan"**. Der
  Plan besteht aus Schritten mit Abstand in Tagen, gruppiert nach „Sofort",
  „Nach 3 Tagen", „Nach 2 Wochen".
- **Behandlung starten** hängt den Plan an die Pflanze. Von da an meldet er sich
  wie jede andere Aufgabe: in der Tagesansicht unter „Behandlung", in der
  Pflanze als eigene Karte mit Fortschritt, und per Push.
- Ist der letzte Schritt abgehakt, endet die Behandlung von selbst. Vorzeitig
  beenden geht auch, mit Rückfrage bei offenen Schritten.
- Warum das der Kern der Sache ist: **Bei Schädlingen entscheidet die
  Wiederholung.** Eine einmalige Behandlung erwischt nie alle Eier, drei Wochen
  später ist der Befall zurück. Deshalb hat der Spinnmilben-Plan drei
  Durchgänge im Abstand von fünf Tagen und die Trauermücken bekommen ihre
  zweite Nematoden-Gabe nach zwei Wochen.
- 26 Pläne zu den zehn Symptomen, von der Wurzelfäule (austopfen, schneiden,
  umsetzen, drei Wochen beobachten) bis zur fehlenden Ruhephase (zehn Wochen
  kühl und trocken).
- Nur „Natürliche Alterung" hat keinen Plan – ein altes Blatt entfernt man
  einmal und ist fertig.
- Der Push-Versand kennt die Pläne nicht. Damit er trotzdem rechnen kann,
  schreibt die App die Tagesabstände beim Start mit in den Datensatz.
- Eine laufende Behandlung geht in der Push-Nachricht vor dem Gießen: Wer den
  Termin verpasst, fängt praktisch von vorne an.

## v2.5.1 - 2026-08-30

- Die Vorschlagslisten für **Name** und **Art** standen in der Reihenfolge, in
  der die 91 Arten über die Zeit eingepflegt wurden – also thematisch gruppiert
  statt alphabetisch. Bei „Art" fiel das besonders auf, weil dort Einträge ohne
  botanischen Namen auf den deutschen zurückfallen und sich beides mischte.
- Beide Listen werden jetzt alphabetisch nach deutscher Sortierung ausgegeben,
  doppelte Einträge fallen weg.
- `ARTEN` selbst bleibt unverändert: `artFinden` nimmt den ersten Treffer, die
  Reihenfolge entscheidet dort mit, welche Art bei mehrdeutigen Namen gewinnt.
  Sortiert wird nur die Anzeige.

## v2.5.0 - 2026-08-30

### Semi-Hydrokultur

- **Haltung** ist jetzt ein eigenes Feld mit drei Werten: Erde, Semi-Hydro
  (Blähton, Pon, Seramis) und Ableger im Wasser. Das bisherige Kennzeichen
  `imWasser` wird beim Laden automatisch übersetzt, bestehende Pflanzen müssen
  nicht angefasst werden.
- Semi-Hydro folgt anderen Regeln als Erde, deshalb ändert sich mit der Haltung
  auch die Maske:
  - Aus „Gießen" wird **Nachfüllen** – es geht um den Wasserstand im
    Übertopf, nicht um durchdringendes Wässern.
  - Ein **eigenes Düngeintervall entfällt.** Blähton und Pon liefern keine
    Nährstoffe, gedüngt wird deshalb bei jeder Wassergabe, schwach dosiert.
    Die App schreibt das als Zusatz „mit Dünger" an die Aufgabe.
  - **Umtopfen und Topfgröße** fallen weg: Das Substrat verrottet nicht, es
    wird gewechselt statt turnusmäßig vergrößert.
- Neue Aufgabe **Substrat spülen**, voreingestellt alle sechs Wochen. Ohne das
  reichern sich Düngesalze im inerten Substrat an – der häufigste Grund, warum
  Pflanzen in Semi-Hydro nach einem halben Jahr nachlassen.
- Keine Winterruhe bei Semi-Hydro und Ablegern: Der Wasserstand sinkt im Januar
  genauso wie im Juli.
- Der Push-Versand rechnet mit denselben Regeln und meldet „braucht Wasser mit
  Dünger" statt „braucht Wasser".

### Hinweis auf neue Fassungen

- Die App liegt im Zwischenspeicher des Service Workers, damit sie offline
  läuft. Eine neue Fassung blieb dadurch unbemerkt im Hintergrund liegen, bis
  der Browser irgendwann von selbst wechselte.
- Jetzt meldet sich eine Leiste **„Neue Version verfügbar"**, sobald etwas
  bereitliegt. Der Wechsel passiert erst auf Knopfdruck, damit er nicht mitten
  in einer offenen Ansicht stattfindet. Wer ihn wegklickt, arbeitet
  unverändert weiter.
- Geprüft wird beim Start, stündlich und immer dann, wenn die App wieder in den
  Vordergrund kommt.
- Nach dem Neuladen erscheint einmalig, was sich geändert hat, mit einem Weg
  zur vollständigen Versionshistorie.

### Bilder

- Fotos wurden auf 400 px (Pflanzenbild) beziehungsweise 500 px
  (Fotoverlauf) verkleinert. Auf einem Handydisplay mit zwei bis drei
  Gerätepixeln je Bildpunkt läuft das Pflanzenbild über rund 1100 Pixel – es
  wurde also fast dreifach hochgerechnet und sah entsprechend grob aus.
- Die Zielgröße richtet sich jetzt nach der Pixeldichte des Geräts
  (bis 1100 px Pflanzenbild, 900 px Fotoverlauf, 1600 px Hintergrund). Auf dem
  Desktop bleibt es klein, auf dem Handy wird es scharf.
- Verkleinert wird in Halbierungsschritten statt in einem Rutsch. Wer ein
  4000er Foto direkt auf 1000 zieht, verwirft drei von vier Pixeln ungefragt;
  feine Blattstrukturen wurden dabei zu Krisseln.
- Ein typisches Handyfoto wächst dadurch von etwa 25 KB auf 60 bis 150 KB.
  Vor dem Hinzufügen eines Bildes warnt die App, wenn der Browserspeicher über
  4 MB voll ist, statt das Speichern scheitern zu lassen.

## v2.4.0 - 2026-08-30

- Zwölf Kakteen ergänzt, bewusst nach zwei Gruppen getrennt:
  - **Wüstenkakteen** – Goldkugelkaktus, Warzenkaktus, Feigenkaktus,
    Säulenkaktus, Gymnocalycium, Rebutia, Bischofsmütze, Alterskaktus:
    alle 14 bis 21 Tage, Vollsonne, wenig Wasser.
  - **Regenwaldkakteen** – Rhipsalis, Blattkaktus, Weihnachtskaktus: alle 7 bis
    10 Tage, halbschattig, deutlich mehr Wasser. Sie mit Wüstenkakteen gleich
    zu behandeln ist der häufigste Fehler bei diesen Arten.
  - Dazu der Wolfsmilchkaktus, der botanisch keiner ist – mit dem Hinweis auf
    den reizenden Milchsaft.
- Die Artenliste kennt jetzt die passende Winterruhe und trägt sie beim
  Übernehmen mit ein: Ein Goldkugelkaktus steht damit im Winter automatisch auf
  63 statt 21 Tagen, ein Weihnachtskaktus nur auf 15 statt 10.
- Der Vorschlagstext weist darauf hin, wenn eine Art im Winter deutlich weniger
  braucht.

## v2.3.1 - 2026-08-30

- „war gestern" fehlte noch bei den Sammelaktionen: nach „Alle gießen" und nach
  einer beendeten Gieß-Runde ließ sich nichts nachtragen, obwohl gerade dort
  mehrere Einträge auf einmal betroffen sind.
- Statt für jede Aktion eine eigene Lösung arbeitet das Nachtragen jetzt auf der
  zuletzt gemerkten Änderung. Damit greift es überall gleich – einzeln,
  „Alle gießen", ganze Gieß-Runde oder „Alles erledigen" – und trägt auch
  mehrere Einträge zusammen um, ohne Dubletten im Verlauf anzulegen.
- Rückgängig bleibt danach möglich.

## v2.3.0 - 2026-08-30

- Erledigtes lässt sich nachtragen. Bisher galt jedes Abhaken für den aktuellen
  Tag: Wer gestern gegossen und erst heute abgehakt hat, verschob damit den
  Rhythmus um einen Tag – und die Pünktlichkeit in der Statistik zählte es als
  verspätet, obwohl alles rechtzeitig war.
- Zwei Wege: In der Meldung nach dem Abhaken steht neben "Rückgängig" jetzt
  "war gestern" – ein Tipp korrigiert es. Für weiter zurückliegende Tage gibt
  es in der Aufgabenkarte die Zeile "Erledigt am" mit Datumsauswahl; sie gilt
  für alles, was danach in dieser Ansicht abgehakt wird.
- Der Verlaufseintrag bekommt den passenden Zeitpunkt (mittags am gewählten
  Tag), damit die Auswertung stimmt.
- Das gewählte Datum gilt nur, solange die Pflanze geöffnet ist – beim nächsten
  Öffnen steht wieder "heute", damit ein vergessenes Datum nichts verfälscht.

## v2.2.0 - 2026-08-30

- Ableger im Wasser als eigene Haltung. Ein Steckling im Glas wird nicht
  gegossen – sein Wasser muss gewechselt werden, sonst kippt es und die
  Wurzeln faulen. Die App spricht entsprechend von "Wasser wechseln" statt
  "Gießen", voreingestellt alle fünf Tage.
- Im Formular unter "Haltung" wählbar. Was im Glas keinen Sinn ergibt –
  Topfgröße, Winterruhe, Düngen, Umtopfen, Schneiden – wird ausgeblendet.
- Die Winterruhe gilt für Ableger nicht: Ein Glas Wasser kippt im Januar
  genauso schnell wie im Juli.
- "Im Wasser seit" wird mitgeführt und in der Detailansicht angezeigt
  ("seit 3 Wochen").
- Ist der Steckling bewurzelt, macht ein Knopf daraus eine eingetopfte
  Pflanze: Gießintervall, Wassermenge, Licht und Düngerrhythmus kommen aus
  der Artenliste, der Wechsel steht im Verlauf.
- Auch die Erinnerungen unterscheiden: "Bei Monstera-Steckling das Wasser
  wechseln." statt "braucht Wasser".

## v2.1.1 - 2026-08-30

- Behoben: Seit v2.0.0 ließen sich Pflanzen mit Verlaufseinträgen nicht mehr
  öffnen – ein Antippen blieb wirkungslos. Beim Umbau der Detailansicht war die
  Funktion `logText` mit gelöscht worden, die den Verlauf beschriftet. Sie wird
  nur aufgerufen, wenn es Einträge gibt, deshalb funktionierten frisch
  angelegte Pflanzen weiterhin und der Fehler fiel beim Testen nicht auf.

## v2.1.0 - 2026-08-30

- Mehrere Pflanzen in einem Topf: Eine Schale mit drei Arten wird einmal
  gegossen, nicht dreimal. Der Topf bleibt deshalb die Einheit mit einem
  Intervall und einer Wassermenge; die Arten darin stehen als Mitbewohner
  daneben und erscheinen in der Detailansicht.
- Die App prüft, ob die Arten zusammenpassen: Unterscheiden sich die
  Gießintervalle um mehr als das Dreifache, warnt sie ausdrücklich – nach der
  durstigsten zu gießen ersäuft die genügsamste. Sonst schlägt sie das
  Intervall der durstigsten vor.
- Auch unterschiedlicher Lichtbedarf im selben Topf wird angezeigt.
- Topf-Durchmesser eingebbar: Daraus schätzt die App die Wassermenge – die
  hängt am Topfvolumen, nicht an der Zahl der Pflanzen darin.
- Die Suche findet Pflanzen auch über ihre Mitbewohner.

## v2.0.1 - 2026-08-30

- Der helle Modus war mit #F1F4EE praktisch weiß – der neue Grünton war kaum
  zu erkennen, der Unterschied zeigte sich nur im dunklen Modus. Der Grund ist
  jetzt sichtbar grün, Flächen und Trennlinien entsprechend kräftiger.
- Die Pflanzenliste zieht mit: Der Status steht in seiner Farbe (rot für
  überfällig, grün für heute, ocker für demnächst), die Symbolfläche bekommt
  denselben Verlauf wie das große Bild in der Detailansicht.
- Fällige Pflanzen haben einen Abhak-Kreis direkt auf der Kachel – abhaken,
  ohne die Pflanze zu öffnen.

## v2.0.0 - 2026-08-30

Neues Erscheinungsbild. Das bisherige folgte dem iOS-Systemlook – neutrales
Grau, reines Schwarz, kräftige Systemfarben. Für eine Pflanzen-App wirkt das
kühl und beliebig.

- **Warme Farbwelt**: gedecktes Blattgrün und Erdtöne. Der helle Modus hat
  einen cremig-grünen Grund statt Systemgrau, Text ist dunkles Waldgrün statt
  Schwarz. Der dunkle Modus ist fast schwarz, aber mit Grünstich.
- **Neue Detailansicht**: großes Bild der Pflanze über die volle Breite, mit
  Standort und Fälligkeit als Chips darüber. Darunter der Name und die
  botanische Bezeichnung.
- **Fortschrittsringe** je Aufgabe: Gießen, Düngen, Umtopfen und Schneiden
  zeigen als Ring, wie weit das Intervall aufgebraucht ist – mit Fälligkeit
  und Datum des letzten Mals.
- **Aufgabenkarte "Heute zu tun"**: offene Punkte einzeln abhaken, überfällige
  mit Hinweis wie "2 Tage zu spät", darunter "Alles erledigen" für die ganze
  Pflanze auf einmal.
- **Ruhigere Listen**: statt farbig gefüllter Knöpfe mit Emoji nur noch ein
  schlichter Abhak-Kreis, der sich nach der Dringlichkeit färbt.
- **Akzentfarben** passen zur neuen Palette: Blattgrün, Salbei, Oliv,
  Terrakotta, Ocker, Rost, Petrol, Pflaume. Alte Einstellungen werden auf die
  nächstliegende neue Farbe umgestellt.

## v1.18.0 - 2026-08-30

- Frühere Stände: Der Server hebt die letzten zwanzig Datenstände auf. Unter
  Mehr → Daten → "Frühere Stände" lassen sie sich ansehen und wiederherstellen.
  Damit ist ein versehentliches "Alle Daten löschen" nicht mehr endgültig –
  bisher verteilte der Sync so etwas binnen Sekunden auf alle Geräte.
- Gesichert wird stündlich und immer dann, wenn Pflanzen verschwinden. Der
  zweite Fall ist der wichtige: genau dann will man zurück.
- Auch das Wiederherstellen wird gesichert, ist also selbst umkehrbar.
- Zusätzlich sichert der Server die Datenbank täglich um 3:30 Uhr nach
  /var/backups/gruenzeug, gepackt und sieben Tage aufbewahrt. Die
  VAPID-Schlüssel liegen dabei – ohne sie wären nach einer Wiederherstellung
  alle Push-Abos ungültig.

## v1.17.1 - 2026-08-30

- Urheberrechtshinweis ergänzt: in der Fußzeile unter Mehr, auf der
  Anmeldeseite, als Meta-Angabe im HTML und im Kopf aller Quelldateien.

## v1.17.0 - 2026-08-29

- Erinnerungen gelten jetzt für alle Pflegeaufgaben. Bisher meldete der Server
  nur fällige Gießtermine – Düngen, Umtopfen und Schneiden standen zwar in der
  App, lösten aber keine Nachricht aus.
- Die Nachricht bündelt gleiche Tätigkeiten: "Orchidee und Zitrone düngen"
  statt zweier Sätze. Steht beides an, kommt das Gießen zuerst und die Pflege
  als "Außerdem: …".
- Behoben: Der Versand hat archivierte Pflanzen mitgezählt und hätte an
  Pflanzen erinnert, die in der App gar nicht mehr auftauchen.
- Behoben: Der Versand rechnete weiter mit dem pauschalen Winterfaktor 1,5 und
  ignorierte die Winterruhe, die seit v1.16.0 je Pflanze einstellbar ist. Server
  und App kamen dadurch zu unterschiedlichen Fälligkeiten.
- Umtopfen und Schneiden rechnen serverseitig jetzt echte Monate, mit
  Begrenzung aufs Monatsende (31.01. plus ein Monat ist der 28.02.).

## v1.16.3 - 2026-08-29

- Das Archiv war praktisch nicht zu finden: Sein Chip stand hinter allen
  Standort-Chips und damit außerhalb des sichtbaren Bereichs. Er sitzt jetzt
  direkt hinter "Alle".
- Zusätzlich unter Mehr → Daten eine Zeile "Archiv" mit Anzahl, die direkt in
  die Archivansicht springt. Sie erscheint nur, wenn dort etwas liegt.
- In der Archivansicht steht jetzt, was archivierte Pflanzen bedeuten und wie
  man sie zurückholt.

## v1.16.2 - 2026-08-29

- Behoben: Der Knopf "QR-Code für den Topf" schien nichts zu tun. Das Sheet
  öffnete sich tatsächlich, lag aber unsichtbar hinter der Detailansicht: Alle
  Sheets teilen sich einen z-index, also entschied die Reihenfolge im HTML –
  und die Detailansicht steht dort weiter unten. Dasselbe betraf die
  Foto-Großansicht.
- Das zuletzt geöffnete Sheet wandert jetzt nach vorne, unabhängig von seiner
  Position im Dokument.

## v1.16.1 - 2026-08-29

- Behoben: Ein gescannter QR-Code meldete "Diese Pflanze gibt es hier nicht",
  wenn das Gerät die Daten noch nicht geladen hatte. Die Kennung wurde sofort
  beim Start ausgewertet – zu einem Zeitpunkt, an dem der Abgleich mit dem
  Server noch lief. Betraf genau den Normalfall: Scannen mit der Kamera öffnet
  Safari, nicht die installierte App, und Safari hat einen eigenen Speicher.
- Die Kennung wird jetzt gemerkt und dreimal versucht: sofort, nach dem
  Abgleich mit dem Server und nach einer Anmeldung. Liegt die Pflanze im
  Archiv, wird darauf hingewiesen.

## v1.16.0 - 2026-08-29

- Archivieren statt löschen: Eine Pflanze verschwindet aus allen Listen,
  Zählungen und Erinnerungen, behält aber Verlauf und Fotos. Sichtbar über
  einen eigenen Chip in der Pflanzenliste, von dort auch wieder zurückholbar.
  Endgültiges Löschen bleibt daneben bestehen.
- Pflanzenliste sortierbar: nach Dringlichkeit, Name oder Standort. Bei
  Standort wird nach Räumen gruppiert mit Zwischenüberschriften.
- Winterruhe je Pflanze: Statt pauschal Faktor 1,5 für alle lässt sich pro
  Pflanze wählen zwischen "keine", ×1,5, ×2 und ×3. Ein Kaktus braucht im
  Winter fast nichts, ein Basilikum auf der Fensterbank weiterhin viel.
- QR-Code für den Topf: In der Detailansicht erzeugbar, ausdruckbar und zum
  Ankleben gedacht. Scannen öffnet genau diese Pflanze in der App. Der Code
  enthält nur die Kennung, keine Daten – ohne Anmeldung sieht ein Fremder
  nichts.

## v1.15.0 - 2026-08-29

- Gieß-Runde: Sind mehr als zwei Pflanzen fällig, führt ein Knopf auf der
  Startseite durch die Wohnung – nach Standort gruppiert, immer nur eine
  Pflanze auf dem Schirm, mit Wassermenge und Pflegehinweis. Gegossen wird
  erst am Ende gespeichert, sodass sich die ganze Runde in einem Zug
  zurücknehmen lässt.
- Problem-Hilfe zu zehn typischen Symptomen: gelbe Blätter, braune Spitzen,
  hängende Blätter, Trauermücken, Schimmel, klebrige Blätter, Spinnmilben,
  fehlendes Wachstum, Blattfall und ausbleibende Blüten – jeweils mit den
  wahrscheinlichen Ursachen und konkreten Maßnahmen.
- Wird die Hilfe aus einer Pflanze heraus geöffnet, prüft sie deren
  eingetragene Werte: ein Gießintervall, das stark vom Richtwert der Art
  abweicht, fehlendes Düngen oder lange Überfälligkeit werden vorangestellt.
- Erinnerungen lassen sich verschieben: Die Benachrichtigung hat jetzt einen
  Knopf "In 2 Stunden". Vorher hieß Wegwischen, dass an diesem Tag nichts mehr
  kam.
- Der Server ergänzt fehlende Datenbankspalten beim Start selbst –
  `create_all` legt nur fehlende Tabellen an, keine fehlenden Spalten.

## v1.14.2 - 2026-08-29

- Symbolauswahl beim Anlegen von 15 auf 24 erweitert. Darunter 🍁 – ein
  Cannabis-Emoji gibt es in Unicode nicht, das Ahornblatt ist mit seinen fünf
  Zacken der übliche Ersatz. Dazu Blüten, Beeren und ein Baum.

## v1.14.1 - 2026-08-29

- Hanf (Cannabis sativa) in die Artenliste aufgenommen: alle 3 Tage, Vollsonne,
  500 ml, Düngen alle 10 Tage. Damit sind es 80 Arten.

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
