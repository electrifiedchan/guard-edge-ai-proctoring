"""Re-run every phone-marked evidence frame through the SHIPPED detector.

Not a test — a review instrument. It answers one question per frame: given what
`scan_objects` does today, would this frame accuse the candidate of holding a
phone, and what exactly is it looking at when it says so?

The decision is not restated here. The floors, the class filter and the box
extraction are IMPORTED from edge_main, because the last copy of those numbers
sat in this file describing a two-tile lower-field pass at 0.35/0.20 for months
after that pass was deleted. A harness that describes a pipeline the product no
longer runs is worse than no harness: it reports confidently, and it reports
about nothing. Importing means this file cannot drift again without failing loud.

What ships, and therefore what is measured:
  - ONE full-frame pass, imgsz=640, augment off
  - called at PHONE_DRAW_CONF so sub-threshold boxes come back and can be drawn
  - a box counts toward the verdict only at >= YOLO_CONF
  - production also needs PHONE_FULL_CONFIRMATIONS consecutive sweeps, which on
    a still frame is the same answer twice; one evaluation settles it

Scored against labels.json, NOT against the moments table. The moments rows are
the detector's own output — nine of these twenty-five frames contain no phone —
so scoring against them grades the detector on agreeing with itself. Frames
nobody has eyeballed are excluded from the numbers and counted out loud, so a
partial label set reads as partial instead of quietly averaging over guesses.

Run:  ../venv/Scripts/python.exe bench_phone_validate.py
      ../venv/Scripts/python.exe bench_phone_validate.py --sheet
"""
from __future__ import annotations

import json
import os
import sys

import cv2

from edge_main import (
    PHONE_DRAW_CONF,
    PHONE_FULL_CONFIRMATIONS,
    YOLO_CONF,
    YOLO_PROP_CLASSES,
    _detect_boxes,
    yolo_model_prop,
)

HERE = os.path.dirname(os.path.abspath(__file__))
EVIDENCE = os.path.join(HERE, "evidence")
LABELS = os.path.join(HERE, "labels.json")
OUT_JSON = os.path.join(HERE, "bench_phone_validate.json")
SHEET = os.path.join(EVIDENCE, "_REVIEW_sheet.jpg")

PHONE = "cell phone"

# Sheet geometry. 4 columns at 1.5x keeps the whole set on one image at a width
# that still opens in an image viewer, and 1.5x is the smallest scale at which a
# phone-sized box is unambiguous to the eye at 640x360 source.
COLS = 4
SCALE = 1.5
CAPTION_H = 26


def load_labels() -> list[dict]:
    with open(LABELS, encoding="utf-8") as fh:
        return json.load(fh)["frames"]


def sweep(img) -> list[dict]:
    """Exactly the inference scan_objects runs, returning every box it drew."""
    height, width = img.shape[:2]
    results = yolo_model_prop(
        img,
        verbose=False,
        classes=YOLO_PROP_CLASSES,
        imgsz=640,
        augment=False,
        conf=PHONE_DRAW_CONF,
    )
    return _detect_boxes(
        results,
        yolo_model_prop.names,
        YOLO_CONF,
        source="full",
        frame_width=width,
        frame_height=height,
    )


def dashed_rect(canvas, p1, p2, colour, thickness=2, dash=8):
    """cv2 has no dash pattern, and the distinction is worth the ten lines.

    Solid means the box counted toward a verdict; dashed means the detector saw
    it and declined to act. Same convention as the live overlay, so a frame in
    this sheet and the same frame on screen read identically.
    """
    x1, y1 = p1
    x2, y2 = p2
    for x in range(x1, x2, dash * 2):
        cv2.line(canvas, (x, y1), (min(x + dash, x2), y1), colour, thickness)
        cv2.line(canvas, (x, y2), (min(x + dash, x2), y2), colour, thickness)
    for y in range(y1, y2, dash * 2):
        cv2.line(canvas, (x1, y), (x1, min(y + dash, y2)), colour, thickness)
        cv2.line(canvas, (x2, y), (x2, min(y + dash, y2)), colour, thickness)


def render_cell(img, boxes, caption):
    h, w = img.shape[:2]
    cell = cv2.resize(img, (int(w * SCALE), int(h * SCALE)))
    ch, cw = cell.shape[:2]

    for b in boxes:
        nx1, ny1, nx2, ny2 = b["box"]
        p1 = (int(nx1 * cw), int(ny1 * ch))
        p2 = (int(nx2 * cw), int(ny2 * ch))
        # BGR. Red = fired (counted), amber = seen and not counted.
        colour = (48, 59, 255) if b["fired"] else (32, 176, 255)
        if b["fired"]:
            cv2.rectangle(cell, p1, p2, colour, 2)
        else:
            dashed_rect(cell, p1, p2, colour, 2)
        tag = f"{b['label']} {b['conf']:.0%}"
        ty = p1[1] - 6 if p1[1] > 18 else p2[1] + 16
        cv2.putText(cell, tag, (p1[0], ty), cv2.FONT_HERSHEY_SIMPLEX, 0.5, colour, 2)

    bar = cv2.copyMakeBorder(
        cell, 0, CAPTION_H, 0, 0, cv2.BORDER_CONSTANT, value=(18, 18, 18)
    )
    cv2.putText(
        bar, caption, (8, ch + 18), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (235, 235, 235), 1
    )
    return bar


def build_sheet(cells):
    rows = []
    for i in range(0, len(cells), COLS):
        row = cells[i : i + COLS]
        while len(row) < COLS:
            row.append(cv2.copyMakeBorder(
                row[0] * 0, 0, 0, 0, 0, cv2.BORDER_CONSTANT, value=(18, 18, 18)
            ))
        rows.append(cv2.hconcat(row))
    return cv2.vconcat(rows)


def main() -> None:
    want_sheet = "--sheet" in sys.argv
    frames = load_labels()

    print(f"floors: call={PHONE_DRAW_CONF}  verdict={YOLO_CONF}  "
          f"consecutive sweeps={PHONE_FULL_CONFIRMATIONS}")
    print(f"pass:   one full frame, imgsz=640, augment=off\n")
    print(f"{'#':>3}  {'VERDICT':<9} {'best':>6}  {'truth':<11} frame")
    print("-" * 78)

    cells, records = [], []
    for rec in frames:
        path = os.path.join(EVIDENCE, rec["file"])
        img = cv2.imread(path)
        if img is None:
            print(f"{rec['n']:>3}  {'MISSING':<9} {'-':>6}  {'-':<11} {rec['file'][:34]}")
            continue

        boxes = sweep(img)
        phones = [b for b in boxes if b["label"] == PHONE]
        best = max((b["conf"] for b in phones), default=0.0)
        fires = any(b["fired"] for b in phones)

        if not rec["verified"]:
            truth = "unverified"
        else:
            truth = "phone" if rec["phone_present"] else "no phone"

        verdict = "ACCUSES" if fires else "silent"
        mark = ""
        if rec["verified"]:
            if rec["phone_present"] and not fires:
                mark = "  <- MISS"
            elif not rec["phone_present"] and fires:
                mark = "  <- FALSE ACCUSATION"

        print(f"{rec['n']:>3}  {verdict:<9} {best:>6.3f}  {truth:<11} "
              f"{rec['file'][-12:-4]}{mark}")

        records.append({
            "n": rec["n"], "file": rec["file"], "best_phone_conf": round(best, 3),
            "accuses": fires, "verified": rec["verified"],
            "phone_present": rec["phone_present"],
            "boxes": boxes,
        })

        if want_sheet:
            state = "ACCUSES" if fires else "silent"
            cells.append(render_cell(
                img, boxes,
                f"#{rec['n']:02d} {state} {best:.2f}  truth={truth}",
            ))

    verified = [r for r in records if r["verified"]]
    real = [r for r in verified if r["phone_present"]]
    fake = [r for r in verified if not r["phone_present"]]
    unver = [r for r in records if not r["verified"]]

    print("\n" + "=" * 78)
    print(f"  real phones found      {sum(r['accuses'] for r in real)}/{len(real)}")
    print(f"  false accusations      {sum(r['accuses'] for r in fake)}/{len(fake)}")
    print(f"  excluded (unverified)  {len(unver)}  "
          f"— of which {sum(r['accuses'] for r in unver)} would accuse")
    print("=" * 78)
    if unver:
        print("\nThe excluded frames are not a rounding error, they are most of the set.")
        print("Open the sheet, decide each one, and write it into labels.json.")

    with open(OUT_JSON, "w", encoding="utf-8") as fh:
        json.dump(records, fh, indent=2)
    print(f"\nwrote {os.path.basename(OUT_JSON)}")

    if want_sheet and cells:
        cv2.imwrite(SHEET, build_sheet(cells), [cv2.IMWRITE_JPEG_QUALITY, 92])
        print(f"wrote {SHEET}")


if __name__ == "__main__":
    main()
