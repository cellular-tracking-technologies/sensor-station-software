# ctt_radio_terra — 434 MHz tag receiver firmware, with terra's three fixes

Firmware for the Feather 32u4 radios that reproduces `ss_v4.0.0.hex`'s FSK tag
PHY exactly and adds the three things `terra-rfm69` has and the shipped image
does not.

## Status

Bench-validated on station V3033D413FBC (CM3+, board v3r3), 2026-08-25/26.
**Not deployed to production.** It neither gains nor loses real detections
against the shipped firmware; its value is the instrumentation.

| | |
|---|---|
| Version | `5.2.0-terra` (ID gate + single-bit correction; supersedes 5.1.0) |
| Flash | 12974 bytes (45%) of 28672 |
| RAM | 616 bytes of 2560 |
| Build target | `adafruit:avr:feather32u4` **only** (see Build) |
| Verified | RSSI within 1.21 dB of stock; real-tag rate ratio median 0.99; FEI r=+0.999 cross-receiver |
| Known gap | closed in 5.1.0 — see **The ID gate** |

### Commands

`version`, `status`, `preset:fsktag`, `rxbw:<raw>`, `rx_size:<n>`,
`modulation:fsk|ook`, `rssi_thresh:<dbm>`, `snr_min:<0-40>`, `sync_size:<1-8>`,
`sync_tol:<0-7>`, `sync_val:<1-4>:<hex>`, `regread:<hex>`.

`version`, `status`, `preset:fsktag`, `rxbw:<raw>`, `rx_size:<n>`,
`modulation:fsk|ook`, `rssi_thresh:<dbm>`, `id_gate:0|1`, `ecc:0|1|2`,
`snr_min:<0-40>`, `sync_size:<1-8>`, `sync_tol:<0-7>`, `sync_val:<1-4>:<hex>`,
`regread:<hex>`.

`id_gate` defaults to **1**. `snr_min` defaults to **0** and fails OPEN before the
first noise sample. There is deliberately no CRC *gate*: a failing CRC labels a
detection (BEEP_0) rather than discarding it, because several real tag families
do not carry that CRC — which is exactly what the shipped firmware does.

### Verifying a flash

```sh
node tools/probe-radio-config.mjs --socket /run/ctt/radios/ch5.sock \
     --mode set --set version --set status --no-restore
```

`radio_ok` must be 1, and `rssi_ok` should track `emitted` + `snr_dropped` +
`gate_dropped` — that is the check that RSSI is being captured at sync match
rather than falling back. `status` also breaks the gate down by reason
(`gate_pass`/`gate_short`/`gate_zero`/`gate_msb`/`gate_ff`/`gate_parity`), and
those counters tick even with `id_gate:0`, so you can measure what the gate
would reject without enforcing it.
Do NOT infer success from the absence of `Radio Init Failed`; that line is printed
at boot, before any socket consumer can attach.

### Pin map (recovered from ss_v4.0.0.hex, then confirmed on hardware)

| Signal | Pin | Basis |
|---|---|---|
| CS | **D8** | Adafruit reference wiring; confirmed by register readback (`RegSyncValue1` returns 0xD3) |
| IRQ (DIO0) | **D7** (PE6/INT6) | directly read: the image's single `attachInterrupt(4, …)` |
| RESET | **D4** | Adafruit reference wiring |

An earlier revision used CS=D17, deduced by elimination from the image's five
`pinMode` calls. That deduction was wrong — pointer-based DDR writes are
invisible to opcode scanning, so "no pinMode call" proves nothing. With CS=D17
every register read returned 0xFF and the firmware emitted 18k phantom
`FFFFFFFF` detections before the `radio_ok` gate existed.

## Why this is a rewrite and not a patch

The shipped radio firmware has no source. It entered this repo as a built image
in 2024 (`9462349`, `4dd1a94`) with no upstream pointer, and it is not in this
repo's history, the GitHub org, or any Bitbucket repo name that could be probed.
So the three fixes could not be applied to it.

Instead, its register configuration was recovered from the binary and is
reproduced here literally. The PHY is not a new design — and notably it is the
*same* PHY terra-rfm69 programs. Both descend from one driver by S. Blackshire.

## The three fixes

### The ID gate (5.1.0)

The shipped firmware's phantom-suppression rule was found by disassembling
`ss_v4.0.0.hex`. It is **not** the PHY, the sync word, the driver, or an SNR
floor — all four were tested and cleared. It is a linear block code on the tag
ID, checked in software at `0x2ea8-0x2f6c`:

| Order | Test | On failure |
|---|---|---|
| 1 | `len >= 5` | drop |
| 2 | `id != 00000000` | drop |
| 3 | at most 2 of the 4 id bytes have bit 7 set | drop |
| 4 | `id != FFFFFFFF` | drop |
| 5 | **every id byte satisfies 3 parity equations** | drop |
| 6 | `crc8(poly 0x07, init 0) == byte[4]` | label BEEP_0 instead of BEEP_1 |

The parity equations, for bit *i* of byte *b* written `b<i>`:

```
p0 = b1 ^ b2 ^ b3 ^ b4
p1 = b0 ^ b2 ^ b3 ^ b5
p2 = b0 ^ b1 ^ b3 ^ b6
```

Bit 7 appears in none of them, so it is free: **32 of 256 octet values are
legal**, and a 4-byte ID has 32^4 = 1,048,576 legal values out of 2^32. Random
noise passes 1 time in 4096. Step 6 is what this firmware already did, which is
why the CRC handling needed no change — our `terraCrc8` is byte-identical to the
shipped image's loop.

Verified against 681,578 detections logged by the shipped firmware on this
station over 2026-08-13/14: **100.00% pass, zero failures**, and the observed
octet alphabet is exactly the 32 legal values — all 32 present, nothing outside:

```
00 07 19 1E 2A 2D 33 34 4B 4C 52 55 61 66 78 7F
80 87 99 9E AA AD B3 B4 CB CC D2 D5 E1 E6 F8 FF
```

Over the same corpus, 5.0.1's own 2026-08-26 window failed 35.5% of frames
(126,932 parity, 45,486 msb, 650 zero). That was the phantom gap.

`tools/gate_test.c` is the host-side cross-check: it carries verbatim copies of
the firmware's `idGate()` and `idCorrectOneOctet()`, proves both by exhaustion
with `-selftest`, and sizes their effect on a corpus of tag IDs read from stdin.

### Single-bit correction (5.2.0)

The per-octet code is **systematic Hamming(7,4)** — data in bits 0-3, parity
`b4 = b1^b2^b3`, `b5 = b0^b2^b3`, `b6 = b0^b1^b3`, bit 7 outside the code. Proved
by exhaustion: the 32 accepted values are exactly the 16 codewords times the free
bit, and each of the 7 non-zero syndromes names a unique bit. So single-bit
errors are **correctable**, and neither shipped image does it — both only detect
and drop.

The loss is measured, not theoretical. Of the 173,068 frames the gate rejected in
the 2026-08-26 window, 31,975 differ from a legal ID by one bit in exactly one
octet, and 27,165 of those correct onto an ID **independently observed >= 20
times in the same window** — 8269x the null expectation over 200 draws of
equally sized decoy ID sets. The signature is conclusive: every heavily detected
tag carries all 28 of its single-bit neighbours at a near-uniform rate
(`33075555`: 28 neighbours, median 215 frames each). That is a per-bit error
rate, not noise.

**Why this is not simply on.** Hamming(7,4) is a *perfect* code: all 256 octet
values sit within one bit of exactly one codeword, so "correctable" is a vacuous
property and pure noise corrects as readily as a real tag. Two constraints keep
it honest:

1. **One octet only.** Over the same window the octets-needing-correction
   distribution was 1 → 32,468 frames, 2 → 20,203, 3 → 45,709, 4 → 72,793. A
   frame needing two or more is noise.
2. **`ecc:1` (the default) also requires the CRC-8 to agree after correction** —
   an independent 8-bit test, so a false accept needs a 1-in-256 coincidence on
   top of the single-octet constraint. It recovers only the CRC-carrying families
   (stock validates 35.5% of its own frames) and is otherwise phantom-free.

`ecc:2` skips the CRC test. On the same window it would have recovered 27,165
real frames while ~5,303 landed on legal-but-unseen IDs — a 5.1:1 ratio: better
yield, measurably worse purity. `ecc:0` disables correction for an A/B.

Correction is attempted **only when parity is the sole complaint** — never on a
degenerate or msb-heavy ID, which are noise signatures rather than corrupted
tags. A corrected frame whose CRC then verifies is emitted as BEEP_1, so the
recovery shows up in the station's `Validated` column.

Because the gate is 1-in-4096 selective, `snr_min` now **defaults to 0**. It had
been set to 3 dB on the theory that it was the missing filter; it is not, and it
costs real detections (quiet-channel tags sit at SNR 3-4 dB). `id_gate:0`
disables the gate for measurement.

## The three fixes

| # | Fix | Shipped firmware | Here |
|---|---|---|---|
| 1 | `RegRssiThresh` (0x29) | **never written** → sits at its `0xFF` reset value | `0xE4` = −114 dBm, and settable via `rssi_thresh:<dbm>` |
| 2 | Signal-quality instrumentation | none | idle noise floor, SNR, FEI (raw + Hz), LNA gain, ISR→FIFO latency |
| 3 | The CRC byte | dropped from the BEEP_0 record | forwarded as `crc` / `crcok`, terra's polynomial |

Fix 1 is the same defect terra carried until 2026-08-12, where its setter was
commented out and referenced a symbol that did not exist. Two descendants of one
driver inherited one bug; only terra's side had been fixed.

## Wire compatibility

Detections are emitted as `PROTOCOL_OUT_BEEP_0` — `00` + 4 id bytes + int8 RSSI,
hex-encoded — which `src/hardware/ctt/atmega32u4_receiver.js:36-50` already
decodes. **Nothing downstream of the socket changes.** The instrumentation rides
on a separate JSON line carrying a leading `"key":"terra_uhf"`. That key is
load-bearing: `radio-receiver.js handleLine()` routes a decoded line by
`firmware` -> 'radio-fw', `key` -> 'response', else -> 'beep'. Nothing subscribes
to 'response', so the station ignores the line while socket readers still see it
verbatim. Without the key it hit the beep path and `data-manager.js:113` dumped
every detection through `util.inspect`.

The command grammar (`key:value`, replying `{"key":…,"res":…[,"err":…]}`) and the
`version` response shape are copied from the shipped firmware, so existing
per-channel config strings in `default-config.js` keep working. `version` reports
`5.1.0-terra` — deliberately distinguishable in the radio-fw poll. See
**Commands** above for the full surface.

## Build and verify

```sh
arduino-cli config add board_manager.additional_urls \
  https://adafruit.github.io/arduino-board-index/package_adafruit_index.json
arduino-cli core install adafruit:avr           # once
arduino-cli compile --fqbn adafruit:avr:feather32u4 --output-dir build .
```

**Use `adafruit:avr:feather32u4` and nothing else.** The Feather 32u4 runs at
**8 MHz** (`feather32u4.build.f_cpu=8000000L`); `arduino:avr:leonardo` is the same
MCU at 16 MHz. A Leonardo build flashes and verifies fine and then cannot
enumerate USB at all — `device descriptor read/64, error -32`, then `unable to
enumerate USB device`. Recovery needs a physical double-tap of RESET, because the
1200-baud touch depends on the USB that is broken. That mistake cost a channel
for 25 minutes. Leonardo is acceptable for a size check only.

Register-config parity against the shipped image:

```sh
tools/parity.py ../../ss_v4.0.0.hex build/ctt_radio_terra.ino.hex
```

Expected rows: `0x29 RssiThresh ADDED by ours` (that is delta 1) and
`0x30 SyncValue2 ADDED by ours` (the shipped image writes both sync bytes through
a helper the extractor cannot pair). Known false positive: `FrfMid DIFFERS`. `regpairs.py` pairs each `ldi r22,<reg>`
with the nearest preceding `ldi r20,<val>`, which mis-pairs when the compiler
reorders. Disproven on hardware — `regread:07/08/09` returns `6C/80/00`, i.e.
exactly 434.000 MHz.

## Tools

| Tool | Purpose |
|---|---|
| `tools/ihex2bin.py` | Intel HEX → flat binary; prints flash occupancy |
| `tools/regpairs.py` | Extracts every RFM69 register→value write from an image |
| `tools/parity.py` | Diffs two images' register configuration; non-zero exit on disagreement |
| `tools/fw-tokens.sh` | String tables of one or two images, plus their diff |
| `tools/probe-radio-config.mjs` | Live config-surface probe over `/run/ctt/radios/ch<N>.sock` |
| `tools/gate_test.c` | Host copy of `idGate()`; verdict histogram for tag IDs on stdin |

`regpairs.py` takes the register/value calling convention as arguments: the
shipped firmware passes them in `r22`/`r20`, avr-gcc's ABI uses `r24`/`r22`.
`parity.py` auto-detects our config block as the densest run of register writes,
so it does not need address bounds that go stale when code size shifts.

## Before flashing

1. **Build for `adafruit:avr:feather32u4`.** See Build — a Leonardo build bricks
   USB and needs physical access to recover.
2. **Flash one channel only, and keep a matched control.** ch1 and ch5 are the
   antenna pair here (noise floors -87 and -94 dBm, ~30 dB of headroom each);
   ch2/ch3/ch4 have no antenna and see 8-9 dB, so they cannot serve as peers.
   Flashing all five at once removes the control, and three separate wrong
   theories about this firmware were each caught only by having one.
3. **Keep the restore path to hand.** `ctt-radio-flash` plus `../../ss_v4.0.0.hex`
   puts a channel back; both are already on the station.
4. **Verify with `status`, not by absence of an error.** `radio_ok` must read 1 and
   `rssi_ok` should track `emitted`. Do not conclude success from not seeing
   `Radio Init Failed`: that line is printed by `setup()` before any consumer can
   attach to the socket, so it is invisible to a later reader — which is exactly
   how a dead SPI bus was mistaken for a working one. `setup()` emits
   `{"error":"Radio Init Failed"}` (the shipped image's exact string) if it does
   not, which is the fastest signal that the pin map is wrong.

## Measurement findings (2026-08-25/26, bench)

- **RSSI and FEI must be sampled at sync match**, not during preamble and not
  after the packet. `RegIrqFlags1.Rssi` is "cleared when leaving Rx" and we never
  leave Rx, so it latches permanently (read `0xD8` on all five channels) — it is
  not a signal-present indicator. `SyncAddressMatch` is "cleared when leaving Rx
  or FIFO is emptied", so it self-clears per frame. Sampling on the latched flag
  put every RSSI at the noise floor: 19.16 dB mean error vs stock, versus 1.21 dB
  once moved to sync match. This is where terra-rfm69 samples too (its DIO3).
- **Do not poll `RegRssiConfig.RssiDone`** — it reads `0x00` forever on this part.
  `RegRssiValue` needs no trigger; it is live. Polling it burned 1 ms/frame and
  pushed `isr_us` from ~150 us to 1240 us.
- **Tag frequency error is far wider than assumed.** Measured offsets span
  -24.7 to +24.0 kHz; 20.9% of frames exceed the +/-12.5 kHz of headroom terra's
  RxBw comment describes. Validated by two receivers measuring simultaneously:
  r=+0.999 across 10 tags, agreeing to a -318 Hz constant (their LO difference),
  with ~100 Hz per-tag precision on clean tags.
- **Widening RxBw does not help.** 0xEB (50 kHz) -> 0xEA (100 kHz) on one channel
  took real detections to ZERO (581 frames/110 CRC-ok -> 121/0) while the control
  channel was unchanged. terra's own comment predicted this: "Do NOT widen this on
  a hunch." Now measured rather than assumed.
- **Sync config is already maximally selective.** `sync_size:3` yields zero frames
  (the byte after `D3 91` is the first ID byte, which varies), `sync_tol:2` yields
  5565 distinct IDs with real detections flat, `sync_size:1` breaks framing. The
  baseline size=2/tol=0 is the strictest usable setting, so the phantom-ID gap
  versus stock is NOT a sync-word issue.
- **An SNR floor is NOT the missing filter — that was wrong.** Sweeping `snr_min`
  0->10 dB does drop distinct IDs 64->20 (stock logs 21) with CRC-valid real
  detections flat at 18-19, which is why it looked like the answer. It is a
  coincidence of magnitude. The real filter is the ID gate above, read straight
  out of the shipped image and confirmed on 681,578 of its own detections.
  `snr_min` now defaults to 0.

## Known deviations from terra-rfm69

- **No CSV metrics path.** terra's `terra_metrics` rotation has no equivalent here;
  the diagnostic JSON line is the only sink.
- **`SyncConfig = 0x88` is derived, not disassembled** — SyncOn plus a 2-byte sync
  length. The shipped image computes register 0x2E at runtime. Corroborated twice:
  our decoded IDs match stock's exactly (a different sync length would shift the
  payload), and `sync_size:3` receives nothing.
