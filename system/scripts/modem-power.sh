#!/bin/bash
# modem-power.sh {on|off} — set the cellular modem's USB authorization.
#
# One uniform mechanism for every supported modem (Telit LE910Q1 1bc7:7020,
# Quectel EC25 2c7c:0125): both self-enumerate on the USB bus whenever VBAT is
# present, so we never touch GPIO / ON_OFF#.
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
# intent lives in /etc/ctt/modem-disabled, which modem-boot-state.sh reconciles.
set -u

TELIT='1bc7:7020'
QUECTEL='2c7c:0125'

usage() { echo "usage: modem-power.sh {on|off}" >&2; exit 2; }
[ "$#" -eq 1 ] || usage
case "$1" in
  on)  val=1 ;;
  off) val=0 ;;
  *)   usage ;;
esac

# Walk /sys/bus/usb/devices for the parent device matching a VID:PID.
find_usb_parent() {
  local vid="$1" pid="$2" p
  for p in /sys/bus/usb/devices/*; do
    [ -f "$p/idVendor" ] || continue
    if [ "$(cat "$p/idVendor" 2>/dev/null)" = "$vid" ] && \
       [ "$(cat "$p/idProduct" 2>/dev/null)" = "$pid" ]; then
      echo "$p"; return 0
    fi
  done
  return 1
}

for vidpid in "$TELIT" "$QUECTEL"; do
  path="$(find_usb_parent "${vidpid%:*}" "${vidpid#*:}")" || continue
  echo "modem-power: $1 $vidpid ($path)"
  if echo "$val" > "$path/authorized"; then
    exit 0
  fi
  echo "modem-power: ERROR writing $path/authorized" >&2
  exit 1
done

echo "modem-power: no known modem on USB (Telit $TELIT / Quectel $QUECTEL); nothing to do"
exit 0
