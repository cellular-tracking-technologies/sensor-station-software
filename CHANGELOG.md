# Changelog

All notable changes to the CTT Sensor Station software are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

A machine-readable mirror lives at [`changelog.json`](changelog.json), which is
consumed by the live R-based sensor-station documentation. This markdown
file is the authoritative source going forward; `changelog.json` should be
regenerated from these entries.

---

## [2.0.1] — unreleased

Bug-fix release cut for a fresh test image on top of 2.0.0: two fixes that
restore the station's internal control plane and the over-the-air update path
on the Node 20 image.

### Fixed

- **Internal HTTP over `localhost` resolved to IPv6 (`::1`)** — the Node services
  reach `station-hardware-server` at `http://localhost:3000`, which binds
  IPv4-only (`127.0.0.1`). On Node 20 `localhost` resolves to `::1` first and
  `node-fetch` connects to that single address with no fallback, so every internal
  call — check-in payload assembly, the `/modem/ppp` connectivity LED probe, and
  the LCD stats screen — failed with `ECONNREFUSED ::1:3000`. Each service now
  forces IPv4-first DNS ordering so `localhost` → `127.0.0.1`, matching the
  server's bind. External name resolution is unchanged (IPv6 retained as fallback).
- **`update-station` failed when launched from the web dashboard** — the "update"
  button spawns the script from a root service with no `$HOME`, so
  `git config --global` failed (`fatal: $HOME not set`) and every git call then
  tripped the dubious-ownership guard, aborting the pull. The script now sets
  `$HOME` when unset and injects `safe.directory` via the environment, so the OTA
  runs identically from the dashboard, cron, and SSH.

## [2.0.0] — unreleased

_The first 2.x: the native hardware/radio layer and a new LTS image path. The
release date and git tag are assigned at ship; entries may still accumulate
during final testing._

**Native hardware/radio layer.** Moves hardware bring-up and direct device I/O
out of the Node application at boot and into a layer of small compiled C++ tools
started by systemd/udev. The Node services become consumers of stable file and
socket contracts under `/run/ctt/`. Drivers ship as versioned, prebuilt armhf
binaries the station fetches over OTA — stations never compile. This is a major,
breaking change to the on-device architecture, hence the `2.0.0` bump.

### Added

- **`ctthw` C++ hardware library** — one driver class per chip (I/O expander,
  ADC, temperature, RTC, board-ID EEPROM, character LCD) over a single
  `/dev/i2c-1` wrapper with cross-process bus locking, plus board-identity and
  sensor policy. Shared by all native tools.
- **Native device tools** —
  - `ctt-board-detect`: boot-time board detection → `/run/ctt/board.env` (the
    single runtime identity source) and persistent `/etc/ctt/station-*`.
  - `ctt-radio-driver@N`: one per 434 MHz receiver, bridging the serial port to
    `/run/ctt/radios/chN.sock` (NDJSON).
  - `ctt-blu-driver@N`: one per BluSeries (2.4 GHz) receiver, served by the same
    driver binary over `/run/ctt/blu/chN.sock`.
  - `ctt-sensors`: polls the ADC + temperature → `/run/ctt/sensors.json`. Covers
    both the V3 (MAX11645 + TMP411) and V2 (ADS7924 + TMP102) sensor sets.
  - `ctt-leds`: drives the V3 status LEDs (SX1509B) from `/run/ctt/leds`.
  - `ctt-lcd`: renders the character LCD (HD44780 via PCF8574) from `/run/ctt/lcd`.
  - `ctt-radio-flash`: GPIO-free radio firmware flashing (1200-baud-touch +
    avrdude), universal across on-board and USB receivers; orchestrated by
    `program-radios.sh` with per-channel driver recovery.
- **Front-panel LCD status** — boot splash while the app starts, a shutdown
  indicator, an "Updating…" splash held for the duration of an OTA, and a
  radio-fault banner shown when the radio service is down.
- **Kernel `gpio-keys` buttons** — the front-panel buttons move to the kernel
  `gpio-keys`/evdev input path via a board-gated device-tree overlay; the LCD
  menu reads key events instead of polling GPIO in-process.
- **`ctt-device-config`** — applies one canonical, per-board-revision
  `/boot/config.txt` (copy + reboot-once with a hash-keyed loop breaker),
  replacing the dynamic boot-overlay services.
- **OTA native-binary delivery** — CI publishes a versioned, checksummed armhf
  binary per tool; the OTA hook fetches and verifies the fleet-pinned version
  ([system/native/](system/native/)). Per-tool versioning, no lockstep.
- **`system/migrations/`** — live, in-place field-station upgrades (discard drift
  → cross the checkout to the new LTS branch → `update-station` → reboot), for the
  rare case where a fielded station can't be reflashed. Safe by default (requires
  `--force`); reflashing the prepared image remains the recommended upgrade.

### Changed

- **`station-radio-interface`** consumes the `ctt-radio-driver` and
  `ctt-blu-driver` sockets for the 434 MHz and BluSeries receivers instead of
  opening serial ports directly; receiver discovery moves from filesystem
  watching to udev → systemd → socket.
- **`station-hardware-server`** `/sensor` reads `/run/ctt/sensors.json` instead of
  polling the I2C sensors in-process.
- **Node services launch directly via `node`** (not `npm run`), so they terminate
  cleanly on `SIGTERM` instead of waiting out the systemd stop timeout — faster,
  reliable restarts and reboots.
- **OS configuration consolidated** into [system/](system/) — board-gated radio
  map, systemd units, and boot scripts relocated into the monorepo to remove
  drift. OTA hooks propagate file removals/renames via a declarative list.
- **`ctt-sensors` logging quieted** — the per-poll reading line is gone; the
  journal now carries a periodic heartbeat (every 5 min) plus immediate lines on
  a health transition or read error, with `<N>` severity prefixes for
  `journalctl -p` filtering (~60× less steady-state log volume). Readings still
  publish to `/run/ctt/sensors.json` every cycle; `--verbose` restores per-poll
  logging.

### Fixed

- **OTA durability** — `update-station` now `sync`s after the pull and after the
  deploy hooks, so a hard power-off seconds after an update can no longer zero the
  freshly written files (ext4 ordered-mode writeback). The pull is hardened
  (`--ff-only`, retry, and abort-on-failure) so a transient failure can't leave a
  station on stale code while reporting success.
- **Cellular**: stations no longer auto-dial PPP on the newer modem; migrated
  images ship with the modem off until enabled.
- **WiFi reachability**: disable NetworkManager WiFi power-save (a global
  `conf.d` drop-in). Without it the USB WiFi adapter slept when idle and stopped
  answering ARP, so a WiFi-connected station was unreachable until a dongle or a
  reboot woke it.
- **WiFi-from-USB (`/usb/wifi`)**: await the `nmcli` connect before the follow-up
  config command, and handle failures, so a failed join now returns an error
  instead of an unhandled promise rejection that crashed `station-hardware-server`
  (and aborted the in-flight connect).
- **LCD**: native re-initialization recovers a warm controller from any state
  (no more garbled output on a service restart); fixed a menu back-navigation
  crash.
- **`station-radio-interface`**: guard a null data-receiver result during line
  parsing.
- **Boot**: removed a deadlock path so SIM/APN selection no longer blocks modem
  startup.

## [1.8.0] — 2026-06-16

Major release: **Telit LE910Q1 cellular support and OTA modernization.**

This release migrates the cellular data path from Quectel EC25 (QMI) +
ModemManager-managed PPP to Telit LE910Q1 (RNDIS) with a modem-level
NAT bridge, introduces a modular OTA hook system that lets future
deployment changes ship without touching `update-station.sh`, and
modernizes the hardware-server's `/modem` API so the LCD, web UI, and
station check-ins all share a single in-process mmcli poller instead
of each forking subprocesses.

### Added

- **Telit LE910Q1-WWG modem support** end to end — `enable-modem.sh`,
  `disable-modem.sh`, udev rules, and NetworkManager profiles all
  recognize the new hardware (USB VID:PID `1bc7:7020` RNDIS / `1bc7:7021` ECM).
  Switches to a **PPP-free RNDIS data path** (`mdm0` interface) with the
  modem performing NAT to the LTE bearer.
- **Modular OTA hook system** — `system/scripts/hooks/post-merge.sh`
  orchestrator iterates `post-merge.d/*.sh` drop-ins (`install-systemd`,
  `install-udev`, `install-network`). Adding new subsystem deploys
  becomes a one-file drop-in rather than an `update-station.sh` edit.
  A parallel pre-merge orchestrator (`pre-merge.sh` + `pre-merge.d/`)
  is wired in as a placeholder phase for future pre-pull work.
- **Adaptive `/modem` cache** in hardware-server — one background mmcli
  poll loop serves all consumers (LCD, web UI, check-ins). Polls every
  2 s while requests are active, idle after 60 s. Exposes real LTE
  metrics (RSRP / RSRQ / SNR via `mmcli --signal-setup` + `--signal-get`)
  alongside the legacy percent-derived RSSI.
- **Connectivity probe for `/modem/ppp`** — actual ping through the
  modem interface (1.1.1.1, every 10 s while active), replacing the
  old "any modem interface exists" check that returned false-positives
  for unprovisioned modems whose `mdm0` came up without LTE forwarding.
- **Modem boot-state persistence** (`modem-boot-state.service`) —
  operator on/off intent (set via `/modem/enable-modem` and
  `/modem/disable-modem`) survives hard reboots via a marker file in
  `/var/lib/ctt/`. Service runs once at boot before NetworkManager.
- **`sensorgnome.service` and `bootcount.service`** brought under
  monorepo + OTA control. Previously these lived only at
  `/etc/ctt/systemd/` on the image and could not be updated via OTA.
  `boottime_compute.sh` (called by `bootcount.service`) moves into
  `system/scripts/`.
- **`78-ctt-radios.rules`** — positive-filter radio identification by
  USB VID:PID via udev. Replaces fragile by-path substring matching
  with a deterministic, ordering-independent device map.
- **`tools/modem-snapshot.sh`** — read-only diagnostic dump capturing
  cellular modem state (mmcli, ip, dmesg) for support escalations.
- **Pre-merge OTA hook orchestrator** mirroring post-merge — empty
  drop-in dir today, ready for pre-pull tasks (e.g. config backup,
  state stash) in future releases.

### Changed

- **Cellular data path: PPP → RNDIS.** The Telit LE910Q1 doesn't speak
  QMI, so we exit the ModemManager bearer-and-PPP path entirely. The
  modem now bridges traffic to the LTE bearer internally and exposes
  `mdm0` as a kernel netdev. `provision-modem.service` (PPP-era CGDCONT
  cleanup) is removed.
- **Quectel disable/enable**: kernel-module blacklist → per-device USB
  authorize. Cleaner, doesn't affect other modules using `option`/`qmi_wwan`,
  and survives reboot without modprobe.conf surgery.
- **Radio detection** in `station-radio-interface`: by-path substring
  matching → positive-filter by USB VID:PID. Less brittle when USB
  topology changes between board revisions.
- **LCD `Station Stats` modem readings**: in-process `execSync mmcli`
  triplet → HTTP fetch of hardware-server's cached `/modem`. Eliminates
  three blocking subprocess forks every 10 s from the LCD process.
- **`/modem` and `/modem/signal-strength` endpoints** serve from the
  adaptive cache and include `rsrp`, `rsrq`, `snr` fields (null until
  signal-setup warms up).
- **`check-sim-id.sh`** now waits for SIM presence before picking APN,
  and is invoked from `enable-modem.sh` rather than racing at boot.
- **Wired uplink default-route metric** pinned below cellular so
  `eth0` wins when both interfaces are present (previously the cellular
  default route could shadow a working wired uplink).
- **`update-station.sh`**: re-execs itself after `git pull` if the script
  file changed in the pull — so a script update applies to the same
  OTA run rather than waiting for the next one.
- **`list-devices.sh`** extended to recognize the Telit modem.

### Fixed

- **Boot deadlock** where `check-sim-id` would start ModemManager too
  early, before the SIM was ready, causing MM to enter a bad state
  it never recovered from.
- **LCD modem signal showed `:!`** for working RNDIS modems — the
  state check required `state == 'connected'`, but ModemManager never
  advances past `'registered'` on the RNDIS path because the bearer
  is set up at the modem (via `AT#RNDIS`/`AT#IPPASSTH`), not via MM.
  Now accepts `connected | registered | enabled | searching` plus a
  numeric signal value.
- **`/modem/ppp` false positives** on unprovisioned modems whose
  `mdm0` interface came up without LTE forwarding (LED stayed on
  even with no real connectivity). Active probe now confirms traffic
  flow before reporting `ppp: true`.
- **`sensorgnome.service` first-boot ENOENT** reading
  `/etc/ctt/station-id` — added `After=station-boot.service` so it
  waits for station-boot to create the file. Previously crashed,
  retried 60 s later, succeeded — now starts clean on first attempt.
- **FunCube USB endpoints** crowding the bus — `77-ctt-telit-block-unused.rules`
  now also blocks Telit interfaces 06 / 07.
- **`modem-boot-state.sh`** missing executable bit prevented the
  service from running.

### Removed

- **Automatic station reboot on update** — `update-station.sh` no
  longer triggers a reboot at the end. Reboots are now operator-driven
  via the LCD menu or explicit command.

## [1.7.0] — 2025-09-17

> _Backfilled from `changelog.json` — to be supplemented with per-commit
> detail by future code-introspection pass._

### Added
- v3.3 radio map.
- Additional files to designate station software, image, board revision,
  and revision.

### Fixed
- Removed user database due to large npm library install footprint.
- Removed `healthCheckin` retry that caused a station-checkin loop.

---

## [1.6.0] — 2025-07-17

> _Backfilled stub._

### Added
- Delete-data option in LCD menu; displays storage space before/after deletion.

### Fixed
- Login-page cookie handling so users on different computers can access the web interface.
- Station-ID i2c read: bus is now read once to generate the ID, the ID is saved as a string, and passed up the stack.

---

## [1.5.0] — 2025-02-05

> _Backfilled stub._

### Added
- `List Devices` and `Delete Connections` LCD menu options for QAQC.
- RSSI values calculated from signal-quality on Station Stats and Cell Modem Signal LCD menu items.

### Security
- Register and login pages for the web interface.

---

## [1.4.0] — 2024-10-09

> _Backfilled stub._

### Added
- Terminal commands for LCD menu options (`npm run lcd-option <command>`).

### Fixed
- Re-enabled 434 MHz radio `restart_on_close`.
- try/catch around SensorGnome `save-deployment` event listener.
- Removed `'en'` label from English WiFi menu option.

---

## [1.3.0] — 2024-09-10

> _Backfilled stub._

V2 Sensor Stations with a modem were not initializing properly; this
release addresses that path. (See `changelog.json` for additional
notes.)

---

## [1.2.x] — 2024-08-15 through 2024-08-21

> _Backfilled stub — see `changelog.json`._

---

## [1.2.0] — 2023-07-11

Initial version for the Sensor Station image with BluSeries integration.

---

[Unreleased]: https://github.com/cellular-tracking-technologies/sensor-station-software/compare/v1.8.0...HEAD
[1.8.0]: https://github.com/cellular-tracking-technologies/sensor-station-software/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/cellular-tracking-technologies/sensor-station-software/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/cellular-tracking-technologies/sensor-station-software/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/cellular-tracking-technologies/sensor-station-software/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/cellular-tracking-technologies/sensor-station-software/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/cellular-tracking-technologies/sensor-station-software/releases/tag/v1.3.0
[1.2.0]: https://github.com/cellular-tracking-technologies/sensor-station-software/releases/tag/v1.2.0
