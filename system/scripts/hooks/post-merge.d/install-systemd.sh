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
# Auto-enable: any unit listed in MUST_BE_ENABLED that isn't currently
# enabled is enabled via `systemctl enable`. Units the user has
# explicitly disabled (state "disabled") are left alone so their
# operational choice isn't overridden by an OTA.
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
  modem-boot-state.service       # state persistence (Meelyn's), runs Before MM
  ctt-board-detect.service         # boot-time hardware identity; writes /run/ctt/board.env
  ctt-rtc-overlay.service        # match RTC dtoverlay to detected board (early boot)
  ctt-gps-kick.service           # V2 GPS-HAT kick (no-op on V3), after ctt-board-detect
  # ctt-radio-driver@.service is a TEMPLATE — udev activates per-channel instances
  # via ENV{SYSTEMD_WANTS}; it is deployed as a file but must NOT be enabled here.
)
# NOTE: Telit RNDIS + IP-passthrough NV provisioning (AT#RNDIS / AT#IPPASSTH)
# is done at MANUFACTURING, not in the image — the old provision-modem-rndis
# service was removed. The runtime here assumes an already-provisioned modem.

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

# Enable required units. These are MUST_BE_ENABLED by definition, so a
# freshly-deployed unit (which systemd reports as "disabled" until enabled)
# DOES get enabled — otherwise the provisioning/boot units would never start
# on a fresh fleet station. An operator who wants one off should remove it
# from MUST_BE_ENABLED, not rely on a runtime `disable` surviving OTA.
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
    *)
      log_info "enabling $unit (was: $state)"
      systemctl enable "$unit"
      ;;
  esac
done

exit 0
