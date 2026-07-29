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

# --- Fallback: derive the APN from the SIM via mmcli (Telit / safety net). ---
# Mirrors the native provisioner's chooseApn(): the IMSI's home PLMN decides, and
# the ICCID country code is only a fallback.
#
# Why IMSI-first: the IMSI names the *subscription's* home network, which is what
# determines the APN the carrier accepts. The ICCID names the issuer's numbering
# range — Telenor ships SIMs in an 8901 (US-numbered) range whose ICCID cc reads
# "01", so the old ICCID-only rule picked `super` on a Telenor subscription and the
# network refused the bearer with 3GPP cause 33 (option-unsubscribed).
# Keep this list in step with isTelenorImsi() in native/lib/ctthw/modem/quectel_ec25.cpp.
#
# Wait for the modem + SIM to enumerate first. Reading an EMPTY id is how this used
# to silently fall through to the wrong default; retry until one appears, and if
# none ever does, leave the APN UNCHANGED (never guess).
TELENOR_PLMNS='24008'              # MCC 240 (Sweden) + MNC 08 = Telenor Connexion

echo "provision-modem-apn: $APN_FILE absent/empty — falling back to mmcli IMSI/ICCID mapping"
iccid=""
imsi=""
for attempt in $(seq 1 15); do
  modem_index="$(/usr/bin/mmcli -L 2>/dev/null | grep -oE 'Modem/[0-9]+' | grep -oE '[0-9]+' | head -1)"
  if [ -n "$modem_index" ]; then
    sim_index="$(/usr/bin/mmcli -m "$modem_index" 2>/dev/null | grep -oE 'SIM/[0-9]+' | grep -oE '[0-9]+' | head -1)"
    if [ -n "$sim_index" ]; then
      sim_info="$(/usr/bin/mmcli -m "$modem_index" -i "$sim_index" 2>/dev/null)"
      iccid="$(echo "$sim_info" | grep -oE 'iccid: [0-9]+' | grep -oE '[0-9]+')"
      imsi="$(echo "$sim_info" | grep -oE 'imsi: [0-9]+' | grep -oE '[0-9]+')"
      # The IMSI is the one we actually want; accept the pass as soon as either
      # identifier is readable so a modem that hides the IMSI still falls back.
      { [ -n "$imsi" ] || [ -n "$iccid" ]; } && break
    fi
  fi
  sleep 2
done

if [ -z "$imsi" ] && [ -z "$iccid" ]; then
  echo 'provision-modem-apn: no modem/SIM ready after wait — leaving APN unchanged'
  exit 0
fi

echo "modem index $modem_index / sim index $sim_index / imsi $imsi / iccid $iccid"

# 1) IMSI home PLMN (authoritative).
plmn="${imsi:0:5}"
for known in $TELENOR_PLMNS; do
  if [ -n "$plmn" ] && [ "$plmn" = "$known" ]; then
    set_apn "internet.cxn" "IMSI PLMN $plmn (telenor)"
    exit 0
  fi
done

# 2) ICCID country code (fallback). Require enough digits to actually hold a country
# code — a truncated read must leave the APN alone, not silently select the default
# (matches the `iccid.size() < 4` guard in apnForIccid()).
if [ "${#iccid}" -lt 4 ]; then
  echo "provision-modem-apn: IMSI PLMN '$plmn' not recognized and ICCID unusable ('$iccid') — leaving APN unchanged"
  exit 0
fi
country_code="${iccid:2:2}"        # ICCID country code; Telenor/Sweden = 46
echo "imsi plmn $plmn (unrecognized) / iccid country code $country_code"

if [ "$country_code" = "46" ]; then
  set_apn "internet.cxn" "ICCID cc 46 (telenor)"
else
  set_apn "super" "ICCID default (twilio/kore)"
fi
