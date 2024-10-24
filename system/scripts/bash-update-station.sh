#!/bin/bash
script='/lib/ctt/sensor-station-software/src/station-utils/station-updater.py'
processes=$(ps -ef | grep $script | grep -v grep | xargs)
if [ -n "$processes" ]; then
    echo 'killing prior upload process before beginning next upload session'
    ps -ef | grep $script  | grep -v grep | awk '{print $2}' | sudo xargs kill
else
    echo 'no prior upload session'
fi
echo 'starting ctt data upload session'
sudo $script
