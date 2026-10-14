#!/bin/bash

#load chipsets array
# source kernel-chipsets.sh
source /lib/ctt/sensor-station-software/system/scripts/kernel-chipsets.sh
cp /lib/ctt/sensor-station-software/system/scripts/8821cu.conf /etc/modprobe.d/.

chipcount=${#CHIPS[@]}

for chipset in "${CHIPS[@]}"
do
    filename="/etc/modprobe.d/blacklist-$chipset.conf"
    if [ -f  $filename ]; then
        echo "deleting blacklist file $filename"
        rm $filename
    fi
    modprobe $chipset
done

# The modprobe above creates a fresh wlan0. NetworkManager/wpa_supplicant are
# still bound to the previous (now-removed) interface, so WiFi scans silently
# return nothing until they re-attach — which is why enabling WiFi used to need
# a reboot before a scan would work. Restart the two services to re-attach them
# to the new interface (no reboot required).
echo "restarting wpa_supplicant and NetworkManager to re-attach to wlan0"
sudo systemctl restart wpa_supplicant
sudo systemctl restart NetworkManager




