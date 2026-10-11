#!/usr/bin/env python3
"""PR TIMES ヒーローバナーの G1 を、毎回同じ判定に落とすための道具。

仕様は docs/pr-thumbnail-spec.md。この道具が見るのは **G1 の前半（寸法）だけ**で、
後半（場面が写っているか・文言が実在するか）は見ない。**だから目視を省けない。**

    python3 scripts/check-pr-banner.py <banner>            # 検査して切り出す
    python3 scripts/check-pr-banner.py --safe-area [--out DIR]  # 下敷きを作る

PR⑥ のバナーは「幅 1536px > 1200px」で G1 に 1 が付き、そのうえで 1:1 に切られて
見出しが「リが、／育ち続ける。」に、`76.4%` が `4%` になった
（docs/pr-banner-audit-2026-09-02.md §2）。**幅は通って、中身が壊れていた。**
数字で落とせるのは3つだけなので、そこは機械に固定し、残りは切った絵を人が見る。

依存: python3 -m pip install Pillow==12.3.0
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent

TARGET_RATIO = 1.91          # docs/pr-thumbnail-spec.md §3-1
RATIO_TOLERANCE = 0.02       # 1920x1005 = 1.9104、1536x804 = 1.9104 が入る幅
MIN_WIDTH = 1200             # Discover の大きな画像の要件
MAX_BYTES = 5 * 1024 * 1024  # PR TIMES の上限

# 下敷きの既定サイズ（§3-1 の推奨実寸）
TEMPLATE_W, TEMPLATE_H = 1920, 1005

EDGE_THRESHOLD = 48          # 0-255。これを超える勾配を「文字らしい強い輪郭」と数える


def centre_crop(img: Image.Image, ratio: float) -> Image.Image:
    """中央を ratio の比率で切り出す（配信面が行う切り方）。"""
    w, h = img.size
    if w / h > ratio:
        cw, ch = round(h * ratio), h
    else:
        cw, ch = w, round(w / ratio)
    left, top = (w - cw) // 2, (h - ch) // 2
    return img.crop((left, top, left + cw, top + ch))


def edge_share_outside_square(img: Image.Image) -> tuple[float, float]:
    """強い輪郭のうち、中央 1:1 の外側にある割合を測る。

    返すのは (実測の割合, 面積だけで決まる基準値)。**この2つを比べるために測る。**
    基準値は「輪郭が画面じゅうに一様にあったらこうなる」という値なので、
    実測がそれを大きく下回れば中央に寄っている、近ければ端まで散っている。

    **これは指標であって判定ではない。実際に外した例がある。**
    assets/img/obsidian-banner-ja.jpg（1200x900）はこの値が **13.1%**（一様なら 25.0%）で
    「中央に寄っている」側に出る。**それでも 1:1 に切ると文字が切れる** ——
    2行目が「ンタップで、自分のメール」（左の「ワ」と右の「へ」が落ちる）、
    下段が「デイリーノート／Inb」になる。2026-09-24 に実際に切って確認した。

    **したがってこの数字で G1 を埋めてはいけない。**低い値が意味するのは
    「輪郭の重心が中央寄り」までで、**縁ぎりぎりに置かれた文字は重心を動かさない。**
    写真の地は文字が無くても輪郭を出すので、高い値も同様に判定には使えない。
    §5 の目視を置き換えないために、ここでは○×を付けず◇で出す。
    """
    grey = img.convert('L')
    edges = grey.filter(ImageFilter.FIND_EDGES)
    w, h = edges.size
    side = min(w, h)
    left = (w - side) // 2
    right = left + side

    mask = edges.point(lambda v: 255 if v >= EDGE_THRESHOLD else 0)
    total = mask.histogram()[255]
    if total == 0:
        return 0.0, 0.0
    inside = mask.crop((left, 0, right, h)).histogram()[255]
    outside_share = (total - inside) / total
    baseline = (w - side) / w          # 面積比＝一様分布のときの期待値
    return outside_share, baseline


def build_safe_area(out: Path, width: int, height: int) -> Path:
    """中央 1:1 を描いた下敷きを書き出す（作る前に置いて位置を決めるためのもの）。"""
    img = Image.new('RGB', (width, height), (24, 24, 27))
    d = ImageDraw.Draw(img)
    side = min(width, height)
    left = (width - side) // 2
    d.rectangle([left, 0, left + side - 1, height - 1], outline=(0, 208, 132), width=6)
    for x in (left, left + side - 1):
        d.line([(x, 0), (x, height - 1)], fill=(0, 208, 132), width=6)
    d.rectangle([0, 0, left, height - 1], fill=(63, 20, 20))
    d.rectangle([left + side, 0, width - 1, height - 1], fill=(63, 20, 20))
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, 'PNG')
    return out


def main() -> int:
    p = argparse.ArgumentParser(description='PR TIMES ヒーローバナーの寸法検査')
    p.add_argument('banner', nargs='?', help='検査する画像')
    p.add_argument('--out', default=None, help='切り出しの出力先（既定: 画像と同じ場所の banner-check/）')
    p.add_argument('--safe-area', action='store_true', help='中央1:1の下敷きだけを作って終わる')
    args = p.parse_args()

    if args.safe_area:
        out_dir = Path(args.out) if args.out else ROOT / 'build' / 'banner-check'
        made = build_safe_area(out_dir / 'safe-area-1920x1005.png', TEMPLATE_W, TEMPLATE_H)
        print(f'下敷き: {made}')
        print(f'  緑の枠の内側（中央 {min(TEMPLATE_W, TEMPLATE_H)}x{min(TEMPLATE_W, TEMPLATE_H)}）に')
        print('  見出し・製品名・数字を完結させる。赤い帯に置いてよいのは背景と装飾だけ。')
        return 0

    if not args.banner:
        p.error('検査する画像を指定するか --safe-area を付ける')

    src = Path(args.banner)
    if not src.exists():
        print(f'見つからない: {src}', file=sys.stderr)
        return 2

    img = Image.open(src)
    w, h = img.size
    size_bytes = src.stat().st_size
    ratio = w / h

    print(f'{src}')
    print(f'  {w}x{h}  比率 {ratio:.4f}  {size_bytes / 1024 / 1024:.2f} MB')
    print()

    fails: list[str] = []
    if abs(ratio - TARGET_RATIO) > RATIO_TOLERANCE:
        fails.append(f'比率 {ratio:.4f} が {TARGET_RATIO}±{RATIO_TOLERANCE} の外（§3-1）')
    if w < MIN_WIDTH:
        fails.append(f'幅 {w}px < {MIN_WIDTH}px（Discover の大画像要件）')
    if size_bytes > MAX_BYTES:
        fails.append(f'{size_bytes / 1024 / 1024:.2f} MB > 5 MB（PR TIMES の上限）')

    for label, ok in (('比率 1.91:1', abs(ratio - TARGET_RATIO) <= RATIO_TOLERANCE),
                      (f'幅 {MIN_WIDTH}px 超', w >= MIN_WIDTH),
                      ('5 MB 以内', size_bytes <= MAX_BYTES)):
        print(f'  {"○" if ok else "×"} {label}')

    share, baseline = edge_share_outside_square(img)
    print()
    print(f'  ◇ 中央1:1の外にある強い輪郭 {share:.1%}（一様なら {baseline:.1%}）')
    if share >= baseline:
        print('    端まで散っている。**切られる帯に中身がある可能性が高い。**下の2枚を必ず見る。')
    else:
        print('    中央に寄ってはいる。**これは「切れない」の証明ではない** —— 縁ぎりぎりは数字に出ない。')

    out_dir = Path(args.out) if args.out else src.parent / 'banner-check'
    out_dir.mkdir(parents=True, exist_ok=True)
    rgb = img.convert('RGB')
    c191 = out_dir / f'{src.stem}-crop-1.91.png'
    c11 = out_dir / f'{src.stem}-crop-1x1.png'
    centre_crop(rgb, TARGET_RATIO).save(c191, 'PNG')
    centre_crop(rgb, 1.0).save(c11, 'PNG')

    print()
    print('  切り出した（§5 の3手のうち1手目）:')
    print(f'    {c191}')
    print(f'    {c11}')
    print()
    print('  **この2枚を目で見るまで G1 に 1 を付けない。**見るのは次の4点:')
    print('    - 見出しが読み切れるか（PR⑥ は「リが、／育ち続ける。」になった）')
    print('    - 数字が割れていないか（PR⑥ は 76.4% が 4% になった＝正しい数字が嘘になる）')
    print('    - 製品名が残っているか')
    print('    - 写っているのが場面か（率と件数のパネルは場面ではない・§3-3）')
    print('  端末画面を合成したなら、文言が Localizable.strings に実在するかも見る。')

    if fails:
        print()
        for f in fails:
            print(f'  × {f}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
