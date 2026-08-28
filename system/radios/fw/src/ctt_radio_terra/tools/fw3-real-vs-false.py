#!/usr/bin/env python3
"""Real vs false, with a stronger definition than 'uncorroborated'.

A tag is REAL if it is well established in this environment: >=50 rows on at
least two of the three tag channels in the comparison window. Everything else a
channel emits is FALSE -- one-off noise, or a legal-but-wrong ID produced by
correction. This catches volume that lands on already-known IDs, which the
uncorroborated test cannot.
"""
import sys, collections, statistics
sys.path.insert(0, "/tmp/fw3")
from load import load, bucket, WINDOWS, CHANS
FW = {"1":"4.0.0 (stock)","2":"5.1.0-terra","3":"5.3.1-terra"}

rows = load(); cnt, rssi, val = bucket(rows)
C = cnt["CMP"]

seen_on = collections.Counter()
for ch in CHANS:
    for t, n in C[ch].items():
        if n >= 50: seen_on[t] += 1
REAL = {t for t, k in seen_on.items() if k >= 2}
print("  REAL tag set: %d IDs (>=50 rows on >=2 of the 3 tag channels)" % len(REAL))
print("  %s" % ", ".join(sorted(REAL)[:12]) + (" ..." if len(REAL) > 12 else ""))
print()
print("=" * 88)
print("REAL vs FALSE DETECTIONS")
print("=" * 88)
print("  %-14s %9s %9s %9s %8s | %8s %9s" %
      ("firmware","rows","real","false","false%","realIDs","falseIDs"))
base = None
for ch in CHANS:
    tot = sum(C[ch].values())
    r = sum(n for t, n in C[ch].items() if t in REAL)
    f = tot - r
    rid = sum(1 for t in C[ch] if t in REAL)
    fid = len(C[ch]) - rid
    if ch == "1": base = (r, f)
    print("  %-14s %9d %9d %9d %7.2f%% | %8d %9d" % (FW[ch], tot, r, f, 100.0*f/tot, rid, fid))

print()
print("  relative to stock (same window, so environment is common):")
for ch in CHANS:
    r = sum(n for t, n in C[ch].items() if t in REAL)
    f = sum(n for t, n in C[ch].items() if t not in REAL)
    print("    %-14s real %+6.1f%%   false %+7.1f%%" %
          (FW[ch], 100.0*(r/base[0]-1), 100.0*(f/base[1]-1)))

# are terra's extra false rows bit-7 neighbours of real tags?
def b7n(tag):
    try: bs=[int(tag[i:i+2],16) for i in (0,2,4,6)]
    except Exception: return []
    out=[]
    for i in range(4):
        c=list(bs); c[i]^=0x80; out.append("".join("%02X"%x for x in c))
    return out
print()
print("=" * 88)
print("ARE THE FALSE ROWS BIT-7 NEIGHBOURS OF REAL TAGS?  (the gate's blind spot)")
print("=" * 88)
print("  %-14s %10s %12s %10s" % ("firmware","false rows","b7-of-real","share"))
for ch in CHANS:
    f = {t: n for t, n in C[ch].items() if t not in REAL}
    tot = sum(f.values())
    b7 = sum(n for t, n in f.items() if any(x in REAL for x in b7n(t)))
    print("  %-14s %10d %12d %9.1f%%" % (FW[ch], tot, b7, 100.0*b7/tot if tot else 0))
