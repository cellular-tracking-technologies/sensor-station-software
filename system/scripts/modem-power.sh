#!/bin/bash
# modem-power.sh {on|off} — set the cellular modem's USB authorization.
#
# One uniform mechanism for every supported modem (Telit LE910Q1 1bc7:*,
# Quectel EC25 2c7c:0125): both self-enumerate on the USB bus whenever VBAT is
# present, so we never touch GPIO / ON_OFF#. The Telit is matched by VID only —
# its product id is 7020 on the RNDIS composition and 7021 on ECM.
#
#   off = deauthorize (echo 0 > .../authorized): the kernel unbinds all drivers
#         and ModemManager drops the modem, but the device stays powered and
#         VISIBLE in lsusb (QAQC-friendly), and re-enable is a clean driver
#         rebind with no re-enumeration wait.
#   on  = authorize   (echo 1 > .../authorized).
#
# Idempotent: the sysfs write is a no-op if the device is already in that state,
# so this is a level (declarative) operation, not an edge/toggle. `authorized` is
# runtime state (resets to 1 on re-enumeration / reboot); the persistent operator
# intent lives in /etc/ctt/modem-disabled (persistent on-disk; a disable survives
# reboots/hard resets), which modem-boot-state.sh reconciles.
set -u

TELIT_VID='1bc7'   # match any product id: 7020 (RNDIS) or 7021 (ECM)
QUECTEL='2c7c:0125'

usage() { echo "usage: modem-power.sh {on|off}" >&2; exit 2; }
[ "$#" -eq 1 ] || usage
case "$1" in
  on)  val=1 ;;
  off) val=0 ;;
  *)   usage ;;
esac

# Walk /sys/bus/usb/devices for the parent device matching a VID (and PID, if
# given — an empty PID matches any product id of that vendor).
find_usb_parent() {
  local vid="$1" pid="$2" p
  for p in /sys/bus/usb/devices/*; do
    [ -f "$p/idVendor" ] || continue
    [ "$(cat "$p/idVendor" 2>/dev/null)" = "$vid" ] || continue
    if [ -z "$pid" ] || [ "$(cat "$p/idProduct" 2>/dev/null)" = "$pid" ]; then
      echo "$p"; return 0
    fi
  done
  return 1
}

# Each spec is "vid" (any product) or "vid:pid".
for spec in "$TELIT_VID" "$QUECTEL"; do
  case "$spec" in
    *:*) vid="${spec%:*}"; pid="${spec#*:}" ;;
    *)   vid="$spec"; pid="" ;;
  esac
  path="$(find_usb_parent "$vid" "$pid")" || continue
  echo "modem-power: $1 $spec ($path)"
  if echo "$val" > "$path/authorized"; then
    exit 0
  fi
  echo "modem-power: ERROR writing $path/authorized" >&2
  exit 1
done

echo "modem-power: no known modem on USB (Telit $TELIT_VID:* / Quectel $QUECTEL); nothing to do"
exit 0
