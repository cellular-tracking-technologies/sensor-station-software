#!/bin/bash

modem=$(( $(lsusb | grep Quectel -c) + $(lsusb | grep Telit -c) ))
wifi=$(( $(lsusb | grep Ralink -c) + $(lsusb | grep Realtek -c) ))
usb_hubs=$(lsusb | grep Microchip -c)
radios=$(lsusb | grep "Adafruit Feather" -c)
usb_devices=$(( $modem + $wifi + $usb_hubs + $radios ))
usb_ports=$(( $(lsusb | grep Bus -c) - ($usb_devices + 1))) # +1 for linux USB controller

i2c_devices=0
i2c_scan=$(i2cdetect -y 1)
i2c_bus=($i2c_scan)

function create_js_object(){
	local usb_devices="$1"
	local usb_ports="$2"
	local i2c_devices="$3"

	echo "{ \"usb_devices\": $usb_devices, \"usb_ports\": $usb_ports, \"i2c_devices\": $i2c_devices}"
	# echo "{ usb_devices: $usb_devices, usb_ports: $usb_ports, i2c_devices: $i2c_devices}"

}

for address in ${i2c_bus[@]:16}	# skip first 16 addresses due to how i2cdetect prints headers
do
	if [[ "$address" != "--" ]] && [[ "$address" != *":"*  ]]; then
		i2c_devices=$((i2c_devices+1))
	fi
done

js_object=$(create_js_object $usb_devices $usb_ports $i2c_devices)

echo "$js_object"

# echo 'USB devices    : '$usb_devices
# echo 'USB ports used : '$usb_ports
# echo 'I2C devices    : '$i2c_devices
