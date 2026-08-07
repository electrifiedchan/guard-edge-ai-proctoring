"""Regression tests for the interview session lifecycle.

The bug these cover: generate_final_verdict used to `del self.sessions[id]`.
A VAD callback that fired after the verdict request would then hit a missing
session and raise "Session <id> not found" — surfaced as a 404 error toast on
top of a report that had actually generated fine.
"""

import asyncio
import time

from core_memory.conversation_engine import (
    ConversationEngine,
    InterviewSession,
    SESSION_TTL_SEC,
)


def _seed(engine: ConversationEngine, session_id: str = "abc123") -> InterviewSession:
    """Build a session directly, skipping create_session's LLM call."""
    session = InterviewSession(
        session_id=session_id,
        resume_text="Built a thing.",
        resume_questions=[{"question": "Tell me about it.", "focus": "general"}],
    )
    engine.sessions[session_id] = session
    return session


def test_session_survives_verdict():
    engine = ConversationEngine()
    session = _seed(engine)
    session.focus_scores.append(90.0)

    # No NVIDIA_API_KEY here, so the LLM call fails and falls back to canned
    # text. That's fine — the lifecycle is what's under test, not the prose.
    asyncio.run(engine.generate_final_verdict("abc123"))

    assert "abc123" in engine.sessions, "session was deleted by the verdict"
    assert engine.sessions["abc123"].is_complete is True
    print("PASS session survives verdict generation")


def test_late_turn_gets_clear_error_not_missing_session():
    """A straggler turn should be rejected as 'already complete' rather than
    blowing up with 'not found' — same 404 to the client either way, but the
    message tells the truth and the transcript stays intact."""
    engine = ConversationEngine()
    session = _seed(engine)
    session.focus_scores.append(90.0)
    asyncio.run(engine.generate_final_verdict("abc123"))

    try:
        asyncio.run(engine.process_candidate_turn("abc123", "one last thought"))
        raise AssertionError("expected the completed session to reject the turn")
    except ValueError as e:
        assert "already complete" in str(e), f"unexpected error: {e}"

    # The straggler must not have been appended to the finished transcript.
    assert all(t.content != "one last thought" for t in session.conversation_history)
    print("PASS late turn rejected as complete, transcript unpolluted")


def test_prune_drops_only_expired_sessions():
    engine = ConversationEngine()
    _seed(engine, "fresh1")
    stale = _seed(engine, "stale1")
    stale.created_at = time.time() - (SESSION_TTL_SEC + 60)

    engine._prune_sessions()

    assert "fresh1" in engine.sessions, "pruned a session that was still valid"
    assert "stale1" not in engine.sessions, "expired session was retained"
    print("PASS prune drops expired sessions only")


def test_verdict_reports_the_focus_score_it_was_given():
    """Pins the response field NAME, not just the value.

    The frontend read `average_focus_score` off this response while the engine
    has always returned `focus_score`. Missing field -> undefined -> `|| 0`, so
    /report and /practice showed a confident "Focus Score 0" for every session
    no matter how the candidate did. Nothing threw; the wrong number just
    rendered. A key rename here has to break a test, not a screen.
    """
    engine = ConversationEngine()
    session = _seed(engine)
    for score in (90.0, 80.0):
        session.focus_scores.append(score)

    result = asyncio.run(engine.generate_final_verdict("abc123"))

    assert "focus_score" in result, (
        f"verdict response lost its focus_score key: {sorted(result)}"
    )
    assert result["focus_score"] == 85.0, (
        f"expected the mean of the turn scores, got {result['focus_score']}"
    )
    assert result["turns_completed"] == session.current_turn
    print("PASS verdict returns focus_score under the name the client reads")


if __name__ == "__main__":
    test_session_survives_verdict()
    test_late_turn_gets_clear_error_not_missing_session()
    test_prune_drops_only_expired_sessions()
    test_verdict_reports_the_focus_score_it_was_given()
    print("\nAll session lifecycle tests passed.")
