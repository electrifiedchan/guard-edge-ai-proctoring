"""The persona wire contract between the frontend picker and the engine.

Why this file exists
--------------------
The user's pre-engage pick travels as a bare string: `starting_persona` in the
start-session body. `create_session` validates it with `Persona(value)` and, on
anything unrecognised, logs a warning and falls back to friendly_hr.

That fallback is deliberate — a stale client must not 500 the session — but it
makes a frontend typo silent. The interview simply opens on the warm rung, which
is exactly what it does when the user genuinely picks Friendly HR, so nothing on
screen distinguishes "your choice was honoured" from "your choice was discarded".
That is the same failure shape as the three bugs fixed on 2026-08-07: a missing
value spelled identically to a valid one.

So: pin the ids the frontend sends (`frontend/src/lib/personas.ts`,
PERSONA_OPTIONS) against the enum the backend accepts, and pin that a chosen rung
actually seeds the ladder rather than being accepted and ignored.

Sessions are built directly rather than through create_session, which is async
and would make a real LLM call for the opening line — same approach, and same
reason, as _seed in test_session_lifecycle.py.
"""

from core_memory.conversation_engine import (
    PERSONA_LADDER,
    ConversationEngine,
    InterviewSession,
    Persona,
)

# Mirrors PERSONA_OPTIONS[].id in frontend/src/lib/personas.ts, in ladder order.
# Hand-copied on purpose: this is the wire contract, so it has to break loudly
# when either side is edited alone. Deriving it from the enum would make the
# test tautological and pin nothing.
FRONTEND_PERSONA_IDS = ["friendly_hr", "curious_peer", "skeptical_tech_lead"]


def _session(starting: Persona) -> InterviewSession:
    return InterviewSession(
        session_id="persona1",
        resume_text="Built a thing.",
        resume_questions=[{"question": "Tell me about it.", "focus": "general"}],
        current_persona=starting,
        starting_persona=starting,
    )


def test_every_frontend_id_is_a_real_persona():
    for pid in FRONTEND_PERSONA_IDS:
        # Raises ValueError if the picker can send an id the engine rejects,
        # which in production is not an exception — it is a silent downgrade.
        assert Persona(pid).value == pid
    print("PASS every id the picker can send maps to a real persona")


def test_the_ladder_and_the_picker_agree():
    assert [p.value for p in PERSONA_LADDER] == FRONTEND_PERSONA_IDS, (
        "the picker's options no longer match the escalation ladder — the "
        "difficulty order shown to the user would not be the order used"
    )
    print("PASS picker order matches the escalation ladder")


def test_a_chosen_rung_opens_the_interview():
    """Storing the field is not the same as honouring it."""
    engine = ConversationEngine()
    for pid in FRONTEND_PERSONA_IDS:
        session = _session(Persona(pid))
        # Turn 0 must open on the rung the user picked, not the ladder's first.
        assert engine._determine_persona(session) == Persona(pid), (
            f"session opened on {engine._determine_persona(session)}, not {pid}"
        )
    print("PASS each chosen rung opens the interview on that rung")


def test_the_ladder_still_climbs_from_the_chosen_rung():
    """Picking a harder opening skips the easy rungs; it does not pin the run."""
    engine = ConversationEngine()
    session = _session(Persona.CURIOUS_PEER)

    seen = []
    for turn in range(8):
        session.current_turn = turn
        seen.append(engine._determine_persona(session))

    assert seen[0] == Persona.CURIOUS_PEER, "did not open on the chosen rung"
    assert Persona.SKEPTICAL_TECH_LEAD in seen, "never escalated past the opening"
    assert Persona.FRIENDLY_HR not in seen, (
        "dropped to an easier rung than the user chose"
    )
    print("PASS the ladder still escalates from the chosen starting rung")


def test_the_hardest_rung_pins_instead_of_overflowing():
    """min() guards the ladder index — an off-by-one here is an IndexError."""
    engine = ConversationEngine()
    session = _session(Persona.SKEPTICAL_TECH_LEAD)
    for turn in range(12):
        session.current_turn = turn
        assert engine._determine_persona(session) == Persona.SKEPTICAL_TECH_LEAD
    print("PASS the hardest rung stays pinned with no index overflow")


def test_an_unknown_id_falls_back_instead_of_raising():
    """The fallback is intended behaviour — an old client must not 500.

    This mirrors create_session's validation without invoking it, since the
    async path would reach the LLM for the opening message.
    """
    try:
        Persona("hostile_ceo")
    except ValueError:
        pass
    else:
        raise AssertionError("'hostile_ceo' unexpectedly became a valid persona")

    session = _session(Persona.FRIENDLY_HR)
    assert session.starting_persona == Persona.FRIENDLY_HR
    print("PASS an unrecognised id is rejected by the enum, then degrades")


if __name__ == "__main__":
    test_every_frontend_id_is_a_real_persona()
    test_the_ladder_and_the_picker_agree()
    test_a_chosen_rung_opens_the_interview()
    test_the_ladder_still_climbs_from_the_chosen_rung()
    test_the_hardest_rung_pins_instead_of_overflowing()
    test_an_unknown_id_falls_back_instead_of_raising()
    print("\nAll persona contract tests passed.")
