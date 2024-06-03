#!/bin/bash

echo 'blacklist mt7601u' > /etc/modprobe.d/blacklist-mt7601u.conf
echo 'blacklist rtw88_8821cu' > /etc/modprobe.d/blacklist-rtl8811cu.conf

modprobe -r mt7601u
modprobe -r rtw88_8821cu