#!/bin/bash
# Flash all present radio MCUs. Thin orchestrator over the native ctt-radio-flash
# tool (GPIO-free 1200-baud-touch + avrdude). Universal: on-board and USB
# Feathers alike. Exposed as the `program-radios` command.
#
# Recovery is deterministic: rather than trust the udev "add" event to relaunch a
# driver after the MCU re-enumerates (that event can be missed), the restore step
# waits for each flashed radio to come back as the app (its /dev/ctt-radio symlink
# returns) and then starts its driver explicitly. It runs on ANY exit — including
# a kill mid-flash, where the Caterina bootloader simply times out back to the app
# and the driver is then started. `systemctl start` is idempotent, so it is a
# no-op if udev already relaunched the driver.
#
# Usage: program-radios [firmware]
set -u

FW="${1:-/lib/ctt/sensor-station-software/system/radios/fw/default}"
log_file="/data/program.log"
MAX_ATTEMPTS=5
channels=""

restore() {
  for ch in $channels; do
    # Wait (bounded) for the flashed MCU to re-enumerate as the app.
    for _ in $(seq 1 20); do
      [ -e "/dev/ctt-radio/ch${ch}" ] && break
      sleep 1
    done
    systemctl start "ctt-radio-driver@ch${ch}.service" 2>/dev/null || true
  done
  systemctl start station-radio-interface 2>/dev/null || true
}
trap restore EXIT INT TERM

# Discover present radios from their udev symlinks.
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

# trap restore() waits for each MCU to return, starts its driver, and restarts
# the radio interface.
echo "program-radios: flashed channels:$channels — restoring drivers + interface"
