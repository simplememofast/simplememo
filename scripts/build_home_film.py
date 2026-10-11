#!/usr/bin/env python3
"""Render the homepage's silent, illustrated capture film (not an app recording).

Requires Pillow, ffmpeg and a Japanese font. Set VIDEO_FONT_R / VIDEO_FONT_B
on hosts without Noto Sans CJK. Benchmark values come only from the ledger.
Run with --stills to review the storyboard before encoding the full film.
"""
from pathlib import Path
import argparse
import hashlib
import json
import math
import os
import shutil
import subprocess

from PIL import Image, ImageDraw, ImageFont
from check_home_film import measurement_errors, measurement_snapshot, shown

ROOT = Path(__file__).resolve().parents[1]
W, H, FPS, DURATION = 1280, 800, 30, 18
SCALE = 2  # Draw vector-like typography at Retina resolution, not an upscaled bitmap.
BG, INK, MUTED, ACCENT = '#09090f', '#f5f1fa', '#aaa3ba', '#d3baff'
FONTS = {}
SCALED_FONTS = {}


class FilmDraw:
    def __init__(self, image):
        self.draw = ImageDraw.Draw(image)

    def coords(self, values):
        return [tuple(v*SCALE for v in point) if isinstance(point,(tuple,list)) else point*SCALE for point in values]

    def line(self, coords, **kwargs):
        kwargs['width'] = kwargs.get('width',1)*SCALE
        self.draw.line(self.coords(coords),**kwargs)

    def rounded_rectangle(self, coords, radius, **kwargs):
        kwargs['width'] = kwargs.get('width',1)*SCALE
        self.draw.rounded_rectangle(self.coords(coords),radius=radius*SCALE,**kwargs)

    def ellipse(self, coords, **kwargs):
        self.draw.ellipse(self.coords(coords),**kwargs)

    def text(self, xy, value, font, **kwargs):
        key=(font.path,font.size)
        if key not in SCALED_FONTS:
            SCALED_FONTS[key]=font.font_variant(size=font.size*SCALE)
        self.draw.text(tuple(v*SCALE for v in xy),value,font=SCALED_FONTS[key],**kwargs)


def font(size, bold=False):
    key = (size, bold)
    if key not in FONTS:
        name = 'VIDEO_FONT_B' if bold else 'VIDEO_FONT_R'
        default = '/usr/share/fonts/opentype/noto/NotoSansCJK-' + ('Bold' if bold else 'Regular') + '.ttc'
        FONTS[key] = ImageFont.truetype(os.environ.get(name, default), size)
    return FONTS[key]


def text(draw, xy, value, size, color=INK, bold=False, anchor='lt'):
    draw.text(xy, value, font=font(size, bold), fill=color, anchor=anchor)


def ramp(t, start, length=0.9):
    x = min(1, max(0, (t-start)/length))
    return 1 - (1-x)**3


def blend_color(a, b, amount):
    return tuple(round(x+(y-x)*amount) for x,y in zip(a,b))


def background():
    # Quiet radial light, with no flickering particles or decorative noise.
    small = Image.new('RGB', (320, 200))
    pixels = small.load()
    for y in range(200):
        for x in range(320):
            light = math.exp(-(((x-245)/100)**2+((y-90)/110)**2))
            pixels[x,y] = blend_color((9,9,15), (36,26,48), light*0.72)
    return small.resize((W*SCALE,H*SCALE), Image.Resampling.BICUBIC)


BACKGROUND = None


def page(chapter, progress):
    im = BACKGROUND.copy()
    d = FilmDraw(im)
    text(d, (68, 49), 'SIMPLE MEMO', 18, ACCENT)
    text(d, (1212, 49), 'CAPTURE, THEN GO.', 15, MUTED, anchor='rt')
    d.line((68,91,1212,91), fill='#352d40', width=1)
    # The browser's transport controls occupy the bottom of the frame.
    # Keep chapter progress in the header, so pausing never covers a label.
    d.line((68,91,68+1144*(chapter+progress)/4,91),fill=ACCENT,width=2)
    return im


def note(draw, box, ink=1, lift=0):
    x,y,w,h = box
    y += lift
    draw.rounded_rectangle((x+12,y+18,x+w+12,y+h+18),radius=25,fill='#07070d')
    draw.rounded_rectangle((x,y,x+w,y+h),radius=25,fill='#eeebf5',outline='#ffffff',width=1)
    text(draw,(x+35,y+32),'MEMO',15,'#746481')
    draw.line((x+35,y+69,x+w-35,y+69),fill='#d4cddd',width=1)
    message = '明日のアイデアを、ひとつ。'
    shown = message[:round(len(message)*ink)]
    for i,line in enumerate((shown[:9],shown[9:])):
        text(draw,(x+35,y+100+i*45),line,29,'#272131',True)
    if ink<1:
        caret_x=x+35+font(29,True).getlength(shown if len(shown)<=9 else shown[9:])
        caret_y=y+100+(45 if len(shown)>9 else 0)
        draw.line((caret_x+4,caret_y-2,caret_x+4,caret_y+32),fill='#775b9b',width=2)


def opening(t, poster=False):
    im=page(0,min(t/4,1));d=FilmDraw(im)
    text(d,(68,143),'思いついた、その瞬間に。',24,MUTED)
    lines=('ひらく。','書く。','送る。')
    for i,line in enumerate(lines):
        a=1 if poster else ramp(t,0.12+i*0.16,0.9)
        text(d,(60,218+i*126+round((1-a)*22)),line,106,ACCENT if i==2 else INK,True)
    # A paper diagram, intentionally without device chrome or invented app UI.
    x=770
    for i in range(3,0,-1):
        d.rounded_rectangle((x+i*12,260-i*14,x+358+i*12,546-i*14),radius=25,
                            fill=('#111019','#17131f','#211a2c')[i-1],outline='#493855',width=1)
    note(d,(x,274,358,286),1,lift=-5*math.sin(t*.7) if not poster else 0)
    d.line((690,410,744,410),fill=ACCENT,width=2)
    d.ellipse((682,406,690,414),fill=ACCENT)
    text(d,(948,605),'ひとつのメモを、いつもの場所へ。',19,MUTED,anchor='mt')
    return im


def writing(t):
    im=page(1,min(t/4,1));d=FilmDraw(im)
    text(d,(68,170),'02 / CAPTURE',19,ACCENT)
    text(d,(60,260),'話しても。',84,INK,True)
    text(d,(60,369),'打っても。',84,INK,True)
    text(d,(68,523),'思いついた言葉を、そのまま。',26,MUTED)
    note(d,(742,216,414,347),ramp(t,.3,3.2))
    # Smooth amplitude envelope; no attempt to represent a real recording.
    for i in range(31):
        x=793+i*10
        envelope=math.sin(math.pi*i/30)**1.5
        height=5+envelope*(10+18*(.5+.5*math.sin(t*4+i*.8)))
        d.rounded_rectangle((x,612-height/2,x+3,612+height/2),radius=2,fill=ACCENT)
    return im


def sending(t):
    im=page(2,min(t/4,1));d=FilmDraw(im)
    text(d,(68,154),'03 / SEND',19,ACCENT)
    text(d,(60,217),'いつもの場所へ。',78,INK,True)
    text(d,(68,323),'自分宛メールに。Obsidianのノートに。',25,MUTED)
    # Two independent destinations. Never imply email is the Obsidian bridge.
    d.rounded_rectangle((85,453,415,596),radius=20,fill='#ede9f4')
    text(d,(121,478),'MEMO',16,'#766287')
    text(d,(121,519),'思いついたこと',30,'#272131',True)
    p=ramp(t,.4,1.8)
    routes=[[(415,524),(638,524),(638,448),(834,448)],[(415,524),(638,524),(638,604),(834,604)]]
    for path in routes:
        d.line(path,fill='#594669',width=2)
        # Draw the moving light along the true polyline, not a straight shortcut.
        lengths=[abs(b[0]-a[0])+abs(b[1]-a[1]) for a,b in zip(path,path[1:])]
        distance=sum(lengths)*p
        for a,b,length in zip(path,path[1:],lengths):
            if distance<=length:
                q=distance/length
                px=a[0]+(b[0]-a[0])*q;py=a[1]+(b[1]-a[1])*q
                d.ellipse((px-5,py-5,px+5,py+5),fill=ACCENT)
                break
            distance-=length
    for y,label in ((448,'メール'),(604,'Obsidian')):
        d.rounded_rectangle((838,y-47,1179,y+47),radius=15,fill='#1a1523',outline='#58456b',width=1)
        text(d,(871,y-20),label,31,INK,True)
        if p>.99:
            d.line((1117,y,1127,y+9,1146,y-13),fill=ACCENT,width=3)
    text(d,(68,665),'事前に送信先とObsidian連携の設定が必要です。',18,MUTED)
    return im


def measured(t,ready):
    im=page(3,min(t/6,1));d=FilmDraw(im)
    text(d,(68,161),'入力できるまで。',45,INK,True)
    text(d,(60,240),shown(ready),210,ACCENT,True)
    text(d,(470,397),'秒',38,ACCENT)
    text(d,(68,515),'アイコンをタップ → 入力開始',25,INK)
    d.line((647,177,647,650),fill='#44344f',width=1)
    text(d,(706,240),'思いついた',59,INK,True)
    text(d,(706,325),'速さのまま、',59,INK,True)
    text(d,(706,410),'残す。',74,ACCENT,True)
    text(d,(68,588),'iPhone 16e / ウォーム起動の実測',21,MUTED)
    text(d,(68,626),'書く時間・送信時間は含みません。',20,MUTED)
    text(d,(706,588),'計測条件・アプリ別の比較は動画の下へ。',19,MUTED)
    text(d,(706,626),'simplememofast.com',20,MUTED)
    return im


def frame(t,ready):
    if t<4:return opening(t)
    if t<8:return writing(t-4)
    if t<12:return sending(t-8)
    return measured(t-12,ready)


def main():
    global BACKGROUND
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--stills',type=Path,help='Export storyboard frames only')
    args=ap.parse_args()
    BACKGROUND=background()
    ledger=json.loads((ROOT/'data/benchmark.json').read_text())
    if errors:=measurement_errors(ledger):
        raise SystemExit('Review the film and its explanation before rendering: '+ '; '.join(errors))
    ready=ledger['apps']['Simple Memo - for Obsidian']['ready']
    if args.stills:
        args.stills.mkdir(parents=True,exist_ok=True)
        for t in (2,6,10,15):frame(t,ready).save(args.stills/f'frame-{t:02}.png')
        return
    out=ROOT/'assets/video'
    target=out/'capture-home.mp4'
    ffmpeg=os.environ.get('FFMPEG') or shutil.which('ffmpeg')
    if not ffmpeg:raise SystemExit('ffmpeg is required')
    command=[ffmpeg,'-y','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W*SCALE}x{H*SCALE}',
             '-r',str(FPS),'-i','pipe:0','-an','-c:v','libx264','-preset','slow','-crf','21',
             '-pix_fmt','yuv420p','-movflags','+faststart','-map_metadata','-1',str(target)]
    with subprocess.Popen(command,stdin=subprocess.PIPE) as process:
        for n in range(DURATION*FPS):
            t=n/FPS
            current=frame(t,ready)
            # Brief restrained dissolves between chapters; hold most of each shot.
            for boundary in (4,8,12):
                if boundary<=t<boundary+.45:
                    previous=frame(boundary-.001,ready)
                    current=Image.blend(previous,current,ramp(t,boundary,.45))
            process.stdin.write(current.tobytes())
        process.stdin.close()
        if process.wait():raise SystemExit('Video encoder failed')
    opening(2,poster=True).save(out/'capture-home-poster.jpg',quality=92,optimize=True)
    metadata={'duration_s':DURATION,'width':W*SCALE,'height':H*SCALE,'fps':FPS,'bytes':target.stat().st_size,
              'type':'illustrated film; not a screen recording','language':'ja',
              'benchmark_source':'data/benchmark.json','ready_s':ready,
              'measurement':measurement_snapshot(ledger),
              'renderer_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              'poster_sha256':hashlib.sha256((out/'capture-home-poster.jpg').read_bytes()).hexdigest(),
              'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}
    (out/'capture-home.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(metadata,ensure_ascii=False))


if __name__=='__main__':main()
