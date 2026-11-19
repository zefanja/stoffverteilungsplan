(function () {
"use strict";
const D = window.PLAN_DATA;
const CLASSES = Object.keys(D.classes);
const TYPES = D.schoolTypes || { gym: { label: "Gymnasium", short: "GYM", grades: [5, 6, 7, 8, 9, 10, 11, 12] } };
/* Mehrere Klassen je Stufe möglich: Oberschule ab Kl. 7 Haupt-/Realschulbildungsgang (HS/RS), Gymnasium 11/12 Grund-/Leistungskurs (GK/LK). */
const classesFor = (type, grade) => CLASSES.filter(k => D.classes[k].type === type && +D.classes[k].grade === +grade);
const classFor = (type, grade) => classesFor(type, grade)[0] || null;

/* ---------------- Vorlage ----------------
   Drei Ebenen: Lehrplan (data.js, erzeugt) → Fachschaftsvorlage (vorlage.js, gemeinsam gepflegt) → persönliche Daten
   (je Lehrkraft gespeichert: Stundenplan, Häkchen, Ausfälle, Lernstand, eigene Abweichungen).
   Die Fachschaftsvorlage ersetzt je Klasse Modus, Sequenz und die Atome einzelner Einheiten und kann eigene
   Leistungsnachweis-Einheiten mitbringen. Danach ist D.classes die gemeinsame Vorlage; LP hält den Lehrplan-Stand. */
const TPLDATA = window.PLAN_TEMPLATE && typeof window.PLAN_TEMPLATE === "object" ? window.PLAN_TEMPLATE : {};
const strHash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
const atomHash = list => strHash(JSON.stringify((list || []).map(a => [a.id, +a.l, a.t, a.q, a.a, a.q2 ?? null, a.a2 ?? null, a.q3 ?? null, a.a3 ?? null, a.g ?? null])));
const LP = {}, TPL = {};
CLASSES.forEach(k => {
  const c = D.classes[k], atoms = {};
  Object.keys(c.units).forEach(code => { atoms[code] = atomHash(c.units[code].atoms); });
  LP[k] = { seq: c.seq.map(r => [r[0], r[1] === "B" ? "B" : "A", +r[2] || 0]), mode: c.mode, atoms };
});
Object.entries(TPLDATA.classes || {}).forEach(([k, t]) => {
  const c = D.classes[k]; if (!c || !t || typeof t !== "object") return;
  Object.entries(t.ln || {}).forEach(([code, u]) => {
    if (c.units[code] || !u || typeof u !== "object") return;
    const stunden = Array.isArray(u.stunden) && u.stunden.length ? u.stunden.map(String) : ["Leistungsnachweis"];
    c.units[code] = { code, lb: "test", title: String(u.title || code), kind: ["ka", "klausur", "test", "praes", "komplex"].includes(u.kind) ? u.kind : undefined, main: Number.isInteger(u.main) ? u.main : undefined, stunden, inhalte: [], begriffe: [], hinweise: [], atoms: [], tpl: true };
    c.unitOrder.push(code);
  });
  if (Array.isArray(t.seq) && t.seq.length) {
    const seq = t.seq.filter(r => Array.isArray(r) && (c.units[r[0]] || r[0] === "P" || r[0] === "JA")).map(([code, strand, hours]) => [code, strand === "B" ? "B" : "A", Math.max(0, +hours || 0)]);
    if (seq.length) c.seq = seq;
  }
  if (t.mode === "nacheinander" || t.mode === "Stränge") c.mode = t.mode;
  Object.entries(t.atoms || {}).forEach(([code, list]) => { if (c.units[code] && Array.isArray(list)) c.units[code].atoms = list; });
  TPL[k] = { exported: t.exported || null, by: t.by || "" };
});

/* ---------------- utils ---------------- */
const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
const dow = s => { const w = parse(s).getDay(); return w === 0 ? 7 : w; };
const fmt = (s, o) => parse(s).toLocaleDateString("de-DE", o || { day: "2-digit", month: "2-digit" });
const fmtLong = s => fmt(s, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const monday = s => addDays(s, 1 - dow(s));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const uid = () => Math.random().toString(36).slice(2, 9);
const todayIso = () => iso(new Date());
function isoWeek(s) {
  const d = parse(s); const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y0) / 864e5 + 1) / 7);
}
/* ---------------- Formelsatz mit MathJax ----------------
   mx(text) liefert HTML: normaler Text bleibt Text, Formelstellen werden zu <span class="m" data-tex="…">Originaltext</span>.
   Sobald MathJax geladen ist, ersetzt typesetMath() diese Spans durch SVG; ohne MathJax bleibt der Originaltext sichtbar. */
const MX_CODE = /[*]|\b(solve|factor|expand|randInt)\b|^=|=A\d/;
const MX_UNITS = new Set(["mm", "cm", "dm", "km", "ml", "kg", "min", "ct", "€"]);
const MX_UNIT1 = new Set(["m", "l", "g", "h", "s", "t"]);
const MX_GREEK = { "α": "\\alpha ", "β": "\\beta ", "γ": "\\gamma ", "δ": "\\delta ", "Δ": "\\Delta ", "Ω": "\\Omega ", "π": "\\pi ", "φ": "\\varphi ", "ℕ": "\\mathbb{N}", "ℤ": "\\mathbb{Z}", "ℚ": "\\mathbb{Q}", "ℝ": "\\mathbb{R}", "∞": "\\infty " };
const MX_FN = { sin: "\\sin ", cos: "\\cos ", tan: "\\tan ", ln: "\\ln ", lg: "\\lg ", log: "\\log ", lim: "\\lim ", exp: "\\exp ", dx: "\\,dx " };
const MX_OPS = { "+": "+", "−": "-", "·": "\\cdot ", "×": "\\times ", "=": "=", "<": "<", ">": ">", "≤": "\\le ", "≥": "\\ge ", "≠": "\\ne ", "≈": "\\approx ", "∈": "\\in ", "∉": "\\notin ", "⊂": "\\subset ", "∪": "\\cup ", "∩": "\\cap ", "|": "\\mid ", "…": "\\ldots ", ":": "\\mathbin{:}", ",": ",\\,", "±": "\\pm ", "↦": "\\mapsto ", "∫": "\\int ", "÷": "\\div ", ";": ";\\;" };
const MX_SUP = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "ⁿ": "n", "⁺": "+", "⁻": "-" };
const MX_SUB = { "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9", "ₙ": "n", "ₐ": "a" };
const MX_RE = /(\d{1,3}(?: \d{3})+(?![\d,])|\d+(?:,\d+)?\u0305?)|([A-Za-zÄÖÜäöüß]{2,}[²³]?)|([A-Za-zα-ωΑ-ΩℕℤℚℝΔφ∞](?:_[a-z])?′?)|(½)|([⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ⁺⁻]+)|([₀-₉ₙₐ]+)|([+−·×=<>≤≥≠≈∈∉⊂∪∩|…:\/√∛±↦∫÷^_])|([()[\]{}])|(□)|(\?)|(%|°)|(\s+)|([\s\S])/gu;
const MX_KINDS = ["num", "word", "let", "half", "sup", "sub", "op", "par", "box", "q", "pct", "sp", "other"];
function mxTokens(s) {
  const out = []; let m; MX_RE.lastIndex = 0;
  while ((m = MX_RE.exec(s))) { const k = MX_KINDS[m.slice(1).findIndex(x => x !== undefined)]; out.push({ k, v: m[0], i: m.index }); }
  for (let i = 0; i < out.length; i++) {
    const t = out[i], n = out[i + 1], p = out[i - 1], pp = out[i - 2];
    if (t.k === "let" && n && n.k === "num" && /^[A-Z]$/.test(t.v)) { t.k = "word"; n.k = "word"; }        // Zellbezug A2
    else if (t.k === "let" && n && n.k === "other" && n.v === ".") t.k = "word";                             // z. B., d. h.
    else if (t.k === "let" && n && n.k === "other" && n.v === "-" && /^[A-Z]$/.test(t.v)) t.k = "word";      // L-förmig
    else if (t.k === "let" && p && p.k === "sp" && pp && (pp.k === "num" || pp.k === "q") && MX_UNIT1.has(t.v)) t.k = "unit";   // 2,5 l; ? l
    else if (t.k === "word" && MX_FN[t.v]) t.k = "fn";                                                       // sin, ln, lim, dx
    else if (t.k === "word") {
      const base = t.v.replace(/[²³]$/, "");
      if (MX_UNITS.has(base) || /^(mm|cm|dm|km|m)[²³]$/.test(t.v)) t.k = "unit";
      else if (p && p.k === "num" && /^[a-z]{2,3}$/.test(t.v)) t.k = "var";                                 // 12ab, 2ac
    }
    if (t.k === "let") t.k = "var";
  }
  return out;
}
const MX_MATH = new Set(["num", "var", "half", "sup", "sub", "op", "par", "box", "q", "pct", "unit", "sp", "fn"]);
function mxRuns(tk) {
  const runs = []; let i = 0;
  const prevNs = (a, j) => { for (let x = j - 1; x >= a; x--) if (tk[x].k !== "sp") return tk[x]; return null; };
  const nextNs = j => { for (let x = j + 1; x < tk.length; x++) if (tk[x].k !== "sp") return tk[x]; return null; };
  while (i < tk.length) {
    const t = tk[i];
    if (!MX_MATH.has(t.k) || ["sp", "unit", "pct", "sup", "sub", "q"].includes(t.k) || (t.k === "op" && !"−√∛∫".includes(t.v))) { i++; continue; }
    let j = i, depth = 0;
    for (; j < tk.length; j++) {
      const u = tk[j];
      if (u.k === "par") { depth += "([{".includes(u.v) ? 1 : -1; continue; }
      if (u.k === "other" && u.v === "," && depth > 0) { u.k = "op"; continue; }
      if (u.k === "q") { const pv = prevNs(i, j); if (pv && pv.v === "=") continue; break; }
      if (u.k === "op" && u.v === ":") {                                                                     // Division nur als „a : b“ mit Leerzeichen
        const pv = prevNs(i, j), nx = nextNs(j);
        if (!(tk[j - 1] && tk[j - 1].k === "sp" && tk[j + 1] && tk[j + 1].k === "sp")) break;
        const okL = pv && (["num", "var", "sup", "box"].includes(pv.k) || pv.v === ")"), okR = nx && ["num", "var", "half", "box", "par"].includes(nx.k);
        if (okL && okR) continue;
        break;
      }
      if (!MX_MATH.has(u.k)) break;
    }
    let a = i, e = j;
    while (e > a && ["sp", "op"].includes(tk[e - 1].k) && tk[e - 1].v !== "…") e--;                       // kein Operator am Ende
    const bal = (x, y) => { let d = 0; for (let z = x; z < y; z++) if (tk[z].k === "par") { d += "([{".includes(tk[z].v) ? 1 : -1; if (d < 0) return false; } return d === 0; };
    while (e > a && !bal(a, e)) {                                                                            // Klammern ausgleichen
      if (tk[e - 1].k === "par" && "([{".includes(tk[e - 1].v)) e--;
      else if (tk[a].k === "par") a++;
      else e--;
      while (e > a && ["sp", "op"].includes(tk[e - 1].k)) e--;
      while (a < e && tk[a].k === "sp") a++;
    }
    const seg = tk.slice(a, e);
    const strong = seg.some(u => (u.k === "op" && u.v !== ",") || u.k === "sup" || u.k === "sub" || u.k === "fn" || u.k === "half" || u.k === "box" || u.k === "pct" || /[\u0305²³ₐ′_]/.test(u.v) || (u.k === "var" && /[α-ωΑ-ΩℕℤℚΔ]/.test(u.v)) || (u.k === "num" && /,\d/.test(u.v)))
      || seg.some((u, z) => u.k === "var" && z > 0 && seg[z - 1].k === "num")
      || (seg.length === 1 && seg[0].k === "var");
    if (seg.length && strong) runs.push([a, e]);
    i = Math.max(j, i + 1);
  }
  return runs;
}
function mxTex(tk) {
  const it = [];
  const varTex = v => [...v].map(c => MX_GREEK[c] || (c === "′" ? "'" : c === "ₐ" ? "_a" : c)).join("").replace(/_([a-z])/g, "_{$1}");
  for (let i = 0; i < tk.length; i++) {
    const t = tk[i], last = it[it.length - 1];
    if (t.k === "num") it.push({ k: "atom", num: true, tex: t.v.replace(/(\d)\u0305/g, "\\overline{$1}").replace(/,/g, "{,}").replace(/ /g, "\\,") });
    else if (t.k === "var" || t.k === "half") {
      const tex = t.k === "half" ? "\\tfrac{1}{2}" : varTex(t.v);
      if (last && last.k === "atom" && (last.num || last.attach)) { last.tex += tex; last.num = false; last.attach = true; last.paren = false; }
      else it.push({ k: "atom", tex, attach: t.k === "half" });
    }
    else if (t.k === "sup") { if (last) last.tex += "^{" + [...t.v].map(c => MX_SUP[c]).join("") + "}"; }
    else if (t.k === "sub") { if (last) last.tex += "_{" + [...t.v].map(c => MX_SUB[c]).join("") + "}"; }
    else if (t.k === "fn") it.push({ k: "atom", tex: MX_FN[t.v], fn: true });
    else if (t.k === "par" && "([{".includes(t.v)) {
      let d = 0, j = i;
      for (; j < tk.length; j++) if (tk[j].k === "par") { d += "([{".includes(tk[j].v) ? 1 : -1; if (d === 0) break; }
      const inner = mxTex(tk.slice(i + 1, j)), close = (tk[j] || {}).v || ")";
      const o = t.v === "{" ? "\\{" : t.v, c = close === "}" ? "\\}" : close;
      const atom = { k: "atom", tex: o + inner + c, inner, paren: t.v === "(" };
      if (last && last.k === "atom") { last.tex += atom.tex; last.paren = false; last.num = false; } else it.push(atom);
      i = j;
    }
    else if (t.k === "op" && t.v === "/") it.push({ k: "slash" });
    else if (t.k === "op" && (t.v === "√" || t.v === "∛")) it.push({ k: "sqrt", idx: t.v === "∛" ? "3" : "" });
    else if (t.k === "op" && (t.v === "^" || t.v === "_")) it.push({ k: t.v === "^" ? "pow" : "low" });
    else if (t.k === "op") it.push({ k: "op", tex: MX_OPS[t.v] || t.v });
    else if (t.k === "box") it.push({ k: "atom", tex: "\\square " });
    else if (t.k === "q") it.push({ k: "atom", tex: "\\text{?}" });
    else if (t.k === "unit") { const b = t.v.replace(/[²³]$/, ""), s = t.v.slice(b.length); it.push({ k: "atom", tex: "\\,\\text{" + b + "}" + (s ? "^{" + MX_SUP[s] + "}" : "") }); }
    else if (t.k === "pct") { if (t.v === "°" && last) last.tex += "^{\\circ}"; else it.push({ k: "atom", tex: "\\,\\%" }); }
    else if (t.k === "sp") it.push({ k: "sp" });
  }
  // Hochzahl/Index „a^(n+1)“, „x_1“: nächstes Atom (ohne äußere Klammer) an das vorige hängen
  for (let i = 0; i < it.length; i++) {
    if (it[i].k !== "pow" && it[i].k !== "low") continue;
    const L = it[i - 1], R = it[i + 1];
    if (L && L.k === "atom" && R && R.k === "atom") { L.tex += (it[i].k === "pow" ? "^{" : "_{") + (R.paren ? R.inner : R.tex) + "}"; L.paren = false; L.num = false; it.splice(i, 2); i--; }
    else it[i] = { k: "op", tex: it[i].k === "pow" ? "\\hat{}" : "\\_" };
  }
  // Wurzel auf das nächste Atom, Brüche aus Atom / Atom, gemischte Zahlen „2 1/4“
  for (let i = 0; i < it.length; i++) if (it[i].k === "sqrt" && it[i + 1] && it[i + 1].k === "atom") { it[i + 1].tex = "\\sqrt" + (it[i].idx ? "[" + it[i].idx + "]" : "") + "{" + (it[i + 1].paren ? it[i + 1].inner : it[i + 1].tex) + "}"; it[i + 1].paren = false; it.splice(i, 1); }
  for (let i = 0; i < it.length; i++) {
    if (it[i].k !== "slash") continue;
    let l = i - 1; while (l >= 0 && it[l].k === "sp") l--;
    let r = i + 1; while (r < it.length && it[r].k === "sp") r++;
    if (l < 0 || r >= it.length || it[l].k !== "atom" || it[r].k !== "atom") { it[i] = { k: "op", tex: "/" }; continue; }
    const opd = x => x.paren ? x.inner : x.tex;
    let tex = "\\frac{" + opd(it[l]) + "}{" + opd(it[r]) + "}", from = l;
    const L = it[l], sp = it[l - 1], N = it[l - 2], before = it[l - 3];
    if (L.num && sp && sp.k === "sp" && N && N.k === "atom" && N.num && (!before || before.k === "op" || (before.k === "sp" && (!it[l - 4] || it[l - 4].k === "op")))) { tex = N.tex + tex; from = l - 2; }
    it.splice(from, r - from + 1, { k: "atom", tex });
    i = from;
  }
  return it.filter(x => x.k !== "sp").map(x => x.tex || "").join(" ").replace(/\s+/g, " ").trim();
}
function mx(s) {
  s = String(s ?? "");
  if (!s || MX_CODE.test(s)) return esc(s);
  const tk = mxTokens(s), runs = mxRuns(tk);
  if (!runs.length) return esc(s);
  let html = "", pos = 0;
  for (const [a, e] of runs) {
    const from = tk[a].i, to = tk[e - 1].i + tk[e - 1].v.length;
    html += esc(s.slice(pos, from)) + `<span class="m" data-tex="${esc(mxTex(tk.slice(a, e)))}">${esc(s.slice(from, to))}</span>`;
    pos = to;
  }
  return html + esc(s.slice(pos));
}
const mxCache = new Map();
function typesetMath(root) {
  const M = window.MathJax;
  if (!M || !M.tex2svg || !root) return;
  // MathJax-Stylesheet einmalig einbinden (blendet u. a. die MathML-Fassung für Screenreader visuell aus)
  if (!typesetMath.css && M.svgStylesheet) { try { document.head.appendChild(M.svgStylesheet()); } catch (e) {} typesetMath.css = true; }
  root.querySelectorAll("span.m:not(.mj)").forEach(el => {
    const tex = el.dataset.tex; let node = mxCache.get(tex);
    try {
      if (!node) { node = M.tex2svg(tex, { display: false }); if (node.querySelector("[data-mjx-error]")) throw 0; mxCache.set(tex, node); }
      el.title = el.textContent; el.replaceChildren(node.cloneNode(true)); el.classList.add("mj");
    } catch (e) { el.classList.add("mj"); }
  });
}
const DAYS = ["", "Mo", "Di", "Mi", "Do", "Fr"];
const LBVAR = { LB1: "lb1", LB2: "lb2", LB3: "lb3", LB4: "lb4", LB5: "lb5", LB6: "lb1", LB7: "lb2", LB8: "lb3", LB9: "lb4", WB: "wb", test: "test", start: "start", P: "buf" };
const sty = lb => `--c:var(--${LBVAR[lb] || "buf"});--bg:var(--${LBVAR[lb] || "buf"}-bg)`;

/* ---------------- state ---------------- */
/* Schuljahre: id "2026-27"; jedes Jahr hat eigenen Kalender und eigene Klassen- und Engine-Dokumente. */
const yearIdOf = s => { const [y, m] = s.split("-").map(Number); const a = m >= 8 ? y : y - 1; return `${a}-${String(a + 1).slice(2)}`; };
const yearLabel = id => String(id).replace("-", "/");
const yearStart = id => +String(id).slice(0, 4);
function defaultYear() {
  const c = clone(D.calendar);
  return addHaDays({ id: yearIdOf(c.start), start: c.start, end: c.end, holidays: c.holidays, free: c.free, engineStart: null, legacyDocs: true });
}
/* HA-Tage: die zwei Schultage nach dem Buß- und Bettag sind unterrichtsfrei. Fügt sie einmal je Schuljahr ein (Merker haDays),
   damit ein von Hand gelöschter HA-Tag nicht wiederkommt. Schon eingetragene Tage, Wochenenden und Ferien werden übersprungen. */
const HA_NAME = "HA-Tag";
function addHaDays(Y) {
  if (!Y || Y.haDays) return Y;
  Y.free = Y.free || []; Y.haDays = true;
  const bb = Y.free.find(f => f.date && /bu(ß|ss)- und bettag/i.test(f.name || ""));
  if (!bb) return Y;
  const inHol = d => (Y.holidays || []).some(h => h.frm && h.to && h.frm <= d && d <= h.to);
  let d = bb.date, n = 0;
  for (let guard = 0; n < 2 && guard < 14; guard++) {
    d = addDays(d, 1);
    if (dow(d) > 5 || inHol(d) || (Y.end && d > Y.end)) continue;
    if (!Y.free.some(f => f.date === d)) Y.free.push({ date: d, name: HA_NAME });
    n++;
  }
  Y.free.sort((a, b) => (a.date || "9") < (b.date || "9") ? -1 : 1);
  return Y;
}
function defaultSettings() { return { years: [defaultYear()], retention: 0.9, perLesson: 10, autoBuffer: true, pl10: true }; }
const sortYears = ys => ys.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const sortTT = tt => tt.sort((a, b) => (a.frm || "") < (b.frm || "") ? -1 : (a.frm || "") > (b.frm || "") ? 1 : 0);
const cloneLessons = ls => ls.map(l => Object.assign({ id: uid(), day: +l.day, period: +l.period, track: l.track }, +l.len === 2 ? { len: 2 } : {}));
/* Unterrichtsstunden pro Woche (Doppelstunde = 2) */
const lessonLen = l => +l.len === 2 ? 2 : 1;
const weekHours = ls => (ls || []).reduce((a, l) => a + lessonLen(l), 0);
/* Sequenz aus der ersten Lehrplan-Vorlage (ohne Klassenarbeiten, nur Zeitrichtwerte und je LB 1 Puffer), nie bearbeitet */
function isOldLehrplanSeq(k, seq) {
  const c = D.classes[k];
  if (!c || c.source !== "lehrplan") return false;
  const zrw = Object.values(c.zrw || {}).reduce((a, x) => a + x, 0);
  let units = 0;
  for (const r of seq) {
    if (!r || typeof r !== "object") return false;
    if (r.code === "P") { if (+r.hours !== 1) return false; continue; }
    if (!/^\d/.test(r.code || "")) return false;
    units += +r.hours || 0;
  }
  return units === zrw;
}
function defaultClass(k, y) {
  const c = D.classes[k]; y = y || cal();
  const tt = y.start === D.calendar.start
    ? c.tt.map(v => ({ id: uid(), frm: v.frm, lessons: cloneLessons(v.lessons) }))
    : [{ id: uid(), frm: y.start, lessons: cloneLessons(c.tt[c.tt.length - 1].lessons) }];
  const C = { mode: c.mode, seq: c.seq.map(([code, strand, hours]) => ({ id: uid(), code, strand, hours })), atoms: {},
    groups: [newGroup("a", "", tt)], ln: {}, checks: [], kaV: 1, tpl: tplStamp(k) };
  C.groups[0].pin = kaPins(k, C.seq, y);
  return C;
}
/* Allgemeine Klassenarbeits-Platzhalter der Vorlage (Einheiten mit Feld ka = 1…4): Standardtermine aus den Ferien des
   Schuljahres, zwei je Halbjahr. KA1 kurz vor den Herbstferien (Ende 1. Quartal), KA2 2–3 Wochen nach den Weihnachtsferien,
   KA3 kurz vor den Osterferien (Ende 3. Quartal), KA4 2–3 Wochen nach den Pfingstferien. Endet die Klasse früher
   (GYM 12, OS 10), verteilen sich die übrigen Arbeiten bis eine Woche vor dem letzten Unterrichtstag. Ohne Ferien: nach Anteilen
   des Schuljahres. Liegt ein Termin nicht auf einer Mathestunde, nimmt der Plan die nächste. */
function kaDates(k, Y) {
  Y = Y || cal(); if (!Y.start || !Y.end) return [];
  const hol = re => (Y.holidays || []).find(h => h.frm && h.to && re.test(h.name || "") && h.frm > Y.start && h.to < Y.end);
  const he = hol(/herbst/i), we = hol(/weihnacht/i), os = hol(/oster/i), pf = hol(/pfingst/i);
  const frac = f => addDays(Y.start, Math.round(diffDays(Y.start, Y.end) * f));
  let ds = [he ? addDays(he.frm, -10) : frac(0.2), we ? addDays(we.to, 16) : frac(0.45), os ? addDays(os.frm, -10) : frac(0.7), pf ? addDays(pf.to, 17) : frac(0.9)];
  const last = (S.cls && S.cls[k] && S.cls[k].lastDay) || ruleLastDay(k, Y) || Y.end, limit = addDays(last, -7);
  const ok = ds.filter(d => d <= limit), m = ds.length - ok.length;
  if (m > 0) {
    let from = ok.length ? addDays(ok[ok.length - 1], 21) : addDays(Y.start, 21); if (from > limit) from = ok.length ? addDays(ok[ok.length - 1], 7) : Y.start;
    const span = Math.max(0, diffDays(from, limit));
    for (let i = 1; i <= m; i++) ok.push(addDays(from, Math.round(span * (m === 1 ? 1 : (i - 1) / (m - 1)))));
    // Liegen die letzten beiden zu dicht (unter 3 Wochen), beide gleichmäßig zwischen KA2 + 4 Wochen und dem Ende verteilen
    if (ok.length === 4 && diffDays(ok[2], ok[3]) < 21) {
      const a = addDays(ok[1], 28), b2 = limit;
      if (a < b2) { ok[2] = addDays(a, Math.round(diffDays(a, b2) / 3)); ok[3] = b2; }
    }
  }
  return ok;
}
/* Feste Termine für die Platzhalter einer Sequenz: Zeilen-ID -> Datum (KA n -> n-ter Termin). */
function kaPins(k, seq, Y) {
  const ds = kaDates(k, Y), pin = {};
  seq.forEach(r => { const u = D.classes[k].units[r.code]; if (u && u.ka && ds[u.ka - 1]) pin[r.id] = ds[u.ka - 1]; });
  return pin;
}
/* Gespeicherte Pläne einmal auf die Platzhalter umstellen: Zeilen alter Klassenarbeiten (Kürzel nicht mehr in der Vorlage)
   bekommen der Reihe nach die freien Platzhalter-Kürzel, dann erhalten alle Parallelklassen die Standardtermine,
   sofern dort noch kein eigener Termin steht. */
function migrateKa(k, C) {
  const units = D.classes[k].units, phs = Object.keys(units).filter(x => units[x].ka).sort((a, b) => units[a].ka - units[b].ka);
  const used = new Set(C.seq.map(r => r.code)), free = phs.filter(x => !used.has(x));
  const old = new Set(D.classes[k].oldKA || []);
  // alte Zeilen wie in der Vorlage ordnen: je Strang die erste, dann je Strang die zweite …, damit sich die Stränge abwechseln
  const oldRows = C.seq.filter(r => !units[r.code] && !(C.ln || {})[r.code] && (old.has(r.code) || /KA\d/.test(r.code)));
  const rank = r => oldRows.filter(x => x.strand === r.strand && oldRows.indexOf(x) < oldRows.indexOf(r)).length;
  oldRows.slice().sort((a, b) => rank(a) - rank(b) || (a.strand < b.strand ? -1 : a.strand > b.strand ? 1 : 0)).forEach(r => {
    if (!free.length) return; const nc = free.shift(); if (C.atoms[r.code]) { C.atoms[nc] = C.atoms[r.code]; delete C.atoms[r.code]; } r.code = nc;
  });
  const pins = kaPins(k, C.seq, cal());
  C.groups.forEach(G => { G.pin = G.pin || {}; Object.entries(pins).forEach(([id, d]) => { if (!G.pin[id]) G.pin[id] = d; }); });
  C.kaV = 1;
}

/* ---------------- Abgleich mit der Fachschaftsvorlage ----------------
   C.tpl merkt sich den Stand der Vorlage, auf dem die eigene Planung beruht: Sequenz als [Kürzel, Strang, Stunden], Modus
   und für Einheiten mit eigenen Atomen deren Prüfsumme. Ändert sich die Vorlage:
   - eigene Sequenz unverändert gegenüber diesem Stand: die neue Vorlage wird still übernommen;
   - eigene Sequenz geändert: Hinweis in der Sequenz („Vorlage übernehmen“ oder „Meine Fassung behalten“);
   - eigene Atome einer Einheit, deren Atome die Fachschaft geändert hat: Hinweis in der Einheit.
   Leistungsnachweise (Lernbereich „test“: Platzhalter und eigene Arbeiten) zählen dabei nicht als Abweichung und
   bleiben beim Übernehmen erhalten, ebenso Stundenpläne, Termine, Ausfälle, Häkchen und Lernstand. */
function tplStamp(k) { const c = D.classes[k]; return { seq: c.seq.map(r => [r[0], r[1] === "B" ? "B" : "A", +r[2] || 0]), mode: c.mode, atoms: {} }; }
const seqArr = seq => seq.map(r => [r.code, r.strand === "B" ? "B" : "A", +r.hours || 0]);
const tplAtomHash = (k, code) => atomHash((D.classes[k].units[code] || {}).atoms);
/* Kernzeilen: Einheiten mit Stoff, Puffer und Jahresabschluss; alle anderen Zeilen sind Leistungsnachweise. */
const isCore = (k, code) => code === "P" || code === "JA" || (!!D.classes[k].units[code] && D.classes[k].units[code].lb !== "test");
const coreKey = (k, arr, mode) => mode + ";" + arr.filter(r => isCore(k, r[0])).map(r => r.join("|")).join(",");
function tplOf(k, C) {
  if (!C.tpl || !Array.isArray(C.tpl.seq)) C.tpl = tplStamp(k);
  if (!C.tpl.atoms || typeof C.tpl.atoms !== "object") C.tpl.atoms = {};
  return C.tpl;
}
/* Eigene Fassung: die Sequenz (ohne Leistungsnachweise) oder der Modus weicht vom gemerkten Vorlagenstand ab. */
const seqOwn = (k, C) => { const t = tplOf(k, C); return coreKey(k, seqArr(C.seq), C.mode) !== coreKey(k, t.seq, t.mode); };
/* Die Vorlage hat sich seit dem gemerkten Stand geändert. */
const tplNewer = (k, C) => { const t = tplOf(k, C); return JSON.stringify(t.seq) !== JSON.stringify(tplStamp(k).seq) || t.mode !== D.classes[k].mode; };
/* Vorlage übernehmen: Kernzeilen aus der Vorlage (IDs gleicher Kürzel bleiben, damit Abweichungen und Termine der
   Parallelklassen erhalten bleiben), eigene Leistungsnachweise hinter derselben Kernzeile wie bisher, neue
   Leistungsnachweise der Vorlage an ihrem Platz in der Vorlage. Selbst entfernte Platzhalter kommen nicht wieder. */
function adoptTemplate(k, C) {
  const c = D.classes[k], base = tplOf(k, C).seq, old = C.seq;
  const occ = codes => { const n = {}; return codes.map(code => { n[code] = n[code] || 0; return code + "#" + n[code]++; }); };
  const oldCore = old.filter(r => isCore(k, r.code)), oldKeys = occ(oldCore.map(r => r.code)), byKey = {};
  oldCore.forEach((r, i) => { byKey[oldKeys[i]] = r; });
  const tCore = c.seq.filter(r => isCore(k, r[0])), tKeys = occ(tCore.map(r => r[0])), newKeys = new Set(tKeys);
  const after = {}, put = (key, row) => { (after[key] = after[key] || []).push(row); };
  const anchor = seen => { for (let i = seen.length - 1; i >= 0; i--) if (newKeys.has(seen[i])) return seen[i]; return "^"; };
  const known = code => !!(c.units[code] || (C.ln || {})[code]);
  const removed = new Set(base.filter(r => !isCore(k, r[0]) && !old.some(x => x.code === r[0])).map(r => r[0]));
  const kept = new Set(), fresh = new Set();
  let seen = [], ci = 0;
  old.forEach(r => {
    if (isCore(k, r.code)) { seen.push(oldKeys[ci++]); return; }
    if (!known(r.code)) return;
    const b = base.find(x => x[0] === r.code), t = c.seq.find(x => x[0] === r.code);
    // Stunden und Strang der Vorlage, solange du sie bei diesem Leistungsnachweis nicht geändert hast
    const row = b && t && b[1] === (r.strand === "B" ? "B" : "A") && b[2] === +r.hours ? Object.assign({}, r, { strand: t[1], hours: t[2] }) : Object.assign({}, r);
    put(anchor(seen), row); kept.add(r.code);
  });
  seen = []; let ti = 0;
  c.seq.forEach(r => {
    if (isCore(k, r[0])) { seen.push(tKeys[ti++]); return; }
    if (kept.has(r[0]) || removed.has(r[0])) return;
    const row = { id: uid(), code: r[0], strand: r[1], hours: r[2] }; fresh.add(row.id);
    put(seen.length ? seen[seen.length - 1] : "^", row);
  });
  const seq = (after["^"] || []).slice();
  tCore.forEach((r, i) => { const prev = byKey[tKeys[i]]; seq.push({ id: prev ? prev.id : uid(), code: r[0], strand: r[1], hours: r[2] }); (after[tKeys[i]] || []).forEach(x => seq.push(x)); });
  const ids = new Set(seq.map(r => r.id)), pins = kaPins(k, seq, cal());
  (C.groups || []).forEach(G => {
    ["adj", "pin"].forEach(f => { G[f] = G[f] || {}; Object.keys(G[f]).forEach(id => { if (!ids.has(id)) delete G[f][id]; }); });
    Object.entries(pins).forEach(([id, d]) => { if (fresh.has(id) && !G.pin[id]) G.pin[id] = d; });
  });
  (C.checks || []).forEach(x => { if (x.row && !ids.has(x.row)) delete x.row; });
  C.seq = seq; C.mode = c.mode;
  C.tpl = Object.assign(tplStamp(k), { atoms: tplOf(k, C).atoms });
}
/* Beim Laden: neue Vorlage still übernehmen, wenn die eigene Sequenz nicht abweicht. true = übernommen. */
function syncTemplate(k, C) {
  if (!tplNewer(k, C) || seqOwn(k, C)) return false;
  adoptTemplate(k, C); return true;
}
/* Eigene Atome: Prüfsumme der Vorlage merken, auf der sie beruhen (alte Daten ohne Merker: Lehrplan-Stand). */
function stampAtoms(k, C, legacy) {
  const t = tplOf(k, C), own = C.atoms || {};
  Object.keys(own).forEach(code => { if (!t.atoms[code] && D.classes[k].units[code]) t.atoms[code] = legacy ? LP[k].atoms[code] || tplAtomHash(k, code) : tplAtomHash(k, code); });
  Object.keys(t.atoms).forEach(code => { if (!own[code]) delete t.atoms[code]; });
}
/* Die Fachschaft hat die Atome einer Einheit geändert, für die du eigene Atome hast. */
function atomsNewer(k, code) { k = ck(k); const C = S.cls[k], h = tplOf(k, C).atoms[code]; return !!(C.atoms[code] && h && h !== tplAtomHash(k, code)); }
/* Eigene Leistungsnachweise, deren Kürzel inzwischen die Vorlage verwendet, bekommen ein freies Kürzel. */
function fixLnCodes(k, C) {
  Object.keys(C.ln || {}).forEach(code => {
    if (!D.classes[k].units[code]) return;
    const pre = code.replace(/\d+$/, "") || "LN", used = new Set(D.classes[k].unitOrder.concat(Object.keys(C.ln)));
    let n = 1; while (used.has(pre + n)) n++;
    const nc = pre + n;
    C.ln[nc] = C.ln[code]; delete C.ln[code];
    if (C.atoms[code]) { C.atoms[nc] = C.atoms[code]; delete C.atoms[code]; }
    C.seq.forEach(r => { if (r.code === code) r.code = nc; });
    (C.checks || []).forEach(x => { if (x.code === code) x.code = nc; });
  });
}
/* Unterschiede der eigenen Sequenz zur Vorlage in Stichworten (ohne Leistungsnachweise). */
function tplDiff(k, C) {
  const c = D.classes[k], mine = C.seq.filter(r => isCore(k, r.code)).map(r => [r.code, +r.hours || 0]), theirs = c.seq.filter(r => isCore(k, r[0])).map(r => [r[0], r[2]]);
  const out = [], mc = new Set(mine.map(r => r[0])), tc = new Set(theirs.map(r => r[0]));
  const sum = arr => arr.reduce((m, [code, h]) => { m[code] = (m[code] || 0) + h; return m; }, {}), hm = sum(mine), ht = sum(theirs);
  if (C.mode !== c.mode) out.push(`Modus der Vorlage: ${c.mode === "nacheinander" ? "nacheinander" : "in Strängen"}`);
  const add = [...tc].filter(x => !mc.has(x)), del = [...mc].filter(x => !tc.has(x));
  if (add.length) out.push("nur in der Vorlage: " + add.join(", "));
  if (del.length) out.push("nur bei dir: " + del.join(", "));
  const ch = [...tc].filter(x => mc.has(x) && hm[x] !== ht[x]).map(x => `${x === "P" ? "Puffer" : x} ${hm[x]} → ${ht[x]}`);
  if (ch.length) out.push("Stunden (deine → Vorlage): " + ch.slice(0, 8).join(", ") + (ch.length > 8 ? " …" : ""));
  const order = arr => arr.map(r => r[0]).filter(x => x !== "P" && mc.has(x) && tc.has(x)).join();
  if (order(mine) !== order(theirs)) out.push("andere Reihenfolge");
  return out;
}
/* Fachschaftsvorlage einer Klasse aus der eigenen Planung: nur Sequenz, Modus, Atome und Leistungsnachweis-Einheiten,
   keine persönlichen Daten (Stundenplan, Termine, Ausfälle, Häkchen, Lernstand). */
function templateExport(k) {
  const C = S.cls[k], c = D.classes[k], own = C.ln || {}, atoms = {}, ln = {};
  C.seq.forEach(r => {
    const u = own[r.code] || (c.units[r.code] && c.units[r.code].tpl ? c.units[r.code] : null);
    if (u && !ln[r.code]) ln[r.code] = { kind: u.kind || "ka", title: u.title, stunden: u.stunden.slice(), main: u.main ?? null };
  });
  unitOrderOf(k).forEach(code => {
    if (!ln[code] && (!c.units[code] || c.units[code].tpl)) return;
    const list = atomsOf(k, code).map(a => { const x = {}; ["id", "l", "t", "q", "a", "q2", "a2", "q3", "a3", "g"].forEach(f => { if (a[f] !== undefined) x[f] = a[f]; }); return x; });
    if (ln[code] ? list.length : atomHash(list) !== LP[k].atoms[code]) atoms[code] = list;
  });
  return { app: "matheplaner-vorlage", v: 1, id: k, label: fullLabel(k), exported: todayIso(), mode: C.mode, seq: seqArr(C.seq), atoms, ln };
}
let adoptedNote = new Set(), adoptedTimer = null;
function noteAdopted(k) {
  adoptedNote.add(k); clearTimeout(adoptedTimer);
  adoptedTimer = setTimeout(() => {
    const l = [...adoptedNote].filter(x => S.cls[x]).map(x => fullLabel(x)).join(", "); adoptedNote.clear();
    if (l) toast(`Neue Fachschaftsvorlage übernommen: ${l}. Deine Stundenpläne, Termine und Abweichungen bleiben.`);
  }, 300);
}
/* Parallelklassen (höchstens 2): Sequenz, Modus und Atome teilen sie sich; jede Gruppe hat eigenen Stundenplan,
   eigene Ausfälle, Häkchen, Lernstand und Abweichungen von der Sequenz (adj: Zeilen-ID -> zusätzliche Stunden). */
const GIDS = ["a", "b"];
function newGroup(id, name, tt) { return { id, name: name || "", tt: tt || [], off: [], cancelled: {}, done: {}, adj: {}, pin: {} }; }
const ck = g => String(g).split(".")[0];
const gidOf = g => String(g).split(".")[1] || "a";
const gkey = (k, gid) => `${k}.${gid || "a"}`;
function grp(g) { const C = S.cls[ck(g)]; return C.groups.find(x => x.id === gidOf(g)) || C.groups[0]; }
const groupsOf = k => S.cls[k].groups.map(x => gkey(k, x.id));
/* Alte Stundenpläne (Zeilen mit eigenem ab/bis) in Versionen „gültig ab“ umwandeln. */
function ttFromLegacy(rows, start) {
  const pts = new Set([start]);
  rows.forEach(r => { if (r.frm) pts.add(r.frm); if (r.to) pts.add(addDays(r.to, 1)); });
  const sig = ls => ls.map(l => `${l.day}|${l.period}|${l.track}`).join(",");
  const out = [];
  [...pts].filter(Boolean).sort().forEach(p => {
    const ls = rows.filter(r => (!r.frm || r.frm <= p) && (!r.to || r.to >= p)).map(r => ({ id: r.id || uid(), day: +r.day, period: +r.period, track: r.track }));
    const prev = out[out.length - 1];
    if (prev && sig(prev.lessons) === sig(ls)) return;
    out.push({ id: uid(), frm: p, lessons: ls });
  });
  return out;
}
const defaultEngine = () => ({ cards: {}, log: [] });
const S = { settings: defaultSettings(), cls: {}, eng: {} };
const UI = { date: todayIso(), cls: CLASSES[0], type: D.classes[CLASSES[0]].type, year: null, todayAll: false, reveal: {}, editAtom: null, confirm: null, quiz: null, solOpen: false, engFilter: "intro", busy: false, planView: "weeks", planSel: null, planLn: null, planAdd: false, planMore: false };
try {
  const v = localStorage.getItem("mp-cls"); if (v && CLASSES.includes(v)) UI.cls = v;
  const t = localStorage.getItem("mp-type"); UI.type = t && TYPES[t] ? t : D.classes[UI.cls].type;
  UI.todayAll = localStorage.getItem("mp-today") === "all"; if (localStorage.getItem("mp-planview") === "list") UI.planView = "list"; } catch (e) {}
function pickYear() {
  const ys = S.settings.years; let id = null;
  try { id = localStorage.getItem("mp-year"); } catch (e) {}
  if (ys.some(y => y.id === id)) return id;
  const t = yearIdOf(todayIso()); if (ys.some(y => y.id === t)) return t;
  return ys[ys.length - 1].id;
}
function cal() { return S.settings.years.find(y => y.id === UI.year) || S.settings.years[0]; }
UI.year = pickYear();
const resetYearState = () => CLASSES.forEach(k => { S.cls[k] = defaultClass(k); GIDS.forEach(gid => { S.eng[gkey(k, gid)] = defaultEngine(); }); });
resetYearState();
/* Gewählte Klasse, sofern sie zur gewählten Schulart gehört; sonst null (z. B. Oberschule ohne Lehrplan). */
/* Ohne Festlegung gelten die Klassen mit ausgearbeitetem Plan (D.defaultMine) als „meine“. */
const mineList = () => { const l = Array.isArray(cal().classes) ? cal().classes : (D.defaultMine || CLASSES); return CLASSES.filter(k => l.includes(k)); };
const isMine = k => mineList().includes(k);
/* Gewählte Klasse, sofern sie zur gewählten Schulart gehört und zu „Meine Klassen“; sonst null. */
const curClass = () => D.classes[UI.cls] && D.classes[UI.cls].type === UI.type && isMine(UI.cls) ? UI.cls : null;
/* Nach Änderungen an „Meine Klassen“ oder Schuljahr eine gültige Auswahl herstellen. */
function fixSelection() {
  if (curClass()) return;
  const m = mineList(), k = m.find(c => D.classes[c].type === UI.type) || m[0];
  if (k) { UI.cls = k; UI.type = D.classes[k].type; }
}
UI.gid = {};
try { UI.gid = JSON.parse(localStorage.getItem("mp-gid") || "{}") || {}; } catch (e) {}
/* Gewählte Parallelklasse als Schlüssel "kl8.a"; null, wenn keine Klasse gewählt ist. */
function curG() { const k = curClass(); if (!k) return null; const id = UI.gid[k]; return gkey(k, S.cls[k].groups.some(x => x.id === id) ? id : S.cls[k].groups[0].id); }
const hasLessons = g => (grp(g).tt || []).some(v => v.lessons && v.lessons.length);
const myGroups = () => mineList().flatMap(groupsOf);
const groupName = g => { const G = grp(g), C = S.cls[ck(g)]; return G.name || (C.groups.length > 1 ? `${D.classes[ck(g)].label} ${G.id}` : D.classes[ck(g)].label); };
const fullLabel = g => `${(TYPES[D.classes[ck(g)].type] || {}).short || ""} · ${groupName(g.includes(".") ? g : gkey(g, "a"))}`;

let ver = 0; const cache = {};
const touch = () => { ver++; };

const unitOf = (k, code) => {
  const C = S.cls[ck(k)] || {}, u = D.classes[ck(k)].units[code] || (C.ln || {})[code];
  const d = u && u.lb === "test" && (C.lnDur || {})[code];
  return d ? lnWithDur(u, d) : u;
};
/* Leistungsnachweis mit eingestellter Dauer: 45 min = eine Arbeitsstunde, 90 min = zwei; Wiederholung davor und Rückgabe
   danach bleiben. Ergebnis wird je Einheit und Dauer zwischengespeichert. */
const isArbeit = t => !/wiederholung|rückgabe|berichtigung/i.test(t || "");
const lnDurCache = new Map();
function lnWithDur(u, d) {
  const key = u, hit = lnDurCache.get(key); if (hit && hit.d === d && hit.src === u.stunden) return hit.u;
  const st = u.stunden || [], first = st.findIndex(isArbeit), lastA = st.length - 1 - st.slice().reverse().findIndex(isArbeit);
  if (first < 0) return u;
  const pre = st.slice(0, first), post = st.slice(lastA + 1), n = Math.max(1, Math.round(d / 45));
  const t = String(st[first]).replace(/\s*\(\d+\. Stunde\)$/, "");
  const x = Object.assign({}, u, { stunden: pre.concat(n > 1 ? Array.from({ length: n }, (_, i) => `${t} (${i + 1}. Stunde)`) : [t], post), main: pre.length, dur: d });
  lnDurCache.set(key, { d, src: u.stunden, u: x });
  return x;
}
const lnDurOf = (k, code) => { const C = S.cls[ck(k)] || {}, u = unitOf(k, code); if (!u) return 45; return (C.lnDur || {})[code] || Math.min(90, 45 * Math.max(1, (u.stunden || []).filter(isArbeit).length)); };
/* Rückgabe-Stunde eines Leistungsnachweises (Planung: frühestens am Tag nach der Arbeit). */
const isRueck = (k, L) => { const u = unitOf(k, L.row.code); return !!(u && u.lb === "test" && /rückgabe|berichtigung/i.test((u.stunden || [])[L.n - 1] || "")); };
/* Dauer eines Leistungsnachweises ändern; die Sequenzzeilen wachsen bzw. schrumpfen um die Arbeitsstunden. */
function setLnDur(k, code, d) {
  const C = S.cls[k], before = (unitOf(k, code).stunden || []).filter(isArbeit).length, snap = snapshotFor(k);
  C.lnDur = C.lnDur || {}; C.lnDur[code] = d;
  const after = (unitOf(k, code).stunden || []).filter(isArbeit).length, delta = after - before;
  C.seq.forEach(r => { if (r.code === code) r.hours = Math.max(0, (+r.hours || 0) + delta); });
  undoStack = snap; commit(k);
  toast(`${titleOf(k, code)}: ${d} min${delta ? `, ${delta > 0 ? "eine Stunde mehr" : "eine Stunde weniger"} in der Sequenz` : ""}.`, true);
}
const CHECK_DUR = [20, 30];
/* Minuten, die Kontrollen in einer Stunde belegen, und Summe je Einheit */
const checkMin = x => +x.dur || 20;
/* Einheiten der Vorlage und selbst angelegte Leistungsnachweise (S.cls[k].ln); die eigenen stehen hinten, damit die
   Adressen #u-<Klasse>-<Index> der Vorlage gleich bleiben. */
const unitOrderOf = k => D.classes[ck(k)].unitOrder.concat(Object.keys((S.cls[ck(k)] || {}).ln || {}));
const lbOf = (k, code) => (unitOf(k, code) || {}).lb || "P";
const LV_FIELDS = ["q2", "a2", "q3", "a3"];
function atomsOf(k, code) {
  const base = (unitOf(k, code) || {}).atoms || [], own = S.cls[ck(k)].atoms[code];
  if (!own) return base;
  return own.map(a => {
    const t = base.find(b => b.id === a.id); if (!t || (a.q2 !== undefined && a.g !== undefined)) return a;
    const x = Object.assign({}, a);
    if (a.q2 === undefined) LV_FIELDS.forEach(f => { x[f] = t[f]; });
    // Generator aus der Vorlage, solange das gespeicherte Atom noch keine eigene Wahl hat (g: "" = feste Fragen).
    if (a.g === undefined && t.g) x.g = t.g;
    return x;
  });
}
function atomMap(k) {
  k = ck(k);
  const key = "am" + k;
  if (cache[key] && cache[key].ver === ver) return cache[key].m;
  const m = {};
  for (const code of unitOrderOf(k)) for (const a of atomsOf(k, code)) m[a.id] = Object.assign({ code }, a);
  cache[key] = { ver, m }; return m;
}
const titleOf = (k, code) => code === "P" ? "Puffer · Wiederholung" : code === "JA" ? "Jahresabschluss" : (unitOf(k, code) || {}).title || code;

/* ---------------- scheduling ---------------- */
/* Letzter Unterrichtstag einer Klasse im Schuljahr: eigener Wert (leer = Schuljahresende) oder Vorschlag aus der Regel
   der Klasse (GYM 12 vor den Osterferien, OS 10 vor den Pfingstferien). */
function ruleLastDay(k, Y) {
  const pat = { ostern: /oster/i, pfingsten: /pfingst/i }[D.classes[k].endRule];
  const h = pat && (Y.holidays || []).filter(x => x.frm && pat.test(x.name || "")).sort((a, b) => a.frm < b.frm ? -1 : 1)[0];
  return h ? addDays(h.frm, -1) : null;
}
function lastDayOf(k) {
  const C = S.cls[k], Y = cal();
  if (C && typeof C.lastDay === "string") return C.lastDay || null;
  return ruleLastDay(k, Y);
}
function schedule(g) {
  if (cache[g] && cache[g].ver === ver) return cache[g];
  const k = ck(g), Y = cal(), C = S.cls[k], G = grp(g), seqMode = C.mode === "nacheinander";
  const free = {}; (Y.free || []).forEach(f => { if (f.date) free[f.date] = f.name || "unterrichtsfrei"; });
  const holidayOf = d => { for (const h of Y.holidays || []) if (h.frm && h.to && h.frm <= d && d <= h.to) return h.name || "Ferien"; return null; };
  const offOf = d => { for (const o of G.off || []) if (o.frm && o.to && o.frm <= d && d <= o.to) return o.name || "Kein Unterricht in dieser Klasse"; return null; };
  const tts = sortTT((G.tt || []).filter(v => v.frm).slice()), endD = lastDayOf(k);
  const lessonsOn = d => { let cur = null; for (const v of tts) { if (v.frm <= d) cur = v; else break; } return cur ? cur.lessons : []; };
  const slots = [], dayInfo = {};
  if (Y.start && Y.end && Y.start <= Y.end) {
    for (let d = Y.start; d <= Y.end; d = addDays(d, 1)) {
      const w = dow(d); if (w > 5) continue;
      const h = holidayOf(d), f = free[d], o = h || f ? null : offOf(d);
      if (h || f) { dayInfo[d] = { school: false, note: h || f }; continue; }
      if (endD && d > endD) { dayInfo[d] = { school: false, note: "nach dem letzten Unterrichtstag", off: true }; continue; }
      if (o) { dayInfo[d] = { school: false, note: o, off: true }; continue; }
      dayInfo[d] = { school: true };
      const seen = new Set();
      for (const t of lessonsOn(d)) {
        if (+t.day !== w) continue;
        const track = t.track === "SOL" ? "SOL" : (seqMode ? "A" : (t.track === "B" ? "B" : "A"));
        for (let n = 0; n < lessonLen(t); n++) {
          const period = +t.period + n, key = d + "|" + period;
          if (seen.has(key)) continue; seen.add(key);
          slots.push({ date: d, period, track, key, cancelled: !!G.cancelled[key], lesson: null });
        }
      }
    }
  }
  slots.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.period - b.period);
  /* Zuteilung der Stunden; extra: zusätzliche Stunden je Zeile (von 30-min-Kontrollen belegte Stunden) */
  const assign = extra => {
  slots.forEach(s => { s.lesson = null; });
  let lastTrack = "A";
  const isLnCode = code => (unitOf(k, code) || {}).lb === "test";
  const rows = C.seq.map((r, i) => Object.assign({}, r, { base: r.hours, adj: (G.adj || {})[r.id] || 0, extra: extra[r.id] || 0, hours: Math.max(0, r.hours + ((G.adj || {})[r.id] || 0) + (extra[r.id] || 0)), idx: i, track: seqMode ? "A" : isLnCode(r.code) ? lastTrack : (lastTrack = r.strand === "B" ? "B" : "A"), start: null, end: null, overflow: 0, slots: [] }));
  const tracks = { A: [], B: [] };
  rows.forEach(r => { for (let n = 1; n <= r.hours; n++) tracks[r.track].push({ row: r, n }); });
  const cap = { A: 0, B: 0, SOL: 0 }, planned = { A: tracks.A.length, B: tracks.B.length };
  /* Fest terminierte Leistungsnachweise (G.pin: Zeilen-ID -> Datum) belegen zuerst ihre Stunden: die Hauptstunde am
     Termin (oder in der nächsten Stunde danach), Wiederholung davor, Rückgabe danach. Alle anderen Stunden füllen die
     übrigen Plätze in der Reihenfolge der Sequenz, eine Einheit läuft also um den Termin herum weiter. */
  const pin = G.pin || {};
  const put = (L, s) => { s.lesson = L; L.row.slots.push(s); if (!L.row.start) L.row.start = s.date; L.row.end = s.date; };
  /* Fest terminierte Leistungsnachweise gehören zu keinem Strang: Sie belegen am Termin die erste Mathestunde des Tages
     (aus Strang A oder B, nie FIL), Wiederholung direkt davor, Rückgabe frühestens an einem späteren Tag. Die Einheiten
     des Strangs, dessen Stunde belegt ist, laufen darum herum. */
  const all = slots.filter(s => s.track !== "SOL" && !s.cancelled), usedS = new Set();
  rows.filter(r => pin[r.id] && r.hours > 0).sort((a, b) => pin[a.id] < pin[b.id] ? -1 : 1).forEach(r => {
    const Ls = tracks[r.track].filter(L => L.row === r), p = all.findIndex(s => s.date >= pin[r.id]);
    r.pinned = pin[r.id];
    if (p < 0) { r.overflow += Ls.length; return; }
    let st = Math.max(0, p - lnMain(k, r.code, r.hours));
    while (Ls.some((_, i) => usedS.has(all[st + i]))) st++;
    let idx = st - 1, lastDate = null;
    Ls.forEach(L => {
      idx++;
      if (isRueck(k, L) && lastDate) while (idx < all.length && (usedS.has(all[idx]) || all[idx].date <= lastDate)) idx++;
      while (idx < all.length && usedS.has(all[idx])) idx++;
      const s = all[idx]; if (!s) { r.overflow++; return; } usedS.add(s); put(L, s); lastDate = s.date;
    });
  });
  for (const tr of ["A", "B"]) {
    const ts = slots.filter(s => s.track === tr && !s.cancelled), used = ts.map(s => usedS.has(s)); cap[tr] = ts.length;
    let j = 0;
    tracks[tr].forEach(L => {
      if (L.row.pinned) return;
      while (j < ts.length && used[j]) j++;
      const prev = L.row.slots[L.row.slots.length - 1];
      if (isRueck(k, L) && prev && ts[j] && ts[j].date <= prev.date) {
        // freie Stunde am selben Tag bekommt der nachfolgende Stoff; die Rückgabe rückt auf den nächsten Tag
        let q = j; while (q < ts.length && (used[q] || ts[q].date <= prev.date)) q++;
        if (!ts[q]) { L.row.overflow++; return; }
        used[q] = true; put(L, ts[q]); return;
      }
      const s = ts[j]; if (!s) { L.row.overflow++; return; }
      j++; put(L, s);
    });
  }
  // Geplante Stunden je Strang: fest terminierte Leistungsnachweise zählen dort, wo sie tatsächlich liegen
  planned.A = 0; planned.B = 0;
  rows.forEach(r => { if (r.pinned) { r.slots.forEach(s => { planned[s.track] = (planned[s.track] || 0) + 1; }); planned[r.track] += r.overflow; } else planned[r.track] += r.hours; });
  return { rows, cap, planned };
  };
  /* Kontrollen in einer Stunde: Lage bestimmen (mit Datum: erste Mathestunde ab dem Tag; sonst Einheit/Stunde).
     Eine Stunde mit mindestens 30 min Kontrollen ist belegt: keine neuen Atome, die Einheit bekommt eine Stunde dazu.
     Mit mindestens 20 min wird dort höchstens ein Atom eingeführt. */
  const checks = C.checks || [];
  const resolve = rows => { const out = {}; checks.forEach(x => {
    if (x.date) { const s = slots.find(y => y.date >= x.date && y.lesson && !y.cancelled && y.track !== "SOL"); out[x.id] = s ? { code: s.lesson.row.code, n: s.lesson.n, rowId: s.lesson.row.id, slot: s } : { code: null, n: 0, rowId: null, slot: null }; return; }
    const r = (x.row && rows.find(y => y.id === x.row)) || rows.find(y => y.code === x.code);
    out[x.id] = { code: x.code, n: x.n, rowId: r ? r.id : x.row || null, slot: r ? r.slots[Math.min(x.n, r.hours) - 1] || null : null };
  }); return out; };
  const minutesAt = chk => { const m = {}; checks.forEach(x => { const p = chk[x.id]; if (p && p.rowId && p.n) { const key = p.rowId + "|" + p.n; m[key] = (m[key] || 0) + checkMin(x); } }); return m; };
  let res = assign({}), chk = resolve(res.rows);
  const extra = {}; Object.entries(minutesAt(chk)).forEach(([key, m]) => { if (m >= 30) { const id = key.split("|")[0]; extra[id] = (extra[id] || 0) + 1; } });
  if (Object.keys(extra).length) { res = assign(extra); chk = resolve(res.rows); }
  const { rows, cap, planned } = res;
  const mins = minutesAt(chk);
  rows.forEach(r => {
    const blocked = {}; Object.entries(mins).forEach(([key, m]) => { const [id, n] = key.split("|"); if (id === r.id && (m >= 20)) blocked[+n] = m >= 30 ? 0 : 1; });
    if (Object.keys(blocked).length && unitOf(k, r.code)) { r.blocked = blocked; r.atomN = atomPlan(atomsOf(k, r.code), r.hours, blocked); }
  });
  cap.SOL = slots.filter(s => s.track === "SOL" && !s.cancelled).length;
  let solN = 0; slots.forEach(s => { if (s.track === "SOL" && !s.cancelled) s.solIdx = solN++; });
  const intro = {};
  rows.forEach(r => {
    if (!unitOf(k, r.code)) return;
    atomsOf(k, r.code).forEach(a => { const n = atomLesson(r, a); const s = r.slots[n - 1]; if (s && !intro[a.id]) intro[a.id] = { date: s.date, code: r.code }; });
  });
  const byDate = {}; slots.forEach(s => { (byDate[s.date] || (byDate[s.date] = [])).push(s); });
  return (cache[g] = { ver, slots, rows, cap, planned, intro, byDate, dayInfo, seqMode, chk });
}
/* Atome auf die Stunden einer Zeile verteilen, wenn Kontrollen Stunden belegen. blocked: Stunde -> höchstens so viele neue
   Atome (0 bei 30 min, 1 bei 20 min). Wegen der zusätzlichen Stunde rücken Atome ab einer belegten Stunde um eine Stunde
   weiter; was über die Grenze geht, kommt in die nächste Stunde (in der letzten Stunde alles Übrige). */
function atomPlan(atoms, hours, blocked) {
  const full = Object.keys(blocked).map(Number).filter(n => blocked[n] === 0).sort((a, b) => a - b), out = {};
  const target = a => { let t = a.l; full.forEach(m => { if (t >= m) t++; }); return Math.max(1, Math.min(hours, t)); };
  const by = {}; atoms.slice().sort((a, b) => a.l - b.l).forEach(a => { (by[target(a)] = by[target(a)] || []).push(a); });
  let carry = [];
  for (let n = 1; n <= hours; n++) {
    const list = carry.concat(by[n] || []), capN = blocked[n] ?? Infinity, take = n === hours ? list : list.slice(0, capN);
    take.forEach(a => { out[a.id] = n; }); carry = list.slice(take.length);
  }
  return out;
}
const atomLesson = (r, a) => r.atomN && r.atomN[a.id] ? r.atomN[a.id] : Math.min(a.l, r.hours);
function lessonInfo(k, L) {
  const r = L.row, u = unitOf(k, r.code), st = u ? u.stunden : [];
  let title;
  if (r.code === "P") title = "Puffer: Wiederholung, Nacharbeit oder Übung";
  else if (r.code === "JA") title = "Jahresabschluss: Rückblick und Knobelaufgaben";
  else if (!st.length) title = titleOf(k, r.code);
  else if (L.n <= st.length) title = (L.n === r.hours && r.hours < st.length) ? st.slice(L.n - 1).join(" · ") : st[L.n - 1];
  else title = "Übung und Vertiefung (zusätzliche Stunde)";
  const atoms = u ? atomsOf(k, r.code).filter(a => atomLesson(r, a) === L.n) : [];
  return { title, atoms };
}
function lbHours(k) {
  const sc = schedule(k), h = {};
  sc.rows.forEach(r => { const lb = lbOf(k, r.code); h[lb] = (h[lb] || 0) + r.hours; });
  return h;
}

/* ---------------- FSRS (v4.5 Standardparameter) ---------------- */
const W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755];
const FACTOR = 19 / 81, DECAY = -0.5;
const clampD = d => Math.min(10, Math.max(1, d));
const Rof = (t, s) => Math.pow(1 + FACTOR * t / s, DECAY);
const ivl = (s, r) => Math.min(365, Math.max(1, Math.round(s / FACTOR * (Math.pow(r, 1 / DECAY) - 1))));
function fsrsReview(card, g, date, r) {
  if (!card || !card.reps) {
    const s = Math.max(W[g - 1], 0.1), d = clampD(W[4] - (g - 3) * W[5]);
    return { s, d, reps: 1, lapses: g === 1 ? 1 : 0, last: date, due: addDays(date, ivl(s, r)) };
  }
  const t = Math.max(0, diffDays(card.last, date)), R = Rof(t, card.s);
  let s;
  if (g === 1) s = Math.min(card.s, W[11] * Math.pow(card.d, -W[12]) * (Math.pow(card.s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - R)));
  else s = card.s * (1 + Math.exp(W[8]) * (11 - card.d) * Math.pow(card.s, -W[9]) * (Math.exp(W[10] * (1 - R)) - 1) * (g === 2 ? W[15] : 1) * (g === 4 ? W[16] : 1));
  s = Math.max(0.1, s);
  const d = clampD(W[7] * W[4] + (1 - W[7]) * (card.d - W[6] * (g - 3)));
  return { s, d, reps: card.reps + 1, lapses: (card.lapses || 0) + (g === 1 ? 1 : 0), last: date, due: addDays(date, ivl(s, r)) };
}
function engineState(g, date) {
  const sc = schedule(g), E = S.eng[g], am = atomMap(g), list = [];
  const start = cal().engineStart || cal().start || "0000-00-00";
  for (const id in sc.intro) {
    const a = am[id]; if (!a) continue;
    const info = sc.intro[id], c = E.cards[id];
    if (!c && info.date >= date) continue;
    if (!c && info.date < start) list.push({ a, code: info.code, intro: info.date, card: null, isNew: false, backlog: true, R: null, due: start });
    else if (!c) list.push({ a, code: info.code, intro: info.date, card: null, isNew: true, R: null, due: addDays(info.date, 1) });
    else list.push({ a, code: info.code, intro: info.date, card: c, isNew: false, R: Rof(Math.max(0, diffDays(c.last, date)), c.s), due: c.due });
  }
  for (const id in E.cards) if (!sc.intro[id] && am[id]) { const c = E.cards[id]; list.push({ a: am[id], code: am[id].code, intro: null, card: c, isNew: false, R: Rof(Math.max(0, diffDays(c.last, date)), c.s), due: c.due }); }
  const dueNew = list.filter(x => x.isNew).sort((x, y) => x.intro < y.intro ? -1 : 1);
  const dueRev = list.filter(x => !x.isNew && !x.backlog && x.due <= date).sort((x, y) => x.R - y.R);
  const back = list.filter(x => x.backlog).sort((x, y) => x.intro < y.intro ? -1 : 1);
  const N = S.settings.perLesson, pick = [];
  const half = Math.ceil(N / 2);
  pick.push(...dueNew.slice(0, half));
  const room = back.length ? Math.max(0, N - pick.length - 1) : N - pick.length;
  pick.push(...dueRev.slice(0, room));
  if (pick.length < N) pick.push(...dueNew.slice(half, half + N - pick.length));
  if (pick.length < N) pick.push(...back.slice(0, N - pick.length));
  return { list, dueCount: dueNew.length + dueRev.length, backCount: back.length, pick };
}

/* Schwierigkeitsstufe der Wiederholung nach FSRS-Stabilität: unsicher -> Grundaufgabe, stabil -> anspruchsvoller.
   Zuletzt „Nochmal“ oder geringer Abruf heute stuft eine Stufe zurück. */
const LEVELS = { 1: ["Stufe 1", "Abrufen"], 2: ["Stufe 2", "Anwenden"], 3: ["Stufe 3", "Vernetzen"] };
const LV_S2 = 7, LV_S3 = 30;
function levelOf(x) {
  const c = x.card; if (!c || !c.reps) return 1;
  let l = c.s >= LV_S3 ? 3 : c.s >= LV_S2 ? 2 : 1;
  if (c.lastG === 1) l = 1; else if (x.R !== null && x.R !== undefined && x.R < 0.75) l = Math.max(1, l - 1);
  return l;
}
function taskOf(a, lvl) {
  if (hasGen(a)) return { l: lvl, gen: true };
  for (let l = lvl; l >= 2; l--) if (a["q" + l]) return { l, q: a["q" + l], a: a["a" + l] || "" };
  return { l: 1, q: a.q, a: a.a };
}

/* ---------------- Aufgabengeneratoren (Anemo) ----------------
   Atome mit Feld g (Generator-ID oder Liste) bekommen bei jeder Wiederholung eine neu erzeugte Aufgabe statt der festen
   Fragen. Die Stufe der Wiederholung wählt die Schwierigkeit im Generator. Eine erzeugte Aufgabe bleibt für Klasse, Atom,
   Stufe und Tag stehen, bis „Neue Aufgabe“ gedrückt wird. Ohne generators.js gelten die festen Fragen. */
const GEN_STAGE = { 1: 0, 2: 1, 3: 3 };
const genIds = a => (a && a.g ? [].concat(a.g) : []).filter(id => window.ANEMO && window.ANEMO.hasGenerator(id));
const hasGen = a => genIds(a).length > 0;
const genLabel = id => (window.ANEMO && window.ANEMO.labels[id]) || id;
const genCache = new Map(), genSeq = {};
function genTask(k, a, l) {
  const ids = genIds(a); if (!ids.length) return null;
  const sk = k + "|" + a.id, key = [sk, l, UI.date, genSeq[sk] || 0].join("|");
  if (genCache.has(key)) return genCache.get(key);
  let t = null;
  for (let i = 0; i < 12 && !t; i++) {
    try {
      const x = window.ANEMO.generateTask(ids[Math.floor(Math.random() * ids.length)], GEN_STAGE[l] ?? 0);
      // Aufgaben, die nur mit einer Eingabe am Zahlenstrahl funktionieren, lassen sich nicht projizieren.
      if (x && x.prompt && !(x.inputData && x.inputData.totalSections)) t = x;
    } catch (e) {}
  }
  if (genCache.size > 500) genCache.clear();
  genCache.set(key, t);
  return t;
}
/* Aufgabe, wie sie angezeigt wird: erzeugt (gen) oder fest (q/a). */
function shownTask(k, a, lvl) {
  const t = taskOf(a, lvl);
  if (!t.gen) return t;
  const g = genTask(k, a, t.l);
  if (g) return Object.assign(t, { g });
  const f = taskOf(Object.assign({}, a, { g: null }), lvl);
  return f;
}
/* Text mit LaTeX in \( … \) (Schreibweise der Generatoren) als HTML; die Formeln setzt typesetMath(). */
function gx(s) {
  s = String(s ?? ""); const re = /\\\(([\s\S]+?)\\\)/g; let out = "", i = 0, m;
  // Text außerhalb von \( … \) läuft durch die Formelerkennung mx(); Bindestrich vor Zahlen wird zum Minuszeichen.
  const txt = x => x.split("\n").map(l => mx(l.replace(/(^|[\s(=+·:|;,])-(?=[\d(])/g, "$1−"))).join("<br>");
  while ((m = re.exec(s))) { out += txt(s.slice(i, m.index)) + `<span class="m" data-tex="${esc(m[1])}">${esc(m[1])}</span>`; i = re.lastIndex; }
  return out + txt(s.slice(i));
}
const fracTex = s => { const m = /^(-?)(\d+)\/(\d+)$/.exec(String(s)); return m ? `${m[1]}\\frac{${m[2]}}{${m[3]}}` : String(s); };
function genAnswer(t) {
  const ca = String(t.correctAnswer), d = t.inputData || {};
  if (d.type === "fraction_part") return `\\(${d.missing === "numerator" ? `\\frac{${ca}}{${d.knownDen}}` : `\\frac{${d.knownNum}}{${ca}}`}\\)`;
  if (d.type === "mixed_part") return `\\(${d.missing === "whole" ? `${ca}\\frac{${d.numerator}}{${d.denominator}}` : ca.includes("/") ? d.whole + fracTex(ca) : `${d.whole}\\frac{${ca}}{${d.denominator}}`}\\)`;
  if (t.answerType === "fraction") return `\\(${fracTex(ca)}\\)`;
  if (t.answerType === "integer" || t.answerType === "number") return (t.tolerance ? "≈ " : "") + ca.replace(/^-/, "−").replace(".", ",");
  return ca;
}
function genQHtml(t, show) {
  return `${gx(t.prompt)}${t.svg ? `<div class="gsvg">${t.svg}</div>` : ""}${t.choices && t.choices.length ? `<div class="gchoices">${t.choices.map(c => `<span class="${show && String(c) === String(t.correctAnswer) ? "ok" : ""}">${gx(c)}</span>`).join("")}</div>` : ""}`;
}
function genAHtml(t) {
  const d = t.inputData || {};
  const steps = d.steps ? d.steps : d.subSteps ? d.subSteps.map(s => `${s.context ? s.context + "  ·  " : ""}${s.subPrompt} ${s.correctAnswer}`) : [];
  return `<div class="gans">${gx(genAnswer(t))}</div>${t.why ? `<div class="gwhy">${gx(t.why)}</div>` : ""}${steps.length ? `<ol class="gsteps">${steps.map(s => `<li>${gx(s)}</li>`).join("")}</ol>` : ""}`;
}
/* Frage und Lösung als HTML, egal ob erzeugt oder fest. */
const taskQHtml = (t, show) => t.g ? genQHtml(t.g, show) : mx(t.q);
const taskAHtml = t => t.g ? genAHtml(t.g) : mx(t.a);
const genBtn = (k, a, t) => t.g ? `<button type="button" class="linkbtn small" data-act="gnew" data-id="${esc(k + "|" + a.id)}" title="Generator: ${esc(genIds(a).map(genLabel).join(" / "))}">Neue Aufgabe</button>` : "";
const levelPill = l => `<span class="pill lv lv${l}" title="${esc(LEVELS[l][1])}">${esc(LEVELS[l][0])} · ${esc(LEVELS[l][1])}</span>`;

/* ---------------- persistence ---------------- */
/* Dokumente: planner/settings ist global. Klassen und Lernstand liegen je Schuljahr in jahr-<id>/…;
   das erste (aus der Zeit vor den Schuljahren übernommene) Jahr behält die alten Pfade planner/kl6 usw. */
/* Dokumentnamen: Klassen-ID für den Plan, "e:"+ID für den Lernstand. */
const engDoc = k => "e:" + k;
const isEngDoc = n => n.startsWith("e:");
const clsOfDoc = n => isEngDoc(n) ? n.slice(2) : n;
const YEAR_DOCS = CLASSES.flatMap(k => [k, ...GIDS.map(gid => engDoc(gkey(k, gid)))]);
const LEGACY_IDS = ["kl6", "kl8"];
function pathOf(name, y) {
  if (name === "settings") return "planner/settings";
  y = y || cal();
  const g = clsOfDoc(name), k = ck(g), eng = isEngDoc(name), sfx = eng && gidOf(g) !== "a" ? "-" + gidOf(g) : "";
  if (y.legacyDocs && LEGACY_IDS.includes(k)) return (eng ? "engine/" : "planner/") + k + sfx;
  return `jahr-${y.id}/${eng ? "engine-" : ""}${k}${sfx}`;
}
let db = null, dbState = "loading", yearGen = 0, yearUnsubs = [], local = false;
/* Ohne Claude-Datenbank (z. B. auf GitHub Pages) wird im Browser gespeichert. */
const LS = "mp-doc:";
function lsGet(path) { try { const v = localStorage.getItem(LS + path); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
function lsOk() { try { localStorage.setItem(LS + "probe", "1"); localStorage.removeItem(LS + "probe"); return true; } catch (e) { return false; } }
const dirty = {}, saving = {}, timers = {}, loaded = {};
function docBody(name) { return name === "settings" ? S.settings : isEngDoc(name) ? S.eng[clsOfDoc(name)] : S.cls[name]; }
function save(name) { dirty[name] = true; clearTimeout(timers[name]); const g = yearGen; timers[name] = setTimeout(() => { if (g === yearGen || name === "settings") flush(name); }, 700); }
async function flush(name) {
  if (!db && local) {
    const body = clone(docBody(name)); if (body.log && body.log.length > 600) body.log = body.log.slice(-600);
    try { localStorage.setItem(LS + pathOf(name), JSON.stringify(body)); dirty[name] = false; }
    catch (e) { setDbState("quota"); }
    return;
  }
  if (!db) return;
  const g = yearGen, again = ms => { timers[name] = setTimeout(() => { if (g === yearGen || name === "settings") flush(name); }, ms); };
  if (saving[name]) { again(500); return; }
  saving[name] = true;
  const path = pathOf(name), body = clone(docBody(name));
  if (body.log && body.log.length > 600) body.log = body.log.slice(-600);
  try { await db.doc(path).set(body); if (g === yearGen || name === "settings") dirty[name] = false; if (dbState === "err") setDbState("ok"); }
  catch (e) {
    if (e && e.code === "unavailable") again(1500 + Math.random() * 1000);
    else setDbState(e && e.code === "invalid_argument" ? "ro" : e && e.code === "quota_exceeded" ? "quota" : "err");
  } finally { saving[name] = false; }
}
function applyDoc(name, data) {
  if (!data || typeof data !== "object") return;
  if (name === "settings") {
    const o = Object.assign(defaultSettings(), data);
    if (!Array.isArray(data.years) || !data.years.length) {
      const c = Object.assign(clone(D.calendar), data.calendar || {});
      o.years = [{ id: yearIdOf(c.start), start: c.start, end: c.end, holidays: c.holidays || [], free: c.free || [], engineStart: data.engineStart || null, legacyDocs: true }];
    }
    /* Wiederholungen pro Stunde: Standard von 5 auf 10 angehoben (Merker pl10). Wer den alten Standard 5 hatte, bekommt einmal 10. */
    if (!data.pl10 && (data.perLesson === undefined || data.perLesson === 5)) o.perLesson = 10;
    o.pl10 = true;
    delete o.calendar; delete o.engineStart;
    o.years = sortYears(o.years.filter(y => y && y.id).map(y => addHaDays(Object.assign({ holidays: [], free: [], engineStart: null }, y))));
    S.settings = o;
  } else if (CLASSES.includes(name)) {
    if (!Array.isArray(data.seq)) return;
    const c = Object.assign(defaultClass(name), data);
    const legacy = !data.tpl || !Array.isArray(data.tpl.seq);
    if (legacy) c.tpl = { seq: LP[name].seq.map(r => r.slice()), mode: LP[name].mode, atoms: {} };
    if (isOldLehrplanSeq(name, data.seq)) { c.seq = defaultClass(name).seq; c.tpl = tplStamp(name); }
    if (!Array.isArray(data.tt) && !Array.isArray(data.groups)) c.tt = Array.isArray(data.timetable) ? ttFromLegacy(data.timetable, cal().start) : defaultClass(name).groups[0].tt;
    delete c.timetable;
    if (!Array.isArray(data.groups) || !data.groups.length) {
      const G = newGroup("a", "", c.tt); G.off = Array.isArray(c.off) ? c.off : []; G.cancelled = c.cancelled || {}; G.done = c.done || {};
      c.groups = [G];
    }
    ["tt", "off", "cancelled", "done"].forEach(f => { delete c[f]; });
    c.groups = c.groups.filter(G => G && GIDS.includes(G.id)).map(G => { const x = Object.assign(newGroup(G.id), G); sortTT(x.tt); return x; });
    if (!c.groups.length) c.groups = [newGroup("a", "", defaultClass(name).groups[0].tt)];
    if (!data.kaV) migrateKa(name, c);
    fixLnCodes(name, c);
    stampAtoms(name, c, legacy);
    const adopted = syncTemplate(name, c);
    S.cls[name] = c;
    if (adopted) { save(name); noteAdopted(name); }
  } else if (isEngDoc(name) && CLASSES.includes(ck(clsOfDoc(name)))) {
    S.eng[clsOfDoc(name)] = { cards: data.cards || {}, log: Array.isArray(data.log) ? data.log : [] };
  }
}
function setDbState(s) { dbState = s; renderBanner(); }
function checkLoaded() {
  if (dbState !== "loading" && dbState !== "slow") return;
  if (!loaded.settings || ![...subscribed].every(n => loaded[n])) return;
  clearTimeout(initDb.timer); setDbState("ok");
  if (!cal().engineStart) { cal().engineStart = todayIso(); save("settings"); touch(); render(); }
  maybeOnboard();
}
/* Assistent von selbst öffnen, solange im Schuljahr keine Klassen festgelegt sind (nicht während eines Quiz). */
function maybeOnboard() {
  if (UI.ob || UI.obDismissed || UI.quiz || S.settings.onboarded || Array.isArray(cal().classes)) return;
  obOpen(0);
}
/* Abonniert werden nur die Dokumente der eigenen Klassen und der gerade gewählten Klasse (bei 19 Klassen sonst 57 Dokumente). */
let subscribed = new Set();
const wantedDocs = () => [...new Set([...mineList(), UI.cls])].filter(k => D.classes[k]).flatMap(k => [k, ...GIDS.map(gid => engDoc(gkey(k, gid)))]);
function subscribeYear() {
  yearUnsubs.forEach(u => { try { u(); } catch (e) {} }); yearUnsubs = [];
  YEAR_DOCS.forEach(n => { loaded[n] = false; });
  subscribed = new Set();
  ensureSubscribed();
}
function ensureSubscribed() {
  const todo = wantedDocs().filter(n => !subscribed.has(n));
  if (!todo.length) return;
  todo.forEach(n => subscribed.add(n));
  if (!db && local) { for (const name of todo) { const d = lsGet(pathOf(name)); if (d) applyDoc(name, d); } touch(); return; }
  if (!db) return;
  const g = yearGen;
  for (const name of todo) {
    let first = true;
    yearUnsubs.push(db.doc(pathOf(name)).onSnapshot(snap => {
      if (g !== yearGen) return;
      if (!snap.metadata.hasPendingWrites && !dirty[name] && !saving[name] && snap.exists) { applyDoc(name, snap.data()); touch(); render(); }
      if (first && !snap.metadata.fromCache) { first = false; loaded[name] = true; checkLoaded(); }
    }, () => { if (g === yearGen) setDbState("err"); }));
  }
}
/* Wechselt das angezeigte Schuljahr: offene Änderungen des alten Jahres sichern, neue Dokumente abonnieren. */
function switchYear(id, remember) {
  if (remember) { try { localStorage.setItem("mp-year", id); } catch (e) {} }
  if (id === UI.year) return;
  for (const n of YEAR_DOCS) { clearTimeout(timers[n]); if (dirty[n]) flush(n); }
  yearGen++;
  for (const n of YEAR_DOCS) dirty[n] = false;
  UI.year = id; UI.confirm = null; UI.reveal = {}; undoStack = null;
  resetYearState();
  fixSelection(); touch(); subscribeYear(); render();
}
async function initDb() {
  try { db = window.claude && window.claude.use ? await window.claude.use("db") : null; } catch (e) { db = null; }
  if (!db) {
    local = lsOk();
    if (local) {
      const st = lsGet(pathOf("settings")); if (st) applyDoc("settings", st);
      const p = pickYear(); if (p !== UI.year) { yearGen++; UI.year = p; resetYearState(); }
      subscribeYear();
    }
    if (local) firstUse();
    setDbState(local ? "local" : "off");
    if (!cal().engineStart) { cal().engineStart = todayIso(); if (local) save("settings"); }
    touch(); render(); maybeOnboard(); return;
  }
  initDb.timer = setTimeout(() => { if (dbState === "loading") setDbState("slow"); }, 10000);
  let first = true;
  db.doc(pathOf("settings")).onSnapshot(snap => {
    if (!snap.metadata.hasPendingWrites && !dirty.settings && !saving.settings && snap.exists) {
      applyDoc("settings", snap.data());
      if (first || !S.settings.years.some(y => y.id === UI.year)) { const p = pickYear(); if (p !== UI.year) switchYear(p); }
      touch(); render();
    }
    if (first && !snap.metadata.fromCache) { first = false; loaded.settings = true; checkLoaded(); }
  }, () => { clearTimeout(initDb.timer); setDbState("err"); });
  subscribeYear();
}

/* ---------------- actions ---------------- */
let undoStack = null;
/* Aktionen nehmen eine Klasse ("kl8") oder eine Parallelklasse ("kl8.b"); gespeichert wird immer das Klassendokument
   und die Lernstände aller Parallelklassen dieser Klasse. */
function snapshotFor(g) { const k = ck(g); const eng = {}; GIDS.forEach(gid => { eng[gkey(k, gid)] = clone(S.eng[gkey(k, gid)]); }); return { k, cls: clone(S.cls[k]), eng, settings: clone(S.settings) }; }
function commit(g, opts) {
  touch();
  if (g) { stampAtoms(ck(g), S.cls[ck(g)]); save(ck(g)); }
  if (g && opts && opts.eng) GIDS.forEach(gid => save(engDoc(gkey(ck(g), gid))));
  if (opts && opts.settings) save("settings");
  render();
}
function withUndo(g, msg, fn) {
  const snap = snapshotFor(g); fn();
  undoStack = snap; commit(g, { eng: true, settings: true }); toast(msg, true);
}
function doUndo() {
  if (!undoStack) return; const u = undoStack; undoStack = null;
  S.cls[u.k] = u.cls; Object.assign(S.eng, u.eng); S.settings = u.settings;
  commit(u.k, { eng: true, settings: true }); toast("Rückgängig gemacht");
}
/* Mehrbedarf und Pufferkürzung gelten nur für die eine Parallelklasse: als Abweichung adj von der gemeinsamen Sequenz. */
function adjRow(g, rowIdx, delta) { const G = grp(g), id = S.cls[ck(g)].seq[rowIdx].id; G.adj = G.adj || {}; G.adj[id] = (G.adj[id] || 0) + delta; if (!G.adj[id]) delete G.adj[id]; }
function consumeBuffer(g, fromIdx, track) {
  const sc = schedule(g);
  for (let i = fromIdx + 1; i < sc.rows.length; i++) {
    const r = sc.rows[i];
    if (r.code === "P" && r.track === track && r.hours > 0) { adjRow(g, i, -1); return i; }
  }
  return -1;
}
function addHour(g, rowIdx) {
  const row = schedule(g).rows[rowIdx]; let note = "";
  withUndo(g, "", () => {
    adjRow(g, rowIdx, 1);
    if (S.settings.autoBuffer) { const j = consumeBuffer(g, rowIdx, row.track); note = j >= 0 ? " Ein Puffer weiter hinten wurde um 1 Std. gekürzt." : " Kein Puffer mehr frei: Reserve prüfen."; }
  });
  toast(`${groupName(g)}, ${row.code}: eine Stunde mehr eingeplant.${note}`, true);
}
/* keys: eine Schulstunde ("2026-09-03|3") oder mehrere, durch Komma getrennt (Doppelstunde). */
function cancelSlot(g, keys) {
  const sc = schedule(g), ks = String(keys).split(","), ss = ks.map(key => sc.slots.find(x => x.key === key)).filter(Boolean); if (!ss.length) return;
  const G = grp(g), wasCancelled = ss.every(s => G.cancelled[s.key]); let note = "", noBuf = false, cut = 0;
  withUndo(g, "", () => {
    if (wasCancelled) ss.forEach(s => { delete G.cancelled[s.key]; });
    else ss.filter(s => !G.cancelled[s.key]).forEach(s => {
      G.cancelled[s.key] = true;
      if (S.settings.autoBuffer && s.lesson) { if (consumeBuffer(g, s.lesson.row.idx, s.track) >= 0) cut++; else noBuf = true; }
    });
  });
  if (cut) note = cut === 1 ? " Ein Puffer wurde um 1 Std. gekürzt." : ` Puffer wurden um ${cut} Std. gekürzt.`;
  if (noBuf) note += " Kein Puffer mehr frei: Reserve prüfen.";
  const what = ss.length > 1 ? "Doppelstunde" : "Stunde";
  toast(wasCancelled ? `${what} findet wieder statt.` : `${what} als ausgefallen markiert, der Plan rückt nach.${note}`, true);
}
function toggleDone(g, keys) {
  const G = grp(g), ks = String(keys).split(","), all = ks.every(key => G.done[key]);
  ks.forEach(key => { if (all) delete G.done[key]; else G.done[key] = true; });
  commit(g);
}
/* Aufeinanderfolgende Schulstunden am selben Tag, die zusammengehören (Doppelstunde): gleiche Einheit mit
   fortlaufender Stundennummer oder beide ausgefallen. */
function sameBlock(a, b) {
  if (!a || !b || a.date !== b.date || b.period !== a.period + 1 || a.track !== b.track || a.track === "SOL") return false;
  if (a.cancelled || b.cancelled) return a.cancelled && b.cancelled;
  return !!(a.lesson && b.lesson && a.lesson.row === b.lesson.row && b.lesson.n === a.lesson.n + 1);
}
/* Teil einer Doppelstunde, deren Hälften zu verschiedenen Einheiten gehören: 1 oder 2, sonst 0. */
function dblPart(k, s) {
  if (!s || s.track === "SOL") return 0;
  const day = schedule(k).byDate[s.date] || [], nb = p => day.find(x => x.period === p && x.track !== "SOL");
  return nb(s.period + 1) ? 1 : nb(s.period - 1) ? 2 : 0;
}
function groupSlots(slots) {
  const out = [];
  slots.forEach(s => { const last = out[out.length - 1]; if (last && sameBlock(last[last.length - 1], s)) last.push(s); else out.push([s]); });
  return out;
}
/* Stunden einer Einheit als Blöcke nach dem Stundenplan der Klasse: [[1], [2, 3], [4], …]; Doppelstunden bilden einen Block. */
function unitBlocks(k, code) {
  const sc = schedule(k), r = sc.rows.find(x => x.code === code), u = unitOf(k, code);
  const atoms = atomsOf(k, code), nL = Math.max(u ? u.stunden.length : 0, r ? r.hours : 0, ...atoms.map(a => a.l), 1);
  const blocks = [];
  for (let n = 1; n <= nL; n++) {
    const last = blocks[blocks.length - 1], s = r && r.slots[n - 1], ps = last && r && r.slots[last[last.length - 1] - 1];
    if (last && s && ps && sameBlock(ps, s)) last.push(n); else blocks.push([n]);
  }
  return { r, blocks, nL };
}
function moveAtom(k, code, id, l) {
  const list = clone(atomsOf(k, code)), a = list.find(x => x.id === id); if (!a || a.l === l) return;
  const snap = snapshotFor(k);
  a.l = l; list.sort((x, y) => x.l - y.l);
  S.cls[k].atoms[code] = list; undoStack = snap; commit(k); toast(`Atom in Stunde ${l} verschoben.`, true);
}
function rate(g, id, grade) {
  const date = UI.date, E = S.eng[g], prev = E.cards[id];
  withUndo(g, "", () => {
    const x = engineState(g, date).list.find(y => y.a.id === id), lvl = x ? taskOf(x.a, levelOf(x)).l : 1;
    E.cards[id] = Object.assign(fsrsReview(prev, grade, date, S.settings.retention), { lastG: grade });
    E.log.push({ d: date, id, g: grade, l: lvl });
  });
  const c = E.cards[id];
  toast(`Gespeichert. Nächste Wiederholung ab ${fmt(c.due)} (in ${diffDays(date, c.due)} Tagen).`, true);
}

/* ---------------- Leistungsnachweise ----------------
   Mit eigenen Stunden (Klassenarbeit, Klausur, Test, Präsentation, Projekt): eine eigene Einheit in S.cls[k].ln und
   eine Zeile in der Sequenz. In einer Stunde (Kurzkontrolle u. a.): Eintrag in S.cls[k].checks an Einheit und Stunde,
   kostet keine Unterrichtszeit. Beides gilt für alle Parallelklassen; die Termine folgen dem Stundenplan jeder Klasse. */
const LN_KINDS = {
  ka: { label: "Klassenarbeit", short: "Klassenarbeit", prefix: "KA", hours: 1, dur: 45, wdh: true, rueck: true },
  klausur: { label: "Klausur", short: "Klausur", prefix: "KL", hours: 2, dur: 90, wdh: true, rueck: true },
  test: { label: "Test / Leistungskontrolle", short: "Test", prefix: "LK", hours: 1, dur: 45, wdh: false, rueck: true },
  praes: { label: "Präsentation / Referat", short: "Präsentation", prefix: "PR", hours: 1, dur: 45, wdh: false, rueck: false },
  komplex: { label: "Komplexe Leistung / Projekt", short: "Projekt", prefix: "PJ", hours: 2, dur: 90, wdh: false, rueck: false }
};
const CHECK_KINDS = { kk: "Kurzkontrolle", test: "Test", muendl: "Mündliche Kontrolle", ha: "Hausaufgabenkontrolle", sonst: "Sonstige Bewertung" };
/* Wählbare Dauer je Art; unter 45 min läuft der Leistungsnachweis in einer Stunde mit (wie eine Kurzkontrolle). */
const LN_DURS = { ka: [45, 90], klausur: [45, 90], test: [20, 30, 45], praes: [45, 90], komplex: [45, 90] };
const durLabel = d => d < 45 ? `${d} min (in einer Stunde)` : `${d} min (${d / 45} ${d === 45 ? "Stunde" : "Stunden"})`;
const durOptions = (kind, cur) => (LN_DURS[kind] || [45, 90]).map(d => `<option value="${d}" ${d === cur ? "selected" : ""}>${durLabel(d)}</option>`).join("");
/* Kurzer Test (20/30 min) als Kontrolle in einer Stunde: mit Datum in die erste Stunde dieses Tages, sonst in die erste Stunde
   der Zeile nach afterIdx. Kostet keine eigene Unterrichtsstunde. */
function addShortTest(k, { topic, dur, date, afterIdx, g }) {
  const C = S.cls[k], snap = snapshotFor(k); g = g || curG() || gkey(k, "a");
  const sc = schedule(g);
  let code, n, row = null, when = "";
  if (date) {
    const s = dateSlot(g, date);
    if (!s) { toast("Ab diesem Datum ist keine Stunde mehr geplant."); return null; }
    const x = { id: uid(), kind: "test", title: topic, dur, date };
    C.checks = C.checks || []; C.checks.push(x);
    undoStack = snap; commit(k);
    toast(`Test (${dur} min) fest am ${fmt(s.date, { weekday: "short", day: "2-digit", month: "2-digit" })}, ${s.period}. Std.${s.date !== date ? " (am gewählten Tag keine Mathestunde)" : ""}. Er kostet keine eigene Stunde.`, true);
    return x.id;
  } else {
    const next = C.seq[afterIdx + 1] || C.seq[afterIdx]; if (!next) return null;
    code = next.code; n = next === C.seq[afterIdx + 1] ? 1 : Math.max(1, +next.hours || 1); row = next.id;
    const r = sc.rows.find(y => y.id === next.id), s = r && r.slots[n - 1]; if (s) when = `${fmt(s.date, { weekday: "short", day: "2-digit", month: "2-digit" })}, ${s.period}. Std.`;
  }
  const x = { id: uid(), kind: "test", title: topic, code, n, dur };
  if (["P", "JA"].includes(code)) x.row = row;
  C.checks = C.checks || []; C.checks.push(x);
  undoStack = snap; commit(k);
  toast(`Test (${dur} min) in ${code}, Stunde ${n}${when ? " · " + when : ""} eingetragen. Er kostet keine eigene Stunde.`, true);
  return x.id;
}
function lnStunden(kind, hours, wdh, rueck) {
  const K = LN_KINDS[kind], st = [];
  if (wdh) st.push("Wiederholung");
  for (let i = 1; i <= hours; i++) st.push(hours > 1 ? `${K.short} (${i}. Stunde)` : K.short);
  if (rueck) st.push("Rückgabe und Berichtigung");
  return st;
}
function lnCode(k, kind) {
  const pre = LN_KINDS[kind].prefix, used = new Set(unitOrderOf(k));
  let n = 1; while (used.has(pre + n)) n++;
  return pre + n;
}
/* Neuen Leistungsnachweis anlegen und in der Sequenz hinter Zeile afterIdx einfügen (-1 = am Anfang). */
function addLn(k, { kind, topic, hours, wdh, rueck, afterIdx, date, g, dur }) {
  const C = S.cls[k], K = LN_KINDS[kind]; if (!K) return null;
  if (dur) hours = Math.max(1, Math.round(dur / 45));
  const code = lnCode(k, kind), stunden = lnStunden(kind, hours, wdh, rueck);
  const snap = snapshotFor(k);
  C.ln = C.ln || {};
  C.ln[code] = { kind, title: K.short + (topic ? ": " + topic : ""), lb: "test", custom: true, stunden, main: wdh ? 1 : 0, inhalte: [], begriffe: [], hinweise: [] };
  C.lnDur = C.lnDur || {}; C.lnDur[code] = dur || Math.min(90, hours * 45);
  const after = C.seq[afterIdx], strand = C.mode === "nacheinander" ? "A" : after ? after.strand : "A", row = { id: uid(), code, strand, hours: stunden.length };
  C.seq.splice(afterIdx + 1, 0, row);
  const Y = cal();
  if (date && date >= Y.start && date <= Y.end) { setLnDate(g || curG() || gkey(k, "a"), row.id, date, snap, `${C.ln[code].title} (${code}) angelegt. `); return code; }
  undoStack = snap; commit(k);
  toast(`${C.ln[code].title} (${code}) mit ${stunden.length} Std. eingefügt.${date ? " Das Datum liegt außerhalb des Schuljahres, der Termin folgt der Sequenz." : ""}`, true);
  return code;
}
/* Leistungsnachweis löschen: Kontrolle (id) oder Sequenzzeile (row). Eine selbst angelegte Einheit verschwindet mit ihrer
   letzten Zeile; ein Platzhalter der Vorlage verlässt die Sequenz (rückgängig machbar). */
function removeLn(k, { id, row, code }) {
  const C = S.cls[k], snap = snapshotFor(k); let msg = "";
  if (id) {
    const x = (C.checks || []).find(y => y.id === id); if (!x) return;
    C.checks = C.checks.filter(y => y.id !== id); msg = `${CHECK_KINDS[x.kind]}${x.title ? " „" + x.title + "“" : ""} gelöscht.`;
  } else {
    const r = row ? C.seq.find(y => y.id === row) : C.seq.find(y => y.code === code);
    code = r ? r.code : code; if (!code) return;
    const title = titleOf(k, code);
    if (r) { C.seq = C.seq.filter(y => y !== r); C.groups.forEach(G => { if (G.pin) delete G.pin[r.id]; }); }
    if (C.ln && C.ln[code] && !C.seq.some(y => y.code === code)) {
      delete C.ln[code]; delete C.atoms[code]; C.checks = (C.checks || []).filter(y => y.code !== code);
      msg = `${title} gelöscht.`;
    } else msg = `${title} aus dem Plan entfernt. Neu anlegen: „+ Leistungsnachweis“ im Jahresplan.`;
    if (/^#u-/.test(location.hash)) location.hash = "#plan";
  }
  UI.confirm = null; undoStack = snap; commit(k); toast(msg, true);
}
const lnDelBtn = (k, x) => {
  const key = x.inLesson ? x.id : x.row || x.code, conf = UI.confirm === "lnx-" + key;
  const data = x.inLesson ? `data-id="${esc(x.id)}"` : x.row ? `data-row="${esc(x.row)}"` : `data-code="${esc(x.code)}"`;
  return conf ? `<span class="confirm small"><span>Löschen?</span><button type="button" class="btn danger sm" data-act="lnremove" ${data}>Löschen</button><button type="button" class="btn ghost sm" data-act="confirm" data-v="">Nein</button></span>`
    : `<button type="button" class="mini del" data-act="confirm" data-v="lnx-${esc(key)}" aria-label="Leistungsnachweis löschen" title="Löschen">×</button>`;
};
/* Termine aller Leistungsnachweise einer (Parallel-)Klasse, nach Datum: Zeilen mit Lernbereich "test" (Hauptstunde) und Kontrollen. */
/* Index der Stunde, in der die Arbeit geschrieben wird (vor ihr liegt ggf. die Wiederholung). */
function lnMain(k, code, hours) {
  const u = unitOf(k, code); if (!u) return 0;
  let m = u.main ?? u.stunden.findIndex(t => /klassenarbeit|klausur|test|leistungskontrolle|präsentation|projekt/i.test(t) && !/wiederholung|rückgabe/i.test(t));
  if (m < 0) m = 0;
  return Math.min(m, Math.max(0, hours - 1));
}
function lnDates(g) {
  const sc = schedule(g), k = ck(g), out = [];
  sc.rows.forEach(r => {
    const u = unitOf(k, r.code); if (!u || u.lb !== "test" || !r.hours) return;
    const s = r.slots[lnMain(k, r.code, r.hours)];
    out.push({ date: s ? s.date : null, period: s ? s.period : null, code: r.code, row: r.id, pinned: r.pinned || null, title: u.title, kind: u.kind ? LN_KINDS[u.kind].short : "Klassenarbeit", inLesson: false, dur: lnDurOf(k, r.code) });
  });
  (S.cls[k].checks || []).forEach(x => {
    const pos = checkPos(g, x), s = pos.slot;
    out.push({ date: s ? s.date : null, period: s ? s.period : null, code: pos.code, title: x.title || CHECK_KINDS[x.kind], kind: CHECK_KINDS[x.kind], inLesson: true, id: x.id, n: pos.n, dur: checkMin(x), pinned: x.date || null });
  });
  return out.sort((a, b) => (a.date || "9") < (b.date || "9") ? -1 : (a.date || "9") > (b.date || "9") ? 1 : (a.period || 0) - (b.period || 0));
}
/* Leistungsnachweis per Datum festlegen (nur für diese Parallelklasse); leeres Datum löst den Termin. Die Zeile wandert in der
   Sequenz an die zeitlich passende Stelle, damit die Liste der Reihenfolge im Kalender entspricht. */
function setLnDate(g, rowId, date, snap0, prefix = "") {
  const k = ck(g), C = S.cls[k], G = grp(g), Y = cal(), row = C.seq.find(r => r.id === rowId); if (!row) return;
  if (date && (date < Y.start || date > Y.end)) { toast(`Das Datum liegt außerhalb des Schuljahres ${yearLabel(Y.id)}.`); render(); return; }
  const snap = snap0 || snapshotFor(k);
  G.pin = G.pin || {};
  if (date) G.pin[rowId] = date; else delete G.pin[rowId];
  touch();
  let msg = `${row.code}: fester Termin gelöst, folgt wieder der Sequenz.`;
  if (date) {
    const sc = schedule(g), r = sc.rows.find(x => x.id === rowId), s = r && r.slots[lnMain(k, r.code, r.hours)];
    if (!s) msg = `${row.code}: Am ${fmt(date)} und danach ist keine Stunde mehr frei.`;
    else {
      // Zeile hinter die letzte Zeile desselben Strangs setzen, die vor dem Termin beginnt
      const i = C.seq.indexOf(row); C.seq.splice(i, 1);
      let at = 0; C.seq.forEach((x, j) => { const y = sc.rows.find(z => z.id === x.id); if (y && y.start && y.start < r.start) at = j + 1; });
      C.seq.splice(at, 0, row);
      msg = s.date === date ? `${row.code} liegt jetzt am ${fmt(date, { weekday: "short", day: "2-digit", month: "2-digit" })}, ${s.period}. Std. Der Plan ist angepasst.`
        : `Am ${fmt(date, { weekday: "short", day: "2-digit", month: "2-digit" })} hat ${groupName(g)} keine passende Stunde. ${row.code} liegt in der nächsten: ${fmt(s.date, { weekday: "short", day: "2-digit", month: "2-digit" })}, ${s.period}. Std.`;
    }
  }
  undoStack = snap; commit(k); toast(prefix + msg, true);
}
/* Erste Unterrichtsstunde mit Stoff ab einem Datum (nicht FIL, nicht ausgefallen) */
const dateSlot = (g, date) => schedule(g).slots.find(y => y.date >= date && y.lesson && !y.cancelled && y.track !== "SOL");
/* Wo eine Kontrolle liegt: mit Datum (x.date) fest in der ersten Stunde ab diesem Tag – unabhängig von Änderungen der
   Sequenz –, sonst an Einheit und Stunde (code, n; bei Puffer/Jahresabschluss zusätzlich row). */
function checkPos(g, x) {
  const c = schedule(g).chk; if (c && c[x.id]) return c[x.id];
  if (x.date) { const s = dateSlot(g, x.date); return s ? { code: s.lesson.row.code, n: s.lesson.n, rowId: s.lesson.row.id, slot: s } : { code: null, n: 0, rowId: null, slot: null }; }
  const sc = schedule(g), r = (x.row && sc.rows.find(y => y.id === x.row)) || sc.rows.find(y => y.code === x.code);
  return { code: x.code, n: x.n, rowId: r ? r.id : x.row || null, slot: r ? r.slots[Math.min(x.n, r.hours) - 1] || null : null };
}
/* Kontrolle per Datum festlegen: liegt dann fest am Tag (erste Mathestunde ab dem Datum). */
function setCheckDate(g, id, date) {
  const k = ck(g), C = S.cls[k], x = (C.checks || []).find(y => y.id === id); if (!x || !date) return;
  const s = dateSlot(g, date);
  if (!s) { toast("Ab diesem Datum ist keine Stunde mehr geplant."); render(); return; }
  const snap = snapshotFor(k); x.date = date; delete x.code; delete x.n; delete x.row;
  undoStack = snap; commit(k);
  toast(`${CHECK_KINDS[x.kind]} fest am ${fmt(s.date, { weekday: "short", day: "2-digit", month: "2-digit" })}, ${s.period}. Std.${s.date !== date ? " (am gewählten Tag keine Mathestunde)" : ""}.`, true);
}
/* Festen Termin einer Kontrolle lösen: sie hängt dann an der Stunde, in der sie gerade liegt, und wandert mit der Sequenz. */
function unpinCheck(g, id) {
  const k = ck(g), C = S.cls[k], x = (C.checks || []).find(y => y.id === id); if (!x || !x.date) return;
  const pos = checkPos(g, x), snap = snapshotFor(k);
  if (pos.code) { x.code = pos.code; x.n = pos.n; if (["P", "JA"].includes(pos.code)) x.row = pos.rowId; }
  delete x.date; undoStack = snap; commit(k);
  toast(`${CHECK_KINDS[x.kind]}: fester Termin gelöst, sie hängt jetzt an ${x.code}, Stunde ${x.n}.`, true);
}
const checksAt = (g, code, ns, rowId) => (S.cls[ck(g)].checks || []).map(x => { const pos = checkPos(g, x); return Object.assign({}, x, { n: pos.n, code: pos.code, rowId: pos.rowId }); })
  .filter(x => x.code && (rowId ? x.rowId === rowId : x.code === code) && ns.includes(x.n));

/* ---------------- Ferien Sachsen & Schuljahre ---------------- */
/* Aus Ferien- und Feiertagslisten ein Schuljahr bauen: Beginn = erster Werktag nach den Sommerferien,
   Ende = letzter Werktag vor den nächsten Sommerferien; eintägige Ferien und Feiertage an Schultagen werden freie Tage. */
function sachsenYear(y0, src) {
  const summer = src.school.filter(x => /sommer/i.test(x[2]));
  const s1 = summer.find(x => +x[1].slice(0, 4) === y0), s2 = summer.find(x => +x[0].slice(0, 4) === y0 + 1);
  if (!s1 || !s2) return null;
  let start = addDays(s1[1], 1); while (dow(start) > 5) start = addDays(start, 1);
  let end = addDays(s2[0], -1); while (dow(end) > 5) end = addDays(end, -1);
  const holidays = [], free = [];
  src.school.filter(x => x[0] > s1[1] && x[1] < s2[0] && !/sommer/i.test(x[2])).forEach(([a, b, n]) => {
    if (a === b) free.push({ date: a, name: n }); else holidays.push({ name: n, frm: a, to: b });
  });
  const inHol = d => holidays.some(h => h.frm <= d && d <= h.to);
  src.public.forEach(([d, n]) => { if (d >= start && d <= end && dow(d) <= 5 && !inHol(d) && !free.some(f => f.date === d)) free.push({ date: d, name: n }); });
  holidays.sort((a, b) => a.frm < b.frm ? -1 : 1);
  const Y = addHaDays({ start, end, holidays, free });
  return { start, end, holidays, free: Y.free };
}
async function fetchSachsen(y0) {
  const q = (kind, a, b) => `https://openholidaysapi.org/${kind}?countryIsoCode=DE&subdivisionCode=DE-SN&languageIsoCode=DE&validFrom=${a}&validTo=${b}`;
  const get = async u => { const r = await fetch(u, { headers: { accept: "application/json" } }); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); };
  const nm = x => ((x.name || []).find(n => n.language === "DE") || (x.name || [])[0] || {}).text || "Ferien";
  const [sch, pub] = await Promise.all([get(q("SchoolHolidays", `${y0}-06-01`, `${y0 + 1}-09-30`)), get(q("PublicHolidays", `${y0}-08-01`, `${y0 + 1}-08-31`))]);
  return { school: sch.map(x => [x.startDate, x.endDate, nm(x)]), public: pub.map(x => [x.startDate, nm(x)]) };
}
async function loadSachsen(y0) {
  const r = sachsenYear(y0, D.ferienSN);
  if (r) return Object.assign(r, { source: "eingebaute Termine (openholidaysapi.org)" });
  const live = sachsenYear(y0, await fetchSachsen(y0));
  if (live) return Object.assign(live, { source: "openholidaysapi.org, abgerufen am " + fmt(todayIso(), { day: "2-digit", month: "2-digit", year: "numeric" }) });
  throw new Error("Für dieses Schuljahr sind noch keine Ferien veröffentlicht.");
}
async function importFerien() {
  const Y = cal(); UI.busy = true; UI.confirm = null; render();
  try {
    const r = await loadSachsen(yearStart(Y.id));
    const snap = snapshotFor(UI.cls);
    Object.assign(Y, { start: r.start, end: r.end, holidays: r.holidays, free: r.free, source: r.source, haDays: true });
    undoStack = snap; UI.busy = false; commit(null, { settings: true });
    toast(`Ferien Sachsen ${yearLabel(Y.id)} übernommen: ${r.holidays.length} Ferienabschnitte, ${r.free.length} freie Tage.`, true);
  } catch (e) { UI.busy = false; render(); toast(`Import fehlgeschlagen: ${e && e.message ? e.message : e}. Ferien bitte von Hand eintragen.`); }
}
async function createYear(id, copySeq, copyTT) {
  if (S.settings.years.some(y => y.id === id)) { switchYear(id, true); return; }
  UI.busy = true; render();
  let r = null, err = "";
  try { r = await loadSachsen(yearStart(id)); } catch (e) { err = e && e.message ? e.message : String(e); }
  const y0 = yearStart(id);
  const Y = r ? { id, start: r.start, end: r.end, holidays: r.holidays, free: r.free, source: r.source, haDays: true }
    : { id, start: `${y0}-08-15`, end: `${y0 + 1}-07-15`, holidays: [], free: [] };
  Y.engineStart = Y.start;
  if (Array.isArray(cal().classes)) Y.classes = cal().classes.slice();
  const prev = { cls: clone(S.cls) };
  S.settings.years.push(Y); sortYears(S.settings.years); save("settings");
  UI.busy = false;
  switchYear(id, true);
  CLASSES.forEach(k => {
    const P = prev.cls[k], C = S.cls[k];
    if (copySeq) { C.mode = P.mode; C.seq = P.seq.map(r => Object.assign({}, r, { id: uid() })); C.atoms = clone(P.atoms || {}); C.ln = clone(P.ln || {}); C.checks = clone(P.checks || []); C.tpl = clone(tplOf(k, P)); }
    /* Parallelklassen mit Namen übernehmen; Stundenplan je Gruppe aus ihrem letzten Zeitraum oder aus der Vorlage */
    C.groups = P.groups.map(PG => {
      const last = PG.tt && PG.tt.length ? sortTT(PG.tt.slice())[PG.tt.length - 1] : null;
      return newGroup(PG.id, PG.name, copyTT && last ? [{ id: uid(), frm: Y.start, lessons: cloneLessons(last.lessons) }] : clone(C.groups[0].tt).map(v => Object.assign(v, { id: uid() })));
    });
    const pins = kaPins(k, C.seq, Y); C.groups.forEach(G => { G.pin = clone(pins); });
    save(k); GIDS.forEach(gid => save(engDoc(gkey(k, gid))));
  });
  touch(); render();
  toast(r ? `Schuljahr ${yearLabel(id)} angelegt, Ferien Sachsen übernommen.` : `Schuljahr ${yearLabel(id)} angelegt. Ferien konnten nicht geladen werden (${err}); bitte unter Einstellungen eintragen.`);
}

/* ---------------- Dateien & Sicherung ---------------- */
/* Datei speichern: im Claude-Artefakt über die Download-Funktion, sonst (GitHub Pages, lokal) als Browser-Download. */
function saveFile(filename, txt) {
  if (downloads) return downloads.save({ filename, data: txt });
  return new Promise((res, rej) => {
    try {
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([txt], { type: "application/json" })); a.download = filename;
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); res();
    } catch (e) { rej(e); }
  });
}
/* Erinnerung an die Sicherung, wenn nur im Browser gespeichert wird: nach 30 Tagen ohne Sicherung (gezählt ab der ersten Nutzung). */
const lsRead = key => { try { return localStorage.getItem(key); } catch (e) { return null; } };
function markBackup() { try { localStorage.setItem("mp-lastbackup", todayIso()); } catch (e) {} renderBanner(); }
function firstUse() { let v = lsRead("mp-since"); if (!v) { v = todayIso(); try { localStorage.setItem("mp-since", v); } catch (e) {} } return v; }
const lastBackup = () => lsRead("mp-lastbackup");
const backupDue = () => local && diffDays(lastBackup() || firstUse(), todayIso()) >= 30;

/* ---------------- toast & banner ---------------- */
let toastTimer;
function toast(msg, undo) {
  const el = document.getElementById("toast");
  el.innerHTML = `<span>${esc(msg)}</span>${undo && undoStack ? '<button type="button" data-act="undo">Rückgängig</button>' : ""}`;
  el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 7000);
}
function renderBanner() {
  const el = document.getElementById("banner");
  const m = {
    loading: "Gespeicherte Daten werden geladen …",
    slow: "Der Speicher antwortet noch nicht. Du siehst gerade den Ausgangsplan; Änderungen werden gespeichert, sobald die Verbindung steht.",
    local: "Gespeichert wird in diesem Browser. Für ein anderes Gerät oder eine zusätzliche Sicherung: Einstellungen → Sicherung.",
    off: "Speichern ist in dieser Ansicht nicht verfügbar. Änderungen gelten nur bis zum Neuladen. Öffne die App angemeldet auf claude.ai.",
    err: "Speichern ist gerade fehlgeschlagen. Die App versucht es bei der nächsten Änderung erneut.",
    ro: "Du kannst diesen Plan ansehen, aber nicht ändern.",
    quota: "Der Speicher ist voll. Lösche alte Daten über Einstellungen → Sicherung.",
  }[dbState];
  // Der Normalfall „im Browser gespeichert“ steht unauffällig im Footer; oben bleiben nur Hinweise, die etwas verlangen
  const due = dbState === "local" && backupDue(), ft = document.getElementById("footnote");
  if (ft) { const on = dbState === "local" && !due; ft.innerHTML = on ? `Gespeichert wird in diesem Browser. Für ein anderes Gerät oder eine zusätzliche Sicherung: <a href="#einstellungen">Einstellungen → Sicherung</a>.` : ""; ft.hidden = !on; }
  if (due) {
    const lb = lastBackup();
    el.innerHTML = `Gespeichert wird nur in diesem Browser. ${lb ? `Letzte Sicherung vor ${diffDays(lb, todayIso())} Tagen.` : "Noch keine Sicherung."} Bitte unter <a href="#einstellungen">Einstellungen → Sicherung</a> eine Datei speichern.`;
    el.hidden = false; el.dataset.kind = "backup"; return;
  }
  el.textContent = dbState === "local" ? "" : m || ""; el.hidden = !m || dbState === "local"; el.dataset.kind = dbState;
}

/* ---------------- shared pieces ---------------- */
function chip(k, code, extra) {
  const lb = lbOf(k, code);
  return `<span class="chip" style="${sty(lb)}"><b>${esc(code)}</b>${extra ? `<span>${extra}</span>` : ""}</span>`;
}
function unitLink(k, code, label) {
  const i = unitOrderOf(k).indexOf(code);
  if (i < 0 || code === "P" || code === "JA") return `<span class="ulink plain" style="${sty(lbOf(k, code))}"><b>${esc(code)}</b> ${esc(label || titleOf(k, code))}</span>`;
  return `<a class="ulink" href="#u-${ck(k)}-${i}" style="${sty(lbOf(k, code))}"><b>${esc(code)}</b> ${esc(label || titleOf(k, code))}</a>`;
}
/* Kontext-Hinweis in den Überschriften; umgeschaltet wird oben in der Leiste. */
function clsTabs() { const k = curG(); return `<span class="badge">${esc(k ? fullLabel(k) : (TYPES[UI.type] || {}).label || "")} · ${esc(yearLabel(cal().id))}</span>`; }
function noClassMsg() {
  const T = TYPES[UI.type] || {}, has = CLASSES.some(k => D.classes[k].type === UI.type);
  if (!mineList().length) return `Du hast für ${esc(yearLabel(cal().id))} noch keine Klassen festgelegt. <a href="#einstellungen">Einstellungen → Meine Klassen</a>`;
  if (has) return `Du unterrichtest ${esc(yearLabel(cal().id))} keine Klasse der Schulart ${esc(T.label || "")}. <a href="#einstellungen">Einstellungen → Meine Klassen</a>`;
  return `Für ${esc(T.label || "diese Schulart")} ist noch kein Lehrplan hinterlegt. Wähle oben eine andere Schulart.`;
}
function noClassView(title) {
  const T = TYPES[UI.type] || {};
  return `<section><div class="vhead"><h1>${esc(title)}</h1>${clsTabs()}</div>
    <div class="card"><p>${noClassMsg()}</p></div></section>`;
}
function renderCtx() {
  const el = document.getElementById("ctx"); if (!el) return;
  const T = TYPES[UI.type] || { grades: [] }, cur = curClass();
  el.innerHTML = `<span class="ctxl">Schulart</span><div class="seg small" role="group" aria-label="Schulart">${Object.entries(TYPES).map(([t, x]) => `<button type="button" aria-pressed="${UI.type === t}" data-act="type" data-v="${t}" title="${esc(x.label)}">${esc(x.short)}</button>`).join("")}</div>
    <div class="seg small grades" role="group" aria-label="Klassenstufe"><span class="lbl">Kl.</span>${T.grades.map(g => {
      const all = classesFor(UI.type, g), mine = all.filter(isMine), curV = cur && D.classes[cur].variant;
      const k = mine.find(c => D.classes[c].variant === curV) || mine[0];
      return `<button type="button" aria-pressed="${!!cur && all.includes(cur)}" ${k ? `data-act="cls" data-k="${k}" title="${esc(mine.map(c => D.classes[c].label).join(", "))}"` : all.length ? `disabled title="Klasse ${g} gehört nicht zu deinen Klassen (Einstellungen → Meine Klassen)"` : `disabled title="Klasse ${g}: Lehrplan noch nicht hinterlegt"`}>${g}</button>`; }).join("")}</div>
    ${cur && classesFor(UI.type, D.classes[cur].grade).filter(isMine).length > 1 ? `<div class="seg small" role="group" aria-label="Bildungsgang bzw. Kursart">${classesFor(UI.type, D.classes[cur].grade).filter(isMine).map(c => `<button type="button" aria-pressed="${c === cur}" data-act="cls" data-k="${c}" title="${esc(D.classes[c].variantLabel)}">${esc(D.classes[c].variant || "")}</button>`).join("")}</div>` : ""}
    ${cur && S.cls[cur].groups.length > 1 ? `<div class="seg small" role="group" aria-label="Parallelklasse">${groupsOf(cur).map(g => `<button type="button" aria-pressed="${g === curG()}" data-act="grp" data-g="${g}">${esc(groupName(g))}</button>`).join("")}</div>` : ""}
    <span class="ctxl">Schuljahr</span><select id="yearsel" aria-label="Schuljahr">${S.settings.years.map(y => `<option value="${esc(y.id)}" ${y.id === cal().id ? "selected" : ""}>${esc(yearLabel(y.id))}</option>`).join("")}<option value="__new">+ Neues Schuljahr …</option></select>`;
}
function trackName(k, tr) {
  const c = D.classes[ck(k)], sc = schedule(k);
  if (tr === "SOL") return "FIL-Stunde";
  if (sc.seqMode) return "Fachunterricht";
  const nm = c.nameB ? (tr === "A" ? c.nameA : c.nameB) : obLbs(ck(k)).filter(({ lb }) => obLbStrand(ck(k), lb) === tr).map(({ lb }) => lbShort(k, lb)).join(" + ");
  return `Strang ${tr}${nm ? " · " + nm : ""}`;
}
function capCards(k) {
  const sc = schedule(k), out = [];
  const trs = sc.seqMode ? ["A"] : ["A", "B"];
  for (const tr of trs) {
    const res = sc.cap[tr] - sc.planned[tr];
    out.push(`<div class="cap ${res < 0 ? "neg" : res > 0 ? "pos" : ""}"><div class="lbl">${esc(sc.seqMode ? "Alle Stunden" : "Strang " + tr)}</div>
      <div class="nums"><span><b class="mono">${sc.cap[tr]}</b> verfügbar</span><span><b class="mono">${sc.planned[tr]}</b> geplant</span></div>
      <div class="res mono">${res === 0 ? "geht genau auf" : res > 0 ? `+${res} Std. Reserve` : `${-res} Std. fehlen`}</div></div>`);
  }
  if (sc.slots.some(s => s.track === "SOL")) out.push(`<div class="cap"><div class="lbl">FIL-Stunden</div><div class="nums"><span><b class="mono">${sc.cap.SOL}</b> im Jahr</span></div><div class="res">zusätzlich</div></div>`);
  return `<div class="caps">${out.join("")}</div>`;
}
const SOL_FORMATS = {
  1: ["Abrufübung", "Gemischte Aufgaben zu Einheiten, die 2–8 Wochen zurückliegen. Ohne Heft beginnen, erst danach nachschlagen."],
  2: ["Übungsplan zur aktuellen Einheit", "Pflicht-, Wahl- und Knobelaufgaben. Alle starten bei Pflicht; wer 80 % richtig hat, geht weiter."],
  3: ["Fluency-Training", "Kurze Aufgabenserien mit Zeitziel (Kopfrechnen, Terme, Gleichungen). Ergebnis gegen den eigenen Vorwert vergleichen."],
  4: ["Vorbereitung Klassenarbeit", "Checkliste „Ich kann …“, Selbsttest unter Zeitdruck, danach für jede rote Zeile eine passende Übung."],
  5: ["Berichtigung und Lücken schließen", "Berichtigung mit Erklärung des Fehlers, dann zwei ähnliche Aufgaben je Fehlerschwerpunkt."],
};
function solFormat(k, slot) {
  const sc = schedule(k), mon = monday(slot.date);
  const hasKA = m => sc.slots.some(s => s.lesson && monday(s.date) === m && (/KA/.test(s.lesson.row.code) || ["ka", "klausur"].includes((unitOf(k, s.lesson.row.code) || {}).kind)));
  if (hasKA(addDays(mon, -7))) return 5;
  if (hasKA(mon) || hasKA(addDays(mon, 7))) return 4;
  return [1, 2, 3, 2][(slot.solIdx || 0) % 4];
}
function currentUnit(k, date) {
  const sc = schedule(k);
  let last = null; for (const s of sc.slots) { if (s.date > date) break; if (s.lesson && !["P", "JA"].includes(s.lesson.row.code)) last = s.lesson.row.code; }
  return last;
}

/* ---------------- views: Heute ---------------- */
function viewToday() {
  const d = UI.date, isToday = d === todayIso();
  const mine = myGroups();
  const show = UI.todayAll ? (mine.length ? mine : CLASSES.map(k => gkey(k, "a"))) : curG() ? [curG()] : [];
  return `<section class="today">
    <div class="datebar">
      <button type="button" class="iconbtn" data-act="day" data-n="-1" aria-label="Vorheriger Tag">‹</button>
      <div class="dt"><div class="dname">${esc(fmtLong(d))}</div><div class="dsub mono">KW ${isoWeek(d)}${isToday ? " · heute" : ""}</div></div>
      <button type="button" class="iconbtn" data-act="day" data-n="1" aria-label="Nächster Tag">›</button>
      ${isToday ? "" : '<button type="button" class="btn ghost" data-act="today">Heute</button>'}
      <button type="button" class="dpbtn" data-act="dp" data-t="today" data-v="${d}" aria-haspopup="dialog" aria-label="Kalender: Tag wählen"><span class="dpico" aria-hidden="true">▦</span>Kalender</button>
      <div class="seg small">${[["one", curG() ? fullLabel(curG()) : "Gewählte Klasse"], ["all", "Alle meine Klassen"]].map(([v, l]) => `<button type="button" aria-selected="${(v === "all") === UI.todayAll}" data-act="todaycls" data-v="${v}">${esc(l)}</button>`).join("")}</div>
    </div>
    ${show.length === 1 ? todayTiles(show[0], d) : ""}
    ${show.length ? `<div class="tgrid ${show.length === 1 ? "one" : ""}">${show.map(k => todayCard(k, d)).join("")}</div>` : `<div class="card"><p>${noClassMsg()}</p></div>`}
  </section>`;
}
/* Kennzahlen der gewählten Klasse: aktuelle Einheit, heute fällig, ø Abruf, Reserve im Schuljahr. */
function todayTiles(g, d) {
  const sc = schedule(g), es = engineState(g, d), k = ck(g);
  const nx = sc.slots.find(s => s.date >= d && s.lesson && !["P", "JA"].includes(s.lesson.row.code));
  const code = currentUnit(g, d) || (nx ? nx.lesson.row.code : null), idx = code ? unitOrderOf(k).indexOf(code) : -1;
  const withR = es.list.filter(x => x.R !== null && x.R !== undefined);
  const meanR = withR.length ? Math.round(withR.reduce((a, x) => a + x.R, 0) / withR.length * 100) : null;
  const res = (sc.seqMode ? ["A"] : ["A", "B"]).map(t => sc.cap[t] - sc.planned[t]);
  const r = res.some(x => x < 0) ? Math.min(...res) : res.reduce((a, x) => a + x, 0);
  return `<div class="tiles">
    ${code && idx >= 0 ? `<a class="tile t1" href="#u-${k}-${idx}" title="${esc(titleOf(k, code))}"><b>${esc(code)}</b><span>${esc(titleOf(k, code))}</span></a>` : `<div class="tile t1"><b>—</b><span>aktuelle Einheit</span></div>`}
    <a class="tile t2" href="#lernuebersicht"><b>${es.dueCount}</b><span>heute fällig${es.backCount ? ` · ${es.backCount} Altbestand` : ""}</span></a>
    <a class="tile t3" href="#lernuebersicht"><b>${meanR === null ? "—" : meanR + " %"}</b><span>ø Abruf</span></a>
    <a class="tile t4 ${r < 0 ? "neg" : ""}" href="#plan"><b>${r > 0 ? "+" : ""}${r}</b><span>${r < 0 ? "Std. fehlen im Schuljahr" : "Std. Reserve im Schuljahr"}</span></a>
  </div>`;
}
function todayCard(k, d) {
  const c = D.classes[ck(k)], sc = schedule(k), info = sc.dayInfo[d];
  const slots = sc.byDate[d] || [];
  let body = "";
  if (!info) {
    const other = S.settings.years.find(y => y.id !== cal().id && y.start && y.end && y.start <= d && d <= y.end);
    body = `<p class="muted">Dieser Tag liegt außerhalb des Schuljahres ${esc(yearLabel(cal().id))}.</p>` + (other
      ? `<button type="button" class="btn ghost sm" data-act="year" data-v="${esc(other.id)}">Zum Schuljahr ${esc(yearLabel(other.id))} wechseln</button>`
      : `<a class="btn ghost sm" href="#einstellungen">Schuljahr ${esc(yearLabel(yearIdOf(d)))} anlegen →</a>`);
  }
  else if (!info.school) body = `<p class="free">${esc(info.note || "Wochenende")}: kein Unterricht.</p>`;
  else if (!slots.length) body = `<p class="muted">Heute hat ${esc(groupName(k))} laut Stundenplan keine Mathestunde.</p>`;
  body += groupSlots(slots).map(ss => slotBlock(k, ss)).join("");
  if (!slots.some(s => s.lesson)) {
    const nx = sc.slots.find(s => s.date > d && s.lesson);
    if (nx) { const li = lessonInfo(k, nx.lesson); body += `<div class="next"><span class="lbl">Nächste Stunde · ${esc(fmt(nx.date, { weekday: "short", day: "2-digit", month: "2-digit" }))}, ${nx.period}. Std.</span>${unitLink(k, nx.lesson.row.code)}<div class="small">${mx(li.title)}</div></div>`; }
  }
  const es = engineState(k, d);
  const rv = es.pick.map(x => reviewItem(k, x)).join("");
  const res = ["A", "B"].filter(t => !(sc.seqMode && t === "B")).map(t => sc.cap[t] - sc.planned[t]);
  const warn = res.some(r => r < 0) ? `<a class="warn" href="#plan" data-act="cls" data-k="${ck(k)}">Der Plan ist voller als das Schuljahr: ${-Math.min(...res)} Std. fehlen. Zum Jahresplan →</a>` : "";
  return `<article class="card tcard">
    <header class="thead"><h2>${esc(UI.todayAll ? fullLabel(k) : groupName(k))}</h2><span class="badge">${sc.seqMode ? "nacheinander" : "in Strängen"}</span></header>
    ${warn}
    <div class="lessons">${body}</div>
    <section class="engine-box">
      <header><h3>Heute wiederholen</h3><span class="muted small">${es.dueCount ? `${es.dueCount} fällig` : "nichts fällig"}${es.backCount ? ` · ${es.backCount} im Altbestand` : ""}</span>
      ${es.pick.length ? `<button type="button" class="btn" data-act="quiz" data-k="${k}">Als Quiz zeigen</button>` : ""}</header>
      ${rv || `<p class="muted small">Sobald Atome im Unterricht eingeführt sind, plant die Lernübersicht hier die Wiederholungen.</p>`}
    </section>
  </article>`;
}
function slotBlock(k, ss) {
  ss = [].concat(ss);
  const s = ss[0], last = ss[ss.length - 1], dbl = ss.length > 1, keys = ss.map(x => x.key).join(",");
  const part = dbl ? 0 : dblPart(k, s);
  const tag = `<span class="per mono">${dbl ? `${s.period}.–${last.period}. Std.<br><span class="small">Doppel&shy;stunde</span>` : `${s.period}. Std.${part ? `<br><span class="small">Doppel&shy;stunde, ${part}. Teil</span>` : ""}`}</span>`;
  if (s.track === "SOL") {
    const f = s.cancelled ? null : solFormat(k, s), cu = currentUnit(k, s.date);
    return `<div class="slot sol ${s.cancelled ? "x" : ""}">${tag}<div class="sbody"><div class="stitle">FIL-Stunde${f ? ` · Format ${f}: ${esc(SOL_FORMATS[f][0])}` : " fällt aus"}</div>
      ${f ? `<div class="small">${esc(SOL_FORMATS[f][1])}${f === 2 && cu ? ` Aktuelle Einheit: ${esc(cu)} ${esc(titleOf(k, cu))}.` : ""}</div>` : ""}
      <div class="acts"><button type="button" class="btn ghost sm" data-act="solinfo">Alle Formate</button><button type="button" class="btn ghost sm" data-act="cancel" data-k="${k}" data-key="${s.key}">${s.cancelled ? "Findet doch statt" : "Fällt aus"}</button></div></div></div>`;
  }
  if (s.cancelled) return `<div class="slot x">${tag}<div class="sbody"><div class="stitle">Ausgefallen</div><div class="acts"><button type="button" class="btn ghost sm" data-act="cancel" data-k="${k}" data-key="${keys}">Findet doch statt</button></div></div></div>`;
  if (!s.lesson) return `<div class="slot">${tag}<div class="sbody"><div class="stitle">Frei: In der Sequenz ist nichts mehr geplant.</div></div></div>`;
  const L = s.lesson, infos = ss.map(x => lessonInfo(k, x.lesson)), done = ss.every(x => grp(k).done[x.key]);
  const titles = [...new Set(infos.map(i => i.title))];
  const li = { title: titles.join(" · "), atoms: infos.flatMap(i => i.atoms) };
  const sc = schedule(k);
  return `<div class="slot ${done ? "done" : ""}" style="${sty(lbOf(k, L.row.code))}">${tag}<div class="sbody">
    ${unitLink(k, L.row.code)}
    <div class="stitle">Stunde ${dbl ? `${L.n}–${last.lesson.n}` : L.n} von ${L.row.hours}: ${mx(li.title)}</div>
    ${!sc.seqMode ? `<div class="small muted">${esc(trackName(k, s.track))}</div>` : ""}
    ${checksAt(k, L.row.code, ss.map(x => x.lesson.n), L.row.id).map(x => `<div class="lcheck"><span class="pill lnp">${esc(CHECK_KINDS[x.kind])} · ${checkMin(x)} min</span>${x.title ? ` ${mx(x.title)}` : ""}</div>`).join("")}
    ${li.atoms.length ? `<div class="newatoms"><div class="lbl">Neu in dieser Stunde</div><ul>${li.atoms.map(a => `<li>${mx(a.t)}<span class="q">Check: ${mx(a.q)} <i>→ ${mx(a.a)}</i></span></li>`).join("")}</ul></div>` : ""}
    <div class="acts">
      <button type="button" class="btn ${done ? "ok" : ""} sm" data-act="done" data-k="${k}" data-key="${keys}" aria-pressed="${done}">${done ? "✓ Gehalten" : "Als gehalten markieren"}</button>
      ${L.row.code !== "P" && L.row.code !== "JA" ? `<button type="button" class="btn ghost sm" data-act="addhour" data-k="${k}" data-row="${L.row.idx}">Einheit braucht 1 Std. mehr</button>` : ""}
      <button type="button" class="btn ghost sm" data-act="cancel" data-k="${k}" data-key="${keys}">${dbl ? "Doppelstunde fällt aus" : "Fällt aus"}</button>
    </div></div></div>`;
}
function reviewItem(k, x) {
  const id = x.a.id, open = UI.reveal[k + id], task = shownTask(k, x.a, levelOf(x));
  const state = x.isNew ? `<span class="pill new">erste Wiederholung</span>` : x.backlog ? `<span class="pill">Altbestand · ${esc(fmt(x.intro))}</span>` : `<span class="pill">${Math.round(x.R * 100)} % Abruf</span>`;
  return `<div class="ritem" style="${sty(lbOf(k, x.code))}">
    <div class="rtop"><span class="chip"><b>${esc(x.code)}</b></span>${levelPill(task.l)}${state}</div>
    <div class="rq">${taskQHtml(task, open)}</div>
    ${open ? `<div class="ra${task.g ? " gen" : ""}">${taskAHtml(task)}</div><div class="rt small muted">${mx(x.a.t)}</div>${rateButtons(k, id)}` : `<div class="racts"><button type="button" class="btn ghost sm" data-act="reveal" data-id="${esc(k + id)}">Lösung zeigen</button>${genBtn(k, x.a, task)}</div>`}
  </div>`;
}
const RATES = [[1, "Nochmal", "unter 50 % richtig"], [2, "Schwer", "50–70 %"], [3, "Gut", "70–90 %"], [4, "Leicht", "über 90 %"]];
function rateButtons(k, id) {
  return `<div class="rates">${RATES.map(([g, l, h]) => `<button type="button" class="rate r${g}" data-act="rate" data-k="${k}" data-id="${esc(id)}" data-g="${g}"><b>${l}</b><span>${h}</span></button>`).join("")}</div>`;
}

/* ---------------- views: Jahresplan ---------------- */

/* ---------------- views: Jahresplan (mit Sequenz) ---------------- */
const tplSource = k => TPL[k] ? `Fachschaftsvorlage${TPL[k].exported ? ` (Stand ${fmt(TPL[k].exported, { day: "2-digit", month: "2-digit", year: "numeric" })})` : ""}` : "Lehrplan-Vorlage";
const tplDiffList = d => d.length ? `<ul class="small tpldiff">${d.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p class="small muted">Unterschiede nur bei Leistungsnachweisen oder Strängen.</p>`;
/* Stand der Sequenz gegenüber der Vorlage: folgt ihr, eigene Fassung oder neue Vorlage zur Entscheidung. */
function tplBox(g) {
  const k = ck(g), C = S.cls[k], src = tplSource(k);
  if (tplNewer(k, C)) return `<div class="card tplnote"><h3>Neue Vorlage für ${esc(D.classes[k].label)}</h3>
    <p class="small">Die ${esc(src)} hat sich geändert. Weil du die Sequenz selbst angepasst hast, wurde sie nicht automatisch übernommen. Unterschiede zu deiner Sequenz:</p>
    ${tplDiffList(tplDiff(k, C))}
    <div class="acts"><button type="button" class="btn" data-act="tpladopt" data-k="${k}">Vorlage übernehmen</button><button type="button" class="btn ghost" data-act="tplkeep" data-k="${k}">Meine Fassung behalten</button></div>
    <p class="small muted">Beim Übernehmen bleiben deine Leistungsnachweise, Termine, Stundenpläne, Ausfälle und der Lernstand erhalten. Rückgängig ist möglich.</p></div>`;
  if (!seqOwn(k, C)) return `<p class="small tplstate"><span class="pill new">folgt der Vorlage</span><span>Grundlage ist die ${esc(src)}. Änderungen der Fachschaft kommen automatisch; deine Leistungsnachweise, Termine und Abweichungen der Parallelklassen bleiben.</span></p>`;
  return `<div class="tplstate small"><span class="pill">eigene Fassung</span><span>Deine Sequenz weicht von der ${esc(src)} ab. Ändert die Fachschaft die Vorlage, erscheint hier ein Hinweis und du entscheidest selbst.</span>
    <details class="tplsum"><summary>Unterschiede zur Vorlage</summary>${tplDiffList(tplDiff(k, C))}</details></div>`;
}
/* Fest terminierte Leistungsnachweise in der Sequenz nach Termin einordnen: jeweils hinter die letzte Zeile, die vorher
   beginnt. Rein für die Anzeige – ihre Stunden hängen am Termin, nicht an der Position; die übrigen Zeilen behalten ihre
   Reihenfolge, der Plan bleibt gleich. Gibt true zurück, wenn sich etwas geändert hat. */
function sortPinnedRows(g) {
  const k = ck(g), C = S.cls[k], sc = schedule(g), before = C.seq.map(r => r.id).join();
  const pinned = sc.rows.filter(r => r.pinned && r.start && (unitOf(k, r.code) || {}).lb === "test").sort((a, b) => a.start < b.start ? -1 : a.start > b.start ? 1 : 0);
  if (!pinned.length) return false;
  const ids = new Set(pinned.map(r => r.id)), rest = C.seq.filter(r => !ids.has(r.id)), startOf = id => (sc.rows.find(y => y.id === id) || {}).start;
  pinned.forEach(p => {
    let at = 0; rest.forEach((x, j) => { const st = startOf(x.id); if (st && st < p.start) at = j + 1; });
    rest.splice(at, 0, C.seq.find(r => r.id === p.id));
  });
  if (rest.map(r => r.id).join() === before) return false;
  C.seq = rest; touch(); save(k); return true;
}
/* Jahresplan und Sequenz auf einer Seite. „Wochen“ zeigt den Plan je Kalenderwoche: Ein Klick auf eine Einheit öffnet unter
   der Woche die Bearbeiten-Leiste (Stunden, Reihenfolge im Strang, Puffer, Entfernen). Leistungsnachweise und Kontrollen
   stehen als eigene Zeilen in ihrer Woche; man zieht sie in eine andere Woche (Termin = erste Mathestunde dieser Woche) oder
   legt sie über „+ Leistungsnachweis“ in einer Woche an. „Liste“ zeigt dieselbe Planung als Reihenfolge (früher „Sequenz“). */
const isLnRow = (k, code) => (unitOf(k, code) || {}).lb === "test";
const fmtWd = d => fmt(d, { weekday: "short", day: "2-digit", month: "2-digit" });
/* Erste Mathestunde (nicht FIL, nicht ausgefallen) in der Woche ab Montag m */
function firstMathDay(g, m) { const s = schedule(g).slots.find(x => monday(x.date) === m && x.track !== "SOL" && !x.cancelled); return s ? s.date : null; }
/* Woche für „+ Leistungsnachweis“ oben: die gewählte Woche (Heute-Datum) oder die nächste mit Mathe */
function planLnWeek(g) {
  const sc = schedule(g), m0 = monday(UI.date), ok = s => s.track !== "SOL" && !s.cancelled;
  const s = sc.slots.find(x => x.date >= m0 && ok(x)) || sc.slots.find(ok);
  return s ? monday(s.date) : "";
}
/* Nachbarzeile im selben Strang (dir −1/+1); Leistungsnachweise zählen nicht, ihr Termin bestimmt die Lage. */
function strandNeighbor(g, idx, dir) {
  const sc = schedule(g), k = ck(g), r = sc.rows[idx]; if (!r) return -1;
  for (let j = idx + dir; j >= 0 && j < sc.rows.length; j += dir) { const y = sc.rows[j]; if (y.track === r.track && !isLnRow(k, y.code)) return j; }
  return -1;
}
/* Zeile im eigenen Strang vor bzw. hinter die Nachbarzeile setzen */
function moveInStrand(g, rowId, dir) {
  const k = ck(g), C = S.cls[k], i = C.seq.findIndex(r => r.id === rowId); if (i < 0) return;
  const j = strandNeighbor(g, i, dir); if (j < 0) return;
  const snap = snapshotFor(k), row = C.seq[i], other = C.seq[j];
  C.seq.splice(i, 1); const at = C.seq.indexOf(other); C.seq.splice(dir < 0 ? at : at + 1, 0, row);
  undoStack = snap; commit(k); toast(`${row.code} steht jetzt ${dir < 0 ? "vor" : "hinter"} ${other.code}.`, true);
}
/* Leistungsnachweis oder Kontrolle in eine Woche gezogen: Termin = erste Mathestunde dieser Woche */
function dropOnWeek(g, dr, m) {
  const d = firstMathDay(g, m);
  if (!d) { toast(`In KW ${isoWeek(m)} hat ${groupName(g)} keinen Mathe-Unterricht.`); return; }
  UI.planSel = null;
  if (dr.t === "chk") setCheckDate(g, dr.id, d); else setLnDate(g, dr.row, d);
}
/* Was +1 Std. bewirkt: Plan einmal mit einer Stunde mehr rechnen und wieder zurücksetzen. */
function hrsPreview(g, idx) {
  const k = ck(g), C = S.cls[k], row = C.seq[idx], r0 = schedule(g).rows[idx]; if (!row || !r0 || !r0.end) return "";
  const tr = r0.track; let r1, res1;
  row.hours++; touch();
  try { const sc1 = schedule(g); r1 = sc1.rows[idx]; res1 = sc1.cap[tr] - sc1.planned[tr]; } finally { row.hours--; touch(); }
  if (!r1) return "";
  const end = r1.overflow ? "erst nach dem Schuljahr" : r1.end !== r0.end ? `am ${fmtWd(r1.end)} statt ${fmtWd(r0.end)}` : `weiterhin am ${fmtWd(r1.end)}`;
  return `Mit <b>+1 Std.</b> endet ${esc(row.code)} ${end}; was danach im ${schedule(g).seqMode ? "Plan" : "Strang"} kommt, rückt eine Stunde nach. ${res1 < 0 ? `Dann ${res1 === -1 ? "fehlt" : "fehlen"} <b>${-res1} Std.</b> im Schuljahr.` : `Reserve danach: ${res1} Std.`}`;
}
/* Bearbeiten-Leiste unter der Woche: Einheit, Leistungsnachweis oder Kontrolle */
function planEditor(g, sel) {
  const k = ck(g), sc = schedule(g);
  const close = `<button type="button" class="iconbtn sm" data-act="psel" aria-label="Schließen">×</button>`;
  if (sel.chk) {
    const x = lnDates(g).find(y => y.inLesson && y.id === sel.chk); if (!x) return "";
    const ui = unitOrderOf(k).indexOf(x.code);
    return `<div class="pcard" style="${sty("test")}"><div class="peh"><span class="pill lnp">${esc(x.kind)} · ${x.dur} min</span><b class="pet">${esc(x.title)}</b>
      <span class="mono small muted">${x.date ? `${esc(fmtWd(x.date))}, ${x.period}. Std.` : "nicht eingeplant"}${x.code ? ` · in ${esc(x.code)}, Stunde ${x.n}` : ""}</span><span class="sp"></span>
      ${ui >= 0 && !["P", "JA"].includes(x.code) ? `<a href="#u-${k}-${ui}">In der Einheit ansehen →</a>` : ""}${close}</div>
      <div class="pebody"><div class="pec"><span class="lbl">Termin</span>${lnDateInput(g, x)}</div>
      <label class="pec"><span class="lbl">Dauer</span><select data-act="chkdur" data-id="${esc(x.id)}">${CHECK_DUR.map(d => `<option value="${d}" ${x.dur === d ? "selected" : ""}>${d} min</option>`).join("")}</select></label>
      <div class="pec">${lnDelBtn(g, x)}<span class="small muted">löschen</span></div></div>
      <p class="small muted pnote0">Eine Kontrolle kostet keine eigene Stunde. Mit 30 min bekommt die Einheit eine Stunde dazu.</p></div>`;
  }
  const idx = sc.rows.findIndex(r => r.id === sel.row); if (idx < 0) return "";
  const r = sc.rows[idx], u = unitOf(k, r.code), ui = unitOrderOf(k).indexOf(r.code), ln = isLnRow(k, r.code);
  const when = r.overflow ? `<span class="neg">${r.overflow} Std. nach Schuljahresende</span>` : r.start ? `${esc(fmtWd(r.start))} – ${esc(fmtWd(r.end))}` : "nicht eingeplant";
  const open = u && !["P", "JA"].includes(r.code) && ui >= 0 ? `<a href="#u-${k}-${ui}">${ln ? "Leistungsnachweis" : "Einheit"} öffnen →</a>` : "";
  const head = `<div class="peh"><span class="chip"><b>${esc(r.code)}</b></span><b class="pet">${esc(titleOf(k, r.code))}</b><span class="mono small muted">${when}</span>
    ${!sc.seqMode && !ln ? `<span class="small muted">${esc(trackName(g, r.track))}</span>` : ""}<span class="sp"></span>${open}${close}</div>`;
  if (ln) {
    const x = lnDates(g).find(y => !y.inLesson && y.row === r.id) || { row: r.id };
    const ds = (LN_DURS[u.kind] || [45, 90]).filter(d => d >= 45);
    return `<div class="pcard" style="${sty(lbOf(k, r.code))}">${head}<div class="pebody">
      <div class="pec"><span class="lbl">Termin</span>${lnDateInput(g, x)}</div>
      ${ds.length > 1 ? `<label class="pec"><span class="lbl">Dauer</span><select data-act="lndur" data-code="${esc(r.code)}">${ds.map(d => `<option value="${d}" ${lnDurOf(k, r.code) === d ? "selected" : ""}>${durLabel(d)}</option>`).join("")}</select></label>` : ""}
      <div class="pec">${x.code ? lnDelBtn(g, x) : ""}<span class="small muted">löschen</span></div></div>
      <p class="small muted pnote0">${esc((u.stunden || []).join(" · "))}. Ziehen am Griff ⋮⋮ in eine andere Woche legt den Termin auf deren erste Mathestunde.</p></div>`;
  }
  const prev = strandNeighbor(g, idx, -1), next = strandNeighbor(g, idx, 1), soll = u && u.stunden && u.stunden.length;
  const isP = ["P", "JA"].includes(r.code), pv = hrsPreview(g, idx);
  return `<div class="pcard" style="${sty(lbOf(k, r.code))}">${head}<div class="pebody">
    <div class="pec"><span class="lbl">Stunden</span><button type="button" class="mini" data-act="hrs" data-i="${idx}" data-n="-1" aria-label="Eine Stunde weniger">−</button><input class="num mono" type="number" min="0" max="60" value="${r.base}" data-act="hrsset" data-i="${idx}" aria-label="Stunden"><button type="button" class="mini" data-act="hrs" data-i="${idx}" data-n="1" aria-label="Eine Stunde mehr">+</button>
      ${soll && !isP ? `<span class="small muted">Soll ${soll}</span>` : ""}${r.extra ? `<span class="soll small adj">+${r.extra} für Kontrolle</span>` : ""}${r.adj ? `<span class="soll small adj">${esc(groupName(g))}: ${r.adj > 0 ? "+" : ""}${r.adj}</span>` : ""}</div>
    <div class="pec"><span class="lbl">Reihenfolge</span><button type="button" class="btn ghost sm" data-act="pmv" data-row="${esc(r.id)}" data-n="-1" ${prev < 0 ? "disabled" : ""}>↑ ${prev < 0 ? "früher" : "vor " + esc(sc.rows[prev].code)}</button><button type="button" class="btn ghost sm" data-act="pmv" data-row="${esc(r.id)}" data-n="1" ${next < 0 ? "disabled" : ""}>↓ ${next < 0 ? "später" : "nach " + esc(sc.rows[next].code)}</button></div>
    ${!sc.seqMode ? `<label class="pec"><span class="lbl">Strang</span><select data-act="strand" data-i="${idx}" aria-label="Strang"><option ${r.strand !== "B" ? "selected" : ""}>A</option><option ${r.strand === "B" ? "selected" : ""}>B</option></select></label>` : ""}
    <div class="pec"><button type="button" class="btn ghost sm" data-act="addp" data-i="${idx}">+ Puffer danach</button><button type="button" class="btn ghost sm pdel" data-act="del" data-i="${idx}">${isP ? "Puffer entfernen" : "Aus dem Plan nehmen"}</button></div></div>
    ${pv ? `<p class="pnote">${pv}</p>` : ""}</div>`;
}
/* Formular „Leistungsnachweis in KW …“: Art, Thema, Dauer, Tag der Woche */
function planLnForm(g, m) {
  const sc = schedule(g), K0 = LN_KINDS.ka, first = firstMathDay(g, m);
  const days = [0, 1, 2, 3, 4].map(i => addDays(m, i)).map(d => {
    const ms = (sc.byDate[d] || []).filter(s => s.track !== "SOL" && !s.cancelled), info = sc.dayInfo[d], off = !ms.length;
    const sub = off ? (info && !info.school ? info.note : "kein Mathe") : ms.length > 1 ? `${ms.length} Std.` : "1 Std.";
    return `<label class="pday${off ? " off" : ""}"><input type="radio" name="plnday" value="${d}" ${d === first ? "checked" : ""} ${off ? "disabled" : ""}><span>${DAYS[dow(d)]} ${esc(fmt(d))}</span><span class="small mono">${esc(sub)}</span></label>`;
  }).join("");
  return `<div class="pcard plnf" style="${sty("test")}"><div class="peh"><b class="pet">Leistungsnachweis in KW ${isoWeek(m)}</b><span class="mono small muted">${esc(fmt(m))}–${esc(fmt(addDays(m, 4)))}</span><span class="sp"></span><button type="button" class="iconbtn sm" data-act="plnform" data-wk="" aria-label="Schließen">×</button></div>
    <div class="pebody">
      <label class="pec"><span class="lbl">Art</span><select id="plnkind">${Object.entries(LN_KINDS).map(([v, K]) => `<option value="${v}">${esc(K.label)}</option>`).join("")}</select></label>
      <label class="pec pwide"><span class="lbl">Thema</span><input id="plntopic" placeholder="z. B. Lineare Funktionen"></label>
      <label class="pec"><span class="lbl">Dauer</span><select id="plndur">${durOptions("ka", K0.dur)}</select></label>
      <label class="pec"><input type="checkbox" id="plnwdh" ${K0.wdh ? "checked" : ""}> Wiederholung davor</label>
      <label class="pec"><input type="checkbox" id="plnrueck" ${K0.rueck ? "checked" : ""}> Rückgabe danach</label></div>
    <div class="pdays" role="radiogroup" aria-label="Tag">${days}</div>
    <div class="peh"><span class="small muted">Die Einheiten rücken nach. Tests mit 20 oder 30 min laufen in einer Stunde mit und kosten keine eigene Stunde.</span><span class="sp"></span><button type="button" class="btn" data-act="plnadd" data-wk="${m}">Eintragen</button></div></div>`;
}
/* Ein Eintrag in der Wochenzelle: Einheit, Leistungsnachweis (Zeile der Sequenz) oder Kontrolle */
function planItem(g, m, it) {
  const k = ck(g), sel = UI.planSel;
  if (it.chk) {
    const x = it.chk, on = sel && sel.chk === x.id;
    return `<button type="button" class="pln chk${on ? " sel" : ""}" style="${sty("test")}" draggable="true" data-drag="chk" data-id="${esc(x.id)}" data-act="psel" data-chk="${esc(x.id)}" data-wk="${m}" title="Zum Verschieben in eine andere Woche ziehen">
      <span class="grip" aria-hidden="true">⋮⋮</span><span class="pill lnp">${esc(x.kind)} · ${x.dur} min</span><span class="put">${esc(x.title)}</span><span class="when">${esc(fmtWd(x.date))}, ${x.period}. Std.</span>${x.pinned ? `<span class="pill lnp">fest</span>` : ""}</button>`;
  }
  const row = it.row, on = sel && sel.row === row.id, st = sty(lbOf(k, row.code));
  const hrs = `<span class="hrs mono">${it.n} Std.${it.done ? ` · ${it.done}✓` : ""}</span>`;
  if (isLnRow(k, row.code)) {
    const main = row.slots[lnMain(k, row.code, row.hours)], here = main && monday(main.date) === m, u = unitOf(k, row.code);
    const parts = [...new Set(it.ns.map(n => (u.stunden || [])[n - 1]).filter(Boolean))].join(", ");
    return `<button type="button" class="pln${on ? " sel" : ""}${here ? "" : " part"}" style="${st}" ${here ? `draggable="true" data-drag="ln" title="Zum Verschieben in eine andere Woche ziehen"` : ""} data-act="psel" data-row="${esc(row.id)}" data-wk="${m}">
      ${here ? `<span class="grip" aria-hidden="true">⋮⋮</span>` : ""}<b>${esc(row.code)}</b><span class="put">${esc(here ? titleOf(k, row.code) : parts || titleOf(k, row.code))}</span>${here ? `<span class="when">${esc(fmtWd(main.date))}, ${main.period}. Std.</span>${row.pinned ? `<span class="pill lnp">fest</span>` : ""}` : ""}${hrs}</button>`;
  }
  return `<button type="button" class="pu${on ? " sel" : ""}" style="${st}" data-act="psel" data-row="${esc(row.id)}" data-wk="${m}"><b>${esc(row.code)}</b><span class="put">${esc(titleOf(k, row.code))}</span>${hrs}</button>`;
}
function planWeeks(g) {
  const k = ck(g), sc = schedule(g), Y = cal(), today = todayIso(), G = grp(g);
  const trs = sc.seqMode ? ["A"] : ["A", "B"], sol = sc.slots.some(s => s.track === "SOL"), ncols = 3 + trs.length + (sol ? 1 : 0);
  const byWk = {}; sc.slots.forEach(s => { const m = monday(s.date); (byWk[m] || (byWk[m] = [])).push(s); });
  const chks = lnDates(g).filter(x => x.inLesson && x.date);
  let rows = "";
  if (Y.start && Y.end) for (let m = monday(Y.start); m <= Y.end; m = addDays(m, 7)) {
    const notes = new Set(); let school = 0;
    for (let i = 0; i < 5; i++) { const di = sc.dayInfo[addDays(m, i)]; if (!di) continue; if (di.school) school++; else notes.add(di.note); }
    (G.tt || []).forEach(v => { if (v.frm && v.frm > Y.start && monday(v.frm) === m) notes.add("neuer Stundenplan ab " + fmt(v.frm)); });
    const ws = byWk[m] || [], math = ws.some(s => s.track !== "SOL" && !s.cancelled);
    const cells = trs.map(tr => {
      const items = [];
      ws.filter(s => s.track === tr).forEach(s => {
        if (s.cancelled) { const x = items.find(y => y.x); if (x) x.x++; else items.push({ x: 1, key: s.date + s.period }); return; }
        if (!s.lesson) return; const row = s.lesson.row;
        let it = items.find(y => y.row === row); if (!it) items.push(it = { row, n: 0, done: 0, ns: [], key: s.date + String(s.period).padStart(2, "0") });
        it.n++; it.ns.push(s.lesson.n); if (G.done[s.key]) it.done++;
      });
      chks.forEach(x => { const s = ws.find(y => y.date === x.date && y.period === x.period); if (s && s.track === tr) items.push({ chk: x, key: x.date + String(x.period).padStart(2, "0") + "z" }); });
      items.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
      return `<td>${items.map(it => it.x ? `<span class="xchip">${it.x}× ausgefallen</span>` : planItem(g, m, it)).join("")}</td>`;
    }).join("");
    const solCell = sol ? `<td class="small fil">${ws.filter(s => s.track === "SOL").map(s => s.cancelled ? "ausgefallen" : `F${solFormat(g, s)} ${esc(SOL_FORMATS[solFormat(g, s)][0])}`).join("<br>")}</td>` : "";
    const cur = m === monday(today);
    rows += `<tr class="${school === 0 ? "hol" : ""} ${cur ? "cur" : ""}" ${cur ? 'id="curweek"' : ""} ${math ? `data-wk="${m}"` : ""}><td class="mono">${isoWeek(m)}</td><td class="mono nowrap">${fmt(m)}<span class="wend">–${fmt(addDays(m, 4))}</span></td><td class="note">${esc([...notes].join(", "))}${math ? `<button type="button" class="linkbtn small padd" data-act="plnform" data-wk="${m}">+ Leistungs&shy;nachweis</button>` : ""}</td>${school === 0 ? `<td colspan="${trs.length}"></td>${sol ? `<td class="fil"></td>` : ""}` : cells + solCell}</tr>`;
    if (UI.planSel && UI.planSel.wk === m) { const ed = planEditor(g, UI.planSel); if (ed) rows += `<tr class="pedit"><td colspan="${ncols}">${ed}</td></tr>`; }
    if (UI.planLn === m && math) rows += `<tr class="pedit"><td colspan="${ncols}">${planLnForm(g, m)}</td></tr>`;
  }
  return `<p class="small muted phint">Einheit anklicken: Stunden ändern, im Strang verschieben, Puffer einfügen. Leistungsnachweise am Griff ⋮⋮ in eine andere Woche ziehen (Termin = erste Mathestunde der Woche) oder anklicken und ein Datum wählen.</p>
    <div class="tscroll"><table class="plan"><thead><tr><th>KW</th><th>Woche</th><th>Hinweis</th>${trs.map(t => `<th>${esc(trackName(g, t))}</th>`).join("")}${sol ? `<th class="fil">FIL</th>` : ""}</tr></thead><tbody>${rows}</tbody></table></div>`;
}
/* Zeile hinzufügen (Liste und „+ Einheit / Puffer“ in der Wochenansicht) */
function addRowCard(g) {
  const k = ck(g), C = S.cls[k], sc = schedule(g), used = new Set(C.seq.map(r => r.code));
  const avail = unitOrderOf(g).filter(code => !isLnRow(g, code) && code !== "P" && code !== "JA" && !used.has(code));
  const generic = [["P", "Puffer · Wiederholung"]].concat(unitOf(g, "JA") || used.has("JA") ? [["JA", "Jahresabschluss"]] : []);
  return `<div class="addrow card">
      <label>Zeile hinzufügen <select id="addcode"><optgroup label="Allgemein">${generic.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("")}</optgroup>${avail.length ? `<optgroup label="Noch nicht eingeplante Einheiten">${avail.map(code => `<option value="${esc(code)}">${esc(code)} · ${esc(titleOf(g, code))}</option>`).join("")}</optgroup>` : ""}</select></label>
      <label>Strang <select id="addstrand" ${sc.seqMode ? "disabled" : ""}><option>A</option><option>B</option></select></label>
      <label>Stunden <input id="addhrs" class="num" type="number" min="0" value="1"></label>
      <button type="button" class="btn" data-act="addrow">Am Ende anfügen</button>
    </div>`;
}
/* Liste: dieselbe Planung als Reihenfolge (frühere Seite „Sequenz“) */
function planList(g) {
  const k = ck(g), sc = schedule(g);
  const rows = sc.rows.map((r, i) => {
    const when = r.overflow ? `<span class="neg">${r.slots.length ? fmt(r.start) + " – " : ""}${r.overflow} Std. nach Schuljahresende</span>` : r.start ? `${fmt(r.start)} – ${fmt(r.end)}` : r.hours === 0 ? "—" : "";
    return `<tr style="${sty(lbOf(k, r.code))}">
      <td class="mono muted">${i + 1}</td>
      <td><span class="chip"><b>${esc(r.code)}</b></span></td>
      <td class="ttl">${r.pinned ? `<span class="pill lnp" title="Fester Termin">fest ${esc(fmt(r.pinned))}</span> ` : ""}${unitOf(k, r.code) && !["P", "JA"].includes(r.code) ? `<a href="#u-${k}-${unitOrderOf(k).indexOf(r.code)}">${esc(titleOf(k, r.code))}</a>` : esc(titleOf(k, r.code))}</td>
      <td>${isLnRow(k, r.code) ? `<span class="muted" title="${r.pinned ? "Leistungsnachweise mit Termin gehören zu keinem Strang: Sie liegen am Termin, die Einheiten laufen darum herum." : "Ohne Termin läuft der Leistungsnachweis im Strang der Einheit davor."}">–</span>` : `<select data-act="strand" data-i="${i}" aria-label="Strang" ${sc.seqMode ? "disabled" : ""}><option ${r.strand !== "B" ? "selected" : ""}>A</option><option ${r.strand === "B" ? "selected" : ""}>B</option></select>`}</td>
      <td class="nowrap"><button type="button" class="mini" data-act="hrs" data-i="${i}" data-n="-1" aria-label="Eine Stunde weniger">−</button><input class="num mono" type="number" min="0" max="60" value="${r.base}" data-act="hrsset" data-i="${i}" aria-label="Stunden"><button type="button" class="mini" data-act="hrs" data-i="${i}" data-n="1" aria-label="Eine Stunde mehr">+</button>
        ${r.extra ? `<span class="soll small adj" title="Kontrollen mit 30 min belegen Stunden (${esc(groupName(g))})">+${r.extra} für Kontrolle</span>` : ""}${r.adj ? `<span class="soll small adj" title="Abweichung nur für ${esc(groupName(g))}">${esc(groupName(g))}: ${r.adj > 0 ? "+" : ""}${r.adj}</span>` : ""}${unitOf(k, r.code) && unitOf(k, r.code).stunden.length && r.base !== unitOf(k, r.code).stunden.length ? `<span class="soll small muted">Soll ${unitOf(k, r.code).stunden.length}</span>` : ""}</td>
      <td class="mono small nowrap">${when}</td>
      <td class="nowrap"><div class="rowacts"><button type="button" class="mini" data-act="mv" data-i="${i}" data-n="-1" aria-label="Nach oben" ${i === 0 ? "disabled" : ""}>↑</button><button type="button" class="mini" data-act="mv" data-i="${i}" data-n="1" aria-label="Nach unten" ${i === sc.rows.length - 1 ? "disabled" : ""}>↓</button><button type="button" class="mini" data-act="addp" data-i="${i}" title="Puffer darunter einfügen">+P</button><button type="button" class="mini del" data-act="del" data-i="${i}" aria-label="Zeile löschen">×</button></div></td>
    </tr>`;
  }).join("");
  return `<p class="small muted">${sc.seqMode ? "Alle Stunden laufen in einem Strang, genau in der Reihenfolge unten." : "Jede Zeile läuft in ihrem Strang; innerhalb eines Strangs gilt die Reihenfolge unten."}</p>
    <div class="tscroll"><table class="seq"><thead><tr><th>#</th><th>Kürzel</th><th>Einheit</th><th>Strang</th><th>Stunden</th><th>Zeitraum</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    ${addRowCard(g)}${lnCard(g)}`;
}
/* „Mehr …“: seltene Funktionen (Vorlage, Stunden je Lernbereich, Zurücksetzen) */
function planMore(g, list) {
  const k = ck(g), C = S.cls[k], c = D.classes[k], lbh = lbHours(g), multi = C.groups.length > 1;
  const lbRows = Object.entries(c.lbnames).filter(([lb]) => lbh[lb] || c.zrw[lb]).map(([lb, n]) => {
    const z = c.zrw[lb], h = lbh[lb] || 0;
    return `<div class="lbrow" style="${sty(lb)}"><span class="chip"><b>${esc(lb.startsWith("LB") ? "LB " + lb.slice(2) : lb === "WB" ? "WB" : lb === "test" ? "KA" : lb === "start" ? "Start" : "P")}</b></span><span class="n">${esc(n)}</span><span class="mono">${h} Std.${z ? ` <span class="muted">/ ${z}</span>` : ""}</span></div>`;
  }).join("");
  const confirm = UI.confirm === "reset-" + g;
  return `<details class="card pmore" ${UI.planMore ? "open" : ""}><summary><b>Mehr …</b> <span class="small muted">Vorlage, Stunden je Lernbereich, Zurücksetzen</span></summary>
    ${!list && !tplNewer(k, C) ? tplBox(g) : ""}
    ${multi ? `<p class="small">Die Reihenfolge gilt für alle Parallelklassen. Termine und Kapazität gelten für <b>${esc(groupName(g))}</b>; „Einheit braucht 1 Std. mehr“ und Ausfälle wirken nur dort und erscheinen als Abweichung neben den Stunden.</p>` : ""}
    <div class="grid2">
      <div class="card"><h3>Stunden je Lernbereich</h3><p class="small muted">geplant / Zeitrichtwert des Lehrplans</p>${lbRows}</div>
      <div class="card"><h3>Hinterherhängen?</h3><p class="small">Auf der Heute-Seite gibt es dafür zwei Knöpfe. „Einheit braucht 1 Std. mehr“ verlängert die laufende Einheit, „Fällt aus“ streicht eine Stunde. ${S.settings.autoBuffer ? "In beiden Fällen kürzt die App automatisch den nächsten Puffer im selben Strang, damit das Schuljahr aufgeht." : "Puffer werden nicht automatisch gekürzt (Einstellungen)."} Im Jahresplan kannst du Puffer (P) auch von Hand verschieben oder kürzen.</p>
      ${confirm ? `<div class="confirm"><span>Plan von ${esc(c.label)} auf die Vorlage zurücksetzen? Deine Änderungen an Reihenfolge und Stunden gehen verloren.</span><button type="button" class="btn danger" data-act="reset" data-k="${k}">Zurücksetzen</button><button type="button" class="btn ghost" data-act="confirm" data-v="">Abbrechen</button></div>` : `<button type="button" class="btn ghost" data-act="confirm" data-v="reset-${g}">Auf Vorlage zurücksetzen</button>`}</div>
    </div></details>`;
}
/* In Strängen, aber ein Strang ohne Wochenstunden oder ohne Einheiten: Hinweis mit Zuordnen-Dialog */
function strandWarn(g) {
  const sc = schedule(g); if (sc.seqMode) return "";
  const miss = ["A", "B"].filter(t => !sc.cap[t] || !sc.planned[t]); if (!miss.length) return "";
  const why = miss.map(t => `Strang ${t} hat ${!sc.cap[t] ? "keine Wochenstunden im Stundenplan" : "keine Einheiten"}`).join(", ");
  return `<div class="warnbox small">${esc(why)}. <button type="button" class="linkbtn small" data-act="sdopen" data-k="${ck(g)}">Lernbereiche und Stunden zuordnen …</button></div>`;
}
function viewPlan() {
  const g = curG(); sortPinnedRows(g);
  const k = ck(g), C = S.cls[k], list = UI.planView === "list";
  return `<section><div class="vhead"><h1>Jahresplan</h1>${clsTabs()}</div>
    ${tplNewer(k, C) || list ? tplBox(g) : ""}
    <div class="ptools">
      <div class="seg small" role="group" aria-label="Ansicht">${[["weeks", "Wochen"], ["list", "Liste"]].map(([v, l]) => `<button type="button" aria-selected="${(v === "list") === list}" data-act="planview" data-v="${v}">${l}</button>`).join("")}</div>
      <div class="seg small" role="group" aria-label="Modus">${[["Stränge", "In Strängen"], ["nacheinander", "Nacheinander"]].map(([v, l]) => `<button type="button" aria-selected="${C.mode === v}" data-act="mode" data-k="${k}" data-v="${v}">${l}</button>`).join("")}</div>
      ${C.mode === "Stränge" ? `<button type="button" class="linkbtn small" data-act="sdopen" data-k="${k}">Stränge zuordnen …</button>` : ""}
      <span class="sp"></span>
      ${list ? "" : `<button type="button" class="btn ghost sm" data-act="paddrow" aria-expanded="${!!UI.planAdd}">+ Einheit / Puffer</button><button type="button" class="btn sm" data-act="plnform" data-wk="${planLnWeek(g)}">+ Leistungsnachweis</button>`}
    </div>
    ${capCards(g)}
    ${strandWarn(g)}
    ${!list && UI.planAdd ? addRowCard(g) : ""}
    ${list ? planList(g) : planWeeks(g)}
    ${planMore(g, list)}</section>`;
}


/* Datumsfeld eines Leistungsnachweises: Datum eingeben genügt, der Plan passt sich an. */
function lnDateInput(k, x) {
  const Y = cal(), v = x.date || "";
  const inp = x.inLesson ? dpButton({ t: "chk", id: x.id }, v) : dpButton({ t: "ln", row: x.row }, v);
  return `<span class="lndate">${inp}<span class="mono small muted">${x.date ? `${DAYS[dow(x.date)]}, ${x.period}. Std.` : `<span class="neg">nicht eingeplant</span>`}</span>${x.pinned ? `<span class="pill lnp" title="${x.inLesson ? "Fester Termin: liegt in der ersten Mathestunde dieses Tages" : `Fester Termin für ${esc(groupName(k))}`}">fest</span>${x.inLesson ? `<button type="button" class="linkbtn small" data-act="chkunpin" data-id="${esc(x.id)}" data-k="${k}">lösen</button>` : `<button type="button" class="linkbtn small" data-act="lnunpin" data-row="${esc(x.row)}" data-k="${k}">lösen</button>`}` : ""}</span>`;
}
/* ---------------- Kalender für Termine ----------------
   Eigener Monatskalender statt des Browser-Datumsfelds: markiert Ferien und schulfreie Tage, Tage mit Mathe-Unterricht
   der gewählten (Parallel-)Klasse (Doppelstunden mit „2“) und Tage mit anderen Leistungsnachweisen. Jeder Tag im
   Schuljahr ist wählbar; liegt dort keine Mathestunde, nimmt der Plan wie bisher die nächste.
   Ziel (t): "ln" = fester Termin einer Sequenzzeile (row), "chk" = Kontrolle (id), "form" = Formular „Leistungsnachweis anlegen“. */
const fmtDp = d => d ? fmt(d, { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }) : "";
const dpData = o => Object.entries(o).map(([a, b]) => `data-${a}="${esc(b)}"`).join(" ");
function dpButton(target, value) {
  return `<button type="button" class="dpbtn" data-act="dp" ${dpData(target)} data-v="${esc(value || "")}" aria-haspopup="dialog">${value ? esc(fmtDp(value)) : "Datum wählen"}<span class="dpico" aria-hidden="true">▦</span></button>`;
}
function dpOpen(b) {
  const Y = cal(), v = b.dataset.v || "", r = b.getBoundingClientRect();
  const start = v || (UI.date >= Y.start && UI.date <= Y.end ? UI.date : Y.start);
  UI.dp = { t: b.dataset.t, row: b.dataset.row, id: b.dataset.id, v, month: start.slice(0, 7), x: r.left + window.scrollX, y: r.bottom + window.scrollY + 4 };
  renderDp();
}
function dpClose() { UI.dp = null; renderDp(); }
function dpMove(n) { const [y, m] = UI.dp.month.split("-").map(Number), d = new Date(Date.UTC(y, m - 1 + n, 1)); UI.dp.month = d.toISOString().slice(0, 7); renderDp(); }
function renderDp() {
  let el = document.getElementById("dpop");
  if (!UI.dp) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement("div"); el.id = "dpop"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Termin wählen"); document.body.appendChild(el); }
  // Auf der Heute-Seite mit „Alle meine Klassen“ zählen Mathe-Tage und Leistungsnachweise aller eigenen (Parallel-)Klassen
  const dp = UI.dp, all = dp.t === "today" && UI.todayAll, gs = all ? myGroups() : curG() ? [curG()] : [];
  const Y = cal(), scs = gs.map(schedule), [yy, mm] = dp.month.split("-").map(Number);
  const first = `${dp.month}-01`, days = new Date(Date.UTC(yy, mm, 0)).getUTCDate(), lead = (dow(first) + 6) % 7;
  const own = dp.t === "ln" ? dp.row : dp.t === "chk" ? dp.id : null;
  const lnOn = {}; gs.forEach(g => lnDates(g).forEach(x => { if (x.date && (x.inLesson ? x.id : x.row) !== own) (lnOn[x.date] = lnOn[x.date] || []).push(`${gs.length > 1 ? groupName(g) + ": " : ""}${x.kind}${x.inLesson ? "" : " " + x.code}`); }));
  const holi = d => { for (const h of Y.holidays || []) if (h.frm && h.to && h.frm <= d && d <= h.to) return h.name || "Ferien"; const f = (Y.free || []).find(x => x.date === d); return f ? f.name || "unterrichtsfrei" : null; };
  let cells = "";
  for (let i = 0; i < lead; i++) cells += `<span class="dpc pad"></span>`;
  for (let n = 1; n <= days; n++) {
    const d = `${dp.month}-${String(n).padStart(2, "0")}`, w = dow(d), inYear = d >= Y.start && d <= Y.end;
    const hn = holi(d), info = scs.length === 1 ? scs[0].dayInfo[d] : hn ? { school: false, note: hn } : (inYear && w <= 5 ? { school: true } : null);
    const per = scs.map(sc => (sc.byDate[d] || []).filter(x => x.track !== "SOL" && !x.cancelled)), math = per.flat();
    const dbl = per.some(m => m.some(x => m.some(y => y.period === x.period + 1)));
    const off = w > 5 || (info && !info.school), cls = ["dpc", w > 5 ? "we" : "", info && !info.school ? "off" : "", math.length ? "math" : "", d === dp.v ? "sel" : "", d === todayIso() ? "today" : ""].filter(Boolean).join(" ");
    const mtxt = gs.length > 1 ? per.map((m, i) => m.length ? `${groupName(gs[i])} ${m.map(x => x.period + ".").join(", ")} Std.` : "").filter(Boolean).join(", ") : math.map(x => x.period + ".").join(", ") + " Std.";
    const tip = [fmtDp(d), info && !info.school ? info.note : "", math.length ? `Mathe: ${mtxt}` : (!off && inYear ? "keine Mathestunde" : ""), ...(lnOn[d] || [])].filter(Boolean).join(" · ");
    cells += inYear ? `<button type="button" class="${cls}" data-act="dpday" data-d="${d}" title="${esc(tip)}" aria-label="${esc(tip)}">${n}${dbl ? `<i class="dp2">2</i>` : ""}${lnOn[d] ? `<i class="dpdot"></i>` : ""}</button>`
      : `<span class="${cls} out" title="${esc(fmtDp(d))}: außerhalb des Schuljahres">${n}</span>`;
  }
  const can = n => { const [y2, m2] = dp.month.split("-").map(Number), d = new Date(Date.UTC(y2, m2 - 1 + n, 1)).toISOString().slice(0, 7); return n < 0 ? d >= Y.start.slice(0, 7) : d <= Y.end.slice(0, 7); };
  el.innerHTML = `<div class="dph"><button type="button" class="mini" data-act="dpmove" data-n="-1" ${can(-1) ? "" : "disabled"} aria-label="Vormonat">‹</button>
      <b>${esc(new Date(Date.UTC(yy, mm - 1, 1)).toLocaleDateString("de-DE", { month: "long", year: "numeric", timeZone: "UTC" }))}</b>
      <button type="button" class="mini" data-act="dpmove" data-n="1" ${can(1) ? "" : "disabled"} aria-label="Nächster Monat">›</button>
      <button type="button" class="iconbtn sm" data-act="dpclose" aria-label="Schließen">×</button></div>
    <div class="dpg">${["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map(x => `<span class="dpw">${x}</span>`).join("")}${cells}</div>
    <div class="dpl small"><span><i class="lg math"></i>Mathe (${esc(all ? "alle meine Klassen" : gs.length ? groupName(gs[0]) : "keine Klasse")})</span><span><i class="dp2">2</i> Doppelstunde</span><span><i class="lg off"></i>Ferien / frei</span><span><i class="dpdot"></i> Leistungsnachweis</span></div>`;
  const w = Math.min(300, window.innerWidth - 16), x = Math.max(8, Math.min(dp.x, window.scrollX + window.innerWidth - w - 8));
  el.style.left = x + "px"; el.style.top = dp.y + "px"; el.style.width = w + "px";
}
function dpPick(d) {
  const dp = UI.dp; if (!dp) return; UI.dp = null; renderDp();
  if (dp.t === "today") { UI.date = d; render(); }
  else if (dp.t === "ln") setLnDate(curG(), dp.row, d);
  else if (dp.t === "chk") setCheckDate(curG(), dp.id, d);
  else { const inp = document.getElementById("lndate"), b = document.querySelector('.dpbtn[data-t="form"]'); if (inp) inp.value = d; if (b) { b.dataset.v = d; b.innerHTML = `${esc(fmtDp(d))}<span class="dpico" aria-hidden="true">▦</span>`; } }
}
/* Kurzer Test: Wiederholungs- und Rückgabestunde entfallen, die Felder werden ausgegraut. */
function lnFormSync(p = "ln") {
  const v = id => document.getElementById(id), d = v(p + "dur"); if (!d) return;
  const short = +d.value < 45; [p + "wdh", p + "rueck"].forEach(id => { const e = v(id); if (e) { e.disabled = short; e.closest("label").classList.toggle("off", short); } });
}
function lnCard(k) {
  const C = S.cls[ck(k)], sc = schedule(k), cur = currentUnit(k, UI.date);
  let defAfter = C.seq.length - 1; if (cur) { const j = C.seq.map(r => r.code).lastIndexOf(cur); if (j >= 0) defAfter = j; }
  const K0 = LN_KINDS.ka;
  const list = lnDates(k).map(x => `<tr><td class="nowrap">${lnDateInput(k, x)}</td>
    <td><span class="pill">${esc(x.kind)} · ${x.dur} min</span></td><td>${x.inLesson && x.pinned ? esc(x.title) : `${unitLink(k, x.code)} ${x.inLesson ? `<span class="small muted">Stunde ${x.n}</span> ${esc(x.title)}` : ""}`}</td><td class="nowrap right">${lnDelBtn(k, x)}</td></tr>`).join("");
  return `<div class="card lncard"><h3>Leistungsnachweise</h3>
    <div class="lnform"><div class="lnformh">Leistungsnachweis anlegen</div>
      <label>Art <select id="lnkind">${Object.entries(LN_KINDS).map(([v, K]) => `<option value="${v}">${esc(K.label)}</option>`).join("")}</select></label>
      <label class="wide">Thema <input id="lntopic" placeholder="z. B. Lineare Funktionen"></label>
      <label>Dauer <select id="lndur">${durOptions("ka", K0.dur)}</select></label>
      <label class="chk"><input type="checkbox" id="lnwdh" ${K0.wdh ? "checked" : ""}> Wiederholungsstunde davor</label>
      <label class="chk"><input type="checkbox" id="lnrueck" ${K0.rueck ? "checked" : ""}> Rückgabe und Berichtigung</label>
      <label>Termin <span class="dpwrap"><input type="hidden" id="lndate" value="">${dpButton({ t: "form" }, "")}</span></label>
      <label class="wide">ohne Termin: einfügen nach <select id="lnafter">${sc.rows.map((r, i) => `<option value="${i}" ${i === defAfter ? "selected" : ""}>${i + 1}. ${esc(r.code)} · ${esc(titleOf(k, r.code))}${r.end ? ` (bis ${fmt(r.end)})` : ""}</option>`).join("")}</select></label>
      <button type="button" class="btn" data-act="lnadd">Anlegen</button>
    </div>
    ${list ? `<div class="tscroll"><table class="form lnlist"><tbody>${list}</tbody></table></div>` : `<p class="small muted">Noch keine Leistungsnachweise in der Sequenz.</p>`}
    <p class="small muted">Mit Termin liegt der neue Leistungsnachweis fest an diesem Tag, ohne Termin hinter der gewählten Zeile. Termin ändern: einfach ein Datum eingeben. Die Arbeit liegt dann fest an diesem Tag${S.cls[ck(k)].groups.length > 1 ? ` (für ${esc(groupName(k))})` : ""}, der übrige Plan läuft darum herum; „lösen“ gibt den Termin wieder frei. Klassenarbeit, Klausur, Test, Präsentation und Projekt bekommen eigene Stunden in der Sequenz, der Plan rückt nach. Kurzkontrollen und andere Bewertungen in einer Stunde legst du in der Einheit bei der jeweiligen Stunde an („+ Kontrolle“).</p></div>`;
}

/* ---------------- views: Einheiten ---------------- */
function viewUnits() {
  const k = curG(), c = D.classes[ck(k)], sc = schedule(k);
  const rowOf = {}; sc.rows.forEach(r => { if (!rowOf[r.code]) rowOf[r.code] = r; });
  const groups = {};
  unitOrderOf(k).filter(code => code !== "P" && code !== "JA" && (unitOf(k, code) || {}).lb !== "test").forEach(code => { const lb = lbOf(k, code); (groups[lb] || (groups[lb] = [])).push(code); });
  const order = ["start", "LB1", "LB2", "LB3", "LB4", "LB5", "LB6", "LB7", "LB8", "LB9", "WB", "test"];
  return `<section><div class="vhead"><h1>Einheiten</h1>${clsTabs()}</div>
    ${c.ziele && c.ziele.length ? `<details class="card ziele"><summary><b>Ziele der Klassenstufe</b> <span class="small muted">Lehrplan Sachsen${c.variantLabel ? " · " + esc(c.variantLabel) : ""}</span></summary>${c.ziele.map(([h, t]) => `<p><b>${esc(h)}</b><br>${mx(t)}</p>`).join("")}</details>` : ""}
    ${order.filter(lb => groups[lb]).map(lb => `<h2 class="lbh" style="${sty(lb)}">${esc(lb === "test" ? "Leistungsnachweise" : c.lbnames[lb] || lb)}</h2>
    <div class="ugrid">${groups[lb].map(code => {
      const u = unitOf(k, code), r = rowOf[code], i = unitOrderOf(k).indexOf(code);
      return `<a class="ucard" href="#u-${ck(k)}-${i}" style="${sty(lb)}"><span class="chip"><b>${esc(code)}</b></span><span class="ut">${esc(u.title)}</span>
        <span class="um small muted mono">${r ? `${r.hours} Std.${r.start ? " · " + fmt(r.start) + "–" + fmt(r.end) : ""}` : "nicht in der Sequenz"} · ${atomsOf(k, code).length} Atome</span></a>`;
    }).join("")}</div>`).join("")}</section>`;
}
function viewUnit(kc, idx) {
  const k = curG() && ck(curG()) === kc ? curG() : gkey(kc, S.cls[kc].groups[0].id);
  const c = D.classes[ck(k)], order = unitOrderOf(k), code = order[idx], u = unitOf(k, code);
  if (!u) return `<p>Einheit nicht gefunden.</p>`;
  const E = S.eng[k], atoms = atomsOf(k, code), { r, blocks } = unitBlocks(k, code);
  const list = (t, a) => a && a.length ? `<div class="box"><h3>${t}</h3><ul>${a.map(x => `<li>${mx(x)}</li>`).join("")}</ul></div>` : "";
  const titleOfN = n => u.stunden[n - 1] || (r && n <= r.hours ? "Übung und Vertiefung" : "(über die geplanten Stunden hinaus)");
  let lessons = "";
  blocks.forEach((ns, bi) => {
    const n = ns[0], nz = ns[ns.length - 1], dbl = ns.length > 1, slots = ns.map(x => r && r.slots[x - 1]).filter(Boolean), s0 = slots[0];
    const when = s0 ? fmt(s0.date, { weekday: "short", day: "2-digit", month: "2-digit" }) + ` · ${s0.period}.${dbl ? `–${slots[slots.length - 1].period}.` : ""} Std.` + (!dbl && dblPart(k, s0) ? ` (Doppelstunde, ${dblPart(k, s0)}. Teil)` : "") + (slots.every(x => grp(k).done[x.key]) ? " ✓" : "") : r && n > r.hours ? "nicht eingeplant" : "";
    const capNote = r && r.blocked ? ns.filter(x => r.blocked[x] !== undefined).map(x => r.blocked[x] === 0 ? `Stunde ${x}: Kontrolle (30 min) – keine neuen Atome` : `Stunde ${x}: Kontrolle (20 min) – höchstens ein neues Atom`) : [];
    const la = atoms.filter(a => ns.includes(a.l)), nav = { up: bi > 0 ? blocks[bi - 1][0] : 0, down: bi < blocks.length - 1 ? blocks[bi + 1][0] : 0 };
    lessons += `<div class="lesson${dbl ? " dbl" : ""}" data-drop="${n}" data-code="${esc(code)}"><div class="lhead"><span class="mono muted">Stunde ${dbl ? `${n}–${nz}` : n}${dbl ? `<br><span class="pill">Doppelstunde</span>` : ""}</span><span class="ltitle">${dbl ? ns.map(x => `<span class="lsub"><span class="mono muted small">${x}</span> ${mx(titleOfN(x))}</span>`).join("") : mx(titleOfN(n))}</span><span class="mono small muted">${when}</span></div>
      ${checksAt(k, code, ns).map(x => `<div class="lcheck"><span class="pill lnp">${esc(CHECK_KINDS[x.kind])}</span>${x.title ? ` ${mx(x.title)}` : ""}<span class="small muted">${dbl ? ` · Stunde ${x.n}` : ""}</span>
        <select class="chkdursel" data-act="chkdur" data-id="${esc(x.id)}" aria-label="Dauer">${CHECK_DUR.map(d => `<option value="${d}" ${checkMin(x) === d ? "selected" : ""}>${d} min</option>`).join("")}</select>
        <span class="small muted">· noch ${Math.max(0, 45 * (dbl ? ns.length : 1) - checksAt(k, code, dbl ? ns : [x.n]).reduce((m, y) => m + checkMin(y), 0))} min Unterricht</span><button type="button" class="mini del" data-act="chkdel" data-id="${esc(x.id)}" aria-label="Kontrolle löschen">×</button></div>`).join("")}
      ${capNote.map(t => `<p class="small muted capnote">${esc(t)}</p>`).join("")}
      <ul class="alist">${la.map(a => { const en = r ? atomLesson(r, a) : a.l; return atomRow(k, code, a, E.cards[a.id], nav).replace('<li class="atom"', en !== a.l ? `<li class="atom moved" data-moved="${en}"` : '<li class="atom"'); }).join("") || `<li class="adrop small muted">Atome hierher ziehen</li>`}</ul>
      ${UI.chkForm && UI.chkForm.code === code && UI.chkForm.n === n ? `<div class="chkform"><label>Art <select id="chkkind">${Object.entries(CHECK_KINDS).map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("")}</select></label>
        <label>Dauer <select id="chkdur">${CHECK_DUR.map(d => `<option value="${d}">${d} min</option>`).join("")}</select></label>
        ${dbl ? `<label>Stunde <select id="chkn">${ns.map(x => `<option>${x}</option>`).join("")}</select></label>` : ""}<label class="wide">Thema <input id="chktitle" placeholder="z. B. Bruchrechnung"></label>
        <button type="button" class="btn sm" data-act="chksave" data-code="${esc(code)}" data-l="${n}">Speichern</button><button type="button" class="btn ghost sm" data-act="chkcancel">Abbrechen</button></div>` : ""}
      ${UI.editAtom && UI.editAtom.code === code && UI.editAtom.id === "new" && UI.editAtom.l === n ? atomForm(k, code, { l: n, t: "", q: "", a: "" }, "new") : `<div class="lacts"><button type="button" class="linkbtn small" data-act="atomnew" data-code="${esc(code)}" data-l="${n}">+ Atom</button>${r && n <= r.hours && !(UI.chkForm && UI.chkForm.code === code && UI.chkForm.n === n) ? `<button type="button" class="linkbtn small" data-act="chknew" data-code="${esc(code)}" data-l="${n}">+ Kontrolle</button>` : ""}</div>`}
    </div>`;
  });
  return `<section class="unitv" style="${sty(u.lb)}">
    <div class="ubar"><a class="btn ghost" href="#einheiten">← Einheiten</a>${idx > 0 ? `<a class="btn ghost" href="#u-${ck(k)}-${idx - 1}">‹ ${esc(order[idx - 1])}</a>` : ""}${idx < order.length - 1 ? `<a class="btn ghost" href="#u-${ck(k)}-${idx + 1}">${esc(order[idx + 1])} ›</a>` : ""}</div>
    <header class="uhead"><div><span class="code mono">${esc(code)} · ${esc(c.label)}</span><h1>${esc(u.title)}</h1><div class="small">${esc(u.custom ? "Leistungsnachweis" : c.lbnames[u.lb] || "")}</div></div>
      <div class="umeta mono">${r ? `${r.hours} Std. geplant${u.stunden.length ? ` (Soll ${u.stunden.length})` : ""}<br>${r.start ? fmt(r.start) + " – " + fmt(r.end) : ""}${r.overflow ? `<br><span class="neg">${r.overflow} Std. nach Schuljahresende</span>` : ""}` : "nicht in der Sequenz"}</div></header>
    ${u.lb === "test" ? `<div class="card lnterm"><h3>Termin</h3>${r && r.hours ? lnDateInput(k, lnDates(k).find(x => !x.inLesson && x.row === r.id) || { row: r.id }) : `<p class="small muted">Nicht in der Sequenz.</p>`}
      ${(() => { const ds = (LN_DURS[u.kind] || [45, 90]).filter(d => d >= 45); return ds.length > 1 ? `<label class="lndurl">Dauer <select data-act="lndur" data-code="${esc(code)}">${ds.map(d => `<option value="${d}" ${lnDurOf(k, code) === d ? "selected" : ""}>${durLabel(d)}</option>`).join("")}</select></label>` : `<p class="small muted">Dauer: ${lnDurOf(k, code)} min. Kürzere Tests (20/30 min) legst du als Test in einer Stunde an.</p>`; })()}
      ${(() => { const ai = u.stunden.map((t, i) => isArbeit(t) ? i : -1).filter(i => i >= 0), ds = r ? ai.map(i => r.slots[i] && r.slots[i].date) : []; return ai.length > 1 && ds.every(Boolean) && new Set(ds).size > 1 ? `<p class="small neg">90 min, aber an diesem Tag ist keine Doppelstunde: die Arbeit verteilt sich auf ${ds.map(d => fmt(d, { weekday: "short", day: "2-digit", month: "2-digit" })).join(" und ")} – Termin besser auf einen Tag mit Doppelstunde legen.</p>` : ""; })()}
      <div class="acts">${UI.confirm === "lnx-" + (r ? r.id : code) ? `<span class="confirm"><span>${esc(u.title)} ${u.custom ? "mit Atomen löschen" : "aus der Sequenz entfernen"}?</span><button type="button" class="btn danger sm" data-act="lnremove" ${r ? `data-row="${esc(r.id)}"` : `data-code="${esc(code)}"`}>Löschen</button><button type="button" class="btn ghost sm" data-act="confirm" data-v="">Abbrechen</button></span>`
        : `<button type="button" class="btn ghost sm" data-act="confirm" data-v="lnx-${esc(r ? r.id : code)}">Leistungsnachweis löschen</button>`}</div></div>` : ""}
    ${u.custom ? lnEditCard(k, code, u) : ""}
    <div class="grid2">
      <div>${list("Inhalte · Die Schüler können …", u.inhalte)}${list("Vertiefung", u.tiefe)}${list("Vorwissen · Retrieval", u.vorwissen)}</div>
      <div>${u.begriffe && u.begriffe.length ? `<div class="box"><h3>Fachbegriffe</h3><div class="tags">${u.begriffe.map(b => `<span>${esc(b)}</span>`).join("")}</div></div>` : ""}${list("Hinweise · Bezüge", u.hinweise)}${list("Material", u.material)}</div>
    </div>
    ${r && r.extra ? `<p class="small muted">Kontrollen mit 30 min belegen ${r.extra} Stunde${r.extra > 1 ? "n" : ""}: Die Einheit ist dafür ${r.extra} Std. länger, ihr Stoff läuft danach weiter.</p>` : ""}
    <h2>Stunden und Atome</h2>
    ${atomsNewer(k, code) ? `<div class="card tplnote"><h3>Die Fachschaft hat die Atome dieser Einheit geändert</h3>
      <p class="small">Du hast hier eigene Atome. Die ${esc(tplSource(ck(k)))} enthält inzwischen eine andere Fassung (${atomsOf(k, code).length} eigene, ${((D.classes[ck(k)].units[code] || {}).atoms || []).length} in der Vorlage).</p>
      <div class="acts"><button type="button" class="btn" data-act="atomtpl" data-code="${esc(code)}">Atome der Vorlage übernehmen</button><button type="button" class="btn ghost" data-act="atomkeep" data-code="${esc(code)}">Meine Atome behalten</button></div>
      <p class="small muted">Der Lernstand bleibt bei Atomen mit gleicher Kennung erhalten.</p></div>` : ""}
    <p class="small muted">Atome werden in der Stunde eingeführt, der sie zugeordnet sind. Ab der folgenden Stunde wird es wiederholt (Lernübersicht). Zum Verschieben ein Atom in eine andere Stunde ziehen oder ↑/↓ nutzen. Doppelstunden laut Stundenplan stehen zusammen. ${S.cls[ck(k)].atoms[code] ? `<button type="button" class="linkbtn" data-act="atomreset" data-code="${esc(code)}">Atome dieser Einheit auf die Vorlage zurücksetzen</button>` : ""}</p>
    <div class="lessons-list">${lessons}</div></section>`;
}
function lnEditCard(k, code, u) {
  return `<div class="card lnedit"><h3>${esc(LN_KINDS[u.kind] ? LN_KINDS[u.kind].label : "Leistungsnachweis")} bearbeiten</h3>
    <label>Titel <input data-act="lnset" data-code="${esc(code)}" data-f="title" value="${esc(u.title)}"></label>
    <label>Stunden (eine Zeile je Stunde) <textarea rows="${Math.max(2, u.stunden.length)}" data-act="lnset" data-code="${esc(code)}" data-f="stunden">${esc(u.stunden.join("\n"))}</textarea></label>
    <p class="small muted">Die Zahl der Zeilen ist das Soll; die geplanten Stunden änderst du in der Sequenz.</p></div>`;
}
function atomRow(k, code, a, card, nav = {}) {
  if (UI.editAtom && UI.editAtom.id === a.id) return `<li>${atomForm(k, code, a, a.id)}</li>`;
  const st = card ? `<span class="pill">${Math.round(Rof(Math.max(0, diffDays(card.last, UI.date)), card.s) * 100)} % · ab ${fmt(card.due)}</span>` : "";
  return `<li class="atom" draggable="true" data-code="${esc(code)}" data-id="${esc(a.id)}"><div><b>${mx(a.t)}</b> ${st}${hasGen(a) ? `<div class="small gline">Aufgabengenerator: ${esc(genIds(a).map(genLabel).join(" / "))}</div>` : ""}<div class="small muted">Check: ${mx(a.q)} → ${mx(a.a)}</div>${a.q2 ? `<div class="small muted">Stufe 2: ${mx(a.q2)} → ${mx(a.a2)}</div>` : ""}${a.q3 ? `<div class="small muted">Stufe 3: ${mx(a.q3)} → ${mx(a.a3)}</div>` : ""}</div>
    <span class="nowrap">${nav.up ? `<button type="button" class="mini" data-act="atommove" data-code="${esc(code)}" data-id="${esc(a.id)}" data-l="${nav.up}" aria-label="In die vorige Stunde" title="In die vorige Stunde">↑</button>` : ""}${nav.down ? `<button type="button" class="mini" data-act="atommove" data-code="${esc(code)}" data-id="${esc(a.id)}" data-l="${nav.down}" aria-label="In die nächste Stunde" title="In die nächste Stunde">↓</button>` : ""}<button type="button" class="mini" data-act="atomedit" data-code="${esc(code)}" data-id="${esc(a.id)}" aria-label="Atom bearbeiten">✎</button><button type="button" class="mini del" data-act="atomdel" data-code="${esc(code)}" data-id="${esc(a.id)}" aria-label="Atom löschen">×</button></span></li>`;
}
/* Auswahl des Generators im Atom-Editor; leer = feste Fragen. Mehrere Generatoren (Liste) bleiben als Kombination wählbar. */
const GEN_DOMAINS = [["arithmetik", "Arithmetik"], ["algebra", "Algebra"], ["geometrie", "Geometrie"], ["logik", "Logik"]];
function genSelect(a) {
  const A = window.ANEMO; if (!A) return `<select name="g" disabled><option>Generatoren nicht geladen</option></select>`;
  const cur = a.g ? [].concat(a.g).join("|") : "";
  const combo = cur.includes("|") ? `<option value="${esc(cur)}" selected>Kombination: ${esc([].concat(a.g).map(genLabel).join(" / "))}</option>` : "";
  const groups = GEN_DOMAINS.map(([p, l]) => {
    const ids = A.ids.filter(id => id.startsWith(p + "__")).sort((x, y) => genLabel(x).localeCompare(genLabel(y), "de"));
    return ids.length ? `<optgroup label="${l}">${ids.map(id => `<option value="${id}" ${id === cur ? "selected" : ""}>${esc(genLabel(id))}</option>`).join("")}</optgroup>` : "";
  }).join("");
  return `<select name="g"><option value="">Keiner: feste Fragen</option>${combo}${groups}</select>`;
}
function atomForm(k, code, a, id) {
  return `<form class="aform" data-code="${esc(code)}" data-id="${esc(id)}">
    <label>Atom <input name="t" required value="${esc(a.t)}" placeholder="z. B. Gleichnamige Brüche addieren"></label>
    <label>Prüffrage <input name="q" value="${esc(a.q)}" placeholder="z. B. 2/7 + 3/7 = ?"></label>
    <label>Lösung <input name="a" value="${esc(a.a)}" placeholder="5/7"></label>
    <label>Stufe 2 · Anwenden <input name="q2" value="${esc(a.q2 || "")}" placeholder="z. B. 5/12 + 1/12 = ?"></label>
    <label>Lösung Stufe 2 <input name="a2" value="${esc(a.a2 || "")}"></label>
    <label>Stufe 3 · Vernetzen <input name="q3" value="${esc(a.q3 || "")}" placeholder="z. B. Welcher Bruch fehlt: □ + 2/9 = 1?"></label>
    <label>Lösung Stufe 3 <input name="a3" value="${esc(a.a3 || "")}"></label>
    <label>Aufgabengenerator (Wiederholung) ${genSelect(a)}</label>
    <label class="sm">Stunde <input name="l" type="number" min="1" value="${a.l}"></label>
    <div class="acts"><button class="btn" type="submit">Speichern</button><button type="button" class="btn ghost" data-act="atomcancel">Abbrechen</button></div></form>`;
}

/* ---------------- views: Lernübersicht ---------------- */
function viewEngine() {
  const k = curG(), d = UI.date, es = engineState(k, d), E = S.eng[k];
  const intro = es.list;
  const avgR = intro.filter(x => x.R !== null);
  const meanR = avgR.length ? avgR.reduce((s, x) => s + x.R, 0) / avgR.length : null;
  const total = Object.keys(atomMap(k)).length;
  const byUnit = {};
  const showAll = UI.engFilter === "all";
  const am = atomMap(k), sc = schedule(k);
  const rowsSrc = showAll ? Object.values(am).map(a => intro.find(x => x.a.id === a.id) || { a, code: a.code, intro: sc.intro[a.id] ? sc.intro[a.id].date : null, card: null, isNew: false, R: null, future: true }) : intro;
  rowsSrc.forEach(x => (byUnit[x.code] || (byUnit[x.code] = [])).push(x));
  const uo = unitOrderOf(k), unitsSorted = Object.keys(byUnit).sort((a, b) => uo.indexOf(a) - uo.indexOf(b));
  const tbl = unitsSorted.map(code => `<tr class="ugroup"><td colspan="6">${unitLink(k, code)}</td></tr>` + byUnit[code].map(x => {
    const c = x.card;
    const R = x.R !== null && x.R !== undefined ? x.R : null;
    return `<tr><td>${mx(x.a.t)}</td><td>${x.future ? "" : levelPill(taskOf(x.a, levelOf(x)).l)}</td>
      <td>${R !== null ? `<span class="rbar"><i style="width:${Math.round(R * 100)}%"></i></span><span class="mono small">${Math.round(R * 100)} %</span>` : `<span class="small muted">${x.future ? (x.intro ? "ab " + fmt(x.intro) : "nicht eingeplant") : x.backlog ? "Altbestand" : "neu"}</span>`}</td>
      <td class="mono small">${c ? c.s.toFixed(1) + " T." : "—"}</td>
      <td class="mono small">${c ? fmt(c.due) : x.isNew ? "jetzt" : "—"}</td>
      <td class="mono small">${c ? c.reps + (c.lapses ? ` (${c.lapses}×)` : "") : "0"}</td></tr>`;
  }).join("")).join("");
  return `<section><div class="vhead"><h1>Lernübersicht</h1>${clsTabs()}</div>
    <div class="stats">
      <div class="stat"><span class="v mono">${intro.length}<small>/${total}</small></span><span class="l">Atome eingeführt</span></div>
      <div class="stat"><span class="v mono">${es.dueCount}</span><span class="l">fällig am ${fmt(d)}${es.backCount ? ` · ${es.backCount} im Altbestand` : ""}</span></div>
      <div class="stat"><span class="v mono">${meanR === null ? "—" : Math.round(meanR * 100) + " %"}</span><span class="l">ø Abrufwahrscheinlichkeit</span></div>
      <div class="stat"><span class="v mono">${E.log.length}</span><span class="l">Bewertungen bisher</span></div>
    </div>
    <div class="grid2">
      <div class="card"><h3>So funktioniert es</h3>
        <p class="small">Jedes Atom ist einer Stunde zugeordnet. Ab der Stunde danach erscheint es auf der Heute-Seite zur Wiederholung, z. B. als Einstiegsaufgabe. Du bewertest, wie gut die Klasse es abrufen konnte:</p>
        <ul class="small rlist">${RATES.map(([g, l, h]) => `<li><b class="r${g}t">${l}</b> ${h} der Klasse richtig</li>`).join("")}</ul>
        <p class="small">Daraus berechnet FSRS für jedes Atom Stabilität und Schwierigkeit und legt die nächste Wiederholung so, dass die Klasse es dann noch mit der gewählten Wahrscheinlichkeit abrufen kann. Gut sitzende Atome kommen immer seltener, wackelige öfter.</p>
        <p class="small">Je stabiler ein Atom sitzt, desto anspruchsvoller wird die Aufgabe: ${levelPill(1)} bis ${LV_S2} Tage Stabilität, ${levelPill(2)} ab ${LV_S2} Tagen, ${levelPill(3)} ab ${LV_S3} Tagen. Nach „Nochmal“ oder bei geringem Abruf geht es eine Stufe zurück.</p>
        ${es.pick.length ? `<button type="button" class="btn" data-act="quiz" data-k="${k}">Heutige Wiederholung als Quiz zeigen</button>` : ""}</div>
      <div class="card"><h3>Einstellungen</h3>
        <label class="row">Zielbehalt <select data-act="ret">${[0.8, 0.85, 0.9, 0.95].map(v => `<option value="${v}" ${S.settings.retention === v ? "selected" : ""}>${Math.round(v * 100)} %</option>`).join("")}</select></label>
        <p class="small muted">Höher = häufigere Wiederholungen. 85–90 % passt für die meisten Klassen.</p>
        <label class="row">Wiederholungen pro Stunde <input type="number" min="1" max="15" class="num" value="${S.settings.perLesson}" data-act="perlesson"></label>
        <p class="small muted">So viele Atome schlägt die Heute-Seite höchstens vor, etwa die Hälfte davon neu eingeführte.</p>
        <label class="row">Start der Wiederholungen <input type="date" data-act="engstart" value="${esc(cal().engineStart || cal().start)}"></label>
        <p class="small muted">Atome, die vor diesem Tag eingeführt wurden, sind Altbestand: Sie kommen nicht alle auf einmal, sondern je Stunde wird mindestens eines eingestreut, bis alle einmal wiederholt sind.</p></div>
    </div>
    <div class="vhead sub"><h2>Atome</h2><div class="seg small">${[["intro", "Eingeführt"], ["all", "Alle"]].map(([v, l]) => `<button type="button" aria-selected="${UI.engFilter === v}" data-act="engfilter" data-v="${v}">${l}</button>`).join("")}</div></div>
    ${tbl ? `<div class="tscroll"><table class="eng"><thead><tr><th>Atom</th><th>Stufe</th><th>Abruf heute</th><th>Stabilität</th><th>Nächste</th><th>Wdh.</th></tr></thead><tbody>${tbl}</tbody></table></div>` : `<p class="muted">Bis zum ${fmt(d)} sind laut Plan noch keine Atome eingeführt.</p>`}
  </section>`;
}

/* ---------------- views: Einstellungen ---------------- */
function yearOptions() {
  const have = new Set(S.settings.years.map(y => y.id)), y0 = yearStart(yearIdOf(todayIso())), out = [];
  for (let y = y0 - 1; y <= y0 + 4; y++) { const id = `${y}-${String(y + 1).slice(2)}`; if (!have.has(id)) out.push(id); }
  return out;
}
function myClassesCard() {
  const Y = cal(), mine = mineList();
  const rows = Object.entries(TYPES).map(([t, T]) => `<tr class="mtype"><td colspan="3">${esc(T.label)}</td></tr>` + T.grades.map(g => {
    const ks = classesFor(t, g);
    if (!ks.length) return `<tr class="mna"><td><label class="chk"><input type="checkbox" disabled> Klasse ${g}</label></td><td colspan="2" class="small muted">Lehrplan noch nicht hinterlegt</td></tr>`;
    return ks.map(k => myClassRow(k, mine)).join("");
  }).join("")).join("");
  return `<div class="card myclasses"><h3>Meine Klassen ${esc(yearLabel(Y.id))}</h3>
    <p class="small muted">Hake an, welche Klassen du in diesem Schuljahr unterrichtest. Nur diese erscheinen oben in der Leiste und unter „Alle meine Klassen“. In der Oberschule gibt es ab Klasse 7 eigene Pläne für den Haupt- (HS) und Realschulbildungsgang (RS), im Gymnasium in 11/12 für Grund- (GK) und Leistungskurs (LK). Parallelklassen teilen sich Sequenz und Atome, haben aber eigenen Stundenplan und Lernstand.</p>
    <div class="tscroll"><table class="form"><thead><tr><th>Klasse</th><th>Parallelklassen</th><th>Namen</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="small muted">Lehrpläne: Lehrplandatenbank Sachsen${D.lehrplanQuelle ? `, abgerufen am ${esc(fmt(D.lehrplanQuelle.abgerufen, { day: "2-digit", month: "2-digit", year: "numeric" }))}` : ""}. Klasse 6 und 8 (Gymnasium) mit ausgearbeiteter Stoffverteilung und Atomen.</p></div>`;
}
function myClassRow(k, mine) {
  {
    const on = mine.includes(k), C = S.cls[k], n = C.groups.length;
    const names = on ? C.groups.map(G => `<input data-act="gname" data-g="${gkey(k, G.id)}" value="${esc(G.name)}" placeholder="${esc(n > 1 ? D.classes[k].short + G.id : "optional")}" aria-label="Name der Parallelklasse ${esc(G.id)}">`).join("") : "";
    const confirm = UI.confirm === "gdel-" + k ? `<span class="confirm small">${esc(groupName(gkey(k, C.groups[1].id)))} mit Stundenplan und Lernstand entfernen?<button type="button" class="btn danger sm" data-act="gdel" data-k="${k}">Entfernen</button><button type="button" class="btn ghost sm" data-act="confirm" data-v="">Nein</button></span>` : "";
    return `<tr class="${on ? "on" : ""}"><td><label class="chk"><input type="checkbox" data-act="mine" data-k="${k}" ${on ? "checked" : ""}> ${esc(D.classes[k].label)}${D.classes[k].variantLabel ? ` <span class="small muted">${esc(D.classes[k].variantLabel)}</span>` : ""}</label></td>
      <td>${on ? `<select data-act="gcount" data-k="${k}" aria-label="Anzahl Parallelklassen"><option value="1" ${n === 1 ? "selected" : ""}>1 Klasse</option><option value="2" ${n === 2 ? "selected" : ""}>2 Parallelklassen</option></select>` : ""}</td>
      <td><div class="gnames">${names}</div>${confirm}</td></tr>`;
  }
}
function lastDayRow(k) {
  const c = ck(k), C = S.cls[c], Y = cal(), rule = ruleLastDay(c, Y), cur = lastDayOf(c), own = typeof C.lastDay === "string";
  const why = { ostern: "Abitur: Unterricht bis vor die Osterferien", pfingsten: "Abschlussprüfungen: Unterricht bis vor die Pfingstferien" }[D.classes[c].endRule];
  return `<div class="addrow"><label>Letzter Unterrichtstag <input type="date" data-act="lastday" value="${esc(cur || "")}" min="${esc(Y.start)}" max="${esc(Y.end)}"></label>
    ${own && C.lastDay !== (rule || "") ? `<button type="button" class="linkbtn small" data-act="lastdayreset">${rule ? "Vorschlag " + esc(fmt(rule)) : "bis Schuljahresende"}</button>` : ""}</div>
    <p class="small muted">${why ? esc(why) + " (Vorschlag, gilt für alle Parallelklassen). " : ""}Leer = bis zum Schuljahresende. Danach plant die App keine Stunden mehr.</p>`;
}
function ttCard(k) {
  const C = grp(k), vs = sortTT(C.tt), Y = cal();
  const fil = D.classes[ck(k)].sol;
  const trackSel = (v, l, i) => `<select data-act="tl" data-v="${v.id}" data-i="${i}" data-f="track" aria-label="Spur">${["A", "B"].concat(fil || l.track === "SOL" ? ["SOL"] : []).map(x => `<option value="${x}" ${l.track === x ? "selected" : ""}>${x === "SOL" ? "FIL" : x}</option>`).join("")}</select>`;
  const blocks = vs.map((v, vi) => {
    const next = vs[vi + 1], endD = lastDayOf(ck(k)), until = next ? fmt(addDays(next.frm, -1), { day: "2-digit", month: "2-digit", year: "numeric" }) : endD ? fmt(endD, { day: "2-digit", month: "2-digit", year: "numeric" }) + " (letzter Unterrichtstag)" : "Schuljahresende";
    const current = v.frm <= UI.date && (!next || UI.date < next.frm);
    const rows = v.lessons.map((l, i) => `<tr>
      <td><select data-act="tl" data-v="${v.id}" data-i="${i}" data-f="day" aria-label="Tag">${[1, 2, 3, 4, 5].map(d => `<option value="${d}" ${+l.day === d ? "selected" : ""}>${DAYS[d]}</option>`).join("")}</select></td>
      <td><input class="num" type="number" min="1" max="10" data-act="tl" data-v="${v.id}" data-i="${i}" data-f="period" value="${l.period}" aria-label="Beginn in der wievielten Stunde"></td>
      <td><select data-act="tl" data-v="${v.id}" data-i="${i}" data-f="len" aria-label="Dauer"><option value="1" ${lessonLen(l) === 1 ? "selected" : ""}>Einzelstunde</option><option value="2" ${lessonLen(l) === 2 ? "selected" : ""}>Doppelstunde</option></select></td>
      <td>${trackSel(v, l, i)}</td>
      <td><button type="button" class="mini del" data-act="tldel" data-v="${v.id}" data-i="${i}" aria-label="Stunde löschen">×</button></td></tr>`).join("");
    return `<div class="ttv ${current ? "cur" : ""}">
      <div class="ttvh"><label>Gültig ab <input type="date" data-act="ttfrm" data-v="${v.id}" value="${esc(v.frm)}"></label><span class="small muted">bis ${esc(until)}${current ? " · gilt am gewählten Tag" : ""}</span>
      ${vs.length > 1 ? `<button type="button" class="linkbtn small" data-act="ttdelv" data-v="${v.id}">Zeitraum löschen</button>` : ""}</div>
      ${v.lessons.length ? `<table class="form"><thead><tr><th>Tag</th><th>ab Stunde</th><th>Dauer</th><th>Spur</th><th></th></tr></thead><tbody>${rows}</tbody></table><p class="small muted">${weekHours(v.lessons)} Unterrichtsstunde${weekHours(v.lessons) === 1 ? "" : "n"} pro Woche. „ab Stunde“ ist die Lage im Stundenplan (z. B. 3 = 3. Stunde), nicht die Anzahl.</p>` : `<p class="small muted">In diesem Zeitraum hat ${esc(groupName(k))} keinen Unterricht.</p>`}
      <button type="button" class="linkbtn small" data-act="tladd" data-v="${v.id}">+ Stunde</button></div>`;
  }).join("");
  const sug = UI.date > (vs.length ? vs[vs.length - 1].frm : "") && UI.date <= Y.end ? monday(UI.date) < UI.date ? addDays(monday(UI.date), 7) : UI.date : "";
  const off = (C.off || []).map((o, i) => `<tr><td><input data-act="off" data-i="${i}" data-f="name" value="${esc(o.name)}" aria-label="Anlass" placeholder="z. B. Praktikum"></td><td><input type="date" data-act="off" data-i="${i}" data-f="frm" value="${esc(o.frm)}" aria-label="von"></td><td><input type="date" data-act="off" data-i="${i}" data-f="to" value="${esc(o.to)}" aria-label="bis"></td><td><button type="button" class="mini del" data-act="offdel" data-i="${i}" aria-label="Löschen">×</button></td></tr>`).join("");
  return `<div class="card"><h3>Stundenplan ${esc(fullLabel(k))} · ${esc(yearLabel(Y.id))}</h3>
    ${S.cls[ck(k)].groups.length > 1 ? `<p class="small">Gilt nur für ${esc(groupName(k))}. Die andere Parallelklasse wählst du oben in der Leiste.</p>` : ""}
    <p class="small muted">Jeder Zeitraum gilt ab seinem Datum bis zum Beginn des nächsten. Spur A und B sind die beiden Stränge (im Modus „nacheinander“ zählen beide zusammen)${fil ? ", FIL = zusätzliche FIL-Stunde (nur Klasse 7–9)" : ""}.</p>
    ${blocks}
    ${lastDayRow(k)}
    <div class="addrow"><label>Neuer Stundenplan ab <input type="date" id="ttnewfrm" value="${esc(sug)}" min="${esc(Y.start)}" max="${esc(Y.end)}"></label><button type="button" class="btn ghost sm" data-act="ttnew">Zeitraum anlegen</button></div>
    <p class="small muted">Der neue Zeitraum übernimmt die Stunden, die an diesem Tag gelten; danach anpassen.</p>
    <h3>Kein Unterricht in dieser Klasse</h3>
    ${off ? `<div class="tscroll"><table class="form"><thead><tr><th>Anlass</th><th>von</th><th>bis</th><th></th></tr></thead><tbody>${off}</tbody></table></div>` : `<p class="small muted">Zum Beispiel Praktikum, Klassenfahrt oder Prüfungszeit. Die Stunden in diesem Zeitraum fallen weg und der Plan rückt nach.</p>`}
    <button type="button" class="linkbtn" data-act="offadd">+ Zeitraum ohne Unterricht</button></div>`;
}
function viewSettings() {
  const Y = cal(), k = curG();
  const hol = (Y.holidays || []).map((h, i) => `<tr><td><input data-act="hol" data-i="${i}" data-f="name" value="${esc(h.name)}" aria-label="Name"></td><td><input type="date" data-act="hol" data-i="${i}" data-f="frm" value="${esc(h.frm)}" aria-label="von"></td><td><input type="date" data-act="hol" data-i="${i}" data-f="to" value="${esc(h.to)}" aria-label="bis"></td><td><button type="button" class="mini del" data-act="holdel" data-i="${i}" aria-label="Löschen">×</button></td></tr>`).join("");
  const fr = (Y.free || []).map((f, i) => `<tr><td><input type="date" data-act="free" data-i="${i}" data-f="date" value="${esc(f.date)}" aria-label="Datum"></td><td><input data-act="free" data-i="${i}" data-f="name" value="${esc(f.name)}" aria-label="Anlass"></td><td><button type="button" class="mini del" data-act="freedel" data-i="${i}" aria-label="Löschen">×</button></td></tr>`).join("");
  const years = S.settings.years.map(y => `<tr class="${y.id === Y.id ? "cur" : ""}"><td class="mono">${esc(yearLabel(y.id))}</td><td class="mono small nowrap">${y.start ? fmt(y.start, { day: "2-digit", month: "2-digit", year: "numeric" }) + " – " + fmt(y.end, { day: "2-digit", month: "2-digit", year: "numeric" }) : ""}</td>
    <td>${y.id === Y.id ? `<span class="pill new">angezeigt</span>` : `<button type="button" class="btn ghost sm" data-act="year" data-v="${esc(y.id)}">Öffnen</button>`}</td>
    <td>${y.id === Y.id || S.settings.years.length < 2 ? "" : UI.confirm === "ydel-" + y.id ? `<span class="confirm small">Aus der Liste entfernen?<button type="button" class="btn danger sm" data-act="ydel" data-v="${esc(y.id)}">Entfernen</button><button type="button" class="btn ghost sm" data-act="confirm" data-v="">Nein</button></span>` : `<button type="button" class="mini del" data-act="confirm" data-v="ydel-${esc(y.id)}" aria-label="Schuljahr entfernen">×</button>`}</td></tr>`).join("");
  const opts = yearOptions(), lastY = S.settings.years[S.settings.years.length - 1].id;
  const defNY = opts.includes(UI.newYear) ? UI.newYear : opts.find(id => id > lastY) || opts[0];
  const confirm = UI.confirm === "resetall", cf = UI.confirm === "ferien";
  return `<section><div class="vhead"><h1>Einstellungen</h1>${clsTabs()}</div>
    <div class="grid2">
      ${myClassesCard()}
      ${k ? ttCard(k) : `<div class="card"><h3>Stundenplan</h3><p class="small muted">${noClassMsg()}</p></div>`}
      <div class="card"><h3>Schuljahre</h3>
        <div class="acts"><button type="button" class="btn ghost sm" data-act="obopen">Einrichtungsassistent starten</button></div>
        <div class="tscroll"><table class="form"><thead><tr><th>Schuljahr</th><th>Zeitraum</th><th></th><th></th></tr></thead><tbody>${years}</tbody></table></div>
        ${opts.length ? `<div class="addrow" id="newyearbox"><label>Neues Schuljahr <select id="newyear">${opts.map(id => `<option value="${id}" ${id === defNY ? "selected" : ""}>${yearLabel(id)}</option>`).join("")}</select></label>
          <label class="chk"><input type="checkbox" id="ny-seq" checked> Sequenzen und Atome übernehmen</label>
          <label class="chk"><input type="checkbox" id="ny-tt" checked> Stundenpläne übernehmen</label>
          <button type="button" class="btn" data-act="yearadd" ${UI.busy ? "disabled" : ""}>${UI.busy ? "Lädt …" : "Anlegen"}</button></div>` : ""}
        <p class="small muted">Ein neues Schuljahr bekommt die Ferien und Feiertage für Sachsen, einen leeren Lernstand und keine Ausfälle. Die übernommenen Daten stammen aus dem gerade angezeigten Jahr (${esc(yearLabel(Y.id))}). Gespeichertes aus früheren Jahren bleibt erhalten.</p></div>
      <div class="card"><h3>Schuljahr ${esc(yearLabel(Y.id))}</h3>
        <div class="acts">${cf ? `<span class="confirm"><span>Beginn, Ende, Ferien und freie Tage durch die Termine für Sachsen ersetzen?</span><button type="button" class="btn danger sm" data-act="ferien">Ersetzen</button><button type="button" class="btn ghost sm" data-act="confirm" data-v="">Abbrechen</button></span>` : `<button type="button" class="btn ghost" data-act="confirm" data-v="ferien" ${UI.busy ? "disabled" : ""}>${UI.busy ? "Lädt …" : "Ferien Sachsen importieren"}</button>`}</div>
        ${Y.source ? `<p class="small muted">Quelle: ${esc(Y.source)}</p>` : ""}
        <label class="row">Erster Schultag <input type="date" data-act="cal" data-f="start" value="${esc(Y.start)}"></label>
        <label class="row">Letzter Schultag <input type="date" data-act="cal" data-f="end" value="${esc(Y.end)}"></label>
        <label class="row chk"><input type="checkbox" data-act="autobuf" ${S.settings.autoBuffer ? "checked" : ""}> Bei Mehrbedarf oder Ausfall automatisch den nächsten Puffer kürzen</label>
        <h3>Ferien</h3><div class="tscroll"><table class="form"><thead><tr><th>Name</th><th>von</th><th>bis</th><th></th></tr></thead><tbody>${hol}</tbody></table></div>
        <button type="button" class="linkbtn" data-act="holadd">+ Ferien hinzufügen</button>
        <h3>Freie Einzeltage</h3><div class="tscroll"><table class="form"><thead><tr><th>Datum</th><th>Anlass</th><th></th></tr></thead><tbody>${fr}</tbody></table></div>
        <button type="button" class="linkbtn" data-act="freeadd">+ Freien Tag hinzufügen</button>
        <p class="small muted">Ferien Sachsen sind für 2025/26 bis 2029/30 eingebaut, spätere Jahre lädt die App von openholidaysapi.org. Schulinterne freie Tage bitte selbst ergänzen.</p></div>
    </div>
    ${tplCard(k)}
    <div class="card"><h3>Sicherung</h3>
      <p class="small">Deine Daten werden automatisch gespeichert${local ? " – nur in diesem Browser" : ""}. Eine Sicherung enthält die Einstellungen aller Schuljahre und die Klassen und den Lernstand des angezeigten Schuljahres (${esc(yearLabel(Y.id))}).${local ? ` Letzte Sicherung: ${lastBackup() ? fmt(lastBackup(), { day: "2-digit", month: "2-digit", year: "numeric" }) : "noch keine"}.` : ""}</p>
      <div class="acts"><button type="button" class="btn" data-act="export">Sicherung kopieren</button><button type="button" class="btn ghost" data-act="download" id="dlbtn" ${downloads || local ? "" : "hidden"}>Als Datei speichern</button><button type="button" class="btn ghost" data-act="engreset">Lernstand ${esc(yearLabel(Y.id))} leeren</button></div>
      <textarea id="importbox" rows="3" placeholder="Sicherung hier einfügen …" aria-label="Sicherung einfügen"></textarea>
      <div class="acts"><button type="button" class="btn ghost" data-act="import">Sicherung einspielen</button>
      ${confirm ? `<span class="confirm"><span>Sequenzen, Stundenpläne und Lernstand von ${esc(yearLabel(Y.id))} auf die Vorlage zurücksetzen?</span><button type="button" class="btn danger" data-act="resetall">Zurücksetzen</button><button type="button" class="btn ghost" data-act="confirm" data-v="">Abbrechen</button></span>` : `<button type="button" class="btn ghost" data-act="confirm" data-v="resetall">Schuljahr zurücksetzen</button>`}</div></div>
  </section>`;
}

/* Fachschaftsvorlage: was gemeinsam ist, was persönlich bleibt, Stand je eigener Klasse und Export. */
function tplCard(g) {
  const mine = mineList(), stamp = TPLDATA.updated ? fmt(TPLDATA.updated, { day: "2-digit", month: "2-digit", year: "numeric" }) : null;
  const rows = mine.map(k => {
    const C = S.cls[k], st = tplNewer(k, C) ? `<span class="pill lnp">neue Vorlage</span>` : seqOwn(k, C) ? `<span class="pill">eigene Fassung</span>` : `<span class="pill new">folgt der Vorlage</span>`;
    const na = Object.keys(C.atoms || {}).filter(code => atomsNewer(k, code)).length;
    return `<tr><td>${esc(fullLabel(k))}</td><td class="small">${TPL[k] ? "Fachschaft" : "Lehrplan"}</td><td>${st}${na ? ` <span class="pill lnp">${na} Einheit${na > 1 ? "en" : ""} mit neuen Atomen</span>` : ""}</td></tr>`;
  }).join("");
  return `<div class="card tplcard"><h3>Fachschaftsvorlage</h3>
    <p class="small">Die <b>Vorlage</b> ist für alle gleich: Sequenz, Stunden, Puffer, Atome und Aufgaben. Sie kommt aus dem Lehrplan oder, wo die Fachschaft eine gemeinsame Fassung beschlossen hat, aus der Fachschaftsvorlage${stamp ? ` (Stand ${esc(stamp)})` : ""}. <b>Persönlich</b> und nur bei dir gespeichert sind Stundenplan, Häkchen, Ausfälle, Termine der Leistungsnachweise, Lernstand und deine Änderungen an Sequenz und Atomen.</p>
    <p class="small">Solange du die Sequenz einer Klasse nicht änderst, folgt sie der Vorlage: Änderungen der Fachschaft kommen beim nächsten Öffnen automatisch. Hast du sie angepasst, zeigt die Sequenz einen Hinweis und du entscheidest selbst.</p>
    ${rows ? `<div class="tscroll"><table class="form"><thead><tr><th>Klasse</th><th>Vorlage</th><th>Stand</th></tr></thead><tbody>${rows}</tbody></table></div>` : ""}
    <h3>Eigene Planung als Vorlage weitergeben</h3>
    <p class="small muted">Speichert Sequenz, Modus, Atome und Leistungsnachweise als Datei, ohne persönliche Daten. Wer die Fachschaftsvorlage pflegt, legt sie in <code>src/vorlage/</code> ab; danach bekommen alle sie beim nächsten Öffnen.</p>
    <div class="acts">${g ? `<button type="button" class="btn ghost" data-act="tplexport" data-k="${ck(g)}">${esc(fullLabel(ck(g)))} als Vorlage speichern</button>` : ""}${mine.length > 1 ? `<button type="button" class="btn ghost" data-act="tplexport" data-v="all">Alle meine Klassen</button>` : ""}</div></div>`;
}

/* ---------------- Einrichtungsassistent ----------------
   Schritte: 0 Willkommen/Schuljahr · 1 Meine Klassen · 2 Unterrichtszeiten · 3 Fertig.
   Startet von selbst, solange im Schuljahr keine Klassen festgelegt sind und der Assistent nicht beendet wurde. */
const OB_STEPS = ["Schuljahr", "Klassen", "Planung", "Unterrichtszeiten", "Fertig"];
const OB_PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];
function obVersion(g) {
  const vs = sortTT(grp(g).tt);
  return vs.filter(v => v.frm <= UI.date).pop() || vs[0];
}
function obTracks(k) { const c = D.classes[k]; return ["A"].concat(S.cls[k] && S.cls[k].mode === "Stränge" ? ["B"] : [], c.sol ? ["SOL"] : []); }
/* Planung je Klasse: „nacheinander“ (ein Strang, Standard) oder „in Strängen“ mit Lernbereichen in Strang A oder B.
   Der Stundenplan bleibt beim Umschalten unverändert; im Modus „nacheinander“ zählen B-Stunden als A-Stunden. */
const isUnitRow = (k, r) => { const u = unitOf(k, r.code); return !!u && r.code !== "P" && r.code !== "JA" && u.lb !== "test"; };
function obLbs(k) {
  const C = S.cls[k], c = D.classes[k], out = [];
  C.seq.forEach(r => { if (!isUnitRow(k, r)) return; const lb = unitOf(k, r.code).lb; if (!out.includes(lb)) out.push(lb); });
  return out.map(lb => ({ lb, name: c.lbnames[lb] || lb }));
}
const obLbStrand = (k, lb) => { const rs = S.cls[k].seq.filter(r => isUnitRow(k, r) && unitOf(k, r.code).lb === lb); return rs.filter(r => r.strand === "B").length > rs.length / 2 ? "B" : "A"; };
/* Puffer folgen dem Strang der Einheit davor */
function obFixBuffers(k) { let last = "A"; S.cls[k].seq.forEach(r => { if (isUnitRow(k, r)) last = r.strand === "B" ? "B" : "A"; else if (r.code === "P") r.strand = last; }); }
function setLbStrand(k, lb, strand) {
  S.cls[k].seq.forEach(r => { if (isUnitRow(k, r) && unitOf(k, r.code).lb === lb) r.strand = strand; });
  obFixBuffers(k); commit(k);
}
function setClassMode(k, mode, quiet) {
  const C = S.cls[k]; C.mode = mode; C.obMode = 1;
  // Erstmals in Strängen und noch alles in A: Lernbereiche abwechselnd A, B, A … verteilen
  if (mode === "Stränge" && !C.seq.some(r => isUnitRow(k, r) && r.strand === "B")) {
    obLbs(k).forEach(({ lb }, i) => C.seq.forEach(r => { if (isUnitRow(k, r) && unitOf(k, r.code).lb === lb) r.strand = i % 2 ? "B" : "A"; }));
    obFixBuffers(k);
  }
  if (quiet) { touch(); save(k); } else commit(k);
}
/* Wechsel zu „in Strängen“: Dialog, der Lernbereiche und Wochenstunden den Strängen A und B zuordnet. In den Klassen aus
   dem Lehrplan (alle außer GYM 6/8) liegen Einheiten und Stundenplan zunächst komplett in Strang A; ohne Zuordnung bliebe
   Strang B leer. Zustand im Entwurf UI.strandDlg = { k, lb: {LB → A|B}, tt: {"gid|Zeitraum|Stunde" → A|B}, auto: {…} }. */
const lbShort = (k, lb) => lb.startsWith("LB") ? "LB " + lb.slice(2) : lb === "WB" ? "WB" : (D.classes[ck(k)].lbnames[lb] || lb);
/* Stunden je Strang bei einer Zuordnung der Lernbereiche; Puffer und Jahresabschluss folgen der Einheit davor. */
function strandHrs(k, lbMap) {
  const h = { A: 0, B: 0 }; let last = "A";
  S.cls[k].seq.forEach(r => {
    if (isUnitRow(k, r)) { last = lbMap[unitOf(k, r.code).lb] === "B" ? "B" : "A"; h[last] += +r.hours || 0; }
    else if (!isLnRow(k, r.code)) h[last] += +r.hours || 0;
  });
  return h;
}
const sdLessons = v => v.lessons.map((l, i) => ({ l, i })).filter(x => x.l.track !== "SOL");
/* Vorschlag für die Wochenstunden: der Reihe nach (Tag, Stunde) jeweils in den Strang, der dem Stundenanteil am nächsten kommt */
function strandSuggestTT() {
  const d = UI.strandDlg, k = d.k, h = strandHrs(k, d.lb), share = h.A + h.B ? h.A / (h.A + h.B) : 0.5;
  S.cls[k].groups.forEach(G => (G.tt || []).forEach((v, vi) => {
    const vk = G.id + "|" + vi; if (!d.auto[vk]) return;
    const ls = sdLessons(v).sort((x, y) => (+x.l.day - +y.l.day) || (+x.l.period - +y.l.period));
    let a = 0, b = 0;
    ls.forEach(x => {
      const n = lessonLen(x.l);
      const toA = h.B === 0 ? true : h.A === 0 ? false : Math.abs((a + n) / (a + b + n) - share) <= Math.abs(a / (a + b + n) - share);
      if (toA) a += n; else b += n;
      d.tt[`${vk}|${x.i}`] = toA ? "A" : "B";
    });
  }));
}
function strandDlgOpen(k) {
  const C = S.cls[k], anyB = C.seq.some(r => isUnitRow(k, r) && r.strand === "B"), lb = {}, tt = {}, auto = {};
  obLbs(k).forEach(({ lb: x }, i) => { lb[x] = anyB ? obLbStrand(k, x) : (i % 2 ? "B" : "A"); });
  C.groups.forEach(G => (G.tt || []).forEach((v, vi) => {
    const ls = sdLessons(v), vk = G.id + "|" + vi;
    if (ls.some(x => x.l.track === "B") && ls.some(x => x.l.track !== "B")) ls.forEach(x => { tt[`${vk}|${x.i}`] = x.l.track === "B" ? "B" : "A"; });
    else auto[vk] = true;
  }));
  UI.strandDlg = { k, lb, tt, auto }; strandSuggestTT(); renderOverlay();
}
function strandDlgClose() { UI.strandDlg = null; renderOverlay(); }
function strandDlgApply() {
  const d = UI.strandDlg; if (!d) return;
  const k = d.k, C = S.cls[k], snap = snapshotFor(k);
  C.mode = "Stränge"; C.obMode = 1;
  C.seq.forEach(r => { if (isUnitRow(k, r)) r.strand = d.lb[unitOf(k, r.code).lb] === "B" ? "B" : "A"; });
  obFixBuffers(k);
  C.groups.forEach(G => (G.tt || []).forEach((v, vi) => v.lessons.forEach((l, i) => { const t = d.tt[`${G.id}|${vi}|${i}`]; if (t && l.track !== "SOL") l.track = t; })));
  UI.strandDlg = null; renderOverlay(); undoStack = snap; commit(k);
  toast(`${D.classes[k].label} läuft jetzt in zwei Strängen. Einzelne Einheiten kannst du im Jahresplan umhängen.`, true);
}
function strandDlgHtml() {
  const d = UI.strandDlg, k = d.k, C = S.cls[k], c = D.classes[k], h = strandHrs(k, d.lb), multi = C.groups.length > 1;
  const lbH = {}; C.seq.forEach(r => { if (isUnitRow(k, r)) { const lb = unitOf(k, r.code).lb; lbH[lb] = (lbH[lb] || 0) + (+r.hours || 0); } });
  const sel = (attrs, v, label) => `<select ${attrs} aria-label="${esc(label)}">${["A", "B"].map(t => `<option ${v === t ? "selected" : ""}>${t}</option>`).join("")}</select>`;
  const lbRows = obLbs(k).map(({ lb, name }) => `<tr style="${sty(lb)}"><td><span class="chip"><b>${esc(lbShort(k, lb))}</b></span></td><td>${esc(name)}</td><td class="mono small muted nowrap">${lbH[lb] || 0} Std.</td><td>${sel(`data-act="sdlb" data-lb="${esc(lb)}"`, d.lb[lb], "Strang für " + name)}</td></tr>`).join("");
  const warn = [];
  if (!h.A || !h.B) warn.push(`Strang ${h.A ? "B" : "A"} bekommt noch keinen Lernbereich.`);
  const tts = C.groups.map(G => {
    const vs = G.tt || [];
    return vs.map((v, vi) => {
      const vk = G.id + "|" + vi, ls = sdLessons(v).sort((x, y) => (+x.l.day - +y.l.day) || (+x.l.period - +y.l.period));
      const w = { A: 0, B: 0 }; ls.forEach(x => { w[d.tt[`${vk}|${x.i}`] === "B" ? "B" : "A"] += lessonLen(x.l); });
      const who = `${multi ? groupName(gkey(k, G.id)) + ", " : ""}${vs.length > 1 ? "ab " + fmt(v.frm) : "Stundenplan"}`;
      if (ls.length && ((h.A && !w.A) || (h.B && !w.B))) warn.push(`${who}: Strang ${w.A ? "B" : "A"} hat keine Wochenstunde.`);
      return `<div class="sdtt"><div class="small"><b>${esc(multi ? groupName(gkey(k, G.id)) : "Stundenplan")}</b>${vs.length > 1 ? ` · ab ${esc(fmt(v.frm))}` : ""} <span class="muted">· A ${w.A} Std., B ${w.B} Std. pro Woche</span></div>
        ${ls.length ? `<div class="sdls">${ls.map(x => `<label>${DAYS[+x.l.day]} ${x.l.period}.${lessonLen(x.l) === 2 ? `–${+x.l.period + 1}.` : ""} Std. ${sel(`data-act="sdtt" data-key="${vk}|${x.i}"`, d.tt[`${vk}|${x.i}`], `Strang für ${DAYS[+x.l.day]} ${x.l.period}. Stunde`)}</label>`).join("")}</div>` : `<p class="small muted">Keine Stunden eingetragen.</p>`}</div>`;
    }).join("");
  }).join("");
  return `<div class="ov-card sdlg" role="dialog" aria-modal="true" aria-label="In Strängen planen"><header><h2>${esc(c.label)}: in Strängen planen</h2><button type="button" class="iconbtn" data-act="sdclose" aria-label="Schließen">×</button></header>
    <p class="small">Zwei Stränge laufen parallel, jeder mit eigenen Wochenstunden. Ordne die Lernbereiche und die Stunden deines Stundenplans Strang A oder B zu. Puffer folgen dem Lernbereich davor, Leistungsnachweise gehören zu keinem Strang.</p>
    <h3>Lernbereiche</h3>
    <div class="tscroll"><table class="form sdlb"><tbody>${lbRows}</tbody></table></div>
    <p class="small muted">Geplant: Strang A ${h.A} Std. · Strang B ${h.B} Std.</p>
    <h3>Wochenstunden</h3>
    ${tts}
    ${warn.length ? `<div class="warnbox small">${warn.map(esc).join("<br>")}</div>` : ""}
    <div class="acts"><button type="button" class="btn" data-act="sdapply">In Strängen planen</button><button type="button" class="btn ghost" data-act="sdclose">Abbrechen</button></div>
  </div>`;
}
function obPlanCard(k) {
  const C = S.cls[k], str = C.mode === "Stränge", hrs = { A: 0, B: 0 };
  if (str) C.seq.forEach(r => { if (r.code !== "JA" && (unitOf(k, r.code) || {}).lb !== "test") hrs[r.strand === "B" ? "B" : "A"] += +r.hours || 0; });
  return `<div class="card obplan"><div class="obh"><b>${esc(((TYPES[D.classes[k].type] || {}).short || "") + " · " + D.classes[k].label)}</b></div>
    <div class="seg small" role="group" aria-label="Planung">${[["nacheinander", "Nacheinander"], ["Stränge", "In Strängen"]].map(([v, l]) => `<button type="button" aria-selected="${C.mode === v}" data-act="obmode" data-k="${k}" data-v="${v}">${l}</button>`).join("")}</div>
    ${str ? `<table class="form oblbs"><tbody>${obLbs(k).map(({ lb, name }) => `<tr><td>${esc(name)}</td><td><select data-act="oblb" data-k="${k}" data-lb="${esc(lb)}" aria-label="Strang für ${esc(name)}">${["A", "B"].map(t => `<option ${obLbStrand(k, lb) === t ? "selected" : ""}>${t}</option>`).join("")}</select></td></tr>`).join("")}</tbody></table>
      <p class="small muted">Strang A: ${hrs.A} Std. · Strang B: ${hrs.B} Std. Puffer folgen dem Lernbereich davor. Im nächsten Schritt gehört jede Stunde zu Strang A oder B.</p>` : `<p class="small muted">Alle Einheiten nacheinander in der Reihenfolge der Sequenz.</p>`}</div>`;
}
/* Beim ersten Betreten des Schritts „Unterrichtszeiten“ ist das Raster leer: Ein Stundenplan, der noch genau der Vorlage
   entspricht, wird durch einen leeren Zeitraum ab Schuljahresbeginn ersetzt (Merker obTT je Parallelklasse). Selbst
   eingetragene Stundenpläne bleiben stehen. */
const ttKey = tt => JSON.stringify((tt || []).map(v => (v.lessons || []).map(l => [+l.day, +l.period, l.track, lessonLen(l)]).sort()));
function obClearTT() {
  mineList().forEach(k => {
    const tpl = ttKey(defaultClass(k).groups[0].tt);
    (S.cls[k] ? S.cls[k].groups : []).forEach(G => {
      if (G.obTT) return;
      G.obTT = 1;
      if (ttKey(G.tt) === tpl) G.tt = [{ id: uid(), frm: cal().start, lessons: [] }];
    });
    if (S.cls[k]) { touch(); save(k); }
  });
}
/* „Weiter“ im Schritt „Unterrichtszeiten“ erst, wenn jede (Parallel-)Klasse mindestens eine Stunde hat */
const obTTMissing = () => mineList().flatMap(groupsOf).filter(g => { const v = obVersion(g); return !v || !v.lessons.length; });
/* Beim ersten Betreten des Schritts „Planung“ gilt für jede gewählte Klasse „nacheinander“. */
function obDefaults() { mineList().forEach(k => { if (S.cls[k] && !S.cls[k].obMode) setClassMode(k, "nacheinander", true); }); }
function obGrid(g) {
  const k = ck(g), v = obVersion(g);
  if (!v) return "";
  const at = (d, p) => v.lessons.find(l => +l.day === d && +l.period <= p && p < +l.period + lessonLen(l));
  const n = weekHours(v.lessons), multi = obTracks(k).length > 1;
  return `<div class="obgrid card"><div class="obh"><b>${esc(fullLabel(g))}</b><span class="small muted">${n} Stunde${n === 1 ? "" : "n"} pro Woche${sortTT(grp(g).tt.slice()).length > 1 ? ` · gilt ab ${esc(fmt(v.frm, { day: "2-digit", month: "2-digit", year: "numeric" }))}` : ""}</span></div>
    <table><thead><tr><th></th>${[1, 2, 3, 4, 5].map(d => `<th>${DAYS[d]}</th>`).join("")}</tr></thead><tbody>
    ${OB_PERIODS.map(p => `<tr><th class="mono">${p}.</th>${[1, 2, 3, 4, 5].map(d => { const l = at(d, p);
      const part = l && lessonLen(l) === 2 ? (p === +l.period ? " dtop" : " dbot") : "";
      const tl = l && (obTracks(k).includes(l.track) ? l.track : "A");
      return `<td><button type="button" class="obcell ${l ? "on" : ""}${part}" data-act="obcell" data-g="${g}" data-d="${d}" data-p="${p}" aria-pressed="${!!l}" aria-label="${DAYS[d]}, ${p}. Stunde${part ? ", Doppelstunde" : ""}">${l ? (multi ? esc(tl === "SOL" ? "FIL" : tl) : "✓") : ""}</button></td>`; }).join("")}</tr>`).join("")}
    </tbody></table><p class="small muted">${multi ? `Mehrfach klicken wechselt die Spur (${obTracks(k).map(t => t === "SOL" ? "FIL" : t).join(" → ")} → frei). ` : ""}Zwei Stunden direkt nacheinander${multi ? " in derselben Spur" : ""} gelten als Doppelstunde.</p></div>`;
}
/* Doppelstunden im Assistenten: zwei direkt aufeinanderfolgende Stunden am selben Tag mit derselben Spur werden zu einem
   Eintrag mit Dauer 2 (bei drei Stunden hintereinander die ersten beiden). Erst alles in Einzelstunden zerlegen, dann paaren. */
function obSingles(lessons) {
  return lessons.flatMap(l => lessonLen(l) === 2 ? [0, 1].map(n => { const x = Object.assign({}, l, { id: n ? uid() : l.id, period: +l.period + n }); delete x.len; return x; }) : [l]);
}
function obPairDoubles(lessons, oneStrand) {
  const key = t => oneStrand && t === "B" ? "A" : t;
  const ls = obSingles(lessons).sort((a, b) => a.day - b.day || a.period - b.period), out = [];
  for (let i = 0; i < ls.length; i++) {
    const a = ls[i], b = ls[i + 1];
    if (b && +b.day === +a.day && +b.period === +a.period + 1 && key(b.track) === key(a.track)) { out.push(Object.assign({}, a, { len: 2 })); i++; }
    else out.push(a);
  }
  return out;
}
function obToggle(g, d, p) {
  const v = obVersion(g), k = ck(g); if (!v) return;
  const ls = obSingles(v.lessons);
  const i = ls.findIndex(l => +l.day === d && +l.period === p), tracks = obTracks(k);
  if (i < 0) ls.push({ id: uid(), day: d, period: p, track: "A" });
  else { const cur = tracks.includes(ls[i].track) ? ls[i].track : "A", n = tracks.indexOf(cur) + 1; if (n < tracks.length) ls[i].track = tracks[n]; else ls.splice(i, 1); }
  v.lessons = obPairDoubles(ls, S.cls[k].mode !== "Stränge");
  touch(); save(k); renderOverlay();
}
function obOpen(step) { UI.ob = { step: step || 0 }; renderOverlay(); }
function obFinish() {
  if (!Array.isArray(cal().classes)) cal().classes = mineList();
  S.settings.onboarded = true; UI.ob = null;
  fixSelection(); commit(null, { settings: true }); renderOverlay();
  if (route() !== "heute") location.hash = "#heute";
  toast("Eingerichtet. Änderungen jederzeit unter Einstellungen.");
}
function viewOnboarding() {
  // Ohne Festlegung im Schuljahr ist im Assistenten keine Klasse vorausgewählt
  const st = UI.ob.step, Y = cal(), mine = Array.isArray(Y.classes) ? mineList() : [];
  const dots = `<ol class="obsteps">${OB_STEPS.map((s, i) => `<li class="${i === st ? "cur" : i < st ? "done" : ""}">${esc(s)}</li>`).join("")}</ol>`;
  let body = "";
  if (st === 0) body = `<h2>Willkommen im Matheplaner</h2>
    <p>In wenigen Schritten richtest du das Schuljahr ein: welche Klassen du unterrichtest, wie du die Themen planst und wann du Unterricht hast. Danach zeigt die Heute-Seite deine Stunden, und die App plant Stoff und Wiederholungen.</p>
    <div class="card"><b>Schuljahr ${esc(yearLabel(Y.id))}</b><span class="small muted">${esc(fmt(Y.start, { day: "2-digit", month: "2-digit", year: "numeric" }))} – ${esc(fmt(Y.end, { day: "2-digit", month: "2-digit", year: "numeric" }))} · ${Y.holidays.length} Ferienabschnitte · ${Y.free.length} freie Tage</span>
    ${Y.holidays.length ? `<span class="small muted">Ferien und Feiertage für Sachsen sind eingetragen.</span>` : `<button type="button" class="btn ghost sm" data-act="ferien">Ferien Sachsen importieren</button>`}</div>`;
  else if (st === 1) body = `<h2>Welche Klassen unterrichtest du?</h2>
    <p class="small">Hake deine Klassen an. Gibt es zwei Parallelklassen (z. B. 8a und 8b), wähle „2 Parallelklassen“: Du planst dann einmal, jede Klasse hat aber eigene Stunden und eigenen Lernstand. In der Oberschule gibt es ab Klasse 7 Haupt- (HS) und Realschulbildungsgang (RS), im Gymnasium in 11/12 Grund- (GK) und Leistungskurs (LK).</p>
    ${Object.entries(TYPES).map(([t, T]) => `<h3 class="obtype">${esc(T.label)}</h3><table class="form obclasses"><tbody>${T.grades.flatMap(g => classesFor(t, g)).map(k => myClassRow(k, mine)).join("")}</tbody></table>`).join("")}`;
  else if (st === 2) body = `<h2>Wie planst du die Themen?</h2>
    <p class="small"><b>Nacheinander</b>: Alle Einheiten laufen in einer Reihe, eine nach der anderen. <b>In Strängen</b>: Zwei Themenstränge laufen parallel, z. B. Zahlen und Gleichungen in Strang A, Geometrie in Strang B; jede Stunde im Stundenplan gehört dann zu einem der beiden Stränge. Leistungsnachweise gehören zu keinem Strang.</p>
    ${mine.length ? `<div class="obplans">${mine.map(obPlanCard).join("")}</div>` : `<p class="muted">Du hast noch keine Klasse gewählt. <button type="button" class="linkbtn" data-act="obstep" data-v="1">Zurück zu den Klassen</button></p>`}`;
  else if (st === 3) body = `<h2>Wann hast du Unterricht?</h2>
    <p class="small">Klicke für jede Klasse die Stunden im Wochenplan an (mindestens eine je Klasse). Ändert sich der Stundenplan im Laufe des Jahres oder fällt Unterricht über längere Zeit aus (Praktikum, Klassenfahrt), lege das später unter Einstellungen → Stundenplan an.</p>
    ${myGroups().length ? `<div class="obgrids">${mine.flatMap(groupsOf).map(obGrid).join("")}</div>` : `<p class="muted">Du hast noch keine Klasse gewählt. <button type="button" class="linkbtn" data-act="obstep" data-v="1">Zurück zu den Klassen</button></p>`}`;
  else body = `<h2>Fertig</h2>
    <p>Dein Schuljahr ${esc(yearLabel(Y.id))} ist eingerichtet:</p>
    <ul>${mine.flatMap(groupsOf).map(g => `<li>${esc(fullLabel(g))}: ${obVersion(g) ? weekHours(obVersion(g).lessons) : 0} Stunden pro Woche, ${S.cls[ck(g)].mode === "Stränge" ? "in Strängen" : "nacheinander"}</li>`).join("") || "<li>keine Klasse gewählt</li>"}</ul>
    <p class="small muted">Die Sequenz jeder Klasse folgt dem Lehrplan; Reihenfolge und Stunden passt du unter „Sequenz“ an. Alle Angaben lassen sich unter „Einstellungen“ ändern, den Assistenten startest du dort erneut.</p>`;
  return `<div class="ov-card onboard" role="dialog" aria-label="Einrichtung">
    <header><span class="lbl">Einrichtung · Schritt ${st + 1} von ${OB_STEPS.length}</span><button type="button" class="iconbtn" data-act="obskip" aria-label="Assistent schließen">×</button></header>
    ${dots}<div class="obbody">${body}</div>
    <footer class="acts">${st > 0 ? `<button type="button" class="btn ghost" data-act="obstep" data-v="${st - 1}">Zurück</button>` : `<button type="button" class="btn ghost" data-act="obskip">Später</button>`}
      <span class="sp"></span>${st === 3 && obTTMissing().length ? `<span class="small muted obneed">Noch ohne Stunden: ${esc(obTTMissing().map(fullLabel).join(", "))}</span>` : ""}${st < OB_STEPS.length - 1 ? `<button type="button" class="btn" data-act="obstep" data-v="${st + 1}" ${(st === 1 && !mine.length) || (st === 3 && obTTMissing().length) ? "disabled" : ""}>Weiter</button>` : `<button type="button" class="btn" data-act="obdone">Los geht's</button>`}</footer></div>`;
}

/* ---------------- quiz & SOL overlay ---------------- */
function renderOverlay() {
  const el = document.getElementById("overlay");
  if (UI.ob) {
    // Neuzeichnen im selben Schritt (z. B. Klick ins Wochenraster) hält die Scrollposition; ein neuer Schritt beginnt oben
    const same = !el.hidden && el.dataset.obstep === String(UI.ob.step);
    const keep = same ? ["", ".ov-card", ".obbody"].map(sel => { const n = sel ? el.querySelector(sel) : el; return n ? n.scrollTop : 0; }) : null;
    el.hidden = false; el.innerHTML = viewOnboarding(); el.dataset.obstep = String(UI.ob.step);
    if (keep) ["", ".ov-card", ".obbody"].forEach((sel, i) => { const n = sel ? el.querySelector(sel) : el; if (n) n.scrollTop = keep[i]; });
    return;
  }
  if (UI.strandDlg) {
    const c0 = el.querySelector(".sdlg"), keep = [el.scrollTop, c0 ? c0.scrollTop : 0];
    el.hidden = false; el.innerHTML = strandDlgHtml();
    el.scrollTop = keep[0]; const c1 = el.querySelector(".sdlg"); if (c1 && c0) c1.scrollTop = keep[1];
    return;
  }
  if (UI.solOpen) {
    el.hidden = false;
    el.innerHTML = `<div class="ov-card" role="dialog" aria-label="FIL-Formate"><header><h2>FIL-Stunde: die fünf Formate</h2><button type="button" class="iconbtn" data-act="ovclose" aria-label="Schließen">×</button></header>
      <p class="small">Feste Struktur: 5 min planen, 30 min arbeiten, 10 min kontrollieren und reflektieren. Jede Aufgabe hat eine Lösung zur Selbstkontrolle; die Lehrkraft holt 3–5 Schüler mit derselben Lücke an eine Förderinsel.</p>
      <ol class="sol">${Object.entries(SOL_FORMATS).map(([n, [t, d]]) => `<li><b>${esc(t)}</b><span>${esc(d)}</span></li>`).join("")}</ol>
      <p class="small muted">Die Heute-Seite schlägt das Format automatisch vor: vor und in der Woche einer Klassenarbeit Format 4, danach Format 5, sonst im Wechsel 1, 2, 3.</p></div>`;
    return;
  }
  if (!UI.quiz) { el.hidden = true; el.innerHTML = ""; return; }
  const q = UI.quiz, x = q.items[q.i];
  el.hidden = false;
  if (!x) {
    el.innerHTML = `<div class="ov-card quiz"><header><h2>Fertig</h2><button type="button" class="iconbtn" data-act="ovclose" aria-label="Schließen">×</button></header><p class="big">Alle ${q.items.length} Wiederholungen bewertet.</p><button type="button" class="btn" data-act="ovclose">Schließen</button></div>`;
    return;
  }
  const task = shownTask(q.k, x.a, levelOf(x));
  el.innerHTML = `<div class="ov-card quiz" role="dialog" aria-label="Wiederholung" style="${sty(lbOf(q.k, x.code))}">
    <header><span class="chip"><b>${esc(x.code)}</b></span>${levelPill(task.l)}<span class="mono muted">${q.i + 1} / ${q.items.length}</span><button type="button" class="iconbtn" data-act="ovclose" aria-label="Schließen">×</button></header>
    <div class="qq${task.g ? " gen" : ""}">${taskQHtml(task, q.show)}</div>
    ${q.show ? `<div class="qa${task.g ? " gen" : ""}">${taskAHtml(task)}</div><div class="small muted center">${mx(x.a.t)}</div>${rateButtons(q.k, x.a.id).replace(/data-act="rate"/g, 'data-act="qrate"')}` : `<button type="button" class="btn big" data-act="qshow">Lösung zeigen <span class="muted small">(Leertaste)</span></button>${task.g ? `<div class="center">${genBtn(q.k, x.a, task).replace("Neue Aufgabe", "Neue Aufgabe <span class=\"muted\">(N)</span>")}</div>` : ""}`}
  </div>`;
  typesetMath(el);
}

/* ---------------- router & render ---------------- */
const NAV = [["heute", "Heute"], ["plan", "Jahresplan"], ["einheiten", "Einheiten"], ["lernuebersicht", "Lernübersicht"], ["einstellungen", "Einstellungen"]];
function route() { const h = (location.hash || "#heute").slice(1); return h || "heute"; }
/* Ein Feld, das beim Neuaufbau den Fokus verliert, kann ein change-Ereignis auslösen; dann nach dem Durchlauf erneut zeichnen. */
let rendering = false;
function render() {
  if (rendering) { render.again = true; return; }
  rendering = true;
  try { renderNow(); } finally { rendering = false; }
  if (render.again) { render.again = false; render(); }
}
function renderNow() {
  ensureSubscribed();
  let r = route(), html;
  // alte Adresse #sequenz: Jahresplan in der Listenansicht
  if (r === "sequenz") { r = "plan"; UI.planView = "list"; try { localStorage.setItem("mp-planview", "list"); } catch (e) {} history.replaceState(null, "", "#plan"); }
  const m = /^u-(.+)-(\d+)$/.exec(r), mk = m && D.classes[m[1]] ? m[1] : null;
  const VIEWS = { heute: viewToday, plan: viewPlan, einheiten: viewUnits, lernuebersicht: viewEngine, einstellungen: viewSettings };
  const TITLES = { plan: "Jahresplan", einheiten: "Einheiten", lernuebersicht: "Lernübersicht" };
  if (mk) { if (UI.cls !== mk || UI.type !== D.classes[mk].type) { UI.cls = mk; UI.type = D.classes[mk].type; try { localStorage.setItem("mp-cls", UI.cls); localStorage.setItem("mp-type", UI.type); } catch (e) {} } html = viewUnit(mk, +m[2]); }
  else if (TITLES[r] && !curClass()) html = noClassView(TITLES[r]);
  else html = (VIEWS[r] || viewToday)();
  const active = mk ? "einheiten" : r;
  renderCtx();
  document.getElementById("nav").innerHTML = NAV.map(([id, l]) => `<a href="#${id}" ${active === id ? 'aria-current="page"' : ""}>${l}</a>`).join("");
  const main = document.getElementById("main");
  const sy = window.scrollY;
  main.innerHTML = html;
  typesetMath(main);
  // Beim Seitenwechsel nach oben, sonst (Klick, Eingabe) die Scrollposition halten
  window.scrollTo(0, render.keepScroll ? sy : 0);
  render.keepScroll = true;
  renderOverlay();
  const dl = document.getElementById("dlbtn"); if (dl && downloads) dl.hidden = false;
}
let lastRoute = null;
window.addEventListener("hashchange", () => {
  UI.editAtom = null; UI.chkForm = null; UI.confirm = null; UI.dp = null; UI.planSel = null; UI.planLn = null; renderDp(); render.keepScroll = false; render();
  if (route() === "plan") { const c = document.getElementById("curweek"); if (c) c.scrollIntoView({ block: "center" }); }
});

/* ---------------- events ---------------- */
function addGroup(k) {
  const C = S.cls[k]; if (C.groups.length >= GIDS.length) return;
  const id = GIDS.find(x => !C.groups.some(G => G.id === x)), base = C.groups[0];
  const snap = snapshotFor(k);
  C.groups.push(Object.assign(newGroup(id, "", base.tt.map(v => ({ id: uid(), frm: v.frm, lessons: cloneLessons(v.lessons) }))), { pin: clone(base.pin || {}) }));
  S.eng[gkey(k, id)] = defaultEngine();
  UI.gid[k] = id; try { localStorage.setItem("mp-gid", JSON.stringify(UI.gid)); } catch (e) {}
  undoStack = snap; commit(k, { eng: true }); toast("Parallelklasse angelegt. Der Stundenplan ist kopiert, bitte anpassen.", true);
}
function removeGroup(k) {
  const C = S.cls[k]; if (C.groups.length < 2) return;
  const snap = snapshotFor(k), gone = C.groups.pop();
  S.eng[gkey(k, gone.id)] = defaultEngine(); delete UI.gid[k]; UI.confirm = null;
  undoStack = snap; commit(k, { eng: true }); toast("Parallelklasse entfernt.", true);
}
/* Quiz im Vollbild: das Overlay wird zum Vollbild-Element. Am Ende oder beim Schließen wird es verlassen;
   war vorher schon etwas im Vollbild, stellt der Browser diesen Zustand selbst wieder her. */
function quizFullscreen() {
  const el = document.getElementById("overlay");
  if (!el.requestFullscreen || document.fullscreenElement === el) return;
  try { const r = el.requestFullscreen(); if (r && r.catch) r.catch(() => {}); } catch (e) {}
}
function leaveQuizFullscreen() {
  const el = document.getElementById("overlay");
  if (document.fullscreenElement === el && document.exitFullscreen) { try { const r = document.exitFullscreen(); if (r && r.catch) r.catch(() => {}); } catch (e) {} }
}
function quizNext() { const q = UI.quiz; q.i++; q.show = false; if (q.i >= q.items.length) leaveQuizFullscreen(); renderOverlay(); }
function closeOverlay() { leaveQuizFullscreen(); UI.quiz = null; UI.solOpen = false; renderOverlay(); render(); }
const ttVersion = (g, id) => (grp(g).tt || []).find(v => v.id === id);
function setSeq(k, fn) { const C = S.cls[k]; fn(C.seq); commit(k); }
document.addEventListener("click", ev => {
  // Kalender: Klick daneben schließt ihn
  if (UI.dp && !ev.target.closest("#dpop") && !ev.target.closest('[data-act="dp"]')) dpClose();
  // Klick auf die gerade offene Seite in der Navigation: nach oben (es gibt kein hashchange)
  const nl = ev.target.closest("#nav a"); if (nl && nl.getAttribute("href") === location.hash) { window.scrollTo(0, 0); return; }
  const b = ev.target.closest("[data-act]"); if (!b) return;
  const a = b.dataset.act, k = b.dataset.k || UI.cls, i = +b.dataset.i;
  if (b.tagName === "SELECT" || (b.tagName === "INPUT" && b.type !== "checkbox" && b.type !== "button")) return;
  switch (a) {
    case "undo": doUndo(); break;
    case "cls": {
      UI.cls = b.dataset.k; UI.type = D.classes[UI.cls].type; try { localStorage.setItem("mp-type", UI.type); } catch (e) {} UI.editAtom = null; UI.confirm = null; try { localStorage.setItem("mp-cls", UI.cls); } catch (e) {}
      if (/^u-/.test(route())) { location.hash = "#einheiten"; break; }
      render(); break;
    }
    case "type": {
      const t = b.dataset.v; if (!TYPES[t]) break;
      UI.type = t; UI.editAtom = null; UI.confirm = null;
      if (D.classes[UI.cls].type !== t || !isMine(UI.cls)) { const g = D.classes[UI.cls].grade, k2 = classFor(t, g); const k = k2 && isMine(k2) ? k2 : mineList().find(c => D.classes[c].type === t); if (k) UI.cls = k; }
      try { localStorage.setItem("mp-type", UI.type); localStorage.setItem("mp-cls", UI.cls); } catch (e) {}
      if (/^u-/.test(route())) { location.hash = "#einheiten"; break; }
      render(); break;
    }
    case "todaycls": UI.todayAll = b.dataset.v === "all"; try { localStorage.setItem("mp-today", UI.todayAll ? "all" : "one"); } catch (e) {} render(); break;
    case "year": switchYear(b.dataset.v, true); break;
    case "grp": { const g = b.dataset.g; UI.gid[ck(g)] = gidOf(g); try { localStorage.setItem("mp-gid", JSON.stringify(UI.gid)); } catch (e) {} UI.reveal = {}; UI.confirm = null; render(); break; }
    case "gadd": addGroup(k); break;
    case "lastdayreset": { const c = ck(curG()); delete S.cls[c].lastDay; commit(c); break; }
    case "gdel": removeGroup(k); break;
    case "yearadd": { const id = document.getElementById("newyear").value; createYear(id, document.getElementById("ny-seq").checked, document.getElementById("ny-tt").checked); break; }
    case "ydel": { const id = b.dataset.v; if (id === UI.year) break; S.settings.years = S.settings.years.filter(y => y.id !== id); UI.confirm = null; commit(null, { settings: true }); toast(`Schuljahr ${yearLabel(id)} aus der Liste entfernt.`); break; }
    case "ferien": importFerien(); break;
    case "day": UI.date = addDays(UI.date, +b.dataset.n); UI.reveal = {}; render(); break;
    case "today": UI.date = todayIso(); UI.reveal = {}; render(); break;
    case "reveal": UI.reveal[b.dataset.id] = true; render(); break;
    case "rate": rate(b.dataset.k, b.dataset.id, +b.dataset.g); break;
    case "done": toggleDone(b.dataset.k, b.dataset.key); break;
    case "addhour": addHour(b.dataset.k, +b.dataset.row); break;
    case "cancel": cancelSlot(b.dataset.k, b.dataset.key); break;
    case "quiz": { const es = engineState(b.dataset.k, UI.date); UI.quiz = { k: b.dataset.k, items: es.pick.slice(), i: 0, show: false }; renderOverlay(); quizFullscreen(); break; }
    case "qshow": UI.quiz.show = true; renderOverlay(); break;
    case "gnew": { const sk = b.dataset.id; genSeq[sk] = (genSeq[sk] || 0) + 1; if (UI.quiz) renderOverlay(); else render(); break; }
    case "qrate": { const q = UI.quiz, x = q.items[q.i]; rate(q.k, x.a.id, +b.dataset.g); quizNext(); break; }
    case "solinfo": UI.solOpen = true; renderOverlay(); break;
    case "ovclose": closeOverlay(); break;
    case "obopen": obOpen(0); break;
    case "obstep": { const to = Math.max(0, Math.min(OB_STEPS.length - 1, +b.dataset.v)); if (to >= 2 && UI.ob && UI.ob.step < 2) obDefaults(); if (to === 3) obClearTT(); UI.ob = { step: to }; renderOverlay(); break; }
    case "obmode": setClassMode(b.dataset.k, b.dataset.v); break;
    case "obskip": UI.ob = null; UI.obDismissed = true; renderOverlay(); render(); break;
    case "obdone": obFinish(); break;
    case "obcell": obToggle(b.dataset.g, +b.dataset.d, +b.dataset.p); break;
    case "mode": if (b.dataset.v === "Stränge" && S.cls[k].mode !== "Stränge") { strandDlgOpen(k); break; } S.cls[k].mode = b.dataset.v; commit(k); break;
    case "sdopen": strandDlgOpen(k); break;
    case "sdclose": strandDlgClose(); break;
    case "sdapply": strandDlgApply(); break;
    case "planview": UI.planView = b.dataset.v === "list" ? "list" : "weeks"; UI.planSel = null; UI.planLn = null; try { localStorage.setItem("mp-planview", UI.planView); } catch (e) {} render(); break;
    case "psel": {
      const row = b.dataset.row || null, chk = b.dataset.chk || null, cur = UI.planSel;
      UI.planSel = (row || chk) && !(cur && cur.row === row && cur.chk === chk && cur.wk === b.dataset.wk) ? { row, chk, wk: b.dataset.wk } : null;
      UI.planLn = null; UI.confirm = null; render(); break;
    }
    case "pmv": moveInStrand(curG(), b.dataset.row, +b.dataset.n); break;
    case "paddrow": UI.planAdd = !UI.planAdd; render(); break;
    case "plnform": UI.planLn = b.dataset.wk && UI.planLn !== b.dataset.wk ? b.dataset.wk : null; UI.planSel = null; render(); if (UI.planLn) { const f = document.querySelector(".plnf"); if (f) f.scrollIntoView({ block: "nearest" }); } break;
    case "plnadd": {
      const v = id => document.getElementById(id), d = (document.querySelector('input[name="plnday"]:checked') || {}).value, g = curG();
      if (!d) { toast("Bitte einen Tag mit Mathe-Unterricht wählen."); break; }
      const dur = +v("plndur").value || 45, topic = v("plntopic").value.trim(), s0 = dateSlot(g, d);
      UI.planLn = null;
      if (dur < 45) { addShortTest(k, { topic, dur, date: d, g }); break; }
      addLn(k, { kind: v("plnkind").value, topic, dur, wdh: v("plnwdh").checked, rueck: v("plnrueck").checked, afterIdx: s0 ? s0.lesson.row.idx : S.cls[k].seq.length - 1, date: d, g });
      break;
    }
    case "hrs": setSeq(k, s => { s[i].hours = Math.max(0, s[i].hours + +b.dataset.n); }); break;
    case "mv": setSeq(k, s => { const j = i + +b.dataset.n; if (j < 0 || j >= s.length) return; [s[i], s[j]] = [s[j], s[i]]; }); break;
    case "addp": setSeq(k, s => { s.splice(i + 1, 0, { id: uid(), code: "P", strand: s[i].strand, hours: 1 }); }); break;
    case "del": { const snap = snapshotFor(k); const code = S.cls[k].seq[i].code; S.cls[k].seq.splice(i, 1); undoStack = snap; commit(k); toast(`${code} aus dem Plan genommen.`, true); break; }
    case "addrow": {
      const code = document.getElementById("addcode").value, strand = document.getElementById("addstrand").value, h = Math.max(0, +document.getElementById("addhrs").value || 0);
      const u = unitOf(k, code); setSeq(k, s => { s.push({ id: uid(), code, strand: S.cls[k].mode === "nacheinander" ? "A" : strand, hours: h || (u ? u.stunden.length : 1) || 1 }); }); break;
    }
    case "confirm": UI.confirm = b.dataset.v || null; render(); break;
    case "tpladopt": { const snap = snapshotFor(k); adoptTemplate(k, S.cls[k]); undoStack = snap; commit(k); toast(`Vorlage für ${fullLabel(k)} übernommen.`, true); break; }
    case "tplkeep": { const snap = snapshotFor(k); S.cls[k].tpl = Object.assign(tplStamp(k), { atoms: tplOf(k, S.cls[k]).atoms }); undoStack = snap; commit(k); toast("Deine Fassung bleibt. Spätere Änderungen der Vorlage werden wieder angezeigt.", true); break; }
    case "atomtpl": { const snap = snapshotFor(k); delete S.cls[k].atoms[b.dataset.code]; undoStack = snap; commit(k); toast("Atome der Vorlage übernommen.", true); break; }
    case "atomkeep": { const snap = snapshotFor(k); tplOf(k, S.cls[k]).atoms[b.dataset.code] = tplAtomHash(k, b.dataset.code); undoStack = snap; commit(k); toast("Deine Atome bleiben.", true); break; }
    case "tplexport": {
      const ks = b.dataset.v === "all" ? mineList() : [k], files = ks.map(templateExport);
      const body = files.length === 1 ? files[0] : { app: "matheplaner-vorlage", v: 1, exported: todayIso(), classes: Object.fromEntries(files.map(f => [f.id, f])) };
      const name = files.length === 1 ? `vorlage-${files[0].id}.json` : `vorlage-${todayIso()}.json`;
      saveFile(name, JSON.stringify(body, null, 1)).then(() => toast(`Vorlage gespeichert: ${name}. Für die Fachschaft in src/vorlage/ ablegen.`), () => toast("Speichern abgebrochen."));
      break;
    }
    case "reset": { const d0 = defaultClass(k); d0.tpl.atoms = clone(tplOf(k, S.cls[k]).atoms); S.cls[k] = Object.assign(d0, { atoms: S.cls[k].atoms, ln: S.cls[k].ln || {}, checks: S.cls[k].checks || [], groups: S.cls[k].groups.map(G => Object.assign(G, { adj: {}, pin: kaPins(k, d0.seq, cal()) })) }); } UI.confirm = null; commit(k); toast("Sequenz zurückgesetzt."); break;
    case "resetall": { resetYearState(); CLASSES.forEach(c => { save(c); GIDS.forEach(gid => save(engDoc(gkey(c, gid)))); }); cal().engineStart = cal().start; save("settings"); undoStack = null; UI.confirm = null; touch(); render(); toast(`Schuljahr ${yearLabel(cal().id)} zurückgesetzt.`); break; }
    case "engfilter": UI.engFilter = b.dataset.v; render(); break;
    case "atomnew": UI.editAtom = { code: b.dataset.code, id: "new", l: +b.dataset.l }; render(); break;
    case "atomedit": UI.editAtom = { code: b.dataset.code, id: b.dataset.id }; render(); break;
    case "atomcancel": UI.editAtom = null; render(); break;
    case "atommove": moveAtom(k, b.dataset.code, b.dataset.id, +b.dataset.l); break;
    case "lnadd": {
      const v = id => document.getElementById(id), kind = v("lnkind").value, dur = +v("lndur").value || 45;
      if (dur < 45) { addShortTest(k, { topic: v("lntopic").value.trim(), dur, date: v("lndate").value, afterIdx: +v("lnafter").value, g: curG() }); break; }
      const code = addLn(k, { kind, topic: v("lntopic").value.trim(), dur: +v("lndur").value || 45, wdh: v("lnwdh").checked, rueck: v("lnrueck").checked, afterIdx: +v("lnafter").value, date: v("lndate").value, g: curG() });
      break;
    }
    case "lnunpin": setLnDate(curG(), b.dataset.row, ""); break;
    case "chkunpin": unpinCheck(curG(), b.dataset.id); break;
    case "dp": if (UI.dp && UI.dp.t === b.dataset.t && UI.dp.row === b.dataset.row && UI.dp.id === b.dataset.id) dpClose(); else dpOpen(b); break;
    case "dpday": dpPick(b.dataset.d); break;
    case "dpmove": dpMove(+b.dataset.n); break;
    case "dpclose": dpClose(); break;
    case "lnremove": removeLn(k, { id: b.dataset.id, row: b.dataset.row, code: b.dataset.code }); break;
    case "chknew": UI.chkForm = { code: b.dataset.code, n: +b.dataset.l }; render(); break;
    case "chkcancel": UI.chkForm = null; render(); break;
    case "unitplus": { const n = +b.dataset.n || 1, code = b.dataset.code, C = S.cls[k], snap = snapshotFor(k), row = C.seq.find(r => r.code === code); if (!row) break; row.hours = (+row.hours || 0) + n; undoStack = snap; commit(k); toast(`${code}: ${n} Std. mehr für die Kontrollen eingeplant.`, true); break; }
    case "chksave": {
      const n = document.getElementById("chkn") ? +document.getElementById("chkn").value : +b.dataset.l, snap = snapshotFor(k), C = S.cls[k];
      C.checks = C.checks || []; C.checks.push({ id: uid(), kind: document.getElementById("chkkind").value, title: document.getElementById("chktitle").value.trim(), code: b.dataset.code, n, dur: +document.getElementById("chkdur").value || 20 });
      UI.chkForm = null; undoStack = snap; commit(k); toast(`${CHECK_KINDS[C.checks[C.checks.length - 1].kind]} in Stunde ${n} eingetragen.`, true); break;
    }
    case "chkdel": { const C = S.cls[k], snap = snapshotFor(k); C.checks = (C.checks || []).filter(x => x.id !== b.dataset.id); undoStack = snap; commit(k); toast("Kontrolle gelöscht.", true); break; }
    case "atomdel": { const code = b.dataset.code; const list = atomsOf(k, code).filter(x => x.id !== b.dataset.id); const snap = snapshotFor(k); S.cls[k].atoms[code] = clone(list); undoStack = snap; commit(k); toast("Atom gelöscht.", true); break; }
    case "atomreset": { const snap = snapshotFor(k); delete S.cls[k].atoms[b.dataset.code]; undoStack = snap; commit(k); toast("Atome auf die Vorlage zurückgesetzt.", true); break; }
    case "holadd": cal().holidays.push({ name: "Ferien", frm: "", to: "" }); commit(null, { settings: true }); break;
    case "holdel": cal().holidays.splice(i, 1); commit(null, { settings: true }); break;
    case "freeadd": cal().free.push({ date: "", name: "" }); commit(null, { settings: true }); break;
    case "freedel": cal().free.splice(i, 1); commit(null, { settings: true }); break;
    case "tladd": { const v = ttVersion(curG(), b.dataset.v); if (v) { v.lessons.push({ id: uid(), day: 1, period: 1, track: "A" }); commit(k); } break; }
    case "tldel": { const v = ttVersion(curG(), b.dataset.v); if (v) { v.lessons.splice(i, 1); commit(k); } break; }
    case "ttnew": {
      const frm = document.getElementById("ttnewfrm").value, C = grp(curG());
      if (!frm) { toast("Bitte zuerst das Datum wählen, ab dem der neue Stundenplan gilt."); break; }
      if (C.tt.some(v => v.frm === frm)) { toast("Ab diesem Datum gibt es schon einen Stundenplan."); break; }
      const base = sortTT(C.tt.slice()).filter(v => v.frm <= frm).pop() || C.tt[C.tt.length - 1];
      const snap = snapshotFor(k); C.tt.push({ id: uid(), frm, lessons: base ? cloneLessons(base.lessons) : [] }); sortTT(C.tt);
      undoStack = snap; commit(k); toast(`Neuer Stundenplan ab ${fmt(frm)} angelegt. Jetzt die Stunden anpassen.`, true); break;
    }
    case "ttdelv": { const C = grp(curG()); if (C.tt.length < 2) break; const snap = snapshotFor(k); C.tt = C.tt.filter(v => v.id !== b.dataset.v); undoStack = snap; commit(k); toast("Stundenplan-Zeitraum gelöscht.", true); break; }
    case "offadd": grp(curG()).off.push({ id: uid(), name: "", frm: "", to: "" }); commit(k); break;
    case "offdel": grp(curG()).off.splice(i, 1); commit(k); break;
    case "engreset": { const snap = snapshotFor(UI.cls); CLASSES.forEach(c => { S.cls[c].groups.forEach(G => { G.done = {}; G.cancelled = {}; G.adj = {}; }); GIDS.forEach(gid => { S.eng[gkey(c, gid)] = defaultEngine(); save(engDoc(gkey(c, gid))); }); save(c); }); cal().engineStart = cal().start; save("settings"); undoStack = snap; touch(); render(); toast(`Lernstand, Ausfälle und Häkchen ${yearLabel(cal().id)} geleert.`, true); break; }
    case "export": {
      const txt = JSON.stringify({ app: "matheplaner", v: 2, year: UI.year, settings: S.settings, cls: S.cls, eng: S.eng });
      const box = document.getElementById("importbox");
      navigator.clipboard.writeText(txt).then(() => { markBackup(); toast("Sicherung in die Zwischenablage kopiert."); }, () => { box.value = txt; box.select(); markBackup(); toast("Kopieren nicht erlaubt: Text ist markiert, bitte mit Strg+C kopieren."); });
      break;
    }
    case "download": {
      const txt = JSON.stringify({ app: "matheplaner", v: 2, year: UI.year, settings: S.settings, cls: S.cls, eng: S.eng }, null, 1);
      saveFile(`matheplaner-sicherung-${todayIso()}.json`, txt).then(() => { markBackup(); toast("Datei gespeichert."); }, () => toast("Speichern abgebrochen."));
      break;
    }
    case "import": {
      try {
        const o = JSON.parse(document.getElementById("importbox").value);
        if (o.app !== "matheplaner") throw 0;
        if (o.settings && Array.isArray(o.settings.years)) applyDoc("settings", o.settings);
        else if (o.settings) {
          const { calendar, engineStart, ...rest } = o.settings;
          Object.assign(S.settings, rest, { years: S.settings.years });
          if (calendar) ["start", "end", "holidays", "free"].forEach(f => { if (calendar[f]) cal()[f] = calendar[f]; });
          if (engineStart) cal().engineStart = engineStart;
        }
        const target = o.year && S.settings.years.some(y => y.id === o.year) ? o.year : S.settings.years.some(y => y.id === UI.year) ? UI.year : pickYear();
        switchYear(target, true);
        CLASSES.forEach(c => {
          if (o.cls && o.cls[c]) applyDoc(c, o.cls[c]);
          GIDS.forEach(gid => { const g = gkey(c, gid), e = o.eng && (o.eng[g] || (gid === "a" ? o.eng[c] : null)); if (e) applyDoc(engDoc(g), e); save(engDoc(g)); });
          save(c);
        });
        save("settings"); touch(); render(); toast("Sicherung eingespielt.");
      } catch (e) { toast("Das ist keine gültige Sicherung dieser App."); }
      break;
    }
  }
});
document.addEventListener("change", ev => {
  const t = ev.target, a = t.dataset.act;
  if (t.id === "yearsel") { if (t.value === "__new") { UI.newYear = yearOptions()[0]; location.hash = "#einstellungen"; render(); const nb = document.getElementById("newyearbox"); if (nb) nb.scrollIntoView({ block: "center" }); } else switchYear(t.value, true); return; }
  if (t.id === "newyear") { UI.newYear = t.value; return; }
  if (t.id === "lnkind" || t.id === "plnkind") { const p = t.id.slice(0, -4), K = LN_KINDS[t.value], v = id => document.getElementById(p + id); if (K) { v("dur").innerHTML = durOptions(t.value, K.dur); v("wdh").checked = K.wdh; v("rueck").checked = K.rueck; lnFormSync(p); } return; }
  if (t.id === "lndur" || t.id === "plndur") { lnFormSync(t.id.slice(0, -3)); return; }
  if (!a) { if (t.id === "pickdate" && t.value) { UI.date = t.value; render(); } return; }
  const k = t.dataset.k || UI.cls, i = +t.dataset.i, f = t.dataset.f;
  switch (a) {
    case "strand": setSeq(k, s => { s[i].strand = t.value; }); break;
    case "oblb": setLbStrand(t.dataset.k, t.dataset.lb, t.value); break;
    case "sdlb": { const d = UI.strandDlg; if (!d) break; d.lb[t.dataset.lb] = t.value; strandSuggestTT(); renderOverlay(); break; }
    case "sdtt": { const d = UI.strandDlg; if (!d) break; d.tt[t.dataset.key] = t.value; delete d.auto[t.dataset.key.split("|").slice(0, 2).join("|")]; renderOverlay(); break; }
    case "lndate": if (t.value) setLnDate(curG(), t.dataset.row, t.value); break;
    case "lndur": setLnDur(ck(curG()), t.dataset.code, +t.value); break;
    case "chkdur": { const C = S.cls[ck(curG())], x = (C.checks || []).find(y => y.id === t.dataset.id); if (x) { const snap = snapshotFor(ck(curG())); x.dur = +t.value; undoStack = snap; commit(ck(curG())); toast(`${CHECK_KINDS[x.kind]}: ${x.dur} min.`, true); } break; }
    case "chkdate": if (t.value) setCheckDate(curG(), t.dataset.id, t.value); break;
    case "lnset": {
      const u = (S.cls[k].ln || {})[t.dataset.code]; if (!u) break;
      if (f === "title") { if (t.value.trim()) u.title = t.value.trim(); }
      else { const st = t.value.split("\n").map(x => x.trim()).filter(Boolean); if (st.length) u.stunden = st; }
      commit(k); break;
    }
    case "hrsset": setSeq(k, s => { s[i].hours = Math.max(0, Math.min(60, Math.round(+t.value || 0))); }); break;
    case "ret": S.settings.retention = +t.value; commit(null, { settings: true }); break;
    case "perlesson": S.settings.perLesson = Math.max(1, Math.min(15, Math.round(+t.value || 10))); commit(null, { settings: true }); break;
    case "cal": if (t.value) { cal()[f] = t.value; commit(null, { settings: true }); } break;
    case "autobuf": S.settings.autoBuffer = t.checked; commit(null, { settings: true }); break;
    case "engstart": if (t.value) { cal().engineStart = t.value; commit(null, { settings: true }); } break;
    case "hol": cal().holidays[i][f] = t.value; commit(null, { settings: true }); break;
    case "free": cal().free[i][f] = t.value; commit(null, { settings: true }); break;
    case "tl": { const v = ttVersion(curG(), t.dataset.v), row = v && v.lessons[i]; if (!row) break; if (f === "track") row.track = t.value; else if (f === "len") { if (t.value === "2") row.len = 2; else delete row.len; } else row[f] = Math.max(1, Math.round(+t.value || 1)); commit(k); break; }
    case "lastday": { const c = ck(curG()); S.cls[c].lastDay = t.value || ""; commit(c); break; }
    case "ttfrm": { const G = grp(curG()), v = ttVersion(curG(), t.dataset.v); if (!v || !t.value) break; if (G.tt.some(x => x !== v && x.frm === t.value)) { toast("Ab diesem Datum gibt es schon einen Stundenplan."); render(); break; } v.frm = t.value; sortTT(G.tt); commit(k); break; }
    case "mine": {
      const Y = cal(), l = Array.isArray(Y.classes) || !UI.ob ? mineList() : [], kk = t.dataset.k;
      Y.classes = t.checked ? CLASSES.filter(c => c === kk || l.includes(c)) : l.filter(c => c !== kk);
      if (t.checked) { UI.cls = kk; UI.type = D.classes[kk].type; }
      fixSelection(); try { localStorage.setItem("mp-cls", UI.cls); localStorage.setItem("mp-type", UI.type); } catch (e) {}
      commit(null, { settings: true }); break;
    }
    case "gcount": {
      const kk = t.dataset.k, n = +t.value, C = S.cls[kk];
      if (n === 2 && C.groups.length < 2) addGroup(kk);
      else if (n === 1 && C.groups.length > 1) { UI.confirm = "gdel-" + kk; render(); }
      break;
    }
    case "gname": { const G = grp(t.dataset.g); G.name = t.value.trim(); commit(ck(t.dataset.g)); break; }
    case "off": { const o = grp(curG()).off[i]; if (!o) break; o[f] = t.value; commit(k); break; }
  }
});
document.addEventListener("submit", ev => {
  const fm = ev.target.closest(".aform"); if (!fm) return; ev.preventDefault();
  const k = UI.cls, code = fm.dataset.code, id = fm.dataset.id, fd = new FormData(fm);
  const atom = { id: id === "new" ? code + "." + uid() : id, l: Math.max(1, +fd.get("l") || 1), t: String(fd.get("t")).trim(), q: String(fd.get("q")).trim(), a: String(fd.get("a")).trim() };
  LV_FIELDS.forEach(f => { atom[f] = String(fd.get(f) || "").trim(); });
  if (fd.has("g")) { const g = String(fd.get("g") || "").split("|").filter(Boolean); atom.g = g.length > 1 ? g : g[0] || ""; }
  if (!atom.t) return;
  const list = clone(atomsOf(k, code)); const j = list.findIndex(x => x.id === id);
  if (j >= 0) list[j] = atom; else list.push(atom);
  list.sort((x, y) => x.l - y.l);
  S.cls[k].atoms[code] = list; UI.editAtom = null; commit(k); toast("Atom gespeichert.");
});
/* Atome per Ziehen zwischen den Stunden einer Einheit verschieben */
let dragAtom = null;
document.addEventListener("dragstart", ev => {
  const li = ev.target.closest && ev.target.closest("li.atom[draggable]"); if (!li) return;
  dragAtom = { code: li.dataset.code, id: li.dataset.id }; li.classList.add("dragging");
  try { ev.dataTransfer.setData("text/plain", li.dataset.id); ev.dataTransfer.effectAllowed = "move"; } catch (e) {}
});
document.addEventListener("dragend", () => { dragAtom = null; document.querySelectorAll(".dragging,.dropok").forEach(el => el.classList.remove("dragging", "dropok")); });
document.addEventListener("dragover", ev => {
  const t = dragAtom && ev.target.closest && ev.target.closest(".lesson[data-drop]"); if (!t || t.dataset.code !== dragAtom.code) return;
  ev.preventDefault(); document.querySelectorAll(".dropok").forEach(el => { if (el !== t) el.classList.remove("dropok"); }); t.classList.add("dropok");
});
document.addEventListener("drop", ev => {
  const t = dragAtom && ev.target.closest && ev.target.closest(".lesson[data-drop]"); if (!t || t.dataset.code !== dragAtom.code) return;
  ev.preventDefault(); const d = dragAtom; dragAtom = null; moveAtom(UI.cls, d.code, d.id, +t.dataset.drop);
});
/* Leistungsnachweise und Kontrollen im Jahresplan in eine andere Woche ziehen */
let dragLn = null;
document.addEventListener("dragstart", ev => {
  const el = ev.target.closest && ev.target.closest("[data-drag]"); if (!el) return;
  dragLn = { t: el.dataset.drag, row: el.dataset.row, id: el.dataset.id }; el.classList.add("dragging");
  try { ev.dataTransfer.setData("text/plain", el.dataset.row || el.dataset.id); ev.dataTransfer.effectAllowed = "move"; } catch (e) {}
});
document.addEventListener("dragend", () => { dragLn = null; document.querySelectorAll(".dropwk").forEach(el => el.classList.remove("dropwk")); });
document.addEventListener("dragover", ev => {
  const t = dragLn && ev.target.closest && ev.target.closest("tr[data-wk]"); if (!t) return;
  ev.preventDefault(); document.querySelectorAll(".dropwk").forEach(el => { if (el !== t) el.classList.remove("dropwk"); }); t.classList.add("dropwk");
});
document.addEventListener("drop", ev => {
  const t = dragLn && ev.target.closest && ev.target.closest("tr[data-wk]"); if (!t) return;
  ev.preventDefault(); const d = dragLn; dragLn = null; dropOnWeek(curG(), d, t.dataset.wk);
});
/* „Mehr …“ im Jahresplan bleibt beim Neuzeichnen offen */
document.addEventListener("toggle", ev => { if (ev.target.classList && ev.target.classList.contains("pmore")) UI.planMore = ev.target.open; }, true);
document.addEventListener("keydown", ev => {
  if (UI.dp && ev.key === "Escape") { dpClose(); return; }
  if (UI.strandDlg && ev.key === "Escape") { strandDlgClose(); return; }
  if ((UI.planSel || UI.planLn) && ev.key === "Escape" && route() === "plan" && !ev.target.closest("input,select,textarea")) { UI.planSel = null; UI.planLn = null; render(); return; }
  if (UI.ob && ev.key === "Escape") { UI.ob = null; UI.obDismissed = true; renderOverlay(); render(); return; }
  if (!UI.quiz && !UI.solOpen) return;
  if (ev.key === "Escape") { closeOverlay(); return; }
  if (!UI.quiz) return;
  if (ev.key === " " && !UI.quiz.show) { ev.preventDefault(); UI.quiz.show = true; renderOverlay(); }
  else if ((ev.key === "n" || ev.key === "N") && !UI.quiz.show) { const x = UI.quiz.items[UI.quiz.i]; if (x && hasGen(x.a)) { const sk = UI.quiz.k + "|" + x.a.id; genSeq[sk] = (genSeq[sk] || 0) + 1; renderOverlay(); } }
  else if (UI.quiz.show && /^[1-4]$/.test(ev.key)) { const q = UI.quiz, x = q.items[q.i]; if (!x) return; rate(q.k, x.a.id, +ev.key); quizNext(); }
});

/* ---------------- boot ---------------- */
let downloads = null;
window.__mp = { mx, __lv: (g, d, id) => { touch(); const x = engineState(g, d).list.find(y => y.a.id === id); return x ? taskOf(x.a, levelOf(x)) : null; }, S, schedule, engineState, fsrsReview, lessonInfo, UI, cal, sachsenYear, switchYear, createYear, ttFromLegacy, applyDoc, setClassMode, obLbs, sortPinnedRows, dpMove, checkPos, atomPlan, shownTask, genSeq, atomsOf, hasGen, unitBlocks, moveAtom, touch, addHaDays, addLn, lnDates, unitOrderOf, setLnDate, setCheckDate, removeLn, dropOnWeek, firstMathDay, strandDlgOpen, strandDlgApply, strandHrs, moveInStrand, hrsPreview, setLnDur, lnDurOf, addShortTest, kaDates, migrateKa, defaultClass, adoptTemplate, syncTemplate, commit, seqOwn, tplNewer, tplDiff, atomsNewer, templateExport, LP, TPL, genQHtml, genAHtml, typesetMath };
render.keepScroll = false;
/* MathJax lädt asynchron; sobald es bereit ist, die schon gezeichneten Formeln setzen */
window.__mpMathReady = () => { typesetMath(document.getElementById("main")); typesetMath(document.getElementById("overlay")); };
renderBanner(); render();
if (route() === "plan") { const c = document.getElementById("curweek"); if (c) c.scrollIntoView({ block: "center" }); }
initDb();
(async () => { try { downloads = window.claude && window.claude.use ? await window.claude.use("downloads") : null; } catch (e) { downloads = null; } const dl = document.getElementById("dlbtn"); if (dl && downloads) dl.hidden = false; })();
})();
