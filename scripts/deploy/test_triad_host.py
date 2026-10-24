"""Safety checks run with `python3 -m unittest discover -s scripts/deploy -p 'test_*.py'`."""

import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import Mock, patch


spec = importlib.util.spec_from_file_location("triad_host", Path(__file__).with_name("triad_host.py"))
host = importlib.util.module_from_spec(spec)
spec.loader.exec_module(host)


def database(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with contextlib.closing(sqlite3.connect(path)) as db:
        db.execute("CREATE TABLE snapshot(value TEXT)")
        db.execute("INSERT INTO snapshot VALUES ('must survive cleanup')")
        db.commit()


class RetentionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.backups, self.volume = self.root / "backups", self.root / "volume"
        self.keys = [f"2026-10-{day:02d}T12-00-00-000Z" for day in range(1, 13)]
        for key in self.keys:
            canonical = self.backups / "backups" / f"applications-{key}.db"
            database(canonical)
            duplicate = self.volume / "backups" / canonical.name
            database(duplicate)
            database(self.backups / canonical.name)
            bundle = self.backups / f"deployment-{key}"
            bundle.mkdir(parents=True)
            os.link(canonical, bundle / "applications.db")
            (bundle / ".env").write_text("private configuration")

    def test_retains_ten_snapshot_sets_across_three_locations(self):
        untouched = self.backups / "operator-notes.txt"
        untouched.write_text("preserve me")
        with contextlib.redirect_stdout(io.StringIO()):
            host.prune_backups(self.backups, self.volume, self.keys[-1])
        groups = host.collect_backups(self.backups, self.volume)
        self.assertEqual(sorted(groups), self.keys[2:])
        self.assertTrue(untouched.exists())
        self.assertFalse((self.volume / "backups" / f"applications-{self.keys[0]}.db").exists())
        self.assertFalse((self.backups / f"applications-{self.keys[0]}.db").exists())

    def test_missing_fresh_backup_cannot_delete_anything(self):
        with self.assertRaises(host.Refused):
            host.prune_backups(self.backups, self.volume, "2026-10-30T12-00-00-000Z")
        self.assertEqual(len(host.collect_backups(self.backups, self.volume)), 12)

    def test_corrupt_retained_backup_aborts_entire_cleanup(self):
        newest = self.backups / "backups" / f"applications-{self.keys[-1]}.db"
        newest.write_bytes(b"not a database")
        with self.assertRaises(sqlite3.DatabaseError):
            host.prune_backups(self.backups, self.volume, self.keys[-1])
        self.assertTrue((self.backups / f"deployment-{self.keys[0]}").exists())

    def test_symlink_even_in_expired_bundle_aborts_before_any_deletion(self):
        outside = self.root / "outside"
        outside.mkdir()
        (outside / "valuable.txt").write_text("preserve me")
        (self.backups / f"deployment-{self.keys[0]}" / "escape").symlink_to(outside, target_is_directory=True)
        with self.assertRaises(host.Refused):
            host.prune_backups(self.backups, self.volume, self.keys[-1])
        self.assertTrue((outside / "valuable.txt").exists())
        self.assertTrue((self.backups / f"deployment-{self.keys[1]}").exists())

    def test_symlinked_checksum_sidecar_aborts_before_deleting_db(self):
        oldest = self.backups / "backups" / f"applications-{self.keys[0]}.db"
        Path(str(oldest) + ".sha256").symlink_to(self.root / "outside-file")
        with self.assertRaises(host.Refused):
            host.prune_backups(self.backups, self.volume, self.keys[-1])
        self.assertTrue(oldest.exists())

    def test_dry_run_preserves_all_files(self):
        with contextlib.redirect_stdout(io.StringIO()):
            host.prune_backups(self.backups, self.volume, self.keys[-1], dry_run=True)
        self.assertEqual(len(host.collect_backups(self.backups, self.volume)), 12)

    def test_parent_traversal_and_symlink_parent_are_rejected(self):
        with self.assertRaises(host.Refused):
            host.bounded(self.backups / ".." / "outside", self.backups)
        link = self.root / "linked"
        link.symlink_to(self.backups, target_is_directory=True)
        with self.assertRaises(host.Refused):
            host.bounded(link / "anything", self.root)


class CommandTests(unittest.TestCase):
    def test_forced_command_accepts_only_exact_main_deploy_format(self):
        commit, digest = "a" * 40, "sha256:" + "b" * 64
        self.assertEqual(host.parse_request(f"deploy {commit} {digest}"), ("deploy", commit, digest))
        for command in ("sh", f"deploy {commit} {digest}; id", f"deploy {commit} {digest}\n",
                        f"deploy --help {digest}", f"deploy {commit} $(id)"):
            with self.subTest(command=command), self.assertRaises(host.Refused):
                host.parse_request(command)

    def test_backup_export_accepts_no_arguments_or_shell_syntax(self):
        self.assertEqual(host.parse_request("backup-export"), ("backup-export", None, None))
        for command in ("backup-export /etc", "backup-export --help", " backup-export", "backup-export ",
                        "backup-export\n", "backup-export; id", "backup-export $(id)", "backup-export\x00"):
            with self.subTest(command=command), self.assertRaises(host.Refused):
                host.parse_request(command)

    def test_ssh_backup_export_uses_host_lock_without_requesting_registry_credentials(self):
        machine = Mock()
        output = io.BytesIO()
        stdout = io.StringIO()
        stdout.buffer = output
        events = []
        machine.export_backup.side_effect = lambda stream: events.append(("export", stream))
        with patch.object(host, "Host", return_value=machine), \
                patch.object(host.os, "geteuid", return_value=0), \
                patch.object(host.os, "umask"), \
                patch.object(host, "bounded", side_effect=lambda path, _: path), \
                patch.object(host.Path, "open", return_value=io.StringIO()), \
                patch.object(host.fcntl, "flock", side_effect=lambda *args: events.append(("lock", None))), \
                patch.object(host, "read_registry_credentials") as credentials, \
                patch.object(host.sys, "argv", ["triad_host.py", "ssh"]), \
                patch.object(host.sys, "stdout", stdout), \
                patch.dict(host.os.environ, {"SSH_ORIGINAL_COMMAND": "backup-export"}):
            host.main()
        credentials.assert_not_called()
        machine.deploy.assert_not_called()
        self.assertEqual(events, [("lock", None), ("export", output)])

    def test_registry_credentials_use_bounded_json_pipe(self):
        for value, valid in [({"username": "github-actions[bot]", "token": "x" * 40}, True),
                             ({"username": "bad;name", "token": "x" * 40}, False),
                             ({"username": "valid", "token": "x\n" * 20}, False),
                             ({"username": "valid", "token": "x" * 40, "command": "sh"}, False)]:
            reader, writer = os.pipe()
            os.write(writer, json.dumps(value).encode())
            os.close(writer)
            with os.fdopen(reader, "rb") as stream:
                if valid:
                    self.assertEqual(host.read_registry_credentials(stream), value)
                else:
                    with self.assertRaises(host.Refused):
                        host.read_registry_credentials(stream)


class ExportTests(unittest.TestCase):
    setUp = RetentionTests.setUp

    def test_full_export_has_only_archive_on_stdout_and_retains_ten_local_sets(self):
        machine = host.Host(self.root)
        key = self.keys[-1]
        bundle = self.backups / f"deployment-{key}"
        (bundle / "manifest.json").write_text(json.dumps({"timestamp": key}))
        (bundle / "source.tar.gz").write_bytes(b"source snapshot")
        (bundle / "tls.tar.gz").write_bytes(b"certificate snapshot")
        machine.containers = Mock(return_value={"app": {"Id": "running"}})

        def backup(containers, full=False):
            self.assertTrue(full)
            host.log("Backup diagnostics must stay outside archive")
            return key, bundle, self.volume

        machine.backup = Mock(side_effect=backup)
        output, stdout, stderr = io.BytesIO(), io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            machine.export_backup(output)
        self.assertEqual(stdout.getvalue(), "")
        self.assertIn("Backup diagnostics", stderr.getvalue())
        self.assertIn("10 snapshot sets retained", stderr.getvalue())
        self.assertEqual(sorted(host.collect_backups(self.backups, self.volume)), self.keys[2:])
        with tarfile.open(fileobj=io.BytesIO(output.getvalue()), mode="r:gz") as archive:
            self.assertEqual(set(archive.getnames()), {
                "backup", "backup/.env", "backup/applications.db", "backup/manifest.json",
                "backup/source.tar.gz", "backup/tls.tar.gz"})
            self.assertEqual(archive.extractfile("backup/.env").read(), b"private configuration")
            self.assertEqual(archive.extractfile("backup/applications.db").read(),
                             (bundle / "applications.db").read_bytes())
        machine.backup.assert_called_once_with(machine.containers.return_value, full=True)
        self.assertFalse(any(self.backups.glob("*.tar*")))

    def test_failed_snapshot_or_retention_writes_no_archive_bytes(self):
        machine = host.Host(self.root)
        machine.containers = Mock(return_value={})
        machine.backup = Mock(side_effect=host.Refused("snapshot failed"))
        output = io.BytesIO()
        with patch.object(host, "prune_backups") as prune, self.assertRaises(host.Refused):
            machine.export_backup(output)
        prune.assert_not_called()
        self.assertEqual(output.getvalue(), b"")
        machine.backup = Mock(return_value=(self.keys[-1], self.backups / f"deployment-{self.keys[-1]}", self.volume))
        with patch.object(host, "prune_backups", side_effect=host.Refused("retention failed")), \
                self.assertRaises(host.Refused):
            machine.export_backup(output)
        self.assertEqual(output.getvalue(), b"")

    def test_export_refuses_symlinks_before_streaming_any_member(self):
        machine = host.Host(self.root)
        bundle = self.backups / f"deployment-{self.keys[-1]}"
        outside = self.root / "outside-secret"
        outside.write_text("must not be exported")
        (bundle / "escape").symlink_to(outside)
        machine.containers = Mock(return_value={})
        machine.backup = Mock(return_value=(self.keys[-1], bundle, self.volume))
        output = io.BytesIO()
        with patch.object(host, "prune_backups"), self.assertRaises(host.Refused):
            machine.export_backup(output)
        self.assertEqual(output.getvalue(), b"")


class ImageTests(unittest.TestCase):
    def test_current_previous_and_unrelated_images_are_preserved(self):
        protected = {"current", "previous", "other-container"}
        for image_id in protected:
            image = {"Id": image_id, "RepoTags": [host.IMAGE + ":old"]}
            self.assertEqual(host.removable_references(image, protected), [])
        unrelated = {"Id": "unused", "RepoTags": ["postgres:17"]}
        self.assertEqual(host.removable_references(unrelated, protected), [])

    def test_old_digest_only_releases_are_removed_without_accumulating(self):
        image = {"Id": "expired", "RepoTags": [],
                 "RepoDigests": [host.IMAGE + "@sha256:" + "c" * 64]}
        self.assertEqual(host.removable_references(image, set()), ["expired"])

    def test_digest_only_official_base_images_are_removed_but_rollback_and_other_repositories_survive(self):
        digest = "@sha256:" + "d" * 64
        for repository in ("nginx", "alpine", "library/nginx", "docker.io/nginx",
                           "docker.io/library/nginx", "docker.io/library/alpine",
                           "index.docker.io/library/nginx", "index.docker.io/library/alpine"):
            image = {"Id": "old-base", "RepoTags": [], "RepoDigests": [repository + digest]}
            with self.subTest(repository=repository):
                self.assertEqual(host.removable_references(image, set()), ["old-base"])
                self.assertEqual(host.removable_references(image, {"old-base"}), [])
                image["RepoTags"] = ["operator-special:keep"]
                self.assertEqual(host.removable_references(image, set()), [])
        for repository in ("postgres", "nginx-custom", "docker.io/example/nginx",
                           "example.com/library/nginx", "evil.example/alpine"):
            image = {"Id": "unrelated", "RepoDigests": [repository + digest]}
            with self.subTest(repository=repository):
                self.assertEqual(host.removable_references(image, set()), [])

    def test_unrelated_tags_are_not_removed(self):
        image = {"Id": "shared", "RepoTags": ["alpine:3.20", "operator-special:keep"]}
        self.assertEqual(host.removable_references(image, set()), ["alpine:3.20"])


class FailureTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.machine = host.Host(self.root)
        self.machine.control.mkdir()

    def test_failed_backup_prevents_retention_and_docker_cleanup(self):
        self.machine.containers = Mock(return_value={})
        self.machine.backup = Mock(side_effect=host.Refused("backup failed"))
        self.machine.prune_docker = Mock()
        with patch.object(host, "prune_backups") as prune, self.assertRaises(host.Refused):
            self.machine.maintain()
        prune.assert_not_called()
        self.machine.prune_docker.assert_not_called()

    def test_failed_health_restores_images_and_keeps_database_untouched(self):
        self.check_failed_deploy()

    def test_timed_out_cron_stop_restores_cron_and_keeps_database_untouched(self):
        self.check_failed_deploy(stop_cron_fails=True)

    def check_failed_deploy(self, stop_cron_fails=False):
        machine = self.machine
        key = "2026-10-24T12-00-00-000Z"
        bundle = machine.backups / f"deployment-{key}"
        (bundle / "nginx").mkdir(parents=True)
        (bundle / "docker-compose.yml").write_text("services: {}")
        (bundle / "nginx" / "default.conf").write_text("old nginx configuration")
        database(self.root / "live.db")
        before = host.checksum(self.root / "live.db")
        old_commit, new_commit = "a" * 40, "b" * 40
        digest = "sha256:" + "c" * 64
        current = {"current": {"commit": old_commit, "digest": None, "release": str(self.root)}}
        host.write_json(machine.control / "state.json", current)
        containers = {s: {"Id": s, "Image": "sha256:" + s} for s in host.SERVICES}
        machine.containers = Mock(return_value=containers)
        machine.trusted_target = Mock()
        machine.backup = Mock(return_value=(key, bundle, self.root / "volume"))
        machine.protect_rollback = Mock()
        machine.ensure_rollback = Mock()
        machine.prune_docker = Mock()
        machine.check_space = Mock()
        release = machine.control / "releases" / new_commit
        release.mkdir(parents=True)
        machine.stage = Mock(return_value=release)
        machine.inspect = Mock(return_value={"Id": "candidate", "Config": {"Labels": {"org.opencontainers.image.revision": new_commit}}})
        machine.docker = Mock(return_value="")
        def compose(*args, **kwargs):
            if stop_cron_fails and args[1:] == ("stop", "cron"):
                raise subprocess.TimeoutExpired(["docker", "compose", "stop", "cron"], 600)
            return json.dumps({"services": {s: {"image": s} for s in host.SERVICES}})

        machine.compose = Mock(side_effect=compose)
        machine.wait_app = Mock() if stop_cron_fails else Mock(side_effect=[host.Refused("new image failed"), None])
        machine.wait_cron = Mock()
        machine.health = Mock()
        expected_error = subprocess.TimeoutExpired if stop_cron_fails else host.Refused
        with patch.object(host, "prune_backups"), contextlib.redirect_stdout(io.StringIO()), self.assertRaises(expected_error):
            machine.deploy(new_commit, digest)
        restored = machine.state()["current"]
        self.assertEqual(restored["commit"], old_commit)
        self.assertTrue(Path(restored["release"]).is_relative_to(machine.control / "releases"))
        self.assertFalse(Path(restored["release"]).is_relative_to(machine.backups))
        self.assertEqual(host.checksum(self.root / "live.db"), before)
        machine.protect_rollback.assert_not_called()
        override = json.loads((Path(restored["release"]) / "image.override.json").read_text())
        self.assertEqual(override["services"]["app"]["image"], containers["app"]["Image"])
        calls = machine.compose.call_args_list
        self.assertTrue(any(call.args[0] == Path(restored["release"]) and call.args[-1] == "cron" for call in calls))


if __name__ == "__main__":
    unittest.main()
