#!/usr/bin/bash

# start modem manager
sudo systemctl enable ModemManager.service
sudo systemctl start ModemManager.service

# --- data-path policy: demote the gsm/PPP profile on Telit only ---
# Telit LE910Q1 (1bc7:7020) uses the RNDIS data path (mdm0, modem-internal
# NAT) — the gsm 'station-modem' profile must NOT dial PPP on it (causes a
# competing default route + duplicate ICMP and an ESM_MULTIPLE_PDN retry
# loop). Quectel EC25 (2c7c:0125) uses that same profile for its QMI bearer
# (wwan0), so it MUST stay autoconnect=yes. Keyed on USB VID:PID so a Quectel
# station is never demoted (fleet-safe). Runs here (via station-boot.service,
# After=network.target) so NetworkManager is up for nmcli.
if lsusb -d 1bc7:7020 >/dev/null 2>&1; then
    echo 'Telit LE910Q1 detected — RNDIS data path; demoting station-modem (no PPP dial)'
    sudo nmcli connection modify station-modem connection.autoconnect no
else
    echo 'non-Telit modem — keeping station-modem autoconnect (QMI/PPP)'
    sudo nmcli connection modify station-modem connection.autoconnect yes
fi

# finding modem index
modem_index="$(/usr/bin/mmcli -L | grep -o 'Modem/[0-9]' | grep -o '[0-9]')" 
# modem_index="$(mmcli -L | grep -o 'Modem/[0-9]' | grep -o '[0-9]')" 

echo 'modem index' $modem_index

# finding sim index
sim_index="$(/usr/bin/mmcli -m $modem_index | grep -o 'SIM/[0-9]' | grep -o '[0-9]')" 
echo 'sim index' $sim_index

# find sim iccid
iccid="$(/usr/bin/mmcli -m $modem_index -i $sim_index | grep -o 'iccid: [0-9]*' | grep -o '[0-9]*')"
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