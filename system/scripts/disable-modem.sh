#!/bin/bash
echo 'disabling modem'
# systemctl stop modem

# file=/etc/systemd/system/modem.service

# if [ -f $file ]; then
#     systemctl disable modem
# fi

# disable_chip () 
# {
chipset='qmi_wwan'
filename="/etc/modprobe.d/blacklist-$chipset.conf"
echo "writing to $filename"
echo "blacklist $chipset" > $filename
modprobe -r "$chipset"
# }

# disable_chip()