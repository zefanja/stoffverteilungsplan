# Matheplaner

Webapp für die Unterrichtsplanung Mathematik am Gymnasium in Sachsen (Klasse 6 und 8):
Stoffverteilung über das Schuljahr, eine „Heute“-Ansicht mit dem aktuellen Thema und eine
Learning Engine, die mit FSRS plant, welche Atome heute wiederholt werden.

Veröffentlicht als Claude-Artefakt: https://claude.ai/artifact/QTM6gwAywgmNziMxYMs9zB
und über GitHub Pages: https://zefanja.github.io/stoffverteilungsplan/

## Aufbau

| Pfad | Inhalt |
|---|---|
| `dist/index.html` | Seite mit Layout und Styles |
| `dist/app.js` | App-Logik: Planberechnung, FSRS, Ansichten, Speicherung |
| `dist/data.js` | Erzeugt: Einheiten, Atome, Standard-Sequenzen, Kalender, Stundenpläne |
| `src/extract.py` | Liest Einheiten und Sequenzen aus den Excel-Stoffverteilungsplänen in `in/` |
| `src/atoms.py` | Atome je Einheit: Stunde, Atom, Prüffrage, Lösung |
| `src/build_data.py` | Baut `dist/data.js` und gleicht die Puffer an die Stundenpläne an |
| `src/fetch_ferien.py` | Lädt Schulferien und Feiertage Sachsen von openholidaysapi.org nach `src/ferien_sn.json` |
| `src/test.js` | Headless-Test mit Playwright (Ansichten, Aktionen, FSRS) |
| `.github/workflows/pages.yml` | Veröffentlicht `dist/` bei jedem Push auf `main` über GitHub Pages |
| `in/` | Excel-Stoffverteilungspläne Klasse 6 und 8 als Datenquelle |

## Daten neu erzeugen

```bash
python3 -I src/fetch_ferien.py  # optional: Ferien Sachsen aktualisieren
python3 -I src/extract.py       # in/*.xlsx -> src/plan.json
python3 -I src/build_data.py    # plan.json + atoms.py -> dist/data.js
NODE_PATH=$(npm root -g) node src/test.js   # Screenshots nach docs/screenshots
```

## Funktionen

- **Schulart (GYM/OS), Klassenstufe und Schuljahr** werden oben in der Leiste gewählt. Stufen ohne hinterlegten Lehrplan sind
  ausgegraut; Jahresplan, Sequenz, Einheiten, Learning Engine,
  Stundenplan und Heute-Ansicht folgen dieser Auswahl („Alle meine Klassen“ zeigt auf der Heute-Seite alle Klassen mit Stunden im Stundenplan).
- **Parallelklassen** (höchstens 2 je Stufe, z. B. 8a/8b; Einstellungen → Parallelklassen): Sequenz, Modus und Atome
  werden einmal für alle geplant. Jede Parallelklasse hat eigenen Stundenplan, Zeiträume ohne Unterricht, Ausfälle,
  Häkchen und Lernstand. „Einheit braucht 1 Std. mehr“ und automatische Pufferkürzung werden als Abweichung nur dieser
  Klasse gespeichert und in der Sequenz neben den Stunden angezeigt (z. B. „8b: +1“). Gewechselt wird oben in der Leiste.
- **Heute**: heutige Stunden je Klasse aus Kalender × Stundenplan × Sequenz, neue Atome der Stunde,
  Knöpfe „gehalten“, „Einheit braucht 1 Std. mehr“, „fällt aus“ (kürzt automatisch den nächsten Puffer).
- **Jahresplan**: Wochenübersicht je Strang, SOL-Formatvorschläge für Klasse 8.
- **Sequenz**: Reihenfolge, Stunden, Strang, Puffer; Modus „in Strängen“ oder „nacheinander“; Reserve je Strang.
- **Einheiten**: Inhalte aus dem Lehrplan, Stunden mit geplanten Terminen, Atome bearbeitbar.
- **Learning Engine**: FSRS (v4.5-Standardparameter), Bewertung Nochmal/Schwer/Gut/Leicht nach Anteil richtiger Antworten,
  Quiz-Ansicht zum Projizieren, Altbestand für Atome vor dem Startdatum.
- **Einstellungen**:
  - Schuljahre anlegen und wechseln; ein neues Jahr bekommt die Ferien Sachsen und übernimmt auf Wunsch Sequenz, Atome und Stundenplan.
  - „Ferien Sachsen importieren“ ersetzt Beginn, Ende, Ferien und freie Tage des angezeigten Jahres
    (eingebaut 2025/26–2029/30, spätere Jahre live von openholidaysapi.org).
  - Stundenplan je Klasse in Zeiträumen („gültig ab“); dazu Zeiträume ohne Unterricht (Praktikum, Klassenfahrt).
  - Sicherung als Text oder Datei.

Gespeichert wird in der Datenbank des Artefakts: `planner/settings` (Schuljahre, Engine-Einstellungen) und je Schuljahr
`jahr-<id>/kl6`, `jahr-<id>/kl8`, `jahr-<id>/engine-kl6`, `jahr-<id>/engine-kl8`. Das aus der Zeit vor den Schuljahren übernommene
Jahr 2026/27 nutzt weiter `planner/kl6`, `planner/kl8`, `engine/kl6`, `engine/kl8`; alte Stundenpläne werden beim Laden in Zeiträume umgewandelt.

Auf GitHub Pages gibt es die Datenbank des Artefakts nicht. Dort speichert die App im Browser (`localStorage`, gleiche Pfade
mit Präfix `mp-doc:`). Diese Daten gelten nur für diesen Browser; zum Übertragen dient Einstellungen → Sicherung.

## GitHub Pages einrichten

Einmalig im Repository unter Settings → Pages bei „Build and deployment“ als Quelle **GitHub Actions** wählen.
Danach veröffentlicht der Workflow `GitHub Pages` den Ordner `dist/` bei jedem Push auf `main`, der `dist/` ändert,
oder von Hand unter Actions → GitHub Pages → Run workflow.

## Weitere Klassen und Schularten hinterlegen

Die App kennt alle Klassen aus `dist/data.js` (`classes`) und die Schularten aus `schoolTypes`
(Gymnasium 5–12, Oberschule 5–10). Eine neue Klasse braucht:

1. Einheiten und Standard-Sequenz in `src/plan.json` unter einer neuen ID, z. B. `gym7` oder `os5`
   (Felder wie bei `kl6`: `units`, `seq`, `mode`, `lbnames`, `zrw`).
2. Atome in `src/atoms.py` unter derselben ID.
3. Einträge in `src/build_data.py`: `META[id]` mit `type` (`gym`/`os`), `grade`, `label`, Strangnamen; `TT[id]` mit dem Stundenplan.

Gespeichert wird je Schuljahr unter `jahr-<jahr>/<id>` (Sequenz, Atome und die Parallelklassen in `groups`) und
`jahr-<jahr>/engine-<id>` bzw. `engine-<id>-b` für die zweite Parallelklasse. Nur `kl6` und `kl8` behalten im Jahr 2026/27
ihre alten Pfade; diese beiden IDs daher nicht umbenennen.
