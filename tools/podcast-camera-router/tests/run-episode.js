/* ריצה מלאה על פרק אמיתי: 53 דקות, שתי מצלמות 1080p H.264 של ~2GB,
   שני מיקרופונים WAV של 609MB. בדיוק מה שהלקוחה עושה: טוענת ארבעה
   קבצים, לוחצת 🚀, לוחצת 🎬, ומחכה לקובץ. */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const HTML = process.argv[2] || '/home/user/gaya-dogtraining/tools/podcast-camera-router/index.html';
const EP = '/work/ep';
const OUT = process.argv[3] || '/work/out';
fs.mkdirSync(OUT, {recursive:true});
const T0 = Date.now();
const log = m => { const s=((Date.now()-T0)/1000).toFixed(0).padStart(5);
  console.log(`[${s}s] ${m}`); };

(async()=>{
  const b = await chromium.launch({args:[
    '--no-sandbox','--autoplay-policy=no-user-gesture-required',
    '--disable-dev-shm-usage','--js-flags=--max-old-space-size=8192']});
  const p = await b.newPage({viewport:{width:1400,height:1000}, acceptDownloads:true});
  const errors = [];
  p.on('pageerror', e=>{ errors.push(String(e).split('\n')[0]); log('PAGEERROR '+String(e).split('\n')[0]); });
  p.on('console', m=>{ if(m.type()==='error') errors.push('console: '+m.text().slice(0,140)); });
  const dls = []; p.on('download', d=>{ dls.push(d); log('הורדה התחילה: '+d.suggestedFilename()); });

  await p.goto('file://' + HTML);
  await p.evaluate(()=>localStorage.clear());
  log('טוענת ארבעה קבצים…');
  await p.setInputFiles('#fileInput',
    [`${EP}/camera_1.mp4`, `${EP}/camera_2.mp4`, `${EP}/mic_1.wav`, `${EP}/mic_2.wav`]);
  await p.waitForFunction(()=>S.clips.length===4, null, {timeout:900000});
  const meta = await p.evaluate(()=>S.clips.map(c=>({n:c.name, kind:c.kind,
    mb:+(c.file.size/1048576).toFixed(0), dur:+(c.dur||0).toFixed(1),
    w:c.el.videoWidth||0, h:c.el.videoHeight||0})));
  log('קבצים: ' + JSON.stringify(meta));

  /* מעקב שוטף — כדי לראות איפה זה איטי או נתקע */
  let lastMsg = '';
  const watch = setInterval(async ()=>{
    try{
      const s = await p.evaluate(()=>({
        auto: ($('#autoStatus')||{}).textContent||'',
        st: ($('#renderStatus')||{}).textContent||'',
        prog: +(($('#renderProg')||{}).value||0).toFixed(3),
        rend: !!window.rendering,
        heap: performance.memory ? +(performance.memory.usedJSHeapSize/1048576).toFixed(0) : -1
      }));
      const m = `${s.auto?('סנכרון: '+s.auto.slice(0,70)):''} ${s.st?('יצירה: '+s.st.slice(0,80)):''} ${s.prog?('['+Math.round(s.prog*100)+'%]'):''} heap=${s.heap}MB`;
      if(m.trim() !== lastMsg){ lastMsg = m.trim(); log(m.trim()); }
    }catch(e){}
  }, 15000);

  log('🚀 טייס אוטומטי…');
  const tAuto = Date.now();
  await p.click('#autoPilot');
  await p.waitForFunction(()=>/מוכן|תקלה|חסרים|משהו חסר/.test($('#autoStatus').textContent),
    null, {timeout:3600000});
  const autoSecs = (Date.now()-tAuto)/1000;
  const autoTxt = await p.evaluate(()=>$('#autoStatus').textContent.slice(0,200));
  log(`טייס אוטומטי הסתיים ב-${autoSecs.toFixed(0)}ש׳: ${autoTxt}`);
  const geom = await p.evaluate(()=>({
    cuts: S.cuts.length, t0:+S.t0.toFixed(2), t1:+S.t1.toFixed(2),
    cams: S.people.map(x=>{const c=clip(x.camId); return c?{n:c.name, off:+c.offset.toFixed(3), rate:+(c.rate||1).toFixed(6), win:c._syncWin}:null;}),
    mics: S.people.map(x=>{const c=clip(x.micId); return c?{n:c.name, off:+c.offset.toFixed(3)}:null;})
  }));
  log('גיאומטריה: ' + JSON.stringify(geom));

  log('🎬 יוצרת את הפרק המלא…');
  const tRend = Date.now();
  await p.click('#makeBtn');
  await p.waitForFunction(()=>{
    const t = document.querySelector('#renderResult').textContent;
    return /הקובץ מוכן|נכשלה/.test(t) && !window.rendering; }, null, {timeout:14400000});
  const rendSecs = (Date.now()-tRend)/1000;
  clearInterval(watch);
  const r = await p.evaluate(()=>({cls:$('#renderResult').className,
    txt:$('#renderResult').textContent.replace(/\s+/g,' ').slice(0,700)}));
  log(`יצירה הסתיימה ב-${rendSecs.toFixed(0)}ש׳ (${(rendSecs/60).toFixed(1)} דקות) · מצב=${r.cls||'ok'}`);
  log('הודעה: ' + r.txt);

  let saved = null;
  if(dls.length){
    const d = dls[dls.length-1];
    saved = `${OUT}/episode.${d.suggestedFilename().split('.').pop()}`;
    log('שומרת את הקובץ…');
    await d.saveAs(saved);
    log(`נשמר: ${saved} · ${(fs.statSync(saved).size/1048576).toFixed(0)}MB`);
  } else log('❌ לא ירד שום קובץ');

  fs.writeFileSync(`${OUT}/run.json`, JSON.stringify({
    meta, geom, autoSecs, rendSecs, cls:r.cls, msg:r.txt, saved,
    errors: errors.slice(0,20), sourceDur: 3173
  }, null, 1));
  await b.close();
  log('סיום.');
  process.exit(saved ? 0 : 1);
})().catch(e=>{ console.error('CRASH', e); process.exit(2); });
