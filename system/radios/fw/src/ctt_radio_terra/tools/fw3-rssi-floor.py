#!/usr/bin/env python3
import sys, statistics, collections
sys.path.insert(0, "/tmp/fw3")
from load import load, bucket, WINDOWS, CHANS
FW = {"1":"4.0.0 (stock)","2":"5.1.0-terra","3":"5.3.1-terra"}
USABLE = ["071E6661","33075555","55613461"]

rows = load(); cnt, rssi, val = bucket(rows)

# --- RSSI floor: same firmware, two independent windows -------------------
print("=" * 84)
print("RSSI FLOOR  (ch1/ch2/ch3 ALL stock in both windows -> any delta is noise)")
print("=" * 84)
print("  %-10s %14s %14s %10s" % ("tag","d(ch2) y->t","d(ch3) y->t","note"))
fl = []
for t in USABLE:
    def med(w, ch):
        v = rssi[w][ch][t]; return statistics.median(v) if v else None
    a = [med("CAL_yday",c) for c in CHANS]; b = [med("CAL_today",c) for c in CHANS]
    if None in a or None in b: continue
    d2 = (b[1]-b[0]) - (a[1]-a[0]); d3 = (b[2]-b[0]) - (a[2]-a[0])
    fl += [abs(d2), abs(d3)]
    print("  %-10s %14.1f %14.1f" % (t, d2, d3))
if fl:
    print("  " + "-"*80)
    print("  same-firmware RSSI floor: median |delta| %.2f dB, worst %.2f dB" %
          (statistics.median(fl), max(fl)))

# --- validated %: everything vs real tags only ----------------------------
print()
print("=" * 84)
print("VALIDATED FRACTION: all emitted rows vs REAL (corroborated) tags only")
print("=" * 84)
print("  %-14s %12s %12s | %12s %12s" % ("firmware","all rows","all val%","real rows","real val%"))
# recompute per-row validated restricted to a tag set
byfw = {}
for ch in CHANS:
    tot = sum(cnt["CMP"][ch].values())
    allv = val["CMP"][ch][1]
    byfw[ch] = (tot, allv)
# need per-tag validated -> re-scan
pt = collections.defaultdict(lambda: collections.defaultdict(lambda: [0,0]))
a, b = WINDOWS["CMP"]
for r in rows:
    if a <= r["Time"] <= b and r["RadioId"] in CHANS:
        e = pt[r["RadioId"]][r["TagId"]]
        e[0] += 1
        if r.get("Validated") == "1": e[1] += 1
for ch in CHANS:
    tot, allv = byfw[ch]
    rt = sum(pt[ch][t][0] for t in USABLE)
    rv = sum(pt[ch][t][1] for t in USABLE)
    print("  %-14s %12d %11.1f%% | %12d %11.1f%%" %
          (FW[ch], tot, 100.0*allv/tot, rt, 100.0*rv/rt if rt else 0))

# --- per-tag validated on the real set ------------------------------------
print()
print("  per-tag validated%% on the three calibrated real tags:")
print("  %-10s %12s %12s %12s" % ("tag", FW["1"], FW["2"], FW["3"]))
for t in USABLE:
    vals = []
    for ch in CHANS:
        n, v = pt[ch][t]
        vals.append("%.1f%%" % (100.0*v/n) if n else "-")
    print("  %-10s %12s %12s %12s" % (t, *vals))

# --- yield: emitted per synced frame is in the counters; here: rows/min ----
print()
print("=" * 84)
print("THROUGHPUT in the comparison window")
print("=" * 84)
import datetime
fmt = "%Y-%m-%d %H:%M:%S"
mins = (datetime.datetime.strptime(b, fmt) - datetime.datetime.strptime(a, fmt)).total_seconds()/60
print("  window %.0f min" % mins)
for ch in CHANS:
    tot = sum(cnt["CMP"][ch].values())
    print("  %-14s %8d rows  %7.1f rows/min  %5d distinct IDs" %
          (FW[ch], tot, tot/mins, len(cnt["CMP"][ch])))
