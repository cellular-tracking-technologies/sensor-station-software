#!/bin/bash
# modem-wake.sh — power on a Telit that is in ON_OFF# shutdown, at boot.
#
# modem-boot-state.sh / modem-power.sh assume every modem self-enumerates on VBAT
# and so "never touch GPIO / ON_OFF#". That assumption is false for the Telit
# LE910Q1: after a hard reset / VBAT loss it can drop into ON_OFF# shutdown and NOT
# come back on its own — it needs an ON_OFF# GPIO pulse (the same pulse
# enable-modem.sh applies). But enable-modem is operator-only and reboots, so a
# hard-reset station comes up with no modem on the USB bus and no cellular until
# someone manually runs it. This closes that gap automatically at boot.
#
# Runs Before=modem-boot-state + ModemManager: if the operator intent is ON (no
# /etc/ctt/modem-disabled marker) and no known modem is on the bus after a short
# grace period, pulse ON_OFF# once and wait for the modem to enumerate. Then
# modem-boot-state authorizes it and the normal chain (MM -> station-boot ->
# ctt-modem-rndis) brings up the data path. No-op when a modem is already present
# (Quectel, or a Telit that did self-enumerate) or when intent is OFF. The pulse
# is harmless when no Telit is installed (nothing is wired to the pin). Pure
# lsusb + GPIO, safe before NetworkManager/ModemManager.
set -u

MARKER='/etc/ctt/modem-disabled'
[ -r /run/ctt/board.env ] && . /run/ctt/board.env
# Pin comes from the board layer; fallback 23 matches enable-modem.sh.
ONOFF_GPIO="${CTT_MODEM_ONOFF_GPIO:-23}"

modem_on_bus() {
  lsusb -d 1bc7:7020 >/dev/null 2>&1 || lsusb -d 2c7c:0125 >/dev/null 2>&1
}

# Intent OFF -> leave the modem shut down.
if [ -e "$MARKER" ]; then
  echo "modem-wake: modem disabled ($MARKER) — not waking"
  exit 0
fi

# Grace period: a modem that self-enumerates on VBAT should appear quickly; only
# treat it as shut down if it is still absent after this.
for _ in $(seq 1 10); do
  if modem_on_bus; then
    echo "modem-wake: modem already on USB — nothing to do"
    exit 0
  fi
  sleep 1
done

echo "modem-wake: no modem on USB after grace and intent is ON — pulsing ON_OFF# (GPIO $ONOFF_GPIO) to wake a shut-down Telit"
raspi-gpio set "$ONOFF_GPIO" op dh   # idle HIGH for a clean falling edge
sleep 0.1
raspi-gpio set "$ONOFF_GPIO" op dl   # assert LOW
sleep 2                               # hold ~2s to trigger power-on
raspi-gpio set "$ONOFF_GPIO" op dh   # release to idle HIGH

# A Telit cold-boots ~15s after the pulse; wait so modem-boot-state (ordered after
# us) sees it and authorizes on its first pass.
for _ in $(seq 1 25); do
  if modem_on_bus; then
    echo "modem-wake: modem enumerated after ON_OFF# pulse"
    exit 0
  fi
  sleep 1
done
echo "modem-wake: modem still absent after ON_OFF# pulse — continuing (no modem installed?)"
exit 0
