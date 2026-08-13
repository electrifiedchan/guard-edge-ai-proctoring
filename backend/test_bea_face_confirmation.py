"""Regression tests for separate face-presence confirmation rules."""

import asyncio

from core_memory.bea import BehavioralEventAccumulator


def _record(engine, candidate, signal_type, reason="face event"):
    return asyncio.run(
        engine.record_critical_signal(
            candidate,
            True,
            reason,
            signal_type=signal_type,
        )
    )


def test_multiple_faces_confirms_on_two_consecutive_samples():
    engine = BehavioralEventAccumulator()
    first = _record(engine, "candidate", "multiple_faces")
    second = _record(engine, "candidate", "multiple_faces")

    assert not first["confirmed"] and first["count"] == 1
    assert second["confirmed"] and second["count"] == 2
    assert second["threshold"] == 2
    print("PASS multiple faces confirms on two consecutive samples")


def test_no_face_confirms_on_three_consecutive_samples():
    engine = BehavioralEventAccumulator()
    results = [_record(engine, "candidate", "no_face") for _ in range(3)]

    assert not results[0]["confirmed"] and not results[1]["confirmed"]
    assert results[2]["confirmed"] and results[2]["threshold"] == 3
    print("PASS no face confirms on three consecutive samples")


def test_face_signal_types_cannot_combine():
    engine = BehavioralEventAccumulator()
    first_missing = _record(engine, "candidate", "no_face")
    second_person = _record(engine, "candidate", "multiple_faces")
    missing_again = _record(engine, "candidate", "no_face")

    assert first_missing["count"] == 1
    assert second_person["count"] == 1 and not second_person["confirmed"]
    assert missing_again["count"] == 1 and not missing_again["confirmed"]
    print("PASS alternating face failures cannot combine")


def test_clean_sample_resets_face_streaks():
    engine = BehavioralEventAccumulator()
    _record(engine, "candidate", "multiple_faces")
    asyncio.run(engine.record_critical_signal("candidate", False))
    after_clear = _record(engine, "candidate", "multiple_faces")

    assert after_clear["count"] == 1 and not after_clear["confirmed"]
    print("PASS clean sample resets face confirmation streaks")


def test_continuing_second_face_is_one_incident_until_clear():
    engine = BehavioralEventAccumulator()
    _record(engine, "candidate", "multiple_faces")
    confirmed = _record(engine, "candidate", "multiple_faces")
    continuing = _record(engine, "candidate", "multiple_faces")

    assert confirmed["confirmed"]
    assert not continuing["confirmed"] and continuing["active_confirmed"]

    asyncio.run(engine.record_critical_signal("candidate", False))
    _record(engine, "candidate", "multiple_faces")
    confirmed_again = _record(engine, "candidate", "multiple_faces")
    assert confirmed_again["confirmed"]
    print("PASS sustained second face records once and re-arms after clear")


def test_critical_flag_keeps_session_risk_severe():
    engine = BehavioralEventAccumulator()
    asyncio.run(engine.record_violation("candidate", "Mobile device detected"))
    packet = asyncio.run(engine.record_telemetry("candidate", "STRAIGHT"))

    assert packet["risk_score"] == 100
    assert packet["intervention_level"] == "SEVERE_VIOLATION_LOGGED"
    print("PASS confirmed critical flag keeps session risk severe")


if __name__ == "__main__":
    test_multiple_faces_confirms_on_two_consecutive_samples()
    test_no_face_confirms_on_three_consecutive_samples()
    test_face_signal_types_cannot_combine()
    test_clean_sample_resets_face_streaks()
    test_continuing_second_face_is_one_incident_until_clear()
    test_critical_flag_keeps_session_risk_severe()
    print("\nALL FACE CONFIRMATION TESTS PASSED")
