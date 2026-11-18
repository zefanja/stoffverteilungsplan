# CLAUDE.md – Arbeitsnotizen für den Matheplaner

Statische Webapp (kein Build-Schritt, keine Abhängigkeiten im Browser außer MathJax vom CDN) für die Stoffverteilung
Mathematik in Sachsen. Nutzer ist eine Lehrkraft (GYM/OS), die auf Deutsch schreibt und Screenshots schickt.
Ausführliche Funktionsbeschreibung: `README.md`.

## Arbeitsablauf

- **Sprache**: UI-Texte, Code-Kommentare, README und Antworten auf Deutsch mit echten Umlauten und „deutschen“
  Anführungszeichen. Commit-Nachrichten dürfen ASCII-Umschreibungen nutzen (ae/oe/ue).
- **Branch**: vor jeder neuen Aufgabe `git fetch origin main && git checkout -B <session-branch> origin/main`. Auf `main`
  arbeiten auch andere Sessions (z. B. #17 Fachschaftsvorlage), daher nie auf einem alten Stand weiterbauen.
- **Abschluss**: committen, pushen, dann fragen, ob ein PR erstellt und gemergt werden soll. Die Lehrkraft antwortet fast
  immer „Ja, erstelle einen Pull Request und merge“: PR mit `mcp__github__create_pull_request` (owner `zefanja`, repo
  `stoffverteilungsplan`, base `main`), dann `mcp__github__merge_pull_request` mit `merge_method: "squash"` und
  `expectedHeadSha` als **vollständigem 40-stelligen SHA** (`git rev-parse HEAD`; kurze SHAs werden abgelehnt).
  Nach dem Merge den Branch beim nächsten Auftrag neu von `origin/main` anlegen (force-push ist dann in Ordnung).
- **Screenshots**: `src/test.js` schreibt alle Bilder in `docs/screenshots/` neu. Vor dem Commit
  `git checkout -- docs/screenshots` ausführen, außer ein Bild soll die Änderung bewusst zeigen.
- **Antwort an die Lehrkraft**: kurz, mit Beispiel-Daten (konkrete Termine), was sich in der App ändert, wo man es findet;
  offene Interpretationsfragen ansprechen statt still entscheiden.

## Befehle

```bash
python3 -I src/build_data.py          # dist/data.js (Lehrplan, GYM 6/8, KA-Platzhalter, Generator-Zuordnung)
node src/build_generators.js          # dist/generators.js aus src/anemo/generators.ts (ExperimentalWarning ist normal)
node src/build_vorlage.js             # dist/vorlage.js aus src/vorlage/*.json
node --check dist/app.js              # Syntax nach jeder Bearbeitung
MATHJAX_JS=<scratchpad>/mj/package/es5/tex-svg.js NODE_PATH=/opt/node22/lib/node_modules node src/test.js
```

- Das MathJax-CDN ist in der Cloud-Umgebung gesperrt: einmal `npm pack mathjax@3.2.2` im Scratchpad und entpacken.
  Ohne `MATHJAX_JS` schlägt „Keine Fehler in der Konsole“ fehl (das ist dann kein echter Fehler).
- Testergebnis auswerten: Ausgabe in eine Datei, dann `grep -c "^ok"` und `grep "^FAIL\|Error"`. Stand: rund 115 ok, 0 FAIL.
- Eigene Prüfskripte (Playwright) in den Scratchpad legen; sie brauchen einen kleinen HTTP-Server für `dist/`
  (siehe Muster in `src/test.js`) und `NODE_PATH=/opt/node22/lib/node_modules`.
- Die Sicherheitsprüfung der Shell hält lange Befehle mit verschachtelten Heredocs/Python-Strings manchmal an. Dann das
  Python-Bearbeitungsskript mit dem Write-Tool in den Scratchpad schreiben und mit `python3 <datei>` ausführen.

## Architektur `dist/app.js`

- Globale Objekte: `D = window.PLAN_DATA` (Lehrplan, aus `data.js`), `S` (Zustand: `S.settings`, `S.cls[k]`, `S.eng[g]`),
  `UI` (Ansicht: `cls`, `type`, `date`, `gid`, `ob`, `quiz`, `confirm`, `editAtom`, `chkForm` …).
- Schlüssel: Klasse `k` = `kl6`, `gym9`, `os8rs` …; Parallelklasse `g` = `kl8.a`/`kl8.b`. `ck(g)` → Klasse,
  `gkey(k, gid)`, `grp(g)` → Gruppenobjekt, `curG()` → gewählte Parallelklasse.
- Änderungen: Zustand ändern, dann `commit(k)` (speichert, `touch()` invalidiert Caches, rendert). Für Rückgängig vorher
  `const snap = snapshotFor(k)` und danach `undoStack = snap`, oder `withUndo(g, msg, fn)`. Toasts mit `toast(msg, true)`
  zeigen „Rückgängig“ (`#toast [data-act="undo"]`).
- Ereignisse zentral über `data-act`: Klicks im großen `document.addEventListener("click")`-Switch, Eingaben/Selects im
  `change`-Switch. Neue Aktionen dort ergänzen.
- `render()`/`renderNow()`: baut `main` als HTML-String neu. `render.keepScroll` hält die Position bei Aktionen; ein
  Seitenwechsel (`hashchange`) scrollt nach oben.
- Assistent: `OB_STEPS` = Schuljahr, Klassen, Planung, Unterrichtszeiten, Fertig (Schritt-Indizes 0–4; Tests klicken
  `[data-act="obstep"][data-v=…]`). Planung: `setClassMode(k, mode)`, `setLbStrand(k, lb, strand)`, `obLbs(k)`; beim
  ersten Betreten setzt `obDefaults()` jede Klasse ohne Merker `obMode` auf „nacheinander“. `obTracks(k)` richtet sich nur
  nach `S.cls[k].mode`. Die Tests stellen GYM 6 im Assistenten auf „in Strängen“, weil spätere Prüfungen zwei Stränge erwarten.
- `renderOverlay()` (Assistent, Quiz) ersetzt das Overlay per `innerHTML`. Der Assistent merkt sich dabei die
  Scrollposition von `#overlay`, `.ov-card` und `.obbody` im selben Schritt (sonst springt er auf dem Handy nach oben).
- Routen: `#heute`, `#plan`, `#sequenz`, `#einheiten`, `#lernuebersicht`, `#einstellungen`, `#u-<klasse>-<index>`
  (Index in `unitOrderOf(k)`; eigene Leistungsnachweise hängen hinten an, damit Indizes der Vorlage stabil bleiben).
- Test-Hilfen: `window.__mp` stellt interne Funktionen bereit (`schedule`, `lnDates`, `addLn`, `setLnDate`, `kaDates`,
  `applyDoc`, `touch` …). Neue Funktionen, die Tests brauchen, dort ergänzen.

### Planung (`schedule(g)`, gecacht über `ver`)

- Slots = Schultage × Stundenplan (Zeiträume `G.tt`, Doppelstunde `len: 2` = zwei Slots), ohne Ferien, freie Tage,
  `G.off`, ausgefallene (`G.cancelled`) und nach dem letzten Unterrichtstag.
- Zeilen der Sequenz (`C.seq`, je Zeile `id`, `code`, `strand`, `hours`; plus `G.adj` je Parallelklasse) werden je Strang
  verteilt. **Feste Termine** (`G.pin[zeilenId] = Datum`) belegen zuerst ihre Slots, und zwar **strangunabhängig** über alle
  Nicht-FIL-Slots (Hauptstunde `lnMain()` in der ersten Stunde ab dem Termin). Der Rest füllt die freien Slots seines
  Strangs der Reihe nach. `planned` je Strang zählt fest terminierte Stunden dort, wo sie tatsächlich liegen.
  Leistungsnachweise ohne Termin bekommen in `schedule()` den Strang der Zeile davor (`lastTrack`), ihr gespeichertes
  `strand` wird ignoriert; die Sequenz zeigt bei allen Leistungsnachweisen keine Strangauswahl.
- Die Lehrkraft will: Leistungsnachweise haben keinen Strang, Einheiten „fließen drum herum“, das Datum bestimmt den
  Termin. `build_data.py` (`ka_track_hours`) rechnet deshalb die Standardtermine der KA-Platzhalter beim Pufferausgleich
  von GYM 6 mit – Regel identisch zu `kaDates()` halten, sonst geht „Kl. 6 geht auf“ kaputt.
- **Rückgabe-Regel** (`isRueck()`): Rückgabe/Berichtigung frühestens an einem späteren Tag als die Arbeit; die freie
  Hälfte der Doppelstunde bekommt der nachfolgende Stoff.
- Kürzel `P` (Puffer) und `JA` (Jahresabschluss) kommen mehrfach vor: nie allein über `code` adressieren (Kontrollen
  merken sich dann `row`).

### Einheiten, Atome, Leistungsnachweise

- `unitOf(k, code)`: Einheit der Vorlage (`D.classes[k].units`) oder eigener Leistungsnachweis (`C.ln`); bei gesetzter
  Dauer (`C.lnDur`) die umgerechnete Fassung aus `lnWithDur()` (Arbeitsstunden = Dauer/45).
- `atomsOf(k, code)`: Atome der Vorlage bzw. eigene (`C.atoms[code]`), ergänzt um Stufenfelder und Generator `g`.
- Leistungsnachweise = Einheiten mit `lb: "test"`. Platzhalter der Vorlage haben `ka: 1…4` und `main`. Arten in
  `LN_KINDS` (Präfixe KA, KL, LK, PR, PJ – **nicht „T“**, das kollidiert mit den Terme-Einheiten T1–T5 in GYM 8),
  Dauern in `LN_DURS`, Kontrollen in `CHECK_KINDS` (`C.checks[]`: `kind`, `title`, `code`, `n`, `dur`, ggf. `row`).
- Wichtige Funktionen: `addLn`, `addShortTest` (Test 20/30 min als Kontrolle), `setLnDate`, `setLnDur`, `setCheckDate`,
  `removeLn`, `lnDates(g)` (Liste aller Termine), `kaDates(k, Y)`/`kaPins` (Standardtermine aus den Ferien).
- Generatoren: `genTask`/`shownTask`; LaTeX in `\( … \)` rendert `gx()`, normaler Text läuft durch `mx()`.
  SVG-Skizzen der Generatoren haben nur `viewBox` → Container braucht feste Breite (`.gsvg`).

### Laden und Migrationen (`applyDoc`)

- Klassendokumente werden mit `Object.assign(defaultClass(k), data)` geladen. **Migrationsmerker deshalb an `data`
  prüfen** (z. B. `if (!data.kaV) migrateKa(...)`), nicht am Ergebnis – `defaultClass()` setzt die Merker schon.
- Vorhandene Merker: Schuljahr `haDays` (HA-Tage), Klasse `kaV` (KA-Platzhalter), `tpl` (Vorlagenstand, #17).
- Alte Speicherpfade: GYM 6/8 im Jahr 2026/27 unter `planner/kl6` usw. – IDs `kl6`/`kl8` nie umbenennen.

## Datenquellen `src/`

- `from_lehrplan.py`: Klassen aus `lehrplan.json`; Klassenarbeiten über `ka_unit()` als vier Platzhalter (`ka_count = 4`).
- `build_data.py`: GYM 6/8 aus `plan.json` + `atoms*.py`, ersetzt deren Klassenarbeiten durch KA1–KA4 (bei zwei Strängen
  abwechselnd A/B, `oldKA` merkt die alten Kürzel für die Migration), hängt `g` aus `generator_map.json` an die Atome.
- `generator_map.json`: Zuordnung prüfen, wenn Generatoren schwierigere Varianten mischen (z. B. negative Zahlen auf Stufe 3
  bei `algebra__gleichungen_inhaltlich_loesen` – deshalb nicht in OS 5). Stufenzuordnung `GEN_STAGE = {1:0, 2:1, 3:3}`.

## Tests (`src/test.js`)

- Ein langes Skript mit `ok(bedingung, text)`. Neue Prüfungen thematisch einsortieren; **Variablennamen eindeutig halten**
  (alles liegt in einer Funktion, doppelte `const` brechen das ganze Skript ab).
- Im Node-Teil gibt es kein `document`; DOM nur in `p.evaluate(() => …)`.
- Datumsfelder: `await p.fill(sel, 'JJJJ-MM-TT')` und bei `data-act`-Feldern zusätzlich `p.dispatchEvent(sel, 'change')`.
- `p.dragAndDrop` auf hohe Elemente mit `targetPosition` (sonst liegt die Mitte außerhalb des Fensters).
- Zustand, den ein Test ändert (Stundenplan, Checks, Pins), am Ende zurücksetzen, sonst kippen spätere Tests.

## Veröffentlichung

- GitHub Pages baut bei jedem Push auf `main` (Workflow `.github/workflows/pages.yml`), hängt `?v=<commit>` an die Skripte
  gegen veraltete Browser-Caches. Erfolg prüfen mit `mcp__github__actions_list` (`list_workflow_runs`).
- Meldet die Lehrkraft „Änderung nicht sichtbar“, zuerst prüfen, ob gemergt und deployed wurde und ob der Browser-Cache
  die Ursache ist (Strg+Umschalt+R).
- Das Claude-Artefakt wird nicht automatisch aktualisiert; nur auf ausdrücklichen Wunsch neu veröffentlichen.
