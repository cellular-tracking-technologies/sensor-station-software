#!/bin/bash
# Enable the cellular modem. The mechanism depends on which modem is
# installed and on its current state:
#
#   Quectel EC25 (2c7c:0125) visible in lsusb:
#     Quectel stays USB-enumerated even when software-disabled (its kernel
#     module is what gets blacklisted, not its USB device). So if we see
#     it, it was disabled via the legacy software path — un-blacklist and
#     modprobe it back.
#
#   Telit LE910Q1 (1bc7:7020) visible in lsusb:
#     Already powered on (Telit only shows up after it has booted, since
#     disable cuts power entirely). No-op.
#
#   No modem visible:
#     Assume Telit that was powered off (Quectel without its module would
#     still be visible — its absence implies the variant is Telit and the
#     last action was a power-off). Pulse GPIO 23 (ON_OFF#) LOW for ~2s
#     then release HIGH. Modem takes ~15s to enumerate on USB after.
#     Spec ref: hardware/TELIT_LE910Q1_INTEGRATION_REPORT.md

TELIT='1bc7:7020'
QUECTEL='2c7c:0125'

if lsusb -d $QUECTEL >/dev/null 2>&1; then
  echo 'enabling Quectel EC25 (remove qmi_wwan blacklist, modprobe)'
  chipset='qmi_wwan'
  filename="/etc/modprobe.d/blacklist-$chipset.conf"
  if [ -f $filename ]; then
    echo "deleting blacklist file $filename"
    rm $filename
  fi
  modprobe $chipset
elif lsusb -d $TELIT >/dev/null 2>&1; then
  echo 'Telit LE910Q1 already powered on; no action needed'
else
  echo 'no modem currently visible; assuming Telit LE910Q1 powered off, pulsing GPIO 23 LOW 2s'
  raspi-gpio set 23 op dh   # ensure HIGH idle for a clean falling edge
  sleep 0.1
  raspi-gpio set 23 op dl   # press: ON_OFF# asserted LOW
  sleep 2                    # hold ~1-2s to trigger power-on
  raspi-gpio set 23 op dh   # release: ON_OFF# back to idle HIGH
fi
