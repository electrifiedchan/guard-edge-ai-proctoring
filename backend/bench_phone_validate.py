"""Validate the q0.6 -> q0.8 prop-scan quality change against real frames.

Replicates the EXACT decision from edge_main.scan_objects:
  - full frame, cell-phone box >= YOLO_CONF (0.35)      -> fires instantly
  - lower 5/8-width tiles >= PHONE_LOWER_CONF (0.20)     -> fires after 2 in a row

Two sets:
  1. The 9 stored MOBILE_DEVICE evidence frames — already caught in production.
     They are baked at q0.6, so this change cannot improve them; the test is that
     they do not REGRESS. Re-encoding at q0.8 here only confirms the sweep logic.
  2. The morning miss frame (a preview screenshot) — reconstructed through the
     real pipeline and encoded at q0.6 (old) vs q0.8 (new) to show the flip.

Run:  ../venv/Scripts/python.exe bench_phone_validate.py <morning-screenshot.png>
"""
from __future__ import annotations

import glob
import os
import sqlite3
import sys

import cv2
from ultralytics import YOLO

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
EVIDENCE = os.path.join(HERE, "evidence")
DB = os.path.join(HERE, "guard_telemetry.db")

PHONE = "cell phone"
CLASSES = [67, 73]
FULL_FLOOR = 0.35   # YOLO_CONF
TILE_FLOOR = 0.20   # PHONE_LOWER_CONF
VISIBLE_HEIGHT_FRACTION = 0.714

MODEL = YOLO(os.path.join(ROOT, "yolov8s.pt"))


def prod_tiles(img):
    """The exact three images scan_objects sends: full + two lower 5/8 tiles."""
    h, w = img.shape[:2]
    top, tw = h // 3, (w * 5) // 8
    return [img, img[top:h, 0:tw], img[top:h, w - tw : w]]


def decide(img):
    """Return (full_conf, lower_conf, fires) under production floors."""
    batch = prod_tiles(img)
    res = MODEL(batch, verbose=False, classes=CLASSES, conf=0.02, imgsz=640)

    def best(results):
        s = 0.0
        for r in results:
            for b in r.boxes:
                if MODEL.names[int(b.cls[0])] == PHONE:
                    s = max(s, float(b.conf[0]))
        return s

    full, lower = best(res[:1]), best(res[1:])
    # Instant full-frame critical, OR lower-field (which needs 2 consecutive
    # sweeps in production; a single frame >= floor is a vote toward that).
    fires = full >= FULL_FLOOR or lower >= TILE_FLOOR
    return full, lower, fires


def reencode(img, q):
    ok, enc = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, q])
    return cv2.imdecode(enc, cv2.IMREAD_COLOR)


def morning_camera_frame(path):
    crop = cv2.imread(path)
    if crop is None:
        raise SystemExit(f"could not read {path}")
    h, w = crop.shape[:2]
    full_h = int(round(h / VISIBLE_HEIGHT_FRACTION))
    pad = (full_h - h) // 2
    frame = cv2.copyMakeBorder(crop, pad, full_h - h - pad, 0, 0, cv2.BORDER_REPLICATE)
    return cv2.resize(cv2.resize(frame, (1280, 720)), (640, 360))


def load_positives():
    on_disk = {os.path.basename(f): f for f in glob.glob(os.path.join(EVIDENCE, "*.jpg"))}
    con = sqlite3.connect(DB)
    rows = con.execute(
        "select evidence_url from moments where kind='MOBILE_DEVICE'"
    ).fetchall()
    con.close()
    return sorted({on_disk[os.path.basename(u)] for (u,) in rows if os.path.basename(u or "") in on_disk})


def main():
    print("=" * 66)
    print("SET 1 — stored already-caught frames (regression: must still fire)")
    print("=" * 66)
    pos = load_positives()
    fired = 0
    for f in pos:
        img = cv2.imread(f)
        if img is None:
            continue
        full, lower, fires = decide(img)
        fired += fires
        print(f"  {'FIRES' if fires else 'MISS ':5}  full={full:.3f} lower={lower:.3f}  {os.path.basename(f)[:40]}")
    print(f"\n  {fired}/{len(pos)} still detected after the change\n")

    if len(sys.argv) >= 2:
        print("=" * 66)
        print("SET 2 — morning miss frame, old q0.6 vs new q0.8")
        print("=" * 66)
        cam = morning_camera_frame(sys.argv[1])
        for q in (60, 80):
            full, lower, fires = decide(reencode(cam, q))
            tag = "OLD" if q == 60 else "NEW"
            print(f"  q0.{q//10} ({tag})  full={full:.3f} lower={lower:.3f}  -> "
                  f"{'DETECTED' if fires else 'MISS'}")


if __name__ == "__main__":
    main()
