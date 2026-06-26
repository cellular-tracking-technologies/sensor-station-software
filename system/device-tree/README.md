# `device-tree/` — canonical per-revision `config.txt`

One **complete** `/boot/config.txt` per board revision, captured from the real
image for that revision. Each file is the full device-tree state for the board —
base Pi settings, RTC overlay, control GPIOs, and the front-panel button
`gpio-key` overlays (and, in future, status-LED `gpio-led` overlays where a board
uses GPIO LEDs).

```
device-tree/
├── config-v2.txt      # V2  (ds3231 RTC, buttons on GPIO 4/5/6/7)
├── config-v3r0.txt    # V3 rev 0/1 — verbatim copy of v3r3 (same RTC/buttons/base); verify on real rev-0 hardware
└── config-v3r3.txt    # V3 rev 2+ (mcp7941x RTC, buttons on GPIO 17/22/27/8)
```

## Why a full file per revision (not assembled at boot)

Earlier this was three independent services (`ctt-rtc-overlay`,
`ctt-buttons-overlay`, `ctt-leds-overlay`) that each rewrote `config.txt` at boot
by appending their own managed block. Two block-appending managers fought over
ordering and rebooted each other forever — a V2 boot loop. A single static file
per revision, copied verbatim, structurally cannot have that failure: there is
one owner and one artifact, and it doesn't change over the life of a revision.

## How it's applied

`ctt-device-config.service` runs `../scripts/device-config.sh` early each boot:
resolve `CTT_BOARD` (from `/run/ctt/board.env`) → if `config-<board>.txt` exists
and differs from `/boot/config.txt`, copy it and **reboot once**. A persisted
hash of the last-rebooted-for config is the **loop breaker**: if config.txt still
differs after we already rebooted for that exact target, it's applied but not
rebooted again — so it can never loop.

## Adding a revision

`ctt-device-config` is the **only** thing that manages `config.txt` now — the old
per-subsystem `rtc`/`buttons`/`leds` overlay services have been removed. So EVERY
deployed revision must have a `config-<board>.txt` here; a board with none is left
unmanaged (its `config.txt` is whatever the image shipped) and `device-config.sh`
logs a warning. All three current revisions are covered — though `config-v3r0.txt`
is a provisional verbatim copy of `config-v3r3.txt` (V3 rev 0/1 and rev 2+ share
the same RTC, buttons, and base; the RTC swap was only ever a v3→v2 concern) and
should be verified against real rev-0 hardware.

To add a revision: capture `/boot/config.txt` from a known-good station of that
revision (`cat /boot/config.txt`), drop it in as `config-<board>.txt` (bake the
button overlays in as plain lines rather than a "managed by …" block), commit.

> The button GPIOs and the V2 status-LED GPIOs must match the carrier-board
> schematic. The V2 LED pins are still unverified, so V2 ships **no** gpio-led
> overlay yet (`ctt-leds` idles on V2). V3 LEDs are on the SX1509B (I2C), so V3
> never needs a gpio-led overlay.
