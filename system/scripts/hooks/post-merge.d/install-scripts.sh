#!/bin/bash
# install-scripts — symlink the user-facing shell CLIs from system/scripts/ into
# /usr/local/sbin.
#
# These symlinks used to be created ONLY by the Ansible image build
# (ctt-sensor-build/roles/configure-ctt-software); an OTA never (re)created them, so
# a lost symlink — or an image built without the legacy Ansible role — left the
# station with no CLIs. Listing them here makes an OTA self-heal them, the same
# rationale as install-systemd.sh's MUST_BE_ENABLED for units, and moves CLI
# ownership into the monorepo (retiring that slice of the Ansible boot-path debt).
#
# Unlike the network/udev deploys, this runs in image-bake mode too: a symlink needs
# no NetworkManager/modem/hardware, so fresh images ship the CLIs and OTAs keep them.
# The link targets the OTA checkout ($REPO), which is the same path in the bake and
# on a running station.
#
# CLIs run as the ctt user where the command allows it (ctt is in adm/video/i2c/dialout).
#
# Must run as root: writes to /usr/local/sbin.

set -e

source "${CTT_HOOK_LIB:-$(dirname "$(readlink -f "$0")")/../_lib.sh}"
require_root

REPO="${REPO:-/usr/lib/ctt/sensor-station-software}"
SRC_DIR="$REPO/system/scripts"
BIN_DIR="${BIN_DIR:-/usr/local/sbin}"

# CLI command  ->  script in system/scripts/. Add new commands here.
CLIS="
station-id            station-id.sh
program-radios        program-radios.sh
program-radio         program-radio.sh
update-station        update-station.sh
bash-update-station   bash-update-station.sh
upload-station-data   upload-station-data.sh
collect-diagnostics   collect-diagnostics.sh
"

mkdir -p "$BIN_DIR"
changed=0
while read -r name script; do
  [ -z "$name" ] && continue
  src="$SRC_DIR/$script"
  dst="$BIN_DIR/$name"
  if [ ! -f "$src" ]; then
    log_warn "CLI source missing: $src — skipping '$name'"
    continue
  fi
  # -f replaces a stale link or a regular file left by an older image; -n so an
  # existing dir symlink is replaced, not descended into.
  if [ "$(readlink -f "$dst" 2>/dev/null)" != "$(readlink -f "$src")" ]; then
    ln -sfn "$src" "$dst"
    log_info "linked $dst -> $src"
    changed=1
  fi
done <<EOF
$CLIS
EOF

[ "$changed" = 0 ] && log_info "all CLI symlinks already current"
exit 0
