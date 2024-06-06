#!/bin/bash
V2_RTC=ds3231
V3_RTC=mcp7941x
BOOT_CONFIG=/boot/config.txt

# get station-id from chip or read from disk
/usr/local/bin/node /lib/ctt/sensor-station-software/src/hardware/initialize.js

# check station version
typeset -i version=$(cat /etc/ctt/station-revision)

RADIO_MAP=/etc/ctt/radio-map.json
# set radio map
if test -h $RADIO_MAP; then
	echo 'deleting current radio map'
	rm $RADIO_MAP
fi

# handle versioning - radio map / rtc boot config
if test $version -ge 3; then
	# boot config for rtc
	if grep -qz $V2_RTC $BOOT_CONFIG; then
		# detected v2 rtc - need to update and reboot
		echo 'replacing v2 rtc with v3 rtc'
		sed -i "s/$V2_RTC/$V3_RTC/g" $BOOT_CONFIG

		echo 'rebooting'
		reboot
	fi
else
	# V2 station
	# boot config for rtc
	if grep -qz $V3_RTC $BOOT_CONFIG; then
		echo 'replacing v3 rtc with v2 rtc'
		sed -i "s/$V3_RTC/$V2_RTC/g" $BOOT_CONFIG

		echo 'rebooting'
		reboot
	fi

	# let's kick the gps for gps hats
	sudo pinctrl set 27 op dh
	sleep 1
	sudo pinctrl set 27 op dl
	sleep 1
	sudo pinctrl set 27 op dh
fi

