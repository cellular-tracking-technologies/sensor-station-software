#!/bin/bash
# Provision the cellular modem to a known-good NV state.
# Called at boot by ctt-modem-boot.service.
#
# Idempotent — checks current modem state first and only applies the
# transformation when something needs to change. On a modem already in
# the expected state, this script no-ops (no AT writes).
#
# Currently provisions:
#
#   Telit LE910Q1 (1bc7:7020): strip CIDs 2 and 3 from PDP context
#     table, force CID 1 to "IP","super" (IPv4-only). The factory state
#     ships with multiple CIDs that conflict with AT&T's "one PDN per
#     APN" policy when the Twilio Super SIM roams onto AT&T. The
#     single-CID configuration matches the working modem state we've
#     validated empirically.
#
#   Quectel EC25 (2c7c:0125): no provisioning currently needed.
#
# This script writes to MODEM NV (AT&W). Each station that runs it
# applies a per-modem configuration change. Treat the deployment of
# this script as a fleet-wide auto-approval for that specific
# transformation — once shipped via OTA, every Telit station applies
# it on the first boot the modem needs it.

set +e  # individual AT queries may return non-zero; don't bail on those

if [ "$EUID" -ne 0 ]; then
  echo "[provision-modem] must run as root" >&2
  exit 1
fi

TELIT='1bc7:7020'
QUECTEL='2c7c:0125'
DEBUG_DROPIN=/etc/systemd/system/ModemManager.service.d/10-debug.conf
DEBUG_DROPIN_CREATED=0
ORIG_AUTOCONNECT=""

cleanup() {
  if [ "$DEBUG_DROPIN_CREATED" = "1" ]; then
    rm -f "$DEBUG_DROPIN"
    rmdir /etc/systemd/system/ModemManager.service.d 2>/dev/null
    systemctl daemon-reload
    systemctl restart ModemManager
  fi
  if [ -n "$ORIG_AUTOCONNECT" ]; then
    nmcli connection modify station-modem connection.autoconnect "$ORIG_AUTOCONNECT" 2>/dev/null
  fi
}
trap cleanup EXIT

# --- modem-type dispatch ---
if lsusb -d $QUECTEL >/dev/null 2>&1; then
  echo "[provision-modem] Quectel detected — no provisioning needed"
  exit 0
fi

if ! lsusb -d $TELIT >/dev/null 2>&1; then
  echo "[provision-modem] no recognized modem present — nothing to provision"
  exit 0
fi

# --- Telit provisioning starts here ---
echo "[provision-modem] Telit LE910Q1 detected — checking CGDCONT state"

# Enable MM debug mode so we can send raw AT (only if not already enabled)
if [ ! -f "$DEBUG_DROPIN" ]; then
  mkdir -p "$(dirname "$DEBUG_DROPIN")"
  cat > "$DEBUG_DROPIN" <<EOF
[Service]
ExecStart=
ExecStart=/usr/sbin/ModemManager --debug
EOF
  systemctl daemon-reload
  systemctl restart ModemManager
  DEBUG_DROPIN_CREATED=1
  for i in $(seq 1 15); do
    mmcli -L 2>&1 | grep -q "Modem/" && break
    sleep 2
  done
  sleep 3
fi

# --- detection: is provisioning needed? ---
CGDCONT=$(mmcli -m 0 --command='AT+CGDCONT?' 2>&1)

NEEDS_PROVISIONING=0
if echo "$CGDCONT" | grep -qE '\+CGDCONT: (2|3),'; then
  echo "[provision-modem] extra CIDs detected — provisioning required"
  NEEDS_PROVISIONING=1
fi
if ! echo "$CGDCONT" | grep -qE '\+CGDCONT: 1,"IP","super"'; then
  echo "[provision-modem] CID 1 not in expected IP/super state — provisioning required"
  NEEDS_PROVISIONING=1
fi

if [ "$NEEDS_PROVISIONING" = "0" ]; then
  echo "[provision-modem] modem already in expected state — no-op"
  exit 0
fi

# --- quiet NM so MM isn't fighting us during the writes ---
ORIG_AUTOCONNECT=$(nmcli -t -f connection.autoconnect connection show station-modem 2>/dev/null | cut -d: -f2)
ORIG_AUTOCONNECT="${ORIG_AUTOCONNECT:-yes}"
nmcli connection modify station-modem connection.autoconnect no 2>/dev/null
nmcli connection down station-modem 2>/dev/null

# --- the actual transformation: 3 AT writes + AT&W persist ---
echo "[provision-modem] applying transformation"
mmcli -m 0 --command='AT+CGDCONT=2' >/dev/null 2>&1
mmcli -m 0 --command='AT+CGDCONT=3' >/dev/null 2>&1
mmcli -m 0 --command='AT+CGDCONT=1,"IP","super"' >/dev/null 2>&1
mmcli -m 0 --command='AT&W' >/dev/null 2>&1

# --- verify the writes took (still in RAM) ---
AFTER=$(mmcli -m 0 --command='AT+CGDCONT?' 2>&1)
echo "[provision-modem] CGDCONT after writes:"
echo "$AFTER" | sed 's/^/  /'

# --- power-cycle so modem reattaches with the new config ---
# Skip the power-cycle if disable-modem.sh isn't available at the expected path
DISABLE_SCRIPT=/usr/lib/ctt/sensor-station-software/system/scripts/disable-modem.sh
ENABLE_SCRIPT=/usr/lib/ctt/sensor-station-software/system/scripts/enable-modem.sh
if [ -f "$DISABLE_SCRIPT" ] && [ -f "$ENABLE_SCRIPT" ]; then
  echo "[provision-modem] power-cycling modem to apply new NV"
  bash "$DISABLE_SCRIPT"
  sleep 8
  bash "$ENABLE_SCRIPT"
  echo "[provision-modem] waiting 30s for modem boot + USB enum"
  sleep 30
else
  echo "[provision-modem] disable/enable scripts not found — modem will pick up new config on next reboot"
fi

echo "[provision-modem] done"
exit 0
