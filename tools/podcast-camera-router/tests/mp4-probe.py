# -*- coding: utf-8 -*-
import av, numpy as np, json, sys
src, out = sys.argv[1], sys.argv[2]
res={}
a=av.open(src); b=av.open(out)
fa=[f for f in a.decode(video=0)]; fb=[f for f in b.decode(video=0)]
res['nSrc']=len(fa); res['nOut']=len(fb)
ta=[round(float(f.pts*f.time_base),4) for f in fa]
tb=[round(float(f.pts*f.time_base),4) for f in fb]
res['relMatch']=[round(t-ta[0],4) for t in ta][:len(tb)]==[round(t-tb[0],4) for t in tb][:len(ta)]
res['monotonic']=all(tb[i]<tb[i+1] for i in range(len(tb)-1))
res['vStart']=tb[0]
ab=av.open(out); apk=[p for p in ab.demux(ab.streams.audio[0]) if p.pts is not None]
res['aStart']=round(float(apk[0].pts*ab.streams.audio[0].time_base),4) if apk else -99
res['avSkew']=round(res['vStart']-res['aStart'],4)
d=[]
for i in range(0,min(len(fa),len(fb)),10):
    d.append(float(np.abs(fa[i].to_ndarray(format='rgb24').astype(float)
                        - fb[i].to_ndarray(format='rgb24').astype(float)).mean()))
res['maxPixDiff']=round(max(d),3) if d else -1
c=av.open(out); res['tracks']=len(c.streams)
print(json.dumps(res))
