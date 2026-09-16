#!/usr/bin/env python3
"""Serve the static site with ordinary gzip negotiation for reproducible lab tests.

This is not the production server. Every client receives the same representation
for its Accept-Encoding; no user-agent or Lighthouse-specific behavior exists.
"""
import gzip
import io
import mimetypes
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
mimetypes.add_type('image/avif', '.avif')

class Handler(SimpleHTTPRequestHandler):
    cache = {}

    def send_head(self):
        path = Path(self.translate_path(self.path))
        if path.is_dir() and self.path.split('?')[0].endswith('/'):
            path = path / 'index.html'
        if path.is_file() and path.suffix in ('.html', '.css', '.js', '.json', '.svg') and 'gzip' in self.headers.get('Accept-Encoding', ''):
            key = (str(path), path.stat().st_mtime_ns)
            if key not in self.cache:
                self.cache[key] = gzip.compress(path.read_bytes(), compresslevel=6, mtime=0)
            data = self.cache[key]
            self.send_response(200)
            self.send_header('Content-Type', self.guess_type(str(path)))
            self.send_header('Content-Encoding', 'gzip')
            self.send_header('Vary', 'Accept-Encoding')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            return io.BytesIO(data)
        return super().send_head()

if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', 8765), Handler).serve_forever()
