import hashlib
import io
import json
from pathlib import Path
import re
import unittest
from PIL import Image
from poster import SOURCE, PREFIX, encode, patch

ROOT = Path(__file__).resolve().parents[2]


class PosterTests(unittest.TestCase):
    def test_real_encoding_quality_size_and_repeatability(self):
        source = (ROOT / SOURCE).read_bytes()
        a, data, metrics = encode(source)
        self.assertEqual((a, data, metrics), encode(source))
        self.assertGreaterEqual(metrics['psnr_db'], 48)
        self.assertLessEqual(len(data), len(source) * 0.65)
        self.assertIn(hashlib.sha256(data).hexdigest()[:12], a)
        self.assertEqual(Image.open(io.BytesIO(data)).size, (1280, 720))

    def test_wrong_input_and_dimensions_fail(self):
        with self.assertRaises(Exception):
            encode(b'not an image')
        b = io.BytesIO()
        Image.new('RGB', (1, 1)).save(b, format='JPEG')
        with self.assertRaises(ValueError):
            encode(b.getvalue())

    def test_patch_changes_only_poster_and_is_idempotent(self):
        old = '<video controls poster="/' + SOURCE + '" preload="none"><source src="same.mp4"></video><script>{"thumbnailUrl":"/' + SOURCE + '"}</script>'
        name = PREFIX + '0123456789ab.webp'
        new = patch(old, name)
        self.assertEqual(new.replace('/' + name, '/' + SOURCE), old)
        self.assertEqual(patch(new, name), new)

    def test_unexpected_paths_and_video_markup_fail(self):
        name = PREFIX + '0123456789ab.webp'
        valid = '<video poster="/' + SOURCE + '"></video>'
        for html in ['', valid + valid, '<video></video>', '<video poster="other.jpg"></video>', '<video poster="/' + SOURCE + '" poster="duplicate.jpg"></video>']:
            with self.assertRaises(ValueError):
                patch(html, name)
        for path in ['../poster.webp', '/'+name, name.replace('0123456789ab','BAD'), name.replace('.webp','.jpg')]:
            with self.assertRaises(ValueError):
                patch(valid, path)

    def test_generated_asset_and_public_metadata(self):
        name, data, _ = encode((ROOT / SOURCE).read_bytes())
        manifest = json.loads((ROOT / 'assets/home-perf/manifest.json').read_text())
        self.assertEqual((ROOT / name).read_bytes(), data)
        self.assertEqual(manifest['assets'][name]['sha256'], hashlib.sha256(data).hexdigest())
        self.assertEqual(manifest['inputs'][SOURCE], hashlib.sha256((ROOT / SOURCE).read_bytes()).hexdigest()[:12])
        html = (ROOT / 'index.html').read_text()
        self.assertEqual(patch(html, name), html)
        self.assertEqual(len(re.findall(r'<video\b', html)), 1)
        tag = re.search(r'<video\b[^>]*>', html)[0]
        for item in ['controls','preload="none"','playsinline','muted','width="1280"','height="720"']:
            self.assertIn(item, tag)
        self.assertNotRegex(tag, r'autoplay|loading=|data-src=')
        self.assertIn('<source src="/assets/video/launch-1s.mp4" type="video/mp4">', html)
        schemas = [json.loads(s) for s in re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.S)]
        video = next(s for s in schemas if s.get('@type') == 'VideoObject')
        self.assertEqual(video['thumbnailUrl'], ['https://simplememofast.com/' + SOURCE])
        self.assertNotIn('<video', (ROOT / 'en/index.html').read_text())


if __name__ == '__main__':
    unittest.main()
