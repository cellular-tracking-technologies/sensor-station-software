#!/bin/bash
echo 'enabling modem'
# systemctl enable /lib/ctt/sensor-station-software/system/modem/modem.service
# systemctl start modem

chipset='qmi_wwan'

filename="/etc/modprobe.d/blacklist-$chipset.conf"
if [ -f  $filename ]; then
    echo "deleting blacklist file $filename"
    rm $filename
fi
modprobe $chipset

