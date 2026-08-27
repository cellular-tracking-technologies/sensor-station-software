---
title: "terra-rfm69's three fixes rebuilt as 32u4 radio firmware — the shipped image has no source, its PHY *is* terra's PHY, and the rebuild matches stock on detections but emits 8× the phantom IDs"
type: investigation
status: current
owner: meelyn.pandit
created: 2026-08-26
date: 2026-08-25
last_verified: 2026-08-27
applies_to: [sensor-station-software@feat/terra-rfm69, terra-rfm69, "station:V3033D413FBC"]
tags: [radio, rfm69, sx1231, atmega32u4, feather, firmware, 434mhz, fei, rssi, disassembly]
related:
  - reference/terra-rfm69-station-integration.md
  - reference/sensor-station-boot-sequence.md
  - investigations/2026-08-05-v3033d437786-node-radio-silent-deafness-12db.md
---

# terra-rfm69 → 32u4 radio firmware: what was found, built, and measured

Bench station **V3033D413FBC** (CM3+, board v3r3), 2026-08-25/26. Five Feather
32u4 radios; ch1 and ch5 have antennas, ch2/ch3/ch4 do not.

## Symptom / starting question

"Implement `firmware/terra-rfm69` onto the sensor station." terra-rfm69 is a
Raspberry-Pi-side C program (wiringPi + SPI + pthreads + UDP) that drives an
RFM69 directly and relays 434 MHz tag frames to `terra_uhf.py`. The sensor
station's 434 MHz radios are **not** on the Pi's SPI bus: they are five Adafruit
Feather 32u4 boards on USB CDC-ACM, read by `ctt-radio-driver` over
`/run/ctt/radios/ch<N>.sock`. So there was no drop-in path, and the question
became what terra actually adds that the station's radios lack.

## Investigation

### 1. The shipped radio firmware has no source (PROVEN by exhaustive search)

`system/radios/fw/ss_v3.0.0.hex` (21584 B) and `ss_v4.0.0.hex` (15184 B) entered
the monorepo as **built images only** — `9462349` "include radio firmware in
monorepo" (2024-05-31) and `4dd1a94` "radio firmware v4.0.0" (2024-06-26), both
by Bob Fogg, no upstream pointer. Searched and not found in: the station
filesystem, `sensor-station-software` full history (`--all --diff-filter=AD`),
GitHub-org code search for the firmware's own strings (`SensorStationRadio`,
`"Radio Init Failed"`), the `firmware` repo (node_v3 OTA binaries only),
`arduino_32u4_programmer` (a C# avrdude wrapper), and eight plausible Bitbucket
repo names probed by `git ls-remote`.

Caveat: GitHub code search does not reliably index every private repo, and the
Bitbucket workspace could not be enumerated (no credentials). This is
"not found in what was reachable", not proof of non-existence. **Bob Fogg is the
person who would know.**

### 2. `preset:fsktag` IS terra-rfm69's PHY (PROVEN by disassembly)

The images are AVR, so PHY constants are `ldi` immediates, not byte tables. Pairing
each `ldi r22,<reg>` with its preceding `ldi r20,<val>` recovers the register
writes (`tools/regpairs.py`). The fsktag preset block sits at v4 `0x1368-0x1528`.

| Register | Shipped `ss_v4.0.0` | terra-rfm69 `main.c:75-107` | |
|---|---|---|---|
| `0x02` DataModul | `0x00` FSK / no shaping / packet | same | match |
| `0x03/04` Bitrate | `05 00` → 1280 → 25 kbps | `BITRATE_25_KBPS` | match |
| `0x05/06` Fdev | `01 99` → 409 → 24.96 kHz | 25000 Hz | match |
| `0x19` RxBw | `0xEB` → Mant 20, Exp 3 → 50 kHz | `BW_FSK_50_0_khz` | match |
| `0x1A` AfcBw | `0xEB` | — | station only |
| `0x2C/2D` Preamble | `00 02` → 2 bytes | 2 | match |
| `0x2F/30` Sync | `D3` / `91` (only `ldi` sites in the image) | `{0xd3,0x91}` | match |
| `0x25` DioMapping1 | `0x42` → DIO0 = PayloadReady in RX | same | match |
| `0x37/3D` PacketConfig1/2 | `00 / 00` fixed length, HW CRC off | fixed length, SW CRC | match |
| `0x6F` TestDagc | `0x30` | — | station only |
| `0x11` PaLevel | `0x5F` | RX only | station only |
| `0x3C` FifoThresh | `0x8F` | — | station only |
| `0x07/08/09` Frf | computed at runtime | hardcoded 434.0 | station computes |
| `0x29` RssiThresh | **never written → `0xFF` reset value** | `-114 dBm` (`0xE4`) | **DIFFERS** |

Both codebases descend from one driver by **S. Blackshire**. There was never a
PHY to port — only three deltas.

### 3. The pin map, recovered from the binary

| Signal | Pin | Basis |
|---|---|---|
| IRQ (DIO0) | **D7** (PE6/INT6) | PROVEN: the image contains exactly one `attachInterrupt` call, `r24 = 4` @`0x162e`; the AVR core's 32u4 branch maps case 4 → `EIMSK |= (1<<INT6)` = PE6; `digitalPinToInterrupt()` yields 4 only for pin 7 |
| CS | **D8** | Adafruit reference wiring, confirmed by readback (wrong CS ⇒ every register reads `0xFF`) |
| RESET | **D4** | Adafruit reference wiring; the shipped image contains no reset sequence at all |

**Refuted approach:** CS was first deduced as **D17** by elimination over the
image's five `pinMode` calls (17/15/16 are `SPI.begin()`'s SS/SCK/MOSI, 13+12 are
an LED pair driven together). That reasoning is invalid — pointer-based DDR
writes are invisible to opcode scanning, so "no `pinMode` call" proves nothing.

### 4. Where the `Validated` column comes from (PROVEN)

`src/station-radio-interface/server/data/beep-formatter.js:50-54`:

```js
if (tag_id.length == 10) { tag_id = tag_id.slice(0, -2); validated = 1 }
```

`Validated=1` **iff the record is a `BEEP_1`** (opcode `01`, 5-byte id = 4 id
bytes + CRC byte, which the station strips). `BEEP_0` (opcode `00`, 4-byte id)
⇒ `Validated=0`. The station trusts the *radio* to have checked the CRC and infers
that from the record type. Stock marks ~89% of strong-tag detections validated
this way (8699 validated / 18791 not, over one hour).

### 5. Measurement rules (from the RFM69HCW datasheet + bench)

- **RSSI and FEI must be sampled at sync match.** `RegIrqFlags1.Rssi` (bit 3) is
  "Set in Rx when RssiValue exceeds RssiThreshold. **Cleared when leaving Rx**" —
  and a receiver in continuous RX never leaves Rx, so it latches on the first
  noise burst and stays set forever (`RegIrqFlags1` read `0xD8` on all five
  channels). It is a one-way latch, **not** a signal-present indicator.
  `SyncAddressMatch` (bit 0) is "Cleared when leaving Rx **or FIFO is emptied**",
  and the FIFO is emptied every packet, so it is a true per-frame edge — asserting
  with ~1.6 ms of payload still inbound at 25 kbps / 5 bytes.
- Sampling on the latched flag put every RSSI at the noise floor: **19.16 dB**
  mean error vs stock, versus **1.21 dB** once moved to sync match.
- **`RegRssiValue` needs no trigger** — sampled 12×/channel it tracked each
  channel's own floor and moved 5–8 dB between reads.
- **Never poll `RegRssiConfig.RssiDone`** — it reads `0x00` forever on this part.
  Waiting on it burned 1 ms/frame and pushed `isr_us` from ~150 µs past 1240 µs.
- FEI *does* need `FeiStart` and 4 bit periods, so it takes a short fixed delay.
- Datasheet §3.4.9 and §3.4.14 both require sampling "during the reception of
  preamble"; sync match is the practical equivalent and is where terra-rfm69
  samples (its DIO3 is SyncAddress).

## Findings that stand on their own

### FEI is real, and tag frequency error is far wider than assumed

Validated by two receivers measuring the same tags **simultaneously**: per-tag FEI
means correlate at **r = +0.999** (n=10 tags) and agree to a **−318 ± 700 Hz**
constant — their LO difference. Per-tag precision reaches ~100 Hz on clean tags
(`33075555`: 92 Hz stdev). Noise cannot produce that.

Measured offsets span **−24.7 to +24.0 kHz**, and **20.9% of frames (287/1372)
exceed the ±12.5 kHz of headroom** terra's RxBw comment describes as "unknown…
assumed WIDE — a known, unquantified risk of silently missing detections". CRC-
**valid** frames were observed at −20.5 kHz and +26 kHz. The risk is now quantified
and it is worse than the comment assumed.

### Widening RxBw does not recover them (NEGATIVE result)

`0xEB` (50 kHz) → `0xEA` (100 kHz) on one channel, with a second channel unchanged
as control:

| | frames | CRC-ok | noise |
|---|---|---|---|
| ch5 @ 50 kHz | 581 | 110 (18.9%) | −92.5 dBm |
| ch5 @ 100 kHz | **121** | **0** | −90.5 dBm |
| ch1 control before / after | 791 / 787 | 160 / 130 | −87.0 / −88.0 |

Every real tag went to zero (`33075555` 58→0, `61556678` 61→0). terra's own comment
predicted it: "Do NOT widen this on a hunch… widening blind trades real sensitivity
for a headroom problem nobody has measured."

### The sync word is already maximally selective (NEGATIVE result)

| condition | frames | CRC-ok | distinct IDs | `33075555` |
|---|---|---|---|---|
| size=2 tol=0 (baseline) | 194 | 26 | 52 | 25 |
| size=3 tol=0 val3=`00` | **0** | 0 | 0 | 0 |
| size=2 tol=2 | 5695 | 41 | **5565** | 23 |
| size=1 tol=0 | 9389 | 38 | 9275 | **0** |

`size=3` receives nothing because the byte after `D3 91` is the tag ID's first
byte, which varies per tag — which independently re-confirms stock uses 2 sync
bytes (a longer sync would shift the payload and change every decoded ID, and our
IDs match stock's exactly). So the phantom-ID gap versus stock is **not** a
sync-word issue.

### An SNR floor is the remaining discriminator

| `snr_min` | frames | emitted | distinct IDs | CRC-valid real tags |
|---|---|---|---|---|
| 0 | 178 | 178 | 64 | 18 |
| 3 | 166 | 145 | 30 | 19 |
| 5 | 185 | 137 | 25 | 18 |
| 10 | 190 | 132 | **20** | 18 |

Real detections stay flat while phantoms collapse toward stock's ~21. Not made
aggressive by default: on a quiet channel real tags sit at **SNR 3–4 dB**, so a
high floor discards them.

## Three-way comparison (the headline result)

ch5 cycled through all three firmwares while **ch1 stayed on terra.8 untouched as a
constant reference**, so each condition is a ch5/ch1 ratio per tag — cancelling
tag-activity drift. ~7 minutes per condition, 2026-08-26 15:01–15:23 UTC.

| condition | ch5 det | ch5 distinct IDs | ch5 validated % | median ch5/ch1 ratio |
|---|---|---|---|---|
| **v5** `5.0.0-terra` | 844 | 181 | 16.0 | **1.00** |
| **stock** `4.0.0` | 692 | **22** | **32.1** | **1.00** |
| **terra.8** | 878 | 282 | 15.8 | **1.00** |

Per-tag counts across the three (v5 / stock / terra.8): `33075555` 81/75/76,
`071E6661` 129/120/120, `55613461` 42/40/39, `66557866` 44/41/42.

**Conclusions:**

1. **All three firmwares detect the same tags at the same rate.** Median
   normalised ratio 1.00 in every condition. The terra work does not change how
   many tags the radio hears.
2. **Stock is still far cleaner: 22 distinct IDs vs v5's 181** — v5 emits ~8×
   stock's phantom count even with `snr_min:3` (which does help: 282 → 181 vs
   terra.8). Validated % follows directly (32.1 vs ~16), because phantoms dilute
   the denominator; per-tag validation itself matches stock exactly.
3. **v5 reads real tags 2–4 dB stronger** than stock/terra.8 (`071E6661` −73.3 vs
   −77.6/−78.0) — the sync-match capture landing earlier in the frame. Which value
   is *correct* is UNKNOWN: there was no reference transmitter, only a consistent
   few-dB difference.

## Root cause / verdict

There was no bug to fix and no PHY to port. The shipped firmware and terra-rfm69
already share a PHY. terra's genuine additions are **`RegRssiThresh`**, the
**signal-quality instrumentation**, and the **forwarded CRC byte** — all of which
are now implemented, but **none of which increases detections**.

The rebuild is therefore a **measurement instrument, not a better receiver**, and
it is not production-ready: its phantom-ID rate is ~8× stock's, and the rule stock
uses to suppress those frames is still unknown (it is not the PHY, not the sync
word, and not a 3 dB SNR floor).

## Resolution

`sensor-station-software` branch **`feat/terra-rfm69`** (unpushed at time of
writing):

- `8c08e47` — first working firmware + tooling
- `3422a72` — clean rewrite as `5.0.0-terra` (614 lines, 11638 B / 40% flash)

Code at `system/radios/fw/src/ctt_radio_terra/`, with `tools/` carrying
`ihex2bin.py`, `regpairs.py` (register table from any image), `parity.py` (diffs
two images' register config, non-zero exit on disagreement), `fw-tokens.sh`, and
`probe-radio-config.mjs` (live config-surface probe over `ch<N>.sock`).

**Build target is `adafruit:avr:feather32u4` only.** The Feather runs at 8 MHz;
`arduino:avr:leonardo` is the same MCU at 16 MHz, flashes and verifies cleanly,
then cannot enumerate USB (`device descriptor read/64, error -32` → `unable to
enumerate USB device`). Recovery needs a **physical double-tap of RESET**, because
the 1200-baud touch depends on the USB that is broken. This cost a channel for
~25 minutes.

Fleet at close: ch5 on `5.0.0-terra`, ch1–ch4 on terra.8, all `radio_ok`, all
collecting. Stock images remain at `system/radios/fw/ss_v4.0.0.hex` and on the
station at `/tmp/ss_v4.0.0.hex` for one-command restore via `ctt-radio-flash`.

## Prevention / follow-ups

**Verification discipline — three failures, all the same shape:**

1. *Concluded success from the absence of an error.* `{"error":"Radio Init
   Failed"}` is printed by `setup()` before any socket consumer can attach, so it
   was never observable. A dead SPI bus (CS=D17, every read `0xFF`) looked healthy
   for two revisions and emitted **18,414 phantom `FFFFFFFF` detections**. Fix:
   the `status` command, a `radio_ok` gate, an explicit `0xFF`-is-a-dead-bus check,
   and a 10 s re-announce.
2. *Built a counter that could only report success.* `fei_ok: 258/258` was
   presented as "100% hit rate on the preamble window"; it actually counted
   "the register answered when asked", at an arbitrary moment, off a permanently
   latched flag. Any success metric must be able to say no.
3. *Compared unlike windows.* An 83.6-minute stock window against a 4.5-minute
   terra window produced a spurious 4.46× rate gain and a spurious +18.6 dB RSSI
   shift, both artifacts. Matched-length adjacent windows, and better a
   simultaneous reference channel, are the only trustworthy forms.

**Keep a matched control.** ch1 and ch5 are the antenna pair (floors −87/−94 dBm,
~30 dB headroom each); ch2/ch3/ch4 have no antenna and see 8–9 dB, so they cannot
serve as peers. Flashing all five at once removes the control — and three separate
wrong theories were each caught only by having one. **Do not "equalise" by removing
antennas**: it levels downward, and the effects under study only appear well above
the noise floor.

**Open items:**

- Find the 32u4 source, or its suppression rule. Ask Bob Fogg; failing that,
  characterise phantoms against SNR + FEI + CRC jointly rather than any one alone.
- Decide whether v5's 2–4 dB stronger RSSI or stock's reading is correct. Needs a
  reference transmitter.
- Act on the frequency-error finding. Widening RxBw is ruled out; AFC
  (`AfcAutoOn`) is untested and would deviate from the shipped PHY.
- `tools/parity.py` reports a false `FrfMid DIFFERS` (nearest-preceding-`ldi`
  mis-pairing under compiler reordering). Disproven on hardware by `regread`
  returning `6C/80/00`. Worth fixing so it stops crying wolf.
- Branch is committed but **unpushed**; the station's checkout cannot push
  (HTTPS remote, no credentials, no private key — only `authorized_keys`). Push
  from a workstation; the station can then pull without credentials since the repo
  is public.


## Update 2026-08-26 — the diagnostic line was never off-pipeline; `5.0.1` fixes it

**Corrects the "Resolution" and `OUTPUT` claims above.** This record (and the
firmware's own header comment) stated that the instrumentation "rides on a second
JSON line that `parse_subghz` returns null for, so `RadioReceiver` re-emits it as
'raw': visible in the journal, invisible to the beep pipeline." **That is false for
the station's JS pipeline.** The claim came from reading the *BLE server's* Python
parser (`sensor-station-ble-server` `tests/test_atmega.py` → `ctt_station/atmega.py`),
not `sensor-station-software`'s JS decoder — a different codebase with different
behaviour.

### What actually happens (traced, then measured)

```
diagnostic line starts with "{"  -> src/hardware/ctt/atmega32u4_receiver.js parse()
                                    JSON.parses it and RETURNS the object
no `firmware`, no `key`          -> radio-receiver.js handleLine() emits 'beep'
beep.meta exists                 -> data-manager.js:113  if (beep.meta)
meta.data_type "terra_uhf"       -> unknown -> default: console.log(beep)
                                    + console.error("i don't know what to do...")
```

`handleLine()` routes a decoded line by inspecting it **in order**: `firmware` →
`'radio-fw'`, `key` → `'response'`, otherwise → `'beep'`. Our diagnostic had
neither of the first two, so it went to the beep path and reached the data
dispatcher, which dumped the whole object through `util.inspect`.

Measured on ch1–ch5 (terra.8/5.0.0), 20 minutes:

| | |
|---|---|
| `"i don't know what to do with this record"` | **8,547** |
| total `station-radio-interface` journal lines | **161,435** (~19 per detection, ~8,000/min) |

On a bench station that is noise; in the field it is journal churn and eMMC wear.

### Fix — `5.0.1-terra`

The diagnostic line now carries a leading `"key":"terra_uhf"`, which diverts it to
`'response'`. **Nothing subscribes to `'response'` or `'raw'`** (verified by
grep across `src/`), so the station ignores it silently while socket readers
(`tools/probe-radio-config.mjs`) still receive it verbatim — which is where the
diagnostics belong.

```
journal:  16,152 lines / 3 min  ->  2
node CPU:        6.5%           ->  6.5%   (unchanged; it was never CPU-bound)
```

### It does NOT improve detection rates

Tested directly, since removing ~19 synchronous `util.inspect` lines per detection
from the beep-handling process was a plausible throughput win. Phase A
(16:52–16:59, ch1–4 still spamming) vs Phase B (17:01–17:08, all five on `5.0.1`),
per tag on **ch1** — the channel whose spam actually stopped:

| TagId | A /min | B /min | ratio |
|---|---|---|---|
| `33075555` | 11.49 | 11.57 | 1.01 |
| `071E6661` | 18.58 | 18.51 | 1.00 |
| `78614C4B` | 10.64 | 10.55 | 0.99 |
| `66557866` | 6.38 | 6.36 | 1.00 |
| `19331955` | 3.83 | 3.90 | 1.02 |
| `61074C4B` | 3.83 | 3.90 | 1.02 |
| **median** | | | **1.00** |

RSSI within a few tenths of a dB throughout. **`5.0.1` is a data-hygiene and
eMMC-wear fix, not a sensitivity fix** — consistent with every other delta in this
firmware.

**Trap in the aggregate numbers:** whole-station rate appears to fall 396.60 →
323.71/min, driven entirely by ch2/ch3/ch4 (35→22, 34→16, 36→19). Those are the
**antenna-less** channels whose counts are almost entirely phantoms, and phantom
rates fluctuate freely between windows. Both antenna channels held (ch1 0.90,
ch5 0.94) with the per-tag median at 1.00. Do not read the station total as a
regression.

### `native/src/ctt-radio-driver` examined — it cannot be the phantom filter

Checked because the phantom-ID gap versus stock is still unexplained.
`native/README.md` states the design plainly: *"All decision logic stays in
Node."* The driver splits the serial stream on `\n`, wraps each line in an NDJSON
envelope, and unwraps `{op:...}` commands back to the tty — **no content
filtering, no dedup**. Both firmwares traverse it identically, so it cannot
account for a per-firmware difference.

One thing it did settle: line framing is **"LOSSY under backpressure"** with a
1 MiB per-client cap and a `dropped` counter that warns on first drop and every
1000th. Our firmware emits two lines per detection, so this was a real risk —
**measured zero `backpressure` warnings on all five channels over 6 hours.**

The phantom-suppression rule therefore lives in the shipped 32u4 firmware itself,
which remains without source. Follow-ups above are unchanged.

### Fleet state at this update

All five radios on **`5.0.1-terra`**, all confirmed reporting it, all collecting.
The `5.0.1` change is **not yet committed** (`feat/terra-rfm69` holds `8c08e47` +
`3422a72`, both unpushed).


## Update 2026-08-26 (later) — the phantom rule is found, it was never ours to discover, and it is a Hamming code

**Resolves the largest open item above** ("Find the 32u4 source, or its
suppression rule") and **corrects two claims**: the section "An SNR floor is the
remaining discriminator" is wrong, and the framing of this rule as an unknown was
wrong.

### The rule, recovered from `ss_v4.0.0.hex`

Found by following *control flow* rather than scanning for constants: vector 7
(INT6) → the Arduino trampoline at `0x2026` → `icall intFunc[4]` at RAM `0x0114`,
set by the image's single `attachInterrupt` at `0x162e` with handler word-address
`0x0AD0`. That handler only sets a flag; the main loop reads the FIFO into RAM
`0x03B7` and filters at **`0x2ea8–0x2f6c`**:

| Order | Test | On failure |
|---|---|---|
| 1 | `len >= 5` | drop |
| 2 | `id != 00000000` | drop |
| 3 | at most 2 of the 4 id bytes have bit 7 set | drop |
| 4 | `id != FFFFFFFF` | drop |
| 5 | **every id byte satisfies 3 parity equations** | drop |
| 6 | `crc8(poly 0x07, init 0) == byte[4]` | emit `BEEP_0` instead of `BEEP_1` |

Step 5 is the phantom filter. Read off the `asr`/`ror`/`eor` chain at
`0x2f02–0x2f62`, for bit *i* of byte *b* written `b<i>`:

```
p0 = b1 ^ b2 ^ b3 ^ b4
p1 = b0 ^ b2 ^ b3 ^ b5
p2 = b0 ^ b1 ^ b3 ^ b6
```

All three must be zero. Proved by exhaustion (`tools/gate_test.c -selftest`) to be
**systematic Hamming(7,4)** — data in bits 0–3, parity in 4–6, **bit 7 outside the
code**. So 32 of 256 octet values are legal, a 4-byte id has 32⁴ = 1,048,576 legal
values out of 2³², and **random noise passes 1 time in 4096**. The alphabet:

```
00 07 19 1E 2A 2D 33 34 4B 4C 52 55 61 66 78 7F
80 87 99 9E AA AD B3 B4 CB CC D2 D5 E1 E6 F8 FF
```

Step 6 is what this firmware already did, so the CRC path needed no change — our
`terraCrc8` is byte-identical to the image's loop.

### Verification

- **681,578 detections** logged by the shipped firmware on this station over
  2026-08-13/14: **100.00% pass, zero failures**, and the observed octet alphabet
  is exactly the 32 legal values — all 32 present, nothing outside.
- **`ss_v3.0.0.hex` carries the identical rule** at `0x1a52–0x1abc` (same three
  equations, different register allocation), so it predates v4.
- **130 manufacturer-assigned tag IDs** from two unrelated deployments
  (`meadows_deployments_2023.csv` 124, `JNTagDeployments.csv` 6) all pass. These
  are printed on tags, never received over the air.
- Independent corpora: `detection_df.csv` 13,996 rows all pass; `pt_192D0707.csv`
  69 all pass; `calibration_2023_8_3_all.csv` 716 all pass. The Xerces CSVs are
  **BLU/BLE** tags with a different ID scheme and are out of scope.

### ATTRIBUTION — this was not a discovery

**terra-rfm69's own README documents the rule**, and reading its `main.c` and
`rfm69.c` without its README is how that was missed:

> "The per-byte Hamming parity check admits 32 of 256 values per byte, so a random
> four-byte frame passes with p = (1/8)⁴ = 1/4096. **It discards about 99.8% of
> what this program emits.**"

with fleet volumes (~60,000 detections/day/station emitted, ~118/day surviving)
and a deliberate decision to apply it one process downstream in `terra_uhf.py` so
the receiver stays a receiver. terra's SNR gate (`/etc/terra/uhf_snr_min`) is
likewise documented as *additive* to the parity gate and fail-closed, with the
note that opening it "restores the ~60,000/day firehose" — i.e. the same knob the
`snr_min` sweep above rediscovered, and terra's guidance is the opposite of what
that section concluded.

**So "An SNR floor is the remaining discriminator" is wrong.** Its numbers stand
(0→10 dB took distinct IDs 64→20 with real detections flat) but the inference does
not: it is a coincidence of magnitude, not the mechanism. `snr_min` now defaults to
**0**, because it costs real detections (quiet-channel tags sit at SNR 3–4 dB) for
a job the gate does properly.

The narrower contribution that does stand: the **exact equations and alphabet**,
recovered from the image rather than the daemon, which proves the CTT 32u4 lineage
enforces the identical rule *in firmware* where Terra does it in Python; and the
681,578-detection verification.

### Bit 7 is a structural blind spot in BOTH implementations

Bit 7 appears in no parity equation, so **flipping it turns a legal id into a
different legal id** that neither gate can reject. In the shipped firmware's own
2026-08-13/14 output, **137 of the 547 weak distinct ids (25%) are a single bit-7
flip of an id seen ≥10× more often**, accounting for **5,503 frames**:

| parent | frames | bit-7 neighbours |
|---|---|---|
| `4B551934` | 200,876 | `CB551934` (197), `4BD51934` (161) |
| `4C073378` | 12,491 | `4C0733F8` (243), `CC073378` (243), `4C07B378` (178) |
| `55076161` | 8,055 | `D5076161` (243), `5507E161` (222), `550761E1` (199) |

The CRC-8 covers all 8 bits and can *locate* the flip: for a genuine bit-7 error
the transmitted CRC was computed over the true id, so flipping it back is the one
candidate that makes the CRC agree. CRC-8 is linear, so a bit-7 flip at byte *i*
XORs the CRC by a constant, and those constants are **`31 0B B6 89` — all
distinct**, so at most one candidate can ever match (verified over 200,000 ids).

### Hamming(7,4) is a PERFECT code — "correctable" is a vacuous property

All 256 octet values lie within distance 1 of exactly one codeword, so pure noise
corrects as readily as a real tag. Correction is only meaningful under
constraints. Two that hold:

1. **One octet only.** Octets-needing-correction among gate-rejected frames in one
   window: 1 → 32,468 frames, 2 → 20,203, 3 → 45,709, 4 → 72,793.
2. **Require the CRC to agree after correction** — an independent 8-bit test.

So constrained, **27,165 of that window's 173,068 rejected frames correct onto an
id independently observed ≥20 times in the same window — 8269× the null
expectation** over 200 draws of equally sized decoy id sets. Every heavily
detected tag carries **all 28** of its single-bit neighbours at a near-uniform
rate (`33075555`: 28 neighbours, median 215 frames each). That is a per-bit error
rate, not noise.

### The bit errors come from tag frequency error — closing the loop on §"FEI is real"

Measured on ch5 by population:

| population | n | median \|FEI\| | median SNR | crcok |
|---|---|---|---|---|
| gate-passing | 161 | 3.7 kHz | 13.0 dB | 51 |
| parity-rejected | 39 | 10.3 kHz | 7.0 dB | 0 |
| msb-rejected | 13 | 5.7 kHz | 1.5 dB | 0 |
| Hamming-corrected | 3 | **26.0 kHz** | 8.0 dB | **3/3** |

Rejected frames sit at ~2.8× the frequency error and half the SNR of clean ones,
and the corrected frames have the largest offset of all yet still verify against
the CRC. This is the answer to the open item "Act on the frequency-error finding":
**not** widening RxBw (measured: takes real detections to zero) but correcting the
resulting bit errors. n=3 on the corrected row is small; the counters below size it
properly.

## Update 2026-08-26 (later) — full structural parse of the sourceless images

`tools/hexparse.py` turns the ad-hoc disassembly into something repeatable and
runs clean on both images. It recovers, with no source and no symbols: the memory
map, `.data` at RAM addresses, the string pool, PROGMEM strings, the vector table,
and the reported version.

### Memory map, read out of the C runtime itself (`0x264–0x2b4`)

```
.data   flash 0x39f4 -> RAM 0x0100   348 bytes, ends RAM 0x025c
.bss    RAM 0x025c - 0x03fe          419 bytes, zeroed
stack   SP = 0x0aff
ctors   exactly one global C++ constructor
main()  0x282e
```

**The strings are `.data`, not PROGMEM.** A first pass looked for flash pointers
to them, found none, and concluded they were unreachable. avr-gcc emits ordinary
string literals into flash as a `.data` initialiser, the runtime copies them to
RAM at boot, and every reference in the code is a **RAM** address. Any
cross-reference scan must add `(RAM_base - flash_base)` first.

### The complete command surface (v4)

Commands `modulation`, `tx_dbm`, `rx_type`, `rx_size`, `rxbw`, `tx_frequency`,
`preset`, `version`. Presets `node2`, `node3`, `fsktag`, `node3_tx`, `qaqc`,
`es200`. Modulations `fsk`, `ook`, `gmsk`. Errors `bad arg`, `val < lim`,
`val > lim`, `Parse Node Fail`. Interleaved numeric literals are preset
parameters expressed as strings (`433.25`, `50.0`, `38`, `434.0`, `17`, `435.0`,
`34`) — `38` and `34` are the node2-health and es200 PayloadLengths, matching
`atmega32u4_receiver.js`'s 40- and 36-byte record lengths.

### v3 is *bigger* than v4, and why

21,584 B vs 15,184 B, `.data` 1,476 B vs 348 B. **v3 formatted JSON on the MCU** —
its string pool holds the full `printf` templates
(`{"protocol":"%u.%u.%u","meta":{"data_type":"%s","rssi":%d},"data":{"id":"%s"}}`,
plus `node_beep`, `node_alive`, `node_health`, telemetry). v4 deleted all of it and
moved to the compact hex protocol, which is what `atmega32u4_receiver.js` means by
"optimized hex string format". v3 also had `rx_async` and `mode` commands and an
`ooktag` preset; v4 added `rx_size` and `es200`.

### There is no version string

`"4.0.0"` appears nowhere in the image. The reply prints the PROGMEM template then
three integers with `.` between, each via `print(long, base)` as
`ldi r20,0x0A ; ldi r22,K`:

```
ss_v4.0.0.hex   K = 4, 0, 0   at 0x17f0, 0x1806, 0x181a
ss_v3.0.0.hex   K = 3, 0, 0   at 0x15ea, 0x1600, 0x1614
```

Exactly three sites in each. **The two images differ in that one immediate**, so
the parse — not the filename — identifies an image.
`system/radios/fw/default` is **byte-identical** to `ss_v4.0.0.hex`
(md5 `bea48771e8607568da133a6e3fd73931`), so only two distinct images exist.

### Rebuild verdict

**Byte-identical: not achievable from the artifact.** Intel HEX carries no
`.comment` or `.note`, so nothing names the avr-gcc version, Arduino core version,
board-package version or flags, and any of those moving relocates the image.
Checked for every fingerprint (`GCC`, `GNU`, `avr-`, `.cpp`, a date, a version
triple): zero hits.

What the file *does* pin down is the **target**: the USB descriptor strings are
`Adafruit` and `Feather 32u4` (flash `0x01b4`/`0x01bd`), straight from the Adafruit
board package's `boards.txt`. Independent confirmation of the 8 MHz
`adafruit:avr:feather32u4` target that a Leonardo build had to teach by bricking a
channel.

### Two corrections to the disassembly sections above

- **`SyncConfig = 0x88` is disassembled, not derived.** The section above marks it
  "computed at runtime"; the code is at `0x14f4`:
  `regWrite(0x2E, (regRead(0x2E) & 0xC7) | 0x88)` — SyncOn plus SyncSize=2,
  preserving SyncTol. No longer an inference.
- **The `FrfMid DIFFERS` false positive has a structural cause**, which resolves
  that open item. The image uses **C++ virtual dispatch** through an object pointer
  at `.bss 0x03AD`, with vtable slots for `regRead` (Z+24), `regWrite` (Z+28),
  `regWriteBurst` (Z+30) and `readBuffer` (Z+26). The sync words go out as a
  **burst** write of `{D3, 91}` at `0x14e8`. A pairwise `ldi` scanner structurally
  cannot see burst writes or masked read-modify-writes, which is why `regpairs.py`
  reports "shipped value computed" for SyncValue/PayloadLength/Frf and mis-pairs
  FrfMid. Fixing it means teaching the tool the vtable, not tweaking the pairing.

## Update 2026-08-26 (later) — same-radio firmware comparison, and the marginal-tag confound

**Supersedes the "Three-way comparison" methodology above.** That comparison used
ch5/ch1 ratios with ch1 held constant, which cancels tag-activity drift but not the
fixed ch5-vs-ch1 geometry. A later variant divided by a separately measured per-tag
calibration factor `K(t)`, and `K(t)`'s own error (0.019–1.44 across tags)
dominated everything.

### Better estimator: cancel `K(t)` instead of measuring it

ch5 is the device under test and is reflashed between phases; **ch1 holds stock
`4.0.0` for the whole experiment**. Within phase *P* for tag *t*, with
`R_P(t) = n_ch5,P(t) / n_ch1,P(t)` and `R_P(t) = K(t) · f_P`:

```
R_P(t) / R_Q(t) = f_P / f_Q          K(t) cancels exactly
D_P(t) - D_Q(t) = delta_P - delta_Q   (RSSI, offset additive)
```

No calibration table and none of its noise. Two phases ran the **same** firmware
(5.3.0, windows B1/B2), so the noise floor is measured rather than assumed:

```
same-firmware repeat:   rate 1.003x     RSSI +0.5 dB
```

That is ~8× tighter than the calibrated cross-channel method it replaces.

### Per-tag stability screen — the finding that matters

| tag | A 5.2.0 | B1 5.3.0 | B2 5.3.0 | C stock | spread | |
|---|---|---|---|---|---|---|
| `071E6661` | 1.002 | 1.000 | 0.997 | 1.000 | 1.00× | stable |
| `33075555` | 1.000 | 1.000 | 1.000 | 1.000 | 1.00× | stable |
| `55613461` | 0.995 | 0.988 | 0.967 | 1.000 | 1.03× | stable |
| `66557866` | 0.962 | 0.994 | 0.992 | 0.900 | 1.10× | stable |
| `2D341934` | 1.045 | 1.082 | 1.168 | 1.867 | 1.79× | **excluded** |
| `55074B4B` | 1.757 | 1.016 | 1.023 | 1.000 | 1.76× | **excluded** |
| `61556678` | 1.876 | 1.016 | 1.009 | 1.000 | 1.88× | **excluded** |

**Three of seven tags move by 1.8× across phase boundaries — including boundaries
where the firmware did not change.** Any comparison that averages over all tags is
reporting bench drift.

### Result on the stable tags

| phase | median ch5/ch1 | vs stock | median ch5−ch1 RSSI |
|---|---|---|---|
| A `5.2.0` (33 min) | 0.998 | 0.998 | −9.5 dB |
| B1 `5.3.0` (33 min) | 0.997 | 0.997 | −7.5 dB |
| B2 `5.3.0` (20 min, repeat) | 0.995 | 0.995 | −8.0 dB |
| C `stock 4.0.0` (partial at time of writing) | 1.000 | 1.000 | −8.2 dB |

**Detection rate: identical.** 0.995–1.000 against a 1.003 noise floor. Stock,
5.2.0 and 5.3.0 are the same receiver on the same radio and antenna. **RSSI agrees
to ~1–2 dB**, which is the resolution limit here (the CSV quantises to whole dBm
and the same-firmware repeat already differs 0.5 dB). Still no reference
transmitter, so which value is *correct* remains unknown — that open item stands.

### The confound: `4B551934` collapsed 12× and it is not firmware

Chased because it looked like a 5.3.0 regression. ch5 counts went
**502 → 40 → 31 → 1** across A/B1/B2/C while ch1 held. It is not firmware:

- ch1 hears it at a steady **−78 dBm** in all four windows → the tag did not move.
- **Stock is the worst of the three** (0.014) → not a terra defect.
- ch5 hears it at **−86 dBm** against a measured **−94.5 dBm** floor —
  **SNR 9 dB**, where every *stable* tag sits at 16–32 dB.
- The bit-7 family did not absorb it (whole family 536 → 43 → 40) → not
  relabelling.

It is a **marginal signal**, and marginal signals are the only ones whose count
responds to a 1–2 dB environmental shift. Hence the structural limitation of this
bench: **the marginal tags are simultaneously the only ones that could reveal a
firmware sensitivity difference and the only ones that drift on their own.**

### Recovery counters — the only place the builds actually differ

| | stock `4.0.0` | `5.2.0` (33 min) | `5.3.0` (33 min) |
|---|---|---|---|
| illegal ids emitted | 0 | 0 | 0 |
| Hamming recovery | none | 58 / 4268 (1.4%) | 23 |
| bit-7 recovery | none | not implemented | **39** |
| gate rejections | n/a | 1414 | 1320 |

`b7_fixed` was predicted at 10–15 before measuring and came in at **39** — same
order, wrong by ~3×. The mechanism is real and more productive than estimated; the
estimate was bad and is recorded as such.

### Verdict: stock is the better production firmware

Not because of sensitivity — that is a tie on every measurement taken — but
because **`ctt_radio_terra` implements one of six presets.** `preset:fsktag` only;
everything else replies `"unsupported preset"`. Stock has `node2`, `node3`,
`fsktag`, `node3_tx`, `qaqc`, `es200`, plus `rx_type` (8 values), `tx_dbm`,
`tx_frequency` and a working TX path. `radio-receiver.js:46-49` defines three modes
the station can issue per channel (`preset:node3`, `preset:fsktag`,
`preset:ooktag`) and `base-station.js:146` switches them at runtime — so a channel
set to node or ook mode **goes dead** on this firmware. The default config is
`fsktag` on all channels, which is why the bench never noticed.

Use stock in production; use `5.3.1` on a bench channel when something needs
measuring. **The recovery finding does not need this firmware at all** — Hamming
and bit-7 correction are pure post-processing on `(id, crc)` and would work
fleet-wide in `terra_uhf.py` or `beep-formatter.js` with zero radio risk. That is
the highest-value home for it and it sidesteps the preset problem entirely.

### Fleet state and commits at this update

ch1 stock `4.0.0` (constant reference), ch5 stock `4.0.0` (Phase C in progress),
ch2–ch4 on `5.0.1-terra`. `feat/terra-rfm69`, all **unpushed**:

```
8c08e47  first working firmware + tooling
3422a72  clean rewrite from bench findings
f2aff24  5.0.1  key the diagnostic line off the beep path
f7c5bf7  5.1.0  the recovered ID gate
bf47ed7  keep only the flashable hex from build/
e3a8f31  5.2.0  Hamming single-bit correction
b2502f9  5.3.0  bit-7 recovery via the CRC
574e827  5.3.1  attribution fix + "ecc":1 vs 2 disambiguation
fc62696  tools/hexparse.py
```

Also: `reference/terra-rfm69-station-integration.md` in this repo now carries the
cross-cutting map, including that **running terra natively on board v3r3 is
blocked** — no `/dev/spidev*`, no WiringPi, no RFM69 on the Pi's SPI, and terra's
BCM33/BCM8 collide with `dtoverlay=uart1,rxd1_pin=33` and the `ctt-btn-back`
gpio-key.


## Update 2026-08-26 (final) — Phase C complete; the RSSI claim is retired

**Completes the previous update**, whose Phase C row was marked *partial at time of
writing*, and **retires the "v5 reads real tags 2-4 dB stronger" claim** from the
"Three-way comparison" section above.

Phase C ran its full 33 minutes (6,646 rows). ch5 = stock `4.0.0`, ch1 = stock
`4.0.0`, i.e. both channels identical — which is what makes it the baseline that
turns the other phases into comparisons *against stock* rather than against each
other, and what measures `K(t)` with no firmware in the way.

### Detection rate — identical, and below the same-firmware noise

| phase | median ch5/ch1 | vs stock | ch5 frames |
|---|---|---|---|
| A `5.2.0` (33 min) | 1.000 | 0.998 | 2240 |
| B1 `5.3.0` (33 min) | 1.000 | 0.998 | 1890 |
| B2 `5.3.0` (20 min, repeat) | 0.992 | 0.989 | 1321 |
| C `stock 4.0.0` (33 min) | 1.002 | 1.000 | 1502 |

**Same-firmware repeat (B1 vs B2) = 1.008x.** The spread across firmwares
(0.989-1.000) is *smaller than the noise between two runs of the same firmware*.
Three independent methods have now agreed: cross-channel with a constant
reference, cross-channel with per-tag calibration, and within-radio with the
channel factor cancelled.

### RSSI — the earlier 2-4 dB claim does not survive

Per-tag `ch5 - ch1` median RSSI, ch1 stock throughout, so the fixed antenna
offset is common to every column:

| tag | A 5.2.0 | B1 5.3.0 | B2 5.3.0 | C stock | B1−C | A−C |
|---|---|---|---|---|---|---|
| `071E6661` | −10.0 | −8.0 | −9.0 | −10.0 | +2.0 | +0.0 |
| `19331955` | −11.0 | −11.0 | −12.0 | −10.0 | −1.0 | −1.0 |
| `2D341934` | −2.0 | −3.0 | −1.0 | −2.0 | −1.0 | +0.0 |
| `33075555` | −5.0 | −6.0 | −7.0 | −5.0 | −1.0 | +0.0 |
| `55613461` | −9.0 | −7.0 | −7.0 | −6.0 | −1.0 | −3.0 |
| `61074C4B` | −2.0 | −5.0 | −5.0 | −4.0 | −1.0 | +2.0 |
| `66557866` | −13.0 | −13.0 | −16.0 | −18.0 | +5.0 | +5.0 |

```
5.3.0 vs stock:  median -1.00 dB   stdev 2.36   n=7
5.2.0 vs stock:  median +0.00 dB   stdev 2.51   n=7
SAME firmware:   median +1.00 dB   stdev 1.51   <- the measurement floor
```

**The same-firmware floor is as large as either firmware difference**, so −1.0 and
+0.0 dB are indistinguishable from zero. `66557866` alone swings +5 dB and
`071E6661` +2 dB between identical builds.

So the claim in "Three-way comparison" conclusion 3 — *"v5 reads real tags 2-4 dB
stronger than stock/terra.8 (`071E6661` −73.3 vs −77.6/−78.0)"* — **is withdrawn.**
It was measured across two different channels without calibration, and the offset
it reported was antenna geometry, not firmware. Measured within one radio the
difference is ≤1 dB and below the noise. The linked open item ("Decide whether
v5's 2-4 dB stronger RSSI or stock's reading is correct") is therefore **void as
posed** — there is no difference to adjudicate. A reference transmitter is still
required to establish whether the *shared* value is absolutely correct.

### Stability screen, final

7 of 10 tags stable: `071E6661`, `19331955`, `2D341934`, `33075555`, `55613461`,
`61074C4B`, `66557866`. Excluded:

```
4B551934    0.329 -> 0.030 -> 0.034 -> 0.148    10.99x
55074B4B    1.757 -> 1.016 -> 1.023 -> 1.020     1.73x
61556678    1.876 -> 1.016 -> 1.009 -> 1.004     1.87x
```

`4B551934` came **partly back under stock** (0.148, up from 0.030) but nowhere near
its Phase A 0.329 — so it drifts on its own timescale and is not attributable to
any firmware, consistent with an 8 dB SNR signal against stable tags at 16-32 dB.

Note `2D341934` **passes** on the full data (1.13x) where the partial Phase C put
it at 1.79x. It was excluded prematurely in the previous update; the partial window
was the unreliable part, exactly as flagged there.

### Fleet restored

All five radios flashed back to stock `ss_v4.0.0.hex` and confirmed reporting
`4.0.0`, all drivers active, all collecting (2-minute counts ch1 300, ch2 30,
ch3 20, ch4 24, ch5 247 — ch2-ch4 antenna-less as always).

**Operational note for whoever flashes next.** A first attempt at restoring
ch2-ch4 used a loop passing `1.7.$n`, but the USB path IDs are **offset by one**:

```
ch1 = 1.7.7    ch2 = 1.7.1    ch3 = 1.7.2    ch4 = 1.7.3    ch5 = 1.7.4
```

So `ch4` was paired with `1.7.4`, which is **ch5** — the device under test. All
three attempts failed closed with `NO BOOTLOADER` (the running driver held the
port) and nothing was written, but the 1200-baud touch was issued against ch5's
port while its driver was live. Verified afterwards that all five radios still
enumerated, all drivers were running, and ch5 still reported `4.0.0`. **Do not
derive the path ID from the channel number** — read it from
`/dev/serial/by-path/` per channel, and verify the fleet after any misfire.


## Update 2026-08-26 (close of day) — near-noise-floor test: RSSI answered, rate NOT, and why

Antennas were removed from **all five** channels (ch1/ch5 had been the only pair
with one). Effect on ch1, measured over the 9 minutes either side:

| tag | n before | n after | RSSI before | RSSI after |
|---|---|---|---|---|
| `33075555` | 104 | 8 | −55.6 | **−109.4** |
| `4B551934` | 406 | **0** | −78.6 | — |
| `071E6661` | 167 | **0** | −67.2 | — |
| + 9 more tags | 469 | **0** | −59 to −84 | — |

**A 53.8 dB drop; 11 of 12 tags went to exactly zero.** Only the strongest tag
survived. ch2–ch4 also fell to zero, having previously managed 1–13/min. This is
the regime the record's "Keep a matched control" note warns about — "removing
antennas levels *downward*" — now quantified.

### Design and why it was the wrong one

ch1 cycled stock → `5.2.0` → `5.3.0` → stock over 4 × 14.0 min (21:17 close),
with the 4th round repeating the 1st to measure the noise floor. ch2–ch5 held on
stock. ch3/ch4/ch5 were deliberately **not** reflashed: at 0–0.2 frames/min all
three firmwares score zero there, so 12 reflashes would have returned no
information.

**The error: no simultaneous reference.** Every comparison that worked earlier held
one channel constant while cycling another. Here all remaining signal was on ch1,
so cycling ch1 left nothing to normalise against.

### Result: the rate half is INDETERMINATE

| round | n | per min | RSSI median |
|---|---|---|---|
| R1 stock | 4 | 0.29 | −111 |
| R2 `5.2.0` | 72 | 5.14 | −110 |
| R3 `5.3.0` | 79 | 5.64 | −110 |
| R4 stock (repeat) | 33 | 2.36 | −110 |

Reads as terra beating stock 18×. **It is an artefact.** Per-minute counts show
the environment went **dead → strong → decaying** inside the hour: R1 recorded
**zero frames for 13 of its 14 minutes** (nothing 20:19–20:31, tag appears 20:32),
the middle of the hour ran ~6/min, and the last 15 min decayed to ~2/min. Both
stock rounds landed in bad periods, both terra rounds in the good one. **The two
same-firmware stock rounds differ by 8× from each other** — larger than any effect
claimable.

The only drift-controlled comparisons are the 2–3 min windows straddling each
firmware change, and they disagree:

```
R1->R2  stock 4.00/min -> 5.2.0 4.50/min   1.12x
R2->R3  5.2.0 5.67/min -> 5.3.0 7.00/min   1.24x
R3->R4  5.3.0 5.00/min -> stock 3.00/min   0.60x
```

At n = 9–21 the Poisson error is ±25–35%, so all three are consistent with 1.0.
**A prediction made before the run — that stock would out-detect terra here
because `RegRssiThresh` is `0xFF` (−127.5 dBm) on stock versus `0xE4` (−114 dBm)
on terra, with the tag only 5 dB above terra's threshold — is UNTESTED, not
refuted.** It remains the one regime where the firmwares should diverge.

### Two results that DO stand

**RSSI is identical across all three firmwares**, and this is drift-robust because
it is a level rather than a rate:

```
R1 stock   n=  8   median -111.0   p10/p90 -113/-109
R2 5.2.0   n= 78   median -110.0   p10/p90 -112/-109
R3 5.3.0   n= 77   median -110.0   p10/p90 -111/-108
R4 stock   n= 34   median -110.0   p10/p90 -111/-109
```

−110 ± 1 dBm everywhere, at a level **50 dB weaker** than every earlier test. Taken
with the same-radio result earlier today (≤1 dB, below a 1.00 dB floor), RSSI
equivalence now holds across a 55 dB dynamic range.

**At the noise floor the ID gate does 82% of the work.** Terra counters, 14 min each:

| | irq_count | emitted | gate_dropped | parity / msb | ecc_fixed | b7_fixed |
|---|---|---|---|---|---|---|
| `5.2.0` | 456 | 83 | 373 | 286 / 87 | 26 | — |
| `5.3.0` | 442 | 83 | 359 | 280 / 79 | 27 | 8 |

Both rounds emitted **exactly 83** with irq counts within 3% — a clean
same-family repeat. **82% of everything the radio syncs on is junk here**, against
~25% with antennas fitted. Without the gate terra would emit 456 records where 83
are real.

## RESUME NOTES — station powered off 2026-08-26 ~21:46 UTC

**Fleet is safe:** all five radios verified on stock **`4.0.0`** before shutdown.

**`/tmp` is wiped on reboot.** Everything staged there is gone and must be
re-copied: `terra_v520.hex`, `terra_v530.hex`, `ss_v4.0.0.hex`, `flash-ch.sh`,
`probe-radio-config.mjs`, `tap.mjs`. Persistent copies of the stock images remain
at `/usr/lib/ctt/sensor-station-software/system/radios/fw/`.

**The exact firmwares tested are byte-for-byte recoverable from git** (verified):

| version | commit | hex md5 |
|---|---|---|
| `5.2.0-terra` | `e3a8f31` | `b5df6f07101e5d3bc39249aa406a5719` |
| `5.3.0-terra` | `b2502f9` | `fb0592ffd477c2e8f3b1a9976c8b8bb0` |
| `5.3.1-terra` | `574e827` | `a1b8fe7fbbe27666591e698a516f5b71` |

```sh
git show <commit>:system/radios/fw/src/ctt_radio_terra/build/ctt_radio_terra.ino.hex > /tmp/fw.hex
```

**USB path IDs are OFFSET BY ONE from channel numbers** — do not derive one from
the other, read them from `/dev/serial/by-path/`:

```
ch1 = 1.7.7    ch2 = 1.7.1    ch3 = 1.7.2    ch4 = 1.7.3    ch5 = 1.7.4
```

**To make the resumed test valid, fix the RF setup first.** Get the tag heard by at
least **two** channels at roughly **−95 to −105 dBm** (marginal but measurable, and
still near terra's −114 dBm threshold so the `RegRssiThresh` prediction is
testable). Then hold one channel constant and cycle the other — one tag on one
radio cannot work however long the test runs, because an hour of drift beats any
sequential design.

## Update 2026-08-27 — resumed comparison with the RF setup fixed: stock 4.0.0 vs 5.3.1-terra, four phases

**Answers the RESUME NOTES above.** The RF prerequisite they set ("get the tag heard by at
least two channels") was met before this run — antennas are refitted and all five channels hear
tags at −83…−89 dBm median, ~90–140 detections/min each, with the core tags matched across all
five (`071E6661` 227/222/204/200/203 over 12 min). This is the first comparison on this bench
that is not signal-starved.

Station **V3033D413FBC**, CM3+ / board v3r3, kernel 6.1.21-v7+. Branch `feat/terra-rfm69`
at **`fc62696`** — now pushed, and the station's checkout fast-forwarded to it (the
"unpushed" note in earlier sections is retired). Firmware under test is the branch's own
`build/ctt_radio_terra.ino.hex`, md5 `a1b8fe7fbbe27666591e698a516f5b71` = **`5.3.1-terra`**.

### Design

`ch1` held stock `4.0.0` for the entire run as a simultaneous reference; `ch5` was the DUT and
was reflashed for every phase, including the repeats — so the measured floor covers
flash-to-flash variability, not just window-to-window. Four 20-minute windows, 90 s discarded
after each flash. Estimator is the one this record settled on: `R_P(t) = n_ch5,P(t)/n_ch1,P(t)`,
compared as `R_P/R_Q` so the fixed channel factor `K(t)` cancels exactly.

**Both** firmwares got a same-firmware repeat (`P1`/`P4` stock, `P2`/`P3` terra), and each phase
was additionally split in half to measure the floor at the *same ~10 min timescale* as the
comparison rather than only across hour-apart phases.

| phase | firmware | window (UTC) | ch5 | ch1 |
|---|---|---|---|---|
| P1 | stock `4.0.0` | 13:58:32 – 14:18:32 | 1914 | 2633 |
| P2 | `5.3.1-terra` | 14:20:29 – 14:40:29 | 2111 | 2939 |
| P3 | `5.3.1-terra` | 14:42:26 – 15:02:26 | 1994 | 2925 |
| P4 | stock `4.0.0` | 15:04:23 – 15:24:23 | 2198 | 3174 |

Flashing used the repo's `system/scripts/program-radio.sh`, which resolves the port from
`/dev/ctt-radio/chN` itself and is therefore structurally immune to the offset-by-one path trap
that caused the misfire recorded above. The runner also re-read `ch1`'s version after every
flash and would have aborted had the control moved; it never did.

### The floors

```
cross-phase, same firmware:   stock P1 vs P4   1.000x
                              terra P2 vs P3   1.005x
within-phase split-half:      0.996 / 0.995 / 1.011 / 1.000    (range 1.6%)
```

Two independent same-firmware repeats agree to ≤0.5%. This is the tightest floor obtained on
this bench — the earlier near-noise-floor session had two stock rounds differing by **8×**.

### Detection rate — a tie on strong tags, terra ~1.5–2% behind overall

Normalised to P1, stable tags only (8 of 10 passed the screen):

| tag | ch5 RSSI | P1 stock | P2 terra | P3 terra | P4 stock |
|---|---|---|---|---|---|
| `19331955` | −72 | 1.000 | 1.000 | 1.000 | 1.000 |
| `071E6661` | −67 | 1.000 | 1.000 | 1.003 | 1.000 |
| `33075555` | −60 | 1.000 | 0.996 | 0.996 | 1.004 |
| `55613461` | −71 | 1.000 | 0.992 | 0.975 | 1.008 |
| `2D341934` | −84 | 1.000 | 0.970 | 0.949 | 0.992 |
| `61074C4B` | −81 | 1.000 | 0.858 | 0.827 | 1.014 |
| `66557866` | −80 | 1.000 | 0.768 | 0.821 | 0.955 |
| `78614C4B` | −87 | 1.000 | 0.855 | 1.018 | 0.710 |
| **MEDIAN** | | **1.000** | **0.981** | **0.986** | **1.000** |

Excluded by the stability screen: `6178191E` (spread 1.84×) and `4B551934` (**5.16×** — the same
marginal ~9 dB tag this record has already caught drifting on its own timescale; it ran
0.125 → 0.191 → 0.037 → 0.041, i.e. it collapsed *within* the terra phases and stayed collapsed
under stock, which is not a firmware pattern).

**The raw ch5 counts are what settle it.** These tags beacon at fixed intervals, so on the DUT
itself the counts are near-deterministic:

| tag | ch5 RSSI | P1 | P2 | P3 | P4 |
|---|---|---|---|---|---|
| `071E6661` | −67 | 375 | 375 | 374 | 374 |
| `33075555` | −60 | 231 | 232 | 230 | 231 |
| `55613461` | −71 | 123 | 121 | 119 | 123 |
| `19331955` | −72 | 76 | 78 | 77 | 77 |
| `2D341934` | −84 | 372 | 361 | 352 | 368 |
| `66557866` | −80 | 122 | 116 | 127 | 120 |
| `61074C4B` | −81 | 74 | 69 | 63 | 75 |
| `78614C4B` | −87 | 205 | 173 | 206 | 145 |

Above about **−72 dBm the two firmwares are indistinguishable to the frame** — 375/375/374/374 is
not a statistical tie, it is the same beacons decoded. The deficit that drags the median to
0.981/0.986 lives entirely in the **−79 to −87 dBm** band, and there it is reproducible in
direction: `61074C4B` runs 74 → 69 → 63 → 75 and `2D341934` 372 → 361 → 352 → 368, both dipping
on *both* terra phases and recovering under stock. At ~2× the floor that is a real but small
effect, and `78614C4B` (205/173/206/145) shows the band is also where the bench itself is
noisiest — so **1.5–2% is an upper bound on terra's loss, not a firm estimate.**

This is the fourth independent method to return "no meaningful sensitivity difference", and the
first with enough signal to resolve a couple of percent at all.

### RSSI — identical, now measured directly rather than through the reference

Because ch5 hears every strong tag in every phase, absolute medians on the DUT can be compared
without normalising at all:

```
071E6661   -67 / -68 / -68 / -69      2D341934   -84 / -84 / -84 / -84
33075555   -60 / -60 / -60 / -59      66557866   -80 / -80 / -79 / -81
55613461   -71 / -70 / -69 / -69      61074C4B   -81 / -81 / -80 / -79
19331955   -72 / -72 / -71 / -71      78614C4B   -87 / -87 / -89 / -89
```

No firmware pattern; drift is ≤2 dB and monotonic with time, not with firmware. The
ch5−ch1 view agrees and makes the point sharper still:

```
P2 terra - P1 stock   +1.00 dB
P3 terra - P1 stock   +1.25 dB
P4 STOCK - P1 STOCK   +1.50 dB   <- same firmware, larger than either terra delta
```

**The stock-to-stock difference exceeds both stock-to-terra differences.** This independently
confirms the retirement of the "v5 reads 2–4 dB stronger" claim, and extends RSSI equivalence to
a third regime (−59 to −89 dBm here, ≤1 dB at −55…−78 earlier today, ±1 dB at −110 at the noise
floor). A reference transmitter is still required to say whether the *shared* value is
absolutely right — that open item stands, untouched.

### Phantom IDs — stock is still cleaner, but the control has to be subtracted

| phase | firmware | ch5 IDs | ch1 IDs | ch5/ch1 |
|---|---|---|---|---|
| P1 | stock | 20 | 25 | 0.80 |
| P2 | terra | 30 | 27 | 1.11 |
| P3 | terra | 35 | 35 | 1.00 |
| P4 | stock | 34 | 54 | 0.63 |

**Do not read the raw ch5 column.** `ch1` is on stock throughout and its own distinct-ID count
went **25 → 27 → 35 → 54**, so the environment grew far noisier across the session and a naive
"stock 20 vs terra 35" would be mostly that. Normalised against the control, terra sits at
~1.05 and stock at ~0.72 — terra is about **1.5× dirtier**, against the **~8×** (181 vs 22)
measured before the recovered ID gate existed. The gate closed most of that gap; it did not
close all of it.

### Where the firmwares genuinely differ — the recovery counters

Read from the MCU at each phase's end; counters are cumulative since that phase's flash, so
these are exact 20-minute totals. Stock has no equivalent and cannot produce these at all.

| | P2 terra | P3 terra |
|---|---|---|
| `irq_count` | 3404 | 3219 |
| `emitted` | 2291 | 2160 |
| `gate_dropped` | 1113 | 1059 |
| — `gate_parity` | 685 | 707 |
| — `gate_msb` | 340 | 344 |
| — `gate_zero` | 88 | 8 |
| — `gate_ff` | 0 | 0 |
| `ecc_fixed` | 38 | 41 |
| `b7_fixed` | 31 | 35 |
| `ecc_declined` | 685 | 707 |

Both phases agree within ~5% on every counter — a clean same-family repeat, and the strongest
evidence yet that these mechanisms are stable rather than incidental. **33% of everything the
radio syncs on is junk** even with antennas fitted and strong signal (1113/3404), against ~82% at
the noise floor. `ecc_fixed` + `b7_fixed` = **69 and 76 frames per 20 minutes** recovered that
stock discards outright, at `snr_min:0` and `rssi_thresh:E4` (−114 dBm) with `radio_ok:1`.

### Verdict — unchanged, and for the reason already recorded

Nothing here disturbs the standing verdict: **run stock in production.** Not on sensitivity —
that is a tie above −72 dBm and within ~2% below it — but because `ctt_radio_terra` implements
one preset of six, so a channel the station switches to `preset:node3` or `preset:ooktag` goes
dead. This run adds that terra is also marginally *behind* on mid-strength tags and ~1.5×
dirtier on phantom IDs, neither of which argues for it.

What this run does strengthen is the recommendation already in the record: **the recovery
finding does not need this firmware.** Hamming and bit-7 correction are pure post-processing on
`(id, crc)`, and at 69–76 recoveries per radio per 20 minutes the effect is large enough to be
worth having fleet-wide — in `beep-formatter.js` or `terra_uhf.py`, with zero radio risk and no
preset problem.

The one prediction this run still **cannot** test is the `RegRssiThresh` divergence: it needs the
tag at −95…−105 dBm, near terra's −114 dBm threshold, and this bench now sits 25–31 dB above it.
Fixing the RF setup fixed it past that window. **UNTESTED, not refuted** — as before.

### Methodological trap found: a rotated CSV is *moved*, and it silently ate two phases

The first analysis run reported `ch5=0` for P1 and `ch5=78` for P2 — the two phases had
apparently vanished. They had not. The hourly rotation fired at **14:39:41**, mid-P2, and the
rotated file is gzipped into `/data/rotated/` and then **moved to
`/data/uploaded/ctt/<date>/`** once the server accepts it. An analysis that reads only
`/data/*.csv` plus `/data/rotated/` loses every phase older than the last rotation, and does so
*quietly* — it reports zeros, not an error.

Any run longer than `rotation_frequency_minutes` (60) must read `uploaded/`, `rotated/` and
`rotated-failed/` as well as the live file. Verified disjoint at the boundary second (12 rows in
the uploaded file, 5 in the live one, **0 identical**), so no dedup is needed. A file rotated
across a power-off can also carry NUL padding that `csv` refuses outright, so strip NULs rather
than lose the file.

### Fleet state at close

All five radios verified back on stock **`4.0.0`**, all five drivers running, all collecting.
`ch5` was left on stock by P4 rather than needing a restore pass. Tooling for a repeat is at
`/tmp/terra/` on the station (`run.sh`, `analyze.py`, `fwver.mjs`, `status.mjs`) — `/tmp` is
wiped on reboot, so re-copy from the workstation scratch if resuming.

## Update 2026-08-27 (later) — the RegRssiThresh prediction is REFUTED, on mechanism

**Closes the last standing open item.** The record has carried this since the
close-of-day session: *"stock should out-detect terra here because `RegRssiThresh`
is `0xFF` (−127.5 dBm) on stock versus `0xE4` (−114 dBm) on terra, with the tag
only 5 dB above terra's threshold — UNTESTED, not refuted. It remains the one
regime where the firmwares should diverge."*

It is now tested. It does not hold, and the reason is more fundamental than a
margin: **`RegRssiThresh` does not gate packet reception on this part in this
configuration at all.**

### The test did not need a −95…−105 dBm environment

The RESUME NOTES said this needed the tag at −95…−105 dBm, which is why it kept
being deferred. That framing was unnecessarily strict. The prediction is about
the **margin between signal and threshold**, not about absolute dBm — and terra
exposes `rssi_thresh` as a runtime command (−127…−20 dBm, `reg = -2*dbm`), so the
threshold can be raised to meet a fixed signal instead of lowering the signal to
meet a fixed threshold.

That is a strictly better experiment than the one originally proposed:

- it isolates **the single register** the prediction is about, where stock-vs-terra
  differs in many other ways;
- it needs **no reflash between conditions**, so nothing else changes;
- terra reaches **−127 (`0xFE`)**, within 0.5 dB of stock's `0xFF`, so one
  firmware can stand in for both sides of the comparison;
- and it can place the threshold **above every tag present**, which no amount of
  waiting for a quiet environment can guarantee.

ch5 ran `5.3.1-terra` throughout; ch1 held stock `4.0.0`, untouched, as the
simultaneous control. Retention for tag *t* at threshold *T* is
`R_T(t) = n_ch5,T(t)/n_ch1,T(t)`, normalised to the baseline run. Every setting was
verified by reading the register back before its window opened.

### Sweep 1 (−114 → −80 dBm) — inconclusive, and it says so

| | −114 | −127 | −100 | −95 | −90 | −87 | −85 | −80 | −114 |
|---|---|---|---|---|---|---|---|---|---|
| ch5 n | 694 | 570 | 591 | 550 | 534 | 545 | 640 | 630 | 626 |
| ch1 n | 692 | 785 | 761 | 715 | 574 | 605 | 779 | 797 | 792 |

Retention, stable tags only:

| tag | ch5 dBm | −114 | −127 | −100 | −95 | −90 | −87 | −85 | −80 |
|---|---|---|---|---|---|---|---|---|---|
| `33075555` | −59 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| `071E6661` | −69 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.01 | 1.00 |
| `55613461` | −69 | 1.03 | 1.00 | 1.03 | 1.07 | 1.03 | 1.07 | 1.07 | 1.07 |
| `66557866` | −70 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| `19331955` | −71 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0.94 | 1.00 |
| `2D341934` | −84 | 0.96 | 1.00 | 0.99 | 0.99 | 0.99 | 1.01 | 1.00 | 1.01 |

Excluded as unstable by the `−114` repeat (C1 vs C9, identical setting):
`4B551934`, `55074B4B`, `61556678`, `6178191E`, `78614C4B`.

**This sweep cannot answer the question and must not be read as if it does.** The
tags stable enough to measure all sit at −59…−84 dBm while the sweep stopped at
−80, so it never rose above the strongest of them. The tags weak enough for −80
to gate (−88…−90 dBm) are exactly the marginal ones this record has already
caught drifting — one of them reported "retention" **8.64**, which no gating
mechanism can produce.

The one result that does stand from sweep 1 is the head-to-head that motivated
everything: **`T = −114` vs `T = −127`, same radio, same firmware, same signal —
median retention `1.000` over 11 tags spanning −59 to −89 dBm.** That is the exact
register difference between terra and stock, measured directly.

### Sweep 2 (−114 → −55 dBm) — the positive control fires, and fails

Rather than wait for weak tags, bring the threshold **up** to the strong,
high-count, stable ones. `−55 dBm` sits above *every* tag present and is a
positive control: if detections do not collapse there, the register is inert.

| | −114 | −75 | −70 | −67 | −64 | −61 | −58 | −55 | −114 |
|---|---|---|---|---|---|---|---|---|---|
| ch5 n | 672 | 619 | 596 | 644 | 570 | 623 | 626 | **662** | 556 |
| ch1 n | 752 | 756 | 791 | 776 | 761 | 788 | 785 | 795 | 793 |

| tag | ch5 dBm | −114 | −75 | −70 | −67 | −64 | −61 | −58 | **−55** |
|---|---|---|---|---|---|---|---|---|---|
| `33075555` | −59 | 1.00 | 1.00 | 1.02 | 1.00 | 1.00 | 1.02 | 1.00 | **1.00** |
| `071E6661` | −69 | 1.00 | 1.01 | 1.01 | 1.00 | 1.00 | 1.00 | 1.00 | **0.99** |
| `55613461` | −70 | 1.00 | 1.03 | 1.00 | 1.03 | 1.03 | 1.03 | 1.00 | **1.00** |
| `19331955` | −71 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | **1.00** |
| `55074B4B` | −80 | 1.00 | 0.96 | 0.93 | 0.93 | 1.00 | 0.96 | 0.95 | **0.93** |

Excluded by the `−114` repeat (D1 vs D9): `2D341934`, `4B551934`, `61074C4B`,
`61556678`, `66557866`, `78614C4B`.

**At `T = −55 dBm` the threshold is 4 dB above the strongest tag and 25 dB above
the weakest stable one, and every stable tag retains 0.93–1.00.** ch5's total
count is flat across the entire sweep (556–672) with no trend; if the register
gated reception that column would collapse. Both floors — C1/C9 and D1/D9, same
setting revisited — are `1.000`.

### Verdict: refuted on mechanism, not on margin

`RegRssiThresh` does not gate packet reception here, so the `0xE4` vs `0xFF`
difference cannot produce a detection gap at **any** signal level, and the "one
regime where the firmwares should diverge" does not exist.

This is consistent with what this record already established in
§"Measurement rules": `RegIrqFlags1.Rssi` is *"Set in Rx when RssiValue exceeds
RssiThreshold, cleared when leaving Rx"* — a one-way latch that never clears in
continuous RX. `RegRssiThresh` sets **when that flag asserts**, not whether a
packet is received. Sync detection and `PayloadReady` proceed independently. The
prediction assumed the register was a squelch; it is an interrupt threshold.

Practical consequence: terra's `RegRssiThresh` write — "DELTA 1", one of the three
genuine differences from stock this whole investigation began with — is
**inert for detection purposes**. Of terra's three deltas, that leaves the
signal-quality instrumentation and the forwarded CRC byte as the real ones.

### Two metric bugs found while doing this — the same failure mode, twice

This record's §Prevention warns: *"Built a counter that could only report
success… Any success metric must be able to say no."* The onset detector hit that
failure **twice**, and both times it produced a confident, false confirmation of
the prediction:

1. **On a partial sweep**, every tag trivially looked "still fine at the highest
   threshold tested", yielding a 34 dB margin and `PREDICTION HOLDS` from a single
   condition. Fixed by requiring the sweep to actually *bracket* a loss before any
   margin is stated.
2. **The repeat control was read as a result.** The stability screen keyed on the
   `−127` condition, which sweep 2 does not have, so the screen never ran and the
   `−114` **repeat's own drift** was scored as an onset "at −114" — inventing a
   +28 dB margin and `PREDICTION HOLDS` out of four tags that had merely drifted
   over 50 minutes. Fixed by keying the screen on *whatever threshold was visited
   twice*, and by excluding control settings from the onset scan.

Both were caught only because a same-setting repeat was built into the design.
**A sweep without a repeated condition cannot distinguish an effect from drift**,
and on this bench drift is large enough to fake any effect being looked for.

The distinction the corrected tool now draws is the one that matters: "no loss,
and the sweep never challenged the register" (inconclusive) versus "no loss, and
the threshold was above every signal present" (refuted). Sweep 1 is the first;
sweep 2 is the second.

### The rotation trap is fixed in the repo

The trap recorded in the previous update — a rotated CSV is gzipped into
`/data/rotated/` and then **moved** to `/data/uploaded/<svc>/<date>/`, so an
analysis reading only the live file reports **zeros rather than an error** — now
has a committed fix rather than a warning.

`system/scripts/read-detections.py` (CLI `read-detections`, installed by
`install-scripts.sh` so an OTA self-heals the symlink) is the one correct reader.
It globs all four locations and is loud by construction, since the bug is silence:
it always writes a manifest of every file, row count and time span to stderr;
**exits non-zero rather than printing an empty result as success**; strips the NUL
padding a file rotated across a power-off carries (which `csv` otherwise rejects
outright, losing the file); and checks for duplicate **rows** rather than
overlapping spans — adjacent files legitimately share a boundary *second* while
sharing no rows, so a span check false-alarms on every healthy pair, 25 times on
this station, and a warning that fires on healthy data gets ignored.

Verified: it recovers the previously lost P1 window exactly (`ch5=1914`,
`ch1=2633`) and reports zero duplicates across 55 files and 1.46M rows. Both
sweeps above were analysed through it. Documented in `system/README.md`.

### Fleet state at close

All five radios verified back on stock **`4.0.0`**, all five drivers running, all
collecting. ch5 was reflashed to stock by the sweep's own restore step. Sweep
tooling is committed at `system/radios/fw/src/ctt_radio_terra/tools/`.

## Update 2026-08-27 (later still) — false detections: terra's error correction is the source

**Qualifies the recommendation in §"Verdict: stock is the better production
firmware"** — *"the recovery finding does not need this firmware at all… Hamming
and bit-7 correction are pure post-processing on `(id, crc)` and would work
fleet-wide in `terra_uhf.py` or `beep-formatter.js` with zero radio risk. That is
the highest-value home for it."* The mechanism is sound and that is still the
right home, but it must not be moved **as-is**: measured here, correction
manufactures false detections at a rate comparable to the real ones it recovers.

### Comparison by false-detection rate

A false detection is an emitted ID that **no other channel saw in the same
window**. All five radios are co-located and every real tag here is heard by all
five (`071E6661` was 227/222/204/200/203), so a real tag corroborates and noise
does not. ch5 is the device under test; ch1–ch4 stay on stock, so every window
carries its own control.

From the four-phase comparison earlier today (20 min per phase):

| phase | ch5 firmware | rows | false IDs | false rows | false rate |
|---|---|---|---|---|---|
| P1 | stock `4.0.0` | 1914 | 3 | 3 | **0.16%** |
| P2 | `5.3.1-terra` | 2111 | 10 | 21 | **0.99%** |
| P3 | `5.3.1-terra` | 1994 | 12 | 34 | **1.71%** |
| P4 | stock `4.0.0` | 2198 | 3 | 3 | **0.14%** |

**stock 0.15% vs terra 1.35% — about 9×.** Not environmental: ch1's own false
rate during the two terra phases was 0.00% and 0.07%, its quietest of the session.

**Both gates are perfect on their own terms.** Zero emitted IDs failed the Hamming
parity equations in any phase, either firmware. This is not a leaking gate; it is
something adding IDs that are legal but wrong.

### The false IDs are bit-7 neighbours of the loudest real tags

Stock's false IDs are all singletons. Terra's **repeat**, and every repeat
offender is a single bit-7 flip of a strongly detected tag:

| false ID | n | one bit from | n |
|---|---|---|---|
| `2DB41934` | 9 | `2D341934` | 352 |
| `61874C4B` | 7 | `61074C4B` | 63 |
| `AD341934` | 6 | `2D341934` | 352 |
| `556134E1` | 2 | `55613461` | 119 |
| `5561B461` | 1 | `55613461` | 119 |

A repeating false ID is a systematic process, not noise. And §"Hamming(7,4) is a
PERFECT code" already predicts the process: *"pure noise corrects as readily as a
real tag."* Correction applied to a noise frame cannot fail — it lands on **some**
legal ID, and the nearest legal IDs are the neighbours of whatever is loudest.

### Causal test: `ecc` on vs off, one radio, one firmware

`ecc:0` disables both correction paths (Hamming at the `GATE_PARITY` branch,
bit-7 at the `GATE_PASS`/`!crcok` branch), so this is a clean on/off switch with
nothing else changing. Conditions **interleaved 1/0/1/0**, 15 min each, so a drift
trend cannot masquerade as the effect, and each setting is measured twice. ch5 on
`5.3.1-terra` throughout, ch1 on stock as the simultaneous control. Counters are
cumulative with no reflash between conditions, so status was sampled before and
after each window and the delta reported.

| cond | ecc | rows | false IDs | false rows | ch5 false% | ch1 ctrl% | **ch5/ch1** |
|---|---|---|---|---|---|---|---|
| E1 | **on** | 2288 | 10 | 17 | 0.74% | 0.29% | **2.55** |
| E2 | off | 1973 | 6 | 8 | 0.41% | 0.41% | **1.00** |
| E3 | **on** | 1739 | 6 | 21 | 1.21% | 0.33% | **3.67** |
| E4 | off | 1599 | 6 | 7 | 0.44% | 0.35% | **1.26** |

| cond | ecc | irq | emitted | gate_dropped | ecc_fixed | b7_fixed |
|---|---|---|---|---|---|---|
| E1 | on | 2925 | 2293 | 632 | 51 | 40 |
| E2 | off | 2622 | 1981 | 641 | **0** | **0** |
| E3 | on | 2322 | 1743 | 579 | 39 | 32 |
| E4 | off | 2134 | 1604 | 530 | **0** | **0** |

The counters confirm the manipulation took: `ecc_fixed` and `b7_fixed` are exactly
zero in both off conditions and non-zero in both on conditions.

```
ecc ON   false rate 0.98%   (0.74, 1.21)     normalised to control  3.11
ecc OFF  false rate 0.42%   (0.41, 0.44)     normalised to control  1.13
```

**Both ON values exceed both OFF values, and they do so within each adjacent
pair** (E1>E2, E3>E4), which is what the interleaving buys: drift cannot produce
that pattern.

### Conclusion

**Terra's error correction is the source of its excess false detections.** With
correction off, terra's false rate is `1.13×` its own same-window control —
statistically indistinguishable from the stock channels beside it. With correction
on it is `3.11×`.

Sizing the damage against the benefit, per window:

| | E1/E2 | E3/E4 |
|---|---|---|
| corrections claimed (`ecc_fixed`+`b7_fixed`) | 91 | 71 |
| extra false rows vs the adjacent off window | +9 | +14 |
| implied mis-correction rate | ~10% | ~20% |

So **10–20% of what the counters report as recoveries are landing on IDs no other
radio saw.** This is the §Prevention failure again, in a new place: `ecc_fixed`
and `b7_fixed` are counters that can only report success. They count that a
correction was *applied*, never that it was *right* — the CRC agreeing after
correction is true by construction of the search (the code says so at the
`crcok = true` assignment), so it is not independent evidence.

### What this means for the fleet recommendation

Moving Hamming + bit-7 correction into `beep-formatter.js` or `terra_uhf.py` is
still the right home — it is post-processing on `(id, crc)` with no radio risk —
but moving it unchanged would export a 10–20% mis-correction rate to every
station, and the same perfect-code argument applies wherever it runs. Correction
needs an independent constraint before it is trusted. Two are available and cheap:

1. **Require corroboration.** A corrected ID that no other channel on the station
   ever sees is almost certainly a mis-correction. This is exactly the classifier
   used above, and it works at the station level with no new data.
2. **Require the corrected ID to be a deployed tag.** §"Verification" already
   established that all **130** manufacturer-assigned IDs from two deployments
   pass the gate, and a deployment knows its own tag list. Correcting onto an ID
   that was never deployed is provably wrong, which turns a perfect code into a
   usefully imperfect one.

Until one of those is in place, `ecc` is better left **off** for production data,
which is what stock effectively does by not implementing it.

### Fleet state at close

All five radios verified back on stock **`4.0.0`**, all five drivers running, all
collecting. ch5 was reflashed by the test's own restore step. Analysis tooling:
`tools/false-detections.py` (the classifier) and `tools/ecc-ab.sh` +
`tools/ecc-ab-analyze.py` (the on/off test), all reading through
`read-detections`.

---
<!-- Immutable record: correct only by appending a dated "Update" section below,
     never by editing the findings above. -->
