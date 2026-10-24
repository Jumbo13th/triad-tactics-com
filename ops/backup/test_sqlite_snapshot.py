"""Verify the one application-specific backup step against real SQLite files."""
from pathlib import Path
import sqlite3
import tempfile
import unittest

from sqlite_snapshot import snapshot


class SQLiteSnapshotTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.source = self.directory / "live.db"
        self.destination = self.directory / "snapshot.db"

    def test_snapshot_includes_committed_wal_data_and_needs_no_sidecar_files(self):
        live = sqlite3.connect(self.source)
        self.addCleanup(live.close)
        live.execute("PRAGMA journal_mode=WAL")
        live.execute("PRAGMA wal_autocheckpoint=0")
        live.execute("CREATE TABLE applications (id INTEGER PRIMARY KEY, name TEXT)")
        live.execute("INSERT INTO applications(name) VALUES ('synthetic fixture')")
        live.commit()
        self.assertTrue(Path(str(self.source) + "-wal").exists())
        snapshot(self.source, self.destination)
        with sqlite3.connect(self.destination) as restored:
            self.assertEqual(restored.execute("PRAGMA integrity_check").fetchall(), [("ok",)])
            self.assertEqual(restored.execute("SELECT name FROM applications").fetchall(), [("synthetic fixture",)])
            self.assertEqual(restored.execute("PRAGMA journal_mode").fetchone(), ("delete",))
        self.assertFalse(Path(str(self.destination) + "-wal").exists())
        self.assertEqual(self.destination.stat().st_mode & 0o777, 0o600)

    def test_corrupt_database_does_not_leave_a_snapshot(self):
        self.source.write_bytes(b"this is not SQLite")
        with self.assertRaises(sqlite3.DatabaseError):
            snapshot(self.source, self.destination)
        self.assertFalse(self.destination.exists())

    def test_existing_snapshot_is_not_overwritten(self):
        self.source.touch()
        self.destination.write_bytes(b"existing recovery point")
        with self.assertRaises(FileExistsError):
            snapshot(self.source, self.destination)
        self.assertEqual(self.destination.read_bytes(), b"existing recovery point")

    def test_symlink_source_is_refused(self):
        real = self.directory / "real.db"
        real.touch()
        self.source.symlink_to(real)
        with self.assertRaises(ValueError):
            snapshot(self.source, self.destination)
        self.assertFalse(self.destination.exists())


if __name__ == "__main__":
    unittest.main()
