#!/bin/bash

typeset -i version=$(cat /etc/ctt/station-revision)
if test $version -ge 3
then
	# V3 radio map
	echo 'v3 radio map'
	CHANNEL1='/dev/serial/by-path/platform-3f980000.usb-usb-0:1.2.2:1.0'
	CHANNEL2='/dev/serial/by-path/platform-3f980000.usb-usb-0:1.2.3:1.0'
	CHANNEL3='/dev/serial/by-path/platform-3f980000.usb-usb-0:1.2.4:1.0'
	CHANNEL4='/dev/serial/by-path/platform-3f980000.usb-usb-0:1.2.5:1.0'
	CHANNEL5='/dev/serial/by-path/platform-3f980000.usb-usb-0:1.2.6:1.0'
else
	# V2 radio map
	echo 'v2 radio map'
	CHANNEL1='/dev/serial/by-path/platform-3f980000.usb-usb-0:1.2.2:1.0'
	CHANNEL2='/dev/serial/by-path/platform-3f980000.usb-usb-0:1.3.1:1.0'
	CHANNEL3='/dev/serial/by-path/platform-3f980000.usb-usb-0:1.3.2:1.0'
	CHANNEL4='/dev/serial/by-path/platform-3f980000.usb-usb-0:1.3.3:1.0'
	CHANNEL5='/dev/serial/by-path/platform-3f980000.usb-usb-0:1.3.4:1.0'
fi

# pinouts are the same for v2 and v3
PIN1=12
PIN2=34
PIN3=35
PIN4=36
PIN5=37


case $1 in
	1)
		CHANNEL=$CHANNEL1
		PIN=$PIN1
		;;
	2)
		CHANNEL=$CHANNEL2
		PIN=$PIN2
		;;
	3)
		CHANNEL=$CHANNEL3
		PIN=$PIN3
		;;
	4)
		CHANNEL=$CHANNEL4
		PIN=$PIN4
		;;
	5)
		CHANNEL=$CHANNEL5
		PIN=$PIN5
		;;
	*)
		echo "Invalid channel: $1 - input argument needs to be integer 1 - 5"
		exit -1
esac

if [ "$2" != "" ]; then
	if test -f "$2"; then
		FW_FILE=$2
	else
		echo "Radio FW File $2 does not exist"
		exit -2
	fi
else
	echo "Expected radio fw file as second input arg"
		exit -3
fi


echo "$CHANNEL"
raspi-gpio set $PIN op dl
sleep 0.2
raspi-gpio set $PIN op dh
sleep 0.2
raspi-gpio set $PIN ip
sleep 1 

avrdude -P $CHANNEL -c avr109 -patmega32u4  -b 57600 -D -v -Uflash:w:$FW_FILE:i
