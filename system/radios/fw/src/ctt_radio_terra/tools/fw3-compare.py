#!/usr/bin/env python3
"""Three-way firmware comparison: 4.0.0 (ch1) vs 5.1.0-terra (ch2) vs 5.3.1-terra (ch3).

Cross-channel, so the fixed channel factor K(ch,tag) is measured from
same-firmware windows and divided out. A tag is only used if K measured in two
INDEPENDENT windows agrees within 10% -- otherwise the tag drifts on its own and
its K is not a constant to divide by.
"""
import sys, statistics, collections
sys.path.insert(0, "/tmp/fw3")
from load import load, bucket, WINDOWS, CHANS

FW = {"1": "4.0.0 (stock)", "2": "5.1.0-terra", "3": "5.3.1-terra"}
TOL = 0.10          # K agreement required across independent windows
MINN = 25

rows = load()
cnt, rssi, val = bucket(rows)

def K(w, ch, ref="1"):
    return {t: n / cnt[w][ref][t] for t, n in cnt[w][ch].items()
            if n >= MINN and cnt[w][ref][t] >= MINN}

# ---- stability screen -----------------------------------------------------
k2 = {"yday": K("CAL_yday","2"), "today": K("CAL_today","2"), "cal12": K("CAL_12","2")}
k3 = {"yday": K("CAL_yday","3"), "today": K("CAL_today","3")}

def stable(ks):
    keys = set.intersection(*[set(d) for d in ks.values()])
    out = {}
    for t in keys:
        vals = [d[t] for d in ks.values()]
        if min(vals) > 0 and max(vals) / min(vals) <= 1 + TOL:
            out[t] = statistics.median(vals)
    return out, keys

K2, cand2 = stable(k2)
K3, cand3 = stable(k3)
usable = sorted(set(K2) & set(K3))

print("=" * 86)
print("CHANNEL CALIBRATION (measured where the channels ran identical firmware)")
print("=" * 86)
print("  %-10s %10s %10s | %10s %10s | %s" % ("tag","K2 (best)","K2 spread","K3 (best)","K3 spread","used"))
for t in sorted(cand2 & cand3):
    s2 = max(d[t] for d in k2.values()) / min(d[t] for d in k2.values())
    s3 = max(d[t] for d in k3.values()) / min(d[t] for d in k3.values())
    ok = t in K2 and t in K3
    print("  %-10s %10.3f %10.2fx | %10.3f %10.2fx | %s" %
          (t, statistics.median([d[t] for d in k2.values()]), s2,
           statistics.median([d[t] for d in k3.values()]), s3,
           "yes" if ok else "EXCLUDED"))
print("\n  usable tags: %d  (K must agree within %d%% across independent windows)"
      % (len(usable), int(TOL*100)))
if not usable:
    sys.exit("no usable tags")

# floor: how well does K itself reproduce, on the usable set?
fl2 = [max(d[t] for d in k2.values())/min(d[t] for d in k2.values()) for t in usable]
fl3 = [max(d[t] for d in k3.values())/min(d[t] for d in k3.values()) for t in usable]
floor = statistics.median(fl2 + fl3)
print("  MEASUREMENT FLOOR from K's own reproducibility: %.3fx (worst %.3fx)"
      % (floor, max(fl2 + fl3)))

# ---- detection rate -------------------------------------------------------
print()
print("=" * 86)
print("1. DETECTION RATE  (K divided out; 1.000 = same as stock on the same tag)")
print("=" * 86)
print("  %-10s %12s %12s | %12s %12s" % ("tag","ch2 raw","ch3 raw","5.1.0 vs stk","5.3.1 vs stk"))
f2, f3 = [], []
for t in usable:
    r2 = cnt["CMP"]["2"][t] / cnt["CMP"]["1"][t]
    r3 = cnt["CMP"]["3"][t] / cnt["CMP"]["1"][t]
    a, b = r2 / K2[t], r3 / K3[t]
    f2.append(a); f3.append(b)
    print("  %-10s %12.3f %12.3f | %12.3f %12.3f" % (t, r2, r3, a, b))
print("  " + "-" * 82)
print("  %-10s %12s %12s | %12.3f %12.3f" % ("MEDIAN","","", statistics.median(f2), statistics.median(f3)))
print()
print("  stock 4.0.0  = 1.000 by definition (the reference)")
print("  5.1.0-terra  = %.3f   (floor %.3f)" % (statistics.median(f2), floor))
print("  5.3.1-terra  = %.3f   (floor %.3f)" % (statistics.median(f3), floor))

# ---- RSSI -----------------------------------------------------------------
print()
print("=" * 86)
print("2. RSSI  (per-tag median, dB relative to ch1; channel offset removed)")
print("=" * 86)
print("  %-10s %9s %9s | %9s %9s | %11s %11s" %
      ("tag","cal d2","cal d3","cmp d2","cmp d3","5.1.0 eff","5.3.1 eff"))
e2, e3 = [], []
for t in usable:
    def med(w, ch):
        v = rssi[w][ch][t]
        return statistics.median(v) if v else None
    c1, c2, c3 = med("CAL_yday","1"), med("CAL_yday","2"), med("CAL_yday","3")
    m1, m2, m3 = med("CMP","1"), med("CMP","2"), med("CMP","3")
    if None in (c1,c2,c3,m1,m2,m3): continue
    d2c, d3c, d2m, d3m = c2-c1, c3-c1, m2-m1, m3-m1
    a, b = d2m-d2c, d3m-d3c
    e2.append(a); e3.append(b)
    print("  %-10s %9.1f %9.1f | %9.1f %9.1f | %11.1f %11.1f" % (t,d2c,d3c,d2m,d3m,a,b))
if e2:
    print("  " + "-" * 82)
    print("  %-10s %9s %9s | %9s %9s | %11.2f %11.2f" %
          ("MEDIAN","","","","", statistics.median(e2), statistics.median(e3)))
    print("\n  5.1.0 vs stock: %+.2f dB     5.3.1 vs stock: %+.2f dB"
          % (statistics.median(e2), statistics.median(e3)))

# ---- real vs false --------------------------------------------------------
print()
print("=" * 86)
print("3. REAL vs FALSE DETECTIONS  (false = ID no other tag-mode channel saw)")
print("=" * 86)
print("  %-14s %8s %7s %9s %10s %9s %9s" %
      ("firmware","rows","IDs","falseIDs","falseRows","false%","real%"))
for ch in CHANS:
    mine = cnt["CMP"][ch]
    others = collections.Counter()
    for c in CHANS:
        if c != ch: others.update(set(cnt["CMP"][c]))
    tot = sum(mine.values())
    fid = [t for t in mine if others[t] == 0]
    frow = sum(mine[t] for t in fid)
    print("  %-14s %8d %7d %9d %10d %8.2f%% %8.2f%%" %
          (FW[ch], tot, len(mine), len(fid), frow, 100.0*frow/tot, 100.0*(tot-frow)/tot))

# ---- validated ------------------------------------------------------------
print()
print("=" * 86)
print("4. CRC-VALIDATED FRACTION  (Validated=1 iff BEEP_1, i.e. radio checked the CRC)")
print("=" * 86)
print("  %-14s %10s %10s %9s" % ("firmware","rows","validated","pct"))
for ch in CHANS:
    tot, v = val["CMP"][ch]
    print("  %-14s %10d %10d %8.1f%%" % (FW[ch], tot, v, 100.0*v/tot if tot else 0))
