"""Tests for the session risk high-water mark and progressive risk growth.

Two reported bugs, one function:

  1. "the risk score hits 100% then resets to zero" — risk_score is derived from a
     SLIDING WINDOW of events plus a live tier penalty. Both are transient by
     design, which is right for a live meter and wrong for anything that claims to
     be cumulative: the events aged out, the candidate looked back, and a session
     that had just been flagged at 100% reported 0%.

  2. "make the percentage grow progressively with the seconds" — _tier_for returned
     a flat penalty per band, so the number sat at 20 for three seconds, jumped to
     50, sat there, and jumped to 100. A meter that does not move while the timer
     is running reads as broken, and a 30-point jump reads as an overreaction.
"""

import asyncio
import time

from core_memory.bea import (
    BehavioralEventAccumulator,
    SIDE_SOFT_SEC,
    SIDE_WARN_SEC,
    SIDE_HARD_SEC,
    TIER_SOFT_PENALTY,
    TIER_WARN_PENALTY,
    TIER_HARD_PENALTY,
)


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def _fresh():
    return BehavioralEventAccumulator()


# --- progressive growth -----------------------------------------------------

def test_the_penalty_rises_with_every_second_inside_a_band():
    bea = _fresh()
    seen = [
        bea._tier_for(d, SIDE_SOFT_SEC, SIDE_WARN_SEC, SIDE_HARD_SEC)[1]
        for d in (0.0, 1.0, 2.0, 3.0, 4.0)
    ]
    assert seen == sorted(seen), f"penalty did not rise monotonically: {seen}"
    assert len(set(seen)) > 1, f"penalty was flat across the whole band: {seen}"
    print("PASS the penalty climbs second by second instead of sitting flat")


def test_the_tier_boundaries_still_land_on_the_documented_values():
    """Progressive interpolation must not move the thresholds — escalation and the
    committed historical events key off the tier index and the tier values are what
    the paper reports."""
    bea = _fresh()
    args = (SIDE_SOFT_SEC, SIDE_WARN_SEC, SIDE_HARD_SEC)
    assert bea._tier_for(SIDE_SOFT_SEC, *args)[:2] == (1, TIER_SOFT_PENALTY)
    assert bea._tier_for(SIDE_WARN_SEC, *args)[:2] == (2, TIER_WARN_PENALTY)
    assert bea._tier_for(SIDE_HARD_SEC, *args)[:2] == (3, TIER_HARD_PENALTY)
    print("PASS interpolation leaves the tier thresholds and their values exact")


def test_the_tier_index_is_still_a_hard_band():
    bea = _fresh()
    args = (SIDE_SOFT_SEC, SIDE_WARN_SEC, SIDE_HARD_SEC)
    assert bea._tier_for(SIDE_SOFT_SEC - 0.01, *args)[0] == 0
    assert bea._tier_for(SIDE_WARN_SEC - 0.01, *args)[0] == 1
    assert bea._tier_for(SIDE_HARD_SEC - 0.01, *args)[0] == 2
    print("PASS the tier index stays a hard band, so escalation is unchanged")


def test_the_penalty_never_exceeds_its_bands_ceiling():
    bea = _fresh()
    args = (SIDE_SOFT_SEC, SIDE_WARN_SEC, SIDE_HARD_SEC)
    for d in [x * 0.25 for x in range(0, int(SIDE_HARD_SEC * 4) + 8)]:
        tier, penalty, _ = bea._tier_for(d, *args)
        ceiling = {0: TIER_SOFT_PENALTY, 1: TIER_WARN_PENALTY,
                   2: TIER_HARD_PENALTY, 3: TIER_HARD_PENALTY}[tier]
        assert 0 <= penalty <= ceiling, f"d={d} tier={tier} penalty={penalty}"
    print("PASS no interpolated penalty overshoots the next tier's value")


# --- the high-water mark ----------------------------------------------------

def test_peak_risk_survives_the_events_ageing_out_of_the_window():
    """The literal reported bug. Risk reached 100 on committed events; the sliding
    window then dropped them and risk_score fell back to 0."""
    bea = _fresh()
    cid = "peak-window"
    run(bea.record_violation(cid, reason="CRITICAL: Mobile device detected in frame."))
    assert run(bea.get_state(cid))["peak_risk"] == 100

    # Age every event out and drop the critical flag that pins risk at 100, which
    # is the only state left holding the score up.
    bea.memory[cid]["events"] = [time.time() - bea.window_size - 10]
    bea.memory[cid]["critical_flags"] = []
    packet = run(bea.get_state(cid))

    assert packet["risk_score"] == 0, "fixture failed to reproduce the decay"
    assert packet["peak_risk"] == 100, (
        f"the session peak decayed with the window: {packet['peak_risk']}"
    )
    print("PASS the peak survives every event ageing out of the sliding window")


def test_peak_risk_survives_the_candidate_looking_back():
    bea = _fresh()
    cid = "peak-recover"
    # Sustained look away: backdate the timer so the hard tier is already reached.
    run(bea.record_telemetry(cid, "SIDE_OR_UP"))
    bea.memory[cid]["side_started_at"] = time.time() - (SIDE_HARD_SEC + 1)
    hot = run(bea.record_telemetry(cid, "SIDE_OR_UP"))
    assert hot["risk_score"] >= TIER_HARD_PENALTY, hot
    assert hot["peak_risk"] >= TIER_HARD_PENALTY

    # Look straight long enough for the debounce to clear the timer.
    run(bea.record_telemetry(cid, "STRAIGHT"))
    bea.memory[cid]["straight_started_at"] = time.time() - 10
    bea.memory[cid]["events"] = []
    bea.memory[cid]["critical_flags"] = []
    cool = run(bea.record_telemetry(cid, "STRAIGHT"))

    assert cool["risk_score"] < TIER_HARD_PENALTY, "fixture did not actually recover"
    assert cool["peak_risk"] >= TIER_HARD_PENALTY, (
        f"looking back erased the session peak: {cool['peak_risk']}"
    )
    print("PASS looking back lowers the live score but not the session peak")


def test_the_live_tier_floor_is_stamped_into_the_peak():
    """Most risk comes from the live duration floor, not from committed events. A
    peak stamped only inside _calculate_risk would miss almost every rise."""
    bea = _fresh()
    cid = "peak-floor"
    run(bea.record_telemetry(cid, "SIDE_OR_UP"))
    bea.memory[cid]["side_started_at"] = time.time() - (SIDE_WARN_SEC + 0.5)
    packet = run(bea.record_telemetry(cid, "SIDE_OR_UP"))
    assert packet["peak_risk"] == packet["risk_score"], packet
    assert packet["peak_risk"] >= TIER_WARN_PENALTY, packet
    print("PASS a rise that came from the live duration floor is captured")


def test_the_peak_only_ever_goes_up():
    bea = _fresh()
    cid = "peak-monotonic"
    highest = 0
    for gaze in ["SIDE_OR_UP", "STRAIGHT", "DOWN", "STRAIGHT", "SIDE_OR_UP", "STRAIGHT"]:
        packet = run(bea.record_telemetry(cid, gaze))
        assert packet["peak_risk"] >= highest, (
            f"peak fell from {highest} to {packet['peak_risk']} on {gaze}"
        )
        highest = packet["peak_risk"]
    print("PASS the peak is monotonic across an entire mixed session")


def test_a_confirmed_critical_pins_the_peak_at_100():
    bea = _fresh()
    cid = "peak-critical"
    packet = run(bea.record_violation(cid, reason="CRITICAL: Prohibited item detected on desk."))
    assert packet["risk_score"] == 100
    assert packet["peak_risk"] == 100
    print("PASS a confirmed critical is recorded as a 100% peak")


def test_clearing_memory_resets_the_peak():
    """The peak must not outlive the run it describes — otherwise "Clear memory"
    leaves the next session reporting the previous one's worst moment."""
    bea = _fresh()
    cid = "peak-reset"
    run(bea.record_violation(cid, reason="CRITICAL: Mobile device detected in frame."))
    assert run(bea.get_state(cid))["peak_risk"] == 100
    run(bea.reset_candidate(cid))
    assert run(bea.get_state(cid))["peak_risk"] == 0
    print("PASS clearing memory resets the peak, so it never leaks into a new run")


def test_a_brand_new_candidate_reports_a_zero_peak_not_a_missing_one():
    bea = _fresh()
    packet = run(bea.get_state("never-seen"))
    assert packet["peak_risk"] == 0, packet
    print("PASS an unseen candidate reports peak_risk 0 rather than omitting it")


def test_candidates_do_not_share_a_peak():
    bea = _fresh()
    run(bea.record_violation("cand-a", reason="CRITICAL: Mobile device detected in frame."))
    assert run(bea.get_state("cand-a"))["peak_risk"] == 100
    assert run(bea.get_state("cand-b"))["peak_risk"] == 0
    print("PASS one candidate's peak does not bleed into another's")


if __name__ == "__main__":
    test_the_penalty_rises_with_every_second_inside_a_band()
    test_the_tier_boundaries_still_land_on_the_documented_values()
    test_the_tier_index_is_still_a_hard_band()
    test_the_penalty_never_exceeds_its_bands_ceiling()
    test_peak_risk_survives_the_events_ageing_out_of_the_window()
    test_peak_risk_survives_the_candidate_looking_back()
    test_the_live_tier_floor_is_stamped_into_the_peak()
    test_the_peak_only_ever_goes_up()
    test_a_confirmed_critical_pins_the_peak_at_100()
    test_clearing_memory_resets_the_peak()
    test_a_brand_new_candidate_reports_a_zero_peak_not_a_missing_one()
    test_candidates_do_not_share_a_peak()
    print("\nAll peak risk tests passed.")
