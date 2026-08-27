#!/bin/bash
# Sweep terra's RegRssiThresh against a fixed tag population, to measure whether
# (and at what signal-to-threshold margin) the register gates packet reception.
#
# The prediction this exists to test -- that stock out-detects terra at low signal
# because stock leaves RegRssiThresh at 0xFF (-127.5 dBm) while terra writes 0xE4
# (-114 dBm) -- is about the MARGIN between signal and threshold, not absolute
# dBm. terra exposes rssi_thresh as a runtime command (-127..-20, reg = -2*dbm),
# so raise the threshold to meet a fixed signal rather than waiting for a quiet
# environment. That isolates the one register (stock vs terra differ in many other
# ways), needs no reflash between conditions, and can place the threshold ABOVE
# every tag present -- which no amount of waiting can guarantee.
#
# -127 (0xFE) is within 0.5 dB of stock's 0xFF, so terra can stand in for both.
#
# TWO RULES, both learned the hard way (see the investigation's 2026-08-27 update):
#
#   1. INCLUDE A REPEATED THRESHOLD (the default list starts and ends at -114).
#      Without a same-setting repeat, drift is indistinguishable from an effect,
#      and on this bench drift is large enough to fake any effect being looked for.
#   2. TAKE THE SWEEP ABOVE THE STRONGEST TAG, or the result is inconclusive
#      rather than negative. "No loss up to -80 dBm" says nothing if the strongest
#      stable tag is -59 dBm.
#
# Usage:  DUT=5 COND_MIN=5 THRESHOLDS="-114 -75 -55 -114" ./rssi-thresh-sweep.sh
set -u

REPO="${REPO:-/lib/ctt/sensor-station-software}"
TOOLS="$(cd "$(dirname "$0")" && pwd)"
TERRA="$REPO/system/radios/fw/src/ctt_radio_terra/build/ctt_radio_terra.ino.hex"
STOCK="$REPO/system/radios/fw/ss_v4.0.0.hex"
DUT="${DUT:-5}"
REF="${REF:-1}"                       # constant control, never touched
COND_MIN="${COND_MIN:-5}"
DIR="${DIR:-/tmp/rssi-sweep}"
THRESHOLDS="${THRESHOLDS:--114 -127 -100 -95 -90 -87 -85 -80 -75 -70 -67 -64 -61 -58 -55 -114}"

CONDS="$DIR/conds.jsonl"; LOG="$DIR/run.log"
say() { echo "$(date -u +'%Y-%m-%d %H:%M:%S') $*" | tee -a "$LOG"; }
fwver() { node "$TOOLS/radio-version.mjs" "$1" 2>/dev/null | sed -n 's/^ *ch[0-9]*: //p'; }

mkdir -p "$DIR"; : > "$CONDS"; : > "$LOG"

say "### flashing ch$DUT with terra"
"$REPO/system/scripts/program-radio.sh" "$DUT" "$TERRA" >>"$LOG" 2>&1 || {
  say "!!! flash failed -- abort"; exit 1; }
sleep 10
v="$(fwver "$DUT")"; case "$v" in *terra) ;; *) say "!!! ch$DUT reports '$v' -- abort"; exit 1 ;; esac
say "    ch$DUT on $v"
v="$(fwver "$REF")"; [ "$v" = "4.0.0" ] || { say "!!! control ch$REF reports '$v' -- abort"; exit 1; }
say "    control ch$REF on $v"
sleep 60                                # settle after flash, discarded

i=0
for t in $THRESHOLDS; do
  i=$((i+1)); label="S${i}_${t}"
  out="$(node "$TOOLS/radio-setthresh.mjs" "$DUT" "$t" 2>&1)"
  case "$out" in ok*) ;; *) say "!!! $label set rssi_thresh:$t -> '$out' -- abort"; exit 1 ;; esac
  set -- $out
  say "=== $label set $t dBm -> reg $2 (readback $3 dBm)"
  [ "$3" = "$t" ] || { say "!!! readback $3 != requested $t -- abort"; exit 1; }
  sleep 20
  start="$(date -u +'%Y-%m-%d %H:%M:%S')"
  sleep "$((COND_MIN*60))"
  end="$(date -u +'%Y-%m-%d %H:%M:%S')"
  node "$TOOLS/radio-status.mjs" "$DUT" status 2500 > "$DIR/${label}-status.txt" 2>&1 || true
  printf '{"label":"%s","thresh_dbm":%s,"reg":"%s","start":"%s","end":"%s"}\n' \
    "$label" "$t" "$2" "$start" "$end" >> "$CONDS"
  say "    $label window $start .. $end"
done

say "### restoring ch$DUT to stock"
"$REPO/system/scripts/program-radio.sh" "$DUT" "$STOCK" >>"$LOG" 2>&1
sleep 10
say "### final: $(node "$TOOLS/radio-version.mjs" 1,2,3,4,5 2>/dev/null | tr -d '\n')"
say "### COMPLETE"
