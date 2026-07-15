# `system/` — OS Configuration & Deployment Layer

This directory holds the operating-system configuration that turns a Raspberry
Pi OS install into a running CTT Sensor Station. It is the glue between the
compiled native tools ([../native/](../native/)) and the Node.js services
([../src/](../src/)): systemd units, udev rules, boot scripts, the over-the-air
(OTA) update mechanism, NetworkManager profiles, the board-gated radio map, and
the image-migration scripts.

Nothing here runs the application logic itself. Instead this layer **deploys**
the binaries and services, **orders** them at boot, and **wires** the hardware
contracts (`/run/ctt/*`, `/dev/ctt-radio/*`, `/dev/ctt-blu/*`) that the
application layer depends on. See the [repo root README](../README.md) for the whole-system overview and
the runtime contracts table.

---

## Layout

```
system/
├── systemd/        systemd unit files (native ctt-* daemons, Node services, boot oneshots)
│   ├── REMOVED     declarative list of retired units to delete from already-provisioned stations
│   └── *.service
├── udev/           device rules: radio + BluSeries identification, modem interface handling
│   ├── REMOVED     declarative list of retired rules to delete on deploy
│   └── *.rules
├── radios/         board-gated radio + BluSeries port map + udev-rule generator
│   ├── maps/       per-board {channel, USB id_path} maps (v2.json, v3r0.json, v3r3.json)
│   ├── fw/         receiver firmware images flashed by program-radios.sh
│   └── generate-rules.mjs   regenerates udev/78-ctt-radio-driver.rules + 78-ctt-blu-driver.rules from maps/
├── device-tree/    canonical full /boot/config.txt per revision (config-<board>.txt), applied by ctt-device-config
├── native/         version pins for the fetched native binaries (<tool>.version)
├── scripts/        boot scripts, OTA updater, hooks, modem/SIM/GPS/RTC helpers, cron
│   └── hooks/      modular OTA hook orchestrator (pre-merge + post-merge drop-ins)
├── network/        NetworkManager connection profiles (*.nmconnection)
├── chrony/         chrony NTP config (GPS PPS + SHM refclocks)
├── gps/            gpsd defaults
├── hwclock/        hwclock-set override (skip clock set; RTC handled elsewhere)
└── migrations/     image-to-image migration scripts (build-host path, not OTA)
```

---

## systemd units

Units fall into three groups: native `ctt-*` daemons/oneshots that own hardware,
the Node service units, and a few boot oneshots for modem/SIM/sensorgnome setup.
All are deployed to `/etc/systemd/system/` by the OTA `install-systemd.sh` hook.

| Unit | Type | Purpose | Ordering (`After=` / activation) |
|------|------|---------|----------------------------------|
| `ctt-board-detect.service` | oneshot | Reads board ID hardware over I2C; writes `/run/ctt/board.env` + `/etc/ctt/station-*`. Re-runs every boot (plug-n-play compute-module swap). Re-triggers tty udev so radios that enumerated early match. | `local-fs.target` |
| `ctt-device-config.service` | oneshot | **Single owner of `/boot/config.txt`.** Copies the canonical per-revision config (`device-tree/config-<board>.txt` — full state: RTC + buttons + LED/control GPIOs) if it differs, then reboots **at most once** (hash-keyed loop breaker). Replaces the old separate rtc/buttons/leds overlays, which each rewrote config.txt and could reboot each other in a loop. | `ctt-board-detect` (`Requires=`); `Before=time-sync.target chrony` |
| `ctt-sensors.service` | simple | Reads I2C ADC rail voltages + board temperature; publishes `/run/ctt/sensors.json`. | `ctt-board-detect` |
| `ctt-leds.service` | simple | Drives V3 status LEDs (SX1509B expander) from `/run/ctt/leds`. | `ctt-board-detect` |
| `ctt-lcd.service` | simple | Renders the character LCD (HD44780/PCF8574) from `/run/ctt/lcd`. | `ctt-board-detect` |
| `ctt-radio-driver@.service` | template | One instance per 434 MHz receiver. Serves `/run/ctt/radios/ch<N>.sock`. Activated per-channel by udev, **not** enabled directly. | `dev-ctt-radio-%i.device` |
| `ctt-blu-driver@.service` | template | One instance per BluSeries (FTDI) receiver. Same `ctt-radio-driver` binary in its default line framing; serves `/run/ctt/blu/ch<N>.sock`. Activated per-channel by udev, **not** enabled directly. | `dev-ctt-blu-%i.device` |
| `station-hardware-server.service` | simple | Hardware HTTP API (port 3000). Head of the Node service chain. | `ctt-board-detect` |
| `station-radio-interface.service` | simple | Radio + BluSeries acquisition + CSV data pipeline + WS control. | `station-hardware-server` |
| `station-web-interface.service` | simple | Local web dashboard (port 80). | `station-hardware-server` |
| `station-lcd-interface.service` | simple | Front-panel LCD menu + buttons; writes `/run/ctt/lcd`. | `station-hardware-server` |
| `modem-boot-state.service` | oneshot | Restores last operator modem on/off state before the modem manager scans. | `local-fs.target`, `systemd-udev-settle`; `Before=` modem manager |
| `station-boot.service` | oneshot | Runs `check-sim-id.sh`: modem data-path policy + per-SIM APN selection. | `network.target`, modem manager |
| `sensorgnome.service` | simple | Starts the companion Motus/SDR tag-detection process. | `network.target`, `station-boot` |
| `bootcount.service` | simple | Runs `boottime_compute.sh`: links the board's sensorgnome USB-hub udev rules. | `station-boot` |

The `install-systemd.sh` hook keeps an internal `MUST_BE_ENABLED` list and
auto-enables the boot/identity/sensor/LED units on deploy. The `ctt-radio-driver@`
and `ctt-blu-driver@` templates are deployed as files but are intentionally never
enabled — udev starts their instances on demand.

---

## Boot ordering & file contracts

Board identity is produced **first** and consumed by nearly everything after it.
`ctt-board-detect` runs early, reads the board's ID hardware over I2C, and writes:

| File | Content | Consumed by |
|------|---------|-------------|
| `/run/ctt/board.env` | `CTT_BOARD=v2\|v3r0\|v3r3` (+ `CTT_STATION_VERSION`, revision) | the radio udev rules (`IMPORT{file}`), `boottime_compute.sh`, `device-config.sh` |
| `/etc/ctt/station-id`, `station-revision`, `station-board-revision` | persistent identity (drop-in compatible with the old `initialize.js`) | Node services, boot scripts (fallback when `board.env` is absent) |

Because identity is published before the consumers run, every downstream unit
declares `After=ctt-board-detect.service`. The runtime daemons then publish their
own contracts under `/run/ctt/` (`sensors.json`, `radios/ch<N>.sock`,
`blu/ch<N>.sock`, `leds`, `lcd`); `/run/ctt` is created and preserved across restarts via `RuntimeDirectory`.
The full producer/consumer contract table lives in the [repo root README](../README.md).

A subtlety: USB radios can enumerate before `board.env` exists, so their udev
rule would not match the board-gated condition. `ctt-board-detect` handles this
with `ExecStartPost=udevadm trigger --action=add --subsystem-match=tty`, re-firing
the tty rules once identity is known.

---

## udev rules

Rules are deployed to `/etc/udev/rules.d/` by `install-udev.sh`. udev applies
rules in lexical order, so source filenames carry numeric prefixes when ordering
matters.

- **Radio identification** (`78-ctt-radio-driver.rules`, generated — see below).
  Radios are matched by a positive filter on the Adafruit Feather USB vendor id
  (`239a`) and **application product id (`800c`)**, plus the device's stable
  `ID_PATH` (physical USB position) and the detected `CTT_BOARD`. A match symlinks
  the device to `/dev/ctt-radio/ch<N>`, tags it for systemd, and sets
  `ENV{SYSTEMD_WANTS}=ctt-radio-driver@ch<N>.service` — that is the mechanism by
  which a receiver plug-in starts its driver instance. Gating on the app product
  id means the Caterina **bootloader** (`000c`, which appears during programming)
  is ignored, so it never grabs a channel from `program-radio.sh`/`avrdude`.
- **BluSeries identification** (`78-ctt-blu-driver.rules`, generated from the same
  maps — see below). BluSeries receivers present as an FTDI FT231X (`0403:6015`).
  They plug into the external USB ports the radio map numbers 6+, and are matched
  by that vendor/product id, the device's `ID_PATH`, and `CTT_BOARD`; a match
  symlinks `/dev/ctt-blu/ch<N>` and sets `ENV{SYSTEMD_WANTS}=ctt-blu-driver@ch<N>.service`.
  Blu channels are renumbered to start at 1 for readability (blu `ch<N>` = the
  radio map's port `N+5`), so a receiver in the port the radio map calls ch8
  enumerates as blu ch3.
- **Modem interface handling.** Per-vendor rules ignore or trim modem USB
  interfaces so the modem manager binds only the interfaces it should:
  `23-quectel-modem.rules` keeps the modem manager off non-modem tty interfaces;
  `77-ctt-telit-block-unused.rules` deauthorizes unused CDC-ACM interface pairs to
  trim USB endpoint pressure on the CM3; `78-ctt-telit-net.rules` renames the
  modem's CDC-ECM network device to a stable `mdm0` so it does not race the wired
  Ethernet dongle for an `eth*` slot. These describe interface-selection
  mechanism only; modem NV provisioning (ECM composition + session bind) is
  ensured each boot by the idempotent `ctt-modem-provision.service` guard.

---

## OTA update system

Field stations update in place. `scripts/update-station.sh` is the entry point:

1. `git stash` + `git pull` the monorepo checkout at `/usr/lib/ctt/sensor-station-software`.
2. Run `npm install` only if `package.json` changed.
3. If `update-station.sh` itself changed in the pull, re-exec the new copy once
   (guarded against an infinite loop) so new deploy logic applies in the **same**
   run rather than only on the next update.
4. Run the **post-merge hook orchestrator**, restart the Node services, and
   update sensorgnome.

**Crash durability.** The updater `sync`s after the pull, after the hooks, and
after the sensorgnome pull, forcing the freshly-written files to durable storage.
ext4 (`data=ordered`) journals metadata on its ~5 s commit but leaves file *data*
in the page cache until writeback, so a hard power-off in that window would
otherwise let journal recovery truncate the just-written files (checkout + git
objects) to zero bytes — observed once when a station was power-cut immediately
after an OTA. The post-pull `sync` runs *before* the self-re-exec, so the new
updater is itself durable before it re-execs. (This does not protect a cut
*mid-pull*; that would need staged-write + atomic-swap.)

The deploy work is **modular**, not hardcoded into the updater:

```
scripts/hooks/
├── _lib.sh            shared log helpers + deploy_dir() + apply_removals()
├── pre-merge.sh       orchestrator: runs pre-merge.d/*.sh BEFORE the pull (placeholder today)
├── pre-merge.d/       drop-in dir for pre-pull work (empty)
├── post-merge.sh      orchestrator: runs post-merge.d/*.sh AFTER the pull
└── post-merge.d/
    ├── install-systemd.sh   deploy systemd units, daemon-reload, enable required units
    ├── install-udev.sh      deploy udev rules, udevadm reload
    ├── install-network.sh   deploy NetworkManager profiles, nmcli reload
    └── install-native.sh    fetch + verify pinned native binaries (see below)
```

`post-merge.sh` runs every `*.sh` in `post-merge.d/` in lexical order. Each hook
is independent: it manages one subsystem, runs as root, compares source against
the deployed copy and only writes when they differ, and reloads its subsystem
only when something actually changed. A failing hook does not block the others;
the orchestrator's exit code is non-zero if any hook failed.

**Adding a new deploy step = adding a new drop-in file.** No edit to
`update-station.sh` or to the orchestrator is required. This avoids the
"first OTA needs two runs" problem that hardcoding deploy steps in the updater
would create. (`pre-merge.d/` hooks are the exception: because the version on
disk runs before the pull, a new pre-merge hook activates on the *next* update,
not the one that delivers it.)

**Declarative removals.** `deploy_dir` only ever adds or updates files, so a file
deleted or renamed in the repo would linger forever in `/etc` on stations that
once received it. Each deploy source directory may ship a `REMOVED` file listing
the basenames it used to install and no longer should (one per line, `#`-comments
allowed). On every deploy `apply_removals` ensures each listed file is absent —
touching only names the project has explicitly retired. See
[systemd/REMOVED](systemd/REMOVED) and [udev/REMOVED](udev/REMOVED).

**Mutable-key tolerance.** `install-network.sh` strips runtime-owned keys
(`timestamp=`, `apn=`, `autoconnect=`) before diffing, so a redeploy does not
fight the runtime agents that legitimately rewrite those keys per-SIM and per-boot.

**Migrations.** The OTA does **not** remove obsolete files. Building a fresh
image from a previous LTS instead runs a [migration script](migrations/) that
performs the forward deploy *and* the cleanup, validating source-image provenance
first. See [migrations/README.md](migrations/README.md).

---

## Native version pins

Stations never compile native code; they fetch prebuilt `armhf` binaries. Each
tool's pinned version is a bare semver in `native/<tool>.version`:

| Pin file | Installs to | Used by |
|----------|-------------|---------|
| [`native/ctt-board-detect.version`](native/) | `/usr/local/bin/ctt-board-detect` | `ctt-board-detect.service` |
| [`native/ctt-sensors.version`](native/) | `/usr/local/bin/ctt-sensors` | `ctt-sensors.service` |
| [`native/ctt-leds.version`](native/) | `/usr/local/bin/ctt-leds` | `ctt-leds.service` |
| [`native/ctt-lcd.version`](native/) | `/usr/local/bin/ctt-lcd` | `ctt-lcd.service` |
| [`native/ctt-radio-driver.version`](native/) | `/usr/local/bin/ctt-radio-driver` | `ctt-radio-driver@.service`, `ctt-blu-driver@.service` |

For pin `X.Y.Z` of `<tool>`, `install-native.sh` downloads the matching prebuilt
asset from the monorepo's GitHub releases, verifies a published `.sha256` sidecar
when present, and runs a smoke test requiring `<tool> --version` to print exactly
`X.Y.Z` (catching wrong-arch or truncated downloads that still returned HTTP 200).
A tool already at its pinned version is skipped. A transient download failure
leaves the existing binary in place and retries on the next OTA; a tool with no
usable binary at all is a hard failure. Bumping a pin and committing it is the
only step needed to roll a new native binary to the fleet.

---

## Other scripts

`scripts/` also holds the boot helpers invoked by the units above
(`boottime_compute.sh`, `device-config.sh`, `check-sim-id.sh`,
`modem-boot-state.sh`), modem on/off and Wi-Fi toggles
(`enable-modem.sh` / `disable-modem.sh`, `enable-wifi.sh` / `disable-wifi.sh`),
receiver-firmware flashing (`program-radios.sh`, firmware images in
`radios/fw/`), device inventory (`list-devices.sh`), data/credential cleanup
helpers, and the `cron/` hourly/daily stubs.
