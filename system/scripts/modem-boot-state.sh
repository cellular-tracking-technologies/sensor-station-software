#!/bin/bash
# Reconcile the cellular modem's on/off state to the operator's intent at boot.
#
#   /run/ctt/modem-disabled present → deauthorize (modem OFF)
#   absent                          → authorize   (modem ON, default)
#
# The marker lives in tmpfs (/run), so it is cleared on every boot: a disable is
# non-persistent by design — the modem returns to ON after any reboot or hard
# reset (fail-safe). Enable (no marker) is the persistent state. Since /run is
# empty at boot, this normally authorizes; disable only takes effect within the
# current power session (disable-modem.sh deauthorizes live).
#
# `authorized` is runtime state that resets to 1 when the modem re-enumerates on a
# reboot (both Telit and Quectel self-enumerate on VBAT), so we re-apply the
# intent here. Ordered Before=ModemManager so MM's first scan sees the intended
# authorization. This step is pure USB sysfs (modem-power.sh) — no nmcli/mmcli —
# so it is safe before NetworkManager/ModemManager are up. The data-path
# autoconnect policy and per-SIM APN are owned by station-boot (After=MM):
# modem-datapath.sh + check-sim-id.sh.
set -u

SCRIPT_DIR='/lib/ctt/sensor-station-software/system/scripts'
MARKER='/run/ctt/modem-disabled'

# Wait for the self-enumerating modem to appear on USB before applying the intent,
# so a disabled station reliably deauthorizes it before ModemManager (ordered
# after us) scans. Breaks as soon as a known modem appears; bounded so a station
# with no modem doesn't stall boot.
for i in $(seq 1 25); do
  lsusb -d 1bc7: >/dev/null 2>&1 && break       # Telit (7020 RNDIS / 7021 ECM)
  lsusb -d 2c7c:0125 >/dev/null 2>&1 && break   # Quectel
  sleep 1
done

if [ -e "$MARKER" ]; then
  echo "modem-boot-state: marker present — modem OFF (deauthorize)"
  exec bash "$SCRIPT_DIR/modem-power.sh" off
else
  echo "modem-boot-state: no marker — modem ON (authorize, default)"
  exec bash "$SCRIPT_DIR/modem-power.sh" on
fi
