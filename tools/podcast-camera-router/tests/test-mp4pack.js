/* אורז ה-MP4 המצטבר — הנתיב שמפיק את הקובץ אצל הלקוחה בפועל.
   בקונטיינר הזה לכרום אין H.264 כלל (לא קידוד ולא פענוח), ולכן אף
   בדיקה מקצה-לקצה לא נוגעת בנתיב הזה. כאן לוקחים דגימות H.264
   אמיתיות עם B-frames, מזרימים אותן דרך פונקציות האריזה של הדף
   עצמו — כולל גבולות ה-flush — ומוודאים מול pyav שהקובץ שיצא
   מפוענח בדיוק כמו המקור ושהקול והתמונה מתחילים יחד. */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const HTML = process.argv[2] || __dirname + '/../index.html';
const SRC  = process.argv[3] || '/work/dmx/h264_bframes.mp4';
let fails = 0;
const ok = (c,m,e='')=>{ console.log((c?'  PASS  ':'  FAIL  ')+m+(e?`  [${e}]`:'')); if(!c) fails++; };

(async()=>{
  /* שמירה מפני סחיפה: אם לוגיקת האריזה בדף השתנתה, הבדיקה כבר לא
     בודקת את מה שרץ אצל המשתמשת — ועדיף שתיפול. */
  const page = fs.readFileSync(HTML,'utf8');
  for(const [frag,label] of [
    ["while(videoChunks.length && videoChunks[0].timestamp/1e6 < upTo) takeV.push(videoChunks.shift());", 'ניקוז התור'],
    ["const vArr = mkSamples(takeV, VT, false);", 'אריזת הווידאו'],
    ["if(vShift) for(const s of vArr){ s.pts += vShift; s.cto += vShift; }", 'הזזת הווידאו מול B-frames'],
    ["if(aOff) for(const s of aArr){ s.dts += aOff; s.pts += aOff; }", 'הזזת הקול מול B-frames']])
    ok(page.includes(frag), `הקוד שנבדק כאן הוא הקוד שבדף — ${label}`);

  const { mp4Index } = require('./mp4demux.js');
  const buf = fs.readFileSync(SRC);
  const blob = { size: buf.length, slice:(a,b)=>({ arrayBuffer: async()=>
      buf.buffer.slice(buf.byteOffset+a, buf.byteOffset+(b===undefined?buf.length:b)) }) };
  const idx = await mp4Index(blob);
  let minPts = Infinity;
  for(let i=0;i<idx.n;i++) if(idx.pts[i] < minPts) minPts = idx.pts[i];
  /* מקודד WebCodecs מחזיר את החותמות שנתנו לו — אי-שליליות, מאפס */
  const chunks = [];
  for(let i=0;i<idx.n;i++) chunks.push({
    timestamp: Math.round((idx.pts[i]-minPts)*1e6), type: idx.key[i]?'key':'delta',
    data: Array.from(new Uint8Array(buf.buffer, buf.byteOffset+idx.off[i], idx.size[i])) });
  const outOfOrder = chunks.some((c,i)=>i && c.timestamp < chunks[i-1].timestamp);
  ok(outOfOrder, 'קובץ הבדיקה באמת מכיל B-frames (אחרת הבדיקה חסרת ערך)');
  const dur = idx.n/25;

  const b = await chromium.launch({args:['--no-sandbox']});
  const p = await b.newPage();
  const errors=[]; p.on('pageerror',e=>errors.push(String(e).split('\n')[0]));
  await p.goto('file://'+HTML);

  const out = await p.evaluate(({chunks, avcC, dur})=>{
    const VT=90000, AT=48000, W=640, H=360;
    const videoChunks = chunks.map(c=>({timestamp:c.timestamp,type:c.type,data:new Uint8Array(c.data)}));
    const audioChunks = [];
    for(let i=0;i*0.02<dur;i++) audioChunks.push({timestamp:Math.round(i*0.02*1e6), data:new Uint8Array(8)});
    const mkSamples = (cs, ts, keyAll)=>{
      const pts = cs.map(c=>Math.round(c.timestamp/1e6*ts));
      const dts = pts.slice().sort((x,y)=>x-y);
      const arr = cs.map((c,i)=>({pts:pts[i],dts:dts[i],cto:pts[i]-dts[i],
        key:keyAll||c.type==='key',data:c.data}));
      for(let i=0;i<arr.length;i++)
        arr[i].dur = i<arr.length-1 ? Math.max(1,dts[i+1]-dts[i]) : (arr[i-1]?arr[i-1].dur:Math.round(ts/25));
      return arr;
    };
    let oo=false; for(let i=1;i<videoChunks.length;i++)
      if(videoChunks[i].timestamp<videoChunks[i-1].timestamp) oo=true;
    const fileParts=[]; let mp4Seq=1, flushedTo=0, headerDone=false, vShift=0;
    const flushParts = final=>{
      if(oo && !final) return;
      if(oo && final){
        fileParts.length=0; headerDone=false; mp4Seq=1;
        const ps=videoChunks.map(c=>Math.round(c.timestamp/1e6*VT));
        const ds=ps.slice().sort((x,y)=>x-y);
        vShift=0; for(let i=0;i<ps.length;i++) if(ds[i]-ps[i]>vShift) vShift=ds[i]-ps[i];
      }
      if(!headerDone){
        fileParts.push(mp4Head({width:W,height:H,vTimescale:VT,aTimescale:AT,channels:1,
          durationMs:dur*1000+vShift/VT*1000, avcC:new Uint8Array(avcC), asc:new Uint8Array([0x11,0x90])}));
        headerDone=true;
      }
      const lastTs = videoChunks.length ? videoChunks[videoChunks.length-1].timestamp/1e6 : 0;
      const upTo = final ? Infinity : lastTs-2;
      if(!final && upTo <= flushedTo+2) return;
      const takeV=[], takeA=[];
      while(videoChunks.length && videoChunks[0].timestamp/1e6 < upTo) takeV.push(videoChunks.shift());
      while(audioChunks.length && audioChunks[0].timestamp/1e6 < upTo) takeA.push(audioChunks.shift());
      if(takeV.length){
        const vArr = mkSamples(takeV, VT, false);
        if(vShift) for(const s of vArr){ s.pts += vShift; s.cto += vShift; }
        for(const f of mp4Split(vArr, VT, 2)) fileParts.push(mp4Fragment(1,f.samples,f.base,mp4Seq++));
      }
      if(takeA.length){
        const aArr = mkSamples(takeA, AT, true);
        const aOff = Math.round(vShift/VT*AT);
        if(aOff) for(const s of aArr){ s.dts += aOff; s.pts += aOff; }
        for(const f of mp4Split(aArr, AT, 2)) fileParts.push(mp4Fragment(2,f.samples,f.base,mp4Seq++));
      }
      flushedTo = isFinite(upTo) ? upTo : flushedTo;
    };
    const total = videoChunks.length;
    for(let d=250; d<total; d+=250) flushParts(false);
    flushParts(true);
    let n=0; for(const x of fileParts) n+=x.byteLength;
    const all=new Uint8Array(n); let o=0;
    for(const x of fileParts){ all.set(x,o); o+=x.byteLength; }
    return { bytes: Array.from(all), left: videoChunks.length, vShift };
  }, {chunks, avcC: Array.from(idx.description), dur});

  ok(out.left===0,'כל הפריימים נארזו',out.left+' נשארו');
  const path='/tmp/mp4pack.mp4';
  fs.writeFileSync(path, Buffer.from(out.bytes));
  const R = JSON.parse(execFileSync('python3',[__dirname+'/mp4-probe.py', SRC, path],{encoding:'utf8'}).trim());
  console.log('   ', JSON.stringify(R));
  ok(R.nOut===R.nSrc,'כל הפריימים בקובץ',`${R.nOut}/${R.nSrc}`);
  ok(R.monotonic,'חותמות הזמן עולות ברצף');
  ok(R.relMatch,'רצף החותמות זהה למקור');
  ok(Math.abs(R.avSkew)<0.005,'הקול והתמונה מתחילים יחד — אין פיגור קבוע',
     `וידאו ${R.vStart}ש׳ · קול ${R.aStart}ש׳`);
  ok(R.maxPixDiff<0.5,'התמונה זהה למקור','הפרש '+R.maxPixDiff);
  ok(R.tracks===2,'שתי רצועות',R.tracks+'');
  ok(errors.length===0,'אין שגיאות JS',errors.slice(0,2).join(' | '));
  await b.close();
  console.log(fails?`\n❌ ${fails} כשלים\n`:'\n✅ אורז ה-MP4 מפיק קובץ זהה למקור\n');
  process.exit(fails?1:0);
})().catch(e=>{console.error('CRASH',e);process.exit(2);});
