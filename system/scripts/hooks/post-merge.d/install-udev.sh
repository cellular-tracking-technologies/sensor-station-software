#!/bin/bash
# CTT OTA hook: deploy udev rules.
#
# Source: $REPO/system/udev/*.rules (default REPO=/usr/lib/ctt/sensor-station-software)
# Dest:   /etc/udev/rules.d/  (root:root mode 0644)
# Reload: udevadm control --reload (only when something changed)
#
# Source filenames are passed through unchanged. To control rule ordering
# (udev applies rules in lexical order across all *.rules files in the
# directory), prefix source filenames numerically (e.g. 77-foo.rules).
#
# Note: udev reload affects newly-added devices only — already-bound USB
# devices stay as they were. A device replug or a reboot is required for
# interface authorization changes to take effect on already-enumerated
# hardware.

set -e

source "${CTT_HOOK_LIB:-$(dirname "$(readlink -f "$0")")/../_lib.sh}"
require_root

deploy_dir \
  "${REPO:-/usr/lib/ctt/sensor-station-software}/system/udev" \
  /etc/udev/rules.d \
  '*.rules' \
  644 \
  '' \
  'udevadm control --reload'
