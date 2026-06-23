#!/bin/bash
# Flash one radio MCU. Thin wrapper around the native ctt-radio-flash tool, which
# does the GPIO-free 1200-baud-touch + avrdude (see native/src/ctt-radio-flash).
# Exposed as the `program-radio` command (ctt-sensor-build symlink).
#
# Frees the port by stopping the channel's driver; ctt-radio-flash does the
# touch + flash, and the app's post-flash re-enumeration relaunches the driver
# via udev (the radio rule matches only the app product id, so the bootloader
# never grabs the port back). Works for any channel — on-board or USB Feather.
#
# Usage: program-radio <channel> [firmware]
set -u

CH="${1:-}"
FW="${2:-/lib/ctt/sensor-station-software/system/radios/fw/default}"
if [ -z "$CH" ]; then
  echo "usage: program-radio <channel> [firmware]" >&2
  exit 2
fi

systemctl stop "ctt-radio-driver@ch${CH}.service" 2>/dev/null || true
ctt-radio-flash "$CH" "$FW"
rc=$?

# The flashed MCU re-enumerates as the app; udev relaunches the driver. Nudge it
# in case the add event was missed.
udevadm trigger --subsystem-match=tty --action=add 2>/dev/null || true
exit "$rc"
