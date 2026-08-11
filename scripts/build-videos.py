#!/usr/bin/env python3
"""
Build the site's explainer videos from stills.

    python3 scripts/build-videos.py [--only ai-tags] [--out assets/video]

Why this exists as a script rather than five files someone exported once:
docs/SEO_AIO_PLAN_2026-08.md §4 P0-3 found the site holds *zero* video across
240 pages while review snippets are its only rich-result surface (13
impressions in three months). Video is the one still-rendering rich-result type
the site has none of, and how-to queries like 「apple watchでメモを音声入力す
るには？」 (49 impressions, position 9.0, zero clicks) are exactly where AI
Overviews pull video in. Facts in these frames — launch timings, prices, the
watchOS limitation — go stale, so the frames are generated from values that
live in the repo and can be re-rendered when those change.

Honesty rules, which are not negotiable:

  * `siri-airpods` is built from real in-app screenshots (assets/img/siri/*.png).
  * The other four are **diagrams**, drawn as diagrams. They never imitate an
    iOS screen, because a drawn image that reads as a screenshot is a claim
    about what the app looks like, and this file cannot verify that claim.
  * Every number shown traces to data/site-constants.json or to the measured
    table in blog/fastest-memo-app-benchmark.html.
  * Each video states the relevant limitation out loud (dictation cannot
    auto-start on watchOS; delivery is plain SMTP and therefore not E2EE).

Requires Pillow and an ffmpeg binary (npm ffmpeg-static, or FFMPEG env var).
"""

import argparse
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = 1280, 720
FPS = 24

FONT_B = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
FONT_R = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'

INK = (255, 255, 255)
DIM = (150, 163, 196)
BLUE = (46, 123, 246)
PURPLE = (139, 92, 246)
GREEN = (52, 199, 133)
AMBER = (245, 183, 74)
CARD = (26, 33, 60)
CARD_EDGE = (52, 63, 102)

_font_cache = {}


def font(size, bold=True):
    key = (size, bold)
    if key not in _font_cache:
        _font_cache[key] = ImageFont.truetype(FONT_B if bold else FONT_R, size)
    return _font_cache[key]


def constants():
    with open(os.path.join(ROOT, 'data/site-constants.json'), encoding='utf-8') as f:
        return json.load(f)


# ── canvas ────────────────────────────────────────────────────────────────

def background():
    """Vertical navy gradient with a soft brand glow, drawn once per video."""
    base = Image.new('RGB', (W, H))
    d = ImageDraw.Draw(base)
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)],
               fill=(int(11 + 12 * t), int(16 + 16 * t), int(32 + 27 * t)))
    glow = Image.new('RGB', (W, H), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for r in range(420, 0, -14):
        a = int(26 * (1 - r / 420) ** 2)
        gd.ellipse([W - 300 - r, -120 - r // 2, W - 300 + r, -120 + r + r // 2],
                   fill=(a // 3, a // 2, a))
    return Image.blend(base, Image.new('RGB', (W, H), (11, 16, 32)), 0.0) \
        if glow is None else Image.blend(base, glow, 0.35)


def text(d, xy, s, size=40, bold=True, fill=INK, anchor='la'):
    d.text(xy, s, font=font(size, bold), fill=fill, anchor=anchor)


def _latin(ch):
    return ch.isascii() and (ch.isalnum() or ch in "'-.")


def wrap_ja(s, per_line):
    """
    Wrap on character count, since Japanese has no spaces — but never break
    between two Latin characters. Counting blindly split 「Hey Siri」 into
    「H / ey Siri」, which is the kind of error that only shows up once the
    frame is rendered and looked at.
    """
    out, line = [], ''
    for i, ch in enumerate(s):
        line += ch
        if ch == '\n':
            out.append(line.rstrip('\n'))
            line = ''
            continue
        nxt = s[i + 1] if i + 1 < len(s) else ''
        mid_word = _latin(ch) and _latin(nxt)
        if len(line) >= per_line and not mid_word:
            out.append(line)
            line = ''
        elif ch in '、。' and len(line) >= per_line - 4:
            out.append(line)
            line = ''
        elif len(line) >= per_line + 8:   # a very long Latin run has to break
            out.append(line)
            line = ''
    if line:
        out.append(line)
    return [ln.lstrip(' ') for ln in out]


def card(d, box, radius=18, fill=CARD, edge=CARD_EDGE, width=2):
    d.rounded_rectangle(box, radius=radius, fill=fill, outline=edge, width=width)


def ease(t):
    """Cubic ease-out; 0→1. Movement that decelerates reads as deliberate."""
    return 1 - (1 - t) ** 3


def fade(img, k):
    if k >= 1.0:
        return img
    return Image.blend(Image.new('RGB', img.size, (11, 16, 32)), img, max(0.0, k))


# ── scene helpers ─────────────────────────────────────────────────────────

def title_scene(bg, icon, kicker, title_lines, sub=None):
    im = bg.copy()
    d = ImageDraw.Draw(im)
    if icon:
        im.paste(icon, (86, 96), icon)
    text(d, (86 + (icon.width + 24 if icon else 0), 112), kicker, 22, True, BLUE)
    y = 210
    for ln in title_lines:
        text(d, (86, y), ln, 66, True, INK)
        y += 84
    if sub:
        y += 14
        for ln in wrap_ja(sub, 34):
            text(d, (86, y), ln, 26, False, DIM)
            y += 40
    return im


def outro_scene(bg, icon, line, url='simplememofast.com'):
    im = bg.copy()
    d = ImageDraw.Draw(im)
    if icon:
        im.paste(icon, (W // 2 - icon.width // 2, 196), icon)
    text(d, (W // 2, 372), line, 40, True, INK, anchor='ma')
    text(d, (W // 2, 452), url, 28, False, BLUE, anchor='ma')
    return im


def steps_scene(bg, heading, steps, revealed, accent=BLUE):
    """Numbered horizontal flow. `revealed` = how many boxes are visible."""
    im = bg.copy()
    d = ImageDraw.Draw(im)
    text(d, (86, 92), heading, 38, True, INK)
    n = len(steps)
    bw, gap = 300, 42
    total = n * bw + (n - 1) * gap
    x0 = (W - total) // 2
    for i, (label, detail) in enumerate(steps):
        if i >= revealed:
            break
        x = x0 + i * (bw + gap)
        card(d, [x, 250, x + bw, 470])
        d.ellipse([x + 24, 274, x + 68, 318], fill=accent)
        text(d, (x + 46, 296), str(i + 1), 24, True, INK, anchor='mm')
        text(d, (x + 24, 340), label, 32, True, INK)
        yy = 388
        for ln in wrap_ja(detail, 13):
            text(d, (x + 24, yy), ln, 20, False, DIM)
            yy += 30
        if i + 1 < min(revealed, n):
            text(d, (x + bw + gap // 2, 358), '→', 34, True, (95, 110, 155), anchor='mm')
    return im


def benchmark_rows():
    """(label, seconds, caption) for every app, fastest first, from the ledger.

    data/benchmark.json is the single source for competitor speed figures and
    scripts/check-benchmark.mjs reports pages that drift from it. A video is a
    page like any other, so it reads the same file instead of carrying a copy.
    Captions round half-up: the Drafts median is exactly 1.45 and Python's
    %.1f would print 1.4.
    """
    from decimal import Decimal, ROUND_HALF_UP
    with open(os.path.join(ROOT, 'data/benchmark.json'), encoding='utf-8') as f:
        apps = json.load(f)['apps']
    label = {'Simple Memo - for Obsidian': 'Obsidian連携シンプルメモ'}
    out = []
    for name in sorted(apps, key=lambda a: apps[a]['ready']):
        v = apps[name]['ready']
        shown = Decimal(str(v)).quantize(Decimal('0.1'), rounding=ROUND_HALF_UP)
        out.append((label.get(name, name), v, f'{shown}秒'))
    return out


def bars_scene(bg, heading, note, rows, progress, highlight=None):
    """Horizontal measured-value bars; `progress` 0→1 grows them."""
    im = bg.copy()
    d = ImageDraw.Draw(im)
    text(d, (86, 84), heading, 38, True, INK)
    text(d, (86, 138), note, 20, False, DIM)
    top, rowh = 196, 60
    label_w, bar_x = 300, 400
    span = W - bar_x - 190
    mx = max(v for _, v, _ in rows)
    for i, (name, val, shown) in enumerate(rows):
        y = top + i * rowh
        is_hi = (name == highlight)
        text(d, (86 + label_w, y + 20), name, 24, is_hi, INK if is_hi else DIM, anchor='ra')
        full = span * (val / mx)
        w = max(4, full * ease(min(1.0, progress * 1.35 - i * 0.06)))
        if w > 4:
            d.rounded_rectangle([bar_x, y + 6, bar_x + w, y + 40], radius=8,
                                fill=BLUE if is_hi else (58, 70, 112))
        if progress > 0.75:
            # The displayed string is carried per row, not formatted from the
            # value: the app's own figure is published as 「約1秒」 and a bare
            # "1秒" would state a precision the measurement does not have.
            text(d, (bar_x + full + 16, y + 20), shown,
                 22, is_hi, INK if is_hi else DIM, anchor='lm')
    return im


def caveat_scene(bg, badge, lines, tone=AMBER):
    im = bg.copy()
    d = ImageDraw.Draw(im)
    card(d, [86, 210, W - 86, 510], radius=22)
    d.rounded_rectangle([86, 210, 92, 510], radius=3, fill=tone)
    text(d, (130, 250), badge, 22, True, tone)
    y = 306
    for ln in lines:
        text(d, (130, y), ln, 32, True, INK)
        y += 52
    return im


def fact_scene(bg, heading, before, after_rows, revealed):
    """Input on the left, derived fields appearing on the right."""
    im = bg.copy()
    d = ImageDraw.Draw(im)
    text(d, (86, 84), heading, 36, True, INK)
    card(d, [86, 168, 596, 560])
    text(d, (118, 198), '入力（そのまま保持）', 20, True, DIM)
    y = 248
    for ln in wrap_ja(before, 20):
        text(d, (118, y), ln, 26, False, INK)
        y += 42
    text(d, (622, 358), '→', 40, True, (95, 110, 155), anchor='mm')
    card(d, [660, 168, W - 86, 560])
    text(d, (692, 198), 'AIが付ける項目（端末内）', 20, True, PURPLE)
    y = 248
    for i, (k, v) in enumerate(after_rows):
        if i >= revealed:
            break
        text(d, (692, y), k, 20, False, DIM)
        text(d, (692, y + 30), v, 28, True, INK)
        y += 92
    return im


# ── the five videos ───────────────────────────────────────────────────────
# Each returns a list of (image, seconds). Images are rendered once per
# distinct frame; identical consecutive frames are cheap because ffmpeg gets
# them as separate files but compresses them to almost nothing.

def build_launch(bg, icon, c):
    """Launch-to-send timing, from the measured table in the benchmark post."""
    frames = []
    t = title_scene(bg, icon, 'BENCHMARK', ['起動して、書いて、送る。', 'そこまでで約1秒。'],
                    '起動速度ベンチマーク2026の実測値より。数値はページに掲載の計測表と同じものです。')
    for i in range(int(FPS * 0.6)):
        frames.append((fade(t, i / (FPS * 0.6)), 1 / FPS))
    frames.append((t, 2.6))

    steps = [('起動', 'アプリを開く'), ('書く', '話す・打つ'), ('送信', 'メールとObsidianへ')]
    for k in range(1, 4):
        frames.append((steps_scene(bg, '3ステップだけ。設定も同期も挟まない。', steps, k), 1.1))
    frames.append((steps_scene(bg, '3ステップだけ。設定も同期も挟まない。', steps, 3), 1.4))

    # Time-to-input, not launch time, and read from data/benchmark.json rather
    # than typed here. These bars were hard-coded once and went stale within
    # three days: the 2026-08-11 re-recording moved Bear from 1.9s to 0.917s
    # and Drafts from 1.2s to 1.45s, which reorders the chart. A frame that
    # disagrees with the page it cites is worse than no frame.
    #
    # Note that the correction cuts against us — Bear is now the nearest rival
    # at roughly 2.3x rather than 3x — and it is rendered anyway. A number that
    # only ever flatters us is the thing this file exists to avoid.
    rows = benchmark_rows()
    for p in [0.15, 0.35, 0.6, 0.85, 1.0]:
        frames.append((bars_scene(bg, 'タップから入力できるまで（実測）',
                                  '出典: /blog/fastest-memo-app-benchmark（iPhone 16e・各5回・中央値）',
                                  rows, p, highlight='Obsidian連携シンプルメモ'), 0.55))
    frames.append((bars_scene(bg, 'タップから入力できるまで（実測）',
                              '出典: /blog/fastest-memo-app-benchmark（iPhone 16e・各5回・中央値）',
                              rows, 1.0, highlight='Obsidian連携シンプルメモ'), 2.6))
    frames.append((outro_scene(bg, icon, '思いついた速さのまま、残す。'), 2.4))
    return frames


def build_apple_watch(bg, icon, c):
    frames = [(title_scene(bg, icon, 'APPLE WATCH', ['手首に話すだけで、', 'メールとObsidianへ。'],
                           'iPhoneを取り出さずに、Apple Watchから音声でメモを残せます。'), 3.2)]
    steps = [('話す', 'マイクを1回タップ'), ('iPhone経由', '自動で中継'), ('届く', 'メールとObsidian')]
    for k in range(1, 4):
        frames.append((steps_scene(bg, 'Apple Watchからの経路', steps, k), 1.1))
    frames.append((steps_scene(bg, 'Apple Watchからの経路', steps, 3), 1.6))
    frames.append((caveat_scene(bg, 'watchOSの制約（全アプリ共通）',
                                ['アプリの起動と同時に、音声入力を',
                                 '自動で開始することはできません。',
                                 'マイクを1回タップする操作が必要です。']), 3.6))
    frames.append((outro_scene(bg, icon, 'Apple Watch対応。'), 2.4))
    return frames


def build_siri_airpods(bg, icon, c):
    """The one video built from real in-app screenshots."""
    # Caption text is taken from the headline of the screen it sits beside.
    # An earlier cut paired them by list order and drifted out of sync — the
    # slide showing 「合言葉は『シンプルメモで残す』」 was captioned "ポケットの
    # iPhoneはそのまま". A caption that describes a different screen is a
    # caption that is simply wrong, and beside a real screenshot it is worse
    # than wrong because the screenshot lends it credibility.
    slides = [
        (1, 'AirPodsから、Obsidianへ', '話した内容が、いつものメールと保管庫に届く'),
        (2, '合言葉は「シンプルメモで残す」', 'AirPodsのステム長押し、または「Hey Siri」から'),
        (3, '「何をメモしますか？」に答えるだけ', '話した内容がそのまま本文になる。アプリは開かない'),
        (4, 'メールとObsidianに、同時に届く', '行き先はアプリから送ったときとまったく同じ'),
        (5, '3つだけ、確認しておく', 'ここが揃っていれば、あとは話しかけるだけ'),
    ]
    frames = [(title_scene(bg, icon, 'SIRI · AIRPODS', ['合言葉ひとつで、', 'ハンズフリー。'],
                           '以下はアプリ内のガイド画面です（実機のスクリーンショット）。'), 3.0)]
    for idx, cap, sub in slides:
        path = os.path.join(ROOT, 'assets/img/siri', f'onboarding-{idx}.png')
        if not os.path.exists(path):
            continue
        shot = Image.open(path).convert('RGB')
        ph = 604
        shot = shot.resize((round(shot.width * ph / shot.height), ph), Image.LANCZOS)
        # Round the corners so the still reads as a device, not a pasted
        # rectangle whose bottom edge looks accidentally cropped.
        mask = Image.new('L', shot.size, 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, shot.width - 1, shot.height - 1],
                                               radius=30, fill=255)
        im = bg.copy()
        d = ImageDraw.Draw(im)
        px, py = 132, 58
        d.rounded_rectangle([px - 9, py - 9, px + shot.width + 9, py + ph + 9],
                            radius=38, fill=(24, 31, 56), outline=CARD_EDGE, width=2)
        im.paste(shot, (px, py), mask)
        tx = px + shot.width + 78
        text(d, (tx, 236), f'アプリ内ガイド {idx} / 5', 20, True, BLUE)
        y = 284
        for ln in wrap_ja(cap, 13):
            text(d, (tx, y), ln, 38, True, INK)
            y += 56
        y += 12
        for ln in wrap_ja(sub, 20):
            text(d, (tx, y), ln, 22, False, DIM)
            y += 36
        frames.append((im, 2.6))
    frames.append((caveat_scene(bg, '推奨する日本語の合言葉',
                                ['「シンプルメモで残す」', '', 'AirPodsのステム長押しからも呼び出せます。'],
                                tone=GREEN), 3.0))
    frames.append((outro_scene(bg, icon, '手を使わずに、残す。'), 2.4))
    return frames


def build_obsidian(bg, icon, c):
    frames = [(title_scene(bg, icon, 'OBSIDIAN連携', ['送ったメモが、', 'ノートに追記される。'],
                           'メールで自分に送ると、Obsidianの保管庫のノートへ自動で追記されます。'), 3.2)]
    steps = [('書く / 話す', 'メモを1つ'), ('メールで送信', '自分の受信箱へ'), ('追記', 'Obsidianのノートに')]
    for k in range(1, 4):
        frames.append((steps_scene(bg, 'メモがノートになるまで', steps, k, accent=PURPLE), 1.1))
    frames.append((steps_scene(bg, 'メモがノートになるまで', steps, 3, accent=PURPLE), 1.6))
    frames.append((caveat_scene(bg, '正確に言うと',
                                ['メール本文は通常のSMTPで届きます。',
                                 'つまりエンドツーエンド暗号化ではありません。',
                                 '端末内のOutboxと送信履歴はAES-GCM-256で暗号化。']), 4.0))
    frames.append((outro_scene(bg, icon, 'いつものメールが、保管庫の入口になる。'), 2.4))
    return frames


def build_ai_tags(bg, icon, c):
    frames = [(title_scene(bg, icon, 'AIタグ自動追加', ['話すだけで、', 'AIが整える。'],
                           'メモの内容をAIが読み、タイトル・タグ・種別を自動で付けます。2026年7月の無料アップデートで提供開始。'), 3.2)]
    memo = '来週の打ち合わせまでに見積もりを作り直す。先方は金額より納期を気にしていた。'
    after = [('タイトル（20文字以内）', '見積もり作り直し'),
             ('タグ（1〜3個）', '#打ち合わせ #見積もり'),
             ('種別', 'todo')]
    for k in range(1, 4):
        frames.append((fact_scene(bg, 'AIが付ける項目', memo, after, k), 1.3))
    frames.append((fact_scene(bg, 'AIが付ける項目', memo, after, 3), 1.8))
    frames.append((caveat_scene(bg, '処理はiPhoneの中だけ',
                                ['Apple Foundation Models を使い、',
                                 'タグ付けのためのネットワーク通信は発生しません。',
                                 '元のメモ本文は書き換えません。'], tone=GREEN), 4.0))
    frames.append((outro_scene(bg, icon, '整理は、AIにやらせる。'), 2.4))
    return frames


VIDEOS = {
    'launch-1s': (build_launch, '起動して書いて送るまで約1秒 — 実測ベンチマーク',
                  'アプリの起動から送信までの3ステップと、入力を開始できるまでの実測時間を主要メモアプリと比較した図解動画です。数値は当サイトの計測表に基づきます。'),
    'apple-watch-voice': (build_apple_watch, 'Apple Watchから声だけでメモを残す',
                          'Apple Watchで音声メモを取り、iPhone経由でメールとObsidianへ届けるまでの経路を示した図解動画です。watchOSでは起動時に音声入力を自動開始できない制約も説明します。'),
    'siri-airpods': (build_siri_airpods, 'Siriとその場のAirPodsでハンズフリーにメモを残す',
                     'アプリ内ガイドの実機スクリーンショットを使って、合言葉ひとつでAirPodsから音声メモを残す流れを紹介するスライドショー動画です。'),
    'obsidian-append': (build_obsidian, 'メモがObsidianのノートに追記されるまで',
                        'メモをメールで自分に送ると、Obsidianの保管庫のノートへ自動で追記される流れを示した図解動画です。メール本文が通常のSMTPで届くため、エンドツーエンド暗号化ではない点も明示します。'),
    'ai-tags': (build_ai_tags, 'AIがメモにタイトルとタグを自動で付ける',
                'オンデバイスAIがメモを読み、20文字以内のタイトル・1〜3個のタグ・種別（todo／idea／log）を自動付与する様子を示した図解動画です。タグ付けは端末内で完結し、外部サーバーへの送信はありません。'),
}


def encode(frames, out_mp4, out_poster, ffmpeg):
    tmp = tempfile.mkdtemp(prefix='vid-')
    try:
        n = 0
        for img, secs in frames:
            for _ in range(max(1, round(secs * FPS))):
                img.save(os.path.join(tmp, f'f{n:05d}.png'))
                n += 1
        subprocess.run([ffmpeg, '-y', '-loglevel', 'error', '-framerate', str(FPS),
                        '-i', os.path.join(tmp, 'f%05d.png'),
                        '-c:v', 'libx264', '-preset', 'slow', '-crf', '30',
                        '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
                        '-vf', 'format=yuv420p', out_mp4], check=True)
        # Poster: a frame from the title card, after the fade-in has finished.
        frames[min(2, len(frames) - 1)][0].save(out_poster, quality=82, optimize=True)
        return n / FPS
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only')
    ap.add_argument('--out', default='assets/video')
    args = ap.parse_args()

    ffmpeg = os.environ.get('FFMPEG') or shutil.which('ffmpeg') or '/tmp/node_modules/ffmpeg-static/ffmpeg'
    if not os.path.exists(ffmpeg):
        sys.exit('ffmpeg not found. Set FFMPEG=/path/to/ffmpeg (npm i ffmpeg-static gives you one).')

    outdir = os.path.join(ROOT, args.out)
    os.makedirs(outdir, exist_ok=True)
    c = constants()
    bg = background()
    icon = Image.open(os.path.join(ROOT, 'assets/img/app-icon-256.png')).convert('RGBA')
    icon = icon.resize((104, 104), Image.LANCZOS)

    manifest = {}
    for name, (builder, title, desc) in VIDEOS.items():
        if args.only and args.only != name:
            continue
        mp4 = os.path.join(outdir, f'{name}.mp4')
        poster = os.path.join(outdir, f'{name}-poster.jpg')
        dur = encode(builder(bg, icon, c), mp4, poster, ffmpeg)
        size = os.path.getsize(mp4)
        manifest[name] = {'title': title, 'description': desc,
                          'duration_s': round(dur, 1), 'bytes': size}
        print(f'  {name:20s} {dur:5.1f}s  {size / 1024:7.0f} KB  → {args.out}/{name}.mp4')

    mpath = os.path.join(outdir, 'manifest.json')
    if os.path.exists(mpath) and args.only:
        existing = json.load(open(mpath, encoding='utf-8'))
        existing.update(manifest)
        manifest = existing
    with open(mpath, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(f'manifest: {args.out}/manifest.json')


if __name__ == '__main__':
    main()
