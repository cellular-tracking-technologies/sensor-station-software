#!/bin/bash

disk_total=$(df | awk '$NF=="/"{printf "%d\n", $2}')
start_avail=$(df | awk '$NF=="/"{printf "%d\n", $4}')

current_avail=$(df | awk '$NF=="/"{printf "%s\n", $4}')

json_output=$(printf '{"total_disk": "%s", "start_avail": "%s", "current_avail": "%s"}\n' "$disk_total" "$start_avail" "$current_avail")

echo $json_output
