#!/usr/bin/env python3
"""The application-specific hook: a consistent, verified SQLite online backup."""
import contextlib
import os
from pathlib import Path
import sqlite3
import sys
import time


def snapshot(source, destination):
    source, destination = Path(source).absolute(), Path(destination).absolute()
    for path in (source, destination):
        if any(part.is_symlink() for part in (path, *path.parents)):
            raise ValueError("SQLite paths must not contain symlinks")
    if not source.is_file():
        raise ValueError("The source database is missing")
    descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    os.close(descriptor)
    deadline = time.monotonic() + 180

    def progress(status, remaining, total):
        if time.monotonic() > deadline:
            raise TimeoutError("SQLite snapshot exceeded its time budget")

    try:
        with contextlib.closing(sqlite3.connect(source.as_uri() + "?mode=ro", uri=True, timeout=30)) as live:
            with contextlib.closing(sqlite3.connect(destination)) as backup:
                live.backup(backup, pages=256, progress=progress, sleep=0.05)
                if backup.execute("PRAGMA journal_mode=DELETE").fetchone()[0] != "delete":
                    raise ValueError("Snapshot must be a standalone database")
                if backup.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
                    raise ValueError("Snapshot failed its integrity check")
    except BaseException:
        destination.unlink(missing_ok=True)
        raise


if __name__ == "__main__":
    try:
        if len(sys.argv) != 3:
            raise ValueError("Expected source and destination")
        snapshot(sys.argv[1], sys.argv[2])
    except (OSError, ValueError, sqlite3.Error, TimeoutError):
        print("SQLite snapshot failed; no backup retention was performed.", file=sys.stderr)
        sys.exit(1)
