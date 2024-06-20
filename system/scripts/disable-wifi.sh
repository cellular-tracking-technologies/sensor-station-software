#!/bin/bash

mt7601u_chip=$(lsmod | grep mt7601u | wc -l)
rtw88_8821cu_chip=$(lsmod | grep rtw88_8821cu | wc -l)

if [ $mt7601u_chip -gt 0 ]; then 
    echo 'blacklist mt7601u' > /etc/modprobe.d/blacklist-mt7601u.conf
    modprobe -r mt7601u;
fi

if [ $rtw88_8821cu_chip -gt 0 ]; then
    echo 'blacklist rtw88_8821cu' > /etc/modprobe.d/blacklist-rtl8811cu.conf
    modprobe -r rtw88_8821cu;
fi
