#!/bin/bash
# Kick the GPS on V2 stations with GPS HATs by toggling GPIO 27. V2-only; V3
# stations have onboard GPS and skip this. Ported from save-station-id.sh.
#
# Reads the board version ctt-board-detect publishes to /run/ctt/board.env
# (CTT_STATION_VERSION), falling back to the persistent /etc/ctt/station-revision.

set -e
[ -r /run/ctt/board.env ] && . /run/ctt/board.env
version="${CTT_STATION_VERSION:-$(cat /etc/ctt/station-revision 2>/dev/null || echo 3)}"
if [ "$version" -ge 3 ]; then
  echo "gps-kick: V$version (>=3) has onboard GPS — skipping"
  exit 0
fi

raspi-gpio set 27 op dh
sleep 1
raspi-gpio set 27 op dl
sleep 1
raspi-gpio set 27 op dh
echo "gps-kick: toggled GPIO 27 (V2 GPS HAT)"
