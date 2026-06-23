#!/bin/bash
# Flash radio MCUs. Thin orchestrator over the native ctt-radio-flash tool
# (GPIO-free 1200-baud-touch + avrdude). Universal: on-board and USB-dongle
# Feathers flash the same way. Exposed as the `program-radios` command.
#
# Scope (channels 1-5 are the on-board radios; >5 are separately-plugged USB
# dongles):
#   --all       every present radio (default)
#   --onboard   on-board radios only (channels 1-5)
#   --dongles   USB-dongle radios only (channels >5)
# So `program-radios --dongles` reprograms only the dongles you've plugged in,
# leaving the on-board radios untouched.
#
# Recovery is deterministic: rather than trust the udev "add" event to relaunch a
# driver after the MCU re-enumerates, the restore step waits for each flashed
# radio to come back as the app (its /dev/ctt-radio symlink returns) and starts
# its driver explicitly. It runs on ANY exit (incl. a kill mid-flash: the
# Caterina bootloader times out back to the app, then the driver is started).
# `systemctl start` is idempotent.
#
# Usage: program-radios [--all|--onboard|--dongles] [firmware]
set -u

scope=all
FW=""
for arg in "$@"; do
  case "$arg" in
    --all) scope=all ;;
    --onboard) scope=onboard ;;
    --dongles) scope=dongles ;;
    -h | --help)
      echo "usage: program-radios [--all|--onboard|--dongles] [firmware]"
      exit 0
      ;;
    *) FW="$arg" ;;
  esac
done
FW="${FW:-/lib/ctt/sensor-station-software/system/radios/fw/default}"

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

# Discover present radios, filtered by scope (on-board = 1-5, dongles = >5).
for link in /dev/ctt-radio/ch*; do
  [ -e "$link" ] || continue
  ch="${link##*/ch}"
  case "$ch" in
    '' | *[!0-9]*) continue ;; # not a numeric channel
  esac
  case "$scope" in
    onboard) [ "$ch" -le 5 ] || continue ;;
    dongles) [ "$ch" -ge 6 ] || continue ;;
  esac
  channels="$channels $ch"
done
if [ -z "$channels" ]; then
  echo "program-radios: no radios present in scope '$scope' (/dev/ctt-radio/ch*)" >&2
  exit 1
fi

echo "program-radios: scope=$scope, flashing channels:$channels"
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
