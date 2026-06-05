#!/bin/bash
# CTT OTA hook: install + enable modem-boot-state.service.
#
# Source: $REPO/system/systemd/modem-boot-state.service
# Dest:   /etc/systemd/system/modem-boot-state.service (root:root mode 0644)
# Reload: systemctl daemon-reload + systemctl enable on change
#
# Scope: this hook is intentionally narrow — it only touches the
# modem-boot-state unit. The other station-*.service units in
# system/systemd/ are part of the station image build and are not
# managed by OTA hooks.

set -e

source "${CTT_HOOK_LIB:-$(dirname "$(readlink -f "$0")")/../_lib.sh}"
require_root

REPO_ROOT="${REPO:-/usr/lib/ctt/sensor-station-software}"
UNIT_NAME='modem-boot-state.service'
SRC="$REPO_ROOT/system/systemd/$UNIT_NAME"
DST="/etc/systemd/system/$UNIT_NAME"

if [ ! -f "$SRC" ]; then
  log_warn "source unit not found: $SRC (skipping)"
  exit 0
fi

changed=0
if [ ! -f "$DST" ] || ! cmp -s "$SRC" "$DST"; then
  install -o root -g root -m 0644 "$SRC" "$DST"
  log_info "installed $DST"
  changed=1
fi

if [ "$changed" = "1" ]; then
  log_info "reloading systemd and enabling $UNIT_NAME"
  systemctl daemon-reload
  systemctl enable "$UNIT_NAME"
else
  # Idempotent guard: re-enable in case the symlink was lost on a fresh
  # /etc reset, even if the unit file is byte-identical.
  if ! systemctl is-enabled --quiet "$UNIT_NAME" 2>/dev/null; then
    log_info "$UNIT_NAME present but not enabled — enabling now"
    systemctl enable "$UNIT_NAME"
  else
    log_info "no changes"
  fi
fi
