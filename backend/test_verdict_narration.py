"""Regression tests for determine_verdict's pose narration.

The bug these cover: the frontend fuses a head-pose sensor and an iris sensor
into ONE `head_pose` field. When only the iris had an opinion, the fusion still
emitted HEAD_DOWN, and this function narrates every value as "head tilted X".
The result on screen was "head tilted down" while the candidate sat dead centre
and never moved their head — reported from a live run on 2026-08-07.

The frontend now reports an iris-only deflection as GAZE_*, so the two sensors
stay distinguishable. What must hold here:

  1. GAZE_* narrates as EYES, never as a head tilt. That is the user-visible bug.
  2. GAZE_* still lands in the same `gaze` risk bucket as its HEAD_* twin, so
     honest wording did not quietly stop attention drift from being scored.
  3. Neither is critical on its own — drift is a warning, not a violation.

The second half of this file covers build_moment_caption, which had the mirror
image of the same disease: `verdict` narrates ONE frame, but a moment is flagged
off accumulated risk, so a clean frame inherited a HARD_WARNING badge while
printing "Candidate is fully engaged and attentive." next to an evidence photo —
reported from a live run on 2026-08-12.
"""

from edge_main import (
    _classify_moment_caption,
    build_moment_caption,
    determine_verdict,
)

CLEAN = "Candidate is fully engaged and attentive."


def _packet(score=75, level="HARD_WARNING", count=4):
    return {
        "risk_score": score,
        "intervention_level": level,
        "violation_count": count,
    }


def _verdict(pose: str, objects=None, faces: int = 1, talking: bool = False):
    return determine_verdict(objects or [], faces, talking, pose)


def test_gaze_labels_never_claim_the_head_moved():
    for pose in ("GAZE_DOWN", "GAZE_UP", "GAZE_LEFT", "GAZE_RIGHT"):
        _, _, _, verdict, _ = _verdict(pose)
        assert "head" not in verdict.lower(), (
            f"{pose} narrated as a head movement: {verdict!r}"
        )
        assert "eyes" in verdict.lower(), f"{pose} did not name the eyes: {verdict!r}"
    print("PASS gaze-only drift is narrated as eyes, not as a head tilt")


def test_head_labels_still_say_head():
    for pose in ("HEAD_DOWN", "HEAD_UP", "HEAD_LEFT", "HEAD_RIGHT"):
        _, _, _, verdict, _ = _verdict(pose)
        assert "head tilted" in verdict.lower(), (
            f"{pose} lost its head wording: {verdict!r}"
        )
    print("PASS real head deflections still narrate as head tilts")


def test_direction_survives_the_rename():
    """A down-drift must not come out as "up" — this file exists because of a
    sign bug, so the direction word is worth pinning explicitly."""
    for pose, word in (
        ("GAZE_DOWN", "down"), ("GAZE_UP", "up"),
        ("GAZE_LEFT", "left"), ("GAZE_RIGHT", "right"),
    ):
        _, _, _, verdict, _ = _verdict(pose)
        assert word in verdict.lower(), f"{pose} lost its direction: {verdict!r}"
    print("PASS each gaze direction is narrated with the matching word")


def test_gaze_shares_risk_bucket_with_its_head_twin():
    for head, gaze_pose in (
        ("HEAD_DOWN", "GAZE_DOWN"), ("HEAD_UP", "GAZE_UP"),
        ("HEAD_LEFT", "GAZE_LEFT"), ("HEAD_RIGHT", "GAZE_RIGHT"),
    ):
        assert _verdict(head)[0] == _verdict(gaze_pose)[0], (
            f"{gaze_pose} scores differently from {head} — honest wording "
            "must not change how the drift is scored"
        )
    print("PASS gaze drift scores identically to the equivalent head pose")


def test_drift_is_a_warning_not_a_critical():
    for pose in ("GAZE_DOWN", "GAZE_LEFT", "HEAD_DOWN", "HEAD_LEFT"):
        _, is_critical, kind, _, _ = _verdict(pose)
        assert not is_critical, f"{pose} escalated to critical on its own"
        assert kind is None, f"{pose} was given a critical kind: {kind!r}"
    print("PASS attention drift stays a warning")


def test_centre_is_clean_and_objects_still_outrank_pose():
    gaze, is_critical, _, verdict, _ = _verdict("HEAD_CENTER")
    assert gaze == "STRAIGHT" and not is_critical
    assert "drift" not in verdict.lower(), f"centre reported drift: {verdict!r}"

    # A phone in shot must win over any pose branch, gaze ones included.
    _, is_critical, kind, verdict, _ = _verdict("GAZE_DOWN", objects=["cell phone"])
    assert is_critical and kind == "object", "phone stopped being critical"
    assert "Mobile device" in verdict, f"phone lost its verdict: {verdict!r}"
    print("PASS centre stays clean and objects still outrank pose")


# --------------------------------------------------------------------------
# build_moment_caption — the caption must explain why the flag fired
# --------------------------------------------------------------------------

def test_a_clean_frame_is_never_captioned_as_engaged():
    """The reported bug: HARD_WARNING badge over "fully engaged and attentive"."""
    caption = build_moment_caption(CLEAN, False, "STRAIGHT", _packet())
    assert "engaged" not in caption.lower(), (
        f"clean frame still restates the frame verdict: {caption!r}"
    )
    assert "75%" in caption and "HARD_WARNING" in caption, (
        f"caption does not name the standing tier: {caption!r}"
    )
    assert "clean" in caption.lower(), (
        "caption must say the frame itself was clean — the attached photo shows "
        f"someone sitting normally: {caption!r}"
    )
    print("PASS a clean frame is captioned with the standing tier, not the frame")


def test_object_captions_pass_through_untouched():
    """_classify_moment_caption greps the caption to rebuild MOBILE_DEVICE /
    PROHIBITED_ITEM — YOLO labels are not stored per frame. Rewriting these
    strings would silently kill evidence attribution.

    Both writers say "Prohibited item detected on desk." for a book or a second
    laptop, so the classifier has to match that phrase: keying only on 'book'
    and 'laptop' made PROHIBITED_ITEM unreachable from any caption the app
    actually writes."""
    for verdict, expected in (
        ("CONFIRMED: CRITICAL: Mobile device detected in frame.", "MOBILE_DEVICE"),
        ("CRITICAL: Mobile device detected in frame.", "MOBILE_DEVICE"),
        ("CONFIRMED: CRITICAL: Prohibited item detected on desk.", "PROHIBITED_ITEM"),
        ("CRITICAL: Prohibited item detected on desk.", "PROHIBITED_ITEM"),
        # legacy / consolidated rows that leaked the raw YOLO label
        ("CRITICAL: book detected on desk.", "PROHIBITED_ITEM"),
        ("CONFIRMED: laptop (82%) in shot", "PROHIBITED_ITEM"),
    ):
        caption = build_moment_caption(verdict, True, "STRAIGHT", _packet())
        assert caption == verdict, f"critical caption was rewritten: {caption!r}"
        assert _classify_moment_caption(caption) == expected, (
            f"{verdict!r} classified as "
            f"{_classify_moment_caption(caption)}, expected {expected}"
        )
    print("PASS object criticals pass through and still classify")


def test_a_phone_outranks_a_prohibited_item_in_one_caption():
    """Consolidated reasons can name both. A phone is the graver finding, so it
    must win — the branch order is the only thing enforcing that."""
    both = "CONFIRMED: CRITICAL: Mobile device detected in frame.; Prohibited item detected on desk."
    assert _classify_moment_caption(both) == "MOBILE_DEVICE"
    print("PASS a phone outranks a prohibited item when a caption names both")


def test_a_drifting_frame_keeps_its_own_narration():
    """When the frame IS the reason, the frame string is the honest caption."""
    for pose in ("GAZE_DOWN", "HEAD_LEFT"):
        gaze, is_critical, _, verdict, _ = _verdict(pose)
        caption = build_moment_caption(verdict, is_critical, gaze, _packet())
        assert caption == verdict, f"{pose} lost its narration: {caption!r}"
        assert "drift" in caption.lower()
    print("PASS drifting frames keep their own narration")


def test_the_tier_caption_never_reads_as_an_object_violation():
    """A tier caption must classify as None, or a clean frame would be filed as
    a phone/book sighting on the verdict page."""
    for level in ("HARD_WARNING", "SEVERE_VIOLATION_LOGGED"):
        caption = build_moment_caption(CLEAN, False, "STRAIGHT", _packet(level=level))
        assert _classify_moment_caption(caption) is None, (
            f"tier caption misfiled as an object violation: {caption!r}"
        )
    print("PASS tier captions are not mistaken for object violations")


def test_captions_stay_within_the_column_width():
    """The column is TEXT but every other writer truncates at 200."""
    long_verdict = "CRITICAL: " + "phone " * 90
    assert len(build_moment_caption(long_verdict, True, "STRAIGHT", _packet())) <= 200
    huge = _packet(score=100, level="SEVERE_VIOLATION_LOGGED", count=999)
    assert len(build_moment_caption(CLEAN, False, "STRAIGHT", huge)) <= 200
    print("PASS captions are truncated to 200 characters")


def test_a_missing_count_does_not_print_a_dangling_phrase():
    """violation_count can be 0/absent; the caption must still read as English."""
    for packet in ({"risk_score": 90, "intervention_level": "HARD_WARNING"}, _packet(count=0)):
        caption = build_moment_caption(CLEAN, False, "STRAIGHT", packet)
        assert "earlier flag" not in caption, f"dangling count phrase: {caption!r}"
        assert "90%" in caption or "75%" in caption
    # singular vs plural
    assert "1 earlier flag." in build_moment_caption(CLEAN, False, "STRAIGHT", _packet(count=1))
    assert "4 earlier flags." in build_moment_caption(CLEAN, False, "STRAIGHT", _packet(count=4))
    print("PASS the earlier-flag phrase is omitted at zero and agrees in number")


if __name__ == "__main__":
    test_gaze_labels_never_claim_the_head_moved()
    test_head_labels_still_say_head()
    test_direction_survives_the_rename()
    test_gaze_shares_risk_bucket_with_its_head_twin()
    test_drift_is_a_warning_not_a_critical()
    test_centre_is_clean_and_objects_still_outrank_pose()
    test_a_clean_frame_is_never_captioned_as_engaged()
    test_object_captions_pass_through_untouched()
    test_a_phone_outranks_a_prohibited_item_in_one_caption()
    test_a_drifting_frame_keeps_its_own_narration()
    test_the_tier_caption_never_reads_as_an_object_violation()
    test_captions_stay_within_the_column_width()
    test_a_missing_count_does_not_print_a_dangling_phrase()
    print("\nAll verdict narration tests passed.")
