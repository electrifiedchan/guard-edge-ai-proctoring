"""Regression tests for the additive timeline_frames migration.

Why this file exists: init_timeline_tables() uses CREATE TABLE IF NOT EXISTS,
which is a silent no-op on a database that already has the table. So adding a
column to the CREATE statement alone does nothing on any machine carrying an
older guard_telemetry.db — and then every INSERT naming the new column fails at
runtime. The failure surfaces during a recording session, on a participant's
machine, which is the worst possible place to discover it.

The recorded human sessions for the paper are the reason this matters: a study
machine may hold a database created before head_pose_raw / gaze_class existed.
The migration has to be additive, idempotent, and lossless.

What must hold:
  1. An old-schema database gains the new columns without losing rows.
  2. Rows written before the columns existed read back NULL — not a fabricated
     pose. A frame recorded before the sensor channel was captured genuinely has
     no value for it, and analysis must be able to exclude those rows.
  3. Running the migration twice is harmless (it runs on every startup).
  4. Both the new and the legacy insert_frame call signatures work.
"""

import os
import sqlite3
import tempfile
import time
import uuid

# Point the module at a scratch database BEFORE importing it — DB_PATH is read
# at import time.
_TMP_DIR = tempfile.mkdtemp(prefix="guard_migration_")
_DB = os.path.join(_TMP_DIR, "migration_probe.db")
os.environ["GUARD_DB_PATH"] = _DB

import core_memory.timeline as timeline  # noqa: E402

# The shape timeline_frames had before the pre-fusion sensor channels were added.
_LEGACY_SCHEMA = """
    CREATE TABLE timeline_frames (
        frame_id       TEXT PRIMARY KEY,
        session_id     TEXT,
        t              REAL,
        composure      REAL,
        gaze           TEXT,
        head_pose      TEXT,
        faces_detected INTEGER,
        is_talking     BOOLEAN
    )
"""

NEW_COLUMNS = ("head_pose_raw", "gaze_class")


def _columns(table: str = "timeline_frames") -> list[str]:
    conn = sqlite3.connect(_DB)
    try:
        return [row[1] for row in conn.execute(f"PRAGMA table_info({table})")]
    finally:
        conn.close()


def _build_legacy_db(row_count: int = 25) -> None:
    """Create a database with the pre-migration schema and some rows in it."""
    if os.path.exists(_DB):
        os.remove(_DB)
    conn = sqlite3.connect(_DB)
    try:
        conn.execute(_LEGACY_SCHEMA)
        conn.execute(
            """
            CREATE TABLE sessions (
                session_id   TEXT PRIMARY KEY,
                started_at   REAL,
                ended_at     REAL,
                frame_count  INTEGER DEFAULT 0
            )
            """
        )
        now = time.time()
        conn.executemany(
            "INSERT INTO timeline_frames VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
                (uuid.uuid4().hex, "legacy-session", now + i, 90.0,
                 "STRAIGHT", "HEAD_CENTER", 1, False)
                for i in range(row_count)
            ],
        )
        conn.commit()
    finally:
        conn.close()


def test_an_old_database_gains_the_columns_without_losing_rows():
    _build_legacy_db(25)
    assert "head_pose_raw" not in _columns(), "fixture is not actually old-schema"

    timeline.init_timeline_tables()

    cols = _columns()
    for name in NEW_COLUMNS:
        assert name in cols, f"{name} was not added to an existing table: {cols}"

    conn = sqlite3.connect(_DB)
    try:
        assert conn.execute("SELECT COUNT(*) FROM timeline_frames").fetchone()[0] == 25, (
            "the migration lost rows"
        )
    finally:
        conn.close()
    print("PASS an old-schema database gains the columns with every row intact")


def test_pre_migration_rows_read_back_null_not_a_fabricated_pose():
    """A frame recorded before the channel existed has no value for it. NULL is
    the honest answer; defaulting to HEAD_CENTER would invent a sensor reading
    that no camera ever produced and quietly bias any later analysis."""
    _build_legacy_db(10)
    timeline.init_timeline_tables()

    conn = sqlite3.connect(_DB)
    try:
        for column in NEW_COLUMNS:
            nulls = conn.execute(
                f"SELECT COUNT(*) FROM timeline_frames WHERE {column} IS NULL"
            ).fetchone()[0]
            assert nulls == 10, f"{column} backfilled a value on legacy rows"
    finally:
        conn.close()
    print("PASS rows predating the columns read back NULL, not an invented pose")


def test_the_migration_is_idempotent():
    """init_timeline_tables runs on every startup, so a second pass must not
    raise (SQLite errors on ALTER TABLE ADD COLUMN for a duplicate name)."""
    _build_legacy_db(5)
    for _ in range(3):
        timeline.init_timeline_tables()
    cols = _columns()
    for name in NEW_COLUMNS:
        assert cols.count(name) == 1, f"{name} was added more than once: {cols}"
    print("PASS running the migration repeatedly is harmless")


def test_a_fresh_database_has_the_columns_from_the_create():
    if os.path.exists(_DB):
        os.remove(_DB)
    timeline.init_timeline_tables()
    cols = _columns()
    for name in NEW_COLUMNS:
        assert name in cols, f"fresh database is missing {name}: {cols}"
    print("PASS a fresh database gets the columns from CREATE TABLE")


def test_both_insert_signatures_work_after_migration():
    """The new parameters are keyword-defaulted so existing callers keep working.
    A caller that omits them must store NULL rather than crash or fabricate."""
    _build_legacy_db(0)
    timeline.init_timeline_tables()

    with_channels = uuid.uuid4().hex
    without = uuid.uuid4().hex
    now = time.time()

    timeline.insert_frame(
        with_channels, "probe", now, 82.0, "SIDE_OR_UP", "HEAD_CENTER",
        1, False, "HEAD_LEFT", "center",
    )
    # Legacy positional call — exactly what test_dashboard_summary.py does.
    timeline.insert_frame(without, "probe", now + 1, 90.0, "STRAIGHT", "HEAD_CENTER", 1, False)

    conn = sqlite3.connect(_DB)
    conn.row_factory = sqlite3.Row
    try:
        rows = {
            r["frame_id"]: dict(r)
            for r in conn.execute(
                "SELECT frame_id, head_pose, head_pose_raw, gaze_class "
                "FROM timeline_frames WHERE session_id = 'probe'"
            )
        }
    finally:
        conn.close()

    assert rows[with_channels]["head_pose_raw"] == "HEAD_LEFT"
    assert rows[with_channels]["gaze_class"] == "center"
    # The fused label is what the system acted on and must be stored unchanged,
    # separately from what either sensor said on its own.
    assert rows[with_channels]["head_pose"] == "HEAD_CENTER"
    assert rows[without]["head_pose_raw"] is None
    assert rows[without]["gaze_class"] is None
    print("PASS new and legacy insert_frame calls both write correctly")


def test_the_veto_is_recoverable_from_a_stored_row():
    """The point of the whole change: a stored frame must distinguish "the head
    never moved" from "the head turned and centred eyes vetoed it". With only the
    fused label both read HEAD_CENTER and the paper's central mechanism cannot be
    evaluated on a recorded session."""
    _build_legacy_db(0)
    timeline.init_timeline_tables()

    never_moved = uuid.uuid4().hex
    vetoed = uuid.uuid4().hex
    now = time.time()

    timeline.insert_frame(never_moved, "veto", now, 100.0, "STRAIGHT", "HEAD_CENTER",
                          1, False, "HEAD_CENTER", "center")
    timeline.insert_frame(vetoed, "veto", now + 1, 100.0, "STRAIGHT", "HEAD_CENTER",
                          1, False, "HEAD_LEFT", "center")

    conn = sqlite3.connect(_DB)
    conn.row_factory = sqlite3.Row
    try:
        rows = {
            r["frame_id"]: dict(r)
            for r in conn.execute(
                "SELECT frame_id, head_pose, head_pose_raw FROM timeline_frames "
                "WHERE session_id = 'veto'"
            )
        }
    finally:
        conn.close()

    # Identical fused label...
    assert rows[never_moved]["head_pose"] == rows[vetoed]["head_pose"] == "HEAD_CENTER"
    # ...but the pre-fusion channel tells the two cases apart.
    assert rows[never_moved]["head_pose_raw"] == "HEAD_CENTER"
    assert rows[vetoed]["head_pose_raw"] == "HEAD_LEFT"
    print("PASS a vetoed head turn is distinguishable from a head that never moved")


if __name__ == "__main__":
    test_an_old_database_gains_the_columns_without_losing_rows()
    test_pre_migration_rows_read_back_null_not_a_fabricated_pose()
    test_the_migration_is_idempotent()
    test_a_fresh_database_has_the_columns_from_the_create()
    test_both_insert_signatures_work_after_migration()
    test_the_veto_is_recoverable_from_a_stored_row()
    print("\nAll timeline migration tests passed.")
