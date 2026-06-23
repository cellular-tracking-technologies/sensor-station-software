#!/usr/bin/bash
# Print the station ID. Exposed as the `station-id` command (ctt-sensor-build
# symlinks this to /usr/local/sbin/station-id).
#
# Board identity is resolved once at boot by the native ctt-board-detect daemon,
# which publishes it to /run/ctt/board.env (CTT_STATION_ID) and to the persistent
# /etc/ctt/station-id. Read the runtime file first, fall back to the persistent
# one. This replaces the old path (V3 read the I2C ID chip via a Node script,
# V2 shelled out to hashlet) now that ctt-board-detect handles both.
set -e

if [ -r /run/ctt/board.env ]; then
  # shellcheck disable=SC1091
  . /run/ctt/board.env
fi

if [ -n "${CTT_STATION_ID:-}" ]; then
  echo "$CTT_STATION_ID"
elif [ -r /etc/ctt/station-id ]; then
  cat /etc/ctt/station-id
else
  echo "station-id: no board identity available (is ctt-board-detect running?)" >&2
  exit 1
fi
