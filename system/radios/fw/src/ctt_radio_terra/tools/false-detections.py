#!/usr/bin/env python3
"""Compare firmwares by FALSE DETECTION rate.

"False detection" needs a definition that does not beg the question, so four
independent classifiers are reported. ch5 is the device under test (firmware
varies by phase); ch1-ch4 stay on stock the whole time, so the same window always
carries its own control and the environment factors out.

  1. UNCORROBORATED -- an ID emitted by ch5 that NO other channel saw in the same
     window. All five radios are co-located and every real tag in this
     environment is heard by all five (071E6661 was 227/222/204/200/203), so a
     real tag gets corroborated and noise does not. This is the primary measure.
  2. SINGLETON -- an ID seen exactly once on that channel in the window. Real
     tags beacon repeatedly; a phantom that happens to pass the gate appears once.
  3. BIT-7 NEIGHBOUR -- an ID that is a single bit-7 flip of an ID at least 10x
     more common in the same window. Bit 7 is outside the Hamming(7,4) code, so
     this is a false detection neither firmware's gate can reject by construction.
  4. GATE ESCAPE -- an ID with any byte failing the Hamming parity equations.
     Both firmwares apply the gate, so this should be 0; a non-zero count would
     mean the gate is not doing what the record says.
"""
import collections, csv, json, os, statistics, subprocess, sys

READER = "/lib/ctt/sensor-station-software/system/scripts/read-detections.py"
PHASES = os.environ.get("PHASES", "/tmp/terra/phases.jsonl")
DUT, REF = "5", "1"

def parity_ok(b):
    """The recovered gate: systematic Hamming(7,4), data 0-3, parity 4-6."""
    bit = lambda i: (b >> i) & 1
    return (bit(1) ^ bit(2) ^ bit(3) ^ bit(4)) == 0 and \
           (bit(0) ^ bit(2) ^ bit(3) ^ bit(5)) == 0 and \
           (bit(0) ^ bit(1) ^ bit(3) ^ bit(6)) == 0

def id_bytes(tag):
    try:
        return [int(tag[i:i+2], 16) for i in (0, 2, 4, 6)]
    except (ValueError, IndexError):
        return None

def legal(tag):
    bs = id_bytes(tag)
    return bs is not None and all(parity_ok(b) for b in bs)

def b7_neighbours(tag):
    bs = id_bytes(tag)
    if bs is None:
        return []
    out = []
    for i in range(4):
        c = list(bs)
        c[i] ^= 0x80
        out.append("".join("%02X" % x for x in c))
    return out

phases = [json.loads(l) for l in open(PHASES) if l.strip()]
lo, hi = phases[0]["start"], phases[-1]["end"]
res = subprocess.run(["sudo", READER, "--since", lo, "--until", hi, "--quiet"],
                     capture_output=True, text=True)
if res.returncode != 0:
    sys.exit("read-detections failed: %s" % res.stderr[-300:])
rows = list(csv.DictReader(res.stdout.splitlines()))

# per phase -> per channel -> Counter(tag)
per = collections.defaultdict(lambda: collections.defaultdict(collections.Counter))
for r in rows:
    for p in phases:
        if p["start"] <= r["Time"] <= p["end"]:
            per[p["label"]][r["RadioId"]][r["TagId"]] += 1
            break

def classify(ph, ch):
    """Return dict of counts for one channel in one phase."""
    mine = per[ph][ch]
    others = collections.Counter()
    for c, cnt in per[ph].items():
        if c != ch:
            others.update(set(cnt))            # presence, not volume
    total = sum(mine.values())
    uncorr_ids = [t for t in mine if others[t] == 0]
    uncorr_rows = sum(mine[t] for t in uncorr_ids)
    singles = [t for t in mine if mine[t] == 1]
    illegal_ids = [t for t in mine if not legal(t)]
    illegal_rows = sum(mine[t] for t in illegal_ids)
    b7_ids, b7_rows = [], 0
    for t in mine:
        best = max((mine[n] for n in b7_neighbours(t) if n in mine), default=0)
        if best >= 10 * mine[t] and mine[t] > 0:
            b7_ids.append(t); b7_rows += mine[t]
    return dict(total=total, ids=len(mine),
                uncorr_ids=len(uncorr_ids), uncorr_rows=uncorr_rows,
                singles=len(singles),
                b7_ids=len(b7_ids), b7_rows=b7_rows,
                illegal_ids=len(illegal_ids), illegal_rows=illegal_rows)

ver = {p["label"]: p["version"] for p in phases}
print("=" * 92)
print("FALSE DETECTIONS -- ch5 (device under test) vs ch1 (stock control, same window)")
print("=" * 92)
hdr = "  %-10s %-13s %7s %6s | %8s %8s %7s | %7s | %6s %6s | %7s"
print(hdr % ("phase", "ch5 firmware", "rows", "IDs", "uncorrID", "uncorrRow", "uncorr%",
             "single", "b7ID", "b7Row", "illegal"))
for ch, tag in ((DUT, "ch5"), (REF, "ch1")):
    print("  --- %s ---" % tag)
    for p in phases:
        L = p["label"]
        d = classify(L, ch)
        pct = 100.0 * d["uncorr_rows"] / d["total"] if d["total"] else 0
        print(hdr % (L, ver[L] if ch == DUT else "4.0.0 (ctrl)",
                     d["total"], d["ids"], d["uncorr_ids"], d["uncorr_rows"],
                     "%.2f%%" % pct, d["singles"], d["b7_ids"], d["b7_rows"],
                     d["illegal_rows"]))

print()
print("=" * 92)
print("NORMALISED: ch5 uncorroborated-row rate divided by ch1's, same window")
print("=" * 92)
print("  %-10s %-13s %10s %10s %10s" % ("phase", "firmware", "ch5 %", "ch1 %", "ratio"))
byfw = collections.defaultdict(list)
for p in phases:
    L = p["label"]
    a, b = classify(L, DUT), classify(L, REF)
    pa = 100.0 * a["uncorr_rows"] / a["total"] if a["total"] else 0
    pb = 100.0 * b["uncorr_rows"] / b["total"] if b["total"] else 0
    ratio = pa / pb if pb else float("nan")
    byfw[ver[L]].append(ratio)
    print("  %-10s %-13s %9.2f%% %9.2f%% %10.2f" % (L, ver[L], pa, pb, ratio))
print()
for fw, vals in sorted(byfw.items()):
    print("  %-13s mean ratio %.2f  (n=%d phases: %s)"
          % (fw, statistics.mean(vals), len(vals), ", ".join("%.2f" % v for v in vals)))
fws = sorted(byfw)
if len(fws) == 2:
    a, b = fws
    ma, mb = statistics.mean(byfw[a]), statistics.mean(byfw[b])
    print()
    print("  => %s emits %.1fx the uncorroborated rate of %s"
          % ((b, mb / ma, a) if mb > ma else (a, ma / mb, b)))
