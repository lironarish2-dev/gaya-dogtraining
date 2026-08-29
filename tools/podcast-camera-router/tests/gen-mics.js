/* שני מיקרופונים בפרופיל של הלקוחה: WAV סטריאו 16-ביט 48kHz, 53 דקות.
   תור דיבור של 19.7 שניות עם 1.6ש׳ שקט בסופו; דוברת 1 = 220Hz,
   דוברת 2 = 430Hz, ודליפה של -20dB מהשנייה — כדי שדחיית הדליפה
   באמת תיבדק. */
const fs = require('fs');
const OUT = '/work/ep';
const SR = 48000, DUR = 3173, TURN = 19.7;
const turnOf = t => Math.floor(t/TURN) % 2;
const gapAt  = t => (t % TURN) > TURN - 1.6;

function writeWav(path, mic){
  const n = Math.floor(DUR*SR), dataLen = n*4;
  const h = Buffer.alloc(44);
  h.write('RIFF',0); h.writeUInt32LE(36+dataLen,4); h.write('WAVE',8);
  h.write('fmt ',12); h.writeUInt32LE(16,16); h.writeUInt16LE(1,20); h.writeUInt16LE(2,22);
  h.writeUInt32LE(SR,24); h.writeUInt32LE(SR*4,28); h.writeUInt16LE(4,32); h.writeUInt16LE(16,34);
  h.write('data',36); h.writeUInt32LE(dataLen,40);
  const fd = fs.openSync(path,'w'); fs.writeSync(fd,h);
  const fMe = mic===0 ? 220 : 430, fOther = mic===0 ? 430 : 220;
  const CH = SR*30, buf = Buffer.alloc(CH*4);
  for(let s=0; s<n; s+=CH){
    const m = Math.min(CH, n-s);
    for(let i=0;i<m;i++){
      const t = (s+i)/SR;
      const me    = (!gapAt(t) && turnOf(t)===mic)   ? 1 : 0;
      const other = (!gapAt(t) && turnOf(t)===1-mic) ? 1 : 0;
      /* אמפליטודה שמשתנה לאט — כמו דיבור אמיתי, לא טון קבוע */
      const env = 0.62 + 0.38*Math.abs(Math.sin(2*Math.PI*3.3*t));
      const v = Math.max(-1, Math.min(1,
        0.6*me*env*Math.sin(2*Math.PI*fMe*t) +
        0.06*other*env*Math.sin(2*Math.PI*fOther*t) +
        0.0035*Math.sin(2*Math.PI*2971*t)));
      const q = Math.round(v*32767);
      buf.writeInt16LE(q, i*4); buf.writeInt16LE(Math.round(q*0.94), i*4+2);
    }
    fs.writeSync(fd, buf, 0, m*4);
  }
  fs.closeSync(fd);
  return fs.statSync(path).size;
}
console.log('mic_1:', writeWav(`${OUT}/mic_1.wav`, 0));
console.log('mic_2:', writeWav(`${OUT}/mic_2.wav`, 1));
