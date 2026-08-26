#!/usr/bin/env python3
"""Structural parse of a sourceless ATmega32u4 Arduino image (ss_v*.hex).

    tools/hexparse.py ../../ss_v4.0.0.hex

Recovers, without any source or symbols:

  * the memory map, by reading the C runtime's own setup code -- .data's flash
    source and RAM destination, .bss extent, the initial stack pointer, the
    global-constructor count, and main()'s address
  * the .data segment, printed at its RAM addresses, which is where an Arduino
    sketch's ordinary (non-PROGMEM) string literals and initialised globals live
  * the string pool with RAM addresses, which for this family is the whole
    command surface: command names, preset names, enum spellings, error text
  * PROGMEM strings still in the code region (USB descriptors, JSON templates)
  * the interrupt vector table, resolved to handler addresses, and Arduino's
    attachInterrupt trampoline table
  * whether any toolchain fingerprint survives (it does not -- see REBUILD)

WHY .data AND NOT PROGMEM MATTERS. A first pass here looked for flash pointers
to the strings and found none, and concluded they were unreachable. They are
.data: avr-gcc emits the literals into flash as an initialiser image, the runtime
copies them to RAM at boot, and every reference in the code is a RAM address. Any
scan for string cross-references has to add (RAM_base - flash_base) first.

REBUILD. A byte-identical rebuild is not achievable from the artifact. Intel HEX
carries no .comment, .note or debug sections, so nothing in the file names the
avr-gcc version, the Arduino core version, the Adafruit board-package version or
the compiler flags -- and any of those moving relocates the whole image. What the
file does pin down is the build TARGET: the USB descriptor strings are "Adafruit"
and "Feather 32u4", which come from the Adafruit board package's boards.txt, so
the image is an adafruit:avr:feather32u4 build at 8 MHz. A functionally
equivalent rebuild is achievable and is what ctt_radio_terra is; use
tools/parity.py to hold its register table against the original.
"""
import sys, re

def ihex2bin(path):
    lo, hi, mem = None, 0, {}
    base = 0
    for line in open(path):
        line = line.strip()
        if not line.startswith(':'): continue
        n = int(line[1:3], 16); addr = int(line[3:7], 16); rt = int(line[7:9], 16)
        data = bytes.fromhex(line[9:9 + n * 2])
        if rt == 0:
            for i, c in enumerate(data):
                a = base + addr + i
                mem[a] = c
                lo = a if lo is None else min(lo, a); hi = max(hi, a)
        elif rt == 4: base = int.from_bytes(data, 'big') << 16
        elif rt == 2: base = int.from_bytes(data, 'big') << 4
    out = bytearray(hi - lo + 1)
    for a, c in mem.items(): out[a - lo] = c
    return lo, bytes(out)

def words(b):
    return [(o, b[o] | (b[o + 1] << 8)) for o in range(0, len(b) - 1, 2)]

def ldi_map(b):
    """offset -> (dest_reg, imm) for every ldi."""
    m = {}
    for o, w in words(b):
        if (w & 0xF000) == 0xE000:
            m[o] = (16 + ((w >> 4) & 0x0F), ((w & 0x0F00) >> 4) | (w & 0x000F))
    return m

def last_ldi(L, before, reg, window=28):
    """Immediate most recently loaded into `reg`, searching backwards from
    `before` within `window` bytes.

    Backwards rather than at a fixed offset because avr-gcc puts an rjmp between
    the register setup and the loop body, so operands sit at no constant
    distance. BOUNDED because an unbounded search happily returns an unrelated
    ldi from thousands of bytes earlier -- which is exactly what produced a
    negative .bss length and SP=0x0000 on the first attempt."""
    best = None
    for o, (d, k) in L.items():
        if before - window <= o < before and d == reg and (best is None or o > best[0]):
            best = (o, k)
    return best[1] if best else None

def reset_target(b):
    """Byte address the RESET vector jumps to -- where the C runtime lives."""
    w1 = b[0] | (b[1] << 8); w2 = b[2] | (b[3] << 8)
    if (w1 & 0xFE0E) != 0x940C: return None
    return ((((w1 >> 4) & 0x1F) << 18) | ((w1 & 1) << 17) | w2) * 2

def find_runtime(b):
    """Read the memory map straight out of __do_copy_data / __do_clear_bss.

    Scanning restricted to the reset handler: `st X+,r1`, `out 0x3e,Rh` and
    `lpm r0,Z+` all occur in ordinary code too, and an image-wide scan picks the
    wrong ones -- on ss_v3 that put .bss at RAM 0x43d9 with a negative length."""
    L = ldi_map(b)
    info = {}
    r = reset_target(b)
    if r is None: return info
    lo, hi = r, min(len(b) - 2, r + 0x80)
    W = {o: v for o, v in words(b) if lo <= o <= hi}

    def ptr(at, rlo, rhi):
        lo, hi = last_ldi(L, at, rlo), last_ldi(L, at, rhi)
        return None if lo is None or hi is None else (hi << 8) | lo

    for o, w in W.items():
        # SP init: out 0x3e,Rh (SPH) then out 0x3d,Rl (SPL)
        if w == 0xBFDE and W.get(o + 2) == 0xBFCD:
            info['sp'] = ptr(o, 28, 29)
        # .data: lpm r0,Z+ ; st X+,r0
        if w == 0x9005 and W.get(o + 2) == 0x920D:
            info['data_flash'] = ptr(o, 30, 31)
            info['data_ram']   = ptr(o, 26, 27)
            nxt = W.get(o + 4, 0)
            if (nxt & 0xF000) == 0x3000:                  # cpi r26,K -> end low byte
                endlo = ((nxt & 0x0F00) >> 4) | (nxt & 0x000F)
                cpc = W.get(o + 6, 0)                     # cpc r27,Rh -> Rh holds end high
                rh = (cpc & 0x0F) | ((cpc & 0x0200) >> 5)
                endhi = last_ldi(L, o, rh)
                if endhi is not None: info['data_end'] = (endhi << 8) | endlo
        # .bss: st X+,r1
        if w == 0x921D:
            info['bss_ram'] = ptr(o, 26, 27)
            nxt = W.get(o + 2, 0)
            if (nxt & 0xF000) == 0x3000:
                endlo = ((nxt & 0x0F00) >> 4) | (nxt & 0x000F)
                cpc = W.get(o + 4, 0)
                rh = (cpc & 0x0F) | ((cpc & 0x0200) >> 5)
                endhi = last_ldi(L, o, rh)
                if endhi is not None: info['bss_end'] = (endhi << 8) | endlo
    return info

def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    base, b = ihex2bin(sys.argv[1])
    print(f"{sys.argv[1]}: base 0x{base:04x}, {len(b)} bytes "
          f"({100*len(b)/28672:.0f}% of the 32u4's 28672 usable flash)\n")

    rt = find_runtime(b)
    print("MEMORY MAP (read out of the C runtime, no symbols needed)")
    if 'data_flash' in rt:
        n = rt.get('data_end', 0) - rt.get('data_ram', 0)
        print(f"  .data   flash 0x{rt['data_flash']:04x} -> RAM 0x{rt['data_ram']:04x}"
              f"  {n} bytes, ends RAM 0x{rt.get('data_end',0):04x}")
    if rt.get('bss_ram') is not None and rt.get('bss_end') is not None:
        print(f"  .bss    RAM 0x{rt['bss_ram']:04x} - 0x{rt['bss_end']-1:04x}"
              f"  {rt['bss_end']-rt['bss_ram']} bytes, zeroed")
    if rt.get('sp') is not None:
        print(f"  stack   SP = 0x{rt['sp']:04x}")
    if reset_target(b) is not None:
        print(f"  runtime RESET -> 0x{reset_target(b):04x}")

    print("\nINTERRUPT VECTORS (non-default)")
    v0 = b[0] | (b[1] << 8)
    if (v0 & 0xFE0E) == 0x940C:
        dflt = None
        vecs = []
        for i in range(0, 0xAC, 4):
            w1 = b[i] | (b[i+1] << 8); w2 = b[i+2] | (b[i+3] << 8)
            if (w1 & 0xFE0E) != 0x940C: break
            tgt = (((w1 >> 4) & 0x1F) << 18 | (w1 & 1) << 17 | w2) * 2
            vecs.append((i // 4, tgt))
        from collections import Counter
        dflt = Counter(t for _, t in vecs).most_common(1)[0][0]
        names = {0:'RESET',1:'INT0',2:'INT1',3:'INT2',4:'INT3',7:'INT6',
                 9:'PCINT0',10:'USB_GEN',11:'USB_COM',23:'TIMER0_OVF'}
        for n, t in vecs:
            if t != dflt:
                print(f"  vec {n:2d} {names.get(n,''):11s} -> 0x{t:04x}")
        print(f"  ({sum(1 for _,t in vecs if t==dflt)} vectors share the default 0x{dflt:04x})")

    if 'data_flash' in rt:
        df, dr = rt['data_flash'], rt['data_ram']
        n = rt.get('data_end', dr) - dr
        d = b[df:df + n]
        print(f"\nSTRING POOL in .data (RAM addresses -- this is what the code references)")
        i = 0
        while i < len(d):
            j = d.find(b'\x00', i)
            if j < 0: break
            if j > i:
                s = d[i:j]
                if all(32 <= c < 127 for c in s) and len(s) >= 2:
                    print(f"  RAM 0x{dr+i:04x}  {s.decode()!r}")
            i = j + 1

    print("\nPROGMEM STRINGS still in the code region")
    for m in re.finditer(rb'[\x20-\x7e]{6,}', b[:rt.get('data_flash', len(b))][:0x400]):
        print(f"  flash 0x{m.start():04x}  {m.group().decode()!r}")

    print("\nREPORTED VERSION (assembled from immediates, not stored as a string)")
    # The reply is print(PROGMEM template) then three integers with "." between.
    # Each integer goes through print(long, base) as: ldi r20,0x0A ; ldi r22,K.
    parts = []
    for o in range(0, len(b) - 6, 2):
        if b[o] == 0x4A and b[o + 1] == 0xE0:                  # ldi r20, 0x0A
            w = b[o + 2] | (b[o + 3] << 8)
            if (w & 0xF000) == 0xE000 and 16 + ((w >> 4) & 0x0F) == 22:
                parts.append((o, ((w & 0x0F00) >> 4) | (w & 0x000F)))
    if len(parts) == 3:
        print(f"  {'.'.join(str(k) for _, k in parts)}"
              f"   from ldi r22 at " + ', '.join(f"0x{o:04x}" for o, _ in parts))
        print("  -> no version STRING exists in the image; ss_v3 vs ss_v4 differ")
        print("     in this one immediate. Do not trust a filename over this.")
    else:
        print(f"  {len(parts)} candidate site(s); pattern did not match cleanly")

    print("\nTOOLCHAIN FINGERPRINT")
    hits = [p for p in (b'GCC', b'GNU', b'avr-', b'.cpp', b'.ino') if p in b]
    print(f"  {'none -- Intel HEX carries no .comment/.note; the build is not reproducible'
             if not hits else hits}")

if __name__ == '__main__':
    main()
