#!/bin/bash
echo 'enabling modem'
systemctl enable /lib/ctt/sensor-station-software/system/modem/modem.service
systemctl start modem