#!/bin/sh
set -eu

# Install only after reviewing this checkout. Deployment cannot replace its own dispatcher.
[ "$(id -u)" = 0 ] || { echo 'Run as root' >&2; exit 1; }
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
install -d -m 0700 /usr/local/lib/triad-deploy
install -m 0600 "$script_dir/triad_host.py" /usr/local/lib/triad-deploy/triad_host.py
install -m 0644 "$script_dir/triad-maintenance.service" /etc/systemd/system/triad-maintenance.service
install -m 0644 "$script_dir/triad-maintenance.timer" /etc/systemd/system/triad-maintenance.timer
systemctl daemon-reload
python3 /usr/local/lib/triad-deploy/triad_host.py status
python3 /usr/local/lib/triad-deploy/triad_host.py --dry-run maintain
echo 'Installed. Review status, run maintain once, then systemctl enable --now triad-maintenance.timer.'
