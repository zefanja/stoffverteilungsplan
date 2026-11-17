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
| `src/extract.py` | Liest Einheiten und Sequenzen aus den Excel-Stoffverteilungsplänen in `in/` |
| `src/atoms.py` | Atome je Einheit: Stunde, Atom, Prüffrage, Lösung |
| `src/atoms_lehrplan/<id>.json` | Atome der Lehrplan-Klassen je Einheit: `[Stunde, Atom, Frage, Lösung, Frage 2, Lösung 2, Frage 3, Lösung 3]` |
| `src/build_data.py` | Baut `dist/data.js` und gleicht die Puffer an die Stundenpläne an |
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
python3 -I src/build_data.py    # plan.json + atoms.py -> dist/data.js
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
- **Jahresplan**: Wochenübersicht je Strang, SOL-Formatvorschläge für Klasse 8.
- **Sequenz**: Reihenfolge, Stunden, Strang, Puffer; Modus „in Strängen“ oder „nacheinander“; Reserve je Strang.
- **Einheiten**: Inhalte aus dem Lehrplan, Stunden mit geplanten Terminen, Atome bearbeitbar.
- **Schwierigkeitsstufen**: Jedes Atom hat drei Aufgaben (`src/atoms.py` Stufe 1, `src/atoms_levels.py` Stufe 2 und 3).
  Die Heute-Seite und das Quiz wählen nach FSRS-Stabilität: unter 7 Tagen „Abrufen“, ab 7 Tagen „Anwenden“, ab 30 Tagen
  „Vernetzen“; nach „Nochmal“ oder bei Abrufwahrscheinlichkeit unter 75 % eine Stufe niedriger. Im Atom-Editor bearbeitbar.
- **Lernübersicht** (früher „Learning Engine“): FSRS (v4.5-Standardparameter), Bewertung Nochmal/Schwer/Gut/Leicht nach Anteil richtiger Antworten,
  Quiz-Ansicht zum Projizieren (öffnet im Vollbild, am Ende oder beim Schließen zurück in den vorherigen Modus; Leertaste zeigt die Lösung, 1–4 bewertet), Altbestand für Atome vor dem Startdatum.
- **Einrichtungsassistent**: öffnet sich, solange im Schuljahr keine Klassen festgelegt sind (oder über Einstellungen → Schuljahre).
  Fragt in wenigen Schritten Schulart, Klassen (mit HS/RS bzw. GK/LK und Parallelklassen) und die Unterrichtsstunden je Wochentag ab.
- **Einstellungen**:
  - Schuljahre anlegen und wechseln; ein neues Jahr bekommt die Ferien Sachsen und übernimmt auf Wunsch Sequenz, Atome und Stundenplan.
  - „Ferien Sachsen importieren“ ersetzt Beginn, Ende, Ferien und freie Tage des angezeigten Jahres
    (eingebaut 2025/26–2029/30, spätere Jahre live von openholidaysapi.org).
  - Stundenplan je Klasse in Zeiträumen („gültig ab“): je Eintrag Tag, „ab Stunde“ (Lage im Stundenplan), Dauer
    (Einzel- oder Doppelstunde, zählt als 2 Stunden) und Spur; dazu Zeiträume ohne Unterricht (Praktikum, Klassenfahrt).
  - Sicherung als Text oder Datei.

Gespeichert wird in der Datenbank des Artefakts: `planner/settings` (Schuljahre mit „Meine Klassen“ in `years[].classes`, Einstellungen der Wiederholung) und je Schuljahr
`jahr-<id>/kl6`, `jahr-<id>/kl8`, `jahr-<id>/engine-kl6`, `jahr-<id>/engine-kl8`. Das aus der Zeit vor den Schuljahren übernommene
Jahr 2026/27 nutzt weiter `planner/kl6`, `planner/kl8`, `engine/kl6`, `engine/kl8`; alte Stundenpläne werden beim Laden in Zeiträume umgewandelt.

Auf GitHub Pages gibt es die Datenbank des Artefakts nicht. Dort speichert die App im Browser (`localStorage`, gleiche Pfade
mit Präfix `mp-doc:`). Diese Daten gelten nur für diesen Browser; zum Übertragen dient Einstellungen → Sicherung.

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
Nach jedem Lernbereich steht eine Pufferstunde; die Lehrplan-Wochen (25 Pflichtwochen) lassen im Schuljahr Reserve für
Wahlbereich, Klassenarbeiten und Wiederholung. Wahlbereiche liegen als Einheiten bereit („Zeile hinzufügen“ in der Sequenz).
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
