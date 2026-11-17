# Matheplaner

Webapp für die Unterrichtsplanung Mathematik am Gymnasium in Sachsen (Klasse 6 und 8):
Stoffverteilung über das Schuljahr, eine „Heute“-Ansicht mit dem aktuellen Thema und eine
Learning Engine, die mit FSRS plant, welche Atome heute wiederholt werden.

Veröffentlicht als Claude-Artefakt: https://claude.ai/artifact/QTM6gwAywgmNziMxYMs9zB

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
| `in/` | Excel-Stoffverteilungspläne Klasse 6 und 8 als Datenquelle |

## Daten neu erzeugen

```bash
python3 -I src/fetch_ferien.py  # optional: Ferien Sachsen aktualisieren
python3 -I src/extract.py       # in/*.xlsx -> src/plan.json
python3 -I src/build_data.py    # plan.json + atoms.py -> dist/data.js
NODE_PATH=$(npm root -g) node src/test.js   # Screenshots nach docs/screenshots
```

## Funktionen

- **Klasse und Schuljahr** werden oben in der Leiste gewählt; Jahresplan, Sequenz, Einheiten, Learning Engine,
  Stundenplan und Heute-Ansicht folgen dieser Auswahl („Alle Klassen“ zeigt auf der Heute-Seite beide).
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
