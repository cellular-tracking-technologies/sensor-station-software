#!/bin/bash
# Flash one radio MCU. Thin wrapper around the native ctt-radio-flash tool
# (GPIO-free 1200-baud-touch + avrdude). Exposed as the `program-radio` command.
#
# Recovery is deterministic: the restore step waits for the flashed MCU to
# re-enumerate as the app (its /dev/ctt-radio symlink returns) and then starts
# its driver explicitly, rather than trusting the udev "add" event to relaunch
# it. Runs on ANY exit (incl. a kill mid-flash: the Caterina bootloader times out
# back to the app, then the driver is started). `systemctl start` is idempotent.
#
# Usage: program-radio <channel> [firmware]
set -u

CH="${1:-}"
FW="${2:-/lib/ctt/sensor-station-software/system/radios/fw/default}"
if [ -z "$CH" ]; then
  echo "usage: program-radio <channel> [firmware]" >&2
  exit 2
fi

restore() {
  for _ in $(seq 1 20); do
    [ -e "/dev/ctt-radio/ch${CH}" ] && break
    sleep 1
  done
  systemctl start "ctt-radio-driver@ch${CH}.service" 2>/dev/null || true
}
trap restore EXIT INT TERM

systemctl stop "ctt-radio-driver@ch${CH}.service" 2>/dev/null || true
ctt-radio-flash "$CH" "$FW"
rc=$?
# trap restore() waits for the MCU to return and starts its driver.
exit "$rc"
