#!/usr/bin/env python3
"""Decoder guard regressions. Uses stub modules, so it needs no fontTools/brotli
and still runs under python -O (unittest methods, not bare assert). Also checks
that build_home and build_font_delta call the guard before opening any font."""
from __future__ import annotations
import importlib.util
import sys
import types
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import woff2_guard  # noqa: E402


def stub(name: str, version: object = None) -> types.ModuleType:
    module = types.ModuleType(name)
    if version is not None:
        module.__version__ = version
    return module


def load(name: str, path: Path) -> types.ModuleType:
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Stubbed(unittest.TestCase):
    def setUp(self) -> None:
        self.saved = {k: sys.modules.get(k) for k in ('fontTools', 'fontTools.ttLib', 'fontTools.ttLib.woff2', 'fontTools.subset', 'brotli', 'brotlicffi')}
        self.path = list(sys.path)

    def tearDown(self) -> None:
        for key, value in self.saved.items():
            if value is None:
                sys.modules.pop(key, None)
            else:
                sys.modules[key] = value
        sys.path[:] = self.path

    def use(self, decoder: types.ModuleType | None, brotli: types.ModuleType | None = None) -> None:
        ft, ttlib, woff2 = stub('fontTools'), stub('fontTools.ttLib'), stub('fontTools.ttLib.woff2')
        if decoder is not None:
            woff2.brotli = decoder
        ft.ttLib, ttlib.woff2 = ttlib, woff2
        sys.modules.update({'fontTools': ft, 'fontTools.ttLib': ttlib, 'fontTools.ttLib.woff2': woff2})
        sys.modules.pop('fontTools.subset', None)
        if brotli is None:
            sys.modules.pop('brotli', None)
        else:
            sys.modules['brotli'] = brotli


class Guard(Stubbed):
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


class Wiring(Stubbed):
    """The guard must run before the first font is opened, not merely exist."""

    def test_build_home_stops_before_fonttools(self) -> None:
        old = stub('brotli', '1.2.0')
        self.use(old, old)  # the stubs have no subset/TTFont: reaching them raises ImportError instead
        build_home = load('build_home_wiring', HERE / 'build_home.py')
        with self.assertRaisesRegex(woff2_guard.UnsafeWoff2Decoder, 'older than 1.2.1'):
            build_home.build()

    def test_build_font_delta_stops_before_any_font_is_opened(self) -> None:
        old = stub('brotli', '1.2.0')
        self.use(old, old)
        opened = []

        def font(*args: object, **kwargs: object) -> None:
            opened.append(args)
            raise RuntimeError('a font was opened before the decoder guard')

        subset = stub('fontTools.subset')
        subset.Options = subset.Subsetter = subset.save_font = object
        subset.load_font = sys.modules['fontTools.ttLib'].TTFont = font
        sys.modules['fontTools.subset'] = subset
        delta = load('build_font_delta_wiring', HERE.parent / 'build_font_delta.py')
        with self.assertRaisesRegex(woff2_guard.UnsafeWoff2Decoder, 'older than 1.2.1'):
            delta.main()
        self.assertEqual(opened, [])


if __name__ == '__main__':
    unittest.main(verbosity=1)
