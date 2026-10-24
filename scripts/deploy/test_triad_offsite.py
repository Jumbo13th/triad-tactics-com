"""Offline checks for encrypted backup uploads and destructive retention boundaries."""

import datetime as dt
import hashlib
import io
from pathlib import Path
import tempfile
import unittest
from unittest import mock

import triad_offsite as offsite


NOW = dt.datetime(2026, 10, 25, 12, 0, tzinfo=dt.timezone.utc)
CONFIG = {"zone": "triad-backups", "endpoint": "storage.bunnycdn.com",
          "password": "test-only-storage-password"}


def stamp(when):
    return when.strftime("%Y-%m-%dT%H-%M-%S-%f")[:-3] + "Z"


def entry(days=0, **overrides):
    value = {"ObjectName": f"deployment-{stamp(NOW - dt.timedelta(days=days))}.tar.gz.gpg",
             "IsDirectory": False, "Path": f"/{CONFIG['zone']}/{offsite.PREFIX}/",
             "StorageZoneName": CONFIG["zone"], "Length": 100}
    value.update(overrides)
    return value


class Response(io.BytesIO):
    def __init__(self, status, body=b""):
        super().__init__(body)
        self.status = status


class ConfigAndRetentionTests(unittest.TestCase):
    def test_valid_configuration(self):
        self.assertEqual(offsite.validate_config(CONFIG), CONFIG)

    def test_redirect_hosts_and_header_injection_are_rejected(self):
        for key, value in (("endpoint", "https://storage.bunnycdn.com"),
                           ("endpoint", "storage.bunnycdn.com.attacker.invalid"),
                           ("endpoint", "127.0.0.1"), ("zone", "../other-zone"),
                           ("zone", "zone/path"), ("password", "bad\r\nInjected: header")):
            with self.subTest(key=key, value=value), self.assertRaises(offsite.OffsiteError):
                offsite.validate_config({**CONFIG, key: value})

    def test_invalid_dates_and_naive_clock_are_rejected(self):
        with self.assertRaises(offsite.OffsiteError):
            offsite.parse_stamp("2026-02-30T00-00-00-000Z")
        with self.assertRaises(offsite.OffsiteError):
            offsite.retention_plan([], CONFIG["zone"], NOW.replace(tzinfo=None))

    def test_keeps_full_thirty_day_window(self):
        entries = [entry(days) for days in range(41)]
        self.assertEqual(offsite.retention_plan(entries, CONFIG["zone"], NOW),
                         [entry(days)["ObjectName"] for days in range(40, 30, -1)])

    def test_always_preserves_ten_newest_even_when_all_are_old(self):
        entries = [entry(days) for days in range(40, 55)]
        self.assertEqual(offsite.retention_plan(entries, CONFIG["zone"], NOW),
                         [entry(days)["ObjectName"] for days in range(54, 49, -1)])

    def test_unknown_paths_directories_future_and_bad_dates_never_count_or_delete(self):
        survivors = [entry(days) for days in range(40, 49)]
        unknown = [entry(90, IsDirectory=True), entry(91, Path="/other-zone/"),
                   entry(92, StorageZoneName="other-zone"), entry(-100),
                   entry(93, ObjectName="deployment-2026-02-30T00-00-00-000Z.tar.gz.gpg"),
                   entry(94, ObjectName="../deployment-2020-01-01T00-00-00-000Z.tar.gz.gpg"),
                   entry(95, ObjectName="operator-notes.txt")]
        self.assertEqual(offsite.retention_plan(survivors + unknown, CONFIG["zone"], NOW), [])

    def test_accepts_zone_relative_metadata_without_using_it_as_a_url(self):
        entries = [entry(days, Path=f"/{offsite.PREFIX}/") for days in range(40, 51)]
        self.assertEqual(offsite.retention_plan(entries, CONFIG["zone"], NOW),
                         [entry(50)["ObjectName"]])

    def test_duplicate_or_malformed_listing_refuses_retention(self):
        for listing in ([entry(), entry()], [None], [{"ObjectName": None}], {}):
            with self.subTest(listing=listing), self.assertRaises(offsite.OffsiteError):
                offsite.retention_plan(listing, CONFIG["zone"], NOW)

    def test_deletion_count_is_bounded(self):
        entries = [entry(days) for days in range(300)]
        self.assertEqual(len(offsite.retention_plan(entries, CONFIG["zone"], NOW)),
                         offsite.MAX_DELETIONS)


class UploadTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.archive = Path(self.temp.name) / "archive.tar.gz.gpg"
        # Upload tests do not invoke GPG; the runner must check GPG's exit status.
        self.archive.write_bytes(b"mock encrypted bytes with sufficient length")
        self.client = mock.Mock(spec=offsite.BunnyClient)
        self.client.config = dict(CONFIG)
        self.client.list_archives.side_effect = [[], [entry()]]
        patcher = mock.patch.object(offsite, "BunnyClient", return_value=self.client)
        patcher.start()
        self.addCleanup(patcher.stop)

    def upload(self):
        return offsite.upload_archive(self.archive, stamp(NOW), CONFIG, NOW)

    def test_upload_is_read_back_before_listing_and_pruning(self):
        entries = [entry(days) for days in range(41)]
        self.client.list_archives.side_effect = [[], entries]
        metadata = self.upload()
        self.assertEqual([call[0] for call in self.client.mock_calls[:4]],
                         ["list_archives", "upload", "verify", "list_archives"])
        self.assertEqual(metadata["sha256"], hashlib.sha256(self.archive.read_bytes()).hexdigest())
        self.assertEqual(metadata["deleted"], 10)
        self.assertNotIn(CONFIG["password"], str(metadata))
        self.assertEqual(self.client.delete.call_args_list,
                         [mock.call(entry(days)["ObjectName"]) for days in range(40, 30, -1)])

    def test_verification_failure_never_lists_for_retention_or_deletes(self):
        self.client.verify.side_effect = offsite.OffsiteError("readback failed")
        with self.assertRaises(offsite.OffsiteError):
            self.upload()
        self.assertEqual(self.client.list_archives.call_count, 1)
        self.client.delete.assert_not_called()
        self.assertEqual(list(Path(self.temp.name).iterdir()), [self.archive])

    def test_listing_failure_after_verification_never_deletes(self):
        self.client.list_archives.side_effect = [[], offsite.OffsiteError("listing failed")]
        with self.assertRaises(offsite.OffsiteError):
            self.upload()
        self.client.verify.assert_called_once()
        self.client.delete.assert_not_called()

    def test_missing_new_archive_or_malformed_listing_never_deletes(self):
        self.client.list_archives.side_effect = [[], [entry(days) for days in range(1, 50)]]
        with self.assertRaises(offsite.OffsiteError):
            self.upload()
        self.client.delete.assert_not_called()

    def test_existing_name_is_never_overwritten(self):
        self.client.list_archives.side_effect = [[entry()]]
        with self.assertRaises(offsite.OffsiteError):
            self.upload()
        self.client.upload.assert_not_called()
        self.client.delete.assert_not_called()

    def test_future_archive_is_not_uploaded(self):
        with self.assertRaises(offsite.OffsiteError):
            offsite.upload_archive(self.archive, stamp(NOW + dt.timedelta(days=1)), CONFIG, NOW)
        self.client.upload.assert_not_called()

    def test_symlink_and_oversized_archives_are_rejected(self):
        link = Path(self.temp.name) / "link.gpg"
        link.symlink_to(self.archive)
        with self.assertRaises(offsite.OffsiteError):
            offsite.upload_archive(link, stamp(NOW), CONFIG, NOW)
        with mock.patch.object(offsite, "MAX_ARCHIVE_BYTES", 20), self.assertRaises(offsite.OffsiteError):
            self.upload()
        self.client.upload.assert_not_called()


class HttpBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.connection = mock.Mock()
        patcher = mock.patch.object(offsite.http.client, "HTTPSConnection", return_value=self.connection)
        self.factory = patcher.start()
        self.addCleanup(patcher.stop)
        self.client = offsite.BunnyClient(CONFIG)
        self.name = entry()["ObjectName"]

    def test_redirect_is_not_followed_and_secret_response_body_is_not_logged(self):
        self.connection.getresponse.return_value = Response(302, CONFIG["password"].encode())
        with self.assertRaises(offsite.OffsiteError) as error:
            self.client.verify(self.name, "0" * 64, 16)
        self.assertNotIn(CONFIG["password"], str(error.exception))
        self.assertIn("302", str(error.exception))
        self.assertEqual(self.factory.call_count, 1)
        self.assertEqual(self.factory.call_args.args[0], "storage.bunnycdn.com")

    def test_download_hash_and_exact_length_are_verified(self):
        body = b"encrypted test backup"
        digest = hashlib.sha256(body).hexdigest()
        for received in (body[:-1], body + b"extra", b"x" * len(body)):
            with self.subTest(received=received):
                self.connection.getresponse.return_value = Response(200, received)
                with self.assertRaises(offsite.OffsiteError):
                    self.client.verify(self.name, digest, len(body))
        self.connection.getresponse.return_value = Response(200, body)
        self.client.verify(self.name, digest, len(body))

    def test_uploaded_checksum_is_uppercase_and_content_is_binary(self):
        with tempfile.TemporaryDirectory() as folder:
            archive = Path(folder) / "backup.gpg"
            content = b"binary encrypted bytes\x00\x01\xff"
            archive.write_bytes(content)
            digest = hashlib.sha256(content).hexdigest()
            self.connection.getresponse.return_value = Response(201, b'{}')
            self.client.upload(self.name, archive, digest)
            self.connection.putheader.assert_any_call("Checksum", digest.upper())
            self.connection.putheader.assert_any_call("Content-Length", str(len(content)))
            self.connection.send.assert_called_once_with(content)

    def test_listing_limits_and_json_errors(self):
        for content in (b"not json", b"{}", b"[null]"):
            self.connection.getresponse.return_value = Response(200, content)
            with self.assertRaises(offsite.OffsiteError):
                self.client.list_archives()
        self.connection.getresponse.return_value = Response(200, b"x" * 65)
        with mock.patch.object(offsite, "MAX_LIST_BYTES", 64), self.assertRaises(offsite.OffsiteError):
            self.client.list_archives()

    def test_missing_directory_allowed_only_before_upload(self):
        self.connection.getresponse.return_value = Response(404)
        self.assertEqual(self.client.list_archives(missing_ok=True), [])
        with self.assertRaises(offsite.OffsiteError):
            self.client.list_archives()

    def test_delete_cannot_target_directory_or_traversal(self):
        for name in ("", "../other-file", self.name + "/", "operator-notes.txt"):
            with self.subTest(name=name), self.assertRaises(offsite.OffsiteError):
                self.client.delete(name)
        self.factory.assert_not_called()

    def test_transient_errors_retry_only_twice(self):
        self.connection.getresponse.side_effect = [Response(503), Response(503)]
        with mock.patch.object(offsite.time, "sleep"), self.assertRaises(offsite.OffsiteError):
            self.client.list_archives()
        self.assertEqual(self.factory.call_count, 2)

    def test_expired_total_budget_prevents_network_call(self):
        self.client.deadline = 0
        with self.assertRaises(offsite.OffsiteError):
            self.client.list_archives()
        self.factory.assert_not_called()


if __name__ == "__main__":
    unittest.main()
