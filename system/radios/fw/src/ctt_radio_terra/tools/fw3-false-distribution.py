#!/usr/bin/env python3
"""Fewest false IDs vs fewest false detections: which firmware is actually cleaner?

A false ID seen ONCE is trivially filtered by any frequency threshold. A false ID
seen 15 times is indistinguishable from a genuine weak tag. So the distribution
matters more than the count of distinct IDs.
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

def b7n(tag):
    try: bs=[int(tag[i:i+2],16) for i in (0,2,4,6)]
    except Exception: return []
    o=[]
    for i in range(4):
        c=list(bs); c[i]^=0x80; o.append("".join("%02X"%x for x in c))
    return o

print("=" * 90)
print("DISTRIBUTION OF FALSE DETECTIONS  (a rare false ID is filterable; a frequent one is not)")
print("=" * 90)
print("  %-14s %7s %8s %9s | %8s %8s %8s %8s" %
      ("firmware","IDs","rows","rows/ID","n=1","n=2-4","n=5-9","n>=10"))
keep = {}
for ch in CHANS:
    f = {t: n for t, n in C[ch].items() if t not in REAL}
    tot = sum(f.values())
    b = collections.Counter()
    for t, n in f.items():
        b["1" if n == 1 else "2-4" if n <= 4 else "5-9" if n <= 9 else ">=10"] += 1
    keep[ch] = f
    print("  %-14s %7d %8d %9.1f | %8d %8d %8d %8d" %
          (FW[ch], len(f), tot, tot/len(f) if f else 0,
           b["1"], b["2-4"], b["5-9"], b[">=10"]))

print()
print("  ROWS contributed by each bucket (what actually reaches the data):")
print("  %-14s %10s %10s %10s %10s" % ("firmware","n=1","n=2-4","n=5-9","n>=10"))
for ch in CHANS:
    f = keep[ch]; r = collections.Counter()
    for t, n in f.items():
        r["1" if n == 1 else "2-4" if n <= 4 else "5-9" if n <= 9 else ">=10"] += n
    tot = sum(f.values())
    print("  %-14s %10d %10d %10d %10s" %
          (FW[ch], r["1"], r["2-4"], r["5-9"],
           "%d (%.0f%%)" % (r[">=10"], 100.0*r[">=10"]/tot if tot else 0)))

print()
print("=" * 90)
print("THE DANGEROUS CLASS: false IDs seen >=10 times AND one bit-7 flip from a real tag")
print("=" * 90)
for ch in CHANS:
    f = keep[ch]
    bad = sorted(((t, n) for t, n in f.items()
                  if n >= 10 and any(x in REAL for x in b7n(t))),
                 key=lambda x: -x[1])
    tot = sum(n for _, n in bad)
    print("  %-14s %2d IDs, %4d rows" % (FW[ch], len(bad), tot))
    for t, n in bad[:6]:
        parent = [x for x in b7n(t) if x in REAL][0]
        pn = max(C[c][parent] for c in CHANS)
        print("      %s  n=%-4d  <- bit-7 of %s (n=%d)" % (t, n, parent, pn))

print()
print("=" * 90)
print("FILTERABILITY: what survives a simple 'drop IDs seen < 10 times' rule?")
print("=" * 90)
print("  %-14s %12s %12s %12s" % ("firmware","false rows","after filter","removed"))
for ch in CHANS:
    f = keep[ch]; tot = sum(f.values())
    surv = sum(n for n in f.values() if n >= 10)
    print("  %-14s %12d %12d %11.0f%%" % (FW[ch], tot, surv, 100.0*(tot-surv)/tot if tot else 0))
