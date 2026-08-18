#!/bin/bash

#load chipsets array
# source kernel-chipsets.sh
source /lib/ctt/sensor-station-software/system/scripts/kernel-chipsets.sh
cp /lib/ctt/sensor-station-software/system/scripts/8821cu.conf /etc/modprobe.d/.

chipcount=${#CHIPS[@]}
loaded=0

for chipset in "${CHIPS[@]}"
do
    filename="/etc/modprobe.d/blacklist-$chipset.conf"
    if [ -f  $filename ]; then
        echo "deleting blacklist file $filename"
        rm $filename
    fi
    # Report modprobe failures. "The module is missing for this kernel" and
    # "wifi is switched off" need completely different fixes, but the error was
    # previously swallowed and this script still exited 0 -- so a driver that
    # was never built for the running kernel presented to the operator as
    # "wifi won't enable". See system/modules/README.md and wifi-8821cu-cm4s.md.
    if err=$(modprobe "$chipset" 2>&1); then
        echo "loaded $chipset"
        loaded=$((loaded + 1))
    else
        echo "WARNING: modprobe $chipset failed: $err" >&2
    fi
done

if [ "$loaded" -eq 0 ]; then
    echo "ERROR: no wifi driver loaded for kernel $(uname -r) (tried: ${CHIPS[*]})" >&2
    echo "       a prebuilt module may be missing for this kernel -- see system/modules/README.md" >&2
    exit 1
fi
