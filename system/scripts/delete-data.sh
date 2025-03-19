#!/bin/bash
echo 'deleting data'

sudo rm -rf /data/uploaded/ctt

echo 'deleted uploaded data'

sudo rm -rf /data/rotated
sudo mkdir /data/rotated

echo 'deleted rotated data'

sudo rm -rf /data/uploaded/sg

echo 'deleted sensorgnome uploaded data'

sudo rm -rf /data/SGdata/*
sudo systemctl restart sensorgnome

sudo rm /data/CTT*

