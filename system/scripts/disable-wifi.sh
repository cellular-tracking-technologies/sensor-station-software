#!/bin/bash

# load chipsets array
source kernel-chipsets.sh

disable_chip () 
{
    chipset=$1
    filename="/etc/modprobe.d/blacklist-$chipset.conf"
    echo "writing to $filename"
    echo "blacklist $chipset" > $filename
    modprobe -r "$chipset"
}

handle_chip ()
{
    chipset=$1
    if [ -z "$chipset" ]; then
        echo "chipset expected as first argument"
        return -1
    fi

    chip_check=$(lsmod | grep -a $chipset | wc -l)
    if [ $chip_check -gt 0 ]; then
        disable_chip $chipset
        return 0
    else
        return -1
    fi
}

chipcount=${#CHIPS[@]}
for ((i=0; i< ${chipcount}; i++ ));
do 
    chipset=${CHIPS[$i]}
    handle_chip $chipset
done

