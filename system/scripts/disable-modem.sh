#!/bin/bash
echo 'disabling modem'
systemctl stop modem

file=/etc/systemd/system/modem.service

if [ -f $file ]; then
    systemctl disable modem
fi