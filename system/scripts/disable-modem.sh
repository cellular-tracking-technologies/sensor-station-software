#!/bin/bash
# Disable the cellular modem. The mechanism depends on which modem is
# installed; we detect by USB VID:PID.
#
#   Telit LE910Q1 (1bc7:7020):  pulse GPIO 23 (ON_OFF#) LOW 6s → release HIGH
#     GPIO 23 was rewired on the R3b adapter to drive ON_OFF# directly;
#     >3s LOW triggers Telit's hardware shutdown (we use 6s for margin),
#     then release HIGH so the line returns to its idle state. Full power-off:
#     modem disappears from USB, LTE radio stops, ~150-200mA saved.
#     Spec ref: hardware/TELIT_LE910Q1_INTEGRATION_REPORT.md
#
#   Quectel EC25 (2c7c:0125):  deauthorize the parent USB device
#     Quectel has no software power control on V3 (it's "auto-on with VCC"
#     per the integration report — MODEM_U_DISABLE# on GPIO 23 doesn't
#     actually trigger USB disconnect on the deployed boards). Instead we
#     use kernel USB authorization: writing 0 to /sys/bus/usb/devices/.../
#     authorized triggers a clean USB-level disconnect — kernel unbinds
#     all drivers, ModemManager clears its cached state, and the modem
#     closes its QMI sessions cleanly so re-enable doesn't suffer from
#     QMI transaction-ID staleness the way module-blacklist did.
#     Modem stays powered (RF radio still on, ~50mA idle).

TELIT='1bc7:7020'
QUECTEL='2c7c:0125'

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

if lsusb -d $TELIT >/dev/null 2>&1; then
  echo 'disabling Telit LE910Q1 (pulse GPIO 23 LOW 6s, release HIGH)'
  raspi-gpio set 23 op dh   # ensure HIGH idle for a clean falling edge
  sleep 0.1
  raspi-gpio set 23 op dl   # press: ON_OFF# asserted LOW
  sleep 6                    # hold >5s to trigger shutdown
  raspi-gpio set 23 op dh   # release: ON_OFF# back to idle HIGH
elif lsusb -d $QUECTEL >/dev/null 2>&1; then
  vid="${QUECTEL%:*}"; pid="${QUECTEL#*:}"
  path=$(find_usb_parent "$vid" "$pid")
  if [ -z "$path" ]; then
    echo "ERROR: Quectel detected by lsusb but not found in sysfs"
    exit 1
  fi
  echo "disabling Quectel EC25 (deauthorize USB device at $path)"
  echo 0 > "$path/authorized"
else
  echo 'no known modem detected (looked for Telit 1bc7:7020, Quectel 2c7c:0125); nothing to disable'
fi
