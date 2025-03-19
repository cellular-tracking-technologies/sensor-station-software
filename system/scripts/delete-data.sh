#!/bin/bash
# echo 'deleting data'

sudo rm -rf /data/uploaded/ctt

# echo 'deleted uploaded data'

sudo rm -rf /data/rotated
sudo mkdir /data/rotated

# echo 'deleted rotated data'

sudo rm -rf /data/uploaded/sg

# echo 'deleted sensorgnome uploaded data'

sudo rm -rf /data/SGdata/*
sudo systemctl restart sensorgnome

sudo rm /data/CTT*

memory=$(free -m | awk 'NR==2{printf "%s/%sMB (%.2f%%)\n", $3,$2,$3*100/$2 }')
disk=$(df -h | awk '$NF=="/"{printf "%d/%dGB (%s)\n", $3,$2,$5}')
# top -bn1 | grep load | awk '{printf "CPU Load: %.2f\n", $(NF-2)}' 

json_output=$(printf '{"memory": "%s", "disk": "%s"}\n' "$memory" "$disk")

echo $json_output
# echo $disk