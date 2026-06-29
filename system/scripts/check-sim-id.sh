#!/usr/bin/bash

# NOTE: this script does NOT start ModemManager. MM ships enabled in the image
# and systemd starts it at boot; disable-modem.sh never stops it (it only
# USB-deauthorizes / powers the modem, MM keeps running and auto-detects the
# modem on re-enable via udev). A blocking `systemctl start ModemManager` here
# used to deadlock when this ran from modem-boot-state.service (ordered
# Before=ModemManager): MM waits for that unit, the unit waited for MM. The
# mmcli retry loop below is all we need — it waits for the modem to enumerate.

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

# --- per-SIM APN selection (robust against the modem not being ready) ---
# If the modem is intentionally disabled, there's no SIM to read — skip.
if [ -e /etc/ctt/modem-disabled ]; then
  echo 'check-sim-id: modem disabled — skipping APN selection'
  exit 0
fi

# Wait for the modem + SIM to enumerate before reading the ICCID. At boot the
# modem may still be coming up (a Telit needs a GPIO pulse; a modem enabled
# after boot needs time), and reading an EMPTY ICCID is how this script used
# to silently fall through to the wrong 'super' default. Retry until a valid
# ICCID appears; if none ever does, leave the APN UNCHANGED (never guess).
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