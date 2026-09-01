#!/bin/bash
# Capture a comprehensive read-only snapshot of a Telit (or Quectel) modem's
# current state — mmcli identity, SIM info, full AT NV settings — for later
# diffing against snapshots taken at other points in the modem's lifecycle
# (pre-reset, post-reset, post-SIM-integration, new-off-line, etc.).
#
# Usage:
#   sudo bash modem-snapshot.sh <LABEL> [output_dir]
#
# Example:
#   sudo bash modem-snapshot.sh PRE-RESET
#     → /tmp/modem-IMEI-{IMEI}-PRE-RESET-{TIMESTAMP}.txt
#
# Read-only: queries the modem and writes a snapshot file. Does NOT alter
# modem NV. Temporarily enables MM debug mode and toggles station-modem
# autoconnect to free the AT port; both are restored at exit.
#
# NOTE ON RUNNING THIS REMOTELY: enabling MM debug RESTARTS ModemManager (twice —
# once to enable, once to restore). On an ECM station that should not disturb the
# data path (mdm0 is not NM/MM-managed, the #ECM bind is NV-persistent, and the
# default route is static), but if the station is reached OVER its own modem there
# is no second link to recover from. Prefer a LAN/bench station.

# NOTE: deliberately NOT using set -e — some AT queries return non-zero
# when the Telit firmware rejects them ("Operation not allowed"), but we
# still want the rest of the snapshot to capture. Cleanup is handled
# via the EXIT trap regardless of exit status.

if [ "$EUID" -ne 0 ]; then
  echo "$0: must run as root" >&2
  exit 1
fi

LABEL="${1:-UNLABELED}"
OUTDIR="${2:-/tmp}"
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)

# ---------- preserve original state so we can restore on exit ----------
ORIG_AUTOCONNECT=""
DEBUG_DROPIN=/etc/systemd/system/ModemManager.service.d/10-debug.conf
DEBUG_DROPIN_CREATED=0

cleanup() {
  echo "(restoring Pi-side state)" >&2
  if [ "$DEBUG_DROPIN_CREATED" = "1" ]; then
    rm -f "$DEBUG_DROPIN"
    rmdir /etc/systemd/system/ModemManager.service.d 2>/dev/null || true
    systemctl daemon-reload
    systemctl restart ModemManager
  fi
  if [ -n "$ORIG_AUTOCONNECT" ]; then
    nmcli connection modify station-modem connection.autoconnect "$ORIG_AUTOCONNECT" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# ---------- capture original autoconnect; disable so MM doesn't hold AT port ----------
ORIG_AUTOCONNECT=$(nmcli -t -f connection.autoconnect connection show station-modem 2>/dev/null | cut -d: -f2 || echo "yes")
nmcli connection modify station-modem connection.autoconnect no 2>/dev/null || true
nmcli connection down station-modem 2>/dev/null || true

# ---------- enable MM debug if not already present ----------
if [ ! -f "$DEBUG_DROPIN" ]; then
  mkdir -p "$(dirname "$DEBUG_DROPIN")"
  cat > "$DEBUG_DROPIN" <<EOF
[Service]
ExecStart=
ExecStart=/usr/sbin/ModemManager --debug
EOF
  systemctl daemon-reload
  systemctl restart ModemManager
  DEBUG_DROPIN_CREATED=1
  # wait for MM to re-enumerate the modem
  for i in $(seq 1 15); do
    mmcli -L 2>&1 | grep -q "Modem/" && break
    sleep 2
  done
  sleep 3
fi

# ---------- determine modem index ----------
MODEM_PATH=$(mmcli -L 2>&1 | grep -oE "/org/freedesktop/ModemManager1/Modem/[0-9]+" | head -1)
if [ -z "$MODEM_PATH" ]; then
  echo "no modem detected" >&2
  exit 1
fi
MODEM_IDX=$(echo "$MODEM_PATH" | grep -oE "[0-9]+$")

# ---------- read IMEI for filename ----------
IMEI=$(mmcli -m "$MODEM_IDX" 2>&1 | grep -oE "equipment id:.*[0-9]+" | grep -oE "[0-9]+$" | head -1)
IMEI="${IMEI:-UNKNOWN}"

OUTFILE="$OUTDIR/modem-IMEI-${IMEI}-${LABEL}-${TIMESTAMP}.txt"

# ---------- write snapshot ----------
{
  echo "# Modem snapshot"
  echo "# captured: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "# label: $LABEL"
  echo "# IMEI: $IMEI"
  echo "# hostname: $(hostname)"
  echo "# tool: modem-snapshot.sh"
  echo

  echo "## mmcli -L"
  mmcli -L 2>&1
  echo

  echo "## mmcli -m $MODEM_IDX"
  mmcli -m "$MODEM_IDX" 2>&1
  echo

  echo "## mmcli -m $MODEM_IDX -i 0  (SIM)"
  mmcli -m "$MODEM_IDX" -i 0 2>&1
  echo

  # AT queries — read-only, no NV writes
  #
  # The #ENHRST / +CPSMS / +CEDRXS group answers "why did this modem restart or go
  # unreachable on its own?", which the snapshot previously could not speak to:
  #   AT#ENHRST?    periodic-reset config. mode=2 makes the module reboot every
  #                 <delay> minutes and is NV-persistent, so a module can arrive
  #                 from a prior deployment already scheduled to reset itself.
  #                 Directly relevant to investigations/2026-08-27 (V30B0154C65F),
  #                 where a spontaneous module reboot stranded a station ~22 h.
  #   AT+CPSMS?     PSM state. PSM detaches the radio into deep sleep, unreachable
  #                 and unresponsive to AT until the next TAU. NOT in this module's
  #                 vendor AT reference (it is standard 3GPP 27.007), so it may be
  #                 rejected on some firmware — harmless, the loop tolerates that.
  #   AT+CEDRXS?    eDRX requested by us.
  #   AT+CEDRXRDP   eDRX actually APPLIED BY THE NETWORK — the load-bearing one. The
  #                 network can grant power-save timers we never asked for, so the
  #                 requested value alone does not tell you what the module is doing.
  #
  # No CTT code path issues AT+CPSMS=0 / AT+CEDRXS=0 (verified by grep over native/,
  # system/, src/), so whatever the network granted is what is in force. Capturing it
  # is the first step toward knowing whether that matters.
  for cmd in \
    "AT&V" \
    "AT+CGMI" "AT+CGMM" "AT+CGMR" "AT+CGSN" \
    "AT+CCID" "AT+CIMI" "AT+CPIN?" \
    "AT+CREG?" "AT+CGREG?" "AT+CEREG?" \
    "AT+COPS?" "AT+CSQ" \
    "AT+CGDCONT?" "AT+CGACT?" "AT+CGEQOS?" \
    "AT+CFUN?" "AT+WS46?" \
    "AT#PORTCFG?" "AT#USBCFG?" "AT#RNDIS?" "AT#FWSWITCH?" \
    "AT#SIMSELECT?" "AT#SIMSELMODE?" \
    "AT#AUTOATT?" "AT#ENS?" "AT#BND?" \
    "AT#NWEN?" "AT#PSNT?" "AT#PSMRI?" "AT#TXMONMODE?" \
    "AT#CCIDCFG?" "AT#ECM?" "AT#ECMC?" \
    "AT#ENHRST?" "AT+CPSMS?" "AT+CEDRXS?" "AT+CEDRXRDP" \
    "AT&V0" "AT&V1" "AT&V2"; do
    echo "## $cmd"
    mmcli -m "$MODEM_IDX" --command="$cmd" 2>&1
    echo
  done

  echo "## /etc/NetworkManager/system-connections/station-modem.nmconnection"
  cat /etc/NetworkManager/system-connections/station-modem.nmconnection 2>&1
  echo

  echo "## /etc/udev/rules.d/ (CTT-related)"
  ls -la /etc/udev/rules.d/ 2>&1 | grep -E "ctt|telit|quectel"
  echo

  echo "## lsusb (relevant)"
  lsusb | grep -iE "telit|quectel|1bc7|2c7c" 2>&1
  echo

  echo "## USB interface authorize state (Telit/Quectel)"
  USB_DEV=$(mmcli -m "$MODEM_IDX" 2>&1 | grep -oE "/sys/[^ ]+" | head -1)
  if [ -n "$USB_DEV" ] && [ -d "$USB_DEV" ]; then
    USB_BASE=$(basename "$USB_DEV")
    for i in 0 1 2 3 4 5 6 7; do
      IF_DIR="/sys/bus/usb/devices/${USB_BASE}:1.${i}"
      if [ -e "$IF_DIR" ]; then
        AUTH=$(cat "$IF_DIR/authorized" 2>/dev/null || echo "?")
        DRV=$(readlink "$IF_DIR/driver" 2>/dev/null | sed "s|.*/||" || echo "(unbound)")
        printf "  %s:1.%d  authorized=%s  driver=%s\n" "$USB_BASE" "$i" "$AUTH" "$DRV"
      fi
    done
  fi
  echo

  echo "## ttyACM mapping"
  for d in /dev/ttyACM*; do
    [ -e "$d" ] || continue
    LINK=$(readlink -f "/sys/class/tty/$(basename "$d")/device" 2>&1 | grep -oE "1\.[0-9.]+:1\.[0-9]+" || echo "(unknown)")
    echo "  $d -> $LINK"
  done

} > "$OUTFILE"

# ---------- output the filename so caller can scp it ----------
echo "$OUTFILE"
