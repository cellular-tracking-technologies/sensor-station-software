#!/bin/bash
# ctt-device-config — apply the canonical, per-revision /boot/config.txt.
#
# There is ONE complete config.txt per revision in
# system/device-tree/config-<board>.txt — the full device-tree state for that
# board (base settings + RTC + buttons + LED/control GPIOs), captured from the
# real image, not assembled at runtime. On boot we simply COPY the matching one
# over /boot/config.txt if it differs, then reboot ONCE so the new device tree
# loads. A single static file per revision can't have the dueling-manager /
# partial-merge failure that the old separate rtc/buttons/leds overlays had.
#
# Boot-loop BREAKER: we persist the hash of the config we last rebooted for. If a
# boot finds config.txt still != the canonical file AND we already rebooted for
# exactly that file, we apply it but DO NOT reboot again — so a persistent
# mismatch can never reboot the board more than once. Investigate via the log.
#
# This is now the ONLY thing that manages config.txt — the per-subsystem
# rtc/buttons/leds overlay services it replaced are gone. So EVERY deployed
# revision must ship a config-<board>.txt here; a board with none is left
# unmanaged (its config.txt is whatever the image shipped) and logs a warning.
set -e

REPO="${REPO:-/usr/lib/ctt/sensor-station-software}"
BOOT_CONFIG="${BOOT_CONFIG:-/boot/config.txt}"
CONF_DIR="${CONF_DIR:-$REPO/system/device-tree}"
MARKER="${MARKER:-/etc/ctt/device-config.rebooted}"

log() { echo "ctt-device-config: $*"; }

[ -r /run/ctt/board.env ] && . /run/ctt/board.env
board="${CTT_BOARD:-}"
[ -n "$board" ] || { log "no CTT_BOARD in /run/ctt/board.env — skipping"; exit 0; }

target="$CONF_DIR/config-$board.txt"
if [ ! -r "$target" ]; then
  log "WARNING no canonical config for board '$board' ($target) — config.txt is UNMANAGED. Add system/device-tree/config-$board.txt."
  exit 0
fi

if cmp -s "$target" "$BOOT_CONFIG"; then
  log "config.txt already matches the canonical $board config — no change"
  exit 0
fi

new_hash="$(sha256sum "$target" | awk '{print $1}')"
prev_hash="$(cat "$MARKER" 2>/dev/null || true)"

# Apply the canonical config either way (the on-disk file should be correct).
install -o root -g root -m 644 "$target" "$BOOT_CONFIG"
sync

if [ "$prev_hash" = "$new_hash" ]; then
  log "ERROR config.txt still differs from the canonical $board config we already"
  log "ERROR rebooted for (${new_hash:0:12}) — applied it but NOT rebooting (loop breaker). Investigate."
  exit 0
fi

mkdir -p "$(dirname "$MARKER")"
printf '%s\n' "$new_hash" > "$MARKER"
sync
log "applied canonical $board config; rebooting once (${new_hash:0:12})"
systemctl reboot
