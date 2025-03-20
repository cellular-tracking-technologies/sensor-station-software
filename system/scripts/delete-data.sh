#!/bin/bash

# start_disk=$(df -h | awk '$NF=="/"{printf "%d/%dGB (%s)\n", $3,$2,$5}')
disk_total=$(df | awk '$NF=="/"{printf "%d\n", $2}')
start_avail=$(df | awk '$NF=="/"{printf "%d\n", $4}')

sudo rm -rf /data/uploaded/ctt
sudo rm -rf /data/rotated
sudo mkdir /data/rotated
sudo rm -rf /data/uploaded/sg
sudo rm -rf /data/SGdata/*
sudo systemctl restart sensorgnome
sudo rm /data/CTT*

# current_disk=$(df -h | awk '$NF=="/"{printf "%d/%dGB (%s)\n", $3,$2,$5}')
current_avail=$(df | awk '$NF=="/"{printf "%s\n", $4}')

json_output=$(printf '{"total_disk": "%s", "start_avail": "%s", "current_avail": "%s"}\n' "$disk_total" "$start_avail" "$current_avail")

echo $json_output
