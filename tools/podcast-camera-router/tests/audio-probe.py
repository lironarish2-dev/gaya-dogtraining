# -*- coding: utf-8 -*-
"""תדר הדיבור ורציפותו בקובץ שיצא."""
import subprocess, sys, json, numpy as np
FF='/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2'
p = subprocess.Popen([FF,'-v','error','-i',sys.argv[1],'-map','0:a:0','-ac','1','-ar','48000',
                      '-f','f32le','-'], stdout=subprocess.PIPE)
x = np.frombuffer(p.stdout.read(), dtype=np.float32).astype(np.float64); p.wait()
sr = 48000; hop = int(sr*0.02)
env = np.array([np.abs(x[i:i+hop]).mean() for i in range(0, len(x)-hop, hop)])
peak = float(env.max()) if len(env) else 0.0
loud = env > peak*0.25
freqs, runs = [], []
i = 0
while i < len(loud):
    if not loud[i]: i += 1; continue
    j = i
    while j < len(loud) and loud[j]: j += 1
    runs.append((j-i)*0.02)
    if (j-i)*0.02 >= 0.5:
        seg = x[int((i+5)*hop):int((j-5)*hop)]
        if len(seg) > sr//8:
            seg = seg - seg.mean()
            zc = np.count_nonzero(np.diff(np.signbit(seg)))
            freqs.append(round(zc/2/(len(seg)/sr), 1))
    i = j
lens = sorted(runs); med = lens[len(lens)//2] if lens else 0.0
print(json.dumps({'dur': round(len(x)/sr,2), 'peak': round(peak,4),
                  'freqs': freqs, 'runs': len(runs), 'medRun': round(med,2)}))
