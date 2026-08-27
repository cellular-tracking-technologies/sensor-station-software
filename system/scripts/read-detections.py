#!/usr/bin/env python3
"""Read the station's COMPLETE detection record, across every place it lives.

Why this exists
---------------
A data CSV in /data is rotated hourly (`record.rotation_frequency_minutes`), and
a rotated file does not stay put:

    /data/CTT-<id>-raw-data.csv                  live, being appended
    /data/rotated/<id>-raw-data.<stamp>.csv.gz   rotated, awaiting upload
    /data/uploaded/<svc>/<date>/...csv.gz        MOVED here once accepted
    /data/rotated-failed/...csv.gz               upload gave up

Any analysis that reads only the live file (or only the live file plus
`rotated/`) silently loses every window older than the last rotation. It does
not error -- it reports **zero rows** for those windows, which is
indistinguishable from "the radio heard nothing". That cost a real measurement:
a four-phase firmware comparison came back with `ch5=0` for its first phase
because the hourly rotation had fired mid-run and moved the file to `uploaded/`.

So this tool exists to be the one way detections are read. It always writes a
manifest of what it read to stderr, so a missing source is visible rather than
silent, and it warns when two sources overlap instead of quietly double-counting.

Usage
-----
    read-detections                              # everything, CSV to stdout
    read-detections --since '2026-08-27 13:58'   # inclusive prefix compare
    read-detections --since X --until Y --radio 5
    read-detections --summary                    # per-radio counts, no rows
    read-detections --kind log                   # log/gps instead of raw-data

Times are compared as strings against the CSV's own `Time` column, which the
station writes as UTC 'YYYY-MM-DD HH:MM:SS'. A prefix is therefore a valid
bound: '2026-08-27 14' means from 14:00:00.
"""
import argparse
import collections
import csv
import glob
import gzip
import os
import sys

DATA = os.environ.get("CTT_DATA_DIR", "/data")


def sources(kind):
    """Every location a rotated file can be, in chronological-ish order.

    uploaded/ is listed FIRST because it holds the oldest data: a file lands in
    rotated/, then moves to uploaded/. Ordering only affects output order, not
    completeness -- but it keeps the common case (a time-ordered read) cheap.
    """
    return [
        ("uploaded", "%s/uploaded/**/*%s*.csv.gz" % (DATA, kind), True),
        ("rotated", "%s/rotated/*%s*.csv.gz" % (DATA, kind), False),
        ("rotated-failed", "%s/rotated-failed/*%s*.csv.gz" % (DATA, kind), False),
        ("live", "%s/*%s.csv" % (DATA, kind), False),
    ]


def read_one(path, opener):
    """Parse one file, tolerating the damage a power-off leaves behind.

    A file rotated across an unclean shutdown can carry NUL padding, which the
    csv module rejects outright with "line contains NUL" -- losing the whole
    file over a few trailing bytes. Strip NULs and drop rows with no Time.
    """
    try:
        with opener(path, "rt", errors="replace") as fh:
            text = fh.read().replace("\x00", "")
    except (OSError, EOFError, gzip.BadGzipFile) as exc:
        sys.stderr.write("  WARN unreadable, skipped: %s (%s)\n" % (path, exc))
        return []
    return [r for r in csv.DictReader(text.splitlines()) if r.get("Time")]


def main():
    ap = argparse.ArgumentParser(add_help=True, description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--kind", default="raw-data", help="raw-data (default), log, gps")
    ap.add_argument("--since", default=None, help="inclusive lower bound on Time")
    ap.add_argument("--until", default=None, help="inclusive upper bound on Time")
    ap.add_argument("--radio", default=None, help="only this RadioId")
    ap.add_argument("--tag", default=None, help="only this TagId")
    ap.add_argument("--summary", action="store_true", help="per-radio counts instead of rows")
    ap.add_argument("--quiet", action="store_true", help="suppress the stderr manifest")
    args = ap.parse_args()

    per_file, manifest, missing = [], [], []
    for name, pattern, recursive in sources(args.kind):
        paths = sorted(glob.glob(pattern, recursive=recursive))
        if not paths:
            missing.append(name)
            continue
        for path in paths:
            opener = gzip.open if path.endswith(".gz") else open
            got = read_one(path, opener)
            if got:
                manifest.append((name, path, len(got), got[0]["Time"], got[-1]["Time"]))
                per_file.append((path, got))

    if not args.quiet:
        sys.stderr.write("read-detections: kind=%s from %s\n" % (args.kind, DATA))
        for name, path, n, first, last in manifest:
            sys.stderr.write("  %-14s %-58s %7d rows  %s .. %s\n"
                             % (name, os.path.basename(path), n, first, last))
        if missing:
            sys.stderr.write("  (no files in: %s)\n" % ", ".join(missing))
        if not manifest:
            sys.stderr.write("  !! NO SOURCES READ -- refusing to report an empty result as success\n")

    # Refuse to look like a successful empty read. Silence is the whole bug.
    if not manifest:
        return 2

    # Duplicate guard. Rotation MOVES a file, so sources should be disjoint --
    # but a botched copy would double-count silently, which is the same class of
    # bug as the one this tool exists to prevent.
    #
    # Adjacent files legitimately SHARE A BOUNDARY SECOND (one ends 16:06:21, the
    # next starts 16:06:21) while sharing no rows, so comparing spans alone
    # reports an overlap on every healthy pair -- 25 false alarms on this
    # station. A warning that fires on healthy data gets ignored, and then the
    # real one is missed too. So compare actual ROWS in the shared window, and
    # warn only when the same row is genuinely present in both files.
    def key(r):
        return tuple(r.get(k) for k in ("Time", "RadioId", "TagId", "TagRSSI", "Validated"))

    files = sorted(per_file, key=lambda pr: pr[1][0]["Time"])
    dupe_total = 0
    for i in range(1, len(files)):
        (pa, ra), (pb, rb) = files[i - 1], files[i]
        lo, hi = rb[0]["Time"], ra[-1]["Time"]
        if lo > hi:
            continue                                   # disjoint: nothing to check
        sa = set(key(r) for r in ra if lo <= r["Time"] <= hi)
        if not sa:
            continue
        shared = sa & set(key(r) for r in rb if lo <= r["Time"] <= hi)
        if shared:
            dupe_total += len(shared)
            if not args.quiet:
                sys.stderr.write("  WARN %d duplicate row(s) in %s and %s (%s..%s)"
                                 " -- counted twice\n"
                                 % (len(shared), os.path.basename(pa),
                                    os.path.basename(pb), lo, hi))
    if dupe_total == 0 and not args.quiet:
        sys.stderr.write("  sources verified disjoint (no duplicate rows across files)\n")

    rows = [r for _p, got in per_file for r in got]

    if args.since:
        rows = [r for r in rows if r["Time"] >= args.since]
    if args.until:
        rows = [r for r in rows if r["Time"] <= args.until]
    if args.radio:
        rows = [r for r in rows if r.get("RadioId") == args.radio]
    if args.tag:
        rows = [r for r in rows if r.get("TagId") == args.tag]

    if not args.quiet:
        sys.stderr.write("  -> %d rows after filters%s\n"
                         % (len(rows),
                            (" (%s .. %s)" % (rows[0]["Time"], rows[-1]["Time"])) if rows else ""))

    if args.summary:
        per = collections.Counter(r.get("RadioId", "?") for r in rows)
        tags = collections.defaultdict(set)
        for r in rows:
            tags[r.get("RadioId", "?")].add(r.get("TagId"))
        print("RadioId,rows,distinct_tags")
        for ch in sorted(per, key=lambda x: (len(x), x)):
            print("%s,%d,%d" % (ch, per[ch], len(tags[ch])))
        return 0

    if not rows:
        return 0
    out = csv.DictWriter(sys.stdout, fieldnames=list(rows[0].keys()),
                         lineterminator="\n", extrasaction="ignore")
    out.writeheader()
    out.writerows(rows)
    return 0


if __name__ == "__main__":
    sys.exit(main())
