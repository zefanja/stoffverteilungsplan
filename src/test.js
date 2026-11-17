// Headless-Test: node src/test.js [ausgabeordner-für-screenshots]
// Ohne Internet: MATHJAX_JS=/pfad/zu/mathjax/es5/tex-svg.js setzen, dann wird die CDN-Adresse dorthin umgeleitet.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const OUT = process.argv[2] || path.join(ROOT, 'docs', 'screenshots');
const ok = (c, msg) => { if (!c) { console.log('FAIL', msg); process.exitCode = 1; } else console.log('ok  ', msg); };
/* Die App wird über einen lokalen Webserver geladen statt über file://: Chromium hält localStorage bei
   file:// nicht zuverlässig (gelegentlich leer nach Neuladen), echte Nutzer verwenden https. */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
function serve(dir) {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const f = path.join(dir, decodeURIComponent(req.url.split('?')[0].split('#')[0]).replace(/^\/+/, '') || 'index.html');
      if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); rsp.end(); return; }
      rsp.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(rsp);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}
(async () => {
  const srv = await serve(path.join(ROOT, 'dist')), BASE = `http://127.0.0.1:${srv.address().port}/`;
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage();
  if (process.env.MATHJAX_JS) await ctx.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/mathjax\/.*tex-svg/, r => r.fulfill({ path: process.env.MATHJAX_JS, contentType: 'text/javascript' }));
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  // neuer Browser-Kontext = leerer Speicher; ein Neuladen später prüft, ob alles erhalten bleibt
  await p.goto(BASE + 'index.html#heute'); await p.waitForTimeout(500);
  await p.evaluate(() => { window.__mp.UI.date = '2026-11-17'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
  await p.waitForTimeout(200);

  // Einrichtungsassistent: öffnet beim ersten Start, fragt Klassen und Unterrichtszeiten ab
  ok(!(await p.$eval('#overlay', e => e.hidden)) && (await p.innerText('#overlay')).includes('Willkommen'), 'Assistent öffnet beim ersten Start');
  await p.click('#overlay [data-act="obstep"][data-v="1"]'); await p.waitForTimeout(100);
  ok((await p.$$('#overlay [data-act="mine"]')).length === 19 && (await p.$$('#overlay [data-act="mine"]:checked')).length === 2, 'Schritt Klassen: 19 Klassen, GYM 6 und 8 vorausgewählt');
  await p.screenshot({ path: path.join(OUT, 's_assistent_klassen.png') });
  await p.click('#overlay [data-act="obstep"][data-v="2"]'); await p.waitForTimeout(100);
  ok((await p.$$('#overlay .obgrid')).length === 2, 'Schritt Unterrichtszeiten: ein Wochenraster je Klasse');
  const ttBefore = await p.evaluate(() => window.__mp.S.cls.kl6.groups[0].tt[0].lessons.length);
  await p.click('#overlay [data-act="obcell"][data-g="kl6.a"][data-d="2"][data-p="7"]'); await p.waitForTimeout(80);
  const ttMid = await p.evaluate(() => window.__mp.S.cls.kl6.groups[0].tt[0].lessons.length);
  ok(ttMid === ttBefore + 1, 'Klick ins Raster legt eine Stunde an (Di, 7. Std.)');
  await p.screenshot({ path: path.join(OUT, 's_assistent_zeiten.png') });
  // kl6 läuft in Strängen: Spur A → B → frei
  await p.click('#overlay [data-act="obcell"][data-g="kl6.a"][data-d="2"][data-p="7"]'); await p.waitForTimeout(50);
  await p.click('#overlay [data-act="obcell"][data-g="kl6.a"][data-d="2"][data-p="7"]'); await p.waitForTimeout(50);
  ok(await p.evaluate(n => window.__mp.S.cls.kl6.groups[0].tt[0].lessons.length === n, ttBefore), 'Weitere Klicks wechseln die Spur und entfernen die Stunde wieder');
  // Zwei Stunden direkt nacheinander in derselben Spur werden zur Doppelstunde
  const cell = (d, pp) => p.click(`#overlay [data-act="obcell"][data-g="kl6.a"][data-d="${d}"][data-p="${pp}"]`).then(() => p.waitForTimeout(50));
  const di = () => p.evaluate(() => window.__mp.S.cls.kl6.groups[0].tt[0].lessons.filter(l => +l.day === 2).map(l => `${l.period}${l.track}${l.len === 2 ? '×2' : ''}`).join(','));
  await cell(2, 6); await cell(2, 7); const ob1 = await di();
  const ob1ui = await p.evaluate(() => [!!document.querySelector('#overlay [data-p="6"][data-d="2"].dtop'), !!document.querySelector('#overlay [data-p="7"][data-d="2"].dbot')]);
  await cell(2, 7); const ob2 = await di();          // 7. Std. wechselt nach B: keine Doppelstunde mehr
  await cell(2, 7); const ob3 = await di();          // 7. Std. frei
  await cell(2, 8); await cell(2, 7); const ob4 = await di();   // drei Stunden A hintereinander: 6+7 Doppel, 8 einzeln
  for (const pp of [8, 7, 6]) { await cell(2, pp); await cell(2, pp); }
  const ob5 = await di();
  ok(ob1 === '6A×2' && ob1ui.every(Boolean) && ob2 === '6A,7B' && ob3 === '6A' && ob4 === '6A×2,8A' && ob5 === '', 'Assistent: zwei Stunden nacheinander in derselben Spur werden zur Doppelstunde ' + JSON.stringify([ob1, ob1ui, ob2, ob3, ob4, ob5]));
  await p.click('#overlay [data-act="obstep"][data-v="3"]'); await p.waitForTimeout(80);
  await p.click('#overlay [data-act="obdone"]'); await p.waitForTimeout(150);
  ok(await p.evaluate(() => document.getElementById('overlay').hidden && window.__mp.S.settings.onboarded && JSON.stringify(window.__mp.cal().classes) === '["kl6","kl8"]'), 'Assistent beendet: Klassen festgelegt');
  await p.evaluate(() => { window.__mp.UI.date = '2026-11-17'; window.dispatchEvent(new HashChangeEvent('hashchange')); }); await p.waitForTimeout(150);

  // Ausgangsplan: Kapazitäten wie bisher
  const r = await p.evaluate(() => { const m = window.__mp; const out = {};
    for (const k of ['kl6', 'kl8']) { const sc = m.schedule(k); out[k] = { cap: sc.cap, planned: sc.planned }; }
    return out; });
  console.log(JSON.stringify(r));
  ok(r.kl6.cap.A === r.kl6.planned.A, 'Kl. 6 geht auf');
  ok(r.kl8.cap.A === r.kl8.planned.A && r.kl8.cap.SOL > 0, 'Kl. 8 geht auf, SOL ab 26.10.');

  // Formelsatz: Formeln werden als <span class="m" data-tex> ausgezeichnet und mit MathJax als SVG gesetzt
  ok(await p.evaluate(() => { const h = document.createElement('div'); h.innerHTML = window.__mp.mx('2 1/4 + x² = 0,3̅'); const m = h.querySelector('span.m'); return m && m.dataset.tex === '2\\frac{1}{4} + x^{2} = 0{,}\\overline{3}'; }), 'Formel-Erkennung: gemischte Zahl, Hochzahl, Periode');
  ok(await p.evaluate(() => !window.__mp.mx('2*(x+1)^2').includes('span') && !window.__mp.mx('z. B. Skizze').includes('span')), 'CAS-Eingaben und Abkürzungen bleiben Text');
  const mjOk = await p.waitForFunction(() => window.MathJax && window.MathJax.tex2svg, null, { timeout: 20000 }).then(() => true, () => false);
  if (mjOk) {
    await p.waitForTimeout(300);
    ok(await p.evaluate(() => document.querySelectorAll('#main span.m.mj svg').length > 0 && document.querySelectorAll('#main span.m:not(.mj)').length === 0), 'MathJax setzt alle Formeln der Seite als SVG');
  } else console.log('info MathJax nicht erreichbar: Formeln bleiben als Text (MATHJAX_JS setzen, um den Satz zu testen)');

  // Design: Seitenleiste mit Logo, Kacheln, Lernübersicht
  ok((await p.innerText('#nav')).includes('Lernübersicht') && !(await p.innerText('#nav')).includes('Engine'), 'Navigation heißt „Lernübersicht“');
  ok(await p.evaluate(() => [...document.querySelectorAll('.side img')].every(i => i.complete && i.naturalWidth > 0)), 'Logo und Felszeichen werden geladen');
  ok((await p.$$('.tiles .tile')).length === 4, 'Heute zeigt vier Kennzahl-Kacheln');
  // Klassen-Umschalter oben
  ok((await p.$$('.tcard')).length === 1, 'Heute zeigt nur die gewählte Klasse');
  await p.click('#ctx [data-k="kl8"]'); await p.waitForTimeout(100);
  ok((await p.innerText('.tcard h2')) === 'Klasse 8', 'Umschalter: Heute zeigt Klasse 8');
  for (const h of ['plan', 'sequenz', 'einheiten', 'lernuebersicht', 'einstellungen']) {
    await p.evaluate(h => location.hash = h, h); await p.waitForTimeout(150);
    ok((await p.innerText('main')).includes('Klasse 8'), `${h} folgt der gewählten Klasse`);
  }
  // Schulart-Umschalter: Oberschule hat noch keinen Lehrplan
  ok((await p.$$('#ctx .grades button')).length === 8 && (await p.$$('#ctx .grades button[disabled]')).length === 6, 'GYM: Klassen 5–12, nur 6 und 8 wählbar');
  await p.click('#ctx [data-act="type"][data-v="os"]'); await p.waitForTimeout(100);
  ok((await p.$$('#ctx .grades button')).length === 6 && (await p.$$('#ctx .grades button[disabled]')).length === 6, 'OS: Klassen 5–10, ohne eigene Klasse keine wählbar');
  ok((await p.innerText('main')).includes('keine Klasse der Schulart Oberschule'), 'OS: Hinweis statt Plan (keine eigene OS-Klasse)');
  await p.evaluate(() => location.hash = 'heute'); await p.waitForTimeout(100);
  ok((await p.innerText('main')).includes('keine Klasse der Schulart Oberschule'), 'OS: Heute zeigt Hinweis');
  await p.click('#ctx [data-act="type"][data-v="gym"]'); await p.waitForTimeout(100);
  ok((await p.innerText('.tcard h2')) === 'Klasse 8', 'Zurück zu GYM: Klasse 8 wieder gewählt');
  await p.click('[data-act="todaycls"][data-v="all"]').catch(() => {});
  await p.evaluate(() => location.hash = 'heute'); await p.waitForTimeout(100);
  await p.click('[data-act="todaycls"][data-v="all"]'); await p.waitForTimeout(100);
  ok((await p.$$('.tcard')).length === 2, 'Heute: „Alle Klassen“ zeigt beide');
  ok((await p.$$('.tiles')).length === 0, 'Bei „Alle meine Klassen“ keine Kacheln');
  await p.click('[data-act="todaycls"][data-v="one"]'); await p.waitForTimeout(100);

  // Stundenplan-Zeiträume
  await p.evaluate(() => location.hash = 'einstellungen'); await p.waitForTimeout(150);
  ok((await p.$$('.ttv')).length === 2, 'Kl. 8 hat zwei Stundenplan-Zeiträume');
  await p.screenshot({ path: path.join(OUT, 's_einstellungen.png'), fullPage: true });
  const capBefore = await p.evaluate(() => window.__mp.schedule('kl8').cap.A);
  await p.fill('#ttnewfrm', '2027-02-22'); await p.click('[data-act="ttnew"]'); await p.waitForTimeout(100);
  ok((await p.$$('.ttv')).length === 3, 'Neuer Zeitraum ab 22.02.2027 angelegt');
  // im neuen Zeitraum eine Stunde löschen -> weniger Kapazität
  const vid = await p.evaluate(() => window.__mp.S.cls.kl8.groups[0].tt.find(v => v.frm === '2027-02-22').id);
  await p.click(`[data-act="tldel"][data-v="${vid}"][data-i="0"]`); await p.waitForTimeout(100);
  const capAfter = await p.evaluate(() => window.__mp.schedule('kl8').cap.A);
  ok(capAfter < capBefore, `Kapazität sinkt nach Stundenplanwechsel (${capBefore} -> ${capAfter})`);
  // Zeitraum ohne Unterricht
  await p.click('[data-act="offadd"]'); await p.waitForTimeout(50);
  await p.fill('[data-act="off"][data-i="0"][data-f="name"]', 'Praktikum'); await p.dispatchEvent('[data-act="off"][data-i="0"][data-f="name"]', 'change');
  await p.fill('[data-act="off"][data-i="0"][data-f="frm"]', '2027-03-01'); await p.dispatchEvent('[data-act="off"][data-i="0"][data-f="frm"]', 'change');
  await p.fill('[data-act="off"][data-i="0"][data-f="to"]', '2027-03-05'); await p.dispatchEvent('[data-act="off"][data-i="0"][data-f="to"]', 'change');
  await p.waitForTimeout(100);
  const off = await p.evaluate(() => { const sc = window.__mp.schedule('kl8'); return [sc.dayInfo['2027-03-02'], (sc.byDate['2027-03-02'] || []).length, sc.cap.A]; });
  ok(off[0] && off[0].note === 'Praktikum' && off[1] === 0 && off[2] < capAfter, 'Praktikumswoche: kein Unterricht, Kapazität sinkt');

  // Migration alter Stundenpläne
  const mig = await p.evaluate(() => window.__mp.ttFromLegacy([{ day: 1, period: 2, track: 'A' }, { day: 5, period: 3, track: 'B', to: '2026-10-25' }, { day: 5, period: 3, track: 'SOL', frm: '2026-10-26' }], '2026-08-17')
    .map(v => v.frm + ':' + v.lessons.map(l => l.day + l.track).join(',')));
  ok(JSON.stringify(mig) === JSON.stringify(['2026-08-17:1A,5B', '2026-10-26:1A,5SOL']), 'Alte Stundenplanzeilen werden zu Zeiträumen: ' + mig.join(' | '));
  const migS = await p.evaluate(() => { const m = window.__mp; const keep = JSON.stringify(m.S.settings);
    m.applyDoc('settings', { calendar: { start: '2026-08-17', end: '2027-07-09', holidays: [], free: [] }, engineStart: '2026-11-01', retention: 0.85 });
    const y = m.S.settings.years; const res = [y.length, y[0].id, y[0].legacyDocs, y[0].engineStart, m.S.settings.retention];
    m.applyDoc('settings', JSON.parse(keep)); return res; });
  ok(JSON.stringify(migS) === JSON.stringify([1, '2026-27', true, '2026-11-01', 0.85]), 'Alte Einstellungen werden zum Schuljahr 2026/27');

  // Ferien Sachsen: eingebaute Termine ergeben genau den bisherigen Kalender
  const fer = await p.evaluate(() => { const m = window.__mp; const y = m.sachsenYear(2026, window.PLAN_DATA.ferienSN); const c = window.PLAN_DATA.calendar;
    const key = o => JSON.stringify([o.start, o.end, o.holidays.map(h => [h.name, h.frm, h.to]), o.free.map(f => f.date)]);
    return [key(y) === key(c), JSON.stringify(m.sachsenYear(2027, window.PLAN_DATA.ferienSN))]; });
  ok(fer[0], 'Ferien Sachsen 2026/27 aus den eingebauten Daten = bisheriger Kalender');
  console.log('     2027/28:', fer[1]);

  // Neues Schuljahr anlegen
  await p.selectOption('#newyear', '2027-28'); await p.click('[data-act="yearadd"]'); await p.waitForTimeout(300);
  const ny = await p.evaluate(() => { const m = window.__mp; const Y = m.cal(); const sc = m.schedule('kl8');
    return { id: Y.id, start: Y.start, end: Y.end, hol: Y.holidays.length, tt: m.S.cls.kl8.groups[0].tt.map(v => v.frm + ':' + v.lessons.length), off: m.S.cls.kl8.groups[0].off.length, cap: sc.cap, planned: sc.planned, years: m.S.settings.years.map(y => y.id) }; });
  console.log('     ', JSON.stringify(ny));
  ok(ny.id === '2027-28' && ny.start === '2027-08-23' && ny.end === '2028-07-21', 'Schuljahr 2027/28 mit Ferien Sachsen angelegt');
  ok(ny.tt.length === 1 && ny.tt[0] === '2027-08-23:3' && ny.off === 0, 'Letzter Stundenplan übernommen, ab Schuljahresbeginn');
  ok((await p.inputValue('#yearsel')) === '2027-28', 'Schuljahr-Auswahl oben zeigt 2027/28');
  await p.selectOption('#yearsel', '2026-27'); await p.waitForTimeout(150);
  ok(await p.evaluate(() => window.__mp.cal().id === '2026-27'), 'Zurück zu 2026/27');

  // Ferienimport ins aktuelle Jahr
  await p.evaluate(() => { window.__mp.cal().holidays = []; window.__mp.cal().free = []; location.hash = 'heute'; location.hash = 'einstellungen'; });
  await p.waitForTimeout(150);
  await p.click('[data-act="confirm"][data-v="ferien"]'); await p.waitForTimeout(50);
  await p.click('[data-act="ferien"]'); await p.waitForTimeout(200);
  ok(await p.evaluate(() => window.__mp.cal().holidays.length === 5 && window.__mp.cal().free.length === 5), 'Ferien Sachsen importieren füllt Ferien und freie Tage (mit zwei HA-Tagen)');
  // HA-Tage: die zwei Schultage nach dem Buß- und Bettag, in jedem Schuljahr; einmalig auch in gespeicherten Jahren
  const ha = await p.evaluate(() => { const M = window.__mp, src = window.PLAN_DATA.ferienSN, out = {};
    for (const y0 of [2025, 2026, 2027, 2028, 2029]) { const Y = M.sachsenYear(y0, src); if (!Y) continue;
      const bb = Y.free.find(f => /Buß/.test(f.name)), h = Y.free.filter(f => f.name === 'HA-Tag').map(f => f.date);
      out[y0] = bb && h.length === 2 && h[0] > bb.date && new Date(h[0]).getDay() !== 0 ? h.join('+') : 'FEHLT'; }
    const keep = JSON.parse(JSON.stringify(M.S.settings)), old = JSON.parse(JSON.stringify(keep));
    old.years.forEach(y => { delete y.haDays; y.free = y.free.filter(f => f.name !== 'HA-Tag'); });
    M.applyDoc('settings', old); const mig = M.S.settings.years.find(y => y.id === '2026-27').free.filter(f => f.name === 'HA-Tag').map(f => f.date).join('+');
    const del = { free: [{ date: '2026-11-18', name: 'Buß- und Bettag' }], holidays: [], haDays: true }; M.addHaDays(del);
    M.S.settings = keep; M.touch();
    return { out, mig, keepDeleted: del.free.length === 1 }; });
  ok(Object.values(ha.out).length === 5 && !Object.values(ha.out).includes('FEHLT') && ha.out[2026] === '2026-11-19+2026-11-20' && ha.mig === '2026-11-19+2026-11-20' && ha.keepDeleted, 'HA-Tage nach dem Buß- und Bettag in allen Schuljahren, gespeicherte Jahre einmal ergänzt ' + JSON.stringify(ha));

  for (const h of ['heute', 'plan', 'sequenz', 'einheiten', 'lernuebersicht', 'u-kl8-3']) { await p.evaluate(h => location.hash = h, h); await p.waitForTimeout(200); await p.screenshot({ path: path.join(OUT, `s_${h === 'heute' ? 'today' : h === 'lernuebersicht' ? 'engine' : h}.png`) }); }
  await p.evaluate(() => { location.hash = 'heute'; }); await p.waitForTimeout(200);
  const before = await p.evaluate(() => JSON.stringify(window.__mp.S.cls.kl8.groups[0].adj));
  const btn = await p.$('[data-act="addhour"]'); if (btn) { await btn.click(); await p.waitForTimeout(100); }
  const after = await p.evaluate(() => JSON.stringify(window.__mp.S.cls.kl8.groups[0].adj));
  ok(!btn || before !== after, 'Einheit braucht 1 Std. mehr');
  await p.setViewportSize({ width: 400, height: 800 }); await p.waitForTimeout(200);
  const sw = await p.evaluate(() => document.documentElement.scrollWidth);
  ok(sw <= 400, 'Keine horizontale Scrollbar bei 400 px (' + sw + ')');
  await p.screenshot({ path: path.join(OUT, 's_mobile.png') });
  // Parallelklassen: gemeinsame Sequenz, eigener Stundenplan, eigene Abweichungen und eigener Lernstand
  await p.setViewportSize({ width: 1280, height: 900 });
  await p.evaluate(() => location.hash = 'einstellungen'); await p.waitForTimeout(150);
  await p.selectOption('[data-act="gcount"][data-k="kl8"]', '2'); await p.waitForTimeout(150);
  ok(await p.evaluate(() => window.__mp.S.cls.kl8.groups.length === 2), 'Parallelklasse 8b angelegt');
  await p.fill('[data-act="gname"][data-g="kl8.a"]', '8a'); await p.dispatchEvent('[data-act="gname"][data-g="kl8.a"]', 'change');
  await p.fill('[data-act="gname"][data-g="kl8.b"]', '8b'); await p.dispatchEvent('[data-act="gname"][data-g="kl8.b"]', 'change'); await p.waitForTimeout(100);
  ok((await p.innerText('#ctx')).includes('8a') && (await p.innerText('#ctx')).includes('8b'), 'Leiste zeigt 8a | 8b');
  ok(await p.evaluate(() => window.__mp.UI.gid.kl8 === 'b'), 'Neue Parallelklasse ist gewählt');
  await p.screenshot({ path: path.join(OUT, 's_parallel.png'), fullPage: true });
  // Stundenplan nur für 8b ändern: erste Stunde des letzten Zeitraums löschen
  const vb = await p.evaluate(() => { const g = window.__mp.S.cls.kl8.groups[1]; return g.tt[g.tt.length - 1].id; });
  await p.click(`[data-act="tldel"][data-v="${vb}"][data-i="0"]`); await p.waitForTimeout(100);
  const caps = await p.evaluate(() => [window.__mp.schedule('kl8.a').cap.A, window.__mp.schedule('kl8.b').cap.A, window.__mp.S.cls.kl8.groups[0].tt.map(v => v.lessons.length).join()]);
  ok(caps[1] < caps[0], `Eigener Stundenplan: 8b hat weniger Stunden (${caps[0]} / ${caps[1]}), 8a unverändert (${caps[2]})`);
  // Sequenz einmal ändern -> beide folgen
  await p.evaluate(() => location.hash = 'sequenz'); await p.waitForTimeout(150);
  const pl0 = await p.evaluate(() => [window.__mp.schedule('kl8.a').planned.A, window.__mp.schedule('kl8.b').planned.A]);
  await p.click('[data-act="hrs"][data-i="1"][data-n="1"]'); await p.waitForTimeout(100);
  const pl1 = await p.evaluate(() => [window.__mp.schedule('kl8.a').planned.A, window.__mp.schedule('kl8.b').planned.A]);
  ok(pl1[0] === pl0[0] + 1 && pl1[1] === pl0[1] + 1, 'Gemeinsame Sequenz: +1 Std. wirkt in 8a und 8b');
  // Mehrbedarf nur in 8b
  await p.evaluate(() => { window.__mp.UI.date = '2026-11-17'; location.hash = 'heute'; }); await p.waitForTimeout(150);
  const hb = await p.$('[data-act="addhour"]');
  if (hb) { await hb.click(); await p.waitForTimeout(100); }
  const adj = await p.evaluate(() => [JSON.stringify(window.__mp.S.cls.kl8.groups[0].adj), Object.keys(window.__mp.S.cls.kl8.groups[1].adj).length]);
  ok(!hb || adj[1] > 0, 'Mehrbedarf in 8b wird als Abweichung von 8b gespeichert');
  await p.evaluate(() => location.hash = 'sequenz'); await p.waitForTimeout(150);
  ok(!hb || (await p.innerText('main')).includes('8b: +1'), 'Sequenz zeigt die Abweichung „8b: +1“');
  // Lernstand je Parallelklasse
  await p.evaluate(() => { const m = window.__mp; m.UI.date = '2027-01-20'; location.hash = 'heute'; }); await p.waitForTimeout(150);
  const rv = await p.$('[data-act="reveal"]');
  if (rv) { await rv.click(); await p.waitForTimeout(80); await p.click('[data-act="rate"][data-g="3"]'); await p.waitForTimeout(80); }
  const eng = await p.evaluate(() => [Object.keys(window.__mp.S.eng['kl8.a'].cards).length, Object.keys(window.__mp.S.eng['kl8.b'].cards).length]);
  ok(!rv || eng[1] > eng[0], `Bewertung landet nur im Lernstand von 8b (${eng[0]} / ${eng[1]})`);
  await p.click('[data-act="todaycls"][data-v="all"]'); await p.waitForTimeout(100);
  ok((await p.$$('.tcard')).length === 3, 'Alle meine Klassen: Klasse 6, 8a, 8b');
  await p.click('[data-act="todaycls"][data-v="one"]'); await p.waitForTimeout(100);
  await p.click('#ctx [data-act="grp"][data-g="kl8.a"]'); await p.waitForTimeout(100);
  ok((await p.innerText('.tcard h2')) === '8a', 'Umschalten auf 8a');
  // Meine Klassen: Klasse 6 abwählen
  await p.evaluate(() => location.hash = 'einstellungen'); await p.waitForTimeout(150);
  await p.uncheck('[data-act="mine"][data-k="kl6"]'); await p.waitForTimeout(150);
  ok(await p.evaluate(() => JSON.stringify(window.__mp.cal().classes) === '["kl8"]'), 'Meine Klassen 2026/27: nur Klasse 8');
  ok(await p.$$eval('#ctx .grades button', bs => bs.some(e => e.textContent === '6' && e.disabled && /nicht zu deinen Klassen/.test(e.title))), 'Leiste: Klasse 6 ausgegraut');
  await p.evaluate(() => location.hash = 'heute'); await p.waitForTimeout(150);
  await p.click('[data-act="todaycls"][data-v="all"]'); await p.waitForTimeout(100);
  ok(JSON.stringify(await p.$$eval('.tcard h2', hs => hs.map(h => h.textContent))) === JSON.stringify(['GYM · 8a', 'GYM · 8b']), 'Alle meine Klassen: nur 8a und 8b');
  await p.click('[data-act="todaycls"][data-v="one"]'); await p.waitForTimeout(100);
  await p.evaluate(() => location.hash = 'einstellungen'); await p.waitForTimeout(150);
  await p.selectOption('[data-act="gcount"][data-k="kl8"]', '1'); await p.waitForTimeout(100);
  ok(await p.$('[data-act="gdel"][data-k="kl8"]') !== null, 'Zurück auf 1 Klasse fragt nach');
  await p.click('[data-act="confirm"][data-v=""]'); await p.waitForTimeout(100);
  await p.check('[data-act="mine"][data-k="kl6"]'); await p.waitForTimeout(150);
  ok(await p.evaluate(() => window.__mp.S.cls.kl8.groups.length === 2 && window.__mp.cal().classes.length === 2), 'Klasse 6 wieder dabei, 8b bleibt erhalten');
  await p.screenshot({ path: path.join(OUT, 's_meineklassen.png'), fullPage: true });

  await p.waitForTimeout(900);

  // Quiz im Vollbild, am Ende zurück
  await p.evaluate(() => { window.__mp.UI.date = '2027-01-20'; location.hash = 'heute'; }); await p.waitForTimeout(150);
  const qb = await p.$('[data-act="quiz"]');
  if (qb) {
    await qb.click(); await p.waitForTimeout(300);
    ok(await p.evaluate(() => document.fullscreenElement && document.fullscreenElement.id === 'overlay'), 'Quiz öffnet im Vollbild');
    for (let i = 0; i < 20; i++) {
      if (await p.$('.ov-card.quiz h2')) break;
      await p.keyboard.press('Space'); await p.waitForTimeout(60); await p.keyboard.press('3'); await p.waitForTimeout(120);
    }
    await p.waitForTimeout(300);
    ok(await p.evaluate(() => !document.fullscreenElement) && (await p.innerText('#overlay')).includes('Fertig'), 'Am Ende des Quiz zurück im normalen Modus');
    await p.click('#overlay [data-act="ovclose"]'); await p.waitForTimeout(100);
    // Abbrechen mitten im Quiz verlässt das Vollbild ebenfalls
    const qb2 = await p.$('[data-act="quiz"]');
    if (qb2) { await qb2.click(); await p.waitForTimeout(300); await p.click('#overlay [data-act="ovclose"]'); await p.waitForTimeout(300);
      ok(await p.evaluate(() => !document.fullscreenElement && document.getElementById('overlay').hidden), 'Quiz schließen verlässt das Vollbild'); }
  } else ok(false, 'Quiz-Knopf fehlt');

  // Schwierigkeitsstufen nach Stabilität
  const lv = await p.evaluate(() => {
    const m = window.__mp, g = 'kl8.a', d = '2027-01-20', es0 = m.engineState(g, d), x0 = es0.list.find(x => x.a.q2);
    if (!x0) return ['kein Atom'];
    const id = x0.a.id, E = m.S.eng[g], keep = E.cards[id];
    const t = c => { if (c) E.cards[id] = c; else delete E.cards[id]; m.S.cls.kl8.atoms = Object.assign({}, m.S.cls.kl8.atoms); window.__mp.touch && 0; return null; };
    const at = (c) => { t(c); const L = m.__lv(g, d, id); return L; };
    const r = [at(null), at({ s: 10, d: 5, reps: 3, lapses: 0, last: '2027-01-15', due: '2027-01-25' }), at({ s: 40, d: 5, reps: 5, lapses: 0, last: '2027-01-18', due: '2027-02-28' }), at({ s: 40, d: 5, reps: 5, lapses: 1, last: '2027-01-18', due: '2027-02-28', lastG: 1 })];
    t(keep); return r;
  });
  ok(JSON.stringify(lv.map(x => x && x.l)) === JSON.stringify([1, 2, 3, 1]), 'Stufe nach Stabilität: neu 1, 10 Tage 2, 40 Tage 3, nach „Nochmal“ 1 ' + JSON.stringify(lv.map(x => x && x.q)));

  // Aufgabengeneratoren aus Anemo: Atome mit Feld g bekommen erzeugte Aufgaben statt fester Fragen
  const gen = await p.evaluate(() => { const M = window.__mp, A = window.ANEMO, C = window.PLAN_DATA.classes;
    if (!A) return { err: 'generators.js nicht geladen' };
    const withG = Object.values(C).flatMap(c => Object.values(c.units).flatMap(u => u.atoms)).filter(a => a.g);
    const g = 'kl8.a', d = '2027-01-20', x = M.engineState(g, d).list.find(y => y.a.g);
    if (!x) return { err: 'kein Atom mit Generator in kl8' };
    const t1 = M.shownTask(g, x.a, 1), t1b = M.shownTask(g, x.a, 1), sk = g + '|' + x.a.id;
    let fresh = false; for (let i = 0; i < 5 && !fresh; i++) { M.genSeq[sk] = (M.genSeq[sk] || 0) + 1; fresh = M.shownTask(g, x.a, 1).g !== t1.g; }
    return { ids: A.ids.length, withG: withG.length, missing: withG.flatMap(a => [].concat(a.g)).filter(id => !A.hasGenerator(id)).length,
      stable: t1.g === t1b.g, fresh, levels: [1, 2, 3].map(l => { const t = M.shownTask(g, x.a, l); return t.l === l && !!t.g && !!t.g.prompt; }) }; });
  ok(gen.ids === 194 && gen.withG > 300 && gen.missing === 0 && gen.stable && gen.fresh && gen.levels.every(Boolean), 'Generatoren: 194 geladen, über 300 Atome zugeordnet, Aufgabe bleibt stehen, „Neue Aufgabe“ erzeugt eine andere, alle drei Stufen ' + JSON.stringify(gen));
  // Quiz zeigt erzeugte Aufgabe, N erzeugt eine neue, Lösung mit Antwort
  const qd = await p.evaluate(() => { const M = window.__mp, g = 'kl8.a';
    // ein Tag, an dem die heutige Wiederholung ein Atom mit Generator enthält
    for (let t = Date.parse('2026-10-01'); t < Date.parse('2027-06-30'); t += 864e5) { const d = new Date(t).toISOString().slice(0, 10);
      if (M.engineState(g, d).pick.some(x => M.hasGen(x.a))) { M.UI.cls = 'kl8'; M.UI.gid.kl8 = 'a'; M.UI.date = d; location.hash = 'lernuebersicht'; return d; } }
    return null; });
  await p.waitForTimeout(200);
  const qb3 = await p.$('[data-act="quiz"]');
  if (qb3) {
    await qb3.click(); await p.waitForTimeout(300);
    let found = false;
    for (let i = 0; i < 20 && !found; i++) {
      if (await p.$('.ov-card.quiz h2')) break;
      if (await p.$('.qq.gen')) { found = true; break; }
      await p.keyboard.press('Space'); await p.waitForTimeout(60); await p.keyboard.press('3'); await p.waitForTimeout(120);
    }
    if (found) {
      const q1 = await p.innerText('.qq.gen'); let q2 = q1;
      for (let i = 0; i < 5 && q2 === q1; i++) { await p.keyboard.press('n'); await p.waitForTimeout(120); q2 = await p.innerText('.qq.gen'); }
      await p.keyboard.press('Space'); await p.waitForTimeout(150);
      const ans = await p.$('.qa.gen .gans'), mathOk = await p.evaluate(() => !document.querySelector('.qq.gen span.m:not(.mj)') || !window.MathJax || !window.MathJax.tex2svg);
      ok(q1 !== q2 && !!ans && mathOk, 'Quiz: erzeugte Aufgabe, N tauscht sie aus, Lösung wird angezeigt, Formeln gesetzt ' + JSON.stringify([q1.slice(0, 60), q2.slice(0, 60)]));
      await p.screenshot({ path: path.join(OUT, 's_quiz_generator.png') });
    } else ok(false, 'Quiz enthält keine erzeugte Aufgabe');
    await p.click('#overlay [data-act="ovclose"]'); await p.waitForTimeout(200);
  } else ok(false, 'Quiz-Knopf fehlt (Lernübersicht)');
  // Atom-Editor: Generator wählbar; „feste Fragen“ schaltet ihn ab, Zurücksetzen holt die Vorlage zurück
  await p.evaluate(() => { window.__mp.UI.cls = 'kl8'; location.hash = 'u-kl8-' + window.PLAN_DATA.classes.kl8.unitOrder.indexOf('T2'); }); await p.waitForTimeout(200);
  await p.click('[data-act="atomedit"][data-id="T2.2"]'); await p.waitForTimeout(150);
  const selV = await p.$eval('.aform select[name="g"]', s => s.value);
  await p.selectOption('.aform select[name="g"]', ''); await p.click('.aform button[type="submit"]'); await p.waitForTimeout(200);
  const offG = await p.evaluate(() => { const a = window.__mp.atomsOf('kl8', 'T2').find(a => a.id === 'T2.2'); return [a.g, window.__mp.hasGen(a)]; });
  await p.click('[data-act="atomreset"][data-code="T2"]'); await p.waitForTimeout(200);
  const backG = await p.evaluate(() => window.__mp.hasGen(window.__mp.atomsOf('kl8', 'T2').find(a => a.id === 'T2.2')));
  ok(selV === 'algebra__ausmultiplizieren_distributiv' && offG[0] === '' && offG[1] === false && backG, 'Atom-Editor: Generator auswählen und abschalten, Zurücksetzen stellt ihn wieder her ' + JSON.stringify([selV, offG, backG]));

  // Doppelstunden: in der Einheit und auf der Heute-Seite ein Block; Atome zwischen Stunden verschieben
  const dsetup = await p.evaluate(() => { const M = window.__mp, G = M.S.cls.kl6.groups[0];
    window.__ttKeep = JSON.stringify(G.tt);
    G.tt = [{ id: 'dbl', frm: M.cal().start, lessons: [{ day: 1, period: 3, track: 'A' }, { day: 3, period: 2, track: 'B' }, { day: 4, period: 3, len: 2, track: 'A' }] }];
    M.UI.cls = 'kl6'; M.UI.type = 'gym'; M.UI.gid.kl6 = 'a'; M.touch();
    const sc = M.schedule('kl6.a'), pair = sc.slots.find((s, i) => { const n = sc.slots[i + 1]; return n && n.date === s.date && s.lesson && n.lesson && s.lesson.row === n.lesson.row && s.track === 'A'; });
    return { blocks: M.unitBlocks('kl6.a', 'A1').blocks, day: pair && pair.date, code: pair && pair.lesson.row.code }; });
  ok(JSON.stringify(dsetup.blocks) === '[[1],[2,3],[4],[5]]' && !!dsetup.day, 'Doppelstunde: Stunden 2 und 3 von A1 bilden einen Block ' + JSON.stringify(dsetup));
  await p.evaluate(() => { location.hash = 'u-kl6-' + window.PLAN_DATA.classes.kl6.unitOrder.indexOf('A1'); }); await p.waitForTimeout(200);
  const ublk = await p.evaluate(() => { const L = [...document.querySelectorAll('.lesson[data-drop]')]; return { n: L.length, dbl: document.querySelectorAll('.lesson.dbl').length, dates: L.map(x => x.querySelector('.lhead > span:last-child').textContent.trim()) }; });
  ok(ublk.n === 4 && ublk.dbl === 1 && new Set(ublk.dates.map(d => d.slice(0, 11))).size === 4, 'Einheit: jeder Block mit eigenem Termin, Doppelstunde einmal ' + JSON.stringify(ublk));
  // ↑ schiebt das erste Atom der Doppelstunde in Stunde 1, Ziehen schiebt es zurück
  const mv1 = await p.evaluate(() => { const b = document.querySelector('.lesson.dbl [data-act="atommove"][data-l="1"]'); const id = b.dataset.id; b.click(); return { id, l: window.__mp.atomsOf('kl6', 'A1').find(a => a.id === id).l }; });
  await p.waitForTimeout(200);
  await p.dragAndDrop(`li.atom[data-id="${mv1.id}"]`, '.lesson.dbl', { targetPosition: { x: 40, y: 12 } });
  await p.waitForTimeout(200);
  const mv2 = await p.evaluate(id => window.__mp.atomsOf('kl6', 'A1').find(a => a.id === id).l, mv1.id);
  ok(mv1.l === 1 && mv2 === 2, 'Atom verschieben: ↑ in die vorige Stunde, Ziehen zurück in die Doppelstunde ' + JSON.stringify([mv1, mv2]));
  await p.click('[data-act="atomreset"][data-code="A1"]'); await p.waitForTimeout(150);
  // Heute: eine Doppelstunde derselben Einheit ist ein Block; gehalten und Ausfall gelten für beide Schulstunden
  await p.evaluate(d => { window.__mp.UI.date = d; location.hash = 'heute'; }, dsetup.day); await p.waitForTimeout(200);
  const dhb = await p.evaluate(() => { const sl = [...document.querySelectorAll('.tcard .slot')]; const d = sl.find(x => /Doppel/.test(x.querySelector('.per').textContent) && /–/.test(x.querySelector('.per').textContent)); return { n: sl.length, keys: d ? d.querySelector('[data-act="done"]').dataset.key : null, title: d ? d.querySelector('.stitle').textContent : '' }; });
  await p.click('.tcard .slot [data-act="done"][data-key*=","]'); await p.waitForTimeout(150);
  const dhd = await p.evaluate(k => k.split(',').every(x => window.__mp.S.cls.kl6.groups[0].done[x]), dhb.keys);
  await p.click('.tcard .slot [data-act="cancel"][data-key*=","]'); await p.waitForTimeout(150);
  const dhc = await p.evaluate(k => k.split(',').every(x => window.__mp.S.cls.kl6.groups[0].cancelled[x]), dhb.keys);
  await p.click('.tcard .slot.x [data-act="cancel"]'); await p.waitForTimeout(150);
  const dhr = await p.evaluate(k => k.split(',').every(x => !window.__mp.S.cls.kl6.groups[0].cancelled[x]), dhb.keys);
  ok(!!dhb.keys && dhb.keys.split(',').length === 2 && /Stunde \d+–\d+ von/.test(dhb.title) && dhd && dhc && dhr, 'Heute: Doppelstunde als ein Block, gehalten, Ausfall und Rücknahme für beide Schulstunden ' + JSON.stringify([dhb, dhd, dhc, dhr]));
  await p.evaluate(() => { const M = window.__mp, G = M.S.cls.kl6.groups[0]; G.tt = JSON.parse(window.__ttKeep); G.done = {}; M.touch(); });

  // Leistungsnachweise: Test mit eigener Stunde in die Sequenz einfügen, Kurzkontrolle in einer Stunde, Übersicht, Löschen
  await p.evaluate(() => { const M = window.__mp; M.UI.cls = 'kl8'; M.UI.type = 'gym'; M.UI.gid.kl8 = 'a'; M.UI.date = '2026-11-02'; location.hash = 'sequenz'; }); await p.waitForTimeout(250);
  const ln0 = await p.evaluate(() => { const M = window.__mp, sc = M.schedule('kl8.a'); return { n: M.S.cls.kl8.seq.length, nextStart: (sc.rows.find(r => r.code === 'T1') || {}).start }; });
  const afterIdx = await p.evaluate(() => window.__mp.S.cls.kl8.seq.findIndex(r => r.code === 'S0'));
  await p.selectOption('#lnkind', 'test');
  const lnDef = await p.evaluate(() => [document.getElementById('lnhrs').value, document.getElementById('lnwdh').checked, document.getElementById('lnrueck').checked]);
  await p.fill('#lntopic', 'Terme'); await p.selectOption('#lnafter', String(afterIdx)); await p.click('[data-act="lnadd"]'); await p.waitForTimeout(250);
  const ln1 = await p.evaluate(i => { const M = window.__mp, C = M.S.cls.kl8, sc = M.schedule('kl8.a'), row = C.seq[i + 1];
    return { n: C.seq.length, code: row.code, hours: row.hours, title: C.ln[row.code] && C.ln[row.code].title, nextStart: (sc.rows.find(r => r.code === 'T1') || {}).start, listed: M.lnDates('kl8.a').some(x => x.code === row.code && x.date) }; }, afterIdx);
  ok(lnDef.join() === '1,false,true' && ln1.n === ln0.n + 1 && ln1.code === 'LK1' && ln1.hours === 2 && ln1.title === 'Test: Terme' && ln1.nextStart > ln0.nextStart && ln1.listed && (await p.innerText('.lncard')).includes('Test: Terme'),
    'Leistungsnachweis anlegen: Test mit Rückgabe hinter S0 eingefügt, der Plan rückt nach, Übersicht zeigt den Termin ' + JSON.stringify([lnDef, ln0, ln1]));
  await p.evaluate(() => { location.hash = 'u-kl8-' + window.__mp.unitOrderOf('kl8').indexOf('T2'); }); await p.waitForTimeout(200);
  await p.click('[data-act="chknew"][data-l="1"]'); await p.waitForTimeout(150);
  await p.selectOption('#chkkind', 'kk'); await p.fill('#chktitle', 'Terme zusammenfassen'); await p.click('[data-act="chksave"]'); await p.waitForTimeout(200);
  const chk = await p.evaluate(() => { const M = window.__mp, x = M.lnDates('kl8.a').find(y => y.inLesson); return x ? { date: x.date, kind: x.kind, title: x.title } : null; });
  await p.evaluate(d => { window.__mp.UI.date = d; location.hash = 'heute'; }, chk && chk.date); await p.waitForTimeout(200);
  const chkToday = await p.evaluate(() => [...document.querySelectorAll('.tcard .lcheck')].map(e => e.textContent.trim()).join('|'));
  ok(!!chk && chk.kind === 'Kurzkontrolle' && chkToday.includes('Kurzkontrolle') && chkToday.includes('Terme zusammenfassen'), 'Kurzkontrolle in einer Stunde: in der Übersicht mit Termin und auf der Heute-Seite ' + JSON.stringify([chk, chkToday]));
  await p.evaluate(() => { location.hash = 'u-kl8-' + window.__mp.unitOrderOf('kl8').indexOf('LK1'); }); await p.waitForTimeout(200);
  await p.click('[data-act="confirm"][data-v="lndel-LK1"]'); await p.waitForTimeout(100); await p.click('[data-act="lndel"]'); await p.waitForTimeout(200);
  const ln2 = await p.evaluate(() => { const C = window.__mp.S.cls.kl8; return { n: C.seq.length, ln: Object.keys(C.ln || {}).length, hash: location.hash }; });
  await p.evaluate(() => { window.__mp.S.cls.kl8.checks = []; window.__mp.touch(); });
  ok(ln2.n === ln0.n && ln2.ln === 0 && ln2.hash === '#sequenz', 'Leistungsnachweis löschen entfernt Einheit und Sequenzzeile ' + JSON.stringify(ln2));
  // Leistungsnachweis per Datum festlegen: Hauptstunde am Termin, der übrige Plan läuft darum herum; lösen gibt ihn frei
  await p.evaluate(() => { const M = window.__mp; M.UI.cls = 'kl8'; M.UI.gid.kl8 = 'a'; location.hash = 'sequenz'; }); await p.waitForTimeout(200);
  const pin0 = await p.evaluate(() => { const M = window.__mp, x = M.lnDates('kl8.a').find(y => y.code === 'KA1'); return { date: x.date, row: x.row, t5: M.schedule('kl8.a').rows.find(r => r.code === 'T5').start }; });
  const pinSel = `input[data-act="lndate"][data-row="${pin0.row}"]`;
  await p.fill(pinSel, '2026-09-22'); await p.dispatchEvent(pinSel, 'change'); await p.waitForTimeout(250);
  const pin1 = await p.evaluate(row => { const M = window.__mp, sc = M.schedule('kl8.a'), x = M.lnDates('kl8.a').find(y => y.row === row), r = sc.rows.find(y => y.id === row);
    const gaps = sc.slots.filter(s => s.track === 'A' && !s.cancelled && s.date <= '2026-12-01' && !s.lesson).length;
    return { date: x.date, pinned: x.pinned, slots: r.slots.map(s => s.date), t5: sc.rows.find(y => y.code === 'T5').start, gaps, seqPos: M.S.cls.kl8.seq.findIndex(y => y.id === row) }; }, pin0.row);
  // Tag ohne Mathestunde: nächste Stunde
  await p.fill(pinSel, '2026-09-23'); await p.dispatchEvent(pinSel, 'change'); await p.waitForTimeout(250);
  const pin2 = await p.evaluate(row => window.__mp.lnDates('kl8.a').find(y => y.row === row).date, pin0.row);
  await p.click(`[data-act="lnunpin"][data-row="${pin0.row}"]`); await p.waitForTimeout(250);
  const pin3 = await p.evaluate(row => { const x = window.__mp.lnDates('kl8.a').find(y => y.row === row); return [x.date, x.pinned]; }, pin0.row);
  ok(pin1.date === '2026-09-22' && pin1.pinned === '2026-09-22' && pin1.slots.length === 2 && pin1.t5 > pin0.t5 && pin1.gaps === 0 && pin2 > '2026-09-23' && !!pin3[0] && pin3[0] < pin0.date && !pin3[1],
    'Leistungsnachweis per Datum: KA1 am 22.09., Plan läuft darum herum ohne Lücken, Tag ohne Stunde → nächste Stunde, lösen gibt den Termin frei ' + JSON.stringify([pin0, pin1, pin2, pin3]));
  // Kontrolle per Datum verlegen
  const chkMove = await p.evaluate(() => { const M = window.__mp, C = M.S.cls.kl8; C.checks = [{ id: 'cx', kind: 'kk', title: 'Probe', code: 'T2', n: 1 }]; M.touch();
    M.setCheckDate('kl8.a', 'cx', '2026-10-01'); const x = M.lnDates('kl8.a').find(y => y.id === 'cx'); const pd = M.schedule('kl8.a').slots.filter(s => s.date >= '2026-10-01' && s.lesson && s.track !== 'SOL')[0].date; const r = [x.date, x.code, x.n, pd]; C.checks = []; M.touch(); return r; });
  ok(chkMove[0] === chkMove[3] && !!chkMove[1], 'Kontrolle per Datum in die Stunde dieses Tages verlegt ' + JSON.stringify(chkMove));

  // Lehrpläne Sachsen: alle Klassen GYM 5–12 und OS 5–10, OS ab 7 mit HS/RS, GYM 11/12 mit GK/LK
  const lp = await p.evaluate(() => { const C = window.PLAN_DATA.classes, k = Object.keys(C);
    const sum = id => C[id].seq.reduce((a, r) => a + (r[0] === 'P' ? 0 : r[2]), 0);
    return { n: k.length, os7: k.filter(x => C[x].type === 'os' && C[x].grade === 7).map(x => C[x].variant).join(','), os10: k.filter(x => C[x].type === 'os' && C[x].grade === 10).map(x => C[x].variant).join(','),
      g11: k.filter(x => C[x].type === 'gym' && C[x].grade === 11).map(x => C[x].variant).join(','), sum9: sum('gym9'), sum8hs: sum('os8hs'), zrw8hs: Object.values(C.os8hs.zrw).reduce((a, x) => a + x, 0) }; });
  ok(lp.n === 19 && lp.os7 === 'HS,RS' && lp.os10 === 'RS' && lp.g11 === 'GK,LK', 'Lehrpläne: 19 Klassen, OS 7 HS/RS, OS 10 nur RS, GYM 11 GK/LK ' + JSON.stringify(lp));
  // Sequenzen füllen das Schuljahr wie GYM 6/8: Stoff mindestens nach Zeitrichtwert, Klassenarbeiten, Wahlbereich, Abschluss
  const fill = await p.evaluate(() => { const M = window.__mp, C = window.PLAN_DATA.classes, bad = [];
    for (const id in C) { if (C[id].source !== 'lehrplan') continue;
      const sc = M.schedule(id + '.a'), seq = C[id].seq, stoff = seq.filter(r => /^\d/.test(r[0])).reduce((a, r) => a + r[2], 0);
      const zrw = Object.values(C[id].zrw).reduce((a, x) => a + x, 0), ka = seq.filter(r => /^KA/.test(r[0])).length;
      if (sc.cap.A !== sc.planned.A || stoff < zrw || ka !== (C[id].grade >= 11 ? 2 : 4)) bad.push([id, sc.cap.A, sc.planned.A, stoff, zrw, ka].join(':')); }
    const g9 = C.gym9.seq.map(r => r[0]);
    const end12 = M.schedule('gym12gk.a').slots.reduce((a, s) => s.date > a ? s.date : a, '');
    const end10 = M.schedule('os10rs.a').slots.reduce((a, s) => s.date > a ? s.date : a, '');
    return { bad, g9: g9.includes('KA1') && g9.includes('KA4') && g9.includes('W1') && g9[g9.length - 1] === 'JA', end12, end10, ka: C.gym9.units.KA1.title }; });
  ok(fill.bad.length === 0 && fill.g9, 'Lehrplan-Sequenzen füllen das Schuljahr (Stoff ≥ Zeitrichtwert, 4 KA bzw. 2 Klausuren, Wahlbereich, Jahresabschluss) ' + JSON.stringify(fill));
  ok(fill.end12 < '2027-03-26' && fill.end12 >= '2027-03-15' && fill.end10 < '2027-05-15' && fill.end10 >= '2027-05-01', 'Abschlussklassen: GYM 12 bis vor Ostern, OS 10 bis vor Pfingsten ' + fill.end12 + ' ' + fill.end10);
  // alte, unveränderte Lehrplan-Sequenz (nur Zeitrichtwerte) wird beim Laden durch die neue Vorlage ersetzt
  const lpMig = await p.evaluate(() => { const M = window.__mp, C = window.PLAN_DATA.classes.os9hs, cur = M.S.cls.os9hs;
    const old = []; let lb = null;
    for (const [code] of C.seq) { if (!/^\d/.test(code)) continue; const l = code.split('.')[0]; if (lb && l !== lb) old.push({ id: 'p' + old.length, code: 'P', strand: 'A', hours: 1 }); lb = l; }
    const zrw = Object.values(C.zrw), units = C.seq.filter(r => /^\d/.test(r[0]));
    // Stunden der Einheiten so wählen, dass die Summe den Zeitrichtwerten entspricht
    let rest = zrw.reduce((a, x) => a + x, 0); const rows = [];
    units.forEach((r, i) => { const h = i === units.length - 1 ? rest : 1; rest -= h; rows.push({ id: 'u' + i, code: r[0], strand: 'A', hours: h }); });
    M.applyDoc('os9hs', { seq: rows.concat([{ id: 'pz', code: 'P', strand: 'A', hours: 1 }]), mode: 'nacheinander', atoms: {}, groups: cur.groups });
    const a = M.S.cls.os9hs.seq.some(r => /^KA/.test(r.code));
    M.applyDoc('os9hs', { seq: [{ id: 'x', code: '1.1', strand: 'A', hours: 3 }], mode: 'nacheinander', atoms: {}, groups: cur.groups });
    const b = M.S.cls.os9hs.seq.length === 1;
    M.applyDoc('os9hs', { seq: C.seq.map(([code, strand, hours], i) => ({ id: 's' + i, code, strand, hours })), mode: 'nacheinander', atoms: {}, groups: cur.groups });
    return [a, b]; });
  ok(lpMig[0] && lpMig[1], 'Alte Lehrplan-Sequenz wird ersetzt, eigene Sequenzen bleiben ' + JSON.stringify(lpMig));
  const noAtoms = await p.evaluate(() => { const C = window.PLAN_DATA.classes, bad = [];
    for (const id in C) for (const code in C[id].units) { const u = C[id].units[code];
      if (u.lb && !/^(W|P|KA|JA|A-KA|B-KA)/.test(code) && !u.atoms.length) bad.push(id + ':' + code);
      for (const a of u.atoms) if (!a.q || !a.a || !a.q2 || !a.a2 || !a.q3 || !a.a3) bad.push(id + ':' + a.id); }
    return bad; });
  ok(noAtoms.length === 0, 'Jede Lehrplan-Einheit hat Atome mit Aufgaben auf drei Stufen ' + JSON.stringify(noAtoms.slice(0, 5)));
  await p.evaluate(() => location.hash = 'einstellungen'); await p.waitForTimeout(150);
  await p.check('[data-act="mine"][data-k="os7hs"]'); await p.waitForTimeout(100);
  await p.check('[data-act="mine"][data-k="os7rs"]'); await p.waitForTimeout(150);
  ok(await p.evaluate(() => window.__mp.UI.cls === 'os7rs' && window.__mp.UI.type === 'os'), 'Meine Klassen: OS 7 RS angehakt und gewählt');
  ok((await p.innerText('#ctx')).includes('HS') && (await p.innerText('#ctx')).includes('RS'), 'Leiste zeigt Umschalter HS | RS');
  await p.click('#ctx [data-k="os7hs"][title="Hauptschulbildungsgang"]'); await p.waitForTimeout(150);
  await p.evaluate(() => location.hash = 'einheiten'); await p.waitForTimeout(200);
  const ein = await p.innerText('main');
  ok(ein.includes('Klasse 7 HS') && ein.includes('Anteile und Prozente') && ein.includes('Ziele der Klassenstufe'), 'Einheiten OS 7 HS aus dem Lehrplan mit Zielen');
  await p.screenshot({ path: path.join(OUT, 's_lehrplan_os7hs.png'), fullPage: false });
  await p.evaluate(() => location.hash = 'sequenz'); await p.waitForTimeout(200);
  ok((await p.innerText('main')).includes('Zeitrichtwert'), 'Sequenz OS 7 HS mit Zeitrichtwerten');
  await p.evaluate(() => location.hash = 'einstellungen'); await p.waitForTimeout(150);
  // Doppelstunde: ein Eintrag mit Dauer 2 belegt zwei aufeinanderfolgende Stunden
  const slotsWeek = () => p.evaluate(() => window.__mp.schedule('os7hs.a').slots.filter(s => s.date >= '2026-11-23' && s.date <= '2026-11-27').map(s => s.date.slice(8) + '/' + s.period).join(','));
  const dsBefore = await slotsWeek();
  await p.selectOption('.ttv.cur select[data-f="len"][data-i="0"]', '2'); await p.waitForTimeout(150);
  const dsAfter = await slotsWeek();
  ok(dsBefore.split(',').length === 4 && dsAfter.split(',').length === 5 && dsAfter.includes('23/2') && dsAfter.includes('23/3') && (await p.innerText('.ttv.cur')).includes('5 Unterrichtsstunden pro Woche'), 'Doppelstunde zählt im Plan als zwei Stunden ' + dsBefore + ' → ' + dsAfter);
  await p.selectOption('.ttv.cur select[data-f="len"][data-i="0"]', '1'); await p.waitForTimeout(150);
  // letzter Unterrichtstag: eigener Wert kürzt den Plan, zurücksetzen auf Schuljahresende
  await p.fill('input[data-act="lastday"]', '2027-06-30'); await p.dispatchEvent('input[data-act="lastday"]', 'change'); await p.waitForTimeout(150);
  const ld = await p.evaluate(() => [window.__mp.S.cls.os7hs.lastDay, window.__mp.schedule('os7hs.a').slots.every(s => s.date <= '2027-06-30')]);
  await p.click('[data-act="lastdayreset"]'); await p.waitForTimeout(150);
  ok(ld[0] === '2027-06-30' && ld[1] && (await p.evaluate(() => window.__mp.S.cls.os7hs.lastDay === undefined)), 'Letzter Unterrichtstag einstellbar und zurücksetzbar ' + JSON.stringify(ld));
  await p.uncheck('[data-act="mine"][data-k="os7hs"]'); await p.uncheck('[data-act="mine"][data-k="os7rs"]'); await p.waitForTimeout(150);
  ok(await p.evaluate(() => window.__mp.UI.type === 'gym' && ['kl6', 'kl8'].includes(window.__mp.UI.cls)), 'Nach dem Abwählen zurück zu einer eigenen GYM-Klasse');
  await p.waitForTimeout(900);

  // Speicherung im Browser (ohne Claude-Datenbank, z. B. GitHub Pages)
  await p.waitForTimeout(900);
  // Neuladen im selben Tab
  const p2 = p;
  await p.reload(); await p.waitForTimeout(400);
  await p.evaluate(() => { location.hash = 'einstellungen'; }); await p.waitForTimeout(200);
  const kept = await p2.evaluate(() => { const m = window.__mp; return [m.S.settings.years.map(y => y.id).join(','), m.S.cls.kl8.groups[0].tt.length, m.S.cls.kl8.groups[0].off.length, document.getElementById('banner').dataset.kind, m.S.cls.kl8.groups.length]; });
  ok(kept[0] === '2026-27,2027-28' && kept[1] === 3 && kept[2] === 1 && kept[3] === 'local' && kept[4] === 2, 'Nach dem Neuladen ist alles noch da (localStorage) ' + JSON.stringify(kept));
  await p2.selectOption('#yearsel', '2027-28'); await p2.waitForTimeout(150);
  ok(await p2.evaluate(() => window.__mp.S.cls.kl8.groups[0].tt.length === 1 && window.__mp.cal().id === '2027-28'), 'Schuljahr 2027/28 aus dem Browser-Speicher geladen');
  ok(errs.length === 0, 'Keine Fehler in der Konsole ' + JSON.stringify(errs));
  await b.close(); srv.close();
})();
