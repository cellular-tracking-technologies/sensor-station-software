#!/bin/bash
# Ensure /boot/config.txt's button gpio-key overlays match the detected board.
#
# The four front-panel buttons are exposed to userspace as standard input
# (evdev) devices by the kernel gpio-keys driver, rather than being polled over
# GPIO from Node. station-lcd-interface reads key events from them. V2 and V3
# wire the buttons to different GPIOs, so the correct overlay block is selected
# from the board version ctt-board-detect wrote to /run/ctt/board.env, and a
# one-time reboot is issued if the config changed (dtoverlays load only at boot).
#
# Mirrors rtc-overlay.sh. Idempotent: a fast no-op once the block is correct.
set -e

BOOT_CONFIG="${BOOT_CONFIG:-/boot/config.txt}"
BEGIN='# >>> CTT-BUTTONS (managed by ctt-buttons-overlay)'
END='# <<< CTT-BUTTONS'

# Button -> keycode: Up=KEY_UP(103) Down=KEY_DOWN(108) Select=KEY_ENTER(28) Back=KEY_ESC(1).
# active_low=0 + gpio_pull=down: the buttons read active-high (a press drives the
# line high), matching the rising-edge convention the previous GPIO code used.
# Each line is a separate gpio-key instance; the kernel names the input device
# "button@<gpio>" (Phys "gpio-keys/inputN"), which button-input.js matches on.
v3_block() {
  cat <<'EOF'
dtoverlay=gpio-key,gpio=17,active_low=0,gpio_pull=down,keycode=103,label=ctt-btn-up
dtoverlay=gpio-key,gpio=22,active_low=0,gpio_pull=down,keycode=108,label=ctt-btn-down
dtoverlay=gpio-key,gpio=27,active_low=0,gpio_pull=down,keycode=28,label=ctt-btn-select
dtoverlay=gpio-key,gpio=8,active_low=0,gpio_pull=down,keycode=1,label=ctt-btn-back
EOF
}
v2_block() {
  cat <<'EOF'
dtoverlay=gpio-key,gpio=4,active_low=0,gpio_pull=down,keycode=103,label=ctt-btn-up
dtoverlay=gpio-key,gpio=5,active_low=0,gpio_pull=down,keycode=108,label=ctt-btn-down
dtoverlay=gpio-key,gpio=6,active_low=0,gpio_pull=down,keycode=28,label=ctt-btn-select
dtoverlay=gpio-key,gpio=7,active_low=0,gpio_pull=down,keycode=1,label=ctt-btn-back
EOF
}

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
# [all] resets the conditional section: appending at EOF would otherwise inherit
# a preceding filter (e.g. a trailing [cm4] block) and the overlays would be
# silently skipped on boards that don't match it.
out+=("[all]")
while IFS= read -r b; do out+=("$b"); done <<< "$block"
out+=("$END")

if [ "$(printf '%s\n' "${out[@]}")" != "$(cat "$BOOT_CONFIG")" ]; then
  echo "buttons-overlay: board v$version — updating $BOOT_CONFIG + rebooting once"
  printf '%s\n' "${out[@]}" > "$BOOT_CONFIG"
  systemctl reboot
else
  echo "buttons-overlay: $BOOT_CONFIG button overlays already correct (v$version)"
fi
