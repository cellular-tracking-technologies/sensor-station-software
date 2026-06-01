#!/bin/bash
# Disable the cellular modem. The mechanism depends on which modem is
# installed; we detect by USB VID:PID, since the disable behavior must
# match the hardware (pulsing GPIO 23 on a Quectel station would do
# whatever the Quectel-era R3b wiring of that pin happened to be — not
# necessarily safe).
#
#   Telit LE910Q1 (1bc7:7020):  pulse GPIO 23 (ON_OFF#) LOW 6s → release HIGH
#     - GPIO 23 was rewired on the R3b adapter to drive ON_OFF# directly.
#     - >3s LOW triggers Telit's hardware shutdown; we use 6s for margin.
#     - Spec ref: hardware/TELIT_LE910Q1_INTEGRATION_REPORT.md
#
#   Quectel EC25 (2c7c:0125):  blacklist qmi_wwan kernel module
#     - Legacy software-only disable; modem stays powered, kernel drops
#       the wwan net interface so no cellular traffic flows.

TELIT='1bc7:7020'
QUECTEL='2c7c:0125'

if lsusb -d $TELIT >/dev/null 2>&1; then
  echo 'disabling Telit LE910Q1 (pulse GPIO 23 LOW 6s, release HIGH)'
  raspi-gpio set 23 op dh   # ensure HIGH idle for a clean falling edge
  sleep 0.1
  raspi-gpio set 23 op dl   # press: ON_OFF# asserted LOW
  sleep 6                    # hold >5s to trigger shutdown
  raspi-gpio set 23 op dh   # release: ON_OFF# back to idle HIGH
elif lsusb -d $QUECTEL >/dev/null 2>&1; then
  echo 'disabling Quectel EC25 (blacklist qmi_wwan)'
  chipset='qmi_wwan'
  filename="/etc/modprobe.d/blacklist-$chipset.conf"
  echo "blacklist $chipset" > $filename
  modprobe -r "$chipset"
else
  echo 'no known modem detected (looked for Telit 1bc7:7020, Quectel 2c7c:0125); nothing to disable'
fi
