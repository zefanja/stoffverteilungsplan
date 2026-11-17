// Lädt die Mathematik-Lehrpläne Gymnasium und Oberschule aus der Lehrplandatenbank Sachsen
// (https://www.schulportal.sachsen.de/lplandb/) als HTML.
// Aufruf: NODE_PATH=$(npm root -g) node src/fetch_lehrplan.js <zielordner>
// Die Datenbank verlangt eine Browsersitzung, daher Playwright statt eines einfachen Downloads.
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = process.argv[2] || '.';
const SCHULARTEN = [['gym', [1, 2, 47]], ['os', [1, 4, 25]]];   // showAuswahlSchulart(Schulgruppe, Schulart, …)
(async () => {
  const b = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  for (const [name, args] of SCHULARTEN) {
    await p.goto('https://www.schulportal.sachsen.de/lplandb/', { waitUntil: 'networkidle', timeout: 60000 });
    await p.evaluate(() => onclickLehrplansucheSchulgruppe2(1, 0)); await p.waitForTimeout(2500);
    await p.evaluate(a => showAuswahlSchulart(...a), args); await p.waitForTimeout(3500);
    await p.click('a:text-is("Mathematik")'); await p.waitForTimeout(4000);
    const href = await p.$eval('a[href*="lplanid="]', a => a.href);
    const resp = await ctx.request.get(href);
    if (!resp.ok()) throw new Error(`${name}: HTTP ${resp.status()}`);
    fs.writeFileSync(`${OUT}/${name}_lplan.html`, await resp.body());
    console.log(name, href.replace(/&token=.*/, ''));
  }
  await b.close();
})().catch(e => { console.error('Fehler:', e.message); process.exit(1); });
