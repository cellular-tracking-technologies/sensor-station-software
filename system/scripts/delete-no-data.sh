#!/bin/bash

start_disk=$(df -h | awk '$NF=="/"{printf "%s\n", $5}')

json_output=$(printf '{"start_disk": "%s", "current_disk": "%s"}\n' "$start_disk" "$start_disk")

echo $json_output
