#!/bin/bash
# CTT OTA hook: deploy NetworkManager connection profiles.
#
# Source: $REPO/system/network/*.nmconnection (default REPO=/usr/lib/ctt/sensor-station-software)
# Dest:   /etc/NetworkManager/system-connections/  (root:root mode 0600 — NM requires it)
# Reload: nmcli connection reload (only when something changed)
#
# Idempotent — runtime-owned keys (stripped before diff so we don't
# fight the runtime owner):
#   timestamp=   — NM rewrites this on every successful connection activation
#   apn=         — check-sim-id.sh switches station-modem.apn at boot per SIM ICCID
#   autoconnect= — check-sim-id.sh sets this per modem type (Telit=false, Quectel=true).
#                  Preserving it stops a redeploy from reverting the Telit demote and
#                  auto-dialing PPP over the AT port on the next NM reload.

set -e

source "${CTT_HOOK_LIB:-$(dirname "$(readlink -f "$0")")/../_lib.sh}"
require_root

deploy_dir \
  "${REPO:-/usr/lib/ctt/sensor-station-software}/system/network" \
  /etc/NetworkManager/system-connections \
  '*.nmconnection' \
  600 \
  '^(timestamp|apn|autoconnect)=' \
  'nmcli connection reload'
