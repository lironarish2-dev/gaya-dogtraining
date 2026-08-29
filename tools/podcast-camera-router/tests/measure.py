# -*- coding: utf-8 -*-
"""מודד קובץ פרק שלם: אורך, סנכרון תמונה-קול לאורך כל הפרק, ותקיעות.
   מפענח דרך ffmpeg (C, מהיר) ולא פריים-פריים בפייתון, כדי שאפשר יהיה
   למדוד קובץ של 53 דקות בזמן סביר.

   המצלמות: מצלמה 1 נוטה לאדום, מצלמה 2 לכחול.
   הדוברות: דוברת 1 = 220Hz, דוברת 2 = 430Hz.
"""
import subprocess, sys, json, numpy as np, os

FF = '/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2'
FP = FF.replace('ffmpeg-linux', 'ffprobe-linux')
if not os.path.exists(FP):
    FP = None
path = sys.argv[1]
GRID = 16

def probe():
    out = subprocess.run([FF, '-hide_banner', '-i', path], capture_output=True, text=True).stderr
    return out

# ---------- וידאו: רשת 16x16 לכל פריים ----------
def video_signal():
    p = subprocess.Popen(
        [FF, '-v', 'error', '-i', path, '-map', '0:v:0',
         '-vf', f'scale={GRID}:{GRID}:flags=area,format=rgb24',
         '-f', 'rawvideo', '-'], stdout=subprocess.PIPE)
    raw = p.stdout.read(); p.wait()
    n = len(raw) // (GRID*GRID*3)
    a = np.frombuffer(raw[:n*GRID*GRID*3], dtype=np.uint8).reshape(n, GRID*GRID, 3).astype(np.float32)
    return a

# ---------- חותמות הזמן של הפריימים ----------
def video_pts():
    p = subprocess.Popen(
        [FF, '-v', 'error', '-i', path, '-map', '0:v:0',
         '-f', 'null', '-vsync', '0', '-'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    p.wait()
    return None

# ---------- אודיו: מונו 8kHz ----------
def audio_signal():
    p = subprocess.Popen(
        [FF, '-v', 'error', '-i', path, '-map', '0:a:0',
         '-ac', '1', '-ar', '8000', '-f', 'f32le', '-'], stdout=subprocess.PIPE)
    raw = p.stdout.read(); p.wait()
    return np.frombuffer(raw, dtype=np.float32)

V = video_signal()
A = audio_signal()
ASR = 8000
res = {}
nv = len(V)
res['videoFrames'] = int(nv)
res['audioSeconds'] = round(len(A)/ASR, 2)

# קצב הפריימים בפועל, מהיחס בין מספר הפריימים לאורך הקול
fps = nv/max(len(A)/ASR, 1e-9)
res['fps'] = round(float(fps), 2)
vt = np.arange(nv)/fps                      # זמן משוער לכל פריים

# ---------- מי על המסך: אדום מול כחול ----------
mean = V.mean(axis=1)                        # (n,3)
state = np.where(mean[:,0] > mean[:,2], 0, 1)
# מעברי תמונה
vsw = [(float(vt[i]), int(state[i])) for i in range(1, nv) if state[i] != state[i-1]]
res['videoSwitches'] = len(vsw)

# ---------- תקיעות: פריימים כפולים ----------
flat = V.reshape(nv, -1)
diff = np.abs(np.diff(flat, axis=0)).mean(axis=1)
dup = diff < 0.6                             # כמעט זהה לקודם = פריים כפול
res['dupFrames'] = int(dup.sum())
res['dupPct'] = round(float(dup.mean()*100), 2)
# הרצף הארוך ביותר של פריימים כפולים = הקפיאה הארוכה ביותר
longest = 0; cur = 0
for d in dup:
    cur = cur+1 if d else 0
    if cur > longest: longest = cur
res['longestFreezeSec'] = round(longest/fps, 3)
# פריימים ייחודיים לשנייה
res['uniqueFps'] = round(float((~dup).sum()/max(len(A)/ASR,1e-9)), 2)

# ---------- מי מדברת: 220 מול 430 הרץ ----------
hop = int(ASR*0.02); win = int(ASR*0.05)
na = (len(A)-win)//hop
ast = np.full(na, -1, dtype=int); att = np.arange(na)*0.02
for i in range(na):
    seg = A[i*hop:i*hop+win]
    if np.abs(seg).mean() < 0.015:
        continue
    seg = seg - seg.mean()
    zc = np.count_nonzero(np.diff(np.signbit(seg)))
    f = zc/2/(win/ASR)
    ast[i] = 0 if f < 320 else 1
# תחילת דיבור של דוברת חדשה: רצף יציב שקודמו (מעבר לשקט) היה השנייה
asw = []
i = 0
last = -1
while i < na:
    if ast[i] < 0:
        i += 1; continue
    j = i
    while j < na and ast[j] == ast[i]: j += 1
    if (j-i)*0.02 >= 1.0:                     # רצף דיבור אמיתי
        if last >= 0 and ast[i] != last:
            asw.append((float(att[i]), int(ast[i])))
        last = int(ast[i])
    i = j
res['audioSwitches'] = len(asw)

# ---------- התאמה: לכל מעבר קול, המעבר החזותי הקרוב ----------
offs = []
for (at, who) in asw:
    best = None
    for (vtm, vwho) in vsw:
        if vwho != who: continue
        d = vtm - at
        if best is None or abs(d) < abs(best): best = d
    if best is not None and abs(best) < 5:
        offs.append((at, best))
res['matched'] = len(offs)
if offs:
    o = np.array([x[1] for x in offs]); t = np.array([x[0] for x in offs])
    res['offMean'] = round(float(o.mean()), 3)
    res['offStd']  = round(float(o.std()), 3)
    res['offMin']  = round(float(o.min()), 3)
    res['offMax']  = round(float(o.max()), 3)
    k = max(3, len(o)//5)
    res['offFirst'] = round(float(o[:k].mean()), 3)
    res['offLast']  = round(float(o[-k:].mean()), 3)
    res['drift']    = round(res['offLast'] - res['offFirst'], 3)
    # שיא הסטייה בכל חמישית של הפרק — מגלה בעיה שמופיעה רק באמצע
    res['perFifth'] = [round(float(o[(len(o)*q)//5:(len(o)*(q+1))//5].mean()), 3) for q in range(5)]
print(json.dumps(res, ensure_ascii=False))
