"""Tests for episode grain.

The bug: autopsy_flag is true on EVERY frame while risk sits at or above 75, and
telemetry samples every 2 s, so one continuous 20-second look-away wrote ~10
moments rows and ~10 near-identical JPEGs of the same person in the same
position — each shown back to them as a separate finding.
"""

from core_memory.episodes import EpisodeTracker


def test_one_continuous_stretch_is_one_row():
    """The headline case: ten flagged frames, one episode."""
    tr = EpisodeTracker(gap_sec=2.0)
    opened_total = []
    for i in range(10):
        opened, closed = tr.observe("s1", 100.0 + i * 2.0, ["ATTENTION_DRIFT"])
        opened_total += opened
        assert not closed
    assert len(opened_total) == 1, f"one look-away produced {len(opened_total)} rows"
    assert opened_total[0]["t_start"] == 100.0
    print("PASS ten flagged frames of one behaviour open exactly one episode")


def test_the_episode_carries_a_real_duration_not_a_frame_count():
    tr = EpisodeTracker(gap_sec=2.0)
    for i in range(6):
        tr.observe("s1", 100.0 + i * 2.0, ["ATTENTION_DRIFT"])
    closed = tr.close_session("s1")
    assert len(closed) == 1
    # Frames at 100..110 -> the behaviour spanned 10 s.
    assert closed[0]["duration_sec"] == 10.0, closed[0]
    assert closed[0]["frame_count"] == 6
    print("PASS the episode reports measured seconds, not a frame count")


def test_a_single_frame_dropout_does_not_split_the_episode():
    """The gap is a debounce. One frame where the head passes back through centre
    must not turn one look-away into two findings."""
    tr = EpisodeTracker(gap_sec=2.0)
    tr.observe("s1", 0.0, ["ATTENTION_DRIFT"])
    o, c = tr.observe("s1", 1.0, [])          # blink of clean data, < gap
    assert not o and not c
    o, c = tr.observe("s1", 2.0, ["ATTENTION_DRIFT"])
    assert not o, "a sub-gap dropout opened a second episode"
    assert not c
    print("PASS a brief dropout does not split one episode into two")


def test_a_real_gap_closes_and_a_later_return_opens_a_new_episode():
    tr = EpisodeTracker(gap_sec=2.0)
    first = tr.observe("s1", 0.0, ["ATTENTION_DRIFT"])[0][0]
    _, closed = tr.observe("s1", 4.0, [])
    assert len(closed) == 1 and closed[0]["moment_id"] == first["moment_id"]
    opened, _ = tr.observe("s1", 10.0, ["ATTENTION_DRIFT"])
    assert len(opened) == 1
    assert opened[0]["moment_id"] != first["moment_id"], "reused the closed row"
    print("PASS a genuine gap closes the episode and a later return starts a new one")


def test_the_debounce_gap_is_not_billed_as_behaviour():
    """duration must measure the last frame that SHOWED the behaviour, not the
    frame that proved it had stopped — that gap is time the candidate was fine."""
    tr = EpisodeTracker(gap_sec=2.0)
    tr.observe("s1", 0.0, ["NO_FACE"])
    tr.observe("s1", 2.0, ["NO_FACE"])
    _, closed = tr.observe("s1", 30.0, [])
    assert closed[0]["duration_sec"] == 2.0, f"gap was billed: {closed[0]}"
    print("PASS the debounce gap is excluded from the reported duration")


def test_concurrent_flags_are_separate_episodes():
    """The point of the concurrent-flag refactor: a phone and a head turn
    overlapping in time are two findings with two durations, not one."""
    tr = EpisodeTracker(gap_sec=2.0)
    opened, _ = tr.observe("s1", 0.0, ["MOBILE_DEVICE", "ATTENTION_DRIFT"])
    assert len(opened) == 2
    assert len({e["moment_id"] for e in opened}) == 2, "shared one row"
    # The phone goes away; the head turn continues.
    _, closed = tr.observe("s1", 6.0, ["ATTENTION_DRIFT"])
    assert [e["kind"] for e in closed] == ["MOBILE_DEVICE"]
    assert tr.open_count("s1") == 1
    print("PASS overlapping flags are tracked as separate concurrent episodes")


def test_sessions_do_not_interfere():
    tr = EpisodeTracker(gap_sec=2.0)
    tr.observe("a", 0.0, ["NO_FACE"])
    tr.observe("b", 0.0, ["NO_FACE"])
    # b reports a clean frame much later; a must be untouched.
    _, closed = tr.observe("b", 10.0, [])
    assert len(closed) == 1 and closed[0]["session_id"] == "b"
    assert tr.open_count("a") == 1, "another session's clean frame closed a's episode"
    print("PASS one session's clean frame cannot close another's episode")


def test_close_session_flushes_the_episode_that_never_recovered():
    """The last episode has no following frame to expire it. Without this flush a
    look-away still in progress when the candidate stops keeps t_end NULL — the
    one episode most likely to matter, since it was never recovered from."""
    tr = EpisodeTracker(gap_sec=2.0)
    tr.observe("s1", 0.0, ["NO_FACE"])
    tr.observe("s1", 8.0, ["NO_FACE"])
    closed = tr.close_session("s1")
    assert len(closed) == 1 and closed[0]["duration_sec"] == 8.0
    assert tr.open_count("s1") == 0
    assert tr.close_session("s1") == [], "flushing twice re-emitted the episode"
    print("PASS an episode open at session end is flushed with its real duration")


def test_close_candidate_sweeps_every_run_of_that_candidate():
    """Frames are stored under "{candidate_id}__{rand}", so the report — which is
    requested with a candidate_id — cannot flush by exact key match."""
    tr = EpisodeTracker(gap_sec=2.0)
    tr.observe("cand__run1", 0.0, ["NO_FACE"])
    tr.observe("cand__run2", 0.0, ["ATTENTION_DRIFT"])
    tr.observe("other__run1", 0.0, ["NO_FACE"])
    closed = tr.close_candidate("cand")
    assert len(closed) == 2, f"prefix sweep missed a run: {closed}"
    assert tr.open_count() == 1, "swept a different candidate's episode"
    print("PASS close_candidate flushes every run belonging to one candidate")


def test_forget_candidate_emits_nothing():
    """"Clear memory" discards the run, so writing an end time and duration would
    leave a finished-looking row pointing at a session that no longer counts."""
    tr = EpisodeTracker(gap_sec=2.0)
    tr.observe("cand__run1", 0.0, ["NO_FACE"])
    tr.forget_candidate("cand")
    assert tr.open_count() == 0
    assert tr.close_candidate("cand") == []
    print("PASS forget_candidate drops state without emitting a closure")


def test_an_instantaneous_episode_has_zero_duration_not_a_negative_one():
    tr = EpisodeTracker(gap_sec=2.0)
    tr.observe("s1", 5.0, ["SPEECH"])
    closed = tr.close_session("s1")
    assert closed[0]["duration_sec"] == 0.0
    assert closed[0]["t_end"] == closed[0]["t_start"] == 5.0
    print("PASS a one-frame episode reports zero seconds, not a negative span")


if __name__ == "__main__":
    test_one_continuous_stretch_is_one_row()
    test_the_episode_carries_a_real_duration_not_a_frame_count()
    test_a_single_frame_dropout_does_not_split_the_episode()
    test_a_real_gap_closes_and_a_later_return_opens_a_new_episode()
    test_the_debounce_gap_is_not_billed_as_behaviour()
    test_concurrent_flags_are_separate_episodes()
    test_sessions_do_not_interfere()
    test_close_session_flushes_the_episode_that_never_recovered()
    test_close_candidate_sweeps_every_run_of_that_candidate()
    test_forget_candidate_emits_nothing()
    test_an_instantaneous_episode_has_zero_duration_not_a_negative_one()
    print("\nAll episode tests passed.")
