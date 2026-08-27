#!/usr/bin/env python3
"""Did terra's error correction manufacture the false detections?

ch5 runs 5.3.1-terra throughout with ecc toggled 1/0/1/0; ch1-ch4 stay on stock.
A false detection is an ID no other channel saw in the same window (all five
radios are co-located and hear every real tag, so real tags corroborate and noise
does not). Counters are cumulative with no reflash between conditions, so each
window's status is sampled before and after and the DELTA is reported.
"""
import collections, csv, json, re, statistics, subprocess, sys

READER = "/lib/ctt/sensor-station-software/system/scripts/read-detections.py"
DIR = "/tmp/ecc"
DUT = "5"

conds = [json.loads(l) for l in open(DIR + "/conds.jsonl") if l.strip()]
if not conds:
    sys.exit("no conditions recorded yet")

res = subprocess.run(["sudo", READER, "--since", conds[0]["start"],
                      "--until", conds[-1]["end"], "--quiet"],
                     capture_output=True, text=True)
if res.returncode != 0:
    sys.exit("read-detections failed: %s" % res.stderr[-300:])
rows = list(csv.DictReader(res.stdout.splitlines()))

per = collections.defaultdict(lambda: collections.defaultdict(collections.Counter))
for r in rows:
    for c in conds:
        if c["start"] <= r["Time"] <= c["end"]:
            per[c["label"]][r["RadioId"]][r["TagId"]] += 1
            break

def counters(label):
    """Delta of the cumulative counters across the window."""
    def read(which):
        try:
            txt = open("%s/%s-%s.txt" % (DIR, label, which)).read()
        except OSError:
            return {}
        m = re.search(r'\{.*"irq_count".*\}', txt)
        if not m:
            return {}
        try:
            return json.loads(m.group(0))
        except ValueError:
            return {}
    a, b = read("pre"), read("post")
    if not a or not b:
        return {}
    keys = ("irq_count", "emitted", "gate_dropped", "gate_parity", "gate_msb",
            "ecc_fixed", "b7_fixed", "ecc_declined")
    return {k: b.get(k, 0) - a.get(k, 0) for k in keys}

def false_stats(label, ch):
    mine = per[label][ch]
    others = collections.Counter()
    for c, cnt in per[label].items():
        if c != ch:
            others.update(set(cnt))
    total = sum(mine.values())
    fids = [t for t in mine if others[t] == 0]
    frows = sum(mine[t] for t in fids)
    return total, len(mine), len(fids), frows, (100.0 * frows / total if total else 0.0)

print("=" * 88)
print("FALSE DETECTIONS with terra's error correction ON vs OFF (ch5, same firmware)")
print("=" * 88)
print("  %-11s %4s %7s %5s %8s %9s %9s | %8s" %
      ("cond", "ecc", "rows", "IDs", "falseID", "falseRow", "false%", "ch1 false%"))
byecc = collections.defaultdict(list)
for c in conds:
    L = c["label"]
    t5, i5, fi5, fr5, p5 = false_stats(L, DUT)
    _t1, _i1, _fi1, _fr1, p1 = false_stats(L, "1")
    byecc[c["ecc"]].append(p5)
    print("  %-11s %4d %7d %5d %8d %9d %8.2f%% | %7.2f%%" %
          (L, c["ecc"], t5, i5, fi5, fr5, p5, p1))

print()
print("=" * 88)
print("TERRA COUNTERS, delta per window")
print("=" * 88)
print("  %-11s %4s %9s %8s %11s %10s %9s" %
      ("cond", "ecc", "irq", "emitted", "gate_dropped", "ecc_fixed", "b7_fixed"))
for c in conds:
    d = counters(c["label"])
    if not d:
        print("  %-11s %4d  (counters unavailable)" % (c["label"], c["ecc"]))
        continue
    print("  %-11s %4d %9d %8d %11d %10d %9d" %
          (c["label"], c["ecc"], d["irq_count"], d["emitted"], d["gate_dropped"],
           d["ecc_fixed"], d["b7_fixed"]))

print()
if len(byecc) == 2:
    on, off = statistics.mean(byecc[1]), statistics.mean(byecc[0])
    print("  ecc ON  mean false rate %.2f%%  (%s)" %
          (on, ", ".join("%.2f" % v for v in byecc[1])))
    print("  ecc OFF mean false rate %.2f%%  (%s)" %
          (off, ", ".join("%.2f" % v for v in byecc[0])))
    print()
    if off > 0:
        print("  => turning correction off changes the false rate by %.1fx" % (on / off))
    print("  For reference, stock 4.0.0 measured 0.15%% on this radio earlier today.")
