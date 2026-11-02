#!/usr/bin/env python3
"""Refuse WOFF2 work unless fontTools will use the patched Google brotli binding.

fontTools.ttLib.woff2 imports brotlicffi first and falls back to brotli, so the
installed packages alone do not tell which decoder runs. Call
require_patched_decoder() before the first TTFont/load_font of a .woff2 file.

This module must stay dependency-free at import time: verify_home.py imports
build_home.py under a plain python3 (SEO Validation), so fontTools is imported
only inside the function. Failures raise (never assert) so python -O cannot
skip the check.
"""
from __future__ import annotations
import re
import sys

# CVE-2026-111497 (out-of-bounds write in the decoder) is fixed in brotli 1.2.1,
# the only fixed release on PyPI (upstream's 1.1.1 and 1.0.10 were not published there).
MINIMUM_BROTLI = (1, 2, 1)
# Matches the PageSpeed Audit step (`woff2.brotli is brotli`). brotlicffi is
# rejected even when patched (>= 1.2.1.0) so local runs use the same decoder
# as CI; allow it only together with a CI change and a byte-for-byte check.
ALLOWED_PROVIDER = 'brotli'
FIX = ('Use the dedicated venv: python3.13 -m venv ~/.venvs/simplememo-fonts && '
       '~/.venvs/simplememo-fonts/bin/python -m pip install --require-hashes --only-binary=:all: '
       '-r scripts/perf/requirements-fonts.txt (never install brotlicffi there).')


class UnsafeWoff2Decoder(RuntimeError):
    """The WOFF2 decoder fontTools would use is missing, unknown or unpatched."""


def parse_version(value: object) -> tuple[int, int, int] | None:
    if not isinstance(value, str):
        return None
    match = re.fullmatch(r'(\d+)\.(\d+)\.(\d+)', value)
    return (int(match[1]), int(match[2]), int(match[3])) if match else None


def require_patched_decoder() -> str:
    """Return 'brotli X.Y.Z' for the decoder fontTools uses, or raise."""
    from fontTools.ttLib import woff2  # deferred: keep importers dependency-free

    module = getattr(woff2, 'brotli', None)  # the object WOFF2Reader calls
    if module is None:
        raise UnsafeWoff2Decoder('fontTools found no Brotli module for WOFF2. ' + FIX)
    name = getattr(module, '__name__', None)
    raw = getattr(module, '__version__', None)
    found = f'{name} {raw}'
    if name != ALLOWED_PROVIDER or sys.modules.get(ALLOWED_PROVIDER) is not module:
        raise UnsafeWoff2Decoder(f'fontTools would decode WOFF2 with {found}; only {ALLOWED_PROVIDER} is allowed. ' + FIX)
    version = parse_version(raw)
    if version is None:
        raise UnsafeWoff2Decoder(f'Cannot read the version of the WOFF2 decoder ({found}). ' + FIX)
    if version < MINIMUM_BROTLI:
        need = '.'.join(map(str, MINIMUM_BROTLI))
        raise UnsafeWoff2Decoder(f'WOFF2 decoder {found} is older than {need}, the PyPI release that fixes CVE-2026-111497. ' + FIX)
    return found


if __name__ == '__main__':
    try:
        print('WOFF2 decoder:', require_patched_decoder())
    except UnsafeWoff2Decoder as error:
        raise SystemExit(f'FAIL: {error}')
