#!/usr/bin/bash
# provision-modem-apn.sh — set the station-modem NetworkManager profile's APN to
# match the SIM's carrier. ONE job: choose the dial APN.
#
# Source of truth: /run/ctt/modem-apn, written by ctt-modem-provision (which runs
# Before=ModemManager). For a Quectel that file is the SAME string the provisioner
# wrote to the modem's LTE attach context (CGDCONT CID1) — so consuming it here is
# what guarantees the attach APN and the dial APN can never diverge (the cause-55
# trap that stranded the Belgium station). If the file is absent (Telit, or the
# native tool failed open) we fall back to reading the ICCID via mmcli and mapping
# it locally — the original behavior, kept as a safety net.
#
# The modem data-path autoconnect policy (Telit=no / Quectel=yes) is NOT here — it
# lives in modem-datapath.sh. Runs at boot from station-boot.service
# (After=ModemManager). A runtime enable does not run this inline; enable-modem.sh
# reboots, so it runs on the next boot.

APN_FILE=/run/ctt/modem-apn

set_apn() {   # $1 = apn, $2 = provenance (for the log)
  echo "provision-modem-apn: setting station-modem apn '$1' (from $2)"
  sudo nmcli c modify station-modem apn "$1"
}

# A disabled (deauthorized) modem can't report an ICCID — skip. The next enable
# reboots the station, so this runs once the modem is back and authorized.
if [ -e /etc/ctt/modem-disabled ]; then
  echo 'provision-modem-apn: modem disabled — skipping APN selection'
  exit 0
fi

# --- Preferred path: the APN the native provisioner already chose (and matched to
# the modem's CGDCONT attach context). ---
if [ -s "$APN_FILE" ]; then
  apn="$(head -n1 "$APN_FILE" | tr -d '[:space:]')"
  if [ -n "$apn" ]; then
    set_apn "$apn" "$APN_FILE"
    exit 0
  fi
fi

# --- Fallback: derive the APN from the ICCID via mmcli (Telit / safety net). ---
# Wait for the modem + SIM to enumerate before reading the ICCID. Reading an EMPTY
# ICCID is how this used to silently fall through to the wrong default; retry until
# a valid ICCID appears, and if none ever does, leave the APN UNCHANGED (never guess).
echo "provision-modem-apn: $APN_FILE absent/empty — falling back to mmcli ICCID mapping"
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
  echo 'provision-modem-apn: no modem/SIM ready after wait — leaving APN unchanged'
  exit 0
fi

echo "modem index $modem_index / sim index $sim_index / iccid $iccid"
country_code="${iccid:2:2}"        # ICCID country code; Telenor/Sweden = 46
echo "country code $country_code"

if [ "$country_code" = "46" ]; then
  set_apn "internet.cxn" "ICCID cc 46 (telenor)"
else
  set_apn "super" "ICCID default (twilio/kore)"
fi
