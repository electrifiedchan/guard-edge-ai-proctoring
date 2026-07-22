import sqlite3
import os
import contextlib

DB_PATH = os.getenv(
    "GUARD_DB_PATH",
    os.path.join(os.path.dirname(__file__), "..", "guard_telemetry.db")
)


def _db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_timeline_tables() -> None:
    """Create all MR-1 tables if they don't already exist.

    Uses the Double-Context Pattern (contextlib.closing + conn as context
    manager) so the connection is always committed-or-rolled-back and closed
    without a separate conn.close() call — no resource leaks possible.
    """
    with contextlib.closing(_db()) as conn, conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                session_id   TEXT PRIMARY KEY,
                started_at   REAL,
                ended_at     REAL,
                frame_count  INTEGER DEFAULT 0
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS timeline_frames (
                frame_id       TEXT PRIMARY KEY,
                session_id     TEXT,
                t              REAL,
                composure      REAL,
                gaze           TEXT,
                head_pose      TEXT,
                faces_detected INTEGER,
                is_talking     BOOLEAN
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS moments (
                moment_id    TEXT PRIMARY KEY,
                session_id   TEXT,
                t            REAL,
                type         TEXT,
                caption      TEXT,
                evidence_url TEXT
            )
        """)


def insert_frame(
    frame_id: str,
    session_id: str,
    t: float,
    composure: float,
    gaze: str,
    head_pose: str,
    faces_detected: int,
    is_talking: bool,
) -> None:
    """Insert one telemetry frame into timeline_frames."""
    with contextlib.closing(_db()) as conn, conn:
        conn.execute(
            """
            INSERT OR IGNORE INTO timeline_frames
                (frame_id, session_id, t, composure, gaze, head_pose, faces_detected, is_talking)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (frame_id, session_id, t, composure, gaze, head_pose, faces_detected, is_talking),
        )
        # Keep session row alive and bump frame counter
        conn.execute(
            """
            INSERT INTO sessions (session_id, started_at, frame_count)
            VALUES (?, ?, 1)
            ON CONFLICT(session_id) DO UPDATE SET
                frame_count = frame_count + 1
            """,
            (session_id, t),
        )


def insert_moment(
    moment_id: str,
    session_id: str,
    t: float,
    type_: str,
    caption: str,
    evidence_url: str | None = None,
) -> None:
    """Insert a flagged moment into the moments table."""
    with contextlib.closing(_db()) as conn, conn:
        conn.execute(
            """
            INSERT OR IGNORE INTO moments
                (moment_id, session_id, t, type, caption, evidence_url)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (moment_id, session_id, t, type_, caption, evidence_url),
        )


def get_timeline(session_id: str) -> dict:
    """Fetch all frames and moments for a session."""
    with contextlib.closing(_db()) as conn:
        conn.row_factory = sqlite3.Row
        frames = [
            dict(r)
            for r in conn.execute(
                "SELECT * FROM timeline_frames WHERE session_id = ? ORDER BY t",
                (session_id,),
            )
        ]
        moments = [
            dict(r)
            for r in conn.execute(
                "SELECT * FROM moments WHERE session_id = ? ORDER BY t",
                (session_id,),
            )
        ]
        session = conn.execute(
            "SELECT * FROM sessions WHERE session_id = ?", (session_id,)
        ).fetchone()
    return {
        "session_id": session_id,
        "session": dict(session) if session else None,
        "frames": frames,
        "moments": moments,
    }
