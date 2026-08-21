"""Sweep configurations against a frame the deployed sweep is known to MISS.

`bench_phone_recall.py` measures recall on frames drawn from `moments` where
kind='MOBILE_DEVICE' — i.e. frames the shipped config already found. Those cannot
falsify that config: it scores 100% on them by construction. The interesting
sample is the opposite one, a frame where a phone is plainly visible to the person
holding it and the sweep said nothing.

This harness takes such a frame, reconstructs the geometry the backend actually
receives, and reports the best 'cell phone' confidence per configuration against
the production floors (full 0.35, lower tiles 0.20).

Geometry reconstruction: the screenshot is the object-cover VISIBLE region of the
preview, which at a 2.49 box aspect against a 16:9 camera is the middle ~71% of
frame height at full width. The backend receives the WHOLE 1280x720 frame scaled
to 640x360 at JPEG q=0.6, so the phone arrives smaller and softer than it looks
on screen. Both steps are applied here or the measurement is of the wrong image.

Run:  ../venv/Scripts/python.exe bench_phone_hard.py <path-to-preview-screenshot>
"""
from __future__ import annotations

import os
import sys
import time

import cv2
from ultralytics import YOLO

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

PHONE = "cell phone"
CLASSES = [67, 73]
VISIBLE_HEIGHT_FRACTION = 0.714  # object-cover, 2.49 box aspect vs 16:9 camera

# Production floors, mirrored from edge_main.py.
FULL_FLOOR = 0.35
TILE_FLOOR = 0.20


def to_production_frame(preview_path: str, jpeg_q: int = 60):
    """Preview crop -> the 640x360 image the backend actually decodes.

    jpeg_q mirrors the frontend's toDataURL quality for the prop scan (0.6 today).
    """
    crop = cv2.imread(preview_path)
    if crop is None:
        raise SystemExit(f"could not read {preview_path}")
    h, w = crop.shape[:2]
    # Pad back the band object-cover hid, so the aspect is the camera's again.
    full_h = int(round(h / VISIBLE_HEIGHT_FRACTION))
    pad = (full_h - h) // 2
    frame = cv2.copyMakeBorder(
        crop, pad, full_h - h - pad, 0, 0, cv2.BORDER_REPLICATE
    )
    camera = cv2.resize(frame, (1280, 720))
    shipped = cv2.resize(camera, (640, 360))
    ok, enc = cv2.imencode(".jpg", shipped, [cv2.IMWRITE_JPEG_QUALITY, jpeg_q])
    if not ok:
        raise SystemExit("jpeg encode failed")
    return camera, cv2.imdecode(enc, cv2.IMREAD_COLOR)


def clahe(img):
    """Contrast-limited equalisation on luminance only — a dark phone against a
    dark shirt is a contrast problem before it is a detection problem."""
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    l = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(l)
    return cv2.cvtColor(cv2.merge((l, a, b)), cv2.COLOR_LAB2BGR)


def tiles_for(img, strategy: str):
    h, w = img.shape[:2]
    if strategy == "prod":
        top, tw = h // 3, (w * 5) // 8
        return [img, img[top:h, 0:tw], img[top:h, w - tw : w]]
    if strategy == "prod-half":
        top, tw = h // 3, w // 2
        return [img, img[top:h, 0:tw], img[top:h, w - tw : w]]
    if strategy == "lower-thirds":
        top, tw = h // 2, w // 3
        return [img] + [img[top:h, x : x + tw] for x in (0, w // 3, w - tw)]
    if strategy == "grid2x2":
        return [img] + [
            img[y : y + h // 2, x : x + w // 2]
            for y in (0, h // 2)
            for x in (0, w // 2)
        ]
    if strategy == "grid3x3-lower":
        # Six overlapping tiles across the lower two-thirds, each ~1/3 of width,
        # so a small object upscales ~3x into the inference canvas.
        top = h // 3
        tw, th = w // 3, (h - top) // 2
        out = [img]
        for y in (top, top + th // 2):
            for x in (0, w // 3, w - tw):
                out.append(img[y : y + th, x : x + tw])
        return out
    raise ValueError(strategy)


def probe(model, batch, imgsz: int):
    t0 = time.perf_counter()
    res = model(batch, verbose=False, classes=CLASSES, conf=0.01, imgsz=imgsz)
    ms = (time.perf_counter() - t0) * 1000

    def best(rs):
        s = 0.0
        for r in rs:
            for b in r.boxes:
                if model.names[int(b.cls[0])] == PHONE:
                    s = max(s, float(b.conf[0]))
        return s

    return ms, best(res[:1]), best(res[1:])


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)

    model = YOLO(os.path.join(ROOT, "yolov8s.pt"))
    _cam0, ship0 = to_production_frame(sys.argv[1])
    model([ship0], verbose=False, classes=CLASSES, conf=0.5, imgsz=640)

    # The levers that actually attack a 0.185-vs-0.20 near-miss on a dark,
    # low-quality frame: JPEG quality, contrast, and imgsz. Geometry already
    # shown not to help (tighter tiles drop a centred phone into the gap).
    print(f"{'config':44} {'ms':>7}  {'full':>6} {'tiles':>6}  verdict")
    for jpeg_q in (60, 80, 92):
        camera, shipped = to_production_frame(sys.argv[1], jpeg_q=jpeg_q)
        variants = [
            (f"q{jpeg_q} prod imgsz640", shipped, "prod", 640),
            (f"q{jpeg_q} prod imgsz800", shipped, "prod", 800),
            (f"q{jpeg_q} clahe prod imgsz640", clahe(shipped), "prod", 640),
            (f"q{jpeg_q} clahe prod imgsz800", clahe(shipped), "prod", 800),
        ]
        for tag, img, strategy, imgsz in variants:
            ms, full, tile = probe(model, tiles_for(img, strategy), imgsz)
            fires = full >= FULL_FLOOR or tile >= TILE_FLOOR
            print(
                f"{tag:44} {ms:7.0f}  {full:6.3f} {tile:6.3f}  "
                f"{'DETECTED' if fires else 'miss'}"
            )

    # What floor would this frame need? Report the best score any cheap config
    # reaches, so the fix can be "lower the tile floor to X" if that is safe.
    camera, shipped = to_production_frame(sys.argv[1], jpeg_q=80)
    best = 0.0
    for img in (shipped, clahe(shipped)):
        for imgsz in (640, 800):
            _, f, t = probe(model, tiles_for(img, "prod"), imgsz)
            best = max(best, f, t)
    print(f"\nbest cell-phone confidence reachable cheaply: {best:.3f}")
    print(f"production tile floor today: {TILE_FLOOR}")


if __name__ == "__main__":
    main()
