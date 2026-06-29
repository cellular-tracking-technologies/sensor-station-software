#!/bin/bash
# Link the sensorgnome USB-hub udev rules for this board. ctt-board-detect's
# runtime CTT_BOARD (v2|v3r0|v3r3, in /run/ctt/board.env) maps 1:1 to the
# hub-rules tree, so use it directly; fall back to deriving the board from the
# persistent /etc/ctt/station-* files if board.env is missing.
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

USB_HUB_LINK=/data/usb_hub_rules.txt
echo "linking $board sensorgnome hub map (hub-rules/$hub_rules)"
rm -f "$USB_HUB_LINK"
ln -s "/lib/ctt/sensorgnome/sensorgnome/hub-rules/$hub_rules/rules.txt" "$USB_HUB_LINK"

SENSORGNOME_UDEV_DIR="/dev/sensorgnome/usb"
if [[ -d $SENSORGNOME_UDEV_DIR ]]; then
    mkdir -p $SENSORGNOME_UDEV_DIR
fi

USB_HUB_UDEV_RULES="/data/usb_hub_rules.txt"
if [[ -d $USB_HUB_UDEV_RULES ]]; then
    ln -s /lib/ctt/sensorgnome/sensorgnome/udev-rules/hub_COMPUTE_portnums.txt $USB_HUB_UDEV_RULES
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
