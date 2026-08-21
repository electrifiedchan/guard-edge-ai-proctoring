"""Sweep phone-detection configurations against real stored evidence frames.

Not a test — a measurement harness. `scan-objects` misses a phone that is plainly
visible to the person holding it (52x67 px, dark-on-dark, JPEG q=0.6), and the
miss reads as a 5 s delay because the slower telemetry loop eventually catches
what the fast sweep dropped. This script exists to pick the tiling geometry and
confidence floors on evidence rather than by feel.

Ground truth is the `moments` table: rows with kind='MOBILE_DEVICE' are frames
the deployed system already confirmed a phone in, so a config that cannot find
them is strictly worse than what ships today. Frames behind any other kind are
the negative pool — imperfect (a phone can be in shot without having opened a
MOBILE_DEVICE episode) so a "false positive" here is a candidate to eyeball, not
a proven error.

Run:  ../venv/Scripts/python.exe bench_phone_recall.py
"""
from __future__ import annotations

import glob
import json
import os
import sqlite3
import time
from collections import Counter

import cv2
from ultralytics import YOLO

HERE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(HERE, "guard_telemetry.db")
EVIDENCE = os.path.join(HERE, "evidence")

PHONE = "cell phone"
# 67 = cell phone, 73 = book. Person is excluded exactly as in the prop sweep.
CLASSES = [67, 73]


def load_sets() -> tuple[list[str], list[str]]:
    on_disk = {
        os.path.basename(f): f for f in glob.glob(os.path.join(EVIDENCE, "*.jpg"))
    }
    con = sqlite3.connect(DB)
    rows = con.execute(
        "select evidence_url, kind from moments where kind is not null"
    ).fetchall()
    con.close()

    pos, neg = [], []
    for url, kind in rows:
        path = on_disk.get(os.path.basename(url or ""))
        if not path:
            continue
        (pos if kind == "MOBILE_DEVICE" else neg).append(path)
    return sorted(set(pos)), sorted(set(neg))


def tiles_for(img, strategy: str):
    """Return the batch of images one sweep would send for a given geometry."""
    h, w = img.shape[:2]
    if strategy == "full":
        return [img]
    if strategy == "prod":
        # What ships today: lower 2/3, two 5/8-width tiles, left and right.
        top, tw = h // 3, (w * 5) // 8
        return [img, img[top:h, 0:tw], img[top:h, w - tw : w]]
    if strategy == "prod-half":
        # Same band, narrower tiles -> each upscales further into YOLO's canvas.
        top, tw = h // 3, w // 2
        return [img, img[top:h, 0:tw], img[top:h, w - tw : w]]
    if strategy == "grid2x2":
        return [img] + [
            img[y : y + h // 2, x : x + w // 2]
            for y in (0, h // 2)
            for x in (0, w // 2)
        ]
    if strategy == "lower3":
        # Lower half only, three overlapping thirds — the lap/desk band.
        top = h // 2
        tw = w // 2
        xs = [0, (w - tw) // 2, w - tw]
        return [img] + [img[top:h, x : x + tw] for x in xs]
    if strategy == "centre-lower":
        # One tile, tight on where a hand holds a phone.
        return [img, img[h // 3 : h, w // 4 : (w * 3) // 4]]
    raise ValueError(strategy)


def enhance(img, mode: str):
    if mode == "none":
        return img
    if mode == "clahe":
        # A dark phone against a dark shirt is a contrast problem before it is a
        # detection problem. CLAHE on luminance only, so colour is untouched.
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        l = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(l)
        return cv2.cvtColor(cv2.merge((l, a, b)), cv2.COLOR_LAB2BGR)
    if mode == "upscale2x":
        h, w = img.shape[:2]
        return cv2.resize(img, (w * 2, h * 2), interpolation=cv2.INTER_CUBIC)
    raise ValueError(mode)


def best_phone(model, batch, imgsz: int) -> tuple[float, float, float]:
    """Return (ms, best full-frame conf, best tile conf) for one sweep."""
    t0 = time.perf_counter()
    res = model(batch, verbose=False, classes=CLASSES, conf=0.02, imgsz=imgsz)
    ms = (time.perf_counter() - t0) * 1000

    def best(results):
        s = 0.0
        for r in results:
            for box in r.boxes:
                if model.names[int(box.cls[0])] == PHONE:
                    s = max(s, float(box.conf[0]))
        return s

    return ms, best(res[:1]), best(res[1:])


def main() -> None:
    pos, neg = load_sets()
    print(f"positives (confirmed MOBILE_DEVICE): {len(pos)}")
    print(f"negatives (other kinds):             {len(neg)}")
    dims = Counter()
    for f in pos + neg:
        im = cv2.imread(f)
        if im is not None:
            dims[im.shape[:2]] += 1
    print(f"frame sizes: {dims.most_common(4)}\n")
    if not pos:
        print("No positive frames resolved — nothing to measure. Stopping.")
        return

    models = {}
    for tag, path in (("8n", "yolov8n.pt"), ("8s", "yolov8s.pt")):
        p = os.path.join(os.path.dirname(HERE), path)
        if os.path.exists(p):
            models[tag] = YOLO(p)

    configs = [
        # (model, strategy, imgsz, enhance)
        ("8s", "prod", 640, "none"),          # what ships today — the baseline
        ("8s", "prod-half", 640, "none"),
        ("8s", "grid2x2", 640, "none"),
        ("8s", "lower3", 640, "none"),
        ("8s", "centre-lower", 640, "none"),
        ("8s", "prod", 960, "none"),
        ("8s", "prod-half", 960, "none"),
        ("8s", "grid2x2", 960, "none"),
        ("8s", "prod", 640, "clahe"),
        ("8s", "grid2x2", 640, "clahe"),
        ("8s", "prod", 640, "upscale2x"),
        ("8s", "grid2x2", 640, "upscale2x"),
        ("8n", "prod", 640, "none"),
        ("8n", "grid2x2", 640, "none"),
        ("8n", "grid2x2", 960, "none"),
    ]

    # Floors worth reporting recall at. 0.35/0.20 are today's production values.
    floors = [0.35, 0.20, 0.15, 0.10]
    results = []

    for mtag, strategy, imgsz, enh in configs:
        if mtag not in models:
            continue
        model = models[mtag]
        scores_pos, scores_neg, times = [], [], []
        for path, bucket in ((p, scores_pos) for p in pos):
            img = cv2.imread(path)
            if img is None:
                continue
            img = enhance(img, enh)
            ms, f, t = best_phone(model, tiles_for(img, strategy), imgsz)
            times.append(ms)
            bucket.append(max(f, t))
        for path in neg:
            img = enhance(cv2.imread(path), enh)
            _, f, t = best_phone(model, tiles_for(img, strategy), imgsz)
            scores_neg.append(max(f, t))

        med_ms = sorted(times)[len(times) // 2] if times else 0
        row = {
            "config": f"{mtag} {strategy} imgsz={imgsz} {enh}",
            "ms": med_ms,
            "recall": {
                f: sum(1 for s in scores_pos if s >= f) / len(scores_pos)
                for f in floors
            },
            "fp": {
                f: sum(1 for s in scores_neg if s >= f) / max(1, len(scores_neg))
                for f in floors
            },
        }
        results.append(row)
        rec = "  ".join(f"@{f}={row['recall'][f]:.0%}" for f in floors)
        fp = "  ".join(f"@{f}={row['fp'][f]:.0%}" for f in floors)
        print(f"{row['config']:34} {med_ms:6.0f}ms")
        print(f"    recall {rec}")
        print(f"    fp     {fp}")

    with open(os.path.join(HERE, "bench_phone_recall.json"), "w") as fh:
        json.dump(results, fh, indent=2)
    print("\nwrote bench_phone_recall.json")


if __name__ == "__main__":
    main()
