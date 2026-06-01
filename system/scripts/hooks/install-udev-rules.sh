#!/bin/bash
# CTT OTA hook: deploy udev rules from the monorepo.
#
# Source: $REPO/system/modem/*.rules (default REPO=/usr/lib/ctt/sensor-station-software)
# Dest:   /etc/udev/rules.d/  (root:root mode 0644)
#
# Source filenames are passed through unchanged. To control rule ordering
# (udev applies rules in lexical order across all *.rules files in the
# directory), prefix source filenames numerically (e.g. 77-foo.rules).
#
# Reload: udevadm control --reload (only when something changed).
# Note: reload affects newly-added devices only — already-bound USB devices
# stay as they were. A Telit replug or a reboot is required for interface
# authorization changes to take effect on already-enumerated hardware.
#
# Idempotent: files already byte-identical are left alone.
#
# Must run as root: install -o root, reads /etc/udev/rules.d.

set -e

if [ "$EUID" -ne 0 ]; then
  echo "$0: must run as root" >&2
  exit 1
fi

REPO="${REPO:-/usr/lib/ctt/sensor-station-software}"
SRC_DIR="$REPO/system/modem"
DST_DIR="/etc/udev/rules.d"

CHANGED=0

install_if_diff() {
  local src="$1" dst="$2"
  [ -f "$src" ] || return
  if [ -f "$dst" ] && cmp -s "$src" "$dst"; then
    return
  fi
  install -o root -g root -m 644 "$src" "$dst"
  echo "installed: $dst"
  CHANGED=1
}

[ -d "$SRC_DIR" ] || { echo "$0: source dir not found: $SRC_DIR" >&2; exit 1; }

for src in "$SRC_DIR"/*.rules; do
  [ -f "$src" ] || continue
  install_if_diff "$src" "$DST_DIR/$(basename "$src")"
done

if [ "$CHANGED" = "1" ]; then
  echo "reloading udev rules"
  udevadm control --reload
fi

exit 0
