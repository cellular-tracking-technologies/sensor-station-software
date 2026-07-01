#!/bin/bash
# Enable the cellular modem: authorize its USB device so drivers rebind and
# ModemManager re-detects it. Uniform for every modem (Telit LE910Q1, Quectel
# EC25) — both self-enumerate on VBAT, so there is NO GPIO / ON_OFF# handling.
#
# Steps: clear the /etc/ctt/modem-disabled intent marker, authorize the modem
# (modem-power.sh on), then run per-SIM APN selection now that the modem can be
# read. The data-path autoconnect policy is intentionally NOT set here — it is a
# static, per-modem-type decision owned by boot (modem-datapath.sh via
# station-boot). Keeping it out of the enable path is what removed the PPP-dial
# collision: enabling can never mis-set autoconnect.
set -u

SCRIPT_DIR='/lib/ctt/sensor-station-software/system/scripts'
MARKER='/etc/ctt/modem-disabled'

rm -f "$MARKER"
bash "$SCRIPT_DIR/modem-power.sh" on

# APN needs the modem authorized (the ICCID is read over mmcli), so it can only
# run once enabled. At boot a disabled modem skipped APN selection, so run it now.
# check-sim-id waits for the modem + SIM to enumerate.
CHECK_SIM="$SCRIPT_DIR/check-sim-id.sh"
[ -f "$CHECK_SIM" ] && bash "$CHECK_SIM"
