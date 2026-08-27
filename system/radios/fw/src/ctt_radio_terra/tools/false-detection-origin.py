#!/usr/bin/env python3
"""Where do ch5's uncorroborated IDs come from?

terra corrects single-bit errors (ecc_fixed) and bit-7 flips (b7_fixed). Hamming
(7,4) is a PERFECT code -- the record's own words: "pure noise corrects as readily
as a real tag" -- so correction applied to a noise frame lands on SOME legal ID.
If terra's extra false detections are mis-corrections rather than raw phantoms,
they should sit within one bit of a strongly-detected real tag. Raw phantoms
should not.
"""
import collections, csv, json, os, subprocess, sys
READER = "/lib/ctt/sensor-station-software/system/scripts/read-detections.py"
phases = [json.loads(l) for l in open("/tmp/terra/phases.jsonl") if l.strip()]
res = subprocess.run(["sudo", READER, "--since", phases[0]["start"],
                      "--until", phases[-1]["end"], "--quiet"],
                     capture_output=True, text=True)
rows = list(csv.DictReader(res.stdout.splitlines()))
per = collections.defaultdict(lambda: collections.defaultdict(collections.Counter))
for r in rows:
    for p in phases:
        if p["start"] <= r["Time"] <= p["end"]:
            per[p["label"]][r["RadioId"]][r["TagId"]] += 1
            break

def bits(tag):
    return int(tag, 16)

def dist1(a, b):
    x = bits(a) ^ bits(b)
    return x != 0 and (x & (x - 1)) == 0        # exactly one bit differs

print("  phase        uncorroborated ID  n   within 1 bit of a strong real tag?")
for p in phases:
    L = p["label"]
    mine = per[L]["5"]
    others = collections.Counter()
    for c, cnt in per[L].items():
        if c != "5":
            others.update(set(cnt))
    strong = {t for t, n in mine.items() if n >= 20 and others[t] > 0}
    uncorr = sorted((t for t in mine if others[t] == 0), key=lambda t: -mine[t])
    if not uncorr:
        print("  %-12s (none)" % L)
        continue
    for t in uncorr:
        near = [s for s in strong if dist1(t, s)]
        note = ("YES  <- 1 bit from %s (n=%d)" % (near[0], mine[near[0]])) if near else "no"
        print("  %-12s %-18s %-3d %s" % (L, t, mine[t], note))
