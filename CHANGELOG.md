# Changelog

All notable changes to the CTT Sensor Station software are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

A machine-readable mirror lives at [`changelog.json`](changelog.json), which is
consumed by the live R-based sensor-station documentation. This markdown
file is the authoritative source going forward; `changelog.json` should be
regenerated from these entries.

---

## [Unreleased]

_Nothing yet — next changes land here before a version tag._

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
- **IMEI-gated boot-time RNDIS provisioner** for Telit modems —
  idempotent NV configuration of `AT#RNDIS` + `AT#IPPASSTH`. Later
  moved out of the image to manufacturing (see _Removed_) but the
  script remains in the monorepo for fleet-side fallback.
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
- **`provision-modem.service`** (CGDCONT cleanup, PPP era) — replaced
  by the RNDIS data path which does not need CGDCONT manipulation.
- **`provision-modem-rndis.service`** + boot-time RNDIS NV provisioning
  — moved to manufacturing. Stations now assume the modem ships with
  RNDIS + IP-passthrough already provisioned at the factory; the boot
  service is no longer enabled in the image.

### Build / Tooling

- Added `image-build-procedure.md` (in `docs/`) capturing the
  losetup-mount → modify → shrink → upload flow.
- One-off `stage-test-image.sh` (in `images/`, not in monorepo) drives
  the end-to-end image build: copies LTS image → loop-attach → branch
  reset → applies all post-merge-equivalent deploys → version stamps
  → unmount + detach. Hard-reset semantics (vs. stash + pull) avoid
  phantom-edit conflicts on every rebuild.

---

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
