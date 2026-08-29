#!/bin/bash
FF=/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2
D=3173
set -e
$FF -y -loglevel error -f lavfi -i "testsrc2=s=1920x1080:r=30:d=$D" \
  -vf "colorchannelmixer=rr=1:rg=.35:rb=.35:gr=0:gg=.45:gb=0:br=0:bg=0:bb=.22" \
  -c:v libvpx-vp9 -deadline realtime -cpu-used 8 -row-mt 1 -b:v 5M -g 90 -pix_fmt yuv420p \
  -movflags +faststart /work/ep/camera_1.mp4
echo "CAM1 DONE $(stat -c%s /work/ep/camera_1.mp4)"
# מצלמה 2: שעון שרץ 0.02% לאט יותר — סחיפה אמיתית של 0.63ש׳ לאורך הפרק
$FF -y -loglevel error -f lavfi -i "testsrc2=s=1920x1080:r=30:d=$D" \
  -vf "colorchannelmixer=rr=.22:rg=0:rb=0:gr=0:gg=.45:gb=0:br=.35:bg=.35:bb=1,setpts=1.0002*PTS" \
  -c:v libvpx-vp9 -deadline realtime -cpu-used 8 -row-mt 1 -b:v 5M -g 90 -pix_fmt yuv420p \
  -movflags +faststart /work/ep/camera_2.mp4
echo "CAM2 DONE $(stat -c%s /work/ep/camera_2.mp4)"
