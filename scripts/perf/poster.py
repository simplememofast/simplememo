"""Homepage poster encoding; never changes the video, source JPEG or schema."""
from __future__ import annotations
import hashlib
import io
import math
import re

SOURCE = 'assets/video/launch-1s-poster.jpg'
PREFIX = 'assets/home-perf/launch-1s-poster-1280-'


def encode(source: bytes) -> tuple[str, bytes, dict]:
    from PIL import Image, ImageChops
    with Image.open(io.BytesIO(source)) as original:
        if original.format != 'JPEG' or original.size != (1280, 720):
            raise ValueError('Expected the original 1280x720 JPEG poster')
        rgb = original.convert('RGB')
    buffer = io.BytesIO()
    rgb.save(buffer, format='WEBP', quality=90, method=6, lossless=False)
    data = buffer.getvalue()
    with Image.open(io.BytesIO(data)) as decoded:
        if decoded.size != rgb.size or decoded.format != 'WEBP':
            raise ValueError('Encoded poster dimensions or type changed')
        histogram = ImageChops.difference(rgb, decoded.convert('RGB')).histogram()
    mse = sum(count * (index % 256) ** 2 for index, count in enumerate(histogram)) / (1280 * 720 * 3)
    psnr = 10 * math.log10(255 ** 2 / mse) if mse else float('inf')
    if psnr < 48 or len(data) > len(source) * 0.65:
        raise ValueError('Poster must retain >=48dB PSNR and save >=35% of source bytes')
    name = PREFIX + hashlib.sha256(data).hexdigest()[:12] + '.webp'
    return name, data, {'source_bytes': len(source), 'encoded_bytes': len(data), 'psnr_db': psnr}


def patch(html: str, name: str) -> str:
    if not re.fullmatch(re.escape(PREFIX) + r'[0-9a-f]{12}\.webp', name):
        raise ValueError('Expected a content-addressed poster path')
    tags = list(re.finditer(r'<video\b[^>]*>', html))
    if len(tags) != 1:
        raise ValueError('Expected exactly one native video')
    tag = tags[0]
    posters = list(re.finditer(r'\bposter="([^"]*)"', tag[0]))
    if len(posters) != 1:
        raise ValueError('Expected exactly one native poster attribute')
    previous = posters[0][1]
    if previous != '/' + SOURCE and not re.fullmatch('/' + re.escape(PREFIX) + r'[0-9a-f]{12}\.webp', previous):
        raise ValueError('Unexpected poster: do not overwrite unreviewed media')
    start, end = posters[0].span(1)
    changed = tag[0][:start] + '/' + name + tag[0][end:]
    return html[:tag.start()] + changed + html[tag.end():]
