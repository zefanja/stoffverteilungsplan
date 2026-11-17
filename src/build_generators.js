/* Baut dist/generators.js aus den Aufgabengeneratoren der Anemo-Mathe-App (src/anemo/generators.ts, unverändert
   aus github.com/zefanja/anemo, src/lib/server/tasks/generators.ts übernommen) und ihren Titeln (src/anemo/labels.json).
   Die TypeScript-Typen werden mit Node entfernt (node:module stripTypeScriptTypes, ab Node 22.13); das Ergebnis
   ist ein Skript ohne Abhängigkeiten, das window.ANEMO = { generateTask, hasGenerator, ids, labels } bereitstellt.
   Aufruf: node src/build_generators.js */
const fs = require("fs"), path = require("path");
const { stripTypeScriptTypes } = require("node:module");
const root = path.join(__dirname, "..");
const ts = fs.readFileSync(path.join(root, "src/anemo/generators.ts"), "utf8");
const labels = JSON.parse(fs.readFileSync(path.join(root, "src/anemo/labels.json"), "utf8"));
let js = stripTypeScriptTypes(ts, { mode: "strip" });
js = js.replace(/^export (?=(function|const|let|class) )/gm, "").replace(/^export (type|interface) [^\n]*\n/gm, "");
if (/^\s*(export|import)\b/m.test(js)) throw new Error("Unerwartetes export/import in generators.ts");
const out = `/* Erzeugt von src/build_generators.js aus src/anemo/generators.ts (Anemo-Mathe-App). Nicht von Hand bearbeiten. */
(function () {
"use strict";
${js}
window.ANEMO = { generateTask, hasGenerator, ids: registeredAtomIds, labels: ${JSON.stringify(labels)} };
})();
`;
fs.writeFileSync(path.join(root, "dist/generators.js"), out);
/* Selbsttest: jeder Generator liefert auf allen Stufen eine Aufgabe mit Text und Lösung. */
const sandbox = { window: {} };
new Function("window", out)(sandbox.window);
const A = sandbox.window.ANEMO;
for (const id of A.ids) for (let st = 0; st < 6; st++) {
  const t = A.generateTask(id, st);
  if (!t || !t.prompt || t.correctAnswer === undefined || t.correctAnswer === "") throw new Error(`Generator ${id} (Stufe ${st}) liefert keine Aufgabe`);
}
const missing = A.ids.filter(id => !labels[id]);
if (missing.length) throw new Error("Titel fehlen: " + missing.join(", "));
console.log(`dist/generators.js: ${A.ids.length} Generatoren, ${out.length} Zeichen`);
