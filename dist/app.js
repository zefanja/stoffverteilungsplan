(function () {
"use strict";
const D = window.PLAN_DATA;
const CLASSES = Object.keys(D.classes);
const TYPES = D.schoolTypes || { gym: { label: "Gymnasium", short: "GYM", grades: [5, 6, 7, 8, 9, 10, 11, 12] } };
/* Mehrere Klassen je Stufe möglich: Oberschule ab Kl. 7 Haupt-/Realschulbildungsgang (HS/RS), Gymnasium 11/12 Grund-/Leistungskurs (GK/LK). */
const classesFor = (type, grade) => CLASSES.filter(k => D.classes[k].type === type && +D.classes[k].grade === +grade);
const classFor = (type, grade) => classesFor(type, grade)[0] || null;

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
  return { id: yearIdOf(c.start), start: c.start, end: c.end, holidays: c.holidays, free: c.free, engineStart: null, legacyDocs: true };
}
function defaultSettings() { return { years: [defaultYear()], retention: 0.9, perLesson: 5, autoBuffer: true }; }
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
  return { mode: c.mode, seq: c.seq.map(([code, strand, hours]) => ({ id: uid(), code, strand, hours })), atoms: {},
    groups: [newGroup("a", "", tt)] };
}
/* Parallelklassen (höchstens 2): Sequenz, Modus und Atome teilen sie sich; jede Gruppe hat eigenen Stundenplan,
   eigene Ausfälle, Häkchen, Lernstand und Abweichungen von der Sequenz (adj: Zeilen-ID -> zusätzliche Stunden). */
const GIDS = ["a", "b"];
function newGroup(id, name, tt) { return { id, name: name || "", tt: tt || [], off: [], cancelled: {}, done: {}, adj: {} }; }
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
const UI = { date: todayIso(), cls: CLASSES[0], type: D.classes[CLASSES[0]].type, year: null, todayAll: false, reveal: {}, editAtom: null, confirm: null, quiz: null, solOpen: false, engFilter: "intro", busy: false };
try {
  const v = localStorage.getItem("mp-cls"); if (v && CLASSES.includes(v)) UI.cls = v;
  const t = localStorage.getItem("mp-type"); UI.type = t && TYPES[t] ? t : D.classes[UI.cls].type;
  UI.todayAll = localStorage.getItem("mp-today") === "all"; } catch (e) {}
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

const unitOf = (k, code) => D.classes[ck(k)].units[code];
const lbOf = (k, code) => (unitOf(k, code) || {}).lb || "P";
const LV_FIELDS = ["q2", "a2", "q3", "a3"];
function atomsOf(k, code) {
  const base = (unitOf(k, code) || {}).atoms || [], own = S.cls[ck(k)].atoms[code];
  if (!own) return base;
  return own.map(a => { const t = base.find(b => b.id === a.id); if (!t || a.q2 !== undefined) return a; const x = Object.assign({}, a); LV_FIELDS.forEach(f => { x[f] = t[f]; }); return x; });
}
function atomMap(k) {
  k = ck(k);
  const key = "am" + k;
  if (cache[key] && cache[key].ver === ver) return cache[key].m;
  const m = {};
  for (const code of D.classes[k].unitOrder) for (const a of atomsOf(k, code)) m[a.id] = Object.assign({ code }, a);
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
  const rows = C.seq.map((r, i) => Object.assign({}, r, { base: r.hours, adj: (G.adj || {})[r.id] || 0, hours: Math.max(0, r.hours + ((G.adj || {})[r.id] || 0)), idx: i, track: seqMode ? "A" : (r.strand === "B" ? "B" : "A"), start: null, end: null, overflow: 0, slots: [] }));
  const tracks = { A: [], B: [] };
  rows.forEach(r => { for (let n = 1; n <= r.hours; n++) tracks[r.track].push({ row: r, n }); });
  const cap = { A: 0, B: 0, SOL: 0 }, planned = { A: tracks.A.length, B: tracks.B.length };
  for (const tr of ["A", "B"]) {
    const ts = slots.filter(s => s.track === tr && !s.cancelled); cap[tr] = ts.length;
    tracks[tr].forEach((L, i) => {
      const s = ts[i]; if (!s) { L.row.overflow++; return; }
      s.lesson = L; L.row.slots.push(s); if (!L.row.start) L.row.start = s.date; L.row.end = s.date;
    });
  }
  cap.SOL = slots.filter(s => s.track === "SOL" && !s.cancelled).length;
  let solN = 0; slots.forEach(s => { if (s.track === "SOL" && !s.cancelled) s.solIdx = solN++; });
  const intro = {};
  rows.forEach(r => {
    if (!unitOf(k, r.code)) return;
    atomsOf(k, r.code).forEach(a => { const n = Math.min(a.l, r.hours); const s = r.slots[n - 1]; if (s && !intro[a.id]) intro[a.id] = { date: s.date, code: r.code }; });
  });
  const byDate = {}; slots.forEach(s => { (byDate[s.date] || (byDate[s.date] = [])).push(s); });
  return (cache[g] = { ver, slots, rows, cap, planned, intro, byDate, dayInfo, seqMode });
}
function lessonInfo(k, L) {
  const r = L.row, u = unitOf(k, r.code), st = u ? u.stunden : [];
  let title;
  if (r.code === "P") title = "Puffer: Wiederholung, Nacharbeit oder Übung";
  else if (r.code === "JA") title = "Jahresabschluss: Rückblick und Knobelaufgaben";
  else if (!st.length) title = titleOf(k, r.code);
  else if (L.n <= st.length) title = (L.n === r.hours && r.hours < st.length) ? st.slice(L.n - 1).join(" · ") : st[L.n - 1];
  else title = "Übung und Vertiefung (zusätzliche Stunde)";
  const atoms = u ? atomsOf(k, r.code).filter(a => Math.min(a.l, r.hours) === L.n) : [];
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
  for (let l = lvl; l >= 2; l--) if (a["q" + l]) return { l, q: a["q" + l], a: a["a" + l] || "" };
  return { l: 1, q: a.q, a: a.a };
}
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
    delete o.calendar; delete o.engineStart;
    o.years = sortYears(o.years.filter(y => y && y.id).map(y => Object.assign({ holidays: [], free: [], engineStart: null }, y)));
    S.settings = o;
  } else if (CLASSES.includes(name)) {
    if (!Array.isArray(data.seq)) return;
    const c = Object.assign(defaultClass(name), data);
    if (isOldLehrplanSeq(name, data.seq)) c.seq = defaultClass(name).seq;
    if (!Array.isArray(data.tt) && !Array.isArray(data.groups)) c.tt = Array.isArray(data.timetable) ? ttFromLegacy(data.timetable, cal().start) : defaultClass(name).groups[0].tt;
    delete c.timetable;
    if (!Array.isArray(data.groups) || !data.groups.length) {
      const G = newGroup("a", "", c.tt); G.off = Array.isArray(c.off) ? c.off : []; G.cancelled = c.cancelled || {}; G.done = c.done || {};
      c.groups = [G];
    }
    ["tt", "off", "cancelled", "done"].forEach(f => { delete c[f]; });
    c.groups = c.groups.filter(G => G && GIDS.includes(G.id)).map(G => { const x = Object.assign(newGroup(G.id), G); sortTT(x.tt); return x; });
    if (!c.groups.length) c.groups = [newGroup("a", "", defaultClass(name).groups[0].tt)];
    S.cls[name] = c;
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
  if (g) save(ck(g));
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
function cancelSlot(g, key) {
  const sc = schedule(g), s = sc.slots.find(x => x.key === key); if (!s) return;
  const G = grp(g), wasCancelled = !!G.cancelled[key]; let note = "";
  withUndo(g, "", () => {
    if (wasCancelled) { delete G.cancelled[key]; }
    else {
      G.cancelled[key] = true;
      if (S.settings.autoBuffer && s.lesson) { const j = consumeBuffer(g, s.lesson.row.idx, s.track); note = j >= 0 ? " Ein Puffer wurde um 1 Std. gekürzt." : " Kein Puffer mehr frei: Reserve prüfen."; }
    }
  });
  toast(wasCancelled ? "Stunde findet wieder statt." : `Stunde als ausgefallen markiert, der Plan rückt nach.${note}`, true);
}
function toggleDone(g, key) {
  const G = grp(g); if (G.done[key]) delete G.done[key]; else G.done[key] = true;
  commit(g);
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
  holidays.sort((a, b) => a.frm < b.frm ? -1 : 1); free.sort((a, b) => a.date < b.date ? -1 : 1);
  return { start, end, holidays, free };
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
    Object.assign(Y, { start: r.start, end: r.end, holidays: r.holidays, free: r.free, source: r.source });
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
  const Y = r ? { id, start: r.start, end: r.end, holidays: r.holidays, free: r.free, source: r.source }
    : { id, start: `${y0}-08-15`, end: `${y0 + 1}-07-15`, holidays: [], free: [] };
  Y.engineStart = Y.start;
  if (Array.isArray(cal().classes)) Y.classes = cal().classes.slice();
  const prev = { cls: clone(S.cls) };
  S.settings.years.push(Y); sortYears(S.settings.years); save("settings");
  UI.busy = false;
  switchYear(id, true);
  CLASSES.forEach(k => {
    const P = prev.cls[k], C = S.cls[k];
    if (copySeq) { C.mode = P.mode; C.seq = P.seq.map(r => Object.assign({}, r, { id: uid() })); C.atoms = clone(P.atoms || {}); }
    /* Parallelklassen mit Namen übernehmen; Stundenplan je Gruppe aus ihrem letzten Zeitraum oder aus der Vorlage */
    C.groups = P.groups.map(PG => {
      const last = PG.tt && PG.tt.length ? sortTT(PG.tt.slice())[PG.tt.length - 1] : null;
      return newGroup(PG.id, PG.name, copyTT && last ? [{ id: uid(), frm: Y.start, lessons: cloneLessons(last.lessons) }] : clone(C.groups[0].tt).map(v => Object.assign(v, { id: uid() })));
    });
    save(k); GIDS.forEach(gid => save(engDoc(gkey(k, gid))));
  });
  touch(); render();
  toast(r ? `Schuljahr ${yearLabel(id)} angelegt, Ferien Sachsen übernommen.` : `Schuljahr ${yearLabel(id)} angelegt. Ferien konnten nicht geladen werden (${err}); bitte unter Einstellungen eintragen.`);
}

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
  el.textContent = m || ""; el.hidden = !m; el.dataset.kind = dbState;
}

/* ---------------- shared pieces ---------------- */
function chip(k, code, extra) {
  const lb = lbOf(k, code);
  return `<span class="chip" style="${sty(lb)}"><b>${esc(code)}</b>${extra ? `<span>${extra}</span>` : ""}</span>`;
}
function unitLink(k, code, label) {
  const i = D.classes[ck(k)].unitOrder.indexOf(code);
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
  return tr === "A" ? "Strang A · " + c.nameA : "Strang B · " + c.nameB;
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
  const hasKA = m => sc.slots.some(s => s.lesson && monday(s.date) === m && /KA/.test(s.lesson.row.code));
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
      <input type="date" id="pickdate" value="${d}" aria-label="Datum wählen">
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
  const code = currentUnit(g, d) || (nx ? nx.lesson.row.code : null), idx = code ? D.classes[k].unitOrder.indexOf(code) : -1;
  const withR = es.list.filter(x => x.R !== null && x.R !== undefined);
  const meanR = withR.length ? Math.round(withR.reduce((a, x) => a + x.R, 0) / withR.length * 100) : null;
  const res = (sc.seqMode ? ["A"] : ["A", "B"]).map(t => sc.cap[t] - sc.planned[t]);
  const r = res.some(x => x < 0) ? Math.min(...res) : res.reduce((a, x) => a + x, 0);
  return `<div class="tiles">
    ${code && idx >= 0 ? `<a class="tile t1" href="#u-${k}-${idx}" title="${esc(titleOf(k, code))}"><b>${esc(code)}</b><span>${esc(titleOf(k, code))}</span></a>` : `<div class="tile t1"><b>—</b><span>aktuelle Einheit</span></div>`}
    <a class="tile t2" href="#lernuebersicht"><b>${es.dueCount}</b><span>heute fällig${es.backCount ? ` · ${es.backCount} Altbestand` : ""}</span></a>
    <a class="tile t3" href="#lernuebersicht"><b>${meanR === null ? "—" : meanR + " %"}</b><span>ø Abruf</span></a>
    <a class="tile t4 ${r < 0 ? "neg" : ""}" href="#sequenz"><b>${r > 0 ? "+" : ""}${r}</b><span>${r < 0 ? "Std. fehlen im Schuljahr" : "Std. Reserve im Schuljahr"}</span></a>
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
  body += slots.map(s => slotBlock(k, s)).join("");
  if (!slots.some(s => s.lesson)) {
    const nx = sc.slots.find(s => s.date > d && s.lesson);
    if (nx) { const li = lessonInfo(k, nx.lesson); body += `<div class="next"><span class="lbl">Nächste Stunde · ${esc(fmt(nx.date, { weekday: "short", day: "2-digit", month: "2-digit" }))}, ${nx.period}. Std.</span>${unitLink(k, nx.lesson.row.code)}<div class="small">${mx(li.title)}</div></div>`; }
  }
  const es = engineState(k, d);
  const rv = es.pick.map(x => reviewItem(k, x)).join("");
  const res = ["A", "B"].filter(t => !(sc.seqMode && t === "B")).map(t => sc.cap[t] - sc.planned[t]);
  const warn = res.some(r => r < 0) ? `<a class="warn" href="#sequenz" data-act="cls" data-k="${ck(k)}">Der Plan ist voller als das Schuljahr: ${-Math.min(...res)} Std. fehlen. Zur Sequenz →</a>` : "";
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
function slotBlock(k, s) {
  const tag = `<span class="per mono">${s.period}. Std.</span>`;
  if (s.track === "SOL") {
    const f = s.cancelled ? null : solFormat(k, s), cu = currentUnit(k, s.date);
    return `<div class="slot sol ${s.cancelled ? "x" : ""}">${tag}<div class="sbody"><div class="stitle">FIL-Stunde${f ? ` · Format ${f}: ${esc(SOL_FORMATS[f][0])}` : " fällt aus"}</div>
      ${f ? `<div class="small">${esc(SOL_FORMATS[f][1])}${f === 2 && cu ? ` Aktuelle Einheit: ${esc(cu)} ${esc(titleOf(k, cu))}.` : ""}</div>` : ""}
      <div class="acts"><button type="button" class="btn ghost sm" data-act="solinfo">Alle Formate</button><button type="button" class="btn ghost sm" data-act="cancel" data-k="${k}" data-key="${s.key}">${s.cancelled ? "Findet doch statt" : "Fällt aus"}</button></div></div></div>`;
  }
  if (s.cancelled) return `<div class="slot x">${tag}<div class="sbody"><div class="stitle">Ausgefallen</div><div class="acts"><button type="button" class="btn ghost sm" data-act="cancel" data-k="${k}" data-key="${s.key}">Findet doch statt</button></div></div></div>`;
  if (!s.lesson) return `<div class="slot">${tag}<div class="sbody"><div class="stitle">Frei: In der Sequenz ist nichts mehr geplant.</div></div></div>`;
  const L = s.lesson, li = lessonInfo(k, L), done = !!grp(k).done[s.key];
  const sc = schedule(k);
  return `<div class="slot ${done ? "done" : ""}" style="${sty(lbOf(k, L.row.code))}">${tag}<div class="sbody">
    ${unitLink(k, L.row.code)}
    <div class="stitle">Stunde ${L.n} von ${L.row.hours}: ${mx(li.title)}</div>
    ${!sc.seqMode ? `<div class="small muted">${esc(trackName(k, s.track))}</div>` : ""}
    ${li.atoms.length ? `<div class="newatoms"><div class="lbl">Neu in dieser Stunde</div><ul>${li.atoms.map(a => `<li>${mx(a.t)}<span class="q">Check: ${mx(a.q)} <i>→ ${mx(a.a)}</i></span></li>`).join("")}</ul></div>` : ""}
    <div class="acts">
      <button type="button" class="btn ${done ? "ok" : ""} sm" data-act="done" data-k="${k}" data-key="${s.key}" aria-pressed="${done}">${done ? "✓ Gehalten" : "Als gehalten markieren"}</button>
      ${L.row.code !== "P" && L.row.code !== "JA" ? `<button type="button" class="btn ghost sm" data-act="addhour" data-k="${k}" data-row="${L.row.idx}">Einheit braucht 1 Std. mehr</button>` : ""}
      <button type="button" class="btn ghost sm" data-act="cancel" data-k="${k}" data-key="${s.key}">Fällt aus</button>
    </div></div></div>`;
}
function reviewItem(k, x) {
  const id = x.a.id, open = UI.reveal[k + id], task = taskOf(x.a, levelOf(x));
  const state = x.isNew ? `<span class="pill new">erste Wiederholung</span>` : x.backlog ? `<span class="pill">Altbestand · ${esc(fmt(x.intro))}</span>` : `<span class="pill">${Math.round(x.R * 100)} % Abruf</span>`;
  return `<div class="ritem" style="${sty(lbOf(k, x.code))}">
    <div class="rtop"><span class="chip"><b>${esc(x.code)}</b></span>${levelPill(task.l)}${state}</div>
    <div class="rq">${mx(task.q)}</div>
    ${open ? `<div class="ra">${mx(task.a)}</div><div class="rt small muted">${mx(x.a.t)}</div>${rateButtons(k, id)}` : `<button type="button" class="btn ghost sm" data-act="reveal" data-id="${esc(k + id)}">Lösung zeigen</button>`}
  </div>`;
}
const RATES = [[1, "Nochmal", "unter 50 % richtig"], [2, "Schwer", "50–70 %"], [3, "Gut", "70–90 %"], [4, "Leicht", "über 90 %"]];
function rateButtons(k, id) {
  return `<div class="rates">${RATES.map(([g, l, h]) => `<button type="button" class="rate r${g}" data-act="rate" data-k="${k}" data-id="${esc(id)}" data-g="${g}"><b>${l}</b><span>${h}</span></button>`).join("")}</div>`;
}

/* ---------------- views: Jahresplan ---------------- */
function viewPlan() {
  const k = curG(), sc = schedule(k), Y = cal(), today = todayIso();
  const trs = sc.seqMode ? ["A"] : ["A", "B"]; const sol = sc.slots.some(s => s.track === "SOL");
  let rows = "";
  if (Y.start && Y.end) for (let m = monday(Y.start); m <= Y.end; m = addDays(m, 7)) {
    const notes = new Set(); let school = 0;
    for (let i = 0; i < 5; i++) { const di = sc.dayInfo[addDays(m, i)]; if (!di) continue; if (di.school) school++; else notes.add(di.note); }
    (grp(k).tt || []).forEach(v => { if (v.frm && v.frm > Y.start && monday(v.frm) === m) notes.add("neuer Stundenplan ab " + fmt(v.frm)); });
    const ws = sc.slots.filter(s => monday(s.date) === m);
    const cells = trs.map(tr => {
      const ls = ws.filter(s => s.track === tr);
      const groups = []; ls.forEach(s => {
        if (s.cancelled) { const g = groups.find(g => g.code === "×"); if (g) g.n++; else groups.push({ code: "×", n: 1 }); return; }
        if (!s.lesson) return; const code = s.lesson.row.code; const g = groups.find(g => g.code === code);
        if (g) { g.n++; if (grp(k).done[s.key]) g.done++; } else groups.push({ code, n: 1, done: grp(k).done[s.key] ? 1 : 0 });
      });
      return `<td>${groups.map(g => g.code === "×" ? `<span class="xchip">${g.n}× ausgefallen</span>` : `${unitLink(k, g.code)}<span class="hrs mono">${g.n} Std.${g.done ? ` · ${g.done}✓` : ""}</span>`).join("<br>")}</td>`;
    }).join("");
    const solCell = sol ? `<td class="small">${ws.filter(s => s.track === "SOL").map(s => s.cancelled ? "ausgefallen" : `F${solFormat(k, s)} ${esc(SOL_FORMATS[solFormat(k, s)][0])}`).join("<br>")}</td>` : "";
    const cur = m === monday(today);
    rows += `<tr class="${school === 0 ? "hol" : ""} ${cur ? "cur" : ""}" ${cur ? 'id="curweek"' : ""}><td class="mono">${isoWeek(m)}</td><td class="mono nowrap">${fmt(m)}–${fmt(addDays(m, 4))}</td><td class="note">${esc([...notes].join(", "))}</td>${school === 0 ? `<td colspan="${trs.length + (sol ? 1 : 0)}"></td>` : cells + solCell}</tr>`;
  }
  return `<section><div class="vhead"><h1>Jahresplan</h1>${clsTabs()}</div>
    ${capCards(k)}
    <div class="tscroll"><table class="plan"><thead><tr><th>KW</th><th>Woche</th><th>Hinweis</th>${trs.map(t => `<th>${esc(trackName(k, t))}</th>`).join("")}${sol ? "<th>FIL</th>" : ""}</tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

/* ---------------- views: Sequenz ---------------- */
function viewSeq() {
  const k = curG(), C = S.cls[ck(k)], sc = schedule(k), c = D.classes[ck(k)], multi = C.groups.length > 1;
  const used = new Set(C.seq.map(r => r.code));
  const avail = c.unitOrder.filter(code => !used.has(code) || code === "P" || code === "JA");
  const lbh = lbHours(k);
  const rows = sc.rows.map((r, i) => {
    const when = r.overflow ? `<span class="neg">${r.slots.length ? fmt(r.start) + " – " : ""}${r.overflow} Std. nach Schuljahresende</span>` : r.start ? `${fmt(r.start)} – ${fmt(r.end)}` : r.hours === 0 ? "—" : "";
    return `<tr style="${sty(lbOf(k, r.code))}">
      <td class="mono muted">${i + 1}</td>
      <td><span class="chip"><b>${esc(r.code)}</b></span></td>
      <td class="ttl">${unitOf(k, r.code) && !["P", "JA"].includes(r.code) ? `<a href="#u-${ck(k)}-${c.unitOrder.indexOf(r.code)}">${esc(titleOf(k, r.code))}</a>` : esc(titleOf(k, r.code))}</td>
      <td><select data-act="strand" data-i="${i}" aria-label="Strang" ${sc.seqMode ? "disabled" : ""}><option ${r.strand !== "B" ? "selected" : ""}>A</option><option ${r.strand === "B" ? "selected" : ""}>B</option></select></td>
      <td class="nowrap"><button type="button" class="mini" data-act="hrs" data-i="${i}" data-n="-1" aria-label="Eine Stunde weniger">−</button><input class="num mono" type="number" min="0" max="60" value="${r.base}" data-act="hrsset" data-i="${i}" aria-label="Stunden"><button type="button" class="mini" data-act="hrs" data-i="${i}" data-n="1" aria-label="Eine Stunde mehr">+</button>
        ${r.adj ? `<span class="soll small adj" title="Abweichung nur für ${esc(groupName(k))}">${esc(groupName(k))}: ${r.adj > 0 ? "+" : ""}${r.adj}</span>` : ""}${unitOf(k, r.code) && unitOf(k, r.code).stunden.length && r.base !== unitOf(k, r.code).stunden.length ? `<span class="soll small muted">Soll ${unitOf(k, r.code).stunden.length}</span>` : ""}</td>
      <td class="mono small nowrap">${when}</td>
      <td class="nowrap"><div class="rowacts"><button type="button" class="mini" data-act="mv" data-i="${i}" data-n="-1" aria-label="Nach oben" ${i === 0 ? "disabled" : ""}>↑</button><button type="button" class="mini" data-act="mv" data-i="${i}" data-n="1" aria-label="Nach unten" ${i === sc.rows.length - 1 ? "disabled" : ""}>↓</button><button type="button" class="mini" data-act="addp" data-i="${i}" title="Puffer darunter einfügen">+P</button><button type="button" class="mini del" data-act="del" data-i="${i}" aria-label="Zeile löschen">×</button></div></td>
    </tr>`;
  }).join("");
  const lbRows = Object.entries(c.lbnames).filter(([lb]) => lbh[lb] || c.zrw[lb]).map(([lb, n]) => {
    const z = c.zrw[lb], h = lbh[lb] || 0;
    return `<div class="lbrow" style="${sty(lb)}"><span class="chip"><b>${esc(lb.startsWith("LB") ? "LB " + lb.slice(2) : lb === "WB" ? "WB" : lb === "test" ? "KA" : lb === "start" ? "Start" : "P")}</b></span><span class="n">${esc(n)}</span><span class="mono">${h} Std.${z ? ` <span class="muted">/ ${z}</span>` : ""}</span></div>`;
  }).join("");
  const confirm = UI.confirm === "reset-" + k;
  return `<section><div class="vhead"><h1>Sequenz</h1>${clsTabs()}</div>
    <div class="seqtop">
      <div class="modebox"><div class="lbl">Modus</div><div class="seg small">${[["Stränge", "In Strängen"], ["nacheinander", "Nacheinander"]].map(([v, l]) => `<button type="button" aria-selected="${C.mode === v}" data-act="mode" data-v="${v}">${l}</button>`).join("")}</div>
      ${multi ? `<p class="small">Die Sequenz gilt für alle Parallelklassen. Zeiträume und Kapazität unten gelten für <b>${esc(groupName(k))}</b>; „Einheit braucht 1 Std. mehr“ und Ausfälle wirken nur dort und erscheinen als Abweichung neben den Stunden.</p>` : ""}
      <p class="small muted">${sc.seqMode ? "Alle Stunden laufen in einem Strang, genau in der Reihenfolge unten." : "Jede Zeile läuft in ihrem Strang; innerhalb eines Strangs gilt die Reihenfolge unten."}</p></div>
      ${capCards(k)}
    </div>
    <div class="tscroll"><table class="seq"><thead><tr><th>#</th><th>Kürzel</th><th>Einheit</th><th>Strang</th><th>Stunden</th><th>Zeitraum</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="addrow card">
      <label>Zeile hinzufügen <select id="addcode">${avail.map(code => `<option value="${esc(code)}">${esc(code)} · ${esc(titleOf(k, code))}</option>`).join("")}</select></label>
      <label>Strang <select id="addstrand" ${sc.seqMode ? "disabled" : ""}><option>A</option><option>B</option></select></label>
      <label>Stunden <input id="addhrs" class="num" type="number" min="0" value="1"></label>
      <button type="button" class="btn" data-act="addrow">Am Ende anfügen</button>
    </div>
    <div class="grid2">
      <div class="card"><h3>Stunden je Lernbereich</h3><p class="small muted">geplant / Zeitrichtwert des Lehrplans</p>${lbRows}</div>
      <div class="card"><h3>Hinterherhängen?</h3><p class="small">Auf der Heute-Seite gibt es dafür zwei Knöpfe. „Einheit braucht 1 Std. mehr“ verlängert die laufende Einheit, „Fällt aus“ streicht eine Stunde. ${S.settings.autoBuffer ? "In beiden Fällen kürzt die App automatisch den nächsten Puffer im selben Strang, damit das Schuljahr aufgeht." : "Puffer werden nicht automatisch gekürzt (Einstellungen)."} Hier kannst du Puffer (P) auch von Hand verschieben oder kürzen.</p>
      ${confirm ? `<div class="confirm"><span>Sequenz von ${esc(c.label)} auf die Vorlage zurücksetzen? Deine Änderungen an Reihenfolge und Stunden gehen verloren.</span><button type="button" class="btn danger" data-act="reset" data-k="${ck(k)}">Zurücksetzen</button><button type="button" class="btn ghost" data-act="confirm" data-v="">Abbrechen</button></div>` : `<button type="button" class="btn ghost" data-act="confirm" data-v="reset-${k}">Auf Vorlage zurücksetzen</button>`}</div>
    </div></section>`;
}

/* ---------------- views: Einheiten ---------------- */
function viewUnits() {
  const k = curG(), c = D.classes[ck(k)], sc = schedule(k);
  const rowOf = {}; sc.rows.forEach(r => { if (!rowOf[r.code]) rowOf[r.code] = r; });
  const groups = {};
  c.unitOrder.filter(code => code !== "P" && code !== "JA").forEach(code => { const lb = lbOf(k, code); (groups[lb] || (groups[lb] = [])).push(code); });
  const order = ["start", "LB1", "LB2", "LB3", "LB4", "LB5", "LB6", "LB7", "LB8", "LB9", "WB", "test"];
  return `<section><div class="vhead"><h1>Einheiten</h1>${clsTabs()}</div>
    ${c.ziele && c.ziele.length ? `<details class="card ziele"><summary><b>Ziele der Klassenstufe</b> <span class="small muted">Lehrplan Sachsen${c.variantLabel ? " · " + esc(c.variantLabel) : ""}</span></summary>${c.ziele.map(([h, t]) => `<p><b>${esc(h)}</b><br>${mx(t)}</p>`).join("")}</details>` : ""}
    ${order.filter(lb => groups[lb]).map(lb => `<h2 class="lbh" style="${sty(lb)}">${esc(c.lbnames[lb] || lb)}</h2>
    <div class="ugrid">${groups[lb].map(code => {
      const u = unitOf(k, code), r = rowOf[code], i = c.unitOrder.indexOf(code);
      return `<a class="ucard" href="#u-${ck(k)}-${i}" style="${sty(lb)}"><span class="chip"><b>${esc(code)}</b></span><span class="ut">${esc(u.title)}</span>
        <span class="um small muted mono">${r ? `${r.hours} Std.${r.start ? " · " + fmt(r.start) + "–" + fmt(r.end) : ""}` : "nicht in der Sequenz"} · ${atomsOf(k, code).length} Atome</span></a>`;
    }).join("")}</div>`).join("")}</section>`;
}
function viewUnit(kc, idx) {
  const k = curG() && ck(curG()) === kc ? curG() : gkey(kc, S.cls[kc].groups[0].id);
  const c = D.classes[ck(k)], code = c.unitOrder[idx], u = unitOf(k, code);
  if (!u) return `<p>Einheit nicht gefunden.</p>`;
  const sc = schedule(k), r = sc.rows.find(x => x.code === code), E = S.eng[k];
  const atoms = atomsOf(k, code), nL = Math.max(u.stunden.length, r ? r.hours : 0, ...atoms.map(a => a.l), 1);
  const list = (t, a) => a && a.length ? `<div class="box"><h3>${t}</h3><ul>${a.map(x => `<li>${mx(x)}</li>`).join("")}</ul></div>` : "";
  let lessons = "";
  for (let n = 1; n <= nL; n++) {
    const slot = r && r.slots[n - 1];
    const title = u.stunden[n - 1] || (r && n <= r.hours ? "Übung und Vertiefung" : "(über die geplanten Stunden hinaus)");
    const la = atoms.filter(a => a.l === n);
    lessons += `<div class="lesson"><div class="lhead"><span class="mono muted">Stunde ${n}</span><span class="ltitle">${mx(title)}</span><span class="mono small muted">${slot ? fmt(slot.date, { weekday: "short", day: "2-digit", month: "2-digit" }) + (grp(k).done[slot.key] ? " ✓" : "") : r && n > r.hours ? "nicht eingeplant" : ""}</span></div>
      <ul class="alist">${la.map(a => atomRow(k, code, a, E.cards[a.id])).join("")}</ul>
      ${UI.editAtom && UI.editAtom.code === code && UI.editAtom.id === "new" && UI.editAtom.l === n ? atomForm(k, code, { l: n, t: "", q: "", a: "" }, "new") : `<button type="button" class="linkbtn small" data-act="atomnew" data-code="${esc(code)}" data-l="${n}">+ Atom</button>`}
    </div>`;
  }
  return `<section class="unitv" style="${sty(u.lb)}">
    <div class="ubar"><a class="btn ghost" href="#einheiten">← Einheiten</a>${idx > 0 ? `<a class="btn ghost" href="#u-${ck(k)}-${idx - 1}">‹ ${esc(c.unitOrder[idx - 1])}</a>` : ""}${idx < c.unitOrder.length - 1 ? `<a class="btn ghost" href="#u-${ck(k)}-${idx + 1}">${esc(c.unitOrder[idx + 1])} ›</a>` : ""}</div>
    <header class="uhead"><div><span class="code mono">${esc(code)} · ${esc(c.label)}</span><h1>${esc(u.title)}</h1><div class="small">${esc(c.lbnames[u.lb] || "")}</div></div>
      <div class="umeta mono">${r ? `${r.hours} Std. geplant${u.stunden.length ? ` (Soll ${u.stunden.length})` : ""}<br>${r.start ? fmt(r.start) + " – " + fmt(r.end) : ""}${r.overflow ? `<br><span class="neg">${r.overflow} Std. nach Schuljahresende</span>` : ""}` : "nicht in der Sequenz"}</div></header>
    <div class="grid2">
      <div>${list("Inhalte · Die Schüler können …", u.inhalte)}${list("Vertiefung", u.tiefe)}${list("Vorwissen · Retrieval", u.vorwissen)}</div>
      <div>${u.begriffe && u.begriffe.length ? `<div class="box"><h3>Fachbegriffe</h3><div class="tags">${u.begriffe.map(b => `<span>${esc(b)}</span>`).join("")}</div></div>` : ""}${list("Hinweise · Bezüge", u.hinweise)}${list("Material", u.material)}</div>
    </div>
    <h2>Stunden und Atome</h2>
    <p class="small muted">Atome werden in der Stunde eingeführt, der sie zugeordnet sind. Ab der folgenden Stunde wird es wiederholt (Lernübersicht). ${S.cls[ck(k)].atoms[code] ? `<button type="button" class="linkbtn" data-act="atomreset" data-code="${esc(code)}">Atome dieser Einheit auf die Vorlage zurücksetzen</button>` : ""}</p>
    <div class="lessons-list">${lessons}</div></section>`;
}
function atomRow(k, code, a, card) {
  if (UI.editAtom && UI.editAtom.id === a.id) return `<li>${atomForm(k, code, a, a.id)}</li>`;
  const st = card ? `<span class="pill">${Math.round(Rof(Math.max(0, diffDays(card.last, UI.date)), card.s) * 100)} % · ab ${fmt(card.due)}</span>` : "";
  return `<li class="atom"><div><b>${mx(a.t)}</b> ${st}<div class="small muted">Check: ${mx(a.q)} → ${mx(a.a)}</div>${a.q2 ? `<div class="small muted">Stufe 2: ${mx(a.q2)} → ${mx(a.a2)}</div>` : ""}${a.q3 ? `<div class="small muted">Stufe 3: ${mx(a.q3)} → ${mx(a.a3)}</div>` : ""}</div>
    <span class="nowrap"><button type="button" class="mini" data-act="atomedit" data-code="${esc(code)}" data-id="${esc(a.id)}" aria-label="Atom bearbeiten">✎</button><button type="button" class="mini del" data-act="atomdel" data-code="${esc(code)}" data-id="${esc(a.id)}" aria-label="Atom löschen">×</button></span></li>`;
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
  const unitsSorted = Object.keys(byUnit).sort((a, b) => D.classes[ck(k)].unitOrder.indexOf(a) - D.classes[ck(k)].unitOrder.indexOf(b));
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
      ${myClassesCard()}
      ${k ? ttCard(k) : `<div class="card"><h3>Stundenplan</h3><p class="small muted">${noClassMsg()}</p></div>`}
    </div>
    <div class="card"><h3>Sicherung</h3>
      <p class="small">Deine Daten werden automatisch gespeichert. Eine Sicherung enthält die Einstellungen aller Schuljahre und die Klassen und den Lernstand des angezeigten Schuljahres (${esc(yearLabel(Y.id))}).</p>
      <div class="acts"><button type="button" class="btn" data-act="export">Sicherung kopieren</button><button type="button" class="btn ghost" data-act="download" id="dlbtn" hidden>Als Datei speichern</button><button type="button" class="btn ghost" data-act="engreset">Lernstand ${esc(yearLabel(Y.id))} leeren</button></div>
      <textarea id="importbox" rows="3" placeholder="Sicherung hier einfügen …" aria-label="Sicherung einfügen"></textarea>
      <div class="acts"><button type="button" class="btn ghost" data-act="import">Sicherung einspielen</button>
      ${confirm ? `<span class="confirm"><span>Sequenzen, Stundenpläne und Lernstand von ${esc(yearLabel(Y.id))} auf die Vorlage zurücksetzen?</span><button type="button" class="btn danger" data-act="resetall">Zurücksetzen</button><button type="button" class="btn ghost" data-act="confirm" data-v="">Abbrechen</button></span>` : `<button type="button" class="btn ghost" data-act="confirm" data-v="resetall">Schuljahr zurücksetzen</button>`}</div></div>
  </section>`;
}

/* ---------------- Einrichtungsassistent ----------------
   Schritte: 0 Willkommen/Schuljahr · 1 Meine Klassen · 2 Unterrichtszeiten · 3 Fertig.
   Startet von selbst, solange im Schuljahr keine Klassen festgelegt sind und der Assistent nicht beendet wurde. */
const OB_STEPS = ["Schuljahr", "Klassen", "Unterrichtszeiten", "Fertig"];
const OB_PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];
function obVersion(g) {
  const vs = sortTT(grp(g).tt);
  return vs.filter(v => v.frm <= UI.date).pop() || vs[0];
}
function obTracks(k) { const c = D.classes[k]; return ["A"].concat(c.mode === "Stränge" || (S.cls[k] && S.cls[k].mode === "Stränge") ? ["B"] : [], c.sol ? ["SOL"] : []); }
function obGrid(g) {
  const k = ck(g), v = obVersion(g);
  if (!v) return "";
  const at = (d, p) => v.lessons.find(l => +l.day === d && +l.period <= p && p < +l.period + lessonLen(l));
  const n = weekHours(v.lessons), multi = obTracks(k).length > 1;
  return `<div class="obgrid card"><div class="obh"><b>${esc(fullLabel(g))}</b><span class="small muted">${n} Stunde${n === 1 ? "" : "n"} pro Woche${sortTT(grp(g).tt.slice()).length > 1 ? ` · gilt ab ${esc(fmt(v.frm, { day: "2-digit", month: "2-digit", year: "numeric" }))}` : ""}</span></div>
    <table><thead><tr><th></th>${[1, 2, 3, 4, 5].map(d => `<th>${DAYS[d]}</th>`).join("")}</tr></thead><tbody>
    ${OB_PERIODS.map(p => `<tr><th class="mono">${p}.</th>${[1, 2, 3, 4, 5].map(d => { const l = at(d, p);
      return `<td><button type="button" class="obcell ${l ? "on" : ""}" data-act="obcell" data-g="${g}" data-d="${d}" data-p="${p}" aria-pressed="${!!l}" aria-label="${DAYS[d]}, ${p}. Stunde">${l ? (multi ? esc(l.track === "SOL" ? "FIL" : l.track) : "✓") : ""}</button></td>`; }).join("")}</tr>`).join("")}
    </tbody></table>${multi ? `<p class="small muted">Mehrfach klicken wechselt die Spur (${obTracks(k).map(t => t === "SOL" ? "FIL" : t).join(" → ")} → frei).</p>` : ""}</div>`;
}
function obToggle(g, d, p) {
  const v = obVersion(g), k = ck(g); if (!v) return;
  const dbl = v.lessons.find(l => +l.day === d && lessonLen(l) === 2 && +l.period <= p && p <= +l.period + 1);
  if (dbl) { const ls = [0, 1].map(n => Object.assign({}, dbl, { id: uid(), period: +dbl.period + n })); ls.forEach(l => delete l.len); v.lessons.splice(v.lessons.indexOf(dbl), 1, ...ls); }
  const i = v.lessons.findIndex(l => +l.day === d && +l.period === p), tracks = obTracks(k);
  if (i < 0) v.lessons.push({ id: uid(), day: d, period: p, track: "A" });
  else { const n = tracks.indexOf(v.lessons[i].track) + 1; if (n > 0 && n < tracks.length) v.lessons[i].track = tracks[n]; else v.lessons.splice(i, 1); }
  v.lessons.sort((a, b) => a.day - b.day || a.period - b.period);
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
  const st = UI.ob.step, Y = cal(), mine = mineList();
  const dots = `<ol class="obsteps">${OB_STEPS.map((s, i) => `<li class="${i === st ? "cur" : i < st ? "done" : ""}">${esc(s)}</li>`).join("")}</ol>`;
  let body = "";
  if (st === 0) body = `<h2>Willkommen im Matheplaner</h2>
    <p>In drei kurzen Schritten richtest du das Schuljahr ein: welche Klassen du unterrichtest und wann. Danach zeigt die Heute-Seite deine Stunden, und die App plant Stoff und Wiederholungen.</p>
    <div class="card"><b>Schuljahr ${esc(yearLabel(Y.id))}</b><span class="small muted">${esc(fmt(Y.start, { day: "2-digit", month: "2-digit", year: "numeric" }))} – ${esc(fmt(Y.end, { day: "2-digit", month: "2-digit", year: "numeric" }))} · ${Y.holidays.length} Ferienabschnitte · ${Y.free.length} freie Tage</span>
    ${Y.holidays.length ? `<span class="small muted">Ferien und Feiertage für Sachsen sind eingetragen.</span>` : `<button type="button" class="btn ghost sm" data-act="ferien">Ferien Sachsen importieren</button>`}</div>`;
  else if (st === 1) body = `<h2>Welche Klassen unterrichtest du?</h2>
    <p class="small">Hake deine Klassen an. Gibt es zwei Parallelklassen (z. B. 8a und 8b), wähle „2 Parallelklassen“: Du planst dann einmal, jede Klasse hat aber eigene Stunden und eigenen Lernstand. In der Oberschule gibt es ab Klasse 7 Haupt- (HS) und Realschulbildungsgang (RS), im Gymnasium in 11/12 Grund- (GK) und Leistungskurs (LK).</p>
    ${Object.entries(TYPES).map(([t, T]) => `<h3 class="obtype">${esc(T.label)}</h3><table class="form obclasses"><tbody>${T.grades.flatMap(g => classesFor(t, g)).map(k => myClassRow(k, mine)).join("")}</tbody></table>`).join("")}`;
  else if (st === 2) body = `<h2>Wann hast du Unterricht?</h2>
    <p class="small">Klicke für jede Klasse die Stunden im Wochenplan an. Ändert sich der Stundenplan im Laufe des Jahres oder fällt Unterricht über längere Zeit aus (Praktikum, Klassenfahrt), lege das später unter Einstellungen → Stundenplan an.</p>
    ${myGroups().length ? `<div class="obgrids">${mine.flatMap(groupsOf).map(obGrid).join("")}</div>` : `<p class="muted">Du hast noch keine Klasse gewählt. <button type="button" class="linkbtn" data-act="obstep" data-v="1">Zurück zu den Klassen</button></p>`}`;
  else body = `<h2>Fertig</h2>
    <p>Dein Schuljahr ${esc(yearLabel(Y.id))} ist eingerichtet:</p>
    <ul>${mine.flatMap(groupsOf).map(g => `<li>${esc(fullLabel(g))}: ${obVersion(g) ? weekHours(obVersion(g).lessons) : 0} Stunden pro Woche</li>`).join("") || "<li>keine Klasse gewählt</li>"}</ul>
    <p class="small muted">Die Sequenz jeder Klasse folgt dem Lehrplan; Reihenfolge und Stunden passt du unter „Sequenz“ an. Alle Angaben lassen sich unter „Einstellungen“ ändern, den Assistenten startest du dort erneut.</p>`;
  return `<div class="ov-card onboard" role="dialog" aria-label="Einrichtung">
    <header><span class="lbl">Einrichtung · Schritt ${st + 1} von ${OB_STEPS.length}</span><button type="button" class="iconbtn" data-act="obskip" aria-label="Assistent schließen">×</button></header>
    ${dots}<div class="obbody">${body}</div>
    <footer class="acts">${st > 0 ? `<button type="button" class="btn ghost" data-act="obstep" data-v="${st - 1}">Zurück</button>` : `<button type="button" class="btn ghost" data-act="obskip">Später</button>`}
      <span class="sp"></span>${st < OB_STEPS.length - 1 ? `<button type="button" class="btn" data-act="obstep" data-v="${st + 1}" ${st === 1 && !mine.length ? "disabled" : ""}>Weiter</button>` : `<button type="button" class="btn" data-act="obdone">Los geht's</button>`}</footer></div>`;
}

/* ---------------- quiz & SOL overlay ---------------- */
function renderOverlay() {
  const el = document.getElementById("overlay");
  if (UI.ob) { el.hidden = false; el.innerHTML = viewOnboarding(); return; }
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
  el.innerHTML = `<div class="ov-card quiz" role="dialog" aria-label="Wiederholung" style="${sty(lbOf(q.k, x.code))}">
    <header><span class="chip"><b>${esc(x.code)}</b></span>${levelPill(taskOf(x.a, levelOf(x)).l)}<span class="mono muted">${q.i + 1} / ${q.items.length}</span><button type="button" class="iconbtn" data-act="ovclose" aria-label="Schließen">×</button></header>
    <div class="qq">${mx(taskOf(x.a, levelOf(x)).q)}</div>
    ${q.show ? `<div class="qa">${mx(taskOf(x.a, levelOf(x)).a)}</div><div class="small muted center">${mx(x.a.t)}</div>${rateButtons(q.k, x.a.id).replace(/data-act="rate"/g, 'data-act="qrate"')}` : `<button type="button" class="btn big" data-act="qshow">Lösung zeigen <span class="muted small">(Leertaste)</span></button>`}
  </div>`;
  typesetMath(el);
}

/* ---------------- router & render ---------------- */
const NAV = [["heute", "Heute"], ["plan", "Jahresplan"], ["sequenz", "Sequenz"], ["einheiten", "Einheiten"], ["lernuebersicht", "Lernübersicht"], ["einstellungen", "Einstellungen"]];
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
  const r = route(); let html;
  const m = /^u-(.+)-(\d+)$/.exec(r), mk = m && D.classes[m[1]] ? m[1] : null;
  const VIEWS = { heute: viewToday, plan: viewPlan, sequenz: viewSeq, einheiten: viewUnits, lernuebersicht: viewEngine, einstellungen: viewSettings };
  const TITLES = { plan: "Jahresplan", sequenz: "Sequenz", einheiten: "Einheiten", lernuebersicht: "Lernübersicht" };
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
  if (render.keepScroll) window.scrollTo(0, sy);
  render.keepScroll = true;
  renderOverlay();
  const dl = document.getElementById("dlbtn"); if (dl && downloads) dl.hidden = false;
}
let lastRoute = null;
window.addEventListener("hashchange", () => {
  UI.editAtom = null; UI.confirm = null; render.keepScroll = false; render();
  if (route() === "plan") { const c = document.getElementById("curweek"); if (c) c.scrollIntoView({ block: "center" }); }
});

/* ---------------- events ---------------- */
function addGroup(k) {
  const C = S.cls[k]; if (C.groups.length >= GIDS.length) return;
  const id = GIDS.find(x => !C.groups.some(G => G.id === x)), base = C.groups[0];
  const snap = snapshotFor(k);
  C.groups.push(newGroup(id, "", base.tt.map(v => ({ id: uid(), frm: v.frm, lessons: cloneLessons(v.lessons) }))));
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
    case "qrate": { const q = UI.quiz, x = q.items[q.i]; rate(q.k, x.a.id, +b.dataset.g); quizNext(); break; }
    case "solinfo": UI.solOpen = true; renderOverlay(); break;
    case "ovclose": closeOverlay(); break;
    case "obopen": obOpen(0); break;
    case "obstep": UI.ob = { step: Math.max(0, Math.min(OB_STEPS.length - 1, +b.dataset.v)) }; renderOverlay(); break;
    case "obskip": UI.ob = null; UI.obDismissed = true; renderOverlay(); render(); break;
    case "obdone": obFinish(); break;
    case "obcell": obToggle(b.dataset.g, +b.dataset.d, +b.dataset.p); break;
    case "mode": S.cls[k].mode = b.dataset.v; commit(k); break;
    case "hrs": setSeq(k, s => { s[i].hours = Math.max(0, s[i].hours + +b.dataset.n); }); break;
    case "mv": setSeq(k, s => { const j = i + +b.dataset.n; if (j < 0 || j >= s.length) return; [s[i], s[j]] = [s[j], s[i]]; }); break;
    case "addp": setSeq(k, s => { s.splice(i + 1, 0, { id: uid(), code: "P", strand: s[i].strand, hours: 1 }); }); break;
    case "del": { const snap = snapshotFor(k); const code = S.cls[k].seq[i].code; S.cls[k].seq.splice(i, 1); undoStack = snap; commit(k); toast(`${code} aus der Sequenz entfernt.`, true); break; }
    case "addrow": {
      const code = document.getElementById("addcode").value, strand = document.getElementById("addstrand").value, h = Math.max(0, +document.getElementById("addhrs").value || 0);
      const u = unitOf(k, code); setSeq(k, s => { s.push({ id: uid(), code, strand: S.cls[k].mode === "nacheinander" ? "A" : strand, hours: h || (u ? u.stunden.length : 1) || 1 }); }); break;
    }
    case "confirm": UI.confirm = b.dataset.v || null; render(); break;
    case "reset": S.cls[k] = Object.assign(defaultClass(k), { atoms: S.cls[k].atoms, groups: S.cls[k].groups.map(G => Object.assign(G, { adj: {} })) }); UI.confirm = null; commit(k); toast("Sequenz zurückgesetzt."); break;
    case "resetall": { resetYearState(); CLASSES.forEach(c => { save(c); GIDS.forEach(gid => save(engDoc(gkey(c, gid)))); }); cal().engineStart = cal().start; save("settings"); undoStack = null; UI.confirm = null; touch(); render(); toast(`Schuljahr ${yearLabel(cal().id)} zurückgesetzt.`); break; }
    case "engfilter": UI.engFilter = b.dataset.v; render(); break;
    case "atomnew": UI.editAtom = { code: b.dataset.code, id: "new", l: +b.dataset.l }; render(); break;
    case "atomedit": UI.editAtom = { code: b.dataset.code, id: b.dataset.id }; render(); break;
    case "atomcancel": UI.editAtom = null; render(); break;
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
      navigator.clipboard.writeText(txt).then(() => toast("Sicherung in die Zwischenablage kopiert."), () => { box.value = txt; box.select(); toast("Kopieren nicht erlaubt: Text ist markiert, bitte mit Strg+C kopieren."); });
      break;
    }
    case "download": {
      const txt = JSON.stringify({ app: "matheplaner", v: 2, year: UI.year, settings: S.settings, cls: S.cls, eng: S.eng }, null, 1);
      downloads.save({ filename: `matheplaner-sicherung-${todayIso()}.json`, data: txt }).then(() => toast("Datei gespeichert."), () => toast("Speichern abgebrochen."));
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
  if (!a) { if (t.id === "pickdate" && t.value) { UI.date = t.value; render(); } return; }
  const k = t.dataset.k || UI.cls, i = +t.dataset.i, f = t.dataset.f;
  switch (a) {
    case "strand": setSeq(k, s => { s[i].strand = t.value; }); break;
    case "hrsset": setSeq(k, s => { s[i].hours = Math.max(0, Math.min(60, Math.round(+t.value || 0))); }); break;
    case "ret": S.settings.retention = +t.value; commit(null, { settings: true }); break;
    case "perlesson": S.settings.perLesson = Math.max(1, Math.min(15, Math.round(+t.value || 5))); commit(null, { settings: true }); break;
    case "cal": if (t.value) { cal()[f] = t.value; commit(null, { settings: true }); } break;
    case "autobuf": S.settings.autoBuffer = t.checked; commit(null, { settings: true }); break;
    case "engstart": if (t.value) { cal().engineStart = t.value; commit(null, { settings: true }); } break;
    case "hol": cal().holidays[i][f] = t.value; commit(null, { settings: true }); break;
    case "free": cal().free[i][f] = t.value; commit(null, { settings: true }); break;
    case "tl": { const v = ttVersion(curG(), t.dataset.v), row = v && v.lessons[i]; if (!row) break; if (f === "track") row.track = t.value; else if (f === "len") { if (t.value === "2") row.len = 2; else delete row.len; } else row[f] = Math.max(1, Math.round(+t.value || 1)); commit(k); break; }
    case "lastday": { const c = ck(curG()); S.cls[c].lastDay = t.value || ""; commit(c); break; }
    case "ttfrm": { const G = grp(curG()), v = ttVersion(curG(), t.dataset.v); if (!v || !t.value) break; if (G.tt.some(x => x !== v && x.frm === t.value)) { toast("Ab diesem Datum gibt es schon einen Stundenplan."); render(); break; } v.frm = t.value; sortTT(G.tt); commit(k); break; }
    case "mine": {
      const Y = cal(), l = mineList(), kk = t.dataset.k;
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
  if (!atom.t) return;
  const list = clone(atomsOf(k, code)); const j = list.findIndex(x => x.id === id);
  if (j >= 0) list[j] = atom; else list.push(atom);
  list.sort((x, y) => x.l - y.l);
  S.cls[k].atoms[code] = list; UI.editAtom = null; commit(k); toast("Atom gespeichert.");
});
document.addEventListener("keydown", ev => {
  if (UI.ob && ev.key === "Escape") { UI.ob = null; UI.obDismissed = true; renderOverlay(); render(); return; }
  if (!UI.quiz && !UI.solOpen) return;
  if (ev.key === "Escape") { closeOverlay(); return; }
  if (!UI.quiz) return;
  if (ev.key === " " && !UI.quiz.show) { ev.preventDefault(); UI.quiz.show = true; renderOverlay(); }
  else if (UI.quiz.show && /^[1-4]$/.test(ev.key)) { const q = UI.quiz, x = q.items[q.i]; if (!x) return; rate(q.k, x.a.id, +ev.key); quizNext(); }
});

/* ---------------- boot ---------------- */
let downloads = null;
window.__mp = { mx, __lv: (g, d, id) => { touch(); const x = engineState(g, d).list.find(y => y.a.id === id); return x ? taskOf(x.a, levelOf(x)) : null; }, S, schedule, engineState, fsrsReview, lessonInfo, UI, cal, sachsenYear, switchYear, createYear, ttFromLegacy, applyDoc };
render.keepScroll = false;
/* MathJax lädt asynchron; sobald es bereit ist, die schon gezeichneten Formeln setzen */
window.__mpMathReady = () => { typesetMath(document.getElementById("main")); typesetMath(document.getElementById("overlay")); };
renderBanner(); render();
if (route() === "plan") { const c = document.getElementById("curweek"); if (c) c.scrollIntoView({ block: "center" }); }
initDb();
(async () => { try { downloads = window.claude && window.claude.use ? await window.claude.use("downloads") : null; } catch (e) { downloads = null; } const dl = document.getElementById("dlbtn"); if (dl && downloads) dl.hidden = false; })();
})();
