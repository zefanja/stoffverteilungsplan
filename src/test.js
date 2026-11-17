const { chromium } = require('playwright');
(async()=>{
 const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1280,height:900}});
 const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
 await p.goto('file:///home/claude/app/dist/index.html#heute'); await p.waitForTimeout(500);
 // set date to 2026-11-17
 await p.evaluate(()=>{ window.__mp.UI.date='2026-11-17'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
 await p.waitForTimeout(200);
 console.log((await p.innerText('main')).slice(0,1800));
 await p.screenshot({path:'/home/claude/app/s_today.png',fullPage:false});
 const r=await p.evaluate(()=>{ const m=window.__mp; const out={};
   for(const k of ['kl6','kl8']){ const sc=m.schedule(k); out[k]={cap:sc.cap,planned:sc.planned,intro:Object.keys(sc.intro).length,
     rows:sc.rows.filter(x=>/KA/.test(x.code)).map(x=>[x.code,x.start,x.end,x.overflow]), due:m.engineState(k,'2026-11-17').dueCount }; }
   // fsrs sanity
   let c=null, d='2026-11-01', seq=[]; for(const g of [3,3,3,1,3,4]){ c=m.fsrsReview(c,g,d,0.9); seq.push([g,c.s.toFixed(2),c.d.toFixed(2),c.due]); d=c.due; }
   out.fsrs=seq; return out; });
 console.log(JSON.stringify(r,null,0));
 for(const h of ['plan','sequenz','einheiten','engine','einstellungen','u-kl8-3']){ await p.evaluate(h=>location.hash=h,h); await p.waitForTimeout(200); await p.screenshot({path:`/home/claude/app/s_${h}.png`}); }
 // actions
 await p.evaluate(()=>{location.hash='heute'}); await p.waitForTimeout(200);
 const before=await p.evaluate(()=>window.__mp.S.cls.kl6.seq.map(r=>r.hours).join(','));
 const btn=await p.$('[data-act="addhour"]'); if(btn){ await btn.click(); await p.waitForTimeout(100);} 
 const after=await p.evaluate(()=>window.__mp.S.cls.kl6.seq.map(r=>r.hours).join(','));
 console.log('addhour changed', before!==after, await p.innerText('#toast'));
 const rv=await p.$('[data-act="reveal"]'); if(rv){ await rv.click(); await p.waitForTimeout(100); const rt=await p.$('[data-act="rate"][data-g="3"]'); await rt.click(); await p.waitForTimeout(100); console.log('rated', await p.innerText('#toast')); }
 await p.setViewportSize({width:400,height:800}); await p.waitForTimeout(200);
 console.log('sw400', await p.evaluate(()=>document.documentElement.scrollWidth));
 await p.screenshot({path:'/home/claude/app/s_mobile.png',fullPage:false});
 console.log('errors',errs);
 await b.close(); })();
