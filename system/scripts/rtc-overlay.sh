#!/bin/bash
# Ensure /boot/config.txt's RTC dtoverlay matches the detected board:
#   V2 -> ds3231,  V3 -> mcp7941x.
# On a compute-module swap the config carries the previous board's RTC overlay;
# fix it and reboot once so the correct RTC binds on the next boot. On a normal
# boot (config already correct) this is a no-op.
#
# Ported from sensor-station-software/system/scripts/save-station-id.sh. Reads the
# board version that ctt-board-detect wrote to /etc/ctt/station-revision.

set -e
V2_RTC=ds3231
V3_RTC=mcp7941x
BOOT_CONFIG="${BOOT_CONFIG:-/boot/config.txt}"

[ -r /run/ctt/board.env ] && . /run/ctt/board.env
version="${CTT_STATION_VERSION:-$(cat /etc/ctt/station-revision 2>/dev/null || echo 3)}"
if [ "$version" -ge 3 ]; then
  want="$V3_RTC"; other="$V2_RTC"
else
  want="$V2_RTC"; other="$V3_RTC"
fi

if grep -q "$other" "$BOOT_CONFIG"; then
  echo "rtc-overlay: board v$version wants $want; $BOOT_CONFIG has $other — fixing + rebooting"
  sed -i "s/$other/$want/g" "$BOOT_CONFIG"
  systemctl reboot
else
  echo "rtc-overlay: $BOOT_CONFIG RTC overlay already correct ($want)"
fi
