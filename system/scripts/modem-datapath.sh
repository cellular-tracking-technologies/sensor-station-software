#!/bin/bash
# modem-datapath.sh — set the station-modem NetworkManager profile's autoconnect
# by modem TYPE (USB VID:PID). This is a static, per-modem-type decision: it is
# set once at boot (station-boot.service) and is deliberately NOT on the operator
# enable/disable path — re-deriving it there, racing USB enumeration, was the
# cause of the Telit PPP-dial collision.
#
#   Telit LE910Q1 (1bc7:7021): CDC-ECM data path (mdm0, modem-internal NAT). The
#     gsm 'station-modem' PPP profile must NOT autodial — a PPP context collides
#     with the ECM PDP context (ESM_MULTIPLE_PDN) and kills mdm0.  => autoconnect no
#   Quectel EC25 (2c7c:0125): QMI/PPP bearer on that same profile (wwan0).
#                                                                 => autoconnect yes
#
# VID:PID is readable whether the modem is authorized or deauthorized (the device
# stays enumerated either way), so this is correct regardless of on/off state. If
# no known modem is visible, leave autoconnect UNCHANGED — never guess. Runs from
# station-boot.service (After=NetworkManager) so nmcli is available.
set -u

# Match the Telit by VID only (1bc7): its product id differs by USB composition
# — 7020 on the legacy RNDIS composition, 7021 on the ECM composition — and the
# autoconnect policy (no PPP autodial) is the same for both.
TELIT_VID='1bc7'
QUECTEL='2c7c:0125'

if lsusb -d "${TELIT_VID}:" >/dev/null 2>&1; then
  echo 'modem-datapath: Telit LE910Q1 — station-modem autoconnect=no (ECM, no PPP dial)'
  sudo nmcli connection modify station-modem connection.autoconnect no
elif lsusb -d "$QUECTEL" >/dev/null 2>&1; then
  echo 'modem-datapath: Quectel EC25 — station-modem autoconnect=yes (QMI/PPP)'
  sudo nmcli connection modify station-modem connection.autoconnect yes
else
  echo 'modem-datapath: no known modem visible — leaving station-modem autoconnect unchanged'
fi
