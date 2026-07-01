#!/usr/bin/bash
# check-sim-id.sh — per-SIM APN selection. ONE job: read the SIM ICCID via mmcli
# and set the station-modem NetworkManager profile's APN for that carrier.
#
# The modem data-path autoconnect policy (Telit=no / Quectel=yes) is NOT here — it
# moved to modem-datapath.sh. Splitting APN from policy (and moving both off the
# enable path) is what un-tangled this from enable-modem.sh.
#
# Runs at boot from station-boot.service (After=ModemManager) — the single place
# APN is set. (A runtime enable does not run this inline; enable-modem.sh reboots,
# so this runs on the next boot.) It does NOT start MM — MM ships enabled and
# systemd starts it at boot; the mmcli retry loop below waits for the modem + SIM
# to enumerate.

# A disabled (deauthorized) modem can't report an ICCID — skip. The next enable
# reboots the station, so this runs once the modem is back and authorized.
if [ -e /etc/ctt/modem-disabled ]; then
  echo 'check-sim-id: modem disabled — skipping APN selection'
  exit 0
fi

# Wait for the modem + SIM to enumerate before reading the ICCID. Reading an EMPTY
# ICCID is how this used to silently fall through to the wrong default; retry until
# a valid ICCID appears, and if none ever does, leave the APN UNCHANGED (never guess).
iccid=""
for attempt in $(seq 1 15); do
  modem_index="$(/usr/bin/mmcli -L 2>/dev/null | grep -oE 'Modem/[0-9]+' | grep -oE '[0-9]+' | head -1)"
  if [ -n "$modem_index" ]; then
    sim_index="$(/usr/bin/mmcli -m "$modem_index" 2>/dev/null | grep -oE 'SIM/[0-9]+' | grep -oE '[0-9]+' | head -1)"
    if [ -n "$sim_index" ]; then
      iccid="$(/usr/bin/mmcli -m "$modem_index" -i "$sim_index" 2>/dev/null | grep -oE 'iccid: [0-9]+' | grep -oE '[0-9]+')"
      [ -n "$iccid" ] && break
    fi
  fi
  sleep 2
done

if [ -z "$iccid" ]; then
  echo 'check-sim-id: no modem/SIM ready after wait — leaving APN unchanged'
  exit 0
fi

echo "modem index $modem_index / sim index $sim_index / iccid $iccid"
country_code="${iccid:2:2}"        # ICCID country code; Telenor/Sweden = 46
echo "country code $country_code"

if [ "$country_code" = "46" ]; then
  echo 'telenor sim'
  sudo nmcli c modify station-modem apn internet.cxn
else
  echo 'twilio sim'
  sudo nmcli c modify station-modem apn super
fi
