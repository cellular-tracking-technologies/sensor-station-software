#!/bin/bash

file=/etc/modprobe.d/blacklist-wifi.conf

if [ -f $file ]; then
    rm $file
fi

modprobe mt7601u