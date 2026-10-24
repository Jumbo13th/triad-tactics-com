#!/usr/bin/env bash
# Install the reviewed upstream Linux amd64 release, with its published digest.
set -euo pipefail
[[ $(uname -s) == Linux && $(uname -m) == x86_64 ]] || { echo 'Linux amd64 is required' >&2; exit 1; }
version=0.19.1
checksum=f415415624dcc452f2a02b8c33641791a8c6d6d3b65bbb3543fcf9a25151585c
destination=${1:-/usr/local/bin/restic}
if [[ -x $destination ]] && [[ $("$destination" version) == "restic $version "* ]]; then
  exit 0
fi
temporary=$(mktemp -d)
trap 'rm -rf -- "$temporary"' EXIT
archive="$temporary/restic.bz2"
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 --retry 3 --max-time 120 \
  "https://github.com/restic/restic/releases/download/v$version/restic_${version}_linux_amd64.bz2" \
  --output "$archive"
printf '%s  %s\n' "$checksum" "$archive" | sha256sum --check --status
bzip2 --decompress "$archive"
install -m 0755 "$temporary/restic" "$destination"
"$destination" version
