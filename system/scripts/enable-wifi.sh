#!/bin/bash

mt7601u_file=/etc/modprobe.d/blacklist-mt7601u.conf
rtl8811cu_file=/etc/modprobe.d/blacklist-rtl8811cu.conf


if [ -f $mt7601u_file ]; then
    rm $mt7601u_file
    modprobe mt7601u
fi

if [ -f $rtl8811cu_file ]; then
    rm $rtl8811cu_file
    modprobe rtw88_8821cu
fi



