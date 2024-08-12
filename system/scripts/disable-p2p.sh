#!/bin/bash

ETH0_UUIDS=$(nmcli connection show | grep eth0 | grep -E -o '[0-9a-f\-]{36}')

echo $ETHO_UUIDS

while IFS= read -r UUID
    do sudo nmcli connection delete $UUID
done <<< "$ETH0_UUIDS"
