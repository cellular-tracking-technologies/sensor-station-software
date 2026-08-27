#!/bin/bash
# Does terra's error correction MANUFACTURE false detections?
#
# Measured 2026-08-27: terra 5.3.1 emits ~9x stock's uncorroborated-ID rate
# (1.35% vs 0.15%), and its false IDs are not random -- they REPEAT (n=5..9) and
# every repeat offender is a single bit-7 flip of a strong real tag. Hamming(7,4)
# is a perfect code, so correction applied to a noise frame does not fail, it
# lands on SOME legal ID -- and the nearest legal IDs are neighbours of whatever
# is loudest. Hypothesis: the recovery feature is fabricating the false IDs.
#
# ecc:0 disables BOTH correction paths (Hamming at the GATE_PARITY branch and
# bit-7 at the GATE_PASS/!crcok branch), so this is a clean on/off test on ONE
# radio with ONE firmware. ch1 stays on stock as the simultaneous control.
#
# Conditions are INTERLEAVED (1,0,1,0) so a drift trend cannot masquerade as the
# effect, and each setting is measured twice.
#
# Counters are cumulative and there is no reflash between conditions, so status
# is sampled before AND after each window and the delta is what is reported.
set -u

REPO=/lib/ctt/sensor-station-software
TERRA="$REPO/system/radios/fw/src/ctt_radio_terra/build/ctt_radio_terra.ino.hex"
STOCK="$REPO/system/radios/fw/ss_v4.0.0.hex"
DUT=5
COND_MIN="${COND_MIN:-15}"
DIR=/tmp/ecc
CONDS="$DIR/conds.jsonl"; LOG="$DIR/run.log"
SEQ="1 0 1 0"

say() { echo "$(date -u +'%Y-%m-%d %H:%M:%S') $*" | tee -a "$LOG"; }
fwver() { node /tmp/terra/fwver.mjs "$1" 2>/dev/null | sed -n 's/^ *ch[0-9]*: //p'; }

mkdir -p "$DIR"; : > "$CONDS"; : > "$LOG"

say "### flashing ch$DUT with 5.3.1-terra"
"$REPO/system/scripts/program-radio.sh" "$DUT" "$TERRA" >>"$LOG" 2>&1 || { say "!!! flash failed"; exit 1; }
sleep 10
v="$(fwver "$DUT")"; [ "$v" = "5.3.1-terra" ] || { say "!!! ch$DUT reports '$v' -- abort"; exit 1; }
say "    ch$DUT on $v"
v="$(fwver 1)"; [ "$v" = "4.0.0" ] || { say "!!! control ch1 reports '$v' -- abort"; exit 1; }
say "    control ch1 on $v"
sleep 60

i=0
for e in $SEQ; do
  i=$((i+1)); label="E${i}_ecc${e}"
  out="$(node "$DIR/setecc.mjs" "$DUT" "$e" 2>&1)"
  case "$out" in ok*) ;; *) say "!!! $label set ecc:$e -> '$out' -- abort"; exit 1 ;; esac
  set -- $out
  [ "$2" = "$e" ] || { say "!!! $label readback ecc=$2 != $e -- abort"; exit 1; }
  say "=== $label ecc=$e confirmed"
  sleep 20
  node /tmp/terra/status.mjs "$DUT" status 2500 > "$DIR/${label}-pre.txt" 2>&1 || true
  start="$(date -u +'%Y-%m-%d %H:%M:%S')"
  sleep "$((COND_MIN*60))"
  end="$(date -u +'%Y-%m-%d %H:%M:%S')"
  node /tmp/terra/status.mjs "$DUT" status 2500 > "$DIR/${label}-post.txt" 2>&1 || true
  printf '{"label":"%s","ecc":%s,"start":"%s","end":"%s"}\n' "$label" "$e" "$start" "$end" >> "$CONDS"
  say "    $label window $start .. $end"
done

say "### restoring ch$DUT to stock 4.0.0"
"$REPO/system/scripts/program-radio.sh" "$DUT" "$STOCK" >>"$LOG" 2>&1
sleep 10
say "### final: $(node /tmp/terra/fwver.mjs 1,2,3,4,5 2>/dev/null | tr -d '\n')"
say "### COMPLETE"
