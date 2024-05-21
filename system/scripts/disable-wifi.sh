#!/bin/bash

echo 'blacklist mt7601u' > /etc/modprobe.d/blacklist-wifi.conf
modprobe -r mt7601u