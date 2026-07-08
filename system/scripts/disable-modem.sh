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
# Writes the modem-disabled intent marker in tmpfs (/run/ctt, cleared on every
# boot) — NOT /etc — so a disable is deliberately NON-persistent: it holds for
# the current power session, but any reboot or hard reset clears it and the modem
# comes back ON (fail-safe — a remote station is never stranded without cellular
# after a power event). Enable is the persistent state (no marker → ON at boot).
set -u

SCRIPT_DIR='/lib/ctt/sensor-station-software/system/scripts'
MARKER='/run/ctt/modem-disabled'

mkdir -p "$(dirname "$MARKER")"
touch "$MARKER"
bash "$SCRIPT_DIR/modem-power.sh" off
