#!/bin/bash

readarray -t type_array <<< $(nmcli --fields TYPE --terse connection show)
readarray -t network_array <<< $(nmcli --fields name --terse connection show)
removed=0
status=""

for i in $(seq 0 $((${#network_array[@]}-1)) )	# for every network
do
#	echo -e 'Network type: '"${type_array[i]}"'\tNetwork name: '"${network_array[i]}"
	if [[ "${type_array[i]}" == *"wireless"* ]]; then
		nmcli connection delete "${network_array[i]}" 2>&1 >> /dev/null
		if [ $? -ne 0 ]; then
			echo "ERROR: Could not"
			echo "delete credentials"
			exit 1
		else
			removed=$(($removed + 1))
		fi
	fi
done

if [ $removed -eq 0 ]; then
	status="{ \"status\": \"No credentials to delete\"}"

	echo $status
	# echo "No credentials"
	# echo "to remove"
else
	status="{ \"status\": \"Success\"}"
	echo $status
	# echo "Success"
fi
