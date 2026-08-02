"""MR-3 dashboard summary contract tests (spec Section 3 requires these).

Runs against a throwaway temp SQLite DB via the GUARD_DB_PATH env override, so
it never touches the real telemetry DB. Can be run two ways:

    pytest backend/test_dashboard_summary.py
    python backend/test_dashboard_summary.py     # plain-run fallback, no pytest needed
"""
import os
import time
import tempfile

# Point the timeline module at a fresh temp DB BEFORE importing it.
_TMP_DB = os.path.join(tempfile.gettempdir(), f"guard_test_{os.getpid()}.db")
os.environ["GUARD_DB_PATH"] = _TMP_DB

import importlib
from core_memory import timeline as tl
importlib.reload(tl)  # ensure DB_PATH picks up the env override


TOP_LEVEL_KEYS = {
    "candidate", "totals", "readiness", "metrics",
    "composure_trend", "activity", "gaze_split", "recent_sessions", "focus_area",
}


def _fresh_db():
    if os.path.exists(_TMP_DB):
        os.remove(_TMP_DB)
    tl.init_timeline_tables()


def _seed_session(session_id: str, start: float, gaze_seq, composure_seq, talking_seq=None):
    """Insert a run of frames for one session at 5s cadence."""
    talking_seq = talking_seq or [False] * len(gaze_seq)
    for i, (gaze, comp, talk) in enumerate(zip(gaze_seq, composure_seq, talking_seq)):
        tl.insert_frame(
            frame_id=f"{session_id}_{i}",
            session_id=session_id,
            t=start + i * 5,
            composure=comp,
            gaze=gaze,
            head_pose="HEAD_CENTER",
            faces_detected=1,
            is_talking=talk,
        )


def test_empty_db_returns_valid_shape():
    _fresh_db()
    out = tl.get_dashboard_summary(candidate_id="c_01", days=84)
    assert set(out.keys()) == TOP_LEVEL_KEYS
    assert out["totals"]["sessions"] == 0
    assert out["readiness"] is None                 # spec: never invent a score
    assert out["composure_trend"] == []
    assert out["recent_sessions"] == []
    assert out["focus_area"] is None
    assert len(out["metrics"]) == 4                 # shape stable even when empty
    print("PASS empty_db")


def test_one_session_returns_non_null_aggregates():
    _fresh_db()
    now = time.time()
    _seed_session(
        "c_01",
        now - 3 * 86400,
        gaze_seq=["STRAIGHT", "STRAIGHT", "SIDE_OR_UP", "STRAIGHT", "DOWN", "STRAIGHT"],
        composure_seq=[90, 85, 40, 72, 30, 80],
        talking_seq=[True, True, False, True, False, True],
    )
    out = tl.get_dashboard_summary(candidate_id="c_01", days=84)
    assert out["totals"]["sessions"] == 1
    assert out["readiness"] is not None
    assert 0 <= out["readiness"]["score"] <= 100
    assert out["readiness"]["band"] in {"Building", "Improving", "Interview Ready", "Sharp"}
    assert len(out["composure_trend"]) == 1
    assert len(out["recent_sessions"]) == 1
    assert out["focus_area"] is not None
    # eye contact = 4 STRAIGHT / 6 frames = 66.7%
    eye = next(m for m in out["metrics"] if m["key"] == "eye_contact_pct")
    assert abs(eye["value"] - 66.7) < 0.2, eye["value"]
    # recovery: dip to 40/30 then climb back to >=70 twice
    rec = next(m for m in out["metrics"] if m["key"] == "recovery_count")
    assert rec["value"] >= 1
    print("PASS one_session", out["readiness"])


def test_multi_session_trend_and_streak():
    _fresh_db()
    base = time.time() - 5 * 86400
    # three sessions on three consecutive days
    _seed_session("c_01__a", base + 0 * 86400, ["STRAIGHT"] * 5, [60, 62, 64, 66, 68])
    _seed_session("c_01__b", base + 1 * 86400, ["STRAIGHT"] * 5, [70, 72, 74, 76, 78])
    _seed_session("c_01__c", base + 2 * 86400, ["STRAIGHT"] * 5, [80, 82, 84, 86, 88])
    out = tl.get_dashboard_summary(candidate_id="c_01", days=84)
    assert out["totals"]["sessions"] == 3
    # trend is oldest -> newest, so composure should be rising
    trend = [c["avg_composure"] for c in out["composure_trend"]]
    assert trend == sorted(trend), trend
    # 3 consecutive days -> best streak 3
    assert out["totals"]["best_streak_days"] == 3, out["totals"]
    # candidate_id LIKE match picked up the "c_01__x" per-run ids
    assert out["candidate"]["candidate_id"] == "c_01"
    # delta_vs_prev should be positive (improving)
    assert out["readiness"]["delta_vs_prev"] >= 0
    print("PASS multi_session", out["totals"])


if __name__ == "__main__":
    test_empty_db_returns_valid_shape()
    test_one_session_returns_non_null_aggregates()
    test_multi_session_trend_and_streak()
    if os.path.exists(_TMP_DB):
        os.remove(_TMP_DB)
    print("\nALL DASHBOARD TESTS PASSED")
