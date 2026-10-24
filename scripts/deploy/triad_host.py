#!/usr/bin/env python3
"""Installed, root-owned deployment entrypoint. Requires Python 3.12 and Docker Compose."""

import argparse
import contextlib
import datetime as dt
import fcntl
import hashlib
import io
import json
import os
from pathlib import Path
import re
import select
import shutil
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
import time


SITE = Path("/opt/triad-tactics")
PROJECT = "triad-tactics"
IMAGE = "ghcr.io/jumbo13th/triad-tactics-com"
HOST = "triad-tactics.com"
SERVICES = ("app", "nginx", "cron")
RETAIN = 10
SHA = re.compile(r"[0-9a-f]{40}\Z")
DIGEST = re.compile(r"sha256:[0-9a-f]{64}\Z")
STAMP_TEXT = r"\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z"
DB_NAME = re.compile(rf"applications-({STAMP_TEXT})\.db\Z")
BUNDLE_NAME = re.compile(rf"deployment-({STAMP_TEXT})\Z")
ORIGINS = {"https://github.com/Jumbo13th/triad-tactics-com.git",
           "https://github.com/Jumbo13th/triad-tactics-com",
           "git@github.com:Jumbo13th/triad-tactics-com.git"}


class Refused(RuntimeError):
    pass


def log(message):
    print(message, flush=True)


def run(args, *, input=None, capture=False, check=True, timeout=600):
    """Never invoke a shell or log arguments: some commands read private configuration."""
    result = subprocess.run([str(arg) for arg in args], input=input, text=True,
                            stdout=subprocess.PIPE if capture else None,
                            stderr=subprocess.PIPE if capture else None, timeout=timeout)
    if check and result.returncode:
        # Compose can expand environment values into diagnostics. Keep those out of CI logs.
        raise Refused(f"{args[0]} failed (exit {result.returncode}); inspect the host privately")
    return result.stdout if capture else result.returncode


def bounded(path, root):
    """Reject symlink components, including the target, before a filesystem mutation."""
    root, path = Path(root).absolute(), Path(path).absolute()
    if path == root or not path.is_relative_to(root):
        raise Refused(f"Path is outside its permitted parent: {path}")
    for ancestor in (path, *path.parents):
        if ancestor.is_symlink():
            raise Refused(f"Symlink is not permitted: {ancestor}")
    if not path.resolve().is_relative_to(root.resolve()):
        raise Refused(f"Resolved path escaped its permitted parent: {path}")
    return path


def private_dir(path):
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    if path.is_symlink():
        raise Refused(f"Symlink directory is not permitted: {path}")
    path.chmod(0o700)


def write_json(path, value):
    temp = path.with_suffix(path.suffix + ".tmp")
    bounded(temp, path.parent)
    with temp.open("w", encoding="utf-8") as stream:
        json.dump(value, stream, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    temp.chmod(0o600)
    temp.replace(path)


def checksum(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def verify_db(path):
    with contextlib.closing(sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True)) as db:
        if db.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
            raise Refused(f"SQLite integrity check failed: {path}")


def stamp():
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H-%M-%S-%f")[:-3] + "Z"


def valid_stamp(value):
    try:
        dt.datetime.strptime(value, "%Y-%m-%dT%H-%M-%S-%fZ")
    except ValueError as error:
        raise Refused(f"Invalid backup timestamp: {value}") from error
    return value


def collect_backups(backup_root, volume_root):
    """Group legacy copies and deployment bundles by their existing UTC timestamp."""
    groups = {}
    roots = [(backup_root, DB_NAME), (backup_root / "backups", DB_NAME), (volume_root / "backups", DB_NAME),
             (backup_root, BUNDLE_NAME)]
    for root, pattern in roots:
        bounded(root, root.parent)
        if not root.exists():
            continue
        for path in root.iterdir():
            match = pattern.fullmatch(path.name)
            if not match:
                continue
            bounded(path, root)
            key = valid_stamp(match[1])
            if pattern is BUNDLE_NAME:
                if not path.is_dir():
                    raise Refused(f"Expected a deployment backup directory: {path}")
                # Refuse the entire plan before deleting anything if a bundle contains links.
                for child in path.rglob("*"):
                    bounded(child, path)
                candidates = [p for p in path.rglob("*.db") if p.is_file()]
            else:
                if not path.is_file():
                    raise Refused(f"Expected a database backup file: {path}")
                for suffix in (".sha256", ".json"):
                    bounded(Path(str(path) + suffix), root)
                candidates = [path]
            group = groups.setdefault(key, {"paths": [], "databases": []})
            group["paths"].append((path, root))
            group["databases"].extend(candidates)
    return groups


def retention_plan(backup_root, volume_root, newest_verified):
    groups = collect_backups(backup_root, volume_root)
    if newest_verified not in groups:
        raise Refused("The fresh verified backup is missing; no cleanup is allowed")
    keys = sorted(groups, reverse=True)
    if keys[0] != newest_verified:
        raise Refused("A future-dated backup exists; check host time before cleanup")
    keep = keys[:RETAIN]
    for key in keep:
        if not groups[key]["databases"]:
            raise Refused(f"Backup set has no database: {key}")
        for path in groups[key]["databases"]:
            verify_db(path)
    return keep, [item for key in keys[RETAIN:] for item in groups[key]["paths"]]


def prune_backups(backup_root, volume_root, newest_verified, *, dry_run=False):
    keep, remove = retention_plan(backup_root, volume_root, newest_verified)
    for path, root in remove:
        bounded(path, root)
        log(f"{'Would remove' if dry_run else 'Removing'} expired backup {path}")
        if not dry_run:
            if path.is_dir():
                shutil.rmtree(path)
            else:
                path.unlink()
                for suffix in (".sha256", ".json"):
                    sidecar = Path(str(path) + suffix)
                    bounded(sidecar, root)
                    if sidecar.is_file():
                        sidecar.unlink()
    log(f"Backup retention: {len(keep)} snapshot sets retained (maximum {RETAIN})")


def parse_request(command):
    if command == "backup-export":
        return "backup-export", None, None
    match = re.fullmatch(r"deploy ([0-9a-f]{40}) (sha256:[0-9a-f]{64})", command)
    if not match:
        raise Refused("Only 'backup-export' or 'deploy <commit SHA> <image digest>' is permitted")
    return "deploy", match[1], match[2]


def removable_references(image, protected):
    if image["Id"] in protected:
        return []
    tags = image.get("RepoTags") or []
    allowed = [tag for tag in tags if tag.startswith((IMAGE + ":", PROJECT + "-app:",
                                                      PROJECT + "-nginx:", PROJECT + "-cron:",
                                                      "nginx:", "alpine:"))]
    if allowed:
        return allowed
    digests = image.get("RepoDigests") or []
    labels = (image.get("Config") or {}).get("Labels") or {}
    official_repositories = {
        domain + namespace + name
        for domain in ("", "docker.io/", "index.docker.io/")
        for namespace in ("", "library/")
        for name in ("nginx", "alpine")
    }
    if not tags and any(ref.partition("@")[0] in official_repositories
                        and DIGEST.fullmatch(ref.partition("@")[2]) for ref in digests):
        return [image["Id"]]
    if any(ref.startswith(IMAGE + "@") for ref in digests) or labels.get("com.docker.compose.project") == PROJECT:
        return [image["Id"]]
    return []


def read_registry_credentials(stream):
    data = bytearray()
    deadline = time.monotonic() + 15
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0 or not select.select([stream], [], [], remaining)[0]:
            raise Refused("Registry credential input timed out")
        chunk = os.read(stream.fileno(), 4096)
        if not chunk:
            break
        data.extend(chunk)
        if len(data) > 8192:
            raise Refused("Registry credential input is too long")
    try:
        value = json.loads(data)
    except (ValueError, UnicodeDecodeError) as error:
        raise Refused("Registry input must be JSON") from error
    if not isinstance(value, dict) or set(value) != {"username", "token"}:
        raise Refused("Registry input must contain only username and token")
    if not isinstance(value["username"], str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9-]{0,38}(?:\[bot\])?", value["username"]):
        raise Refused("Invalid registry username")
    if not isinstance(value["token"], str) or not re.fullmatch(r"[A-Za-z0-9_]{20,4096}", value["token"]):
        raise Refused("Invalid registry token")
    return value


class Host:
    def __init__(self, site=SITE, dry_run=False):
        self.site = Path(site)
        bounded(self.site, self.site.parent)
        self.backups = bounded(self.site / "backups", self.site)
        self.control = bounded(self.site / ".deploy", self.site)
        self.dry_run = dry_run
        self.docker_config = None

    def docker(self, *args, **kwargs):
        config = ["--config", self.docker_config] if self.docker_config else []
        return run(["docker", *config, *args], **kwargs)

    def inspect(self, kind, target):
        return json.loads(self.docker(kind, "inspect", target, capture=True))[0]

    def containers(self):
        result = {}
        for service in SERVICES:
            ids = self.docker("ps", "-q", "--filter", f"label=com.docker.compose.project={PROJECT}",
                              "--filter", f"label=com.docker.compose.service={service}", capture=True).split()
            if len(ids) != 1:
                raise Refused(f"Expected exactly one running {service} container")
            result[service] = self.inspect("container", ids[0])
        return result

    def volume(self, app):
        mounts = [m for m in app["Mounts"] if m["Destination"] == "/app/database"]
        if len(mounts) != 1 or mounts[0].get("Name") != f"{PROJECT}_db":
            raise Refused("Database mount differs from the protected production volume")
        root = Path(mounts[0]["Source"])
        bounded(root, Path("/var/lib/docker/volumes") / f"{PROJECT}_db")
        bounded(root / "applications.db", root)
        return root

    def state(self):
        path = self.control / "state.json"
        bounded(path, self.control)
        return json.loads(path.read_text()) if path.exists() else None

    def active_release(self):
        state = self.state()
        return Path(state["current"]["release"]) if state else self.site

    def compose(self, release, *args, override=None, **kwargs):
        command = ["docker", "compose", "--project-name", PROJECT,
                   "--env-file", self.site / ".env", "--project-directory", release,
                   "-f", release / "docker-compose.yml"]
        if override:
            command.extend(["-f", override])
        elif (release / "image.override.json").exists():
            command.extend(["-f", release / "image.override.json"])
        return run([*command, *args], **kwargs)

    def check_space(self, needed, directory):
        free = shutil.disk_usage(directory).free
        if free < needed:
            raise Refused(f"Insufficient free disk space at {directory}: {free // 1048576} MiB free; "
                          f"{needed // 1048576} MiB required. Nothing will be deleted without a verified backup.")

    def backup(self, containers, full=False):
        volume = self.volume(containers["app"])
        db_size = (volume / "applications.db").stat().st_size
        self.check_space(max(512 * 1024**2, db_size * 3 + 256 * 1024**2), self.site)
        self.check_space(max(256 * 1024**2, db_size * 2), volume)
        key = stamp()
        if self.dry_run:
            log(f"Would create and verify backup set {key}; no data changed")
            return None
        private_dir(self.backups)
        canonical = bounded(self.backups / "backups", self.backups)
        private_dir(canonical)
        target = bounded(canonical / f"applications-{key}.db", canonical)
        partial = target.with_suffix(".db.partial")
        bundle_final = bounded(self.backups / f"deployment-{key}", self.backups)
        bundle = bounded(self.backups / f".deployment-{key}.partial", self.backups)
        if any(path.exists() for path in (target, partial, bundle, bundle_final)):
            raise Refused("Backup timestamp already exists; refusing to overwrite it")
        private_dir(bundle)
        temp_name = f".maintenance-{key}.db"
        temp_host = bounded(volume / "backups" / temp_name, volume)
        node = """
const fs = require('node:fs'); const Database = require('better-sqlite3');
const destination = process.argv[1];
fs.mkdirSync('/app/database/backups', {recursive: true});
if (fs.existsSync(destination)) throw new Error('Backup destination already exists');
const db = new Database('/app/database/applications.db', {readonly: true, fileMustExist: true});
db.backup(destination).then(() => db.close()).catch(error => { db.close(); throw error; });
"""
        try:
            self.docker("exec", containers["app"]["Id"], "node", "-e", node,
                        f"/app/database/backups/{temp_name}", capture=True)
            self.docker("cp", f"{containers['app']['Id']}:/app/database/backups/{temp_name}",
                        partial, capture=True)
            partial.chmod(0o600)
            with contextlib.closing(sqlite3.connect(partial)) as db:
                if db.execute("PRAGMA journal_mode=DELETE").fetchone()[0] != "delete":
                    raise Refused("Cannot normalize the snapshot into a standalone SQLite file")
            verify_db(partial)
            partial.replace(target)
            os.link(target, bundle / "applications.db")
            release = self.active_release()
            for relative in ("docker-compose.yml", "nginx/default.conf", "image.override.json"):
                source = bounded(release / relative, release)
                if source.exists():
                    destination = bundle / relative
                    destination.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
                    shutil.copyfile(source, destination)
                    destination.chmod(0o600)
            env = bounded(self.site / ".env", self.site)
            shutil.copyfile(env, bundle / ".env")
            (bundle / ".env").chmod(0o600)
            previous_state = self.state()
            metadata = {"timestamp": key, "sha256": checksum(target), "bytes": target.stat().st_size,
                        "images": {s: c["Image"] for s, c in containers.items()},
                        "state": previous_state,
                        "commit": previous_state["current"]["commit"] if previous_state else
                        run(["git", "-C", self.site, "rev-parse", "HEAD"], capture=True).strip()}
            if full:
                run(["git", "-C", self.site, "archive", "--format=tar.gz",
                     f"--output={bundle / 'source.tar.gz'}", metadata["commit"]], capture=True)
                # Store host certificates without dereferencing their renewal symlinks.
                certs = Path("/etc/letsencrypt")
                if certs.is_dir():
                    with tarfile.open(bundle / "tls.tar.gz", "w:gz", dereference=False) as tar:
                        tar.add(certs, arcname="letsencrypt")
            write_json(bundle / "manifest.json", metadata)
            (target.with_suffix(".db.sha256")).write_text(f"{metadata['sha256']}  {target.name}\n")
            (target.with_suffix(".db.sha256")).chmod(0o600)
            bundle.rename(bundle_final)
            log(f"Verified backup: {target} (SHA-256 {metadata['sha256']})")
            return key, bundle_final, volume
        finally:
            # A failed snapshot must never consume more space on each timer retry.
            if temp_host.exists():
                bounded(temp_host, volume).unlink()
            for path in (partial, Path(str(partial) + "-wal"), Path(str(partial) + "-shm"),
                         Path(str(temp_host) + "-wal"), Path(str(temp_host) + "-shm")):
                if path.exists():
                    bounded(path, canonical if path.parent == canonical else volume).unlink()
            if bundle.exists():
                bounded(bundle, self.backups)
                shutil.rmtree(bundle)

    def protect_rollback(self, containers):
        for service, current in containers.items():
            name = f"{PROJECT}-rollback-{service}"
            ids = self.docker("ps", "-aq", "--filter", f"name=^/{name}$", capture=True).split()
            if ids:
                holder = self.inspect("container", ids[0])
                if holder["Config"].get("Labels", {}).get("io.triad.rollback") != "true" or holder["State"]["Running"]:
                    raise Refused(f"Unexpected container occupies rollback holder {name}")
                if holder["Image"] == current["Image"]:
                    continue
                if not self.dry_run:
                    self.docker("container", "rm", name, capture=True)
            if not self.dry_run:
                self.docker("create", "--name", name, "--label", "io.triad.rollback=true",
                            "--entrypoint", "/bin/true", current["Image"], capture=True)
        log("Rollback images protected" if not self.dry_run else "Would protect current images for rollback")

    def ensure_rollback(self, containers):
        holders = []
        for service in SERVICES:
            name = f"{PROJECT}-rollback-{service}"
            ids = self.docker("ps", "-aq", "--filter", f"name=^/{name}$", capture=True).split()
            if ids:
                holder = self.inspect("container", ids[0])
                if holder["Config"].get("Labels", {}).get("io.triad.rollback") != "true" or holder["State"]["Running"]:
                    raise Refused("An unexpected container occupies a rollback holder name")
                holders.append(holder)
        if not holders:
            self.protect_rollback(containers)
        elif len(holders) != len(SERVICES):
            raise Refused("Rollback holders are incomplete; refusing cleanup")

    def prune_docker(self):
        # All containers, including stopped rollback holders and unrelated services, protect their images.
        ids = self.docker("ps", "-aq", capture=True).split()
        protected = {self.inspect("container", item)["Image"] for item in ids}
        for service in SERVICES:
            holder = self.inspect("container", f"{PROJECT}-rollback-{service}")
            if holder["Config"].get("Labels", {}).get("io.triad.rollback") != "true":
                raise Refused("Rollback holders are missing; refusing image cleanup")
        image_ids = set(self.docker("image", "ls", "-aq", capture=True).split())
        for item in sorted(image_ids):
            image = self.inspect("image", item)
            # No --force: Docker independently refuses deletion if another process starts using an image.
            for reference in removable_references(image, protected):
                log(f"{'Would remove' if self.dry_run else 'Removing'} unused image {reference}")
                if not self.dry_run:
                    self.docker("image", "rm", reference, capture=True, check=False)
        if not self.dry_run:
            self.docker("builder", "prune", "--all", "--force", capture=True)
        log("Docker cache cleanup complete" if not self.dry_run else "Would prune unused Docker build cache")

    def maintain(self):
        containers = self.containers()
        snapshot = self.backup(containers)
        if not snapshot:
            log("Dry run: cleanup requires a new verified backup; existing files and images preserved")
            return
        key, _, volume = snapshot
        # Preserve the existing previous release, not today's already-running images.
        self.ensure_rollback(containers)
        prune_backups(self.backups, volume, key)
        self.prune_docker()

    def export_backup(self, output):
        """Stream one fresh full backup to authenticated SSH; stdout contains only the archive."""
        with contextlib.redirect_stdout(sys.stderr):
            snapshot = self.backup(self.containers(), full=True)
            if not snapshot:
                return
            key, bundle, volume = snapshot
            prune_backups(self.backups, volume, key)
            bounded(bundle, self.backups)
            # Validate all members before writing the first archive byte. Do not follow links
            # or export arbitrary paths supplied by the remote caller.
            members = [bundle, *sorted(bundle.rglob("*"))]
            for path in members:
                bounded(path, self.backups if path == bundle else bundle)
                if not (path.is_file() or path.is_dir()):
                    raise Refused("Backup export contains a special file")
            with tarfile.open(fileobj=output, mode="w|gz", dereference=False) as archive:
                for path in members:
                    relative = path.relative_to(bundle)
                    name = "backup" if path == bundle else "backup/" + relative.as_posix()
                    archive.add(path, arcname=name, recursive=False)
            output.flush()
            log(f"Streamed verified full backup {key}")

    def trusted_target(self, commit):
        remote = run(["git", "-C", self.site, "remote", "get-url", "origin"], capture=True).strip()
        if remote not in ORIGINS:
            raise Refused("Repository origin is not the expected GitHub repository")
        if not self.dry_run:
            run(["git", "-C", self.site, "fetch", "--no-tags", "origin",
                 "+refs/heads/main:refs/remotes/origin/main"], capture=True)
        tip = run(["git", "-C", self.site, "rev-parse", "refs/remotes/origin/main"], capture=True).strip()
        if commit != tip:
            raise Refused("Only the current origin/main commit may be deployed; stale runs are refused")
        state = self.state()
        old = state["current"]["commit"] if state else run(
            ["git", "-C", self.site, "rev-parse", "HEAD"], capture=True).strip()
        changed = run(["git", "-C", self.site, "diff", "--name-only", old, commit,
                       "--", "src/platform/db"], capture=True).strip()
        if changed:
            raise Refused("Database implementation changed; deployment needs a reviewed manual migration plan")

    def stage(self, commit, digest):
        releases = bounded(self.control / "releases", self.control)
        private_dir(releases)
        release = bounded(releases / commit, releases)
        if release.exists():
            # Same commit may be rebuilt with new base layers. Never change the active release in place.
            release = bounded(releases / f"{commit}-{digest[7:19]}", releases)
        if release.exists():
            raise Refused("Release staging path already exists; inspect an interrupted deployment")
        private_dir(release)
        archive = subprocess.run(["git", "-C", str(self.site), "archive", commit,
                                  "docker-compose.yml", "nginx/default.conf"],
                                 check=True, stdout=subprocess.PIPE, timeout=60).stdout
        with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
            for member in tar.getmembers():
                destination = bounded(release / member.name, release)
                if member.isdir():
                    private_dir(destination)
                elif member.isfile():
                    destination.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
                    with tar.extractfile(member) as source, destination.open("xb") as output:
                        shutil.copyfileobj(source, output)
                    destination.chmod(0o600)
                else:
                    raise Refused("Release archive contains a link or special file")
        write_json(release / "image.override.json", {"services": {"app": {"image": IMAGE + "@" + digest}}})
        return release

    def wait_app(self):
        code = "Promise.all(['/en','/api/games/current','/api/units'].map(async p=>{const r=await fetch('http://127.0.0.1:3000'+p);if(!r.ok)throw Error('HTTP '+r.status)})).catch(()=>process.exit(1))"
        for _ in range(30):
            ids = self.docker("ps", "-q", "--filter", f"label=com.docker.compose.project={PROJECT}",
                              "--filter", "label=com.docker.compose.service=app", capture=True).split()
            if len(ids) == 1 and self.docker("exec", ids[0], "node", "-e", code,
                                           capture=False, check=False, timeout=15) == 0:
                return
            time.sleep(3)
        raise Refused("Application did not become ready within 90 seconds")

    def wait_cron(self):
        for _ in range(30):
            ids = self.docker("ps", "-q", "--filter", f"label=com.docker.compose.project={PROJECT}",
                              "--filter", "label=com.docker.compose.service=cron", capture=True).split()
            if len(ids) == 1:
                output = self.docker("exec", ids[0], "curl", "--version", capture=True, check=False, timeout=15)
                if output.startswith("curl "):
                    return
            time.sleep(3)
        raise Refused("Cron did not finish installing curl within 90 seconds")

    def health_once(self):
        html = None
        for route in ("/en", "/ru", "/api/games/current", "/api/units"):
            body = run(["curl", "--silent", "--show-error", "--fail", "--max-time", "20",
                        "--resolve", f"{HOST}:443:127.0.0.1", f"https://{HOST}{route}"], capture=True)
            if route == "/en":
                html = body
            elif route.startswith("/api/"):
                try:
                    json.loads(body)
                except ValueError as error:
                    raise Refused("API smoke check did not return JSON") from error
        asset = re.search(r'(/_next/static/[^"\s<>]+\.js)', html or "")
        if not asset:
            raise Refused("No JavaScript asset found in the deployed page")
        run(["curl", "--silent", "--show-error", "--fail", "--max-time", "20",
             "--resolve", f"{HOST}:443:127.0.0.1", f"https://{HOST}{asset[1]}"], capture=True)
        redirect = run(["curl", "--silent", "--show-error", "--max-time", "20", "--output", "/dev/null",
                        "--write-out", "%{http_code} %{redirect_url}", "--resolve", f"{HOST}:80:127.0.0.1",
                        f"http://{HOST}/en"], capture=True)
        if redirect.strip() != f"301 https://{HOST}/en":
            raise Refused("HTTP to HTTPS redirect failed")

    def health(self):
        for attempt in range(6):
            try:
                self.health_once()
                break
            except Refused:
                if attempt == 5:
                    raise
                time.sleep(3)
        log("HTTPS pages, JSON APIs, and JavaScript asset checks passed")

    def prune_releases(self, keep):
        root = self.control / "releases"
        if not root.exists():
            return
        for path in root.iterdir():
            if path in keep or not re.fullmatch(rf"(?:[0-9a-f]{{40}}(?:-[0-9a-f]{{12}})?|rollback-{STAMP_TEXT})", path.name):
                continue
            bounded(path, root)
            for child in path.rglob("*"):
                bounded(child, path)
            shutil.rmtree(path)

    def deploy(self, commit, digest, credentials=None):
        if not SHA.fullmatch(commit) or not DIGEST.fullmatch(digest):
            raise Refused("Invalid commit or image digest")
        self.trusted_target(commit)
        containers = self.containers()
        current = self.state()
        if current and current["current"]["commit"] == commit and current["current"]["digest"] == digest:
            self.health()
            log("Requested release is already running")
            return
        snapshot = self.backup(containers, full=True)
        if self.dry_run:
            log(f"Would pull {IMAGE}@{digest}, validate, deploy {commit}, and retain one rollback release")
            return
        key, bundle, volume = snapshot
        self.ensure_rollback(containers)
        prune_backups(self.backups, volume, key)
        self.prune_docker()
        self.check_space(3 * 1024**3, Path("/var/lib/docker"))
        release = self.stage(commit, digest)
        image = IMAGE + "@" + digest
        with tempfile.TemporaryDirectory(prefix="triad-registry-") as config:
            os.chmod(config, 0o700)
            self.docker_config = config
            try:
                if credentials:
                    self.docker("login", "ghcr.io", "--username", credentials["username"],
                                "--password-stdin", input=credentials["token"] + "\n", capture=True)
                    credentials["token"] = ""
                self.docker("pull", image, capture=True, timeout=1200)
            finally:
                self.docker_config = None
        labels = self.inspect("image", image)["Config"].get("Labels") or {}
        if labels.get("org.opencontainers.image.revision") != commit:
            raise Refused("Image OCI revision does not match the approved main commit")
        self.compose(release, "pull", "nginx", "cron", capture=True, timeout=600)
        config = json.loads(self.compose(release, "config", "--format", "json", capture=True))
        expected_images = {service: self.inspect("image", config["services"][service]["image"])["Id"]
                           for service in SERVICES}
        del config
        self.docker("run", "--rm", "--network", "none", "--env-file", self.site / ".env",
                    "--env", "NODE_ENV=production", "--entrypoint", "node", image,
                    "scripts/checkRequiredEnv.mjs", capture=True)
        self.docker("run", "--rm", "--network", "none", "--entrypoint", "node", image,
                    "-e", "const d=new(require('better-sqlite3'))(':memory:');d.exec('CREATE TABLE t(x)');d.close()", capture=True)
        self.compose(release, "run", "--rm", "--no-deps", "-T", "--interactive=false", "nginx", "nginx", "-t", capture=True)
        old_images = {service: item["Image"] for service, item in containers.items()}
        rollback_override = bundle / "rollback.override.json"
        write_json(rollback_override, {"services": {s: {"image": i} for s, i in old_images.items()}})
        previous = current["current"] if current else {
            "commit": json.loads((bundle / "manifest.json").read_text())["commit"],
            "release": str(self.site), "digest": None, "images": old_images}
        # A failed rollout can remain in service longer than the ten-backup window.
        # Its runtime configuration must therefore live outside rotating backups.
        rollback_release = bounded(self.control / "releases" / f"rollback-{key}", self.control)
        private_dir(rollback_release)
        for relative in ("docker-compose.yml", "nginx/default.conf"):
            source = bounded(bundle / relative, bundle)
            destination = rollback_release / relative
            destination.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
            shutil.copyfile(source, destination)
            destination.chmod(0o600)
        shutil.copyfile(rollback_override, rollback_release / "image.override.json")
        self.trusted_target(commit)
        cutover_started = False
        try:
            # A failed or timed-out stop can still have stopped the live cron container.
            cutover_started = True
            self.compose(release, "stop", "cron", capture=True)
            self.compose(release, "up", "-d", "--no-build", "--pull", "never", "--no-deps", "app", capture=True)
            self.wait_app()
            self.compose(release, "up", "-d", "--no-build", "--pull", "never", "--no-deps", "nginx", capture=True)
            self.health()
            self.compose(release, "up", "-d", "--no-build", "--pull", "never", "--no-deps", "cron", capture=True)
            self.wait_cron()
            active = self.containers()
            if any(active[service]["Image"] != expected_images[service] for service in SERVICES):
                raise Refused("Running image IDs differ from the validated release images")
            record = {"commit": commit, "digest": digest, "release": str(release),
                      "backup": key, "images": {s: c["Image"] for s, c in active.items()}}
            # Preflight failures must keep the older rollback available. Rotate only after success.
            self.protect_rollback(containers)
            write_json(self.control / "state.json", {"current": record, "previous": previous})
        except Exception:
            if cutover_started:
                log("Deployment failed; restoring previous images and configuration (database is preserved)")
                self.compose(rollback_release, "up", "-d", "--no-build", "--pull", "never", "--no-deps", "app", "nginx",
                             capture=True)
                self.wait_app()
                self.health()
                self.compose(rollback_release, "up", "-d", "--no-build", "--pull", "never", "--no-deps", "cron",
                             capture=True)
                self.wait_cron()
                previous["release"] = str(rollback_release)
                write_json(self.control / "state.json", {"current": previous, "previous": None})
                log("Previous release restored successfully")
            raise
        self.prune_docker()
        self.prune_releases({release, Path(previous["release"])})
        log(f"Deployed {commit}; verified backup {key}; previous images remain protected")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    sub = parser.add_subparsers(dest="action", required=True)
    for name in ("backup", "backup-export", "maintain", "status", "ssh"):
        sub.add_parser(name)
    deploy = sub.add_parser("deploy")
    deploy.add_argument("commit")
    deploy.add_argument("digest")
    deploy.add_argument("--registry-stdin", action="store_true")
    args = parser.parse_args()
    os.umask(0o077)
    if os.geteuid() != 0:
        raise Refused("Run this installed host script as root")
    host = Host(dry_run=args.dry_run)
    credentials = None
    if args.action == "ssh":
        args.action, args.commit, args.digest = parse_request(os.environ.get("SSH_ORIGINAL_COMMAND", ""))
        if args.action == "deploy":
            credentials = read_registry_credentials(sys.stdin.buffer)
    elif args.action == "deploy" and args.registry_stdin:
        credentials = read_registry_credentials(sys.stdin.buffer)
    # One lock covers deployments, daily maintenance, and manual backups.
    lock_path = Path("/run/lock/triad-deploy.lock")
    bounded(lock_path, lock_path.parent)
    with lock_path.open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise Refused("Another deployment or backup is already running") from error
        if args.action == "status":
            containers = host.containers()
            volume = host.volume(containers["app"])
            groups = collect_backups(host.backups, volume)
            log(json.dumps({"state": host.state(), "backup_sets": len(groups),
                            "free_mib": shutil.disk_usage(host.site).free // 1048576,
                            "images": {s: c["Image"] for s, c in containers.items()}}, indent=2))
        elif args.action == "deploy":
            if not args.dry_run:
                private_dir(host.control)
            host.deploy(args.commit, args.digest, credentials)
        elif args.action == "backup":
            snapshot = host.backup(host.containers())
            if snapshot:
                key, _, volume = snapshot
                prune_backups(host.backups, volume, key)
        elif args.action == "backup-export":
            host.export_backup(sys.stdout.buffer)
        elif args.action == "maintain":
            host.maintain()


if __name__ == "__main__":
    try:
        main()
    except (Refused, OSError, sqlite3.Error, subprocess.SubprocessError) as error:
        # OSError can include paths, but no subprocess output or credentials are emitted.
        print(f"Operation failed: {error}", file=sys.stderr, flush=True)
        sys.exit(1)
