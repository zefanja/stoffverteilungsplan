(function () {
"use strict";
const D = window.PLAN_DATA;
const CLASSES = ["kl6", "kl8"];

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
const DAYS = ["", "Mo", "Di", "Mi", "Do", "Fr"];
const LBVAR = { LB1: "lb1", LB2: "lb2", LB3: "lb3", LB4: "lb4", LB5: "lb5", WB: "wb", test: "test", start: "start", P: "buf" };
const sty = lb => `--c:var(--${LBVAR[lb] || "buf"});--bg:var(--${LBVAR[lb] || "buf"}-bg)`;

/* ---------------- state ---------------- */
function defaultSettings() { return { calendar: clone(D.calendar), retention: 0.9, perLesson: 5, autoBuffer: true, engineStart: null }; }
function defaultClass(k) {
  const c = D.classes[k];
  return { mode: c.mode, seq: c.seq.map(([code, strand, hours]) => ({ id: uid(), code, strand, hours })),
    timetable: c.timetable.map(t => Object.assign({ id: uid() }, t)), cancelled: {}, done: {}, atoms: {} };
}
const defaultEngine = () => ({ cards: {}, log: [] });
const S = {
  settings: defaultSettings(),
  cls: { kl6: defaultClass("kl6"), kl8: defaultClass("kl8") },
  eng: { kl6: defaultEngine(), kl8: defaultEngine() },
};
const UI = { date: todayIso(), cls: "kl6", todayCls: "all", reveal: {}, editAtom: null, confirm: null, quiz: null, solOpen: false, engFilter: "intro" };
try { const v = localStorage.getItem("mp-cls"); if (v && CLASSES.includes(v)) UI.cls = v; const t = localStorage.getItem("mp-today"); if (t) UI.todayCls = t; } catch (e) {}

let ver = 0; const cache = {};
const touch = () => { ver++; };

const unitOf = (k, code) => D.classes[k].units[code];
const lbOf = (k, code) => (unitOf(k, code) || {}).lb || "P";
const atomsOf = (k, code) => S.cls[k].atoms[code] || (unitOf(k, code) || {}).atoms || [];
function atomMap(k) {
  const key = "am" + k;
  if (cache[key] && cache[key].ver === ver) return cache[key].m;
  const m = {};
  for (const code of D.classes[k].unitOrder) for (const a of atomsOf(k, code)) m[a.id] = Object.assign({ code }, a);
  cache[key] = { ver, m }; return m;
}
const titleOf = (k, code) => code === "P" ? "Puffer · Wiederholung" : code === "JA" ? "Jahresabschluss" : (unitOf(k, code) || {}).title || code;

/* ---------------- scheduling ---------------- */
function schedule(k) {
  if (cache[k] && cache[k].ver === ver) return cache[k];
  const cal = S.settings.calendar, C = S.cls[k], seqMode = C.mode === "nacheinander";
  const free = {}; (cal.free || []).forEach(f => { if (f.date) free[f.date] = f.name || "unterrichtsfrei"; });
  const holidayOf = d => { for (const h of cal.holidays || []) if (h.frm && h.to && h.frm <= d && d <= h.to) return h.name || "Ferien"; return null; };
  const slots = [], dayInfo = {};
  if (cal.start && cal.end && cal.start <= cal.end) {
    for (let d = cal.start; d <= cal.end; d = addDays(d, 1)) {
      const w = dow(d); if (w > 5) continue;
      const h = holidayOf(d), f = free[d];
      if (h || f) { dayInfo[d] = { school: false, note: h || f }; continue; }
      dayInfo[d] = { school: true };
      for (const t of C.timetable) {
        if (+t.day !== w) continue; if (t.frm && d < t.frm) continue; if (t.to && d > t.to) continue;
        const track = t.track === "SOL" ? "SOL" : (seqMode ? "A" : (t.track === "B" ? "B" : "A"));
        const key = d + "|" + t.period;
        slots.push({ date: d, period: +t.period, track, key, cancelled: !!C.cancelled[key], lesson: null });
      }
    }
  }
  slots.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.period - b.period);
  const rows = C.seq.map((r, i) => Object.assign({}, r, { idx: i, track: seqMode ? "A" : (r.strand === "B" ? "B" : "A"), start: null, end: null, overflow: 0, slots: [] }));
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
  return (cache[k] = { ver, slots, rows, cap, planned, intro, byDate, dayInfo, seqMode });
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
function engineState(k, date) {
  const sc = schedule(k), E = S.eng[k], am = atomMap(k), list = [];
  const start = S.settings.engineStart || S.settings.calendar.start || "0000-00-00";
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

/* ---------------- persistence ---------------- */
const DOCS = { settings: "planner/settings", kl6: "planner/kl6", kl8: "planner/kl8", e6: "engine/kl6", e8: "engine/kl8" };
const engDoc = k => k === "kl6" ? "e6" : "e8";
let db = null, dbState = "loading";
const dirty = {}, saving = {}, timers = {};
function docBody(name) { return name === "settings" ? S.settings : name === "kl6" || name === "kl8" ? S.cls[name] : S.eng[name === "e6" ? "kl6" : "kl8"]; }
function save(name) { dirty[name] = true; clearTimeout(timers[name]); timers[name] = setTimeout(() => flush(name), 700); }
async function flush(name) {
  if (!db) return;
  if (saving[name]) { timers[name] = setTimeout(() => flush(name), 500); return; }
  saving[name] = true;
  const body = clone(docBody(name));
  if (body.log && body.log.length > 600) body.log = body.log.slice(-600);
  try { await db.doc(DOCS[name]).set(body); dirty[name] = false; if (dbState === "err") setDbState("ok"); }
  catch (e) {
    if (e && e.code === "unavailable") { setTimeout(() => flush(name), 1500 + Math.random() * 1000); }
    else setDbState(e && e.code === "invalid_argument" ? "ro" : e && e.code === "quota_exceeded" ? "quota" : "err");
  } finally { saving[name] = false; }
}
function applyDoc(name, data) {
  if (!data || typeof data !== "object") return;
  if (name === "settings") {
    const d = defaultSettings();
    S.settings = Object.assign(d, data, { calendar: Object.assign(d.calendar, data.calendar || {}) });
  } else if (name === "kl6" || name === "kl8") {
    if (!Array.isArray(data.seq) || !Array.isArray(data.timetable)) return;
    S.cls[name] = Object.assign(defaultClass(name), data);
  } else {
    S.eng[name === "e6" ? "kl6" : "kl8"] = { cards: data.cards || {}, log: Array.isArray(data.log) ? data.log : [] };
  }
}
function setDbState(s) { dbState = s; renderBanner(); }
async function initDb() {
  try { db = window.claude && window.claude.use ? await window.claude.use("db") : null; } catch (e) { db = null; }
  if (!db) { setDbState("off"); if (!S.settings.engineStart) { S.settings.engineStart = todayIso(); touch(); render(); } return; }
  const timer = setTimeout(() => { if (dbState === "loading") setDbState("slow"); }, 10000);
  let pending = Object.keys(DOCS).length;
  for (const [name, path] of Object.entries(DOCS)) {
    let first = true;
    db.doc(path).onSnapshot(snap => {
      if (!snap.metadata.hasPendingWrites && !dirty[name] && !saving[name] && snap.exists) { applyDoc(name, snap.data()); touch(); render(); }
      if (first && !snap.metadata.fromCache) { first = false; if (--pending === 0) { clearTimeout(timer); setDbState("ok"); if (!S.settings.engineStart) { S.settings.engineStart = todayIso(); save("settings"); touch(); render(); } } }
    }, () => { clearTimeout(timer); setDbState("err"); });
  }
}

/* ---------------- actions ---------------- */
let undoStack = null;
function snapshotFor(k) { return { k, cls: clone(S.cls[k]), eng: clone(S.eng[k]), settings: clone(S.settings) }; }
function commit(k, opts) {
  touch();
  if (k) save(k);
  if (opts && opts.eng) save(engDoc(k));
  if (opts && opts.settings) save("settings");
  render();
}
function withUndo(k, msg, fn) {
  const snap = snapshotFor(k); fn();
  undoStack = snap; commit(k, { eng: true, settings: true }); toast(msg, true);
}
function doUndo() {
  if (!undoStack) return; const u = undoStack; undoStack = null;
  S.cls[u.k] = u.cls; S.eng[u.k] = u.eng; S.settings = u.settings;
  commit(u.k, { eng: true, settings: true }); toast("Rückgängig gemacht");
}
function consumeBuffer(k, fromIdx, track) {
  const sc = schedule(k);
  for (let i = fromIdx + 1; i < sc.rows.length; i++) {
    const r = sc.rows[i];
    if (r.code === "P" && r.track === track && r.hours > 0) { S.cls[k].seq[i].hours -= 1; return i; }
  }
  return -1;
}
function addHour(k, rowIdx) {
  const row = schedule(k).rows[rowIdx]; let note = "";
  withUndo(k, "", () => {
    S.cls[k].seq[rowIdx].hours += 1;
    if (S.settings.autoBuffer) { const j = consumeBuffer(k, rowIdx, row.track); note = j >= 0 ? " Ein Puffer weiter hinten wurde um 1 Std. gekürzt." : " Kein Puffer mehr frei: Reserve prüfen."; }
  });
  toast(`${row.code}: eine Stunde mehr eingeplant.${note}`, true);
}
function cancelSlot(k, key) {
  const sc = schedule(k), s = sc.slots.find(x => x.key === key); if (!s) return;
  const wasCancelled = !!S.cls[k].cancelled[key]; let note = "";
  withUndo(k, "", () => {
    if (wasCancelled) { delete S.cls[k].cancelled[key]; }
    else {
      S.cls[k].cancelled[key] = true;
      if (S.settings.autoBuffer && s.lesson) { const j = consumeBuffer(k, s.lesson.row.idx, s.track); note = j >= 0 ? " Ein Puffer wurde um 1 Std. gekürzt." : " Kein Puffer mehr frei: Reserve prüfen."; }
    }
  });
  toast(wasCancelled ? "Stunde findet wieder statt." : `Stunde als ausgefallen markiert, der Plan rückt nach.${note}`, true);
}
function toggleDone(k, key) {
  if (S.cls[k].done[key]) delete S.cls[k].done[key]; else S.cls[k].done[key] = true;
  commit(k);
}
function rate(k, id, g) {
  const date = UI.date, prev = S.eng[k].cards[id];
  withUndo(k, "", () => {
    S.eng[k].cards[id] = fsrsReview(prev, g, date, S.settings.retention);
    S.eng[k].log.push({ d: date, id, g });
  });
  const c = S.eng[k].cards[id];
  toast(`Gespeichert. Nächste Wiederholung ab ${fmt(c.due)} (in ${diffDays(date, c.due)} Tagen).`, true);
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
    slow: "Der Speicher antwortet noch nicht. Sie sehen gerade den Ausgangsplan; Änderungen werden gespeichert, sobald die Verbindung steht.",
    off: "Speichern ist in dieser Ansicht nicht verfügbar. Änderungen gelten nur bis zum Neuladen. Öffnen Sie die App angemeldet auf claude.ai.",
    err: "Speichern ist gerade fehlgeschlagen. Die App versucht es bei der nächsten Änderung erneut.",
    ro: "Sie können diesen Plan ansehen, aber nicht ändern.",
    quota: "Der Speicher ist voll. Löschen Sie alte Daten über Einstellungen → Sicherung.",
  }[dbState];
  el.textContent = m || ""; el.hidden = !m; el.dataset.kind = dbState;
}

/* ---------------- shared pieces ---------------- */
function chip(k, code, extra) {
  const lb = lbOf(k, code);
  return `<span class="chip" style="${sty(lb)}"><b>${esc(code)}</b>${extra ? `<span>${extra}</span>` : ""}</span>`;
}
function unitLink(k, code, label) {
  const i = D.classes[k].unitOrder.indexOf(code);
  if (i < 0 || code === "P" || code === "JA") return `<span class="ulink plain" style="${sty(lbOf(k, code))}"><b>${esc(code)}</b> ${esc(label || titleOf(k, code))}</span>`;
  return `<a class="ulink" href="#u-${k}-${i}" style="${sty(lbOf(k, code))}"><b>${esc(code)}</b> ${esc(label || titleOf(k, code))}</a>`;
}
function clsTabs(view) {
  return `<div class="seg" role="tablist">${CLASSES.map(k => `<button type="button" role="tab" aria-selected="${UI.cls === k}" data-act="cls" data-k="${k}">${esc(D.classes[k].label)}</button>`).join("")}</div>`;
}
function trackName(k, tr) {
  const c = D.classes[k], sc = schedule(k);
  if (tr === "SOL") return "SOL-Stunde";
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
  if (D.classes[k].sol) out.push(`<div class="cap"><div class="lbl">SOL-Stunden</div><div class="nums"><span><b class="mono">${sc.cap.SOL}</b> im Jahr</span></div><div class="res">zusätzlich</div></div>`);
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
  const show = UI.todayCls === "all" ? CLASSES : [UI.todayCls];
  return `<section class="today">
    <div class="datebar">
      <button type="button" class="iconbtn" data-act="day" data-n="-1" aria-label="Vorheriger Tag">‹</button>
      <div class="dt"><div class="dname">${esc(fmtLong(d))}</div><div class="dsub mono">KW ${isoWeek(d)}${isToday ? " · heute" : ""}</div></div>
      <button type="button" class="iconbtn" data-act="day" data-n="1" aria-label="Nächster Tag">›</button>
      ${isToday ? "" : '<button type="button" class="btn ghost" data-act="today">Heute</button>'}
      <input type="date" id="pickdate" value="${d}" aria-label="Datum wählen">
      <div class="seg small">${[["all", "Beide"], ["kl6", "Kl. 6"], ["kl8", "Kl. 8"]].map(([v, l]) => `<button type="button" aria-selected="${UI.todayCls === v}" data-act="todaycls" data-v="${v}">${l}</button>`).join("")}</div>
    </div>
    <div class="tgrid ${show.length === 1 ? "one" : ""}">${show.map(k => todayCard(k, d)).join("")}</div>
  </section>`;
}
function todayCard(k, d) {
  const c = D.classes[k], sc = schedule(k), info = sc.dayInfo[d];
  const slots = sc.byDate[d] || [];
  let body = "";
  if (!info) body = `<p class="muted">Dieser Tag liegt außerhalb des Schuljahres.</p>`;
  else if (!info.school) body = `<p class="free">${esc(info.note || "Wochenende")}: kein Unterricht.</p>`;
  else if (!slots.length) body = `<p class="muted">Heute hat ${esc(c.label)} laut Stundenplan keine Mathestunde.</p>`;
  body += slots.map(s => slotBlock(k, s)).join("");
  if (!slots.some(s => s.lesson)) {
    const nx = sc.slots.find(s => s.date > d && s.lesson);
    if (nx) { const li = lessonInfo(k, nx.lesson); body += `<div class="next"><span class="lbl">Nächste Stunde · ${esc(fmt(nx.date, { weekday: "short", day: "2-digit", month: "2-digit" }))}, ${nx.period}. Std.</span>${unitLink(k, nx.lesson.row.code)}<div class="small">${esc(li.title)}</div></div>`; }
  }
  const es = engineState(k, d);
  const rv = es.pick.map(x => reviewItem(k, x)).join("");
  const res = ["A", "B"].filter(t => !(sc.seqMode && t === "B")).map(t => sc.cap[t] - sc.planned[t]);
  const warn = res.some(r => r < 0) ? `<a class="warn" href="#sequenz" data-act="cls" data-k="${k}">Der Plan ist voller als das Schuljahr: ${-Math.min(...res)} Std. fehlen. Zur Sequenz →</a>` : "";
  return `<article class="card tcard">
    <header class="thead"><h2>${esc(c.label)}</h2><span class="badge">${sc.seqMode ? "nacheinander" : "in Strängen"}</span></header>
    ${warn}
    <div class="lessons">${body}</div>
    <section class="engine-box">
      <header><h3>Heute wiederholen</h3><span class="muted small">${es.dueCount ? `${es.dueCount} fällig` : "nichts fällig"}${es.backCount ? ` · ${es.backCount} im Altbestand` : ""}</span>
      ${es.pick.length ? `<button type="button" class="btn" data-act="quiz" data-k="${k}">Als Quiz zeigen</button>` : ""}</header>
      ${rv || `<p class="muted small">Sobald Atome im Unterricht eingeführt sind, plant die Learning Engine hier die Wiederholungen.</p>`}
    </section>
  </article>`;
}
function slotBlock(k, s) {
  const tag = `<span class="per mono">${s.period}. Std.</span>`;
  if (s.track === "SOL") {
    const f = s.cancelled ? null : solFormat(k, s), cu = currentUnit(k, s.date);
    return `<div class="slot sol ${s.cancelled ? "x" : ""}">${tag}<div class="sbody"><div class="stitle">SOL-Stunde${f ? ` · Format ${f}: ${esc(SOL_FORMATS[f][0])}` : " fällt aus"}</div>
      ${f ? `<div class="small">${esc(SOL_FORMATS[f][1])}${f === 2 && cu ? ` Aktuelle Einheit: ${esc(cu)} ${esc(titleOf(k, cu))}.` : ""}</div>` : ""}
      <div class="acts"><button type="button" class="btn ghost sm" data-act="solinfo">Alle Formate</button><button type="button" class="btn ghost sm" data-act="cancel" data-k="${k}" data-key="${s.key}">${s.cancelled ? "Findet doch statt" : "Fällt aus"}</button></div></div></div>`;
  }
  if (s.cancelled) return `<div class="slot x">${tag}<div class="sbody"><div class="stitle">Ausgefallen</div><div class="acts"><button type="button" class="btn ghost sm" data-act="cancel" data-k="${k}" data-key="${s.key}">Findet doch statt</button></div></div></div>`;
  if (!s.lesson) return `<div class="slot">${tag}<div class="sbody"><div class="stitle">Frei: In der Sequenz ist nichts mehr geplant.</div></div></div>`;
  const L = s.lesson, li = lessonInfo(k, L), done = !!S.cls[k].done[s.key];
  const sc = schedule(k);
  return `<div class="slot ${done ? "done" : ""}" style="${sty(lbOf(k, L.row.code))}">${tag}<div class="sbody">
    ${unitLink(k, L.row.code)}
    <div class="stitle">Stunde ${L.n} von ${L.row.hours}: ${esc(li.title)}</div>
    ${!sc.seqMode ? `<div class="small muted">${esc(trackName(k, s.track))}</div>` : ""}
    ${li.atoms.length ? `<div class="newatoms"><div class="lbl">Neu in dieser Stunde</div><ul>${li.atoms.map(a => `<li>${esc(a.t)}<span class="q">Check: ${esc(a.q)} <i>→ ${esc(a.a)}</i></span></li>`).join("")}</ul></div>` : ""}
    <div class="acts">
      <button type="button" class="btn ${done ? "ok" : ""} sm" data-act="done" data-k="${k}" data-key="${s.key}" aria-pressed="${done}">${done ? "✓ Gehalten" : "Als gehalten markieren"}</button>
      ${L.row.code !== "P" && L.row.code !== "JA" ? `<button type="button" class="btn ghost sm" data-act="addhour" data-k="${k}" data-row="${L.row.idx}">Einheit braucht 1 Std. mehr</button>` : ""}
      <button type="button" class="btn ghost sm" data-act="cancel" data-k="${k}" data-key="${s.key}">Fällt aus</button>
    </div></div></div>`;
}
function reviewItem(k, x) {
  const id = x.a.id, open = UI.reveal[k + id];
  const state = x.isNew ? `<span class="pill new">erste Wiederholung</span>` : x.backlog ? `<span class="pill">Altbestand · ${esc(fmt(x.intro))}</span>` : `<span class="pill">${Math.round(x.R * 100)} % Abruf</span>`;
  return `<div class="ritem" style="${sty(lbOf(k, x.code))}">
    <div class="rtop"><span class="chip"><b>${esc(x.code)}</b></span>${state}</div>
    <div class="rq">${esc(x.a.q)}</div>
    ${open ? `<div class="ra">${esc(x.a.a)}</div><div class="rt small muted">${esc(x.a.t)}</div>${rateButtons(k, id)}` : `<button type="button" class="btn ghost sm" data-act="reveal" data-id="${esc(k + id)}">Lösung zeigen</button>`}
  </div>`;
}
const RATES = [[1, "Nochmal", "unter 50 % richtig"], [2, "Schwer", "50–70 %"], [3, "Gut", "70–90 %"], [4, "Leicht", "über 90 %"]];
function rateButtons(k, id) {
  return `<div class="rates">${RATES.map(([g, l, h]) => `<button type="button" class="rate r${g}" data-act="rate" data-k="${k}" data-id="${esc(id)}" data-g="${g}"><b>${l}</b><span>${h}</span></button>`).join("")}</div>`;
}

/* ---------------- views: Jahresplan ---------------- */
function viewPlan() {
  const k = UI.cls, sc = schedule(k), cal = S.settings.calendar, today = todayIso();
  const trs = sc.seqMode ? ["A"] : ["A", "B"]; const sol = D.classes[k].sol;
  let rows = "";
  if (cal.start && cal.end) for (let m = monday(cal.start); m <= cal.end; m = addDays(m, 7)) {
    const notes = new Set(); let school = 0;
    for (let i = 0; i < 5; i++) { const di = sc.dayInfo[addDays(m, i)]; if (!di) continue; if (di.school) school++; else notes.add(di.note); }
    const ws = sc.slots.filter(s => monday(s.date) === m);
    const cells = trs.map(tr => {
      const ls = ws.filter(s => s.track === tr);
      const groups = []; ls.forEach(s => {
        if (s.cancelled) { const g = groups.find(g => g.code === "×"); if (g) g.n++; else groups.push({ code: "×", n: 1 }); return; }
        if (!s.lesson) return; const code = s.lesson.row.code; const g = groups.find(g => g.code === code);
        if (g) { g.n++; if (S.cls[k].done[s.key]) g.done++; } else groups.push({ code, n: 1, done: S.cls[k].done[s.key] ? 1 : 0 });
      });
      return `<td>${groups.map(g => g.code === "×" ? `<span class="xchip">${g.n}× ausgefallen</span>` : `${unitLink(k, g.code)}<span class="hrs mono">${g.n} Std.${g.done ? ` · ${g.done}✓` : ""}</span>`).join("<br>")}</td>`;
    }).join("");
    const solCell = sol ? `<td class="small">${ws.filter(s => s.track === "SOL").map(s => s.cancelled ? "ausgefallen" : `F${solFormat(k, s)} ${esc(SOL_FORMATS[solFormat(k, s)][0])}`).join("<br>")}</td>` : "";
    const cur = m === monday(today);
    rows += `<tr class="${school === 0 ? "hol" : ""} ${cur ? "cur" : ""}" ${cur ? 'id="curweek"' : ""}><td class="mono">${isoWeek(m)}</td><td class="mono nowrap">${fmt(m)}–${fmt(addDays(m, 4))}</td><td class="note">${esc([...notes].join(", "))}</td>${school === 0 ? `<td colspan="${trs.length + (sol ? 1 : 0)}"></td>` : cells + solCell}</tr>`;
  }
  return `<section><div class="vhead"><h1>Jahresplan</h1>${clsTabs()}</div>
    ${capCards(k)}
    <div class="tscroll"><table class="plan"><thead><tr><th>KW</th><th>Woche</th><th>Hinweis</th>${trs.map(t => `<th>${esc(trackName(k, t))}</th>`).join("")}${sol ? "<th>SOL</th>" : ""}</tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

/* ---------------- views: Sequenz ---------------- */
function viewSeq() {
  const k = UI.cls, C = S.cls[k], sc = schedule(k), c = D.classes[k];
  const used = new Set(C.seq.map(r => r.code));
  const avail = c.unitOrder.filter(code => !used.has(code) || code === "P" || code === "JA");
  const lbh = lbHours(k);
  const rows = sc.rows.map((r, i) => {
    const when = r.overflow ? `<span class="neg">${r.slots.length ? fmt(r.start) + " – " : ""}${r.overflow} Std. nach Schuljahresende</span>` : r.start ? `${fmt(r.start)} – ${fmt(r.end)}` : r.hours === 0 ? "—" : "";
    return `<tr style="${sty(lbOf(k, r.code))}">
      <td class="mono muted">${i + 1}</td>
      <td><span class="chip"><b>${esc(r.code)}</b></span></td>
      <td class="ttl">${unitOf(k, r.code) && !["P", "JA"].includes(r.code) ? `<a href="#u-${k}-${c.unitOrder.indexOf(r.code)}">${esc(titleOf(k, r.code))}</a>` : esc(titleOf(k, r.code))}</td>
      <td><select data-act="strand" data-i="${i}" aria-label="Strang" ${sc.seqMode ? "disabled" : ""}><option ${r.strand !== "B" ? "selected" : ""}>A</option><option ${r.strand === "B" ? "selected" : ""}>B</option></select></td>
      <td class="nowrap"><button type="button" class="mini" data-act="hrs" data-i="${i}" data-n="-1" aria-label="Eine Stunde weniger">−</button><input class="num mono" type="number" min="0" max="60" value="${r.hours}" data-act="hrsset" data-i="${i}" aria-label="Stunden"><button type="button" class="mini" data-act="hrs" data-i="${i}" data-n="1" aria-label="Eine Stunde mehr">+</button>
        ${unitOf(k, r.code) && unitOf(k, r.code).stunden.length && r.hours !== unitOf(k, r.code).stunden.length ? `<span class="soll small muted">Soll ${unitOf(k, r.code).stunden.length}</span>` : ""}</td>
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
      <div class="card"><h3>Hinterherhängen?</h3><p class="small">Auf der Heute-Seite gibt es dafür zwei Knöpfe. „Einheit braucht 1 Std. mehr“ verlängert die laufende Einheit, „Fällt aus“ streicht eine Stunde. ${S.settings.autoBuffer ? "In beiden Fällen kürzt die App automatisch den nächsten Puffer im selben Strang, damit das Schuljahr aufgeht." : "Puffer werden nicht automatisch gekürzt (Einstellungen)."} Hier können Sie Puffer (P) auch von Hand verschieben oder kürzen.</p>
      ${confirm ? `<div class="confirm"><span>Sequenz von ${esc(c.label)} auf die Vorlage zurücksetzen? Ihre Änderungen an Reihenfolge und Stunden gehen verloren.</span><button type="button" class="btn danger" data-act="reset" data-k="${k}">Zurücksetzen</button><button type="button" class="btn ghost" data-act="confirm" data-v="">Abbrechen</button></div>` : `<button type="button" class="btn ghost" data-act="confirm" data-v="reset-${k}">Auf Vorlage zurücksetzen</button>`}</div>
    </div></section>`;
}

/* ---------------- views: Einheiten ---------------- */
function viewUnits() {
  const k = UI.cls, c = D.classes[k], sc = schedule(k);
  const rowOf = {}; sc.rows.forEach(r => { if (!rowOf[r.code]) rowOf[r.code] = r; });
  const groups = {};
  c.unitOrder.filter(code => code !== "P" && code !== "JA").forEach(code => { const lb = lbOf(k, code); (groups[lb] || (groups[lb] = [])).push(code); });
  const order = ["start", "LB1", "LB2", "LB3", "LB4", "LB5", "WB", "test"];
  return `<section><div class="vhead"><h1>Einheiten</h1>${clsTabs()}</div>
    ${order.filter(lb => groups[lb]).map(lb => `<h2 class="lbh" style="${sty(lb)}">${esc(c.lbnames[lb] || lb)}</h2>
    <div class="ugrid">${groups[lb].map(code => {
      const u = unitOf(k, code), r = rowOf[code], i = c.unitOrder.indexOf(code);
      return `<a class="ucard" href="#u-${k}-${i}" style="${sty(lb)}"><span class="chip"><b>${esc(code)}</b></span><span class="ut">${esc(u.title)}</span>
        <span class="um small muted mono">${r ? `${r.hours} Std.${r.start ? " · " + fmt(r.start) + "–" + fmt(r.end) : ""}` : "nicht in der Sequenz"} · ${atomsOf(k, code).length} Atome</span></a>`;
    }).join("")}</div>`).join("")}</section>`;
}
function viewUnit(k, idx) {
  const c = D.classes[k], code = c.unitOrder[idx], u = unitOf(k, code);
  if (!u) return `<p>Einheit nicht gefunden.</p>`;
  const sc = schedule(k), r = sc.rows.find(x => x.code === code), E = S.eng[k];
  const atoms = atomsOf(k, code), nL = Math.max(u.stunden.length, r ? r.hours : 0, ...atoms.map(a => a.l), 1);
  const list = (t, a) => a && a.length ? `<div class="box"><h3>${t}</h3><ul>${a.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>` : "";
  let lessons = "";
  for (let n = 1; n <= nL; n++) {
    const slot = r && r.slots[n - 1];
    const title = u.stunden[n - 1] || (r && n <= r.hours ? "Übung und Vertiefung" : "(über die geplanten Stunden hinaus)");
    const la = atoms.filter(a => a.l === n);
    lessons += `<div class="lesson"><div class="lhead"><span class="mono muted">Stunde ${n}</span><span class="ltitle">${esc(title)}</span><span class="mono small muted">${slot ? fmt(slot.date, { weekday: "short", day: "2-digit", month: "2-digit" }) + (S.cls[k].done[slot.key] ? " ✓" : "") : r && n > r.hours ? "nicht eingeplant" : ""}</span></div>
      <ul class="alist">${la.map(a => atomRow(k, code, a, E.cards[a.id])).join("")}</ul>
      ${UI.editAtom && UI.editAtom.code === code && UI.editAtom.id === "new" && UI.editAtom.l === n ? atomForm(k, code, { l: n, t: "", q: "", a: "" }, "new") : `<button type="button" class="linkbtn small" data-act="atomnew" data-code="${esc(code)}" data-l="${n}">+ Atom</button>`}
    </div>`;
  }
  return `<section class="unitv" style="${sty(u.lb)}">
    <div class="ubar"><a class="btn ghost" href="#einheiten">← Einheiten</a>${idx > 0 ? `<a class="btn ghost" href="#u-${k}-${idx - 1}">‹ ${esc(c.unitOrder[idx - 1])}</a>` : ""}${idx < c.unitOrder.length - 1 ? `<a class="btn ghost" href="#u-${k}-${idx + 1}">${esc(c.unitOrder[idx + 1])} ›</a>` : ""}</div>
    <header class="uhead"><div><span class="code mono">${esc(code)} · ${esc(c.label)}</span><h1>${esc(u.title)}</h1><div class="small">${esc(c.lbnames[u.lb] || "")}</div></div>
      <div class="umeta mono">${r ? `${r.hours} Std. geplant${u.stunden.length ? ` (Soll ${u.stunden.length})` : ""}<br>${r.start ? fmt(r.start) + " – " + fmt(r.end) : ""}${r.overflow ? `<br><span class="neg">${r.overflow} Std. nach Schuljahresende</span>` : ""}` : "nicht in der Sequenz"}</div></header>
    <div class="grid2">
      <div>${list("Inhalte · Die Schüler können …", u.inhalte)}${list("Vertiefung", u.tiefe)}${list("Vorwissen · Retrieval", u.vorwissen)}</div>
      <div>${u.begriffe && u.begriffe.length ? `<div class="box"><h3>Fachbegriffe</h3><div class="tags">${u.begriffe.map(b => `<span>${esc(b)}</span>`).join("")}</div></div>` : ""}${list("Hinweise · Bezüge", u.hinweise)}${list("Material", u.material)}</div>
    </div>
    <h2>Stunden und Atome</h2>
    <p class="small muted">Atome werden in der Stunde eingeführt, der sie zugeordnet sind. Ab der folgenden Stunde plant die Learning Engine ihre Wiederholung. ${S.cls[k].atoms[code] ? `<button type="button" class="linkbtn" data-act="atomreset" data-code="${esc(code)}">Atome dieser Einheit auf die Vorlage zurücksetzen</button>` : ""}</p>
    <div class="lessons-list">${lessons}</div></section>`;
}
function atomRow(k, code, a, card) {
  if (UI.editAtom && UI.editAtom.id === a.id) return `<li>${atomForm(k, code, a, a.id)}</li>`;
  const st = card ? `<span class="pill">${Math.round(Rof(Math.max(0, diffDays(card.last, UI.date)), card.s) * 100)} % · ab ${fmt(card.due)}</span>` : "";
  return `<li class="atom"><div><b>${esc(a.t)}</b> ${st}<div class="small muted">Check: ${esc(a.q)} → ${esc(a.a)}</div></div>
    <span class="nowrap"><button type="button" class="mini" data-act="atomedit" data-code="${esc(code)}" data-id="${esc(a.id)}" aria-label="Atom bearbeiten">✎</button><button type="button" class="mini del" data-act="atomdel" data-code="${esc(code)}" data-id="${esc(a.id)}" aria-label="Atom löschen">×</button></span></li>`;
}
function atomForm(k, code, a, id) {
  return `<form class="aform" data-code="${esc(code)}" data-id="${esc(id)}">
    <label>Atom <input name="t" required value="${esc(a.t)}" placeholder="z. B. Gleichnamige Brüche addieren"></label>
    <label>Prüffrage <input name="q" value="${esc(a.q)}" placeholder="z. B. 2/7 + 3/7 = ?"></label>
    <label>Lösung <input name="a" value="${esc(a.a)}" placeholder="5/7"></label>
    <label class="sm">Stunde <input name="l" type="number" min="1" value="${a.l}"></label>
    <div class="acts"><button class="btn" type="submit">Speichern</button><button type="button" class="btn ghost" data-act="atomcancel">Abbrechen</button></div></form>`;
}

/* ---------------- views: Learning Engine ---------------- */
function viewEngine() {
  const k = UI.cls, d = UI.date, es = engineState(k, d), E = S.eng[k];
  const intro = es.list;
  const avgR = intro.filter(x => x.R !== null);
  const meanR = avgR.length ? avgR.reduce((s, x) => s + x.R, 0) / avgR.length : null;
  const total = Object.keys(atomMap(k)).length;
  const byUnit = {};
  const showAll = UI.engFilter === "all";
  const am = atomMap(k), sc = schedule(k);
  const rowsSrc = showAll ? Object.values(am).map(a => intro.find(x => x.a.id === a.id) || { a, code: a.code, intro: sc.intro[a.id] ? sc.intro[a.id].date : null, card: null, isNew: false, R: null, future: true }) : intro;
  rowsSrc.forEach(x => (byUnit[x.code] || (byUnit[x.code] = [])).push(x));
  const unitsSorted = Object.keys(byUnit).sort((a, b) => D.classes[k].unitOrder.indexOf(a) - D.classes[k].unitOrder.indexOf(b));
  const tbl = unitsSorted.map(code => `<tr class="ugroup"><td colspan="5">${unitLink(k, code)}</td></tr>` + byUnit[code].map(x => {
    const c = x.card;
    const R = x.R !== null && x.R !== undefined ? x.R : null;
    return `<tr><td>${esc(x.a.t)}</td>
      <td>${R !== null ? `<span class="rbar"><i style="width:${Math.round(R * 100)}%"></i></span><span class="mono small">${Math.round(R * 100)} %</span>` : `<span class="small muted">${x.future ? (x.intro ? "ab " + fmt(x.intro) : "nicht eingeplant") : x.backlog ? "Altbestand" : "neu"}</span>`}</td>
      <td class="mono small">${c ? c.s.toFixed(1) + " T." : "—"}</td>
      <td class="mono small">${c ? fmt(c.due) : x.isNew ? "jetzt" : "—"}</td>
      <td class="mono small">${c ? c.reps + (c.lapses ? ` (${c.lapses}×)` : "") : "0"}</td></tr>`;
  }).join("")).join("");
  return `<section><div class="vhead"><h1>Learning Engine</h1>${clsTabs()}</div>
    <div class="stats">
      <div class="stat"><span class="v mono">${intro.length}<small>/${total}</small></span><span class="l">Atome eingeführt</span></div>
      <div class="stat"><span class="v mono">${es.dueCount}</span><span class="l">fällig am ${fmt(d)}${es.backCount ? ` · ${es.backCount} im Altbestand` : ""}</span></div>
      <div class="stat"><span class="v mono">${meanR === null ? "—" : Math.round(meanR * 100) + " %"}</span><span class="l">ø Abrufwahrscheinlichkeit</span></div>
      <div class="stat"><span class="v mono">${E.log.length}</span><span class="l">Bewertungen bisher</span></div>
    </div>
    <div class="grid2">
      <div class="card"><h3>So funktioniert es</h3>
        <p class="small">Jedes Atom ist einer Stunde zugeordnet. Ab der Stunde danach erscheint es auf der Heute-Seite zur Wiederholung, z. B. als Einstiegsaufgabe. Sie bewerten, wie gut die Klasse es abrufen konnte:</p>
        <ul class="small rlist">${RATES.map(([g, l, h]) => `<li><b class="r${g}t">${l}</b> ${h} der Klasse richtig</li>`).join("")}</ul>
        <p class="small">Daraus berechnet FSRS für jedes Atom Stabilität und Schwierigkeit und legt die nächste Wiederholung so, dass die Klasse es dann noch mit der gewählten Wahrscheinlichkeit abrufen kann. Gut sitzende Atome kommen immer seltener, wackelige öfter.</p>
        ${es.pick.length ? `<button type="button" class="btn" data-act="quiz" data-k="${k}">Heutige Wiederholung als Quiz zeigen</button>` : ""}</div>
      <div class="card"><h3>Einstellungen</h3>
        <label class="row">Zielbehalt <select data-act="ret">${[0.8, 0.85, 0.9, 0.95].map(v => `<option value="${v}" ${S.settings.retention === v ? "selected" : ""}>${Math.round(v * 100)} %</option>`).join("")}</select></label>
        <p class="small muted">Höher = häufigere Wiederholungen. 85–90 % passt für die meisten Klassen.</p>
        <label class="row">Wiederholungen pro Stunde <input type="number" min="1" max="15" class="num" value="${S.settings.perLesson}" data-act="perlesson"></label>
        <p class="small muted">So viele Atome schlägt die Heute-Seite höchstens vor, etwa die Hälfte davon neu eingeführte.</p>
        <label class="row">Start der Learning Engine <input type="date" data-act="engstart" value="${esc(S.settings.engineStart || S.settings.calendar.start)}"></label>
        <p class="small muted">Atome, die vor diesem Tag eingeführt wurden, sind Altbestand: Sie kommen nicht alle auf einmal, sondern je Stunde wird mindestens eines eingestreut, bis alle einmal wiederholt sind.</p></div>
    </div>
    <div class="vhead sub"><h2>Atome</h2><div class="seg small">${[["intro", "Eingeführt"], ["all", "Alle"]].map(([v, l]) => `<button type="button" aria-selected="${UI.engFilter === v}" data-act="engfilter" data-v="${v}">${l}</button>`).join("")}</div></div>
    ${tbl ? `<div class="tscroll"><table class="eng"><thead><tr><th>Atom</th><th>Abruf heute</th><th>Stabilität</th><th>Nächste</th><th>Wdh.</th></tr></thead><tbody>${tbl}</tbody></table></div>` : `<p class="muted">Bis zum ${fmt(d)} sind laut Plan noch keine Atome eingeführt.</p>`}
  </section>`;
}

/* ---------------- views: Einstellungen ---------------- */
function viewSettings() {
  const cal = S.settings.calendar;
  const hol = (cal.holidays || []).map((h, i) => `<tr><td><input data-act="hol" data-i="${i}" data-f="name" value="${esc(h.name)}" aria-label="Name"></td><td><input type="date" data-act="hol" data-i="${i}" data-f="frm" value="${esc(h.frm)}" aria-label="von"></td><td><input type="date" data-act="hol" data-i="${i}" data-f="to" value="${esc(h.to)}" aria-label="bis"></td><td><button type="button" class="mini del" data-act="holdel" data-i="${i}" aria-label="Löschen">×</button></td></tr>`).join("");
  const fr = (cal.free || []).map((f, i) => `<tr><td><input type="date" data-act="free" data-i="${i}" data-f="date" value="${esc(f.date)}" aria-label="Datum"></td><td><input data-act="free" data-i="${i}" data-f="name" value="${esc(f.name)}" aria-label="Anlass"></td><td><button type="button" class="mini del" data-act="freedel" data-i="${i}" aria-label="Löschen">×</button></td></tr>`).join("");
  const tt = CLASSES.map(k => {
    const rows = S.cls[k].timetable.map((t, i) => `<tr>
      <td><select data-act="tt" data-k="${k}" data-i="${i}" data-f="day" aria-label="Tag">${[1, 2, 3, 4, 5].map(d => `<option value="${d}" ${+t.day === d ? "selected" : ""}>${DAYS[d]}</option>`).join("")}</select></td>
      <td><input class="num" type="number" min="1" max="10" data-act="tt" data-k="${k}" data-i="${i}" data-f="period" value="${t.period}" aria-label="Stunde"></td>
      <td><select data-act="tt" data-k="${k}" data-i="${i}" data-f="track" aria-label="Spur">${["A", "B", "SOL"].map(v => `<option ${t.track === v ? "selected" : ""}>${v}</option>`).join("")}</select></td>
      <td><input type="date" data-act="tt" data-k="${k}" data-i="${i}" data-f="frm" value="${esc(t.frm || "")}" aria-label="ab"></td>
      <td><input type="date" data-act="tt" data-k="${k}" data-i="${i}" data-f="to" value="${esc(t.to || "")}" aria-label="bis"></td>
      <td><button type="button" class="mini del" data-act="ttdel" data-k="${k}" data-i="${i}" aria-label="Löschen">×</button></td></tr>`).join("");
    return `<div class="card"><h3>Stundenplan ${esc(D.classes[k].label)}</h3>
      <div class="tscroll"><table class="form"><thead><tr><th>Tag</th><th>Std.</th><th>Spur</th><th>ab</th><th>bis</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      <button type="button" class="linkbtn" data-act="ttadd" data-k="${k}">+ Stunde hinzufügen</button>
      <p class="small muted">Spur A und B sind die beiden Stränge; im Modus „nacheinander“ zählen beide zusammen. SOL = selbstorganisiertes Lernen. „ab“/„bis“ leer = ganzes Schuljahr.</p></div>`;
  }).join("");
  const confirm = UI.confirm === "resetall";
  return `<section><div class="vhead"><h1>Einstellungen</h1></div>
    <div class="grid2">
      <div class="card"><h3>Schuljahr</h3>
        <label class="row">Erster Schultag <input type="date" data-act="cal" data-f="start" value="${esc(cal.start)}"></label>
        <label class="row">Letzter Schultag <input type="date" data-act="cal" data-f="end" value="${esc(cal.end)}"></label>
        <label class="row chk"><input type="checkbox" data-act="autobuf" ${S.settings.autoBuffer ? "checked" : ""}> Bei Mehrbedarf oder Ausfall automatisch den nächsten Puffer kürzen</label>
        <h3>Ferien</h3><div class="tscroll"><table class="form"><thead><tr><th>Name</th><th>von</th><th>bis</th><th></th></tr></thead><tbody>${hol}</tbody></table></div>
        <button type="button" class="linkbtn" data-act="holadd">+ Ferien hinzufügen</button>
        <h3>Freie Einzeltage</h3><div class="tscroll"><table class="form"><thead><tr><th>Datum</th><th>Anlass</th><th></th></tr></thead><tbody>${fr}</tbody></table></div>
        <button type="button" class="linkbtn" data-act="freeadd">+ Freien Tag hinzufügen</button>
        <p class="small muted">Quelle für Sachsen: schule.sachsen.de → Schuljahrestermine. Im neuen Schuljahr hier nur die Daten ändern; alles andere rechnet sich neu.</p></div>
      <div>${tt}</div>
    </div>
    <div class="card"><h3>Sicherung</h3>
      <p class="small">Ihre Daten werden automatisch gespeichert. Für eine zusätzliche Sicherung oder den Umzug ins nächste Schuljahr können Sie alles als Text kopieren und später wieder einspielen.</p>
      <div class="acts"><button type="button" class="btn" data-act="export">Sicherung kopieren</button><button type="button" class="btn ghost" data-act="download" id="dlbtn" hidden>Als Datei speichern</button><button type="button" class="btn ghost" data-act="engreset">Lernstand im neuen Schuljahr leeren</button></div>
      <textarea id="importbox" rows="3" placeholder="Sicherung hier einfügen …" aria-label="Sicherung einfügen"></textarea>
      <div class="acts"><button type="button" class="btn ghost" data-act="import">Sicherung einspielen</button>
      ${confirm ? `<span class="confirm"><span>Wirklich alles auf die Vorlage zurücksetzen?</span><button type="button" class="btn danger" data-act="resetall">Alles zurücksetzen</button><button type="button" class="btn ghost" data-act="confirm" data-v="">Abbrechen</button></span>` : `<button type="button" class="btn ghost" data-act="confirm" data-v="resetall">Alles zurücksetzen</button>`}</div></div>
  </section>`;
}

/* ---------------- quiz & SOL overlay ---------------- */
function renderOverlay() {
  const el = document.getElementById("overlay");
  if (UI.solOpen) {
    el.hidden = false;
    el.innerHTML = `<div class="ov-card" role="dialog" aria-label="SOL-Formate"><header><h2>SOL-Stunde: die fünf Formate</h2><button type="button" class="iconbtn" data-act="ovclose" aria-label="Schließen">×</button></header>
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
    <header><span class="chip"><b>${esc(x.code)}</b></span><span class="mono muted">${q.i + 1} / ${q.items.length}</span><button type="button" class="iconbtn" data-act="ovclose" aria-label="Schließen">×</button></header>
    <div class="qq">${esc(x.a.q)}</div>
    ${q.show ? `<div class="qa">${esc(x.a.a)}</div><div class="small muted center">${esc(x.a.t)}</div>${rateButtons(q.k, x.a.id).replace(/data-act="rate"/g, 'data-act="qrate"')}` : `<button type="button" class="btn big" data-act="qshow">Lösung zeigen <span class="muted small">(Leertaste)</span></button>`}
  </div>`;
}

/* ---------------- router & render ---------------- */
const NAV = [["heute", "Heute"], ["plan", "Jahresplan"], ["sequenz", "Sequenz"], ["einheiten", "Einheiten"], ["engine", "Learning Engine"], ["einstellungen", "Einstellungen"]];
function route() { const h = (location.hash || "#heute").slice(1); return h || "heute"; }
function render() {
  const r = route(); let html;
  const m = /^u-(kl6|kl8)-(\d+)$/.exec(r);
  if (m) { UI.cls = m[1]; html = viewUnit(m[1], +m[2]); }
  else html = ({ heute: viewToday, plan: viewPlan, sequenz: viewSeq, einheiten: viewUnits, engine: viewEngine, einstellungen: viewSettings }[r] || viewToday)();
  const active = m ? "einheiten" : r;
  document.getElementById("nav").innerHTML = NAV.map(([id, l]) => `<a href="#${id}" ${active === id ? 'aria-current="page"' : ""}>${l}</a>`).join("");
  const main = document.getElementById("main");
  const sy = window.scrollY;
  main.innerHTML = html;
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
function setSeq(k, fn) { const C = S.cls[k]; fn(C.seq); commit(k); }
document.addEventListener("click", ev => {
  const b = ev.target.closest("[data-act]"); if (!b) return;
  const a = b.dataset.act, k = b.dataset.k || UI.cls, i = +b.dataset.i;
  if (b.tagName === "SELECT" || (b.tagName === "INPUT" && b.type !== "checkbox" && b.type !== "button")) return;
  switch (a) {
    case "undo": doUndo(); break;
    case "cls": UI.cls = b.dataset.k; try { localStorage.setItem("mp-cls", UI.cls); } catch (e) {} render(); break;
    case "todaycls": UI.todayCls = b.dataset.v; try { localStorage.setItem("mp-today", UI.todayCls); } catch (e) {} render(); break;
    case "day": UI.date = addDays(UI.date, +b.dataset.n); UI.reveal = {}; render(); break;
    case "today": UI.date = todayIso(); UI.reveal = {}; render(); break;
    case "reveal": UI.reveal[b.dataset.id] = true; render(); break;
    case "rate": rate(b.dataset.k, b.dataset.id, +b.dataset.g); break;
    case "done": toggleDone(b.dataset.k, b.dataset.key); break;
    case "addhour": addHour(b.dataset.k, +b.dataset.row); break;
    case "cancel": cancelSlot(b.dataset.k, b.dataset.key); break;
    case "quiz": { const es = engineState(b.dataset.k, UI.date); UI.quiz = { k: b.dataset.k, items: es.pick.slice(), i: 0, show: false }; renderOverlay(); break; }
    case "qshow": UI.quiz.show = true; renderOverlay(); break;
    case "qrate": { const q = UI.quiz, x = q.items[q.i]; rate(q.k, x.a.id, +b.dataset.g); q.i++; q.show = false; renderOverlay(); break; }
    case "solinfo": UI.solOpen = true; renderOverlay(); break;
    case "ovclose": UI.quiz = null; UI.solOpen = false; renderOverlay(); render(); break;
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
    case "reset": S.cls[k] = Object.assign(defaultClass(k), { timetable: S.cls[k].timetable, atoms: S.cls[k].atoms, done: S.cls[k].done }); UI.confirm = null; commit(k); toast("Sequenz zurückgesetzt."); break;
    case "resetall": CLASSES.forEach(c => { S.cls[c] = defaultClass(c); S.eng[c] = defaultEngine(); save(c); save(engDoc(c)); }); S.settings = defaultSettings(); save("settings"); UI.confirm = null; touch(); render(); toast("Alles zurückgesetzt."); break;
    case "engfilter": UI.engFilter = b.dataset.v; render(); break;
    case "atomnew": UI.editAtom = { code: b.dataset.code, id: "new", l: +b.dataset.l }; render(); break;
    case "atomedit": UI.editAtom = { code: b.dataset.code, id: b.dataset.id }; render(); break;
    case "atomcancel": UI.editAtom = null; render(); break;
    case "atomdel": { const code = b.dataset.code; const list = atomsOf(k, code).filter(x => x.id !== b.dataset.id); const snap = snapshotFor(k); S.cls[k].atoms[code] = clone(list); undoStack = snap; commit(k); toast("Atom gelöscht.", true); break; }
    case "atomreset": { const snap = snapshotFor(k); delete S.cls[k].atoms[b.dataset.code]; undoStack = snap; commit(k); toast("Atome auf die Vorlage zurückgesetzt.", true); break; }
    case "holadd": S.settings.calendar.holidays.push({ name: "Ferien", frm: "", to: "" }); commit(null, { settings: true }); break;
    case "holdel": S.settings.calendar.holidays.splice(i, 1); commit(null, { settings: true }); break;
    case "freeadd": S.settings.calendar.free.push({ date: "", name: "" }); commit(null, { settings: true }); break;
    case "freedel": S.settings.calendar.free.splice(i, 1); commit(null, { settings: true }); break;
    case "ttadd": S.cls[k].timetable.push({ id: uid(), day: 1, period: 1, track: "A" }); commit(k); break;
    case "ttdel": S.cls[k].timetable.splice(i, 1); commit(k); break;
    case "engreset": { const snap = snapshotFor(UI.cls); CLASSES.forEach(c => { S.eng[c] = defaultEngine(); S.cls[c].done = {}; S.cls[c].cancelled = {}; save(engDoc(c)); save(c); }); S.settings.engineStart = S.settings.calendar.start; save("settings"); undoStack = snap; touch(); render(); toast("Lernstand, Ausfälle und Häkchen beider Klassen geleert.", false); break; }
    case "export": {
      const txt = JSON.stringify({ app: "matheplaner", v: 1, settings: S.settings, cls: S.cls, eng: S.eng });
      const box = document.getElementById("importbox");
      navigator.clipboard.writeText(txt).then(() => toast("Sicherung in die Zwischenablage kopiert."), () => { box.value = txt; box.select(); toast("Kopieren nicht erlaubt: Text ist markiert, bitte mit Strg+C kopieren."); });
      break;
    }
    case "download": {
      const txt = JSON.stringify({ app: "matheplaner", v: 1, settings: S.settings, cls: S.cls, eng: S.eng }, null, 1);
      downloads.save({ filename: `matheplaner-sicherung-${todayIso()}.json`, data: txt }).then(() => toast("Datei gespeichert."), () => toast("Speichern abgebrochen."));
      break;
    }
    case "import": {
      try {
        const o = JSON.parse(document.getElementById("importbox").value);
        if (o.app !== "matheplaner") throw 0;
        if (o.settings) applyDoc("settings", o.settings);
        CLASSES.forEach(c => { if (o.cls && o.cls[c]) applyDoc(c, o.cls[c]); if (o.eng && o.eng[c]) applyDoc(engDoc(c), o.eng[c]); save(c); save(engDoc(c)); });
        save("settings"); touch(); render(); toast("Sicherung eingespielt.");
      } catch (e) { toast("Das ist keine gültige Sicherung dieser App."); }
      break;
    }
  }
});
document.addEventListener("change", ev => {
  const t = ev.target, a = t.dataset.act; if (!a) { if (t.id === "pickdate" && t.value) { UI.date = t.value; render(); } return; }
  const k = t.dataset.k || UI.cls, i = +t.dataset.i, f = t.dataset.f;
  switch (a) {
    case "strand": setSeq(k, s => { s[i].strand = t.value; }); break;
    case "hrsset": setSeq(k, s => { s[i].hours = Math.max(0, Math.min(60, Math.round(+t.value || 0))); }); break;
    case "ret": S.settings.retention = +t.value; commit(null, { settings: true }); break;
    case "perlesson": S.settings.perLesson = Math.max(1, Math.min(15, Math.round(+t.value || 5))); commit(null, { settings: true }); break;
    case "cal": if (t.value) { S.settings.calendar[f] = t.value; commit(null, { settings: true }); } break;
    case "autobuf": S.settings.autoBuffer = t.checked; commit(null, { settings: true }); break;
    case "engstart": if (t.value) { S.settings.engineStart = t.value; commit(null, { settings: true }); } break;
    case "hol": S.settings.calendar.holidays[i][f] = t.value; commit(null, { settings: true }); break;
    case "free": S.settings.calendar.free[i][f] = t.value; commit(null, { settings: true }); break;
    case "tt": { const row = S.cls[k].timetable[i]; if (f === "day" || f === "period") row[f] = +t.value; else if (t.value) row[f] = t.value; else delete row[f]; commit(k); break; }
  }
});
document.addEventListener("submit", ev => {
  const fm = ev.target.closest(".aform"); if (!fm) return; ev.preventDefault();
  const k = UI.cls, code = fm.dataset.code, id = fm.dataset.id, fd = new FormData(fm);
  const atom = { id: id === "new" ? code + "." + uid() : id, l: Math.max(1, +fd.get("l") || 1), t: String(fd.get("t")).trim(), q: String(fd.get("q")).trim(), a: String(fd.get("a")).trim() };
  if (!atom.t) return;
  const list = clone(atomsOf(k, code)); const j = list.findIndex(x => x.id === id);
  if (j >= 0) list[j] = atom; else list.push(atom);
  list.sort((x, y) => x.l - y.l);
  S.cls[k].atoms[code] = list; UI.editAtom = null; commit(k); toast("Atom gespeichert.");
});
document.addEventListener("keydown", ev => {
  if (!UI.quiz && !UI.solOpen) return;
  if (ev.key === "Escape") { UI.quiz = null; UI.solOpen = false; renderOverlay(); render(); return; }
  if (!UI.quiz) return;
  if (ev.key === " " && !UI.quiz.show) { ev.preventDefault(); UI.quiz.show = true; renderOverlay(); }
  else if (UI.quiz.show && /^[1-4]$/.test(ev.key)) { const q = UI.quiz, x = q.items[q.i]; if (!x) return; rate(q.k, x.a.id, +ev.key); q.i++; q.show = false; renderOverlay(); }
});

/* ---------------- boot ---------------- */
let downloads = null;
window.__mp = { S, schedule, engineState, fsrsReview, lessonInfo, UI };
render.keepScroll = false;
renderBanner(); render();
if (route() === "plan") { const c = document.getElementById("curweek"); if (c) c.scrollIntoView({ block: "center" }); }
initDb();
(async () => { try { downloads = window.claude && window.claude.use ? await window.claude.use("downloads") : null; } catch (e) { downloads = null; } const dl = document.getElementById("dlbtn"); if (dl && downloads) dl.hidden = false; })();
})();
