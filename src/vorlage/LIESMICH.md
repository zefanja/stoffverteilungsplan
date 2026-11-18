# Fachschaftsvorlage

Hier liegen die gemeinsamen Vorlagen der Fachschaft, je Klasse eine JSON-Datei, z. B. `vorlage-kl8.json`.

1. In der App: Einstellungen → Fachschaftsvorlage → „… als Vorlage speichern“ (oder „Alle meine Klassen“).
2. Die Datei hier ablegen (eine vorhandene Datei derselben Klasse ersetzen). Auf GitHub geht das auch im Browser:
   „Add file“ → „Upload files“.
3. `node src/build_vorlage.js` baut daraus `dist/vorlage.js` und prüft die Datei gegen den Lehrplan. Beim
   Veröffentlichen über GitHub Pages läuft das automatisch.

Die Datei enthält nur Sequenz, Modus, Atome und Leistungsnachweise, keine persönlichen Daten. Wer der Vorlage folgt
(seine Sequenz nicht selbst geändert hat), bekommt sie beim nächsten Öffnen automatisch; alle anderen sehen in der
Sequenz einen Hinweis und entscheiden selbst.

Ohne Dateien hier gilt der Lehrplan (`dist/data.js`) als Vorlage.
