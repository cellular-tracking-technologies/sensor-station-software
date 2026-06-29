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
  # SKIP_CHECK_SIM: do NOT let enable-modem.sh run check-sim-id.sh here.
  # This unit is ordered Before=ModemManager.service, and check-sim-id does a
  # blocking `systemctl start ModemManager` — running it from inside a
  # Before=MM unit deadlocks (MM waits for us to finish; we wait for MM to
  # start). APN selection at boot is station-boot.service's job
  # (After=network.target, no Before=MM), which runs check-sim-id safely. The
  # tail-call only matters for a manual / web "enable after boot", where
  # SKIP_CHECK_SIM is unset and check-sim-id runs.
  export SKIP_CHECK_SIM=1
  exec "$SCRIPT_DIR/enable-modem.sh"
fi
