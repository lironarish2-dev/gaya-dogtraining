/* mp4Index — מפענח מבנה (demuxer) ל-MP4: קורא את טבלאות ה-moov ומחזיר
   לכל דגימת וידאו את המיקום, הגודל, החותמות והאם היא פריים-מפתח.
   עובד על Blob/File (גם בדפדפן וגם ב-Node), קורא רק את הכותרות —
   לא את המדיה עצמה, ולכן מהיר גם על קובץ של 2GB.
   תומך ב-avc1/avc3 (H.264, כולל B-frames דרך ctts) וב-vp09. */
async function mp4Index(file){
  const str4 = (dv,p)=>String.fromCharCode(dv.getUint8(p),dv.getUint8(p+1),dv.getUint8(p+2),dv.getUint8(p+3));
  const read = async (off,len)=>new DataView(await file.slice(off, off+len).arrayBuffer());

  /* סריקת הקופסאות העליונות עד שמוצאים moov — לפעמים הוא בסוף הקובץ */
  let pos = 0, moov = null;
  while(pos + 8 <= file.size){
    const h = await read(pos, Math.min(16, file.size - pos));
    let size = h.getUint32(0), hdr = 8;
    const type = str4(h, 4);
    if(size === 1){ size = Number(h.getBigUint64(8)); hdr = 16; }
    else if(size === 0) size = file.size - pos;
    if(size < hdr) throw new Error('mp4: קופסה שבורה ב-'+pos);
    if(type === 'moov'){ moov = { dv: await read(pos, size), hdr }; break; }
    pos += size;
  }
  if(!moov) throw new Error('mp4: אין moov');
  const dv = moov.dv;

  function* boxes(lo, hi){
    let p = lo;
    while(p + 8 <= hi){
      let size = dv.getUint32(p), hdr = 8;
      const type = str4(dv, p+4);
      if(size === 1){ size = Number(dv.getBigUint64(p+8)); hdr = 16; }
      else if(size === 0) size = hi - p;
      if(size < hdr || p + size > hi) break;
      yield { type, lo: p+hdr, hi: p+size };
      p += size;
    }
  }
  const find = (lo,hi,t)=>{ for(const b of boxes(lo,hi)) if(b.type===t) return b; return null; };

  /* בחירת ה-trak של הווידאו */
  let best = null;
  for(const trak of boxes(moov.hdr, dv.byteLength)){
    if(trak.type !== 'trak') continue;
    const mdia = find(trak.lo, trak.hi, 'mdia'); if(!mdia) continue;
    const hdlr = find(mdia.lo, mdia.hi, 'hdlr'); if(!hdlr) continue;
    if(str4(dv, hdlr.lo + 8) !== 'vide') continue;
    best = { trak, mdia }; break;
  }
  if(!best) throw new Error('mp4: אין רצועת וידאו');

  const mdhd = find(best.mdia.lo, best.mdia.hi, 'mdhd');
  const mdhdV = dv.getUint8(mdhd.lo);
  const timescale = mdhdV === 1 ? dv.getUint32(mdhd.lo + 20) : dv.getUint32(mdhd.lo + 12);
  const mediaDur = mdhdV === 1 ? Number(dv.getBigUint64(mdhd.lo + 24)) : dv.getUint32(mdhd.lo + 16);

  /* elst: הזחת עריכה — קובצי מצלמה/אייפון לעיתים פותחים בהיסט קטן */
  let editShift = 0;
  const edts = find(best.trak.lo, best.trak.hi, 'edts');
  if(edts){
    const elst = find(edts.lo, edts.hi, 'elst');
    if(elst){
      const v = dv.getUint8(elst.lo), n = dv.getUint32(elst.lo + 4);
      let p = elst.lo + 8;
      for(let i=0;i<n;i++){
        const mt = v===1 ? Number(dv.getBigInt64(p+8)) : dv.getInt32(p+4);
        if(mt >= 0){ editShift = mt / timescale; break; }   // -1 = רשומת השהיה, ממשיכים
        p += v===1 ? 20 : 12;
      }
    }
  }

  const minf = find(best.mdia.lo, best.mdia.hi, 'minf');
  const stbl = find(minf.lo, minf.hi, 'stbl');

  /* stsd — סוג הקידוד, מידות, ותיאור המפענח */
  const stsd = find(stbl.lo, stbl.hi, 'stsd');
  let codec = null, description = null, width = 0, height = 0;
  for(const e of boxes(stsd.lo + 8, stsd.hi)){
    const fmt = e.type;
    if(!/^(avc1|avc3|vp09|hev1|hvc1)$/.test(fmt)) continue;
    width  = dv.getUint16(e.lo + 24); height = dv.getUint16(e.lo + 26);
    const kids = e.lo + 78;                       // VisualSampleEntry: 78 בייטים של שדות
    if(fmt === 'avc1' || fmt === 'avc3'){
      const avcC = find(kids, e.hi, 'avcC');
      if(!avcC) throw new Error('mp4: avc1 בלי avcC');
      description = new Uint8Array(dv.buffer, dv.byteOffset + avcC.lo, avcC.hi - avcC.lo).slice();
      codec = 'avc1.' + [1,2,3].map(i=>description[i].toString(16).padStart(2,'0')).join('');
    } else if(fmt === 'vp09'){
      const vpcC = find(kids, e.hi, 'vpcC');
      if(vpcC){
        const prof = dv.getUint8(vpcC.lo + 4), lvl = dv.getUint8(vpcC.lo + 5);
        const bd = dv.getUint8(vpcC.lo + 6) >> 4;
        codec = `vp09.${String(prof).padStart(2,'0')}.${String(lvl).padStart(2,'0')}.${String(bd).padStart(2,'0')}`;
      } else codec = 'vp09.00.10.08';
    } else throw new Error('mp4: קידוד לא נתמך בכלי הזה: ' + fmt);
    break;
  }
  if(!codec) throw new Error('mp4: לא זוהה קידוד וידאו נתמך');

  const fullbox = b => ({ n: dv.getUint32(b.lo + 4), p: b.lo + 8, v: dv.getUint8(b.lo) });

  /* stts → משכי דגימות → dts מצטבר */
  const stts = fullbox(find(stbl.lo, stbl.hi, 'stts'));
  let total = 0;
  { let p = stts.p; for(let i=0;i<stts.n;i++){ total += dv.getUint32(p); p += 8; } }
  /* MP4 מפורק (fragmented) מחזיק את הדגימות ב-moof, לא כאן — שייפול
     חזרה ללכידת מסך במקום לייצר קובץ ריק */
  if(!total) throw new Error('mp4: אין טבלת דגימות (קובץ מפורק?)');
  const dts = new Float64Array(total), pts = new Float64Array(total);
  { let p = stts.p, s = 0, t = 0;
    for(let i=0;i<stts.n;i++){
      const cnt = dv.getUint32(p), del = dv.getUint32(p+4); p += 8;
      for(let j=0;j<cnt;j++){ dts[s++] = t; t += del; }
    } }

  /* ctts → היסט הצגה (B-frames). בגרסה 1 ההיסט חתום.
     ברירת מחדל pts=dts, וההיסטים משוכתבים עליה */
  pts.set(dts);
  const cttsB = find(stbl.lo, stbl.hi, 'ctts');
  if(cttsB){
    const c = fullbox(cttsB);
    let p = c.p, s = 0;
    for(let i=0;i<c.n && s<total;i++){
      const cnt = dv.getUint32(p);
      const off = c.v === 1 ? dv.getInt32(p+4) : dv.getUint32(p+4);
      p += 8;
      for(let j=0;j<cnt && s<total;j++){ pts[s] = dts[s] + off; s++; }
    }
  }

  /* stss → פריימים-מפתח (בהיעדרו — כולם) */
  const key = new Uint8Array(total);
  const stssB = find(stbl.lo, stbl.hi, 'stss');
  if(stssB){
    const s = fullbox(stssB);
    let p = s.p;
    for(let i=0;i<s.n;i++){ const idx = dv.getUint32(p) - 1; if(idx>=0 && idx<total) key[idx] = 1; p += 4; }
  } else key.fill(1);

  /* stsz → גדלים */
  const stszB = find(stbl.lo, stbl.hi, 'stsz');
  const uniform = dv.getUint32(stszB.lo + 4);
  const size = new Uint32Array(total);
  if(uniform) size.fill(uniform);
  else { let p = stszB.lo + 12; for(let i=0;i<total;i++){ size[i] = dv.getUint32(p); p += 4; } }

  /* stsc + stco/co64 → מיקום כל דגימה בקובץ */
  const stscB = fullbox(find(stbl.lo, stbl.hi, 'stsc'));
  let stcoB = find(stbl.lo, stbl.hi, 'stco'), co64 = false;
  if(!stcoB){ stcoB = find(stbl.lo, stbl.hi, 'co64'); co64 = true; }
  const chunks = fullbox(stcoB);
  const off = new Float64Array(total);
  { let s = 0, entry = 0;
    for(let ch = 0; ch < chunks.n && s < total; ch++){
      /* כמה דגימות בצ'אנק הזה לפי טבלת ה-stsc */
      while(entry + 1 < stscB.n && dv.getUint32(stscB.p + (entry+1)*12) - 1 <= ch) entry++;
      const perChunk = dv.getUint32(stscB.p + entry*12 + 4);
      let base = co64 ? Number(dv.getBigUint64(chunks.p + ch*8)) : dv.getUint32(chunks.p + ch*4);
      for(let j=0;j<perChunk && s<total;j++){ off[s] = base; base += size[s]; s++; }
    } }

  /* שניות + הזחת עריכה; ומיפוי פריימים-מפתח לחיפוש מהיר */
  const ptsSec = new Float64Array(total), dtsSec = new Float64Array(total);
  for(let i=0;i<total;i++){ ptsSec[i] = pts[i]/timescale - editShift; dtsSec[i] = dts[i]/timescale; }
  const keyList = [];
  for(let i=0;i<total;i++) if(key[i]) keyList.push(i);
  if(!keyList.length) keyList.push(0);

  return { codec, description, timescale, width, height, n: total,
           off, size, pts: ptsSec, dts: dtsSec, key, keyList,
           dur: mediaDur/timescale - editShift,
           /* אינדקס הדגימה (בסדר הקובץ) של הפריים-מפתח האחרון שזמן
              ההצגה שלו ≤ ft — נקודת ההתחלה לפענוח */
           keyBefore(ft){
             let lo = 0, hi = keyList.length - 1, ans = keyList[0];
             while(lo <= hi){ const m = (lo+hi)>>1, i = keyList[m];
               if(ptsSec[i] <= ft + 1e-6){ ans = i; lo = m+1; } else hi = m-1; }
             return ans;
           } };
}

if(typeof module !== 'undefined') module.exports = { mp4Index };
