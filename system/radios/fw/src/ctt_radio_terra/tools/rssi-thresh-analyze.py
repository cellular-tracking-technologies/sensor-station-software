#!/usr/bin/env python3
"""Analyse the RegRssiThresh margin sweep.

ch5 runs terra 5.3.1 with rssi_thresh swept; ch1 holds stock, untouched, as the
simultaneous control. Retention for tag t at threshold T is

    R_T(t) = n_ch5,T(t) / n_ch1,T(t)          normalised to the -127 dBm run

so drift in tag activity divides out and what remains is the effect of the one
register. Each tag's own ch5 RSSI gives its margin above the threshold, which is
what the prediction is actually about.

Reads via read-detections so the rotation trap cannot bite (see system/README.md).
"""
import os
import collections, csv, json, statistics, subprocess, sys

READER = "/lib/ctt/sensor-station-software/system/scripts/read-detections.py"
CONDS = os.environ.get("SWEEP_DIR", "/tmp/rssi-sweep") + "/conds.jsonl"
REF, DUT = "1", "5"

conds = [json.loads(l) for l in open(CONDS) if l.strip()]
if not conds:
    sys.exit("no conditions recorded yet")

out = subprocess.run(
    ["sudo", READER, "--since", conds[0]["start"], "--until", conds[-1]["end"], "--quiet"],
    capture_output=True, text=True)
if out.returncode != 0:
    sys.exit("read-detections failed: %s" % out.stderr[-400:])
rows = list(csv.DictReader(out.stdout.splitlines()))
print("  rows read: %d  (%s .. %s)\n" % (len(rows), conds[0]["start"], conds[-1]["end"]))

cnt = collections.defaultdict(lambda: collections.defaultdict(collections.Counter))
rssi = collections.defaultdict(list)
for r in rows:
    ch = r["RadioId"]
    if ch not in (REF, DUT):
        continue
    for c in conds:
        if c["start"] <= r["Time"] <= c["end"]:
            cnt[c["label"]][r["TagId"]][ch] += 1
            if ch == DUT:
                try: rssi[r["TagId"]].append(float(r["TagRSSI"]))
                except ValueError: pass
            break

labels = [c["label"] for c in conds]
thr = {c["label"]: c["thresh_dbm"] for c in conds}

print("  CONDITIONS")
print("  %-12s %8s %6s   %8s %8s" % ("label", "thresh", "reg", "ch5 n", "ch1 n"))
for c in conds:
    L = c["label"]
    print("  %-12s %8d %6s   %8d %8d"
          % (L, c["thresh_dbm"], c["reg"],
             sum(cnt[L][t][DUT] for t in cnt[L]), sum(cnt[L][t][REF] for t in cnt[L])))

# Baseline is the -127 run (terra emulating stock's 0xFF reset value).
base = next((L for L in labels if thr[L] == -127), labels[0])

# Tags that were solidly present in the baseline: only they can show a loss.
solid = [t for t in cnt[base] if cnt[base][t][DUT] >= 15 and cnt[base][t][REF] >= 15]
solid.sort(key=lambda t: -statistics.median(rssi[t]) if rssi[t] else 0)

# Built-in stability control: -114 and -127 are BOTH far below every signal here,
# so a tag whose retention differs between them cannot be showing a threshold
# effect -- it is drifting on its own. Screen those out before looking for onset,
# or marginal-tag noise gets read as the effect under study. (Observed: 4B551934
# at 8.64 and 6178191E at 2.83, i.e. "retention" far above 1, which no gating
# mechanism can produce.)
# Prefer the SAME-SETTING repeat as the control: two conditions at an identical
# threshold must agree, so any tag that disagrees between them drifted on its own
# and cannot be read for a threshold effect. Falling back to -127-vs--114 only
# when no repeat exists.
#
# This matters more than it looks. Keying the screen on -127 (absent from sweep 2)
# left the repeat unused, and the onset detector then read the repeat's OWN drift
# as an onset "at -114" -- inventing a +28 dB margin and a spurious confirmation
# of the prediction out of four tags that had simply drifted over 50 minutes.
# Find ANY threshold that was visited twice -- that pair is the control, whatever
# the normalisation base happens to be. Keying this to the base instead left the
# screen unrun whenever the base was not the repeated setting, and the onset
# detector then read the repeat's own drift as a threshold effect.
by_thr = collections.Counter(thr[L] for L in labels)
rep_thr = next((v for v, n in by_thr.most_common() if n >= 2), None)
ctrl_a = ctrl_b = None
if rep_thr is not None:
    same = [L for L in labels if thr[L] == rep_thr]
    ctrl_a, ctrl_b = same[0], same[-1]

unstable = set()
if ctrl_a and ctrl_b:
    for t in solid:
        try:
            a = cnt[ctrl_a][t][DUT] / cnt[ctrl_a][t][REF]
            b = cnt[ctrl_b][t][DUT] / cnt[ctrl_b][t][REF]
        except ZeroDivisionError:
            unstable.add(t); continue
        if a == 0 or not (0.90 <= (b / a) <= 1.10):
            unstable.add(t)

print("\n  RETENTION vs THRESHOLD  (ch5/ch1, normalised to the %s dBm run)" % thr[base])
if unstable:
    print("  [!] excluded as unstable (%s vs %s, identical %d dBm setting, disagree >10%%):"
          % (ctrl_a, ctrl_b, rep_thr))
    print("      %s" % ", ".join(sorted(unstable)))
print("  %-10s %7s  %s" % ("tag", "ch5dBm", "".join("%8d" % thr[L] for L in labels)))
onset = {}
for t in solid:
    med = statistics.median(rssi[t]) if rssi[t] else float("nan")
    b = cnt[base][t][DUT] / cnt[base][t][REF]
    cells, vals = "", {}
    for L in labels:
        a, c1 = cnt[L][t][DUT], cnt[L][t][REF]
        if c1 == 0:
            cells += "%8s" % "-"; continue
        v = (a / c1) / b
        vals[L] = v
        cells += "%8.2f" % v
    print("  %-10s %7.0f  %s%s" % (t, med, cells, "   UNSTABLE" if t in unstable else ""))
    # Loss ONSET: the lowest (most negative) threshold at which retention has
    # fallen below 0.90. Retention falls as T rises toward the signal.
    #
    # Only meaningful when the sweep actually BRACKETS the loss. On an incomplete
    # sweep every tag trivially looks "still fine at the highest T tested", which
    # would report a large margin and confirm the prediction regardless of what
    # the data said -- the "counter that can only report success" failure this
    # record already catalogues once. So record None when no loss was seen.
    if t in unstable:
        continue
    # Skip the normalisation base and the repeated control setting: neither is a
    # setting under test, so a dip there is drift, not gating.
    skip = {thr[base]} | ({rep_thr} if rep_thr is not None else set())
    failed = [thr[L] for L in labels
              if L in vals and vals[L] < 0.90 and thr[L] not in skip]
    if rssi[t]:
        onset[t] = (med, min(failed) if failed else None)

Tmax = max(thr.values())
Smax = max((statistics.median(rssi[t]) for t in solid if rssi[t]), default=None)
unbracketed = [t for t, v in onset.items() if v[1] is None]

print("\n  %-10s %8s %12s %8s" % ("tag", "ch5dBm", "onset T", "margin"))
margins = []
for t, (med, T) in sorted(onset.items(), key=lambda kv: -kv[1][0]):
    if T is None:
        print("  %-10s %8.0f %12s %8s" % (t, med, "none<=%d" % Tmax, "-"))
    else:
        margins.append(med - T)
        print("  %-10s %8.0f %12d %8.1f" % (t, med, T, med - T))

print()
if not margins:
    # "No onset" means two very different things, and they must not be conflated.
    #
    #   Tmax still BELOW the strongest signal -> the sweep never challenged the
    #     register; genuinely inconclusive.
    #   Tmax ABOVE every signal present      -> the threshold was set above every
    #     tag and STILL gated nothing. That is a positive control that fired and
    #     failed, which refutes the mechanism rather than leaving it open.
    print("  NO LOSS OBSERVED for any stable tag up to T = %d dBm." % Tmax)
    if Smax is not None and Tmax < Smax:
        print("  The sweep never rose above the strongest stable tag (%.0f dBm), so it did"
              % Smax)
        print("  not challenge the register: NEITHER confirmed nor refuted by this data.")
        print("  (Extend the sweep upward to bracket it.)")
    else:
        print("  The threshold was set ABOVE every tag present (strongest %.0f dBm) and"
              % Smax)
        print("  still gated nothing -- a positive control that fired and failed.")
        print()
        print("  PREDICTION: a tag ~5 dB above terra's -114 dBm threshold is gated out, so")
        print("              stock (-127.5 dBm) should out-detect terra at low signal.")
        print("  => REFUTED ON MECHANISM. RegRssiThresh does not gate packet reception on")
        print("     this part in this configuration, so the -114 vs -127.5 difference")
        print("     cannot produce a detection gap at ANY signal level. This is consistent")
        print("     with the record's own finding that RegIrqFlags1.Rssi is a latch that")
        print("     never clears in continuous RX: the threshold sets when that FLAG")
        print("     asserts, not whether a packet is received.")
else:
    need = statistics.median(margins)
    print("  Loss onset at a median margin of %+.1f dB above the threshold" % need)
    print("  (range %+.1f .. %+.1f dB over %d bracketed tags; %d showed no loss up to %d dBm)"
          % (min(margins), max(margins), len(margins), len(unbracketed), Tmax))
    print()
    print("  PREDICTION: a tag ~5 dB above terra's -114 dBm threshold is gated out, so")
    print("              stock (-127.5 dBm) should out-detect terra at low signal.")
    if need > 5.0:
        print("  => HOLDS. Loss begins while the signal is still %+.1f dB above the"
              % need)
        print("     threshold, so 5 dB of margin is not enough; at T=-114 a tag would")
        print("     need to be stronger than %.0f dBm." % (-114 + need))
    else:
        print("  => REFUTED. Loss only begins once the threshold is within %+.1f dB of the"
              % need)
        print("     signal, so a tag 5 dB above -114 dBm is NOT gated out and the")
        print("     -114 vs -127.5 difference cannot explain a detection gap.")

# -127 vs -114 head to head: the exact stock-vs-terra register difference.
# Only meaningful when BOTH -114 and -127 were actually visited. Comparing the
# baseline to itself prints a trivial 1.000 that reads like a result.
a = next((L for L in labels if thr[L] == -114), None)
if a and a != base and thr[base] == -127:
    vals = []
    for t in solid:
        if cnt[a][t][REF] and cnt[base][t][REF]:
            vals.append((cnt[a][t][DUT] / cnt[a][t][REF]) /
                        (cnt[base][t][DUT] / cnt[base][t][REF]))
    if vals:
        print("\n  DIRECT: T=-114 (terra) vs T=-127 (~stock 0xFF), same radio,"
              " same firmware")
        print("  median retention %.3f over %d tags at %.0f..%.0f dBm"
              % (statistics.median(vals), len(vals),
                 max(statistics.median(rssi[t]) for t in solid if rssi[t]),
                 min(statistics.median(rssi[t]) for t in solid if rssi[t])))

# Repeat of the -114 condition at the end = the floor.
rep = [L for L in labels if thr[L] == -114]
if len(rep) >= 2:
    vals = []
    for t in solid:
        try:
            vals.append((cnt[rep[-1]][t][DUT] / cnt[rep[-1]][t][REF]) /
                        (cnt[rep[0]][t][DUT] / cnt[rep[0]][t][REF]))
        except ZeroDivisionError:
            pass
    if vals:
        print("  FLOOR: same setting (-114) repeated %s vs %s -> %.3f over %d tags"
              % (rep[0], rep[-1], statistics.median(vals), len(vals)))
