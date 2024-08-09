#!/bin/bash

files=$(find /etc/NetworkManager/system-connections/ -name 'p2p*' | wc -l)

if [ $files = 0  ]; then
    echo 'no p2p connections exist, creating a new one'\n
    sudo nmcli con add type ethernet con-name p2p ipv4.method link-local
    sudo systemctl restart NetworkManager
else
    echo 'p2p connection file exists, no need to create a new one'
fi
