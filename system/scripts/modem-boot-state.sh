#!/bin/bash
# Reconcile the cellular modem's on/off state to the operator's intent at boot.
#
#   /etc/ctt/modem-disabled present → deauthorize (modem OFF)
#   absent                          → authorize   (modem ON, default)
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
MARKER='/etc/ctt/modem-disabled'

# Wait for the self-enumerating modem to appear on USB before applying the intent,
# so a disabled station reliably deauthorizes it before ModemManager (ordered
# after us) scans. Breaks as soon as a known modem appears; bounded so a station
# with no modem doesn't stall boot.
for i in $(seq 1 25); do
  lsusb -d 1bc7:7021 >/dev/null 2>&1 && break   # Telit (CDC-ECM)
  lsusb -d 1bc7:7020 >/dev/null 2>&1 && break   # Telit (RNDIS)
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
