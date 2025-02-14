#!/bin/bash

# finding modem index
modem_index="$(mmcli -L | grep -o 'Modem/[0-9]' | grep -o '[0-9]')" 
echo 'modem index' $modem_index

# finding sim index
sim_index="$(mmcli -m $modem_index | grep -o 'SIM/[0-9]' | grep -o '[0-9]')" 
echo 'sim index' $sim_index

# find sim iccid
iccid="$(mmcli -m $modem_index -i $sim_index | grep -o 'iccid: [0-9]*' | grep -o '[0-9]*')"
echo $iccid

# find country code (2 digits, telenor is 46)
country_code=${iccid:2:2}
echo 'country code' $country_code

# change apn based on country code
if [ $country_code -eq 46 ]; then
    echo 'telenor sim'
    sudo nmcli c modify station-modem apn internet.cxn
else
    echo 'twilio sim'
    sudo nmcli c modify station-modem apn super
fi