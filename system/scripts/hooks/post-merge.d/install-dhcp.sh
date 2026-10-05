#!/bin/bash
# CTT OTA hook: deploy dhclient hooks.
#
#   Source: $REPO/system/dhcp/dhclient-enter-hooks.d/ctt-*
#   Dest:   /etc/dhcp/dhclient-enter-hooks.d/  (root:root mode 0644)
#   Reload: none — dhclient-script sources the directory on every invocation, so
#           the next lease picks up a change with nothing to restart.
#
# Only ctt-* is deployed: stock Debian hooks (debug, resolvconf) are never
# touched, and a REMOVED listing in the source dir stays out of the destination.
set -e

source "${CTT_HOOK_LIB:-$(dirname "$(readlink -f "$0")")/../_lib.sh}"
require_root

deploy_dir \
  "${REPO:-/usr/lib/ctt/sensor-station-software}/system/dhcp/dhclient-enter-hooks.d" \
  /etc/dhcp/dhclient-enter-hooks.d \
  'ctt-*' \
  644 \
  '' \
  ''
