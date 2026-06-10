#!/bin/bash
# Enable the cellular modem. The mechanism depends on which modem is
# installed and on its current state:
#
#   Quectel EC25 (2c7c:0125) visible in lsusb:
#     A deauthorized Quectel still shows up in lsusb (descriptors live in
#     sysfs regardless of driver binding). It's either healthy or sitting
#     deauthorized; re-authorize to bind drivers and let ModemManager
#     re-detect via fresh udev events. If already authorized, this is a
#     no-op write.
#
#   Telit LE910Q1 (1bc7:7020) visible in lsusb:
#     Already powered on (Telit only enumerates after boot, since disable
#     cuts VBAT entirely). No-op.
#
#   No modem visible:
#     Assume Telit that was powered off (Quectel always shows in lsusb
#     even when deauthorized — its absence implies the variant is Telit
#     and it was last powered off). Pulse GPIO 23 (ON_OFF#) LOW ~2s then
#     release HIGH. Modem takes ~15s to enumerate on USB; MM picks it up.
#     Spec ref: hardware/TELIT_LE910Q1_INTEGRATION_REPORT.md

TELIT='1bc7:7020'
QUECTEL='2c7c:0125'

# Persistent intent marker. Presence means "operator wants modem OFF" and
# is consulted by modem-boot-state.service to restore state across hard
# reboots. Removed here so enable-modem.sh always clears intent.
MARKER='/etc/ctt/modem-disabled'
rm -f "$MARKER"

# Walk /sys/bus/usb/devices to find the parent device matching a VID:PID.
# Echoes the sysfs path or returns 1 if not found.
find_usb_parent() {
  local vid="$1" pid="$2"
  for p in /sys/bus/usb/devices/*; do
    [ -f "$p/idVendor" ] || continue
    if [ "$(cat "$p/idVendor" 2>/dev/null)" = "$vid" ] && \
       [ "$(cat "$p/idProduct" 2>/dev/null)" = "$pid" ]; then
      echo "$p"
      return 0
    fi
  done
  return 1
}

if lsusb -d $QUECTEL >/dev/null 2>&1; then
  vid="${QUECTEL%:*}"; pid="${QUECTEL#*:}"
  path=$(find_usb_parent "$vid" "$pid")
  if [ -z "$path" ]; then
    echo "ERROR: Quectel detected by lsusb but not found in sysfs"
    exit 1
  fi
  echo "enabling Quectel EC25 (authorize USB device at $path)"
  echo 1 > "$path/authorized"
elif lsusb -d $TELIT >/dev/null 2>&1; then
  echo 'Telit LE910Q1 already powered on; no action needed'
else
  echo 'no modem currently visible; assuming Telit LE910Q1 powered off, pulsing GPIO 23 LOW 2s'
  raspi-gpio set 23 op dh   # ensure HIGH idle for a clean falling edge
  sleep 0.1
  raspi-gpio set 23 op dl   # press: ON_OFF# asserted LOW
  sleep 2                    # hold ~1-2s to trigger power-on
  raspi-gpio set 23 op dh   # release: ON_OFF# back to idle HIGH
fi

# Re-run the per-SIM APN selection now that the modem is being enabled. This
# covers the boot-disabled-then-enabled-later case: at boot station-boot's
# check-sim-id ran with no modem (skipped), so the APN was never set for this
# SIM. check-sim-id waits for the modem+SIM to enumerate (handles the GPIO/USB
# bring-up delay) and only sets the APN once it reads a valid ICCID.
# SKIP_CHECK_SIM is set by modem-boot-state.sh at boot: that unit is ordered
# Before=ModemManager.service, and check-sim-id.sh does a blocking
# `systemctl start ModemManager`, so running it from there deadlocks (MM waits
# for modem-boot-state to finish; modem-boot-state waits for MM to start). At
# boot, station-boot.service runs check-sim-id for APN selection instead. For a
# manual / web "enable after boot", SKIP_CHECK_SIM is unset and we run it here.
CHECK_SIM=/usr/lib/ctt/sensor-station-software/system/scripts/check-sim-id.sh
if [ -n "$SKIP_CHECK_SIM" ]; then
  echo 'enable-modem: SKIP_CHECK_SIM set (boot-state restore) — leaving APN to station-boot'
elif [ -f "$CHECK_SIM" ]; then
  bash "$CHECK_SIM"
fi
