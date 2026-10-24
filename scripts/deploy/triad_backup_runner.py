#!/usr/bin/env python3
"""GitHub runner: stream a restricted VPS export into GPG, then verify its upload.

Plaintext backup data never goes to a runner file. SSH credentials and ciphertext
exist only in a private temporary directory that is removed on success or failure.
"""

import base64
from dataclasses import dataclass
import datetime as dt
import ipaddress
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import time

from triad_offsite import MAX_ARCHIVE_BYTES, OffsiteError, upload_archive, validate_config


TRANSFER_SECONDS = 480
SPACE_MARGIN = 64 * 1024**2


class RunnerError(RuntimeError):
    """Sanitized operational error; never include credentials or process output."""


@dataclass(frozen=True, repr=False)
class Configuration:
    host: str
    key: str
    known_hosts: str
    passphrase: str
    bunny: dict


def validate_environment(environment):
    host = environment.get("DEPLOY_HOST", "")
    if not isinstance(host, str) or not 1 <= len(host) <= 253:
        raise RunnerError("DEPLOY_HOST is missing or invalid")
    try:
        ipaddress.ip_address(host)
    except ValueError:
        if not all(re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?", label)
                   for label in host.split(".")):
            raise RunnerError("DEPLOY_HOST must be a plain hostname or IP address") from None
    key = environment.get("DEPLOY_SSH_KEY", "")
    if (not isinstance(key, str) or not 64 <= len(key) <= 65536 or "\x00" in key
            or not key.strip().startswith("-----BEGIN OPENSSH PRIVATE KEY-----")
            or not key.strip().endswith("-----END OPENSSH PRIVATE KEY-----")):
        raise RunnerError("DEPLOY_SSH_KEY must contain the dedicated OpenSSH private key")
    known = environment.get("DEPLOY_KNOWN_HOSTS", "")
    if not isinstance(known, str) or not 1 <= len(known) <= 65536 or "\x00" in known:
        raise RunnerError("DEPLOY_KNOWN_HOSTS is missing or invalid")
    found = False
    for line in known.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        parts = line.split()
        if len(parts) < 3 or parts[1] not in {
                "ssh-ed25519", "ssh-rsa", "ecdsa-sha2-nistp256", "ecdsa-sha2-nistp384",
                "ecdsa-sha2-nistp521"}:
            raise RunnerError("DEPLOY_KNOWN_HOSTS must contain pinned SSH host keys")
        try:
            if not base64.b64decode(parts[2], validate=True):
                raise ValueError
        except ValueError:
            raise RunnerError("DEPLOY_KNOWN_HOSTS contains an invalid host key") from None
        found = True
    if not found:
        raise RunnerError("DEPLOY_KNOWN_HOSTS does not contain a pinned host key")
    passphrase = environment.get("BACKUP_ENCRYPTION_PASSPHRASE", "")
    if (not isinstance(passphrase, str) or not 32 <= len(passphrase) <= 1024
            or not passphrase.isprintable() or passphrase.isspace()
            or len(passphrase.encode("utf-8")) > 4096):
        raise RunnerError("BACKUP_ENCRYPTION_PASSPHRASE must be a single printable line of at least 32 characters")
    bunny = validate_config({"zone": environment.get("BUNNY_STORAGE_ZONE") or "triad-tactics-com",
                             "endpoint": environment.get("BUNNY_STORAGE_ENDPOINT") or "storage.bunnycdn.com",
                             "password": environment.get("BUNNY_STORAGE_PASSWORD")})
    return Configuration(host, key, known, passphrase, bunny)


def _private_file(path, content):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as stream:
        stream.write(content.replace("\r\n", "\n").rstrip("\n") + "\n")


def _tools():
    result = {name: shutil.which(name) for name in ("ssh", "ssh-keygen", "gpg", "gpgconf")}
    if not all(result.values()):
        raise RunnerError("The backup runner requires OpenSSH and GnuPG")
    return result


def _validate_ssh_material(config, key, known, executables, environment):
    commands = ([executables["ssh-keygen"], "-y", "-P", "", "-f", str(key)],
                [executables["ssh-keygen"], "-F", config.host, "-f", str(known)])
    for command in commands:
        result = subprocess.run(command, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                stderr=subprocess.DEVNULL, env=environment, timeout=10, check=False)
        if result.returncode:
            raise RunnerError("The deployment key or pinned host entry failed local validation")


def _ssh_command(config, key, known, executables):
    return [executables["ssh"], "-F", "/dev/null", "-T", "-i", str(key),
            "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes", "-o", "IdentityAgent=none",
            "-o", "StrictHostKeyChecking=yes", "-o", f"UserKnownHostsFile={known}",
            "-o", "GlobalKnownHostsFile=/dev/null", "-o", "PasswordAuthentication=no",
            "-o", "KbdInteractiveAuthentication=no", "-o", "ConnectTimeout=20",
            "-o", "ConnectionAttempts=1", "-o", "ServerAliveInterval=15",
            "-o", "ServerAliveCountMax=2", "-o", "ClearAllForwardings=yes",
            "-o", "PermitLocalCommand=no", "-o", "LogLevel=ERROR",
            f"root@{config.host}", "backup-export"]


def _stop_process_group(process):
    if process is None:
        return
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    try:
        process.wait(timeout=3)
    except subprocess.TimeoutExpired:
        pass
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    try:
        process.wait(timeout=3)
    except subprocess.TimeoutExpired:
        # A stuck process must not prevent cleanup of the other pipeline member.
        pass


def encrypt_export(config, archive, key, known, executables, environment):
    """Connect SSH stdout directly to GPG stdin; accept only both successful exits."""
    deadline = time.monotonic() + TRANSFER_SECONDS
    ssh = gpg = None
    pass_read, pass_write = os.pipe()
    try:
        descriptor = os.open(archive, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "wb") as encrypted:
            command = [executables["gpg"], "--no-options", "--batch", "--yes",
                       "--pinentry-mode", "loopback", "--no-symkey-cache", "--passphrase-fd",
                       str(pass_read), "--symmetric", "--cipher-algo", "AES256",
                       "--compress-algo", "none", "--s2k-mode", "3", "--s2k-digest-algo", "SHA512"]
            gpg = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=encrypted,
                                   stderr=subprocess.DEVNULL, pass_fds=(pass_read,),
                                   env=environment, start_new_session=True)
            os.close(pass_read)
            pass_read = None
            secret = (config.passphrase + "\n").encode("utf-8")
            while secret:
                secret = secret[os.write(pass_write, secret):]
            os.close(pass_write)
            pass_write = None
            ssh = subprocess.Popen(_ssh_command(config, key, known, executables),
                                   stdin=subprocess.DEVNULL, stdout=gpg.stdin,
                                   stderr=subprocess.DEVNULL, env=environment, start_new_session=True)
            gpg.stdin.close()
            while True:
                ssh_status, gpg_status = ssh.poll(), gpg.poll()
                if ssh_status not in (None, 0):
                    raise RunnerError(f"Backup export failed (SSH exit {ssh_status})")
                if gpg_status not in (None, 0):
                    raise RunnerError(f"Backup encryption failed (GPG exit {gpg_status})")
                if archive.stat().st_size > MAX_ARCHIVE_BYTES:
                    raise RunnerError("Encrypted backup exceeded the configured size limit")
                if ssh_status == 0 and gpg_status == 0:
                    break
                if time.monotonic() >= deadline:
                    raise RunnerError("Backup export and encryption exceeded their time budget")
                time.sleep(0.1)
        if archive.stat().st_size <= 16:
            raise RunnerError("Backup encryption produced an empty or invalid archive")
    finally:
        for descriptor in (pass_read, pass_write):
            if descriptor is not None:
                os.close(descriptor)
        for process in (ssh, gpg):
            _stop_process_group(process)
        if gpg is not None and gpg.stdin is not None:
            gpg.stdin.close()


def run_backup(environment=None, now=None):
    configuration = validate_environment(os.environ if environment is None else environment)
    executables = _tools()
    timestamp = now or dt.datetime.now(dt.timezone.utc)
    if timestamp.tzinfo is None:
        raise RunnerError("Backup creation requires a timezone-aware clock")
    stamp = timestamp.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H-%M-%S-%f")[:-3] + "Z"
    with tempfile.TemporaryDirectory(prefix="triad-offsite-") as directory:
        private = Path(directory)
        private.chmod(0o700)
        if shutil.disk_usage(private).free < MAX_ARCHIVE_BYTES + SPACE_MARGIN:
            raise RunnerError("The runner lacks sufficient temporary space for an encrypted backup")
        key, known = private / "deploy_key", private / "known_hosts"
        _private_file(key, configuration.key)
        _private_file(known, configuration.known_hosts)
        gnupg = private / "gnupg"
        gnupg.mkdir(mode=0o700)
        # No Actions tokens, Bunny credentials or encryption secrets are inherited.
        child_environment = {"PATH": "/usr/bin:/bin", "HOME": str(private), "GNUPGHOME": str(gnupg),
                             "TMPDIR": str(private), "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8"}
        try:
            _validate_ssh_material(configuration, key, known, executables, child_environment)
            archive = private / f"deployment-{stamp}.tar.gz.gpg"
            encrypt_export(configuration, archive, key, known, executables, child_environment)
            return upload_archive(archive, stamp, configuration.bunny)
        finally:
            # GnuPG's agent can outlive its parent process group. Scope cleanup to
            # this unique GNUPGHOME before deleting its socket and metadata files.
            subprocess.run([executables["gpgconf"], "--kill", "all"], env=child_environment,
                           stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                           stderr=subprocess.DEVNULL, timeout=10, check=False)


def _interrupt(signum, frame):
    raise RunnerError("Backup job was interrupted")


def main():
    previous = {sig: signal.signal(sig, _interrupt) for sig in (signal.SIGTERM, signal.SIGINT)}
    try:
        metadata = run_backup()
        print(json.dumps(metadata))
        summary = os.environ.get("GITHUB_STEP_SUMMARY")
        if summary:
            with open(summary, "a", encoding="utf-8") as stream:
                stream.write("Verified encrypted backup uploaded to Bunny Storage.\n\n")
                stream.write(f"Archive: `{metadata['remote_path']}`  \n")
                stream.write(f"UTC timestamp: `{metadata['timestamp']}`  \n")
                stream.write(f"Encrypted bytes: {metadata['bytes']}  \n")
                stream.write(f"SHA-256: `{metadata['sha256']}`  \n")
                stream.write(f"Expired archives removed: {metadata['deleted']}\n")
        return 0
    except (RunnerError, OffsiteError) as error:
        print(f"Offsite backup failed: {error}", file=sys.stderr)
        return 1
    except (OSError, subprocess.SubprocessError):
        print("Offsite backup failed during a local operation; private diagnostics were suppressed.", file=sys.stderr)
        return 1
    finally:
        for sig, handler in previous.items():
            signal.signal(sig, handler)


if __name__ == "__main__":
    sys.exit(main())
