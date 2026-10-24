"""Exercise real GPG with synthetic exports; never contact SSH or Bunny servers."""

import base64
import datetime as dt
import gzip
import hashlib
import io
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from unittest import mock

import triad_backup_runner as runner


PASSPHRASE = "synthetic-test-passphrase-only-8a7b6c5d4e3f"
PASSWORD = "synthetic-storage-password-only"
HOST = "backup-test.invalid"
NOW = dt.datetime(2026, 10, 25, 12, tzinfo=dt.timezone.utc)
PAYLOAD = gzip.compress(b"Synthetic backup fixture; no real user data.\n" * 100)
TEMP_DIRECTORY = tempfile.TemporaryDirectory
POPEN = subprocess.Popen


def environment():
    return {"DEPLOY_HOST": HOST,
            "DEPLOY_SSH_KEY": "-----BEGIN OPENSSH PRIVATE KEY-----\nplaceholder\n-----END OPENSSH PRIVATE KEY-----\n",
            "DEPLOY_KNOWN_HOSTS": f"{HOST} ssh-ed25519 {base64.b64encode(b'fixture-key').decode()}\n",
            "BACKUP_ENCRYPTION_PASSPHRASE": PASSPHRASE,
            "BUNNY_STORAGE_PASSWORD": PASSWORD}


class ValidationTests(unittest.TestCase):
    def test_bunny_defaults_and_configuration_repr_do_not_expose_secrets(self):
        config = runner.validate_environment(environment())
        self.assertEqual(config.bunny["zone"], "triad-tactics-com")
        self.assertEqual(config.bunny["endpoint"], "storage.bunnycdn.com")
        self.assertNotIn(PASSPHRASE, repr(config))
        self.assertNotIn(PASSWORD, repr(config))

    def test_missing_or_invalid_credentials_fail_before_temporary_files_or_connection(self):
        invalid = [(key, "") for key in environment()]
        invalid += [("DEPLOY_HOST", "root@example.invalid"), ("DEPLOY_HOST", "-ProxyCommand=bad"),
                    ("DEPLOY_HOST", "example.invalid/path"), ("DEPLOY_SSH_KEY", "public-key-only"),
                    ("DEPLOY_KNOWN_HOSTS", "# comments only"),
                    ("DEPLOY_KNOWN_HOSTS", f"{HOST} ssh-ed25519 invalid???"),
                    ("BACKUP_ENCRYPTION_PASSPHRASE", "too-short"),
                    ("BACKUP_ENCRYPTION_PASSPHRASE", PASSPHRASE + "\n"),
                    ("BACKUP_ENCRYPTION_PASSPHRASE", " " * 40),
                    ("BUNNY_STORAGE_ENDPOINT", "https://attacker.invalid")]
        with mock.patch.object(runner.tempfile, "TemporaryDirectory") as temporary:
            with mock.patch.object(runner.subprocess, "Popen") as process:
                for name, value in invalid:
                    with self.subTest(name=name, value=value):
                        with self.assertRaises((runner.RunnerError, runner.OffsiteError)):
                            runner.run_backup({**environment(), name: value})
                temporary.assert_not_called()
                process.assert_not_called()

    def test_ssh_command_has_exact_export_and_pinned_host_controls(self):
        config = runner.validate_environment(environment())
        command = runner._ssh_command(config, Path("/private/key"), Path("/private/hosts"), {"ssh": "/usr/bin/ssh"})
        self.assertEqual(command[-2:], [f"root@{HOST}", "backup-export"])
        for option in ("StrictHostKeyChecking=yes", "IdentitiesOnly=yes", "IdentityAgent=none",
                       "GlobalKnownHostsFile=/dev/null", "PasswordAuthentication=no",
                       "UserKnownHostsFile=/private/hosts"):
            self.assertIn(option, command)
        self.assertEqual(command[1:3], ["-F", "/dev/null"])
        self.assertNotIn(PASSWORD, str(command))
        self.assertNotIn(PASSPHRASE, str(command))


@unittest.skipUnless(all(shutil.which(tool) for tool in ("gpg", "gpgconf", "ssh-keygen", "ssh")),
                     "OpenSSH and GnuPG are required for synthetic roundtrip tests")
class PipelineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.material = TEMP_DIRECTORY(prefix="triad-test-key-")
        cls.addClassCleanup(cls.material.cleanup)
        key = Path(cls.material.name) / "key"
        subprocess.run(["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", str(key)],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True, timeout=10)
        cls.test_environment = {**environment(), "DEPLOY_SSH_KEY": key.read_text(),
                                "DEPLOY_KNOWN_HOSTS": f"{HOST} {key.with_suffix('.pub').read_text()}"}

    def setUp(self):
        self.directories = []

        def temporary(*args, **kwargs):
            result = TEMP_DIRECTORY(*args, **kwargs)
            self.directories.append(Path(result.name))
            return result

        patcher = mock.patch.object(runner.tempfile, "TemporaryDirectory", side_effect=temporary)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(self.assert_temporary_cleanup)

    def assert_temporary_cleanup(self):
        self.assertTrue(self.directories)
        for directory in self.directories:
            self.assertFalse(directory.exists(), "Runner credentials or ciphertext were left behind")

    def fake_ssh(self, *, code=0, payload=PAYLOAD, suffix=""):
        return [sys.executable, "-c", f"import sys,time;sys.stdout.buffer.write(bytes.fromhex('{payload.hex()}'));"
                f"sys.stdout.flush();{suffix}sys.exit({code})"]

    def decrypt(self, archive):
        read_fd, write_fd = os.pipe()
        try:
            os.write(write_fd, (PASSPHRASE + "\n").encode())
            os.close(write_fd)
            write_fd = None
            result = subprocess.run(["gpg", "--no-options", "--batch", "--pinentry-mode", "loopback",
                                     "--passphrase-fd", str(read_fd), "--decrypt", str(archive)],
                                    pass_fds=(read_fd,), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                    env={"PATH": "/usr/bin:/bin", "GNUPGHOME": str(archive.parent / "gnupg"),
                                         "HOME": str(archive.parent)}, timeout=20, check=True)
            return result.stdout
        finally:
            os.close(read_fd)
            if write_fd is not None:
                os.close(write_fd)

    def test_real_gpg_roundtrip_and_private_files_with_filtered_child_environment(self):
        def upload(archive, stamp, config):
            self.assertEqual(self.decrypt(archive), PAYLOAD)
            self.assertNotIn(PAYLOAD, archive.read_bytes())
            self.assertEqual(archive.stat().st_mode & 0o777, 0o600)
            self.assertEqual(archive.parent.stat().st_mode & 0o777, 0o700)
            for name in ("deploy_key", "known_hosts"):
                self.assertEqual((archive.parent / name).stat().st_mode & 0o777, 0o600)
            self.assertEqual((archive.parent / "gnupg").stat().st_mode & 0o777, 0o700)
            self.assertFalse(list(archive.parent.rglob("*.tar.gz")))
            self.assertEqual(config["password"], PASSWORD)
            return {"timestamp": stamp, "bytes": archive.stat().st_size,
                    "sha256": hashlib.sha256(archive.read_bytes()).hexdigest(), "deleted": 0,
                    "remote_path": "triad-backups/v1/" + archive.name}

        with mock.patch.object(runner, "_ssh_command", return_value=self.fake_ssh()):
            with mock.patch.object(runner, "upload_archive", side_effect=upload) as uploaded:
                with mock.patch.object(runner.subprocess, "Popen", wraps=POPEN) as processes:
                    metadata = runner.run_backup({**self.test_environment, "UNRELATED_SECRET": "not-inherited"}, NOW)
        uploaded.assert_called_once()
        self.assertEqual(metadata["timestamp"], "2026-10-25T12-00-00-000Z")
        for call in processes.call_args_list:
            self.assertNotIn(PASSPHRASE, str(call.args))
            self.assertNotIn(PASSWORD, str(call.args))
            for name in ("DEPLOY_SSH_KEY", "BUNNY_STORAGE_PASSWORD", "BACKUP_ENCRYPTION_PASSPHRASE", "UNRELATED_SECRET"):
                self.assertNotIn(name, call.kwargs.get("env", {}))

    def test_truncated_export_with_nonzero_ssh_exit_is_never_uploaded(self):
        with mock.patch.object(runner, "_ssh_command", return_value=self.fake_ssh(code=7, payload=PAYLOAD[:20])):
            with mock.patch.object(runner, "upload_archive") as uploaded:
                with self.assertRaisesRegex(runner.RunnerError, "SSH exit 7"):
                    runner.run_backup(self.test_environment, NOW)
                uploaded.assert_not_called()

    def test_gpg_failure_is_never_uploaded(self):
        tools = runner._tools()
        tools["gpg"] = "/bin/false"
        with mock.patch.object(runner, "_tools", return_value=tools):
            with mock.patch.object(runner, "_ssh_command", return_value=self.fake_ssh()):
                with mock.patch.object(runner, "upload_archive") as uploaded:
                    with self.assertRaises((runner.RunnerError, OSError)):
                        runner.run_backup(self.test_environment, NOW)
                    uploaded.assert_not_called()

    def test_timeout_stops_both_processes_and_prevents_upload(self):
        processes = []

        def create(*args, **kwargs):
            process = POPEN(*args, **kwargs)
            if kwargs.get("start_new_session"):
                processes.append(process)
            return process

        started = time.monotonic()
        with mock.patch.object(runner, "TRANSFER_SECONDS", 0.2):
            with mock.patch.object(runner, "_ssh_command", return_value=self.fake_ssh(suffix="time.sleep(30);")):
                with mock.patch.object(runner.subprocess, "Popen", side_effect=create):
                    with mock.patch.object(runner, "upload_archive") as uploaded:
                        with self.assertRaisesRegex(runner.RunnerError, "time budget"):
                            runner.run_backup(self.test_environment, NOW)
                        uploaded.assert_not_called()
        self.assertLess(time.monotonic() - started, 10)
        self.assertEqual(len(processes), 2)
        self.assertTrue(all(process.poll() is not None for process in processes))

    def test_upload_verification_failure_removes_ciphertext_and_credentials(self):
        with mock.patch.object(runner, "_ssh_command", return_value=self.fake_ssh()):
            with mock.patch.object(runner, "upload_archive", side_effect=runner.OffsiteError("readback mismatch")):
                with self.assertRaisesRegex(runner.OffsiteError, "readback mismatch"):
                    runner.run_backup(self.test_environment, NOW)

    def test_host_key_mismatch_fails_before_starting_export(self):
        config = {**self.test_environment, "DEPLOY_HOST": "another-host.invalid"}
        with mock.patch.object(runner, "_ssh_command") as command:
            with mock.patch.object(runner, "upload_archive") as uploaded:
                with self.assertRaisesRegex(runner.RunnerError, "local validation"):
                    runner.run_backup(config, NOW)
                command.assert_not_called()
                uploaded.assert_not_called()


class ReportingTests(unittest.TestCase):
    def test_summary_contains_recovery_path_and_no_secrets(self):
        with TEMP_DIRECTORY() as folder:
            summary = Path(folder) / "summary"
            metadata = {"remote_path": "triad-backups/v1/deployment-2026-10-25T12-00-00-000Z.tar.gz.gpg",
                        "timestamp": "2026-10-25T12-00-00-000Z", "bytes": 100,
                        "sha256": "a" * 64, "deleted": 2}
            with mock.patch.object(runner, "run_backup", return_value=metadata):
                with mock.patch.dict(os.environ, {"GITHUB_STEP_SUMMARY": str(summary)}):
                    with mock.patch("sys.stdout", new_callable=io.StringIO):
                        self.assertEqual(runner.main(), 0)
            content = summary.read_text()
            self.assertIn(metadata["remote_path"], content)
            self.assertNotIn(PASSWORD, content)
            self.assertNotIn(PASSPHRASE, content)


if __name__ == "__main__":
    unittest.main()
