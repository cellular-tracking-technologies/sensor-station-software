#!/usr/bin/env python3
"""Step 1: is K(ch) stable enough to divide out? If not, nothing else is valid."""
import sys, statistics, collections
sys.path.insert(0, "/tmp/fw3")
from load import load, bucket, WINDOWS, CHANS

rows = load()
cnt, rssi, val = bucket(rows)
print("  rows loaded: %d" % len(rows))
print()
print("  === window sizes (rows per channel) ===")
print("  %-10s %8s %8s %8s" % ("window", "ch1", "ch2", "ch3"))
for w in WINDOWS:
    print("  %-10s %8d %8d %8d" % (w, *[sum(cnt[w][c].values()) for c in CHANS]))

def K(w, ch, ref="1", minn=25):
    """Per-tag ratio ch/ref, for tags with enough counts in both."""
    out = {}
    for t, n in cnt[w][ch].items():
        m = cnt[w][ref][t]
        if n >= minn and m >= minn:
            out[t] = n / m
    return out

print()
print("  === K(ch/ch1) per tag, from same-firmware windows ===")
print("  (CAL_yday and CAL_today: ch1/ch2/ch3 ALL stock. CAL_12: ch1/ch2 stock only)")
tags = sorted(set(K("CAL_yday","2")) | set(K("CAL_today","2")) | set(K("CMP","2")))
hdr = "  %-10s %10s %10s %10s | %10s %10s"
print(hdr % ("tag", "K2 yday", "K2 today", "K2 cal12", "K3 yday", "K3 today"))
k2y, k2t, k2c, k3y, k3t = K("CAL_yday","2"), K("CAL_today","2"), K("CAL_12","2"), K("CAL_yday","3"), K("CAL_today","3")
common = [t for t in tags if t in k2y and t in k2t and t in k2c and t in k3y and t in k3t]
for t in common:
    print(hdr % (t, "%.3f"%k2y[t], "%.3f"%k2t[t], "%.3f"%k2c[t], "%.3f"%k3y[t], "%.3f"%k3t[t]))
print("  tags usable in every calibration window: %d" % len(common))

if common:
    print()
    print("  === K reproducibility: does the SAME K measured in different windows agree? ===")
    def spread(a, b, label):
        r = [a[t]/b[t] for t in common]
        print("    %-28s median %.3f   range %.3f..%.3f" %
              (label, statistics.median(r), min(r), max(r)))
    spread(k2t, k2y, "K2 today vs yesterday")
    spread(k2c, k2y, "K2 cal12 vs yesterday")
    spread(k2c, k2t, "K2 cal12 vs today")
    spread(k3t, k3y, "K3 today vs yesterday")
