// Headless-Test: node src/test.js [ausgabeordner-für-screenshots]
const { chromium } = require('playwright');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const OUT = process.argv[2] || path.join(ROOT, 'docs', 'screenshots');
const ok = (c, msg) => { if (!c) { console.log('FAIL', msg); process.exitCode = 1; } else console.log('ok  ', msg); };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  await p.goto('file://' + path.join(ROOT, 'dist', 'index.html') + '#heute'); await p.waitForTimeout(500);
  await p.evaluate(() => { window.__mp.UI.date = '2026-11-17'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
  await p.waitForTimeout(200);

  // Ausgangsplan: Kapazitäten wie bisher
  const r = await p.evaluate(() => { const m = window.__mp; const out = {};
    for (const k of ['kl6', 'kl8']) { const sc = m.schedule(k); out[k] = { cap: sc.cap, planned: sc.planned }; }
    return out; });
  console.log(JSON.stringify(r));
  ok(r.kl6.cap.A === r.kl6.planned.A, 'Kl. 6 geht auf');
  ok(r.kl8.cap.A === r.kl8.planned.A && r.kl8.cap.SOL > 0, 'Kl. 8 geht auf, SOL ab 26.10.');

  // Klassen-Umschalter oben
  ok((await p.$$('.tcard')).length === 1, 'Heute zeigt nur die gewählte Klasse');
  await p.click('#ctx [data-k="kl8"]'); await p.waitForTimeout(100);
  ok((await p.innerText('.tcard h2')) === 'Klasse 8', 'Umschalter: Heute zeigt Klasse 8');
  for (const h of ['plan', 'sequenz', 'einheiten', 'engine', 'einstellungen']) {
    await p.evaluate(h => location.hash = h, h); await p.waitForTimeout(150);
    ok((await p.innerText('main')).includes('Klasse 8'), `${h} folgt der gewählten Klasse`);
  }
  // Schulart-Umschalter: Oberschule hat noch keinen Lehrplan
  ok((await p.$$('#ctx .grades button')).length === 8 && (await p.$$('#ctx .grades button[disabled]')).length === 6, 'GYM: Klassen 5–12, nur 6 und 8 wählbar');
  await p.click('#ctx [data-act="type"][data-v="os"]'); await p.waitForTimeout(100);
  ok((await p.$$('#ctx .grades button')).length === 6 && (await p.$$('#ctx .grades button[disabled]')).length === 6, 'OS: Klassen 5–10, keine wählbar');
  ok((await p.innerText('main')).includes('Oberschule ist noch kein Lehrplan'), 'OS: Hinweis statt Plan');
  await p.evaluate(() => location.hash = 'heute'); await p.waitForTimeout(100);
  ok((await p.innerText('main')).includes('Oberschule ist noch kein Lehrplan'), 'OS: Heute zeigt Hinweis');
  await p.click('#ctx [data-act="type"][data-v="gym"]'); await p.waitForTimeout(100);
  ok((await p.innerText('.tcard h2')) === 'Klasse 8', 'Zurück zu GYM: Klasse 8 wieder gewählt');
  await p.click('[data-act="todaycls"][data-v="all"]').catch(() => {});
  await p.evaluate(() => location.hash = 'heute'); await p.waitForTimeout(100);
  await p.click('[data-act="todaycls"][data-v="all"]'); await p.waitForTimeout(100);
  ok((await p.$$('.tcard')).length === 2, 'Heute: „Alle Klassen“ zeigt beide');
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
  ok(await p.evaluate(() => window.__mp.cal().holidays.length === 5 && window.__mp.cal().free.length === 3), 'Ferien Sachsen importieren füllt Ferien und freie Tage');

  for (const h of ['heute', 'plan', 'sequenz', 'einheiten', 'engine', 'u-kl8-3']) { await p.evaluate(h => location.hash = h, h); await p.waitForTimeout(200); await p.screenshot({ path: path.join(OUT, `s_${h === 'heute' ? 'today' : h}.png`) }); }
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
  await p.click('[data-act="gadd"]'); await p.waitForTimeout(150);
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
  await p.waitForTimeout(900);

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

  // Speicherung im Browser (ohne Claude-Datenbank, z. B. GitHub Pages)
  await p.waitForTimeout(900);
  const p2 = await p.context().newPage(); p2.on('pageerror', e => errs.push(e.message));
  await p2.goto('file://' + path.join(ROOT, 'dist', 'index.html') + '#einstellungen'); await p2.waitForTimeout(400);
  const kept = await p2.evaluate(() => { const m = window.__mp; return [m.S.settings.years.map(y => y.id).join(','), m.S.cls.kl8.groups[0].tt.length, m.S.cls.kl8.groups[0].off.length, document.getElementById('banner').dataset.kind, m.S.cls.kl8.groups.length]; });
  ok(kept[0] === '2026-27,2027-28' && kept[1] === 3 && kept[2] === 1 && kept[3] === 'local' && kept[4] === 2, 'Nach dem Neuladen ist alles noch da (localStorage) ' + JSON.stringify(kept));
  await p2.selectOption('#yearsel', '2027-28'); await p2.waitForTimeout(150);
  ok(await p2.evaluate(() => window.__mp.S.cls.kl8.groups[0].tt.length === 1 && window.__mp.cal().id === '2027-28'), 'Schuljahr 2027/28 aus dem Browser-Speicher geladen');
  ok(errs.length === 0, 'Keine Fehler in der Konsole ' + JSON.stringify(errs));
  await b.close();
})();
