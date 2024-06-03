#!/bin/bash
if [ -z "$1" ]; then
  # no input argument - use default fw
  fw_file="/etc/ctt/fw/default"
else
  fw_file=$1
fi

MAX_ATTEMPTS=5

log_file="/data/program.log"

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