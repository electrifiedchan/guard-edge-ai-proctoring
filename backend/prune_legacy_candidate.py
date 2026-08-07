"""Delete telemetry recorded under the old hardcoded candidate id.

Background
----------
Before per-resume identity landed, both the telemetry writer and the dashboard
reader hardcoded the literal `major_project_candidate_01`, so every resume on
the machine shared one history. Identity is now derived from the resume's
content hash (`resume_<hash>`, see frontend/src/lib/resumeMemory.ts), which
leaves the pre-fix rows stranded: no resume hashes to that literal, so nothing
can ever read them again. They are invisible weight in the same tables the
dashboard queries.

This is deliberately a standalone script, not startup cleanup. Deleting rows is
not something that should happen as a side effect of booting the API — a
mistaken prefix would be discovered after the data was already gone.

Usage
-----
Dry run (default — counts only, touches nothing):

    venv/Scripts/python.exe backend/prune_legacy_candidate.py

Delete, after taking a timestamped .bak copy of the database:

    venv/Scripts/python.exe backend/prune_legacy_candidate.py --apply

Both forms print a per-table before/after count. `--apply` refuses to run if
the backup cannot be written, because the delete is otherwise unrecoverable.

Note on `?demo=1`: the dashboard's demo view builds from a local TypeScript
fixture (frontend/src/lib/demoSummary.ts) and never queries the backend, so the
candidate_id it displays is cosmetic. Pruning cannot affect it.
"""

from __future__ import annotations

import argparse
import os
import shutil
import sqlite3
import sys
from datetime import datetime

# Same resolution order as core_memory/timeline.py, so an env-overridden
# database is pruned rather than a stale default being silently opened.
DB_PATH = os.getenv(
    "GUARD_DB_PATH",
    os.path.join(os.path.dirname(__file__), "guard_telemetry.db"),
)

LEGACY_ID = "major_project_candidate_01"

# Every table keyed by session_id. Two shapes coexist: the bare legacy id from
# before per-run ids, and "{candidate_id}__{rand}" per-run rows. Matching only
# one shape would leave half the orphans behind.
TABLES = ("sessions", "timeline_frames", "moments")

# LIKE with an explicit ESCAPE: the literal contains underscores, which are
# single-character wildcards in LIKE. Without escaping, "major_project..."
# would also match "majorXproject...". No such id exists today, but a pattern
# that is wrong-but-harmless by luck is not a safe thing to leave in a delete.
_PREFIX_PATTERN = LEGACY_ID.replace("_", r"\_") + r"\_\_%"

_WHERE = r"(session_id = ? OR session_id LIKE ? ESCAPE '\')"
_PARAMS = (LEGACY_ID, _PREFIX_PATTERN)


def _counts(conn: sqlite3.Connection) -> dict[str, tuple[int, int]]:
    """table -> (legacy rows, total rows)."""
    out: dict[str, tuple[int, int]] = {}
    for table in TABLES:
        legacy = conn.execute(
            f"SELECT COUNT(*) FROM {table} WHERE {_WHERE}", _PARAMS
        ).fetchone()[0]
        total = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        out[table] = (legacy, total)
    return out


def _report(label: str, counts: dict[str, tuple[int, int]]) -> None:
    print(f"\n{label}")
    for table, (legacy, total) in counts.items():
        print(f"  {table:16} {legacy:4} legacy of {total:4} total")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="actually delete (default is a dry run)",
    )
    args = parser.parse_args()

    if not os.path.exists(DB_PATH):
        print(f"no database at {DB_PATH} — nothing to prune")
        return 0

    print(f"database: {os.path.abspath(DB_PATH)}")
    print(f"legacy id: {LEGACY_ID}")

    conn = sqlite3.connect(DB_PATH)
    try:
        before = _counts(conn)
        _report("before:", before)

        doomed = sum(legacy for legacy, _ in before.values())
        if doomed == 0:
            print("\nno legacy rows — already pruned")
            return 0

        if not args.apply:
            print(f"\ndry run: {doomed} rows would be deleted. Re-run with --apply.")
            return 0

        # Back up before the first DELETE. sqlite3's own backup API is used
        # rather than a file copy so an in-flight writer cannot yield a torn
        # snapshot.
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup_path = f"{DB_PATH}.{stamp}.bak"
        try:
            with sqlite3.connect(backup_path) as dest:
                conn.backup(dest)
        except (sqlite3.Error, OSError) as exc:
            print(f"\nbackup to {backup_path} failed: {exc}")
            print("refusing to delete without a backup")
            return 1
        print(f"\nbackup: {backup_path}")

        # One transaction across all three tables: a partial prune would leave
        # frames whose parent session row is gone.
        with conn:
            for table in TABLES:
                conn.execute(f"DELETE FROM {table} WHERE {_WHERE}", _PARAMS)

        _report("after:", _counts(conn))
        print(f"\ndeleted {doomed} rows")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
