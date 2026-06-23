#!/bin/bash
# Flash all present radio MCUs. Thin orchestrator over the native ctt-radio-flash
# tool (GPIO-free 1200-baud-touch + avrdude). Universal: covers on-board and USB
# Feathers alike, since no reset GPIO is involved. Exposed as `program-radios`.
#
# Stops the radio interface and each channel's driver around the flash; the app's
# post-flash re-enumeration relaunches the drivers via udev (the radio rule
# matches only the app product id, so the Caterina bootloader can't grab the port
# back mid-flash). A trap restores the interface + drivers on any exit.
#
# Usage: program-radios [firmware]
set -u

FW="${1:-/lib/ctt/sensor-station-software/system/radios/fw/default}"
log_file="/data/program.log"
MAX_ATTEMPTS=5

restore() {
  udevadm trigger --subsystem-match=tty --action=add 2>/dev/null || true
  systemctl start station-radio-interface 2>/dev/null || true
}
trap restore EXIT INT TERM

# Discover present radios from their udev symlinks.
channels=""
for link in /dev/ctt-radio/ch*; do
  [ -e "$link" ] || continue
  channels="$channels ${link##*/ch}"
done
if [ -z "$channels" ]; then
  echo "program-radios: no radios present (/dev/ctt-radio/ch*)" >&2
  exit 1
fi

echo "program-radios: flashing channels:$channels"
systemctl stop station-radio-interface 2>/dev/null || true
sleep 1

for ch in $channels; do
  systemctl stop "ctt-radio-driver@ch${ch}.service" 2>/dev/null || true
  n=0
  until [ "$n" -ge "$MAX_ATTEMPTS" ]; do
    echo "$(date): programming radio ch$ch" >> "$log_file"
    ctt-radio-flash "$ch" "$FW" >> "$log_file" 2>&1 && break
    n=$((n + 1))
    sleep 2
  done
  if [ "$n" -ge "$MAX_ATTEMPTS" ]; then
    echo "program-radios: channel $ch FAILED after $MAX_ATTEMPTS attempts" >&2
  fi
done

# trap restore() relaunches the drivers (via udev) and the radio interface.
echo "program-radios: done (channels:$channels)"
