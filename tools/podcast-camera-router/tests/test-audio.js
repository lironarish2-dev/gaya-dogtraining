/* הקול בקובץ הסופי, על קצב דגימה שאינו 48kHz ועל מיקרופון דחוס.
   מיקרופון 44.1kHz הועתק פעם דגימה-לדגימה לתוך 48kHz: הצליל האיץ
   ב-8.8% ובכל שנייה נפער חור של 0.08ש׳. מיקרופון mp3 דולג לגמרי
   והקובץ יצא אילם. שניהם נמדדים כאן מהקובץ שיצא. */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const HTML = process.argv[2] || __dirname + '/../index.html';
const DIR  = process.argv[3] || '/work/fx44';
let fails = 0;
const ok = (c,m,e='')=>{ console.log((c?'  PASS  ':'  FAIL  ')+m+(e?`  [${e}]`:'')); if(!c) fails++; };

(async()=>{
  const b = await chromium.launch({args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
  const p = await b.newPage({viewport:{width:1280,height:900}, acceptDownloads:true});
  const errors=[]; p.on('pageerror',e=>errors.push(String(e).split('\n')[0]));
  const dls=[]; p.on('download',d=>dls.push(d));
  await p.goto('file://'+HTML);
  await p.evaluate(()=>localStorage.clear());
  const ext = fs.existsSync(DIR+'/mic_1.wav') ? 'wav' : 'mp3';
  await p.setInputFiles('#fileInput',
    [`${DIR}/camera_1.mp4`,`${DIR}/camera_2.mp4`,`${DIR}/mic_1.${ext}`,`${DIR}/mic_2.${ext}`]);
  await p.waitForFunction(()=>S.clips.length===4,null,{timeout:180000});
  await p.click('#autoPilot');
  await p.waitForFunction(()=>/מוכן|תקלה|חסרים/.test($('#autoStatus').textContent),null,{timeout:300000});
  await p.click('#makeBtn');
  await p.waitForFunction(()=>{
    const t=document.querySelector('#renderResult').textContent;
    return /הקובץ מוכן|נכשלה/.test(t) && !window.rendering; },null,{timeout:1800000});
  await p.waitForTimeout(500);
  const cls = await p.evaluate(()=>$('#renderResult').className);
  ok(cls!=='bad','היצירה הצליחה', await p.evaluate(()=>$('#renderResult').textContent.slice(0,140)));
  const d = dls[dls.length-1];
  ok(!!d,'הקובץ ירד');
  if(d){
    const path = '/tmp/audio-test.'+d.suggestedFilename().split('.').pop();
    await d.saveAs(path);
    const out = execFileSync('python3',[__dirname+'/audio-probe.py', path],{encoding:'utf8'});
    const A = JSON.parse(out.trim());
    console.log('   ', JSON.stringify(A));
    ok(A.peak > 0.02, 'יש קול בקובץ', 'שיא '+A.peak);
    /* 220 ו-430 הרץ. האצה של 8.8% הייתה מזיזה ל-239 ול-468. */
    const bad = A.freqs.filter(f => Math.abs(f-220) > 220*0.035 && Math.abs(f-430) > 430*0.035);
    ok(A.freqs.length >= 2 && bad.length === 0,
       'תדר הקול נכון — קצב הדגימה הומר', `${A.freqs.length-bad.length}/${A.freqs.length} · ${A.freqs.join(', ')}Hz`);
    /* תור דיבור של 6.6ש׳; קיצוץ פעם בשנייה היה מפרק אותו ל-0.92ש׳ */
    ok(A.medRun >= 2.0, 'הדיבור רציף — לא נקצץ פעם בשנייה', `רצף ${A.medRun}ש׳ · ${A.runs} רצפים`);
  }
  ok(errors.length===0,'אין שגיאות JS',errors.slice(0,2).join(' | '));
  await b.close();
  console.log(fails?`\n❌ ${fails} כשלים · ${DIR}\n`:`\n✅ הקול תקין · ${DIR}\n`);
  process.exit(fails?1:0);
})().catch(e=>{console.error('CRASH',e);process.exit(2);});
