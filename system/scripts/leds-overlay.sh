#!/bin/bash
# Ensure /boot/config.txt's LED gpio-led overlays match the detected board.
#
# V2 boards drive the GPS / diag-A / diag-B status LEDs over plain GPIO (there is
# no I2C LED expander). Rather than poll them from Node over GPIO, we declare
# them as kernel gpio-led devices: the kernel exposes each at
# /sys/class/leds/<label>, and the native ctt-leds daemon writes brightness there
# (mirroring how it drives the V3 SX1509B). V3 boards have NO LED overlay — their
# LEDs hang off the SX1509B and ctt-leds actuates them over I2C — so the managed
# block is empty there.
#
# Board version comes from /run/ctt/board.env (written by ctt-board-detect); a
# one-time reboot is issued if the config changed (dtoverlays load only at boot).
# Mirrors buttons-overlay.sh / rtc-overlay.sh. Idempotent: a fast no-op once the
# block is correct.
set -e

BOOT_CONFIG="${BOOT_CONFIG:-/boot/config.txt}"
BEGIN='# >>> CTT-LEDS (managed by ctt-leds-overlay)'
END='# <<< CTT-LEDS'

# V2 status LEDs are on BCM GPIO 38/39/40 (GPS / diag-A / diag-B) — the same pins
# the retired onoff path drove, consistent across bullseye/bookworm. Each is a
# separate gpio-led instance; the kernel exposes it at /sys/class/leds/<label>.
# Default trigger is none (ctt-leds owns the brightness) and active-high
# (brightness 1 = LED on), matching the old led.write(1)=on behaviour.
v2_block() {
  cat <<'EOF'
dtoverlay=gpio-led,gpio=38,label=ctt-led-gps
dtoverlay=gpio-led,gpio=39,label=ctt-led-a
dtoverlay=gpio-led,gpio=40,label=ctt-led-b
EOF
}
# V3 LEDs live on the SX1509B (I2C) — no GPIO overlay.
v3_block() { :; }

[ -r /run/ctt/board.env ] && . /run/ctt/board.env
version="${CTT_STATION_VERSION:-$(cat /etc/ctt/station-revision 2>/dev/null || echo 3)}"
if [ "$version" -ge 3 ]; then block="$(v3_block)"; else block="$(v2_block)"; fi

# Rebuild config.txt: strip any existing managed block, then append the current
# one at the end. Steady state (block already present and correct) reproduces the
# file byte-for-byte, so no write and no reboot.
mapfile -t cur < "$BOOT_CONFIG"
out=()
in_block=0
for line in "${cur[@]}"; do
  [ "$line" = "$BEGIN" ] && { in_block=1; continue; }
  [ "$line" = "$END" ]   && { in_block=0; continue; }
  [ "$in_block" -eq 1 ]  && continue
  out+=("$line")
done
out+=("$BEGIN")
# [all] resets any preceding conditional filter (e.g. a trailing [cm4] block) so
# the overlays are not silently skipped on boards that don't match it.
out+=("[all]")
if [ -n "$block" ]; then
  while IFS= read -r b; do out+=("$b"); done <<< "$block"
fi
out+=("$END")

if [ "$(printf '%s\n' "${out[@]}")" != "$(cat "$BOOT_CONFIG")" ]; then
  echo "leds-overlay: board v$version — updating $BOOT_CONFIG + rebooting once"
  printf '%s\n' "${out[@]}" > "$BOOT_CONFIG"
  systemctl reboot
else
  echo "leds-overlay: $BOOT_CONFIG LED overlays already correct (v$version)"
fi
