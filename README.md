# Matheplaner

Webapp für die Unterrichtsplanung Mathematik am Gymnasium in Sachsen (Klasse 6 und 8):
Stoffverteilung über das Schuljahr, eine „Heute“-Ansicht mit dem aktuellen Thema und eine
Lernübersicht, die mit FSRS plant, welche Atome heute wiederholt werden.

Veröffentlicht als Claude-Artefakt: https://claude.ai/artifact/QTM6gwAywgmNziMxYMs9zB
und über GitHub Pages: https://zefanja.github.io/stoffverteilungsplan/

## Aufbau

| Pfad | Inhalt |
|---|---|
| `dist/index.html` | Seite mit Layout und Styles |
| `dist/app.js` | App-Logik: Planberechnung, FSRS, Ansichten, Speicherung |
| `dist/logo.svg`, `dist/logo-mark.svg` | Schullogo FELS (voll für die Seitenleiste, Felszeichen ohne Schriftzug für Kopf und Handy) |
| `dist/data.js` | Erzeugt: Einheiten, Atome, Standard-Sequenzen, Kalender, Stundenpläne |
| `dist/vorlage.js` | Erzeugt: Fachschaftsvorlage aus `src/vorlage/*.json` (leer = es gilt der Lehrplan) |
| `src/vorlage/` | Gemeinsame Vorlagen der Fachschaft, je Klasse eine aus der App exportierte JSON-Datei |
| `src/build_vorlage.js` | Prüft `src/vorlage/*.json` gegen `dist/data.js` und baut `dist/vorlage.js` |
| `dist/generators.js` | Erzeugt: Aufgabengeneratoren für die Wiederholung (aus der Anemo-Mathe-App) |
| `src/extract.py` | Liest Einheiten und Sequenzen aus den Excel-Stoffverteilungsplänen in `in/` |
| `src/atoms.py` | Atome je Einheit: Stunde, Atom, Prüffrage, Lösung |
| `src/atoms_lehrplan/<id>.json` | Atome der Lehrplan-Klassen je Einheit: `[Stunde, Atom, Frage, Lösung, Frage 2, Lösung 2, Frage 3, Lösung 3]` |
| `src/build_data.py` | Baut `dist/data.js` und gleicht die Puffer an die Stundenpläne an |
| `src/anemo/generators.ts` | 194 Aufgabengeneratoren, unverändert übernommen aus [zefanja/anemo](https://github.com/zefanja/anemo) (`src/lib/server/tasks/generators.ts`); `src/anemo/labels.json` enthält ihre Titel |
| `src/generator_map.json` | Welches Atom welchen Generator nutzt (Klasse → Atom-ID → Generator-ID oder Liste) |
| `src/build_generators.js` | Baut `dist/generators.js` aus `src/anemo/` (Node ≥ 22.13 entfernt die TypeScript-Typen) und prüft jeden Generator |
| `src/fetch_lehrplan.js` | Lädt die Mathematik-Lehrpläne GYM/OS aus der Lehrplandatenbank Sachsen (Playwright, Browsersitzung nötig) |
| `src/parse_lehrplan.py` | Liest die Lehrplan-HTML-Seiten (Lernbereiche, Lernziele, Inhalte, Bemerkungen, MathML-Formeln) nach `src/lehrplan.json` |
| `src/from_lehrplan.py` | Erzeugt daraus Klassen: Einheiten je Lernziel, Stundenthemen aus den Inhalten, Sequenz, Standard-Stundenplan |
| `src/fetch_ferien.py` | Lädt Schulferien und Feiertage Sachsen von openholidaysapi.org nach `src/ferien_sn.json` |
| `src/test.js` | Headless-Test mit Playwright (Ansichten, Aktionen, FSRS) |
| `.github/workflows/pages.yml` | Veröffentlicht `dist/` bei jedem Push auf `main` über GitHub Pages |
| `in/` | Excel-Stoffverteilungspläne Klasse 6 und 8 als Datenquelle |

## Daten neu erzeugen

```bash
python3 -I src/fetch_ferien.py  # optional: Ferien Sachsen aktualisieren
python3 -I src/extract.py       # in/*.xlsx -> src/plan.json
python3 -I src/build_data.py    # plan.json + atoms.py + generator_map.json -> dist/data.js
node src/build_generators.js    # src/anemo/generators.ts -> dist/generators.js
node src/build_vorlage.js       # src/vorlage/*.json -> dist/vorlage.js (Fachschaftsvorlage)
NODE_PATH=$(npm root -g) node src/test.js   # startet einen lokalen Webserver, Screenshots nach docs/screenshots
# ohne Internet: MathJax lokal bereitstellen, z. B. npm pack mathjax@3.2.2 und
# MATHJAX_JS=/pfad/package/es5/tex-svg.js voranstellen
```

## Funktionen

- **Schulart (GYM/OS), Klassenstufe und Schuljahr** werden oben in der Leiste gewählt. Stufen ohne hinterlegten Lehrplan sind
  ausgegraut; Jahresplan, Sequenz, Einheiten, Lernübersicht,
  Stundenplan und Heute-Ansicht folgen dieser Auswahl („Alle meine Klassen“ zeigt auf der Heute-Seite alle Klassen mit Stunden im Stundenplan).
- **Meine Klassen** (Einstellungen, je Schuljahr): welche Klassenstufen Sie unterrichten, ob mit einer oder zwei
  Parallelklassen und wie diese heißen. Nur diese Klassen sind oben wählbar und erscheinen unter „Alle meine Klassen“;
  ein neues Schuljahr übernimmt die Auswahl. Ohne Festlegung gelten alle Klassen mit hinterlegtem Lehrplan.
- **Parallelklassen** (höchstens 2 je Stufe, z. B. 8a/8b; Einstellungen → Meine Klassen): Sequenz, Modus und Atome
  werden einmal für alle geplant. Jede Parallelklasse hat eigenen Stundenplan, Zeiträume ohne Unterricht, Ausfälle,
  Häkchen und Lernstand. „Einheit braucht 1 Std. mehr“ und automatische Pufferkürzung werden als Abweichung nur dieser
  Klasse gespeichert und in der Sequenz neben den Stunden angezeigt (z. B. „8b: +1“). Gewechselt wird oben in der Leiste.
- **Formelsatz**: Mathematische Ausdrücke in Atomen, Aufgaben, Stundentiteln und Lehrplantexten werden automatisch erkannt
  (Brüche wie `3/4` und `2 1/4`, Hochzahlen, Periode, Punkte `P(2 | 5)`, Mengen, Einheiten) und mit MathJax 3 (SVG, vom CDN)
  gesetzt; auch selbst bearbeitete Atome. Ohne MathJax bleibt der normale Text stehen. CAS-Eingaben wie `2*(x+1)^2` bleiben Code.
- **Design**: Farben aus dem Schullogo (Blau #0094cd, Orange #f59b0a, Grün #afca0b, Rot #d91016; für Text abgedunkelt).
  Seitenleiste mit Felszeichen, Navigation und vollem Logo, auf dem Handy als Kopfzeile. Heute zeigt für die gewählte Klasse
  vier Kacheln: aktuelle Einheit, heute fällig, ø Abruf, Reserve (rot, wenn Stunden fehlen); Rot nur für Warnungen.
- **Heute**: heutige Stunden je Klasse aus Kalender × Stundenplan × Sequenz, neue Atome der Stunde,
  Knöpfe „gehalten“, „Einheit braucht 1 Std. mehr“, „fällt aus“ (kürzt automatisch den nächsten Puffer).
- **Jahresplan**: Wochenübersicht je Strang, FIL-Stunden (Spur „FIL“, nur Klasse 7–9) mit Formatvorschlägen.
- **Sequenz**: Reihenfolge, Stunden, Strang, Puffer; Modus „in Strängen“ oder „nacheinander“; Reserve je Strang.
- **Klassenarbeits-Platzhalter**: Jede Klasse hat in der Vorlage vier allgemeine Platzhalter „Klassenarbeit 1–4“
  (Oberstufe „Klausur 1–4“), zwei je Halbjahr, ohne Bezug zu bestimmten Einheiten. Ihre Termine setzt die App aus den Ferien
  des Schuljahres als feste Termine: KA 1 kurz vor den Herbstferien (Ende 1. Quartal), KA 2 2–3 Wochen nach den Weihnachtsferien,
  KA 3 kurz vor den Osterferien (Ende 3. Quartal), KA 4 2–3 Wochen nach den Pfingstferien; endet die Klasse früher (GYM 12,
  OS 10), verteilen sich die letzten bis eine Woche vor dem letzten Unterrichtstag. Gespeicherte Pläne werden einmal
  umgestellt (alte Klassenarbeiten → Platzhalter, Standardtermine, sofern kein eigener Termin gesetzt ist). In „Zeile
  hinzufügen“ stehen nur allgemeine Einträge (Leistungsnachweis, Puffer, Jahresabschluss) und noch nicht eingeplante Einheiten.
- **Leistungsnachweise** (Sequenz → Leistungsnachweise): Klassenarbeit, Klausur, Test/Leistungskontrolle, Präsentation und
  Komplexe Leistung/Projekt anlegen und hinter einer beliebigen Zeile der Sequenz einfügen. Sie bekommen eigene Stunden
  (Arbeit, wahlweise Wiederholungsstunde davor und Rückgabe danach), der Plan rückt nach. Kürzel KA, KL, LK, PR, PJ mit
  fortlaufender Nummer; Titel und Stundenthemen in der Einheit bearbeitbar, dort auch löschen. Kurzkontrollen, mündliche
  Kontrollen, Hausaufgabenkontrollen und sonstige Bewertungen hängen an einer Stunde einer Einheit („+ Kontrolle“) und kosten
  keine Unterrichtszeit; sie erscheinen in der Einheit und auf der Heute-Seite. Die Übersicht listet alle Termine der gewählten
  (Parallel-)Klasse. Gespeichert in `S.cls[k].ln` und `S.cls[k].checks`; ein neues Schuljahr übernimmt sie mit der Sequenz.
  Termin ändern: in der Übersicht oder in der Einheit nur ein Datum eingeben. Die Arbeitsstunde liegt dann fest an diesem Tag
  (ohne Mathestunde: in der nächsten), Wiederholung direkt davor, Rückgabe danach; alle anderen Stunden laufen in der
  Reihenfolge der Sequenz darum herum, eine Einheit auch über den Termin hinweg. Die Zeile wandert in der Sequenz an die
  zeitlich passende Stelle. Feste Termine gelten je Parallelklasse (`groups[].pin`, Zeilen-ID → Datum); „lösen“ gibt den
  Termin frei. Kontrollen in einer Stunde wandern per Datum in die erste Stunde dieses Tages.
  Löschen: × in der Übersicht oder „Leistungsnachweis löschen“ in der Termin-Karte der Einheit (mit Rückfrage, rückgängig
  machbar). Selbst angelegte verschwinden ganz, Platzhalter der Vorlage verlassen die Sequenz; neu einfügen über
  „Zeile hinzufügen“ → Leistungsnachweis.
- **Einheiten**: Inhalte aus dem Lehrplan, Stunden mit geplanten Terminen, Atome bearbeitbar. Fallen zwei Stunden einer
  Einheit laut Stundenplan in eine Doppelstunde, stehen sie als ein Block („Stunde 2–3 · Doppelstunde“) mit Termin und
  Schulstunden; eine Doppelstunde, die zwei Einheiten teilt, ist als „Doppelstunde, 1./2. Teil“ markiert. Atome lassen
  sich per Ziehen oder mit ↑/↓ zwischen den Stunden verschieben (je Klasse gespeichert, „auf die Vorlage zurücksetzen“ möglich).
- **Doppelstunden auf der Heute-Seite**: Gehören beide Hälften zur selben Einheit, erscheinen sie als ein Block mit allen
  neuen Atomen; „Als gehalten markieren“ und „Doppelstunde fällt aus“ gelten für beide Schulstunden.
- **Schwierigkeitsstufen**: Jedes Atom hat drei Aufgaben (`src/atoms.py` Stufe 1, `src/atoms_levels.py` Stufe 2 und 3).
  Die Heute-Seite und das Quiz wählen nach FSRS-Stabilität: unter 7 Tagen „Abrufen“, ab 7 Tagen „Anwenden“, ab 30 Tagen
  „Vernetzen“; nach „Nochmal“ oder bei Abrufwahrscheinlichkeit unter 75 % eine Stufe niedriger. Im Atom-Editor bearbeitbar.
- **Aufgabengeneratoren**: 335 der 966 Atome (GYM 5–10, OS 5–10) haben einen Generator aus der Anemo-Mathe-App. Für sie
  zeigen Heute-Seite und Quiz bei jeder Wiederholung eine neu erzeugte Aufgabe statt der festen Fragen, mit Skizze,
  Antwortauswahl, Lösung, Begründung und Lösungsweg. Die Stufe steuert die Schwierigkeit im Generator (Stufe 1, 2, 3 →
  Generatorstufe 0, 1, 3). Eine Aufgabe bleibt für Klasse, Atom, Stufe und Tag stehen; „Neue Aufgabe“ (im Quiz Taste N)
  erzeugt eine andere. Im Atom-Editor lässt sich der Generator wechseln oder mit „Keiner: feste Fragen“ abschalten.
  Die festen Fragen bleiben als Prüffrage in der Stunde und als Rückfall, falls `generators.js` fehlt.
- **Lernübersicht** (früher „Learning Engine“): FSRS (v4.5-Standardparameter), Bewertung Nochmal/Schwer/Gut/Leicht nach Anteil richtiger Antworten,
  Quiz-Ansicht zum Projizieren (öffnet im Vollbild, am Ende oder beim Schließen zurück in den vorherigen Modus; Leertaste zeigt die Lösung, 1–4 bewertet), Altbestand für Atome vor dem Startdatum.
- **Einrichtungsassistent**: öffnet sich, solange im Schuljahr keine Klassen festgelegt sind (oder über Einstellungen → Schuljahre).
  Fragt in wenigen Schritten Schulart, Klassen (mit HS/RS bzw. GK/LK und Parallelklassen) und die Unterrichtsstunden je Wochentag ab.
  Zwei direkt aufeinanderfolgende Stunden am selben Tag in derselben Spur gelten als Doppelstunde (bei drei Stunden die ersten beiden).
- **Einstellungen**:
  - Schuljahre anlegen und wechseln; ein neues Jahr bekommt die Ferien Sachsen und übernimmt auf Wunsch Sequenz, Atome und Stundenplan.
  - „Ferien Sachsen importieren“ ersetzt Beginn, Ende, Ferien und freie Tage des angezeigten Jahres
    (eingebaut 2025/26–2029/30, spätere Jahre live von openholidaysapi.org).
  - HA-Tage: In jedem Schuljahr sind die zwei Schultage nach dem Buß- und Bettag unterrichtsfrei („HA-Tag“, freie Einzeltage).
    Neue und importierte Jahre bekommen sie automatisch, gespeicherte Jahre einmalig; ein gelöschter HA-Tag kommt nicht wieder.
  - Stundenplan je Klasse in Zeiträumen („gültig ab“): je Eintrag Tag, „ab Stunde“ (Lage im Stundenplan), Dauer
    (Einzel- oder Doppelstunde, zählt als 2 Stunden) und Spur; dazu Zeiträume ohne Unterricht (Praktikum, Klassenfahrt).
  - Sicherung als Text oder Datei; Fachschaftsvorlage: Stand je Klasse und Export der eigenen Planung als Vorlage (siehe „Vorlage und persönliche Daten“).

Gespeichert wird in der Datenbank des Artefakts: `planner/settings` (Schuljahre mit „Meine Klassen“ in `years[].classes`, Einstellungen der Wiederholung) und je Schuljahr
`jahr-<id>/kl6`, `jahr-<id>/kl8`, `jahr-<id>/engine-kl6`, `jahr-<id>/engine-kl8`. Das aus der Zeit vor den Schuljahren übernommene
Jahr 2026/27 nutzt weiter `planner/kl6`, `planner/kl8`, `engine/kl6`, `engine/kl8`; alte Stundenpläne werden beim Laden in Zeiträume umgewandelt.

Auf GitHub Pages gibt es die Datenbank des Artefakts nicht. Dort speichert die App im Browser (`localStorage`, gleiche Pfade
mit Präfix `mp-doc:`). Diese Daten gelten nur für diesen Browser; zum Übertragen dient Einstellungen → Sicherung.

## Vorlage und persönliche Daten

Die App trennt drei Ebenen:

| Ebene | Inhalt | Wo |
|---|---|---|
| Lehrplan | Einheiten, Atome, Standard-Sequenzen | `dist/data.js` (erzeugt) |
| Fachschaftsvorlage | gemeinsam beschlossene Sequenz, Stunden, Puffer, Modus, Atome und Leistungsnachweise je Klasse | `src/vorlage/*.json` → `dist/vorlage.js` |
| Persönlich | Stundenplan, Häkchen, Ausfälle, Termine der Leistungsnachweise, Mehrbedarf je Parallelklasse, Lernstand, eigene Änderungen an Sequenz und Atomen | Artefakt-Datenbank bzw. Browser |

Die Fachschaftsvorlage ersetzt für die enthaltenen Klassen Sequenz, Modus und Atome einzelner Einheiten aus `data.js`;
für alle anderen Klassen gilt der Lehrplan. Jedes gespeicherte Klassendokument merkt sich in `tpl` den Vorlagenstand,
auf dem es beruht (`seq` als `[Kürzel, Strang, Stunden]`, `mode`, für Einheiten mit eigenen Atomen deren Prüfsumme in `atoms`).
Ändert sich die Vorlage:

- **Sequenz nicht selbst geändert** („folgt der Vorlage“): Die neue Vorlage wird beim Öffnen still übernommen (Hinweis unten).
  Leistungsnachweise (Lernbereich „test“: Platzhalter und eigene Arbeiten) zählen dabei nicht als Änderung; eigene bleiben
  hinter derselben Einheit stehen, selbst entfernte Platzhalter kommen nicht wieder. Zeilen behalten ihre IDs, damit feste
  Termine und der Mehrbedarf der Parallelklassen erhalten bleiben.
- **Sequenz selbst geändert** („eigene Fassung“): Die Sequenz zeigt einen Hinweis mit den Unterschieden und „Vorlage
  übernehmen“ (rückgängig machbar) oder „Meine Fassung behalten“.
- **Eigene Atome einer Einheit**, deren Atome die Fachschaft geändert hat: Hinweis in der Einheit mit „Atome der Vorlage
  übernehmen“ oder „Meine Atome behalten“. Der Lernstand hängt an der Atom-ID und bleibt bei gleicher ID erhalten.
- Eigene Leistungsnachweise, deren Kürzel die Vorlage neu verwendet, bekommen ein freies Kürzel (z. B. PR1 → PR2).

Daten aus der Zeit vor der Fachschaftsvorlage gelten als auf dem Lehrplan beruhend.

**Fachschaftsvorlage pflegen:** In der App unter Einstellungen → Fachschaftsvorlage „… als Vorlage speichern“ (oder
„Alle meine Klassen“). Die Datei enthält nur Sequenz, Modus, Atome und Leistungsnachweise, keine persönlichen Daten.
Sie kommt nach `src/vorlage/` (eine Datei je Klasse, alte ersetzen). `node src/build_vorlage.js` prüft sie gegen den
Lehrplan (Klasse, Kürzel, Aufbau der Atome) und schreibt `dist/vorlage.js`; bei Fehlern bleibt die alte Datei stehen.
Der Pages-Workflow führt das Skript bei jedem Push auf `main` aus, der `src/vorlage/` ändert. Eine Datei per „Upload files“
auf GitHub hochzuladen genügt also. Für das Claude-Artefakt muss `vorlage.js` mit veröffentlicht werden.

**Sicherung:** Wird nur im Browser gespeichert, erinnert der Hinweis oben 30 Tage nach der ersten Nutzung bzw. der letzten
Sicherung daran, eine Sicherung zu speichern. „Als Datei speichern“ gibt es jetzt auch auf GitHub Pages.

## GitHub Pages einrichten

Einmalig im Repository unter Settings → Pages bei „Build and deployment“ als Quelle **GitHub Actions** wählen.
Danach veröffentlicht der Workflow `GitHub Pages` den Ordner `dist/` bei jedem Push auf `main`, der `dist/` ändert,
oder von Hand unter Actions → GitHub Pages → Run workflow.

## Lehrpläne Sachsen (alle Klassen)

Aus der [Lehrplandatenbank Sachsen](https://www.schulportal.sachsen.de/lplandb/) sind die Mathematik-Lehrpläne importiert:

- **Gymnasium** Klasse 5–10 sowie 11/12 als Grundkurs (GK) und Leistungskurs (LK). Der Lehrplan gilt für 11/12 gemeinsam;
  die App ordnet LB 1–4 der Klasse 11 und die übrigen der Klasse 12 zu (Vorschlag, in der Sequenz änderbar).
  Klasse 6 und 8 behalten die ausgearbeitete Stoffverteilung mit Atomen.
- **Oberschule** Klasse 5 und 6, ab Klasse 7 getrennt nach Hauptschulbildungsgang (HS, Kl. 7–9) und
  Realschulbildungsgang (RS, Kl. 7–10). In der Leiste erscheint dafür ein Umschalter „HS | RS“ bzw. „GK | LK“.

Je Lernbereich entsteht pro Lernziel eine Einheit mit den Inhalten, Bemerkungen, Bezügen (→) und übergreifenden Zielen (⇒)
des Lehrplans; die Zeitrichtwerte werden nach Umfang auf die Einheiten verteilt, die Inhalte werden zu Stundenthemen.
Die Zeitrichtwerte decken nur 25 Unterrichtswochen ab. Wie in den ausgearbeiteten Plänen GYM 6/8 füllt die Vorlage daher
das ganze Schuljahr (Standard-Stundenplan, Schuljahr 2026/27):
- **Klassenarbeiten**: vier im Jahr (Kl. 11/12: zwei Klausuren), je 3 Std. (Wiederholung, Arbeit, Rückgabe), möglichst am Ende
  eines Lernbereichs und gleichmäßig über den Stoff verteilt.
- **Wahlbereich**: der erste Wahlbereich der Klassenstufe (2 Wochen) am Jahresende; die anderen liegen als Einheiten bereit.
- **Jahresabschluss** (2 Std.) außer in Abschlussklassen.
- **Übungsstunden**: die restliche Zeit gut zu einem Drittel als Puffer am Ende der Lernbereiche, sonst anteilig als zusätzliche
  Übungsstunden in den Einheiten (die Einführungsstunden der Atome rücken entsprechend nach hinten).
- **Abschlussklassen**: GYM 12 plant bis vor die Osterferien (Abitur), OS 10 bis vor die Pfingstferien (Prüfungen).
  Der letzte Unterrichtstag ist je Klasse unter Einstellungen → Stundenplan änderbar (leer = Schuljahresende).
Eine unveränderte Sequenz aus der ersten Lehrplan-Vorlage wird beim Laden automatisch durch die neue ersetzt.
Der Standard-Stundenplan ergibt sich aus den Zeitrichtwerten (meist 4, OS 6 und LK 5 Wochenstunden) und ist anzupassen.
Für jede Lehrplan-Einheit gibt es Atome mit Wiederholungsaufgaben auf drei Stufen (`src/atoms_lehrplan/<id>.json`,
2–4 Atome je Einheit nach Umfang; Wahlbereiche ohne Atome). Sie sind ein Vorschlag und im Atom-Editor anpassbar.

Aktualisieren:

```bash
NODE_PATH=$(npm root -g) node src/fetch_lehrplan.js /tmp/lp     # Netzwerkzugriff auf www.schulportal.sachsen.de
python3 -I src/parse_lehrplan.py /tmp/lp                         # -> src/lehrplan.json
python3 -I src/build_data.py                                      # -> dist/data.js
```

## Weitere Klassen und Schularten hinterlegen

Die App kennt alle Klassen aus `dist/data.js` (`classes`, mit `type`, `grade` und ggf. `variant` HS/RS/GK/LK) und die
Schularten aus `schoolTypes` (Gymnasium 5–12, Oberschule 5–10). Eine ausgearbeitete Klasse (wie GYM 6/8) braucht:

1. Einheiten und Standard-Sequenz in `src/plan.json` unter einer neuen ID, z. B. `gym7` oder `os5`
   (Felder wie bei `kl6`: `units`, `seq`, `mode`, `lbnames`, `zrw`).
2. Atome in `src/atoms.py` unter derselben ID.
3. Einträge in `src/build_data.py`: `META[id]` mit `type` (`gym`/`os`), `grade`, `label`, Strangnamen; `TT[id]` mit dem Stundenplan.

Gespeichert wird je Schuljahr unter `jahr-<jahr>/<id>` (Sequenz, Atome und die Parallelklassen in `groups`) und
`jahr-<jahr>/engine-<id>` bzw. `engine-<id>-b` für die zweite Parallelklasse. Nur `kl6` und `kl8` behalten im Jahr 2026/27
ihre alten Pfade; diese beiden IDs daher nicht umbenennen.
