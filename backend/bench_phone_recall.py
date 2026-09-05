"""Sweep phone-detection configurations against real stored evidence frames.

Not a test — a measurement harness. `scan-objects` misses a phone that is plainly
visible to the person holding it (52x67 px, dark-on-dark, JPEG q=0.6), and the
miss reads as a 5 s delay because the slower telemetry loop eventually catches
what the fast sweep dropped. This script exists to pick the tiling geometry and
confidence floors on evidence rather than by feel.

Ground truth is labels.json, written by a human looking at pixels.

It used to be the `moments` table — rows with kind='MOBILE_DEVICE', on the
reasoning that those are frames the deployed system already confirmed a phone
in. That reasoning is circular, and it cost real time. Those rows are the
detector's OUTPUT, so scoring against them grades the detector on agreeing with
itself, and it agreed with itself while being wrong: nine of the twenty-five
contain no phone, only an over-ear headset or the shadowed edge of a face. Run
that way, this harness scored the config that fixed the false positives as a 36%
recall REGRESSION and the config that caused them as perfect. A harness that
ranks the bug above the fix is not a slow harness, it is an inverted one.

So: frames a human has verified are scored, frames nobody has looked at are
excluded and counted out loud. Frames behind other `moments` kinds are kept as a
separate unlabelled control — broad, useful for spotting a config that fires on
everything, but a fire there is a candidate to eyeball, not a proven error.

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
LABELS = os.path.join(HERE, "labels.json")

PHONE = "cell phone"
# 67 = cell phone, 73 = book. Person is excluded exactly as in the prop sweep.
CLASSES = [67, 73]


def load_sets() -> tuple[list[str], list[str], list[str], list[str]]:
    """Return (verified phone, verified no-phone, unverified, unlabelled control).

    The first two are what the scores are computed from. The third is returned
    rather than silently folded into either, because "we have not checked" and
    "there is no phone" are different facts and only one of them is knowledge.
    """
    on_disk = {
        os.path.basename(f): f for f in glob.glob(os.path.join(EVIDENCE, "*.jpg"))
    }

    with open(LABELS, encoding="utf-8") as fh:
        frames = json.load(fh)["frames"]

    pos, neg, unver = [], [], []
    for rec in frames:
        path = on_disk.get(rec["file"])
        if not path:
            continue
        if not rec["verified"]:
            unver.append(path)
        elif rec["phone_present"]:
            pos.append(path)
        else:
            neg.append(path)

    labelled = {os.path.basename(p) for p in pos + neg + unver}
    con = sqlite3.connect(DB)
    rows = con.execute(
        "select evidence_url from moments where kind is not null and kind != 'MOBILE_DEVICE'"
    ).fetchall()
    con.close()
    control = sorted(
        {
            on_disk[b]
            for (u,) in rows
            if (b := os.path.basename(u or "")) in on_disk and b not in labelled
        }
    )
    return sorted(pos), sorted(neg), sorted(unver), control


def tiles_for(img, strategy: str):
    """Return the batch of images one sweep would send for a given geometry."""
    h, w = img.shape[:2]
    if strategy == "full":
        # What ships today: one full-frame pass, no tiles. Every tile geometry
        # below is kept so the decision stays re-runnable, not because any of
        # them is a candidate — see the note above `configs`.
        return [img]
    if strategy == "prod":
        # What USED to ship: lower 2/3, two 5/8-width tiles, left and right.
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
    pos, neg, unver, control = load_sets()
    print(f"verified phone present:   {len(pos)}")
    print(f"verified no phone:        {len(neg)}")
    print(f"unverified (EXCLUDED):    {len(unver)}")
    print(f"unlabelled control:       {len(control)}")
    dims = Counter()
    for f in pos + neg + unver:
        im = cv2.imread(f)
        if im is not None:
            dims[im.shape[:2]] += 1
    print(f"frame sizes: {dims.most_common(4)}\n")
    if not pos or not neg:
        print("Need verified frames on BOTH sides — a recall number with no false-")
        print("positive number beside it is what got the tile pass shipped. Label")
        print("more frames in labels.json (bench_phone_validate.py --sheet) first.")
        return

    models = {}
    for tag, path in (("8n", "yolov8n.pt"), ("8s", "yolov8s.pt")):
        p = os.path.join(os.path.dirname(HERE), path)
        if os.path.exists(p):
            models[tag] = YOLO(p)

    # The tile geometries are kept deliberately. They lost — every head-region
    # tile detection in the evidence set was false — and keeping the losers in
    # the sweep is what lets the next person re-derive that in one command
    # instead of re-inventing the idea and shipping it again.
    configs = [
        # (model, strategy, imgsz, enhance)
        ("8s", "full", 640, "none"),          # what ships today — the baseline
        ("8s", "prod", 640, "none"),          # the tile pass this replaced
        ("8s", "prod-half", 640, "none"),
        ("8s", "grid2x2", 640, "none"),
        ("8s", "lower3", 640, "none"),
        ("8s", "centre-lower", 640, "none"),
        ("8s", "full", 960, "none"),
        ("8s", "prod", 960, "none"),
        ("8s", "grid2x2", 960, "none"),
        ("8s", "full", 640, "clahe"),
        ("8s", "prod", 640, "clahe"),
        ("8s", "full", 640, "upscale2x"),
        ("8s", "grid2x2", 640, "upscale2x"),
        ("8n", "full", 640, "none"),
        ("8n", "prod", 640, "none"),
    ]

    # Floors worth reporting at. 0.40 is today's production verdict floor, chosen
    # because the verified scores leave an empty band between 0.372 and 0.453 and
    # it sits inside it. 0.15 is the floor the model is CALLED at, below which
    # nothing is even drawn. The two either side of 0.40 are there to show the
    # cost of moving it: 0.30 buys nothing and 0.50 starts losing real phones.
    floors = [0.50, 0.40, 0.30, 0.15]
    results = []

    for mtag, strategy, imgsz, enh in configs:
        if mtag not in models:
            continue
        model = models[mtag]
        scored = {"pos": [], "neg": [], "control": []}
        times = []
        for name, paths in (("pos", pos), ("neg", neg), ("control", control)):
            for path in paths:
                img = cv2.imread(path)
                if img is None:
                    continue
                img = enhance(img, enh)
                ms, f, t = best_phone(model, tiles_for(img, strategy), imgsz)
                if name == "pos":
                    times.append(ms)
                scored[name].append(max(f, t))

        med_ms = sorted(times)[len(times) // 2] if times else 0
        row = {
            "config": f"{mtag} {strategy} imgsz={imgsz} {enh}",
            "ms": med_ms,
            "n": {k: len(v) for k, v in scored.items()},
            "recall": {
                f: sum(1 for s in scored["pos"] if s >= f) / len(scored["pos"])
                for f in floors
            },
            "false_accusation": {
                f: sum(1 for s in scored["neg"] if s >= f) / len(scored["neg"])
                for f in floors
            },
            "control_fire": {
                f: sum(1 for s in scored["control"] if s >= f)
                / max(1, len(scored["control"]))
                for f in floors
            },
        }
        results.append(row)
        print(f"{row['config']:34} {med_ms:6.0f}ms")
        # Recall and false accusations on the same screen, always. Reading one
        # without the other is exactly the mistake this file used to encourage.
        for key, caption in (
            ("recall", "recall  "),
            ("false_accusation", "FALSE   "),
            ("control_fire", "control "),
        ):
            print(f"    {caption}" + "  ".join(f"@{f}={row[key][f]:.0%}" for f in floors))

    with open(os.path.join(HERE, "bench_phone_recall.json"), "w") as fh:
        json.dump(results, fh, indent=2)
    print(f"\nwrote bench_phone_recall.json  ({len(unver)} unverified frames excluded)")


if __name__ == "__main__":
    main()
