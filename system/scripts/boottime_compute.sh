#!/bin/bash
typeset -i version=$(cat /etc/ctt/station-revision)
USB_HUB_LINK=/data/usb_hub_rules.txt
if test -f $USB_HUB_LINK; then
	rm $USB_HUB_LINK
fi

typeset -i version=$(cat /etc/ctt/station-revision)
if test $version -ge 3
then
	typeset -i revision=$(cat /etc/ctt/station-board-revision)
	case $revision in
		2)
			# V3 radio map revision 3
            echo 'linking v3 revision 3 sensorgnome hub map'
            ln -s /lib/ctt/sensorgnome/sensorgnome/hub-rules/v3/r3/rules.txt $USB_HUB_LINK ;;

		*)
			# V3 Radio Map for revision 0, 1 boards - defaulting
            echo 'linking v3 revision 1,2 sensorgnome hub map'
            ln -s /lib/ctt/sensorgnome/sensorgnome/hub-rules/v3/r0/rules.txt $USB_HUB_LINK ;;
	esac
else
	# V2 radio map
	echo 'lniking v2 sensorgnome hub map'
    ln -s /lib/ctt/sensorgnome/sensorgnome/hub-rules/v2/rules.txt $USB_HUB_LINK
fi

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
