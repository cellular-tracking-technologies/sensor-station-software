#!/bin/bash
# One-time, idempotent Telit LE910Q1 RNDIS + IP-passthrough provisioning.
#
# Brings a fresh Telit modem to the data-path NV state the image expects:
#   AT#RNDIS=1,0    bind the RNDIS session to PDP context 1 (creates the
#                   forwarding USB-ethernet — renamed to mdm0 by udev)
#   AT#IPPASSTH=1   IP pass-through: the host gets the carrier PUBLIC IP via
#                   DHCP and the modem stops NATing. This is what makes UDP
#                   (DNS!) and PMTU discovery work — without it the RNDIS NAT
#                   drops UDP and blackholes large packets. (Validated:
#                   pass-through = native DNS + fast HTTPS, like PPP had.)
#
# DESIGN — why this won't repeat the old provision-modem's problems:
#   * Marker-gated by modem IMEI: a normal boot with an already-provisioned
#     modem is a FAST NO-OP — it reads the IMEI (normal mmcli, no debug) and
#     exits. No ModemManager restart, no AT, no boot delay. The heavy path
#     (MM debug + AT writes + ONE modem reboot) runs only when the marker is
#     missing or a different modem (swap) is present.
#   * Telit-VID scoped (1bc7:7020): Quectel/QMI stations are never touched.
#   * Derives the MM modem index every time (never hardcodes -m 0 — the index
#     changes across re-enumerations).
#   * Invoked via `bash` by its unit, so a stripped exec bit can't kill it.
#
# Modem NV writes here are durable (Telit auto-persists on power events). The
# marker only records "we already did this modem", to keep boots fast.

set +e

TELIT='1bc7:7020'
MARKER='/etc/ctt/modem-rndis-provisioned'        # contents = provisioned IMEI
DROPIN='/etc/systemd/system/ModemManager.service.d/10-debug.conf'

log(){ echo "[provision-rndis] $*"; }
get_idx(){ mmcli -L 2>&1 | grep -oE 'Modem/[0-9]+' | grep -oE '[0-9]+' | head -1; }
at(){ mmcli -m "$IDX" --command="$1" 2>&1; }
teardown_debug(){
  [ -f "$DROPIN" ] || return 0
  rm -f "$DROPIN"; rmdir "$(dirname "$DROPIN")" 2>/dev/null
  systemctl daemon-reload; systemctl restart ModemManager
}

# Telit only — leave Quectel/QMI and modem-less stations alone.
lsusb -d "$TELIT" >/dev/null 2>&1 || { log "no Telit LE910Q1 present — nothing to do"; exit 0; }

IDX=$(get_idx)
[ -n "$IDX" ] || { log "ModemManager has no modem yet — will retry next boot"; exit 0; }

# IMEI is a 15-digit number in `mmcli -m N` (readable in NORMAL mode, no debug)
IMEI=$(mmcli -m "$IDX" 2>&1 | grep -oE '[0-9]{15}' | head -1)
[ -n "$IMEI" ] || { log "could not read IMEI — skipping this boot"; exit 0; }

# Fast no-op: this exact modem already provisioned.
if [ "$(cat "$MARKER" 2>/dev/null)" = "$IMEI" ]; then
  log "modem $IMEI already provisioned (marker) — no-op"
  exit 0
fi

log "provisioning Telit IMEI $IMEI (RNDIS bind + IP pass-through)"
trap teardown_debug EXIT

# --- enable MM debug so we can send raw AT (provision path only) ---
mkdir -p "$(dirname "$DROPIN")"
printf '[Service]\nExecStart=\nExecStart=/usr/sbin/ModemManager --debug\n' > "$DROPIN"
systemctl daemon-reload; systemctl restart ModemManager
for i in $(seq 1 15); do mmcli -L 2>&1 | grep -q 'Modem/' && break; sleep 2; done; sleep 3
IDX=$(get_idx)
[ -n "$IDX" ] || { log "modem vanished after MM debug restart — aborting (retry next boot)"; exit 0; }

NEED_REBOOT=0
at 'AT#RNDIS?'    | grep -qE '#RNDIS: *[0-9]+,1' || { log "binding RNDIS to CID 1";  at 'AT#RNDIS=1,0'  >/dev/null; NEED_REBOOT=1; }
at 'AT#IPPASSTH?' | grep -qE '#IPPASSTH: *1,'    || { log "enabling IP pass-through"; at 'AT#IPPASSTH=1' >/dev/null; NEED_REBOOT=1; }

if [ "$NEED_REBOOT" = 1 ]; then
  log "rebooting modem to apply NV changes"
  at 'AT#REBOOT' >/dev/null
  teardown_debug                       # restart MM to normal before the wait
  trap - EXIT
  log "waiting for modem re-enumeration + mdm0 address (pass-through DHCP)"
  for i in $(seq 1 40); do ip -4 addr show mdm0 2>/dev/null | grep -q 'inet ' && break; sleep 3; done
else
  log "modem already in target NV state (RNDIS bound + pass-through on)"
fi

# Record that this modem is done so future boots are a no-op.
mkdir -p "$(dirname "$MARKER")"
echo "$IMEI" > "$MARKER"
log "done — marker set for IMEI $IMEI"
exit 0
