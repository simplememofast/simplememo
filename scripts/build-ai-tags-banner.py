#!/usr/bin/env python3
"""Build the web derivatives of the AI auto-tagging banner artwork.

The master is assets/img/ai-tags-banner-ja.png (designer export, ~1.8MB) and is
never served directly. This produces, matching the convention already used by
the Apple Watch and Obsidian banners:

    ai-tags-banner-ja.webp      1200w, used by <picture>
    ai-tags-banner-ja.jpg       1200w, <img> fallback
    ai-tags-banner-ja@2x.webp   full width, retina source
    og/ai-tags.jpg              1200x630 social card

The banner is 1.917:1 but an OG card must be 1.905:1, so the card is centre
cropped by ~11px of width before resizing — nothing meaningful sits that close
to either edge.

Usage:
    pip install Pillow
    python3 scripts/build-ai-tags-banner.py
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
IMG = ROOT / 'assets' / 'img'
MASTER = IMG / 'ai-tags-banner-ja.png'

OG_RATIO = 1200 / 630
WIDTH_1X = 1200


def main() -> None:
    src = Image.open(MASTER).convert('RGB')
    w, h = src.size
    print(f'master: {w}x{h}')

    one_x = src.resize((WIDTH_1X, round(h * WIDTH_1X / w)), Image.LANCZOS)
    one_x.save(IMG / 'ai-tags-banner-ja.webp', 'WEBP', quality=82, method=6)
    one_x.save(IMG / 'ai-tags-banner-ja.jpg', 'JPEG', quality=84,
               optimize=True, progressive=True)
    src.save(IMG / 'ai-tags-banner-ja@2x.webp', 'WEBP', quality=80, method=6)

    crop_w = round(h * OG_RATIO)
    left = (w - crop_w) // 2
    card = src.crop((left, 0, left + crop_w, h)).resize((1200, 630), Image.LANCZOS)
    card.save(IMG / 'og' / 'ai-tags.jpg', 'JPEG', quality=86,
              optimize=True, progressive=True)
    print(f'og card: trimmed {w - crop_w}px of width')

    for name in ('ai-tags-banner-ja.webp', 'ai-tags-banner-ja.jpg',
                 'ai-tags-banner-ja@2x.webp', 'og/ai-tags.jpg'):
        size = (IMG / name).stat().st_size / 1024
        print(f'  {name:<30} {size:7.1f} KB')


main()
