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
| Flash | 12186 bytes (42%) of 28672 |
| RAM | ~470 bytes of 2560 |
| Build target | `adafruit:avr:feather32u4` **only** (see Build) |
| Verified | RSSI within 1.21 dB of stock; real-tag rate ratio median 0.99; FEI r=+0.999 cross-receiver |
| Known gap | emits far more phantom IDs than stock unless `snr_min` is raised |

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
on a separate JSON line that `parse_subghz` returns null for, so `RadioReceiver`
re-emits it as `raw`: visible in the journal, invisible to the beep pipeline.

The command grammar (`key:value`, replying `{"key":…,"res":…[,"err":…]}`) and the
`version` response shape are copied from the shipped firmware, so existing
per-channel config strings in `default-config.js` keep working. `version` reports
`4.0.0-terra.1` — deliberately distinguishable in the radio-fw poll.

Commands: `version`, `preset:fsktag`, `rxbw:<raw>`, `rx_size:<n>`,
`modulation:fsk|ook`, `rssi_thresh:<dbm>` *(new)*.

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

Known false positive: `FrfMid DIFFERS`. `regpairs.py` pairs each `ldi r22,<reg>`
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
- **An SNR floor is the missing filter.** Sweeping `snr_min` 0->10 dB drops distinct
  IDs 64->20 (stock logs 21) with CRC-valid real detections flat at 18-19. Not
  enabled by default: on a quiet channel some real tags sit at SNR 3-4 dB, so a
  high threshold would discard them. `snr_min:3` is the value to pilot.

## Known deviations from terra-rfm69

- **No CSV metrics path.** terra's `terra_metrics` rotation has no equivalent here;
  the diagnostic JSON line is the only sink.
- **`SyncConfig = 0x88` is derived, not disassembled** — SyncOn plus a 2-byte sync
  length. The shipped image computes register 0x2E at runtime. Corroborated twice:
  our decoded IDs match stock's exactly (a different sync length would shift the
  payload), and `sync_size:3` receives nothing.
