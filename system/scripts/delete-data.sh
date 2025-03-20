#!/bin/bash

# start_disk=$(df -h | awk '$NF=="/"{printf "%d/%dGB (%s)\n", $3,$2,$5}')
start_disk=$(df -h | awk '$NF=="/"{printf "%s\n", $5}')

sudo rm -rf /data/uploaded/ctt
sudo rm -rf /data/rotated
sudo mkdir /data/rotated
sudo rm -rf /data/uploaded/sg
sudo rm -rf /data/SGdata/*
sudo systemctl restart sensorgnome
sudo rm /data/CTT*

# current_disk=$(df -h | awk '$NF=="/"{printf "%d/%dGB (%s)\n", $3,$2,$5}')
current_disk=$(df -h | awk '$NF=="/"{printf "%s\n", $5}')

json_output=$(printf '{"start_disk": "%s", "current_disk": "%s"}\n' "$start_disk" "$current_disk")

echo $json_output
