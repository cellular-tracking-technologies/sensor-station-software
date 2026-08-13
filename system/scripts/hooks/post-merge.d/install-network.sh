#!/bin/bash
# CTT OTA hook: deploy NetworkManager connection profiles + config drop-ins.
#
# Profiles:
#   Source: $REPO/system/network/*.nmconnection (default REPO=/usr/lib/ctt/sensor-station-software)
#   Dest:   /etc/NetworkManager/system-connections/  (root:root mode 0600 — NM requires it)
#   Reload: nmcli connection reload (only when something changed)
# Config drop-ins:
#   Source: $REPO/system/network/conf.d/*.conf
#   Dest:   /etc/NetworkManager/conf.d/  (root:root mode 0644 — global config, not secrets)
#   Reload: nmcli general reload conf (only when something changed)
#
# Idempotent — runtime-owned keys (stripped before diff so we don't
# fight the runtime owner):
#   timestamp=   — NM rewrites this on every successful connection activation
#   apn=         — provision-modem-apn.sh switches station-modem.apn at boot per SIM
#   autoconnect= — modem-datapath.sh sets this per modem type (Telit=false, Quectel=true).
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

# Belt-and-braces for the profile deploy above. merge_preserved_keys keeps live
# values for the runtime-owned keys, but it can only do so for keys the repo
# profile actually ships a line for — and correctness there depends on the
# preserve regex staying in sync with whatever the runtime writes. The modem's
# autoconnect policy is a pure function of the modem type (see modem-datapath.sh),
# so it costs nothing to just re-derive it after the profile deploy and stop
# depending on preservation at all. Idempotent: it sets autoconnect per VID:PID
# and leaves it UNCHANGED when no known modem is visible.
#
# Skipped in an image bake for the same reason the nmcli reloads are: hooks run
# inside the base image under qemu with no NetworkManager and no modem, so the
# lsusb probe would find nothing and nmcli could not connect. Boot on the flashed
# station runs modem-datapath.sh from station-boot.service anyway.
datapath="${REPO:-/usr/lib/ctt/sensor-station-software}/system/scripts/modem-datapath.sh"
if [ -n "${CTT_BUILD_MODE:-}" ]; then
  log_info "build mode: skipping modem data-path re-assert (applies on first boot)"
elif [ -x "$datapath" ] || [ -f "$datapath" ]; then
  log_info "re-asserting modem data-path policy after profile deploy"
  # Never fail the OTA on this: the profile is already deployed, and
  # station-boot.service re-runs the same script on the next boot.
  bash "$datapath" || log_warn "modem-datapath.sh failed (non-fatal; re-runs at boot)"
else
  log_warn "modem-datapath.sh not found at $datapath (skipping re-assert)"
fi

# NetworkManager config drop-ins (conf.d): global defaults, not connection
# profiles, so mode 0644 (world-readable config) and reloaded via the config
# reload rather than the connection reload. Ships wifi-powersave-off.conf so
# WiFi adapters stay reachable instead of sleeping into ARP-silence.
deploy_dir \
  "${REPO:-/usr/lib/ctt/sensor-station-software}/system/network/conf.d" \
  /etc/NetworkManager/conf.d \
  '*.conf' \
  644 \
  '' \
  'nmcli general reload conf'
