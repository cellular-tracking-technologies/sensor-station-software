#!/bin/bash
# Publish /data/usb_hub_rules.txt: the sensorgnome USB-hub port map for this
# board, re-anchored onto the USB controller this boot actually enumerated.
#
# ctt-board-detect's runtime CTT_BOARD (v2|v3r0|v3r3, in /run/ctt/board.env)
# maps 1:1 to the hub-rules tree, so use it directly; fall back to deriving the
# board from the persistent /etc/ctt/station-* files if board.env is missing.
[ -r /run/ctt/board.env ] && . /run/ctt/board.env

board="$CTT_BOARD"
if [ -z "$board" ]; then
  v=$(cat /etc/ctt/station-revision 2>/dev/null || echo 3)
  r=$(cat /etc/ctt/station-board-revision 2>/dev/null || echo 0)
  if [ "$v" -ge 3 ]; then
    [ "$r" -eq 2 ] && board=v3r3 || board=v3r0
  else
    board=v2
  fi
fi

# CTT_BOARD -> hub-rules subdir (v3r3 -> v3/r3, v3r0 -> v3/r0, v2 -> v2)
case "$board" in
  v2)   hub_rules=v2 ;;
  v3r3) hub_rules=v3/r3 ;;
  v3r0) hub_rules=v3/r0 ;;
  *)    hub_rules=v3/r0 ;;  # unknown board -> default to V3 r0
esac

USB_HUB_MAP=/data/usb_hub_rules.txt
SRC="/lib/ctt/sensorgnome/sensorgnome/hub-rules/$hub_rules/rules.txt"

# ---------------------------------------------------------------------------
# Why this map is rewritten instead of symlinked
#
# sensorgnome's get_usb_device_port_number.awk turns a udev %p devpath into a
# physical port number by LITERAL PREFIX MATCH against column 1 of this map; it
# does no globbing. The hub-rules files record the CM3 controller
# (/devices/platform/soc/3f980000.usb/usb1/...), but the controller address is a
# property of the SoC *and* of its config: a CM4/CM4S with otg_mode enumerates
# under /devices/platform/scb/fe9c0000.xhci/usb1/..., the same module without
# otg_mode under /devices/platform/soc/fe980000.usb/usb1/..., and a
# VL805-equipped CM4 hangs off PCIe entirely. The port topology *after* the
# controller is identical on all of them, and it is the port -- not the
# controller -- that names the antenna.
#
# So copy the map rather than linking it, and for every root hub present in
# sysfs this boot also emit the same port tail anchored under that hub's real
# devpath. The map's own CM3 lines are kept verbatim, so swapping a CM3 module
# back in keeps working, and no SoC generation needs its own map or a re-flash.
# This is the same reasoning as the ID_PATH globbing in system/radios/
# generate-rules.mjs, expressed as data because the awk cannot glob.
#
# Without it nothing matches on a CM4: the awk falls through to its "internal"
# default, which its printf "%d" renders as 0, so every FUNcube and RTL-SDR is
# announced as .port=0. They then collide on the single /dev/sensorgnome/usb/0
# link and sensorgnome cannot tell which antenna each receiver is on.
# ---------------------------------------------------------------------------
generate_map() {
  local path port head rest srcbus tail bus root t entry d
  local -a roots=()

  # "<busnum> <root-hub devpath>" for each root hub the kernel enumerated.
  for d in /sys/bus/usb/devices/usb[0-9]*; do
    [ -e "$d" ] || continue
    root=$(readlink -f "$d") || continue
    roots+=("${d##*/usb} ${root#/sys}")
  done
  [ ${#roots[@]} -gt 0 ] || return 1

  # "|| [ -n "$path" ]" so the final line is still processed when the map has
  # no trailing newline -- none of the shipped hub-rules files end in one, and
  # without this the highest-numbered port is silently dropped from the map.
  while read -r path port || [ -n "$path" ]; do
    case "$path" in
      ''|'#'*)     continue ;;
      */usb[0-9]*) ;;
      *)           echo "$path $port"; continue ;;  # unrecognised shape: pass through
    esac

    echo "$path $port"        # the map's own controller, verbatim

    head=${path%%/usb[0-9]*}  # /devices/platform/soc/3f980000.usb
    rest=${path#"$head"/usb}  # 1/1-1/1-1.5
    srcbus=${rest%%/*}        # 1
    tail=${rest#"$srcbus"}    # /1-1/1-1.5

    for entry in "${roots[@]}"; do
      bus=${entry%% *}
      root=${entry#* }
      [ "$root" = "$head/usb$srcbus" ] && continue  # already emitted verbatim above
      t=$tail
      # Port names embed the bus number ("1-1.5"); renumber if this hub differs.
      [ "$bus" = "$srcbus" ] || t=$(printf '%s' "$tail" | sed "s|/$srcbus-|/$bus-|g")
      echo "$root$t $port"
    done
  done < "$SRC"
}

tmp=$(mktemp /data/.usb_hub_rules.XXXXXX 2>/dev/null) || tmp=$(mktemp)
if [ -r "$SRC" ] && generate_map > "$tmp" && [ -s "$tmp" ]; then
  echo "publishing $board sensorgnome hub map (hub-rules/$hub_rules): $(wc -l < "$tmp") routes"
  chmod 0644 "$tmp"
  rm -f "$USB_HUB_MAP"   # historically a symlink into /lib; replace with a real file
  mv "$tmp" "$USB_HUB_MAP"
else
  # Cannot read or rewrite the map: fall back to the historical symlink, so the
  # file at least exists for a board whose controller the map already matches.
  echo "WARNING: cannot rewrite $SRC; linking it unmodified" >&2
  rm -f "$tmp" "$USB_HUB_MAP"
  ln -s "$SRC" "$USB_HUB_MAP"
fi

# The rtlsdr rule links /dev/sensorgnome/<name> from /dev/sensorgnome/usb/<port>,
# so that directory has to exist. (It used to be created only when it already
# existed, an inverted test that never fired.)
mkdir -p /dev/sensorgnome/usb

# bootcount runs late -- it needs /data mounted and board.env written -- so the
# kernel has long since enumerated USB by the time the map above lands, and any
# receiver present at power-on was already labelled .port=0 against the map that
# was still wrong. Re-fire just the SDR rules to relabel them. Match on vid:pid
# rather than re-triggering the whole usb subsystem, which would also re-fire the
# modem and network rules and could bounce a live connection. Same pattern as
# ctt-board-detect's ExecStartPost re-trigger of the tty rules.
SDR_IDS=(
  04d8:fb56  # FUNcube Dongle Pro
  04d8:fb31  # FUNcube Dongle Pro+
  0bda:2832  # RTL2832U
  0bda:2838  # RTL2832U OEM (ezcap EzTV668, Newsky TV28T, ...)
  1f4d:d286  # DigitalNow Quad DVB-T
  1f4d:d803  # PROlectrix DV107669
)
if command -v udevadm >/dev/null 2>&1; then
  for id in "${SDR_IDS[@]}"; do
    udevadm trigger --action=add --subsystem-match=usb \
      --attr-match=idVendor="${id%%:*}" --attr-match=idProduct="${id##*:}" || true
  done
  # A FUNcube is labelled from its ALSA control node, not from the usb device.
  udevadm trigger --action=add --subsystem-match=sound || true
  udevadm settle --timeout=10 || true
fi

BOOT_COUNT_FILE="/etc/bootcount"
if [[ -f $BOOT_COUNT_FILE ]]; then
    COUNT=`cat $BOOT_COUNT_FILE`;
    if [[ "$COUNT" == "" ]]; then
        COUNT=0;
    fi
    echo $(( 1 + $COUNT )) > $BOOT_COUNT_FILE
else
    echo 1 > $BOOT_COUNT_FILE
fi
