#!/bin/bash
# Flash one radio MCU (Adafruit Feather 32u4). This script IS the flasher — pure shell,
# no native helper. The two hardware steps:
#   - 1200-baud touch (stty): open the port at 1200 baud and close it (dropping DTR),
#                             which resets an app board into its Caterina bootloader
#   - avrdude               : the proven AVR109 flashing backend
#
# It works whether the board is in APP mode (idProduct 800c -> touch into the bootloader)
# or ALREADY in the bootloader (000c -> flash directly; e.g. a blank/erased MCU). It
# targets the stable /dev/serial/by-path entry, which survives the app<->bootloader
# re-enumeration (the ttyACM* number does not).
#
# Recovery is deterministic: on ANY exit it waits (bounded) for the flashed MCU to
# re-enumerate as the app (its /dev/ctt-radio symlink returns) and starts its driver.
#
# Usage: program-radio <channel> [firmware]
set -u

CH="${1:-}"
FW="${2:-/lib/ctt/sensor-station-software/system/radios/fw/default}"
[ -n "$CH" ] || { echo "usage: program-radio <channel> [firmware]" >&2; exit 2; }

DEV="/dev/ctt-radio/ch${CH}"   # PID-agnostic: present in app OR bootloader mode

restore() {
  for _ in $(seq 1 20); do [ -e "$DEV" ] && break; sleep 1; done
  systemctl start "ctt-radio-driver@ch${CH}.service" 2>/dev/null || true
}
trap restore EXIT INT TERM

# Free the port (idempotent; a bootloader-mode board has no driver running).
systemctl stop "ctt-radio-driver@ch${CH}.service" 2>/dev/null || true
sleep 0.3

[ -e "$DEV" ] || { echo "program-radio: $DEV not present" >&2; exit 1; }
[ -f "$FW" ]  || { echo "program-radio: firmware '$FW' not found" >&2; exit 2; }

# Resolve the stable physical-port handle (survives app<->bootloader re-enumeration).
real="$(readlink -f "$DEV")"
bypath=""
for p in /dev/serial/by-path/*; do
  [ "$(readlink -f "$p" 2>/dev/null)" = "$real" ] && { bypath="$p"; break; }
done
[ -n "$bypath" ] || { echo "program-radio: no /dev/serial/by-path entry for $DEV" >&2; exit 1; }

# Current mode: ID_MODEL_ID is the USB idProduct (800c app, 000c Caterina bootloader).
pid="$(udevadm info -q property -n "$DEV" 2>/dev/null | sed -n 's/^ID_MODEL_ID=//p')"

if [ "$pid" = "800c" ] || [ -z "$pid" ]; then
  echo "program-radio: ch$CH app mode (${pid:-unknown}) -> 1200-baud touch"
  # 1200-baud touch: hold the port open at 1200 baud briefly, then close it (hupcl drops
  # DTR), which the Caterina core detects and jumps to the bootloader. Pure stty.
  exec 3<>"$bypath" || { echo "program-radio: cannot open $bypath for touch" >&2; exit 1; }
  stty -F "$bypath" 1200 hupcl
  sleep 0.3
  exec 3>&-
  # Watch the physical port drop (app) then reappear (bootloader) at the same by-path.
  for _ in $(seq 1 50);  do [ -e "$bypath" ] || break; sleep 0.1; done
  [ -e "$bypath" ] && { echo "program-radio: port did not reset (still holding it?)" >&2; exit 1; }
  for _ in $(seq 1 100); do [ -e "$bypath" ] && break; sleep 0.1; done
  [ -e "$bypath" ] || { echo "program-radio: bootloader did not appear" >&2; exit 1; }
  sleep 0.5
else
  echo "program-radio: ch$CH already in bootloader ($pid) -> flashing directly, no touch"
fi

echo "program-radio: avrdude avr109 -> $bypath  ($FW)"
avrdude -c avr109 -p atmega32u4 -P "$bypath" -b 57600 -D -U "flash:w:${FW}:i"
# restore() (trap) waits for the MCU to return as the app and starts its driver.
