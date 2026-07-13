#!/bin/bash
# Flash radio MCUs (batch). Thin wrapper over program-radio.sh: stop the radio
# interface, flash each present channel (with retries), restart the interface.
# program-radio.sh does the per-channel work (touch/mode-detect/avrdude + driver
# stop/restart); this script only manages the shared station-radio-interface and
# iterates. Discovery uses the /dev/ctt-radio/chN symlinks, which now exist for a
# board in EITHER app OR bootloader mode — so a blank/erased MCU is flashable too.
#
# Scope (channels 1-5 are the on-board radios; >5 are separately-plugged USB dongles):
#   --all       every present radio (default)
#   --onboard   on-board radios only (channels 1-5)
#   --dongles   USB-dongle radios only (channels >5)
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

HERE="$(dirname "$(readlink -f "$0")")"
MAX_ATTEMPTS=5
channels=""
rc=0

restore() {
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
  n=0
  until [ "$n" -ge "$MAX_ATTEMPTS" ]; do
    "$HERE/program-radio.sh" "$ch" "$FW" && break
    n=$((n + 1))
    sleep 2
  done
  if [ "$n" -ge "$MAX_ATTEMPTS" ]; then
    echo "program-radios: channel $ch FAILED after $MAX_ATTEMPTS attempts" >&2
    rc=1
  fi
done

echo "program-radios: flashed channels:$channels — restarting radio interface"
exit "$rc"
