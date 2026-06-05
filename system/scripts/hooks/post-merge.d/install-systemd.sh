#!/bin/bash
# CTT OTA hook: deploy systemd unit files from the monorepo.
#
# Source: $REPO/system/systemd/*.service (default REPO=/usr/lib/ctt/sensor-station-software)
# Dest:   /etc/systemd/system/  (root:root mode 0644)
#
# Source filenames pass through unchanged. Replaces any pre-existing
# file or symlink at the destination with a regular file copy (no more
# symlinks-into-the-monorepo) — see _lib.sh deploy_dir + install(1)
# semantics: install replaces symlinks at the destination with the
# source content, leaving a real file. This gives us unambiguous state
# in /etc/systemd/system/ that is independent of monorepo path changes.
#
# Reload: systemctl daemon-reload (only when something changed)
# Auto-enable: any unit listed in MUST_BE_ENABLED that isn't already
# enabled and isn't masked is enabled via `systemctl enable`. Note that
# `systemctl is-enabled` returns "disabled" both for a unit an operator
# deliberately disabled AND for a unit that was just installed and has
# never been enabled at all — so treating "disabled" as operator intent
# creates a first-install chicken-and-egg where the unit never gets
# turned on. To suppress a unit deliberately, use `systemctl mask <unit>`
# which produces the unambiguous "masked" state we DO respect here.
#
# Must run as root: install -o root, systemctl writes to /etc/systemd/

set -e

source "${CTT_HOOK_LIB:-$(dirname "$(readlink -f "$0")")/../_lib.sh}"
require_root

REPO="${REPO:-/usr/lib/ctt/sensor-station-software}"
SRC_DIR="$REPO/system/systemd"
DST_DIR="/etc/systemd/system"

# Units that should always be enabled if present. Add new names here
# as services join the OTA-deploy story. Units NOT listed here are
# only deployed as files — their enable state is left to manufacturing
# / Ansible / operator action.
MUST_BE_ENABLED=(
  modem-boot-state.service    # state persistence (Meelyn's), runs Before MM
  provision-modem.service     # idempotent CGDCONT cleanup, runs After MM
)

CHANGED=0

install_if_diff() {
  local src="$1" dst="$2"
  [ -f "$src" ] || return
  # install(1) replaces symlinks at $dst with regular file containing $src.
  # We compare content rather than file type to decide whether to install.
  if [ -f "$dst" ] && cmp -s "$src" "$dst"; then
    return
  fi
  install -o root -g root -m 644 "$src" "$dst"
  log_info "installed $dst"
  CHANGED=1
}

if [ ! -d "$SRC_DIR" ]; then
  log_warn "source dir not found: $SRC_DIR (skipping systemd deploy)"
  exit 0
fi

# Deploy *.service files (could extend to .timer, .socket, etc. later)
for src in "$SRC_DIR"/*.service; do
  [ -f "$src" ] || continue
  install_if_diff "$src" "$DST_DIR/$(basename "$src")"
done

if [ "$CHANGED" = "1" ]; then
  log_info "reloading systemd"
  systemctl daemon-reload
else
  log_info "no systemd unit changes"
fi

# Enable required units that aren't already enabled. Skip units the
# user has explicitly disabled (preserves operational intent).
for unit in "${MUST_BE_ENABLED[@]}"; do
  if [ ! -f "$DST_DIR/$unit" ]; then
    log_warn "$unit listed in MUST_BE_ENABLED but not installed; skipping enable"
    continue
  fi
  state=$(systemctl is-enabled "$unit" 2>&1 || true)
  case "$state" in
    enabled|enabled-runtime|alias|static)
      # already in good state
      ;;
    masked|masked-runtime)
      # operator deliberately masked this unit; honour that choice.
      log_warn "$unit is masked; not enabling (operator choice respected)"
      ;;
    *)
      # disabled / not-found / failed / freshly-installed-never-enabled —
      # all of these mean "needs an enable." See the file header for why
      # "disabled" is not treated as operator intent.
      log_info "enabling $unit (was: $state)"
      systemctl enable "$unit"
      ;;
  esac
done

exit 0
