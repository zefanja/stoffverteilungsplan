# Matheplaner

Webapp für die Unterrichtsplanung Mathematik in Sachsen, für das Gymnasium (Klasse 5–12, in 11/12 Grund- und
Leistungskurs) und die Oberschule (Klasse 5–10, ab Klasse 7 Haupt- und Realschulbildungsgang). Die App verteilt den
Stoff über das Schuljahr, zeigt auf der Seite „Heute“ die Stunden des Tages und plant mit FSRS, welche Atome
(kleinste Lerneinheiten) heute wiederholt werden.

- GitHub Pages: https://zefanja.github.io/stoffverteilungsplan/
- Claude-Artefakt: https://claude.ai/artifact/QTM6gwAywgmNziMxYMs9zB

Die App ist eine statische Seite ohne Build-Schritt: `dist/index.html` lädt `data.js`, `vorlage.js`, `generators.js`
und `app.js`. Die drei ersten Dateien werden aus `src/` erzeugt, `app.js` und `index.html` werden direkt bearbeitet.

## Funktionen

### Klassen und Schuljahre

- **Schulart, Klassenstufe und Schuljahr** wählt man oben in der Leiste. Bei HS/RS bzw. GK/LK erscheint ein Umschalter.
  Jahresplan, Sequenz, Einheiten, Lernübersicht und Heute folgen dieser Auswahl; „Alle meine Klassen“ zeigt auf der
  Heute-Seite alle eigenen Klassen.
- **Meine Klassen** (Einstellungen, je Schuljahr): welche Klassen man unterrichtet, mit einer oder zwei Parallelklassen und
  deren Namen. Nur diese sind oben wählbar. Solange nichts festgelegt ist, gelten GYM 6 und 8 (`defaultMine`).
- **Parallelklassen** (höchstens zwei je Stufe, z. B. 8a/8b): Sequenz, Modus, Atome und Leistungsnachweise gelten für beide.
  Jede Parallelklasse hat eigenen Stundenplan, Zeiträume ohne Unterricht, Ausfälle, Häkchen, feste Termine der
  Leistungsnachweise und Lernstand. „Einheit braucht 1 Std. mehr“ und automatische Pufferkürzung werden nur bei dieser Klasse
  gespeichert und in der Sequenz als Abweichung angezeigt (z. B. „8b: +1“).
- **Schuljahre** (Einstellungen): anlegen und wechseln. Ein neues Jahr bekommt die Ferien Sachsen und übernimmt auf Wunsch
  Sequenz, Atome, Leistungsnachweise und Stundenplan. „Ferien Sachsen importieren“ ersetzt Beginn, Ende, Ferien und freie
  Tage (eingebaut 2025/26–2029/30, spätere Jahre von openholidaysapi.org).
- **HA-Tage**: Die zwei Schultage nach dem Buß- und Bettag sind in jedem Schuljahr frei („HA-Tag“). Neue und importierte Jahre
  bekommen sie automatisch, gespeicherte Jahre einmalig (Merker `haDays`); ein gelöschter HA-Tag kommt nicht wieder.
- **Stundenplan** je Klasse in Zeiträumen („gültig ab“): Tag, „ab Stunde“, Dauer (Einzel- oder Doppelstunde) und Spur
  (Strang A/B, in Klasse 7–9 auch FIL). Dazu Zeiträume ohne Unterricht (Praktikum, Klassenfahrt) und der letzte
  Unterrichtstag (GYM 12 vor Ostern, OS 10 vor Pfingsten, änderbar).
- **Einrichtungsassistent**: öffnet sich, solange im Schuljahr keine Klassen festgelegt sind (oder über Einstellungen →
  Schuljahre). Keine Klasse ist vorausgewählt. Im Wochenraster werden zwei direkt aufeinanderfolgende Stunden derselben Spur
  zur Doppelstunde (bei drei Stunden die ersten beiden).

### Planung

- **Sequenz**: Reihenfolge, Stunden und Strang der Einheiten, Puffer; Modus „in Strängen“ oder „nacheinander“; Reserve je
  Strang und Stunden je Lernbereich gegen den Zeitrichtwert. „Zeile hinzufügen“ bietet Puffer, Jahresabschluss und noch
  nicht eingeplante Einheiten.
- **Planberechnung** (`schedule()` in `app.js`): Kalender × Stundenplan ergeben die Unterrichtsstunden je Strang; feste
  Termine von Leistungsnachweisen belegen zuerst ihre Stunden (strangunabhängig), alle anderen Stunden der Sequenz füllen
  die übrigen Plätze ihres Strangs der Reihe nach. Ausfälle und „Einheit braucht 1 Std. mehr“ kürzen auf Wunsch automatisch den nächsten Puffer.
- **Jahresplan**: Wochenübersicht je Strang mit Ferien, Stundenplanwechseln und FIL-Stunden (mit Formatvorschlag: vor und in
  der Woche einer Klassenarbeit Format 4, danach Format 5, sonst 1–3 im Wechsel).
- **Einheiten**: Inhalte aus dem Lehrplan, Stunden mit Terminen, Atome. Zwei Stunden einer Einheit in einer Doppelstunde
  stehen als ein Block („Stunde 2–3 · Doppelstunde“); eine Doppelstunde, die zwei Einheiten teilt, ist als 1./2. Teil
  markiert. Atome lassen sich per Ziehen oder mit ↑/↓ zwischen den Stunden verschieben. Leistungsnachweise stehen nicht in
  der Einheitenübersicht; ihre Seite erreicht man über die Liste der Leistungsnachweise.
- **Heute**: die Stunden des Tages je Klasse mit Thema und neuen Atomen, „Als gehalten markieren“, „Einheit braucht 1 Std.
  mehr“, „Fällt aus“. Eine Doppelstunde derselben Einheit ist ein Block; „gehalten“ und „fällt aus“ gelten dann für beide
  Schulstunden. Vier Kacheln: aktuelle Einheit, heute fällig, ø Abruf, Reserve.

### Leistungsnachweise

Alles unter Sequenz → Leistungsnachweise: oben das Formular „Leistungsnachweis anlegen“, darunter die Liste aller Termine
der gewählten (Parallel-)Klasse.

- **Platzhalter der Vorlage**: Jede Klasse hat vier allgemeine Platzhalter KA1–KA4 („Klassenarbeit 1–4“, in 11/12
  „Klausur 1–4“), zwei je Halbjahr. Ihre Termine setzt die App aus den Ferien als feste Termine (`kaDates()`): KA 1 kurz vor
  den Herbstferien, KA 2 2–3 Wochen nach den Weihnachtsferien, KA 3 kurz vor den Osterferien, KA 4 2–3 Wochen nach den
  Pfingstferien. Endet die Klasse früher (GYM 12, OS 10), verteilen sich die letzten bis eine Woche vor dem letzten
  Unterrichtstag. In GYM 6 (zwei Stränge) wechseln sie zwischen Strang A und B.
- **Anlegen**: Art (Klassenarbeit, Klausur, Test/Leistungskontrolle, Präsentation/Referat, Komplexe Leistung/Projekt),
  Thema, Dauer, Wiederholungsstunde davor, Rückgabe danach, Termin oder ohne Termin „einfügen nach“ einer Sequenzzeile.
  Kürzel KA, KL, LK, PR, PJ mit fortlaufender Nummer.
- **Dauer**: Klassenarbeit, Klausur, Präsentation und Projekt 45 oder 90 min, Test 20, 30 oder 45 min. 45 min sind eine
  eigene Unterrichtsstunde, 90 min zwei (die Termin-Karte warnt, wenn am Termin keine Doppelstunde liegt). Ein Test mit
  20/30 min läuft in einer Stunde mit wie eine Kurzkontrolle und kostet keine eigene Stunde.
- **Rückgabe** liegt nie in derselben (Doppel-)Stunde wie die Arbeit, sondern frühestens in der nächsten Stunde desselben
  Strangs an einem späteren Tag; die freie Hälfte der Doppelstunde bekommt der nachfolgende Stoff.
- **Termin ändern**: Datum eingeben genügt (Liste oder Termin-Karte der Einheit). Die Arbeitsstunde liegt dann fest an diesem
  Tag (ohne Mathestunde: in der nächsten), Wiederholung davor, Rückgabe danach; der übrige Plan läuft darum herum, eine
  Einheit auch über den Termin hinweg. Feste Termine gelten je Parallelklasse; „lösen“ gibt den Termin frei.
- **Kein Strang**: Ein Leistungsnachweis mit Termin gehört zu keinem Strang. Er belegt am Termin die erste Mathestunde des
  Tages, egal ob aus Strang A oder B (nie FIL); die Einheiten dieses Strangs laufen darum herum. Seine Inhalte legt die
  Lehrkraft fest, sie können aus beiden Strängen stammen. In der Sequenz steht statt der Strangauswahl „–“. Nur ein
  Leistungsnachweis ohne Termin läuft im Strang der Zeile, hinter der er eingefügt wurde.
- **Kontrollen in einer Stunde** („+ Kontrolle“ bei einer Stunde der Einheit): Kurzkontrolle, Test, mündliche Kontrolle,
  Hausaufgabenkontrolle, sonstige Bewertung, 20 oder 30 min. Die Stunde zeigt die verbleibende Unterrichtszeit; ab 45 min
  Kontrollen in einer Einheit schlägt die App vor, die Einheit zu verlängern. Per Datum wandern sie in die erste Stunde
  dieses Tages.
- **Bearbeiten und Löschen**: Titel und Stundenthemen eigener Leistungsnachweise in ihrer Einheit; Löschen über × in der
  Liste oder in der Termin-Karte (mit Rückfrage, rückgängig machbar). Eigene verschwinden ganz, Platzhalter verlassen nur
  die Sequenz.

### Wiederholung

- **Lernübersicht**: FSRS (v4.5-Standardparameter), Bewertung Nochmal/Schwer/Gut/Leicht nach dem Anteil richtiger Antworten,
  Altbestand für Atome vor dem Startdatum. Die Heute-Seite zeigt die fälligen Wiederholungen der Klasse.
- **Schwierigkeitsstufen**: nach FSRS-Stabilität unter 7 Tagen „Abrufen“, ab 7 „Anwenden“, ab 30 „Vernetzen“; nach
  „Nochmal“ oder bei Abruf unter 75 % eine Stufe niedriger. Jedes Atom hat drei feste Aufgaben (im Atom-Editor bearbeitbar).
- **Aufgabengeneratoren**: 335 der 966 Atome haben einen Generator aus der Anemo-Mathe-App. Für sie erscheint bei jeder
  Wiederholung eine neue Aufgabe mit Skizze, Antwortauswahl, Lösung, Begründung und Lösungsweg; die Stufe steuert die
  Schwierigkeit (Stufe 1/2/3 → Generatorstufe 0/1/3). Eine Aufgabe bleibt für Klasse, Atom, Stufe und Tag stehen, „Neue
  Aufgabe“ (im Quiz Taste N) erzeugt eine andere. Im Atom-Editor lässt sich der Generator wechseln oder abschalten.
- **Quiz** zum Projizieren: öffnet im Vollbild, Leertaste zeigt die Lösung, 1–4 bewertet, N erzeugt eine neue Aufgabe.

### Darstellung

- **Formelsatz**: Ausdrücke in Atomen, Aufgaben, Stundentiteln und Lehrplantexten werden erkannt (Brüche, Hochzahlen,
  Periode, Punkte, Mengen, Einheiten) und mit MathJax 3 (SVG, vom CDN) gesetzt; erzeugte Aufgaben bringen LaTeX in `\( … \)`
  mit. Ohne MathJax bleibt der Text stehen.
- **Design**: Farben aus dem Schullogo FELS (Blau #0094cd, Orange #f59b0a, Grün #afca0b, Rot #d91016; für Text abgedunkelt),
  hell und dunkel. Seitenleiste mit Navigation, auf dem Handy als Kopfzeile. Ein Seitenwechsel beginnt oben.

## Speicherung

Im Claude-Artefakt speichert die App in der Datenbank des Artefakts, auf GitHub Pages im Browser (`localStorage`, gleiche
Pfade mit Präfix `mp-doc:`, nur in diesem Browser; zum Übertragen Einstellungen → Sicherung).

| Pfad | Inhalt |
|---|---|
| `planner/settings` | Schuljahre (`years[]` mit Kalender, Ferien, freien Tagen, „Meine Klassen“ in `classes`), Einstellungen der Wiederholung |
| `jahr-<jahr>/<klasse>` | Klassendokument: `seq`, `mode`, `atoms` (eigene Atome je Einheit), `ln` (eigene Leistungsnachweise), `lnDur` (Dauer je Leistungsnachweis), `checks` (Kontrollen in einer Stunde), `groups[]` (Parallelklassen: `tt`, `off`, `cancelled`, `done`, `adj`, `pin`), `tpl` (Vorlagenstand) |
| `jahr-<jahr>/engine-<klasse>` (`-b` für die zweite Parallelklasse) | Lernstand: FSRS-Karten und Bewertungsprotokoll |

Das aus der Zeit vor den Schuljahren übernommene Jahr 2026/27 nutzt für GYM 6 und 8 weiter `planner/kl6`, `planner/kl8`,
`engine/kl6`, `engine/kl8`. Ältere Daten werden beim Laden einmalig umgestellt (Stundenpläne in Zeiträume, alte
Klassenarbeiten in die Platzhalter KA1–KA4, Merker `kaV`).

## Vorlage und persönliche Daten

Die App trennt drei Ebenen:

| Ebene | Inhalt | Wo |
|---|---|---|
| Lehrplan | Einheiten, Atome, Standard-Sequenzen | `dist/data.js` (erzeugt) |
| Fachschaftsvorlage | gemeinsam beschlossene Sequenz, Stunden, Puffer, Modus, Atome und Leistungsnachweise je Klasse | `src/vorlage/*.json` → `dist/vorlage.js` |
| Persönlich | Stundenplan, Häkchen, Ausfälle, Termine und Dauer der Leistungsnachweise, Mehrbedarf je Parallelklasse, Lernstand, eigene Änderungen an Sequenz und Atomen | Artefakt-Datenbank bzw. Browser |

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
Der Pages-Workflow führt das Skript bei jedem Push auf `main` aus. Eine Datei per „Upload files“ auf GitHub hochzuladen
genügt also. Für das Claude-Artefakt muss `vorlage.js` mit veröffentlicht werden.

**Sicherung:** Wird nur im Browser gespeichert, erinnert der Hinweis oben 30 Tage nach der ersten Nutzung bzw. der letzten
Sicherung daran, eine Sicherung zu speichern („Sicherung kopieren“ oder „Als Datei speichern“).

## Entwicklung

### Aufbau

| Pfad | Inhalt |
|---|---|
| `dist/index.html` | Seite mit Layout und Styles (Farbtokens, hell/dunkel) |
| `dist/app.js` | App-Logik: Planberechnung, FSRS, Ansichten, Leistungsnachweise, Speicherung, Migrationen |
| `dist/data.js` | Erzeugt: Klassen mit Einheiten, Atomen, Standard-Sequenzen, Stundenplänen; Kalender, Ferien Sachsen |
| `dist/vorlage.js` | Erzeugt: Fachschaftsvorlage aus `src/vorlage/*.json` (leer = es gilt der Lehrplan) |
| `dist/generators.js` | Erzeugt: Aufgabengeneratoren (`window.ANEMO`) |
| `dist/logo.svg`, `dist/logo-mark.svg` | Schullogo FELS (voll für die Seitenleiste, Felszeichen für Kopf und Handy) |
| `src/plan.json`, `src/extract.py` | Einheiten und Sequenzen GYM 6/8 aus den Excel-Plänen in `in/` |
| `src/atoms.py`, `src/atoms_levels.py` | Atome GYM 6/8: Stunde, Atom, Prüffrage, Lösung; Stufe 2 und 3 |
| `src/atoms_lehrplan/<id>.json` | Atome der übrigen Klassen je Einheit: `[Stunde, Atom, Frage, Lösung, Frage 2, Lösung 2, Frage 3, Lösung 3]` |
| `src/lehrplan.json`, `src/fetch_lehrplan.js`, `src/parse_lehrplan.py` | Lehrpläne Sachsen (Lehrplandatenbank) und ihr Import |
| `src/from_lehrplan.py` | Klassen aus dem Lehrplan: Einheiten je Lernziel, Stundenthemen, Sequenz mit KA-Platzhaltern, Standard-Stundenplan |
| `src/build_data.py` | Baut `dist/data.js`, gleicht Puffer je Strang an die Stundenpläne an (Klassenarbeiten an ihren Standardterminen mitgerechnet), setzt die KA-Platzhalter in GYM 6/8 und die Generatoren |
| `src/ferien_sn.json`, `src/fetch_ferien.py` | Schulferien und Feiertage Sachsen (openholidaysapi.org) |
| `src/anemo/generators.ts`, `src/anemo/labels.json` | 194 Aufgabengeneratoren, unverändert aus [zefanja/anemo](https://github.com/zefanja/anemo) (`src/lib/server/tasks/generators.ts`), und ihre Titel |
| `src/generator_map.json` | Generator je Atom (Klasse → Atom-ID → Generator-ID oder Liste) |
| `src/build_generators.js` | Baut `dist/generators.js` (Node ≥ 22.13 entfernt die TypeScript-Typen) und prüft jeden Generator |
| `src/vorlage/`, `src/build_vorlage.js` | Fachschaftsvorlagen und ihr Build |
| `src/test.js` | Headless-Test mit Playwright (rund 115 Prüfungen), Screenshots nach `docs/screenshots` |
| `.github/workflows/pages.yml` | Baut die Vorlage, prüft die Syntax, hängt `?v=<commit>` an die Skripte und veröffentlicht `dist/` |
| `in/` | Excel-Stoffverteilungspläne GYM 6 und 8 |

### Daten neu erzeugen und testen

```bash
python3 -I src/fetch_ferien.py   # optional: Ferien Sachsen aktualisieren
python3 -I src/extract.py        # in/*.xlsx -> src/plan.json
python3 -I src/build_data.py     # plan.json, atoms*, lehrplan.json, generator_map.json -> dist/data.js
node src/build_generators.js     # src/anemo/ -> dist/generators.js
node src/build_vorlage.js        # src/vorlage/*.json -> dist/vorlage.js
NODE_PATH=$(npm root -g) node src/test.js
```

Der Test startet einen lokalen Webserver und braucht Playwright mit Chromium. Ohne Internet MathJax lokal bereitstellen
(z. B. `npm pack mathjax@3.2.2`) und `MATHJAX_JS=/pfad/package/es5/tex-svg.js` voranstellen; sonst meldet der Test
Konsolenfehler, weil das CDN nicht erreichbar ist.

### Veröffentlichen

Einmalig im Repository unter Settings → Pages als Quelle **GitHub Actions** wählen. Danach veröffentlicht der Workflow
`GitHub Pages` bei jedem Push auf `main`, der `dist/` oder `src/vorlage/` ändert, oder von Hand unter Actions → Run
workflow. Die eigenen Skripte bekommen dabei `?v=<commit>`, damit Browser nach einem Update nicht die alten Dateien aus
dem Cache laden. Für das Claude-Artefakt müssen `data.js`, `vorlage.js`, `generators.js` und `app.js` mit veröffentlicht werden.

## Lehrpläne Sachsen

Aus der [Lehrplandatenbank Sachsen](https://www.schulportal.sachsen.de/lplandb/) sind die Mathematik-Lehrpläne importiert:

- **Gymnasium** Klasse 5–10 sowie 11/12 als Grundkurs (GK) und Leistungskurs (LK). Der Lehrplan gilt für 11/12 gemeinsam;
  die App ordnet LB 1–4 der Klasse 11 und die übrigen der Klasse 12 zu (Vorschlag, in der Sequenz änderbar).
  GYM 6 und 8 behalten die ausgearbeitete Stoffverteilung aus den Excel-Plänen.
- **Oberschule** Klasse 5 und 6, ab Klasse 7 getrennt nach Hauptschulbildungsgang (HS, Kl. 7–9) und
  Realschulbildungsgang (RS, Kl. 7–10).

Je Lernbereich entsteht pro Lernziel eine Einheit mit Inhalten, Bemerkungen, Bezügen (→) und übergreifenden Zielen (⇒);
die Zeitrichtwerte werden nach Umfang auf die Einheiten verteilt, die Inhalte werden zu Stundenthemen. Die Zeitrichtwerte
decken nur 25 Unterrichtswochen ab; die Vorlage füllt daher das ganze Schuljahr (Standard-Stundenplan, Schuljahr 2026/27):

- **Klassenarbeiten**: vier Platzhalter KA1–KA4 (11/12: Klausuren) mit je 3 Std. (Wiederholung, Arbeit, Rückgabe), in der
  Sequenz gleichmäßig über den Stoff verteilt; ihre Termine setzt die App aus den Ferien (siehe Leistungsnachweise).
- **Wahlbereich**: der erste Wahlbereich der Klassenstufe (2 Wochen) am Jahresende; die anderen liegen als Einheiten bereit.
- **Jahresabschluss** (2 Std.) außer in Abschlussklassen.
- **Übungsstunden**: die restliche Zeit gut zu einem Drittel als Puffer am Ende der Lernbereiche, sonst anteilig als
  zusätzliche Übungsstunden in den Einheiten.
- **Abschlussklassen**: GYM 12 plant bis vor die Osterferien (Abitur), OS 10 bis vor die Pfingstferien (Prüfungen).

Eine unveränderte Sequenz aus der ersten Lehrplan-Vorlage wird beim Laden automatisch ersetzt. Der Standard-Stundenplan
ergibt sich aus den Zeitrichtwerten (meist 4, OS 6 und LK 5 Wochenstunden) und ist anzupassen. Für jede Lehrplan-Einheit
gibt es 2–4 Atome mit Aufgaben auf drei Stufen (Wahlbereiche ohne Atome).

Aktualisieren:

```bash
NODE_PATH=$(npm root -g) node src/fetch_lehrplan.js /tmp/lp     # Netzwerkzugriff auf www.schulportal.sachsen.de
python3 -I src/parse_lehrplan.py /tmp/lp                         # -> src/lehrplan.json
python3 -I src/build_data.py                                      # -> dist/data.js
```

## Weitere ausgearbeitete Klassen

Die App kennt alle Klassen aus `dist/data.js` (`classes`, mit `type`, `grade` und ggf. `variant` HS/RS/GK/LK) und die
Schularten aus `schoolTypes`. Eine ausgearbeitete Klasse wie GYM 6/8 braucht:

1. Einheiten und Standard-Sequenz in `src/plan.json` unter einer neuen ID (Felder wie bei `kl6`: `units`, `seq`, `mode`,
   `lbnames`, `zrw`).
2. Atome in `src/atoms.py` und `src/atoms_levels.py` unter derselben ID.
3. Einträge in `src/build_data.py`: `META[id]` mit `type`, `grade`, `label`, Strangnamen; `TT[id]` mit dem Stundenplan.
   Klassenarbeiten der Excel-Pläne (Lernbereich `test`) ersetzt der Build durch die Platzhalter KA1–KA4.

Die IDs `kl6` und `kl8` nicht umbenennen: Sie hängen an den alten Speicherpfaden des Jahres 2026/27.
