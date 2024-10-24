#!/bin/bash
if [ -z "$1" ]; then
  # no input argument - use default fw
  fw_file=/lib/ctt/sensor-station-software/system/radios/fw/default
else
  fw_file=$1
fi

MAX_ATTEMPTS=5

log_file="/data/program.log"

echo 'stopping radio data collection'
systemctl stop station-radio-interface
sleep 1

function program () {
  n=0
  until [ "$n" -ge 5 ]
  do
    now=`date`
    echo "$now" >> $log_file
    echo "programming radio $1" >> $log_file
    program-radio $1 $fw_file >> $log_file 2>&1 && break
    n=$((n+1))
    sleep 2
  done
}

for i in {1..5}; do program "$i"; done

sleep 1
echo 'starting radio interface'
systemctl start station-radio-interface