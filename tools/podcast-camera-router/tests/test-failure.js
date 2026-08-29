/* הקוד שרץ רק כשמשהו נשבר — ומעולם לא רץ.
   מזריקים תקלה אמיתית באמצע היצירה ובודקים שני דברים: שהכלי אומר
   שזה נכשל (ולא מוסר קובץ פגום בתור "מוכן"), ושמה שכבר נארז לא
   הלך לאיבוד. */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const HTML = process.argv[2] || '/home/user/gaya-dogtraining/tools/podcast-camera-router/index.html';
const DIR  = process.argv[3] || '/work/small';
let fails = 0;
const ok = (c,m,e='')=>{ console.log((c?'  PASS  ':'  FAIL  ')+m+(e?`  [${e}]`:'')); if(!c) fails++; };

(async()=>{
  const b = await chromium.launch({args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
  const p = await b.newPage({viewport:{width:1280,height:900}, acceptDownloads:true});
  const dls=[]; p.on('download',d=>dls.push(d));
  await p.goto('file://'+HTML);
  await p.evaluate(()=>localStorage.clear());
  await p.setInputFiles('#fileInput',
    [`${DIR}/camera_1.mp4`,`${DIR}/camera_2.mp4`,`${DIR}/mic_1.wav`,`${DIR}/mic_2.wav`]);
  await p.waitForFunction(()=>S.clips.length===4,null,{timeout:180000});
  await p.click('#autoPilot');
  await p.waitForFunction(()=>/מוכן|תקלה/.test($('#autoStatus').textContent),null,{timeout:300000});

  /* תקלה מדומה אחרי שכבר נארזו קטעים — בדיוק כמו כשל בדקה ה-40 */
  await p.evaluate(()=>{
    const orig = drawNameTag; let n = 0;
    window.drawNameTag = function(...a){
      if(++n === 700) throw new Error('בדיקה: תקלה מדומה באמצע היצירה');
      return orig.apply(this, a);
    };
  });
  await p.click('#makeBtn');
  await p.waitForFunction(()=>{
    const t=document.querySelector('#renderResult').textContent;
    return /נכשלה|הקובץ מוכן/.test(t) && !window.rendering; },null,{timeout:1800000});
  await p.waitForTimeout(800);

  const r = await p.evaluate(()=>({
    cls: $('#renderResult').className,
    txt: $('#renderResult').textContent.replace(/\s+/g,' '),
    partialLinks: [...document.querySelectorAll('#renderResult a.dlbig')].map(a=>a.textContent)
  }));
  ok(r.cls === 'bad', 'הכשל מדווח ככשל — לא נמסר קובץ פגום בתור "מוכן"', r.txt.slice(0,90));
  ok(/תקלה מדומה/.test(r.txt), 'סיבת הכשל מוצגת למשתמשת');
  ok(/לא אבד/.test(r.txt), 'נאמר שמה שנוצר לא אבד', r.txt.slice(0,160));
  ok(r.partialLinks.length >= 1, 'יש כפתור להורדת החלק שנוצר', JSON.stringify(r.partialLinks));

  if(r.partialLinks.length){
    await p.click('#renderResult a.dlbig');
    await p.waitForTimeout(1500);
    ok(dls.length >= 1, 'הקובץ החלקי באמת יורד');
    if(dls.length){
      const path = '/tmp/partial.'+dls[dls.length-1].suggestedFilename().split('.').pop();
      await dls[dls.length-1].saveAs(path);
      const { execFileSync } = require('child_process');
      const FF='/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2';
      let dur = -1;
      try{
        const info = execFileSync(FF,['-hide_banner','-i',path],{encoding:'utf8',stdio:['pipe','pipe','pipe']});
      }catch(e){
        const m = String(e.stderr||'').match(/Duration: (\d+):(\d+):([\d.]+)/);
        if(m) dur = (+m[1])*3600+(+m[2])*60+parseFloat(m[3]);
      }
      const m = r.partialLinks[0].match(/(\d+):(\d+)/);
      const claimed = m ? (+m[1])*60 + (+m[2]) : -1;
      ok(dur > 3, 'הקובץ החלקי תקין ונפתח', dur.toFixed(1)+'ש׳');
      /* הכותרת חייבת להצהיר על מה שבאמת יש בקובץ, לא על אורך הפרק */
      ok(claimed > 0 && Math.abs(dur - claimed) < Math.max(2, claimed*0.2),
         'האורך המוצהר בקובץ תואם למה שבאמת נוצר',
         `בקובץ ${dur.toFixed(1)}ש׳ · על הכפתור ${claimed}ש׳`);
    }
  }
  await b.close();
  console.log(fails?`\n❌ ${fails} כשלים\n`:'\n✅ כשל באמצע: מדווח נכון, והעבודה לא אובדת\n');
  process.exit(fails?1:0);
})().catch(e=>{console.error('CRASH',e);process.exit(2);});
