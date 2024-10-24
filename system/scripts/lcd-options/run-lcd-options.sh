#!/bin/bash

echo 'Getting' $1 'data from station server.'

regex='s/^[^:]*:(.*)$/\1/'

curl_cmd=$(cat system/scripts/lcd-options/commands.json | grep $1 | sed -r $regex | sed 's/\"//g' | sed 's/\,//g')

# echo $curl_cmd    

eval "$curl_cmd" | json_pp
