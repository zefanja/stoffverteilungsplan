// Baut dist/vorlage.js (Fachschaftsvorlage) aus den Dateien in src/vorlage/*.json.
// Aufruf: node src/build_vorlage.js
// Jede Datei ist ein Export aus der App (Einstellungen → Fachschaftsvorlage → „… als Vorlage speichern“):
// eine Klasse ({ app: "matheplaner-vorlage", id, mode, seq, atoms, ln, req }) oder mehrere ({ app, classes: { id: {…} } }).
// Geprüft wird gegen dist/data.js: Klasse, Kürzel der Sequenz, Einheiten der Atome und Aufbau der Atome.
// Bei Fehlern bricht das Skript ab und dist/vorlage.js bleibt unverändert.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
// VORLAGE_SRC / VORLAGE_OUT nur für Tests
const SRC = process.env.VORLAGE_SRC || path.join(ROOT, 'src', 'vorlage');
const OUT = process.env.VORLAGE_OUT || path.join(ROOT, 'dist', 'vorlage.js');

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'dist', 'data.js'), 'utf8'), sandbox);
const D = sandbox.window.PLAN_DATA;
const KINDS = ['ka', 'klausur', 'test', 'praes', 'komplex'];
const errors = [];
const err = (file, msg) => errors.push(`${file}: ${msg}`);
const isStr = x => typeof x === 'string';

const files = fs.existsSync(SRC) ? fs.readdirSync(SRC).filter(f => f.endsWith('.json')).sort() : [];
const classes = {}, from = {};
let updated = null;
for (const f of files) {
  let o;
  try { o = JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8')); } catch (e) { err(f, 'kein gültiges JSON (' + e.message + ')'); continue; }
  if (!o || o.app !== 'matheplaner-vorlage') { err(f, 'keine Vorlage des Matheplaners (app muss "matheplaner-vorlage" sein)'); continue; }
  const list = o.classes && typeof o.classes === 'object' ? Object.entries(o.classes).map(([id, t]) => Object.assign({ id }, t)) : [o];
  for (const t of list) {
    const k = t.id, c = D.classes[k];
    if (!c) { err(f, `unbekannte Klasse "${k}"`); continue; }
    if (classes[k]) { err(f, `Klasse ${k} steht schon in ${from[k]}`); continue; }
    const ln = {};
    for (const [code, u] of Object.entries(t.ln || {})) {
      if (c.units[code]) { err(f, `${k}: Leistungsnachweis ${code} hat dasselbe Kürzel wie eine Einheit des Lehrplans`); continue; }
      if (!u || !isStr(u.title) || !Array.isArray(u.stunden) || !u.stunden.length || !u.stunden.every(isStr)) { err(f, `${k}: Leistungsnachweis ${code} braucht title und stunden (Liste)`); continue; }
      if (u.kind && !KINDS.includes(u.kind)) err(f, `${k}: Leistungsnachweis ${code} hat unbekannte Art "${u.kind}"`);
      ln[code] = { kind: u.kind || 'ka', title: u.title, stunden: u.stunden };
      if (Number.isInteger(u.main)) ln[code].main = u.main;
    }
    const known = code => code === 'P' || code === 'JA' || !!c.units[code] || !!ln[code];
    if (t.mode !== undefined && t.mode !== 'Stränge' && t.mode !== 'nacheinander') err(f, `${k}: Modus muss "Stränge" oder "nacheinander" sein`);
    if (!Array.isArray(t.seq) || !t.seq.length) err(f, `${k}: Sequenz fehlt`);
    else t.seq.forEach((r, i) => {
      if (!Array.isArray(r) || !isStr(r[0]) || !['A', 'B'].includes(r[1]) || !Number.isInteger(r[2]) || r[2] < 0) err(f, `${k}: Zeile ${i + 1} der Sequenz muss [Kürzel, "A"|"B", Stunden] sein`);
      else if (!known(r[0])) err(f, `${k}: Zeile ${i + 1}: unbekanntes Kürzel ${r[0]}`);
    });
    const ids = new Set(), atoms = {};
    for (const [code, list] of Object.entries(t.atoms || {})) {
      if (!c.units[code] && !ln[code]) { err(f, `${k}: Atome für unbekannte Einheit ${code}`); continue; }
      if (!Array.isArray(list)) { err(f, `${k}: Atome von ${code} müssen eine Liste sein`); continue; }
      list.forEach((a, i) => {
        const where = `${k} ${code}, Atom ${i + 1}`;
        if (!a || !isStr(a.id) || !a.id) return err(f, `${where}: id fehlt`);
        if (ids.has(a.id)) err(f, `${where}: id ${a.id} kommt doppelt vor`);
        ids.add(a.id);
        if (!Number.isInteger(a.l) || a.l < 1) err(f, `${where} (${a.id}): l (Stunde) muss eine Zahl ab 1 sein`);
        for (const x of ['t', 'q', 'a']) if (!isStr(a[x])) err(f, `${where} (${a.id}): ${x} fehlt`);
        for (const x of ['q2', 'a2', 'q3', 'a3']) if (a[x] !== undefined && !isStr(a[x])) err(f, `${where} (${a.id}): ${x} muss Text sein`);
      });
      atoms[code] = list;
    }
    // Vorgabe der Fachschaft: Anzahl Leistungsnachweise je Art (ka, klausur, test, praes, komplex, chk)
    let req;
    if (t.req !== undefined) {
      if (!t.req || typeof t.req !== 'object') err(f, `${k}: req muss ein Objekt sein`);
      else { req = {}; for (const [v, n] of Object.entries(t.req)) { if (![...KINDS, 'chk'].includes(v)) err(f, `${k}: Vorgabe für unbekannte Art "${v}"`); else if (!Number.isInteger(n) || n < 0) err(f, `${k}: Vorgabe ${v} muss eine ganze Zahl ab 0 sein`); else if (n) req[v] = n; } }
    }
    classes[k] = Object.assign({ exported: isStr(t.exported) ? t.exported : (isStr(o.exported) ? o.exported : null), mode: t.mode || c.mode, seq: t.seq, atoms, ln }, req && Object.keys(req).length ? { req } : {});
    from[k] = f;
    const d = classes[k].exported;
    if (d && (!updated || d > updated)) updated = d;
  }
}
if (errors.length) {
  console.error('Fachschaftsvorlage nicht gebaut:\n  ' + errors.join('\n  '));
  process.exit(1);
}
const body = { updated, classes };
const head = '/* Fachschaftsvorlage: erzeugt von src/build_vorlage.js aus src/vorlage/*.json. Nicht von Hand bearbeiten. */\n';
fs.writeFileSync(OUT, head + 'window.PLAN_TEMPLATE=' + JSON.stringify(body) + ';\n');
const n = Object.keys(classes).length;
console.log(n ? `dist/vorlage.js: ${n} Klasse${n > 1 ? 'n' : ''} (${Object.keys(classes).join(', ')})${updated ? ', Stand ' + updated : ''}` : 'dist/vorlage.js: keine Fachschaftsvorlage (src/vorlage/ ist leer), es gilt der Lehrplan');
