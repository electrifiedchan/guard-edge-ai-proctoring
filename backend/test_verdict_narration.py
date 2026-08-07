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
"""

from edge_main import determine_verdict


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


if __name__ == "__main__":
    test_gaze_labels_never_claim_the_head_moved()
    test_head_labels_still_say_head()
    test_direction_survives_the_rename()
    test_gaze_shares_risk_bucket_with_its_head_twin()
    test_drift_is_a_warning_not_a_critical()
    test_centre_is_clean_and_objects_still_outrank_pose()
    print("\nAll verdict narration tests passed.")
