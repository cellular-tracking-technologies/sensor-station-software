#!/bin/bash
# CTT OTA hook: deploy NetworkManager connection profiles from the monorepo.
#
# Source: $REPO/system/network/*.nmconnection (default REPO=/usr/lib/ctt/sensor-station-software)
# Dest:   /etc/NetworkManager/system-connections/  (root:root mode 0600 — NM requires it)
# Reload: nmcli connection reload (only when something changed)
#
# Idempotent: files already byte-identical (ignoring runtime-owned keys) are left alone.
# Runtime-owned keys (stripped before diff):
#   timestamp= — NM rewrites this on every successful connection activation
#   apn=       — check-sim-id.sh switches station-modem.apn at boot per SIM ICCID
#
# Must run as root: install -o root, reads 0600 destinations.

set -e

if [ "$EUID" -ne 0 ]; then
  echo "$0: must run as root" >&2
  exit 1
fi

REPO="${REPO:-/usr/lib/ctt/sensor-station-software}"
SRC_DIR="$REPO/system/network"
DST_DIR="/etc/NetworkManager/system-connections"
MUTABLE_KEYS='^(timestamp|apn)='

CHANGED=0

install_if_diff() {
  local src="$1" dst="$2"
  [ -f "$src" ] || return
  if [ -f "$dst" ] && \
     diff -q <(grep -vE "$MUTABLE_KEYS" "$src") \
             <(grep -vE "$MUTABLE_KEYS" "$dst") >/dev/null 2>&1; then
    return
  fi
  install -o root -g root -m 600 "$src" "$dst"
  echo "installed: $dst"
  CHANGED=1
}

[ -d "$SRC_DIR" ] || { echo "$0: source dir not found: $SRC_DIR" >&2; exit 1; }

for src in "$SRC_DIR"/*.nmconnection; do
  [ -f "$src" ] || continue
  install_if_diff "$src" "$DST_DIR/$(basename "$src")"
done

if [ "$CHANGED" = "1" ]; then
  echo "reloading NetworkManager connection profiles"
  nmcli connection reload
fi

exit 0
