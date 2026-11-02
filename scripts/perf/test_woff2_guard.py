#!/usr/bin/env python3
"""Decoder guard regressions. Uses stub modules, so it needs no fontTools/brotli
and still runs under python -O (unittest methods, not bare assert)."""
from __future__ import annotations
import sys
import types
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import woff2_guard  # noqa: E402


def stub(name: str, version: object = None) -> types.ModuleType:
    module = types.ModuleType(name)
    if version is not None:
        module.__version__ = version
    return module


class Guard(unittest.TestCase):
    def setUp(self) -> None:
        self.saved = {k: sys.modules.get(k) for k in ('fontTools', 'fontTools.ttLib', 'fontTools.ttLib.woff2', 'brotli', 'brotlicffi')}

    def tearDown(self) -> None:
        for key, value in self.saved.items():
            if value is None:
                sys.modules.pop(key, None)
            else:
                sys.modules[key] = value

    def use(self, decoder: types.ModuleType | None, brotli: types.ModuleType | None = None) -> None:
        ft, ttlib, woff2 = stub('fontTools'), stub('fontTools.ttLib'), stub('fontTools.ttLib.woff2')
        if decoder is not None:
            woff2.brotli = decoder
        ft.ttLib, ttlib.woff2 = ttlib, woff2
        sys.modules.update({'fontTools': ft, 'fontTools.ttLib': ttlib, 'fontTools.ttLib.woff2': woff2})
        if brotli is None:
            sys.modules.pop('brotli', None)
        else:
            sys.modules['brotli'] = brotli

    def test_patched_brotli_passes(self) -> None:
        module = stub('brotli', '1.2.1')
        self.use(module, module)
        self.assertEqual(woff2_guard.require_patched_decoder(), 'brotli 1.2.1')

    def test_newer_brotli_passes(self) -> None:
        module = stub('brotli', '1.3.0')
        self.use(module, module)
        self.assertEqual(woff2_guard.require_patched_decoder(), 'brotli 1.3.0')

    def rejects(self, decoder: types.ModuleType | None, brotli: types.ModuleType | None, text: str) -> None:
        self.use(decoder, brotli)
        with self.assertRaisesRegex(woff2_guard.UnsafeWoff2Decoder, text):
            woff2_guard.require_patched_decoder()

    def test_old_brotli_rejected(self) -> None:
        module = stub('brotli', '1.2.0')
        self.rejects(module, module, 'older than 1.2.1')

    def test_unknown_version_rejected(self) -> None:
        for raw in (None, '', '1.2', '1.2.1rc1', 121):
            module = stub('brotli', raw)
            self.rejects(module, module, 'Cannot read the version')

    def test_brotlicffi_rejected_even_if_patched(self) -> None:
        for raw in ('1.2.0.2', '1.2.1.0'):
            self.rejects(stub('brotlicffi', raw), stub('brotli', '1.2.1'), 'only brotli is allowed')

    def test_lookalike_module_rejected(self) -> None:
        self.rejects(stub('brotli', '1.2.1'), stub('brotli', '1.2.1'), 'only brotli is allowed')

    def test_missing_decoder_rejected(self) -> None:
        self.rejects(None, None, 'no Brotli module')

    def test_failure_is_not_an_assert(self) -> None:
        self.assertFalse(issubclass(woff2_guard.UnsafeWoff2Decoder, AssertionError))


if __name__ == '__main__':
    unittest.main(verbosity=1)
