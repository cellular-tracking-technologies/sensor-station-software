#!/bin/bash
# collect-diagnostics — gather a sensor station's diagnostic bundle ON THIS STATION.
#
# Usage (SSH into the station first, then):  collect-diagnostics [dest-dir]
#
# Writes a read-only snapshot of identity, hardware, services, modem/SIM state and
# logs to a .tar.gz (default under /tmp) and prints its path. Runs as the ctt user —
# no sudo needed: ctt is in adm/video/i2c/dialout, so it can already read syslog,
# vcgencmd, lsusb, mmcli -L/-m/-i, nmcli (non-secret fields), dmesg and /run/ctt/*.
# Nothing on the station is modified.
#
# Client-side helpers that SSH in, run this, and pull the tarball back live in the
# ctt-context-engineering repo (tools/collect-diagnostics.sh for Unix, .ps1 for
# Windows) — this on-station collector is the single source of truth for WHAT is
# collected; those wrappers just invoke it.
set -u

DEST="${1:-/tmp}"
umask 077

[ -r /run/ctt/board.env ] && . /run/ctt/board.env
STATION_ID="${CTT_STATION_ID:-$(cat /etc/ctt/station-id 2>/dev/null)}"
STATION_ID="$(printf '%s' "${STATION_ID:-$(hostname)}" | tr -cd 'A-Za-z0-9._-')"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="/tmp/ctt-diag-${STATION_ID}-${TS}"
mkdir -p "$OUT"

cap() { local f="$1"; shift; { echo "\$ $*"; "$@"; } >"$OUT/$f" 2>&1; }

{ echo "station_id:    $STATION_ID"; echo "collected_utc: $TS"; echo
  echo "== /run/ctt/board.env =="; cat /run/ctt/board.env 2>/dev/null
  echo; echo "== /etc/ctt versions =="
  for f in station-id station-image station-software station-board-revision station-revision; do
    printf "%-26s %s\n" "$f" "$(cat "/etc/ctt/$f" 2>/dev/null)"; done
} >"$OUT/00-identity.txt"

# station run-config, raw (parameters only — no credentials live here)
[ -r /etc/ctt/station-config.json ] && cp /etc/ctt/station-config.json "$OUT/00-station-config.json" 2>/dev/null

cap 01-uname.txt          uname -a
cap 01-os-release.txt     cat /etc/os-release
cap 01-uptime.txt         uptime
cap 01-throttled.txt      vcgencmd get_throttled      # 0x0=healthy; bit set = undervoltage/throttle
cap 01-temp.txt           vcgencmd measure_temp
cap 01-disk.txt           df -h
cap 01-mem.txt            free -h

cap 02-lsusb.txt          lsusb
cap 02-lsusb-tree.txt     lsusb -t
cap 02-serial-by-id.txt   ls -l /dev/serial/by-id/
cap 02-serial-by-path.txt ls -l /dev/serial/by-path/

cap 03-run-ctt-tree.txt   ls -laR /run/ctt
for f in board.env sensors.json lcd leds modem-apn; do
  [ -r "/run/ctt/$f" ] && cp "/run/ctt/$f" "$OUT/03-run-$f" 2>/dev/null; done
command -v i2cdetect >/dev/null && cap 03-i2cdetect.txt i2cdetect -y 1

cap 04-failed-units.txt   systemctl --failed --no-pager
cap 04-ctt-units.txt      systemctl list-units --no-pager 'ctt*' 'station*' 'sensorgnome*' 'ModemManager*' 'NetworkManager*'

# Modem / SIM: index the modem, then capture the modem, the SIM (ICCID/IMSI) and the bearer.
MIDX="$(mmcli -L 2>/dev/null | grep -oE '/Modem/[0-9]+' | grep -oE '[0-9]+' | head -1)"
cap 05-mmcli-L.txt        mmcli -L
[ -n "$MIDX" ] && cap 05-mmcli-modem.txt mmcli -m "$MIDX"
SIDX="$(mmcli -m "$MIDX" 2>/dev/null | grep -oE '/SIM/[0-9]+' | grep -oE '[0-9]+' | head -1)"
[ -n "$MIDX" ] && [ -n "$SIDX" ] && cap 05-mmcli-sim.txt mmcli -m "$MIDX" -i "$SIDX"
BIDX="$(mmcli -m "$MIDX" 2>/dev/null | grep -oE '/Bearer/[0-9]+' | grep -oE '[0-9]+' | head -1)"
[ -n "$BIDX" ] && cap 05-mmcli-bearer.txt mmcli -b "$BIDX"
cap 05-nmcli-dev.txt      nmcli -t -f DEVICE,TYPE,STATE d
cap 05-nmcli-modem.txt    nmcli c show station-modem
cap 05-ip-addr.txt        ip -br addr
cap 05-ip-route.txt       ip route

# Cellular data usage. Two views, because they answer different questions:
#   - the cumulative total maintained by cell-usage.js, which survives the
#     counter resets that happen on every boot and modem re-enumeration;
#   - the raw per-interface kernel counters, which are only valid for the
#     CURRENT interface lifetime and are here to cross-check the total.
[ -r /var/lib/ctt/cell-usage.json ] && cp /var/lib/ctt/cell-usage.json "$OUT/05-cell-usage.json" 2>/dev/null
{
  echo "\$ per-interface byte counters (raw; reset on interface recreation)"
  for i in mdm0 wwan0 ppp0; do
    [ -d "/sys/class/net/$i" ] || continue
    echo "$i ifindex=$(cat "/sys/class/net/$i/ifindex" 2>/dev/null)" \
         "rx_bytes=$(cat "/sys/class/net/$i/statistics/rx_bytes" 2>/dev/null)" \
         "tx_bytes=$(cat "/sys/class/net/$i/statistics/tx_bytes" 2>/dev/null)" \
         "operstate=$(cat "/sys/class/net/$i/operstate" 2>/dev/null)"
  done
} >"$OUT/05-net-counters.txt" 2>&1

cap 06-dmesg.txt          dmesg -T   # note: pre-NTP boot lines may be mis-timestamped

# pack: tar syslogs straight from /var/log (no copy -> safe on low disk / tmpfs)
mkdir -p "$DEST" 2>/dev/null
TARBALL="${DEST%/}/ctt-diag-${STATION_ID}-${TS}.tar.gz"
SYSLOGS="$(cd /var/log && ls syslog* 2>/dev/null)"
tar czf "$TARBALL" -C /tmp "$(basename "$OUT")" ${SYSLOGS:+-C /var/log $SYSLOGS}
rm -rf "$OUT"

echo "diagnostic bundle: $TARBALL"
