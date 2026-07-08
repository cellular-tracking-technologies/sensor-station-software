#!/bin/bash
# Disable the cellular modem: deauthorize its USB device. Uniform for every modem
# (Telit LE910Q1, Quectel EC25); no GPIO / ON_OFF#.
#
# Deauthorize (modem-power.sh off) has the kernel unbind all drivers and
# ModemManager drop the modem, but the module stays powered and VISIBLE in lsusb
# (so QAQC still sees it) and re-enable is a clean rebind — no re-enumeration wait.
#
# Deliberate tradeoff: unlike the old Telit GPIO power-off, deauthorize leaves the
# module powered (RF idle, ~50 mA) — it does NOT save the ~150-200 mA a full
# power-down did. We chose one consistent, idempotent, QAQC-visible control over
# the Telit-only power saving; a station that isn't using cellular has its modem
# physically removed.
#
# Writes the /etc/ctt/modem-disabled intent marker (persistent on-disk) so the
# disable STICKS across reboots and hard resets: modem-boot-state.sh re-applies
# the deauthorize on every boot until someone explicitly re-enables the modem
# (enable-modem.sh clears the marker). `authorized` itself resets to 1 when the
# modem re-enumerates, which is exactly why the intent must live on disk.
set -u

SCRIPT_DIR='/lib/ctt/sensor-station-software/system/scripts'
MARKER='/etc/ctt/modem-disabled'

mkdir -p "$(dirname "$MARKER")"
touch "$MARKER"
bash "$SCRIPT_DIR/modem-power.sh" off
