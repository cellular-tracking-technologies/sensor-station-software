#!/bin/bash
# Restore the cellular modem to the operator's last-set state at boot.
#
# Semantics:
#   /etc/ctt/modem-disabled present  → operator wants modem OFF → disable-modem.sh
#   /etc/ctt/modem-disabled absent   → default = modem ON       → enable-modem.sh
#
# This pairs with enable-modem.sh / disable-modem.sh, which maintain the
# marker on every state change. It exists because a hard reboot (power
# switch) cuts VBAT to the Telit LE910Q1, and Telit boots OFF until it
# receives an ON_OFF# pulse — see system/systemd/modem-boot-state.service
# and hardware/TELIT_LE910Q1_INTEGRATION_REPORT.md for context.

MARKER='/etc/ctt/modem-disabled'
SCRIPT_DIR='/lib/ctt/sensor-station-software/system/scripts'

if [ -e "$MARKER" ]; then
  echo "modem-boot-state: marker present at $MARKER — restoring disabled state"
  exec "$SCRIPT_DIR/disable-modem.sh"
else
  echo "modem-boot-state: no marker — restoring enabled state (default)"
  exec "$SCRIPT_DIR/enable-modem.sh"
fi
