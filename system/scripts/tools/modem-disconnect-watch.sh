#!/bin/bash
# modem-disconnect-watch — record SPONTANEOUS modem USB disconnects, so the rate of
# the 08/27 fault is measured instead of guessed.
#
# Why this exists: on 2026-08-27 V30B0154C65F's Telit detached from USB and
# re-enumerated 1.844 s later, with no host-side trigger. Every deliberate cause has
# since been excluded on that station (AT#ENHRST=0, AT+CPSMS=0, no eDRX granted, USB
# autosuspend off with runtime_suspended_time=0, and a 936-cycle soak test that
# produced no spontaneous disconnect). What remains is an unintentional fault —
# module firmware exception or a transient electrical break — which host logs cannot
# tell apart from a single event. Deciding whether it needs escalating to Telit is a
# question about RATE, and nothing was measuring it. See
# investigations/2026-09-28-v30b0154c65f-ecm-lease-renewal-regression.md.
#
# Discriminator (verified against every modem event in 2026-08-20..09-28 syslog):
#   scripted deauthorize (modem-power.sh, disable-modem.sh, modem-reenum-soak.sh)
#     -> "cdc_ether ... unregister" then "... authorized to connect" on re-attach,
#        and NEVER a "USB disconnect" line: the device stays on the bus.
#   genuine fault / cable event / module reset
#     -> "usb <port>: USB disconnect, device number N", then re-enumeration to a NEW
#        device number. No "authorized to connect".
# So: a "USB disconnect" on the modem's port is by definition not scripted. Boot does
# not produce one either (it enumerates without a preceding disconnect).
#
# Events go to syslog under tag "modem-disconnect" (so collect-diagnostics picks them
# up with syslog, no new collection path) and are appended to $LOG for quick reading.
set -u

# Decide replay mode FIRST: note() consults it, and the "watch start" line is emitted
# before the input source is chosen. Setting it later let that one line reach the
# production log and syslog tag even under --replay.
REPLAY=0; [ "${1:-}" = "--replay" ] && REPLAY=1

LOG=/data/modem-disconnect-events.log
TAG=modem-disconnect
TELIT_IDS='1bc7:7021 1bc7:7020 2c7c:0125'

# In --replay mode events are written to stdout ONLY: never to $LOG and never to the
# production syslog tag. Replayed history is not an observation, and the entire point
# of this tool is an accurate count -- letting a test write the same tag as a real
# event would corrupt the rate it exists to measure. (It did: replaying the 08/27
# lines on 2026-09-28 put two phantom "SPONTANEOUS DISCONNECT" entries under tag
# modem-disconnect, which a later reader would have counted as real.)
note() {
  if [ "${REPLAY:-0}" = 1 ]; then printf 'REPLAY %s\n' "$*"; return; fi
  logger -t "$TAG" -- "$*"
  mkdir -p "$(dirname "$LOG")" 2>/dev/null
  printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" >> "$LOG"
}

# Resolve the modem's USB port (e.g. 1-1.2.1). Re-resolved after each event because a
# re-enumeration can land the module on a different device number (never a different
# port, but resolve defensively rather than hardcoding the v3r0 topology).
resolve_port() {
  local p vid pid
  for p in /sys/bus/usb/devices/*; do
    [ -f "$p/idVendor" ] || continue
    vid=$(cat "$p/idVendor" 2>/dev/null); pid=$(cat "$p/idProduct" 2>/dev/null)
    case " $TELIT_IDS " in *" $vid:$pid "*) basename "$p"; return 0;; esac
  done
  return 1
}

PORT="$(resolve_port || true)"
[ -n "$PORT" ] || { note "watch start: no modem on USB; watching for any cdc_ether/Telit disconnect"; PORT='1-1.2.1'; }
note "watch start: port=$PORT uptime=$(cut -d. -f1 /proc/uptime)s"

# -k kernel only, -f follow, -n0 no backlog (we only want new events).
# grep --line-buffered so matches are not held in a pipe buffer.
# --replay reads kernel lines from stdin instead of following the journal, so the
# discriminator can be tested against real captured logs. The 08/27 fault cannot be
# reproduced on demand (a driver unbind only rebinds the driver -- the device never
# leaves the bus, so no "USB disconnect" is emitted), which makes replay the only
# way to prove the matcher against the signature it exists to catch.
if [ "$REPLAY" = 1 ]; then
  SRC=(cat)
else
  SRC=(journalctl -k -f -n0 -o short-iso)
fi

"${SRC[@]}" 2>/dev/null \
  | grep --line-buffered -E "usb $PORT: USB disconnect|usb $PORT: new .*USB device number" \
  | while IFS= read -r line; do
      case "$line" in
        *"USB disconnect"*)
          # Context captured at fault time; these are the things that would implicate
          # power or thermal, and were flat across the 08/27 event.
          batt=$(sed -n 's/.*"battery":"\([0-9.]*\)".*/\1/p' /run/ctt/sensors.json 2>/dev/null)
          note "SPONTANEOUS DISCONNECT | $line | uptime=$(cut -d. -f1 /proc/uptime)s batt=${batt:-?}V throttled=$(vcgencmd get_throttled 2>/dev/null | cut -d= -f2) temp=$(vcgencmd measure_temp 2>/dev/null | cut -d= -f2)"
          ;;
        *"new "*"USB device number"*)
          note "re-enumerated | $line"
          NEW="$(resolve_port || true)"; [ -n "$NEW" ] && PORT="$NEW"
          ;;
      esac
    done
