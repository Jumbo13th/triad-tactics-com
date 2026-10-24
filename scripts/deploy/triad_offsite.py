#!/usr/bin/env python3
"""Upload an already encrypted backup to a private Bunny Storage zone.

Only the GitHub backup runner needs the storage password. No secret values or HTTP
response bodies are logged. A completed upload is read back before remote pruning.
The caller must check successful GPG encryption before passing its output here;
this module cannot prove encryption without the separately held recovery secret.
"""

import argparse
import datetime as dt
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import stat
import sys
import time


PREFIX = "triad-backups/v1"
STAMP_TEXT = r"\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z"
ARCHIVE_NAME = re.compile(rf"deployment-({STAMP_TEXT})\.tar\.gz\.gpg\Z")
ENDPOINTS = {"storage.bunnycdn.com", *(f"{region}.storage.bunnycdn.com" for region in
             ("uk", "ny", "la", "sg", "se", "br", "jh", "syd"))}
MAX_ARCHIVE_BYTES = 2 * 1024**3
MAX_LIST_BYTES = 4 * 1024**2
MAX_LIST_ENTRIES = 10000
MAX_DELETIONS = 100
TOTAL_SECONDS = 480
SOCKET_SECONDS = 20
CHUNK = 1024 * 1024


class OffsiteError(RuntimeError):
    """An intentionally non-sensitive error suitable for the Actions log."""


class _Retryable(OffsiteError):
    pass


def parse_stamp(value):
    if not isinstance(value, str) or not re.fullmatch(STAMP_TEXT, value):
        raise OffsiteError("Invalid backup timestamp")
    try:
        return dt.datetime.strptime(value, "%Y-%m-%dT%H-%M-%S-%fZ").replace(tzinfo=dt.timezone.utc)
    except ValueError:
        raise OffsiteError("Invalid backup timestamp") from None


def utc_now(now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    if not isinstance(now, dt.datetime) or now.tzinfo is None:
        raise OffsiteError("Backup retention requires an aware UTC clock")
    return now.astimezone(dt.timezone.utc)


def validate_config(config):
    if not isinstance(config, dict):
        raise OffsiteError("Missing Bunny Storage configuration")
    zone, endpoint, password = (config.get(key) for key in ("zone", "endpoint", "password"))
    if not isinstance(zone, str) or not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,62}", zone):
        raise OffsiteError("Invalid Bunny Storage zone name")
    if not isinstance(endpoint, str) or endpoint not in ENDPOINTS:
        raise OffsiteError("Storage endpoint must be an official Bunny Storage hostname")
    if not isinstance(password, str) or not 16 <= len(password) <= 256 or any(
            ord(char) < 33 or ord(char) > 126 for char in password):
        raise OffsiteError("Invalid Bunny Storage password")
    return {"zone": zone, "endpoint": endpoint, "password": password}


def remaining(deadline):
    seconds = deadline - time.monotonic()
    if seconds <= 0:
        raise OffsiteError("Offsite backup exceeded its time budget")
    return seconds


def _safe_archive(archive):
    archive = Path(archive).absolute()
    if any(part.is_symlink() for part in (archive, *archive.parents)):
        raise OffsiteError("Encrypted archive paths must not contain symlinks")
    try:
        info = archive.stat()
    except OSError:
        raise OffsiteError("Encrypted archive is unavailable") from None
    if not stat.S_ISREG(info.st_mode) or not 16 < info.st_size <= MAX_ARCHIVE_BYTES:
        raise OffsiteError("Encrypted archive is not a regular file within the size limit")
    return archive


def archive_digest(archive):
    archive = _safe_archive(archive)
    with archive.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest(), archive.stat().st_size


def retention_plan(entries, zone, now=None):
    """Return only old archive basenames in our directory; always keep newest ten.

    Bunny's Path metadata is never used as a URL. Unknown files, directories, bad
    dates and future archives cannot be deleted or count toward the ten survivors.
    """
    now = utc_now(now)
    if not isinstance(entries, list) or len(entries) > MAX_LIST_ENTRIES:
        raise OffsiteError("Invalid or oversized Bunny directory listing")
    paths = {f"/{zone}/{PREFIX}/", f"/{PREFIX}/"}
    candidates, seen = [], set()
    for entry in entries:
        if not isinstance(entry, dict):
            raise OffsiteError("Invalid Bunny directory entry")
        name = entry.get("ObjectName")
        if not isinstance(name, str):
            raise OffsiteError("Invalid Bunny object name")
        if name in seen:
            raise OffsiteError("Duplicate Bunny directory entry; refusing retention")
        seen.add(name)
        match = ARCHIVE_NAME.fullmatch(name)
        if (not match or entry.get("IsDirectory") is not False or entry.get("Path") not in paths
                or entry.get("StorageZoneName", zone) != zone):
            continue
        try:
            timestamp = parse_stamp(match[1])
        except OffsiteError:
            continue
        if timestamp <= now:
            candidates.append((timestamp, name))
    candidates.sort(reverse=True)
    cutoff = now - dt.timedelta(days=30)
    return [name for timestamp, name in reversed(candidates[10:]) if timestamp < cutoff][:MAX_DELETIONS]


class BunnyClient:
    def __init__(self, config, *, deadline=None):
        self.config = validate_config(config)
        self.directory = f"/{self.config['zone']}/{PREFIX}/"
        self.deadline = deadline if deadline is not None else time.monotonic() + TOTAL_SECONDS

    def _path(self, name):
        if not isinstance(name, str) or not ARCHIVE_NAME.fullmatch(name):
            raise OffsiteError("Refusing a remote path outside the backup archive namespace")
        return self.directory + name

    def _attempt(self, operation):
        for attempt in range(2):
            remaining(self.deadline)
            try:
                return operation()
            except (OSError, http.client.HTTPException, _Retryable):
                if attempt:
                    raise OffsiteError("Bunny Storage request failed after bounded retries") from None
                time.sleep(min(2, remaining(self.deadline)))

    def _request(self, method, path, *, archive=None, digest=None, expected=200,
                 missing=False, download=None):
        """Do not follow redirects or include response content in exceptions."""
        def operation():
            connection = http.client.HTTPSConnection(
                self.config["endpoint"], timeout=min(SOCKET_SECONDS, remaining(self.deadline)))
            try:
                headers = {"AccessKey": self.config["password"], "Accept": "application/json"}
                if archive is not None:
                    headers.update({"Content-Type": "application/octet-stream",
                                    "Content-Length": str(archive.stat().st_size),
                                    "Checksum": digest.upper()})
                connection.putrequest(method, path)
                for key, value in headers.items():
                    connection.putheader(key, value)
                connection.endheaders()
                if archive is not None:
                    with archive.open("rb") as source:
                        while chunk := source.read(CHUNK):
                            remaining(self.deadline)
                            connection.send(chunk)
                response = connection.getresponse()
                if response.status == 404 and missing:
                    return None
                if response.status in (408, 429, 500, 502, 503, 504):
                    raise _Retryable("Bunny Storage temporarily unavailable")
                if response.status != expected:
                    raise OffsiteError(f"Bunny Storage {method} returned HTTP {response.status}")
                limit = download[1] if download is not None else MAX_LIST_BYTES
                digest_read = hashlib.sha256()
                body, size = bytearray(), 0
                while True:
                    remaining(self.deadline)
                    chunk = response.read(min(CHUNK, limit - size + 1))
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > limit:
                        raise OffsiteError("Bunny Storage response exceeded its expected size")
                    if download is not None:
                        digest_read.update(chunk)
                    else:
                        body.extend(chunk)
                if download is not None:
                    if size != download[1] or digest_read.hexdigest() != download[0]:
                        raise OffsiteError("Downloaded backup checksum or length did not match")
                    return True
                return bytes(body)
            finally:
                connection.close()
        return self._attempt(operation)

    def list_archives(self, *, missing_ok=False):
        body = self._request("GET", self.directory, missing=missing_ok)
        if body is None:
            return []
        try:
            entries = json.loads(body)
        except (ValueError, UnicodeError):
            raise OffsiteError("Invalid Bunny directory listing JSON") from None
        if not isinstance(entries, list) or len(entries) > MAX_LIST_ENTRIES:
            raise OffsiteError("Invalid or oversized Bunny directory listing")
        if any(not isinstance(entry, dict) or not isinstance(entry.get("ObjectName"), str)
               for entry in entries):
            raise OffsiteError("Invalid Bunny directory entry")
        return entries

    def upload(self, name, archive, digest):
        self._request("PUT", self._path(name), archive=archive, digest=digest, expected=201)

    def verify(self, name, digest, size):
        self._request("GET", self._path(name), download=(digest, size))

    def delete(self, name):
        self._request("DELETE", self._path(name))


def upload_archive(archive, stamp, config, now=None):
    """Upload one encrypted archive, verify full readback, then apply retention.

    Existing names are refused: rerunning encryption generates different bytes.
    Within one run, retries resend exactly the same ciphertext. The caller must
    serialize jobs; Bunny does not provide conditional create or immutable objects.
    """
    now = utc_now(now)
    if parse_stamp(stamp) > now:
        raise OffsiteError("Refusing a future-dated backup")
    archive = _safe_archive(archive)
    digest, size = archive_digest(archive)
    name = f"deployment-{stamp}.tar.gz.gpg"
    client = BunnyClient(config)
    existing = client.list_archives(missing_ok=True)
    if any(entry["ObjectName"] == name for entry in existing):
        raise OffsiteError("Remote backup name already exists; refusing to overwrite it")
    client.upload(name, archive, digest)
    client.verify(name, digest, size)
    entries = client.list_archives()
    current = [entry for entry in entries if entry["ObjectName"] == name]
    if len(current) != 1 or current[0].get("IsDirectory") is not False:
        raise OffsiteError("Verified backup is absent or ambiguous in the directory listing")
    deleted = retention_plan(entries, client.config["zone"], now)
    for old_name in deleted:
        client.delete(old_name)
    return {"timestamp": stamp, "sha256": digest, "bytes": size,
            "remote_path": f"{PREFIX}/{name}", "deleted": len(deleted)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("stamp")
    args = parser.parse_args()
    config = {"zone": os.environ.get("BUNNY_STORAGE_ZONE"),
              "endpoint": os.environ.get("BUNNY_STORAGE_ENDPOINT"),
              "password": os.environ.get("BUNNY_STORAGE_PASSWORD")}
    try:
        print(json.dumps(upload_archive(args.archive, args.stamp, config)))
    except OffsiteError as error:
        # Only these deliberately sanitized messages may reach an Actions log.
        print(f"Offsite backup failed: {error}", file=sys.stderr)
        return 1
    except OSError:
        print("Offsite backup failed while reading its encrypted archive.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
