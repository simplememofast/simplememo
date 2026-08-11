#!/usr/bin/env python3
"""
Read launch timings out of a 60fps screen recording.

    python3 scripts/analyze-launch-recording.py recording.mov --app "Notion"
    python3 scripts/analyze-launch-recording.py runs/*.mov --json

docs/SEO_AIO_PLAN_2026-08.md §11-4. The published protocol asks for
frame-by-frame analysis of a 60fps capture, per app, several runs each. Done by
hand that is the slow, error-prone half of the job, and it is almost certainly
where the site's four disagreeing tables came from: eight apps scored by eye on
different days drift, and nothing catches it.

This does that half mechanically. Recording still has to happen on a real
iPhone — simulator timings are not device timings, and the Simulator has no App
Store to install rivals from — but the operator's job becomes "record, send",
not "count frames".

Two instants are recovered from the pixels:

  launch  the app has finished drawing. Found as the first frame after the tap
          where inter-frame change collapses and STAYS collapsed: a launch ends
          in a still screen, whereas mid-launch every frame differs from the
          last (splash, fade, layout, first paint).

  ready   a text cursor is blinking. Found by looking for a small region that
          alternates on a ~1Hz period, which on iOS is the caret and essentially
          nothing else. This is the number the site should be publishing —
          §11-1 shows pages quoting "time to start typing" while carrying
          launch-shaped values.

Both are reported with the frame index and confidence so a doubtful run can be
eyeballed rather than trusted. `--contact-sheet` writes the frames around each
detection for exactly that.
"""

import argparse
import glob
import json
import os
import shutil
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image

FFMPEG = os.environ.get('FFMPEG') or shutil.which('ffmpeg') or '/tmp/node_modules/ffmpeg-static/ffmpeg'

# A launch is over when successive frames stop differing. The threshold is mean
# absolute 0-255 difference per pixel; below this the screen is, to the eye,
# static. Kept deliberately loose because a blinking caret and a status-bar
# clock both keep a "still" screen very slightly alive.
STILL_THRESHOLD = 1.2
# How long it has to stay still before we call it settled (frames at 60fps).
STILL_RUN = 12

# A caret blinks at roughly 1Hz: ~30 frames on, ~30 off at 60fps.
BLINK_MIN_HZ, BLINK_MAX_HZ = 0.6, 1.6


def extract(path, fps, workdir, scale=480):
    """Decode to greyscale frames. Scaled down: this measures change, not detail."""
    out = os.path.join(workdir, 'f%06d.png')
    subprocess.run(
        [FFMPEG, '-y', '-loglevel', 'error', '-i', path,
         '-vf', f'fps={fps},scale={scale}:-1,format=gray', out],
        check=True)
    files = sorted(glob.glob(os.path.join(workdir, 'f*.png')))
    if not files:
        sys.exit(f'no frames decoded from {path}')
    return np.stack([np.asarray(Image.open(f), dtype=np.int16) for f in files])


def frame_deltas(frames):
    return np.abs(np.diff(frames.astype(np.int16), axis=0)).mean(axis=(1, 2))


def find_tap(deltas):
    """
    The tap frame: the first large change after a quiet opening.

    The recording starts on a home screen doing nothing, so the first real
    motion is the icon press. Using the largest delta instead would pick the
    splash-to-content cut in the middle of the launch.
    """
    quiet = deltas < STILL_THRESHOLD
    i = 0
    while i < len(quiet) and not quiet[i]:
        i += 1                      # skip any leading motion (hand entering frame)
    while i < len(quiet) and quiet[i]:
        i += 1                      # cross the still home screen
    # deltas[k] is the change BETWEEN frame k and k+1, so motion first visible
    # at delta index k means the screen first differs at frame k+1. Returning
    # the delta index put a constant one-frame stretch on every interval —
    # 0.817s where the synthetic recording was built to be 0.800s. Small, but
    # this exists to be frame-accurate.
    return min(i + 1, len(deltas))


def find_settled(deltas, start):
    """First frame at/after `start` beginning a sustained still run."""
    run = 0
    for i in range(start, len(deltas)):
        if deltas[i] < STILL_THRESHOLD:
            run += 1
            if run >= STILL_RUN:
                return i - run + 1
        else:
            run = 0
    return None


def find_caret(frames, start, fps):
    """
    Locate a small region blinking at caret rate; return the first frame of it.

    Works on per-cell variance over time rather than on any single frame, so it
    does not need to know what a cursor looks like — only that one small patch
    of the screen is switching on and off about once a second while everything
    around it holds still. That "everything around it holds still" is why this
    must run on the settled screen and not from the tap.
    """
    if start >= len(frames) - int(fps * 2):
        return None, 0.0
    seg = frames[start:]
    h, w = seg.shape[1:]
    ch, cw = max(4, h // 40), max(4, w // 40)
    best = (None, 0.0)
    for y in range(0, h - ch, ch):
        for x in range(0, w - cw, cw):
            cell = seg[:, y:y + ch, x:x + cw].mean(axis=(1, 2))
            swing = cell.max() - cell.min()
            if swing < 12:                      # too faint to be a caret
                continue
            centred = cell - cell.mean()
            spec = np.abs(np.fft.rfft(centred))
            freqs = np.fft.rfftfreq(len(centred), d=1.0 / fps)
            band = (freqs >= BLINK_MIN_HZ) & (freqs <= BLINK_MAX_HZ)
            if not band.any():
                continue
            peak = spec[band].max()
            total = spec[1:].sum() or 1.0
            score = float(peak / total)         # share of variation at caret rate
            if score > best[1]:
                # First frame in this cell that departs from its own baseline —
                # the caret's first appearance, not the whole segment's start.
                dev = np.abs(cell - cell[0])
                onset = int(np.argmax(dev > swing * 0.4))
                best = (start + onset, score)
    return best


def analyse(path, fps, contact_sheet=None):
    work = tempfile.mkdtemp(prefix='launch-')
    try:
        frames = extract(path, fps, work)
        deltas = frame_deltas(frames)
        tap = find_tap(deltas)
        settled = find_settled(deltas, tap + 1)
        # Hunt for the caret only after the screen settles. Searching from the
        # tap put the whole launch animation in scope, and its variance buries
        # a 3px caret — the first test run reported 0.667s for a caret that
        # appears at 1.400s, having locked onto the loading transition.
        caret, caret_score = find_caret(frames, (settled if settled is not None else tap) + 1, fps)

        res = {
            'file': os.path.basename(path),
            'fps': fps,
            'frames': int(len(frames)),
            'tap_frame': int(tap),
            'launch_frame': int(settled) if settled is not None else None,
            'launch_s': round((settled - tap) / fps, 3) if settled is not None else None,
            'ready_frame': int(caret) if caret is not None else None,
            'ready_s': round((caret - tap) / fps, 3) if caret is not None else None,
            'caret_confidence': round(caret_score, 3),
        }
        if res['ready_s'] is not None and res['launch_s'] is not None and res['ready_s'] < res['launch_s']:
            # A caret found before the screen settles usually means the blink
            # detector locked onto an animation. Say so instead of reporting it.
            res['warning'] = 'caret detected before screen settled — verify with --contact-sheet'
        if caret_score < 0.12:
            res['warning'] = 'weak blink signal — cursor may never appear, or the app was already open'

        if contact_sheet:
            marks = [m for m in (tap, settled, caret) if m is not None]
            sheet_frames = sorted({max(0, min(len(frames) - 1, m + d))
                                   for m in marks for d in (-3, 0, 3)})
            tiles = [Image.fromarray(frames[i].astype(np.uint8)) for i in sheet_frames]
            tw, th = tiles[0].size
            sheet = Image.new('L', (tw * len(tiles), th))
            for k, t in enumerate(tiles):
                sheet.paste(t, (k * tw, 0))
            sheet.save(contact_sheet)
            res['contact_sheet'] = contact_sheet
            res['contact_sheet_frames'] = sheet_frames
        return res
    finally:
        shutil.rmtree(work, ignore_errors=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('recordings', nargs='+')
    ap.add_argument('--fps', type=float, default=60.0)
    ap.add_argument('--app', help='label for the app being measured')
    ap.add_argument('--json', action='store_true')
    ap.add_argument('--contact-sheet-dir')
    args = ap.parse_args()

    paths = [p for pat in args.recordings for p in sorted(glob.glob(pat))] or args.recordings
    results = []
    for p in paths:
        sheet = None
        if args.contact_sheet_dir:
            os.makedirs(args.contact_sheet_dir, exist_ok=True)
            sheet = os.path.join(args.contact_sheet_dir,
                                 os.path.splitext(os.path.basename(p))[0] + '-sheet.png')
        r = analyse(p, args.fps, sheet)
        if args.app:
            r['app'] = args.app
        results.append(r)

    if args.json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
        return

    print(f"{'file':<34}{'launch':>9}{'ready':>9}{'conf':>7}  note")
    for r in results:
        note = r.get('warning', '')
        ls = f"{r['launch_s']:.3f}s" if r['launch_s'] is not None else '—'
        rs = f"{r['ready_s']:.3f}s" if r['ready_s'] is not None else '—'
        print(f"{r['file'][:33]:<34}{ls:>9}{rs:>9}{r['caret_confidence']:>7.2f}  {note}")

    # The protocol reports medians, so compute them here rather than by hand.
    for key, label in (('launch_s', 'launch'), ('ready_s', 'ready')):
        vals = sorted(r[key] for r in results if r[key] is not None)
        if len(vals) >= 3:
            print(f"median {label}: {vals[len(vals) // 2]:.3f}s   (n={len(vals)})")


if __name__ == '__main__':
    main()
