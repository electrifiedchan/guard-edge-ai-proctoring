"""Interruption trigger and copy contracts.

Run: ../venv/Scripts/python.exe test_interrupt.py   (from backend/)

Covers InterruptDirector only — whether to speak and what to say. The question of
WHERE it fires (the confirmed rising edge in analyze-frame, past the was_seen
latch in scan-objects) is asserted by reading those call sites, not here; this
file exists so the rotation, the cooldown and the tone rules cannot regress
silently.
"""

from core_memory.interrupts import LINES, InterruptDirector

_failures: list[str] = []


def check(label: str, got, want) -> None:
    if got == want:
        print(f"  ok   {label}")
    else:
        print(f"  FAIL {label}\n         got:  {got!r}\n         want: {want!r}")
        _failures.append(label)


# ---------------------------------------------------------------------------
# Which findings may speak
# ---------------------------------------------------------------------------

def test_only_the_two_unambiguous_findings_interrupt():
    """A guess must never interrupt someone.

    ATTENTION_DRIFT could be thinking, and SPEECH is usually the candidate
    answering the question they were asked — that one is a known false-positive
    source, so it must stay silent until voice recognition can tell who is
    talking. NO_FACE is critical but not actionable out loud: someone who has
    left the frame is not there to hear it.
    """
    check("kinds that may interrupt", sorted(LINES), ["MOBILE_DEVICE", "MULTIPLE_FACES"])

    d = InterruptDirector()
    for silent in ("ATTENTION_DRIFT", "SPEECH", "NO_FACE", "PROHIBITED_ITEM", "DOWN_GAZE"):
        check(f"{silent} stays silent", d.consider("s1", silent, t=0.0), None)


def test_a_prohibited_item_does_not_interrupt_via_the_object_path():
    """scan-objects passes prop_kind straight through, so this is the only thing
    stopping a book from talking to the candidate."""
    d = InterruptDirector()
    check("book/laptop silent", d.consider("s1", "PROHIBITED_ITEM", t=0.0), None)
    check("phone speaks", d.consider("s1", "MOBILE_DEVICE", t=0.0) is not None, True)


# ---------------------------------------------------------------------------
# Rotation
# ---------------------------------------------------------------------------

def test_a_repeat_sighting_is_worded_differently():
    """The whole point of the pool. A fixed string on the third sighting reads as
    a machine reciting a rule."""
    d = InterruptDirector(cooldown_sec=0.0)
    said = [d.consider("s1", "MOBILE_DEVICE", t=float(i))["say"] for i in range(3)]
    check("three sightings, three wordings", len(set(said)), 3)


def test_rotation_is_deterministic_not_random():
    """Two identical sessions must produce identical audio, or the study cannot be
    replayed and this test could not assert a second line at all."""
    a = InterruptDirector(cooldown_sec=0.0)
    b = InterruptDirector(cooldown_sec=0.0)
    seq_a = [a.consider("s1", "MULTIPLE_FACES", t=float(i))["say"] for i in range(4)]
    seq_b = [b.consider("s1", "MULTIPLE_FACES", t=float(i))["say"] for i in range(4)]
    check("same sequence", seq_a, seq_b)
    check("first line is the pool's first", seq_a[0], LINES["MULTIPLE_FACES"][0])


def test_the_pool_cycles_rather_than_sticking_on_the_last_line():
    """A six-sighting session should come back around, not repeat the last
    wording forever."""
    d = InterruptDirector(cooldown_sec=0.0)
    pool = LINES["MOBILE_DEVICE"]
    said = [
        d.consider("s1", "MOBILE_DEVICE", t=float(i))["say"]
        for i in range(len(pool) + 1)
    ]
    check("wraps to the first line", said[len(pool)], pool[0])


def test_occurrence_is_one_based():
    d = InterruptDirector(cooldown_sec=0.0)
    check("first is 1", d.consider("s1", "MOBILE_DEVICE", t=0.0)["occurrence"], 1)
    check("second is 2", d.consider("s1", "MOBILE_DEVICE", t=1.0)["occurrence"], 2)


def test_the_two_kinds_rotate_independently():
    """Being reminded about the phone must not consume the first-time wording for
    the second person — they are separate findings."""
    d = InterruptDirector(cooldown_sec=0.0)
    d.consider("s1", "MOBILE_DEVICE", t=0.0)
    d.consider("s1", "MOBILE_DEVICE", t=1.0)
    faces = d.consider("s1", "MULTIPLE_FACES", t=2.0)
    check("faces still on its first line", faces["say"], LINES["MULTIPLE_FACES"][0])
    check("faces occurrence is 1", faces["occurrence"], 1)


def test_sessions_do_not_interfere():
    d = InterruptDirector(cooldown_sec=0.0)
    d.consider("s1", "MOBILE_DEVICE", t=0.0)
    other = d.consider("s2", "MOBILE_DEVICE", t=0.5)
    check("s2 gets the first line", other["say"], LINES["MOBILE_DEVICE"][0])


# ---------------------------------------------------------------------------
# Cooldown
# ---------------------------------------------------------------------------

def test_a_flickering_latch_cannot_machine_gun():
    """The caller fires on a rising edge, so this never engages in normal
    operation. It is here for a phone at the edge of YOLO's confidence appearing
    and vanishing across consecutive sweeps."""
    d = InterruptDirector(cooldown_sec=20.0)
    check("first speaks", d.consider("s1", "MOBILE_DEVICE", t=100.0) is not None, True)
    check("1.2s later silent", d.consider("s1", "MOBILE_DEVICE", t=101.2), None)
    check("19.9s later silent", d.consider("s1", "MOBILE_DEVICE", t=119.9), None)
    check("20.1s later speaks", d.consider("s1", "MOBILE_DEVICE", t=120.1) is not None, True)


def test_a_suppressed_interrupt_does_not_burn_a_line():
    """If the cooldown swallowed one, the candidate never heard it — so the next
    one they DO hear should be the line they never got, not the one after it."""
    d = InterruptDirector(cooldown_sec=20.0)
    first = d.consider("s1", "MOBILE_DEVICE", t=0.0)
    d.consider("s1", "MOBILE_DEVICE", t=1.0)   # suppressed
    d.consider("s1", "MOBILE_DEVICE", t=2.0)   # suppressed
    second = d.consider("s1", "MOBILE_DEVICE", t=30.0)
    check("first line", first["say"], LINES["MOBILE_DEVICE"][0])
    check("next heard line is the second, not the fourth", second["say"], LINES["MOBILE_DEVICE"][1])
    check("occurrence counts what was SAID", second["occurrence"], 2)


def test_the_cooldown_is_per_kind():
    """A phone and a second person appearing together are two findings, and
    hearing about one must not silence the other."""
    d = InterruptDirector(cooldown_sec=20.0)
    check("phone speaks", d.consider("s1", "MOBILE_DEVICE", t=0.0) is not None, True)
    check("faces speak too", d.consider("s1", "MULTIPLE_FACES", t=0.1) is not None, True)


# ---------------------------------------------------------------------------
# Reset
# ---------------------------------------------------------------------------

def test_clearing_memory_resets_rotation_and_cooldown():
    """Otherwise the first sighting of a fresh run is either silent (cooldown
    still latched) or told the phone is visible "again" about a session the user
    just erased."""
    d = InterruptDirector(cooldown_sec=20.0)
    d.consider("cand1__abc", "MOBILE_DEVICE", t=0.0)
    d.forget_candidate("cand1")
    again = d.consider("cand1__abc", "MOBILE_DEVICE", t=1.0)
    check("speaks despite the cooldown window", again is not None, True)
    check("back to the first line", again["say"], LINES["MOBILE_DEVICE"][0])
    check("back to occurrence 1", again["occurrence"], 1)


def test_forget_candidate_sweeps_the_prefix_and_only_that_candidate():
    """Sessions are keyed "{candidate_id}__{rand}" but /reset-session arrives with
    a bare candidate_id."""
    d = InterruptDirector(cooldown_sec=20.0)
    d.consider("cand1__run1", "MOBILE_DEVICE", t=0.0)
    d.consider("cand1", "MULTIPLE_FACES", t=0.0)
    d.consider("cand2__run1", "MOBILE_DEVICE", t=0.0)
    d.forget_candidate("cand1")

    check("prefixed run cleared", d.consider("cand1__run1", "MOBILE_DEVICE", t=1.0)["occurrence"], 1)
    check("bare key cleared", d.consider("cand1", "MULTIPLE_FACES", t=1.0)["occurrence"], 1)
    check("other candidate untouched", d.consider("cand2__run1", "MOBILE_DEVICE", t=1.0), None)


# ---------------------------------------------------------------------------
# Tone
# ---------------------------------------------------------------------------

def test_no_line_uses_enforcement_language():
    """The coaching path's rule, applied to the one place the system speaks to a
    candidate unprompted. These are reminders about how behaviour READS to an
    interviewer, not accusations about what they were doing."""
    banned = ("violation", "breach", "cheat", "caught", "illegal", "banned", "warning")
    for kind, pool in LINES.items():
        for line in pool:
            hits = [w for w in banned if w in line.lower()]
            check(f"{kind}: no enforcement words in {line[:34]!r}", hits, [])


def test_every_line_says_what_to_do():
    """Naming a problem without naming the fix leaves someone stuck mid-interview
    wondering what is being asked of them."""
    actionable = (
        "set it aside", "put it down", "out of view", "tuck it away",
        "out of frame", "on your own", "room to yourself", "room clear",
        "you're alone", "be on your own", "sorting out", "make sure",
    )
    for kind, pool in LINES.items():
        for line in pool:
            low = line.lower()
            check(
                f"{kind}: actionable — {line[:34]!r}",
                any(p in low for p in actionable),
                True,
            )


def test_lines_are_short_enough_to_speak():
    """These are spoken over a live interview. A long one either talks across the
    candidate's next answer or gets cancelled halfway by the interviewer's own
    speechSynthesis."""
    for kind, pool in LINES.items():
        for line in pool:
            n = len(line.split())
            check(f"{kind}: {n} words <= 30 — {line[:34]!r}", n <= 30, True)


def test_no_duplicate_lines_within_a_pool():
    """A duplicate would silently defeat the rotation for one occurrence."""
    for kind, pool in LINES.items():
        check(f"{kind}: all distinct", len(set(pool)), len(pool))


def test_every_pool_has_room_to_rotate():
    for kind, pool in LINES.items():
        check(f"{kind}: at least 3 wordings", len(pool) >= 3, True)


if __name__ == "__main__":
    test_only_the_two_unambiguous_findings_interrupt()
    test_a_prohibited_item_does_not_interrupt_via_the_object_path()
    test_a_repeat_sighting_is_worded_differently()
    test_rotation_is_deterministic_not_random()
    test_the_pool_cycles_rather_than_sticking_on_the_last_line()
    test_occurrence_is_one_based()
    test_the_two_kinds_rotate_independently()
    test_sessions_do_not_interfere()
    test_a_flickering_latch_cannot_machine_gun()
    test_a_suppressed_interrupt_does_not_burn_a_line()
    test_the_cooldown_is_per_kind()
    test_clearing_memory_resets_rotation_and_cooldown()
    test_forget_candidate_sweeps_the_prefix_and_only_that_candidate()
    test_no_line_uses_enforcement_language()
    test_every_line_says_what_to_do()
    test_lines_are_short_enough_to_speak()
    test_no_duplicate_lines_within_a_pool()
    test_every_pool_has_room_to_rotate()

    if _failures:
        print(f"\n{len(_failures)} failed.")
        raise SystemExit(1)
    print("\nAll interrupt tests passed.")
