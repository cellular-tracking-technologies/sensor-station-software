#!/usr/bin/env python3
"""Diff the RFM69 register configuration of two firmware images.

  parity.py <shipped.hex> <ours.hex> [ours_lo ours_hi]

The shipped firmware passes (reg,val) in r22/r20; avr-gcc's ABI for
regWrite(uint8_t,uint8_t) uses r24/r22 -- hence the two conventions. Address
bounds narrow the second image to its radioConfigure() block; without them every
register write in the whole image is folded in, which is noisier but never wrong.
"""
import subprocess, re, sys, os, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
def to_bin(hexf):
    out = os.path.join(tempfile.mkdtemp(), os.path.basename(hexf) + '.bin')
    subprocess.run(['python3', os.path.join(HERE,'ihex2bin.py'), hexf, out],
                   check=True, capture_output=True)
    return out
def rows(binf, regarg, valarg):
    out = subprocess.run(['python3', os.path.join(HERE,'regpairs.py'), binf, str(regarg), str(valarg)],
                         capture_output=True, text=True).stdout
    return [(int(m.group(1),16), int(m.group(2),16), m.group(3), m.group(4))
            for m in re.finditer(r'0x([0-9a-f]{4}) 0x([0-9A-F]{2})\s+(\S+)\s+(0x[0-9A-F]{2}|\?)', out)]
def collapse(rs, lo=None, hi=None):
    d = {}
    for a,r,n,v in rs:
        if lo is not None and not (lo <= a <= hi): continue
        if r not in d or (d[r][1] == '?' and v != '?'): d[r] = (n, v)
    return d
def densest(rs, gap=48):
    """The config block is the tightest run of register writes. Auto-detecting it
    beats hardcoding addresses, which go stale the moment the code size shifts."""
    addrs = sorted(a for a,_,_,_ in rs)
    if not addrs: return (None, None)
    best = cur = [addrs[0], addrs[0]]; bestn = curn = 1
    for a in addrs[1:]:
        if a - cur[1] <= gap: cur[1] = a; curn += 1
        else:
            if curn > bestn: best, bestn = cur[:], curn
            cur = [a, a]; curn = 1
    if curn > bestn: best, bestn = cur[:], curn
    return (best[0], best[1])

ship = collapse(rows(to_bin(sys.argv[1]), 22, 20))
mine_rows = rows(to_bin(sys.argv[2]), 24, 22)
if len(sys.argv) > 4:
    lo, hi = int(sys.argv[3],16), int(sys.argv[4],16)
else:
    lo, hi = densest(mine_rows)
    print(f"# auto-detected config block: 0x{lo:04x}-0x{hi:04x}\n")
mine = collapse(mine_rows, lo, hi)
print(f"{'reg':>5} {'name':<15} {'shipped':>10} {'ours':>10}   verdict")
print('-'*62)
bad = 0
for r in sorted(set(ship)|set(mine)):
    sn,sv = ship.get(r,('-','--')); mn,mv = mine.get(r,('-','--'))
    if   sv==mv and sv!='--': v='MATCH'
    elif sv=='--':            v='ADDED by ours'
    elif mv=='--':            v='not in ours'
    elif '?' in (sv,mv):      v='shipped value computed'
    else:                     v='DIFFERS'; bad += 1
    print(f" 0x{r:02X} {(sn if sn!='-' else mn):<15} {sv:>10} {mv:>10}   {v}")
print(f"\n{bad} literal disagreement(s)")
sys.exit(1 if bad else 0)
