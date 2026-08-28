#!/usr/bin/env python3
"""Shared loader + window definitions for the three-way firmware comparison.

Firmwares are pinned to different radios, so this is a CROSS-CHANNEL comparison
and each channel carries a fixed sensitivity factor K(ch) -- antenna, cabling,
radio-to-radio variation -- that a raw comparison would report as a firmware
difference. K is estimated from windows where the channels ran IDENTICAL
firmware, and its own reproducibility across independent windows is the error
floor everything else is judged against.
"""
import collections, csv, gzip, glob, statistics

WINDOWS = {
    # all three on stock 4.0.0 -> pure K measurement
    "CAL_yday":  ("2026-08-27 19:32:00", "2026-08-27 20:52:00"),
    "CAL_today": ("2026-08-28 14:31:30", "2026-08-28 14:37:30"),
    # ch1+ch2 still both stock; ch3 already 5.3.1
    "CAL_12":    ("2026-08-28 14:39:30", "2026-08-28 15:07:00"),
    # the comparison: ch1=4.0.0, ch2=5.1.0-terra, ch3=5.3.1-terra
    "CMP":       ("2026-08-28 15:08:30", "2026-08-28 16:38:00"),
}
CHANS = ["1", "2", "3"]

def load():
    rows = []
    pats = ["/data/uploaded/*/*/*raw-data*.csv.gz",
            "/data/rotated/*raw-data*.csv.gz",
            "/data/rotated-failed/*raw-data*.csv.gz",
            "/data/*raw-data.csv"]
    for pat in pats:
        for p in sorted(glob.glob(pat)):
            op = gzip.open if p.endswith(".gz") else open
            try:
                with op(p, "rt", errors="replace") as f:
                    txt = f.read().replace("\x00", "")
            except Exception:
                continue
            rows += [r for r in csv.DictReader(txt.splitlines()) if r.get("Time")]
    return rows

def bucket(rows):
    """win -> ch -> tag -> count, and win -> ch -> tag -> [rssi], plus validated."""
    cnt = collections.defaultdict(lambda: collections.defaultdict(collections.Counter))
    rssi = collections.defaultdict(lambda: collections.defaultdict(lambda: collections.defaultdict(list)))
    val = collections.defaultdict(lambda: collections.defaultdict(lambda: [0, 0]))
    for r in rows:
        t, ch = r["Time"], r["RadioId"]
        for w, (a, b) in WINDOWS.items():
            if a <= t <= b:
                cnt[w][ch][r["TagId"]] += 1
                try:
                    rssi[w][ch][r["TagId"]].append(float(r["TagRSSI"]))
                except ValueError:
                    pass
                v = val[w][ch]
                v[0] += 1
                if r.get("Validated") == "1":
                    v[1] += 1
                break
    return cnt, rssi, val
