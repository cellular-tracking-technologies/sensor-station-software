#!/bin/bash

#load chipsets array
# source kernel-chipsets.sh
source /lib/ctt/sensor-station-software/system/scripts/kernel-chipsets.sh


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




