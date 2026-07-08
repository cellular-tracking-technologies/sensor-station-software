#!/bin/bash
# Enable the cellular modem, then reboot so the boot sequence brings it up and
# configures it. enable-modem only sets INTENT and ensures the modem will be on
# the bus; the configuration is the boot sequence's job and is NOT duplicated
# here:
#   modem-boot-state (Before=MM): authorize per the (now-cleared) marker
#   station-boot (After=MM):      data-path autoconnect policy + per-SIM APN
#
# Steps:
#   1. Clear the /run/ctt/modem-disabled marker (intent = ON; the marker is
#      volatile tmpfs, so ON is also the default after any reboot/hard reset).
#   2. If no modem is on the bus, a Telit may be in ON_OFF# shutdown (a soft
#      reboot won't clear that — VBAT stays up), so pulse ON_OFF# once to power it
#      on. It finishes enumerating during the reboot; modem-boot-state's wait
#      catches it. A deauthorized modem is already on the bus, so no pulse.
#   3. Reboot — scheduled a couple seconds out so the web/LCD caller gets its
#      response before the system goes down.
#
# Only ever invoked by the operator (web/LCD), never by a boot unit, so this
# cannot reboot-loop. The pin comes from the board layer (CTT_MODEM_ONOFF_GPIO in
# /run/ctt/board.env; fallback 23); the pulse keeps the field-proven raspi-gpio
# drive-and-hold.
set -u

MARKER='/run/ctt/modem-disabled'

[ -r /run/ctt/board.env ] && . /run/ctt/board.env
ONOFF_GPIO="${CTT_MODEM_ONOFF_GPIO:-23}"

modem_on_bus() {
  lsusb -d 1bc7: >/dev/null 2>&1 || lsusb -d 2c7c:0125 >/dev/null 2>&1
}

rm -f "$MARKER"

# Recovery only: nothing on the bus means a Telit may be in ON_OFF# shutdown.
if ! modem_on_bus; then
  echo "enable-modem: no modem on USB — pulsing ON_OFF# (GPIO $ONOFF_GPIO) to power on a shut-down Telit"
  raspi-gpio set "$ONOFF_GPIO" op dh   # idle HIGH for a clean falling edge
  sleep 0.1
  raspi-gpio set "$ONOFF_GPIO" op dl   # assert LOW
  sleep 2                               # hold ~2s to trigger power-on
  raspi-gpio set "$ONOFF_GPIO" op dh   # release to idle HIGH
fi

sync
echo "enable-modem: rebooting to bring up + configure the modem (authorize, data-path, APN) at boot"
systemd-run --on-active=2 /bin/systemctl reboot >/dev/null 2>&1 || systemctl reboot
