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

### Fixed

- **A modem that re-enumerates at runtime no longer strands the station until a reboot.**
  `ctt-modem-ecm-up.service` was `Type=oneshot` + `RemainAfterExit=true` + boot-only, so when
  the Telit dropped and re-appeared on USB mid-run, the fresh `mdm0` netdev came back with no
  address and no default route and nothing ever re-ran the bring-up. The modem stayed
  registered on the carrier while the station was IP-dead: no checkin, no upload, no autossh
  tunnel. Observed on V30B0154C65F — offline ~22 h (2026-08-27 22:09 → 2026-08-28 20:04 UTC),
  recovered only by an on-site reboot. Three changes make the bring-up event-driven:
  - `78-ctt-telit-net.rules` now pulls in the bring-up via `ENV{SYSTEMD_WANTS}` on the same
    `mdm0` add event it already renames on (systemd's `99-systemd.rules` supplies the
    `TAG+="systemd"` these need).
  - `RemainAfterExit=true` is dropped. It latched the unit at `active (exited)`, and systemd
    silently drops start requests for an already-active unit — the udev trigger and the timer
    would both have been no-ops against it. Nothing in the tree declares `Requires=`/`After=`
    on this unit, so the latch bought nothing.
  - New `ctt-modem-ecm-up.timer` re-asserts the data path every 5 min, covering the failure the
    udev trigger structurally cannot see: the path dying with no re-enumeration and so no add
    event (an expired lease the module stops answering; or a boot where `dhclient` exhausted
    its retries and fails open forever).

- **`modem-ecm-up.sh` reaps the stale `dhclient` before starting a new one.** The daemon from a
  previous bring-up survives a USB re-enumeration but can never re-lease on the new netdev — it
  loops `send_packet: Network is unreachable` indefinitely (13,703 such lines in one day on
  V30B0154C65F) and would fight the new instance. Also added: an early exit when `mdm0` already
  has an address and a default route, so the now-frequent re-runs are close to free.

- **A disabled modem stays disabled across a re-enumeration.** `disable-modem.sh` deauthorizes
  the modem and records intent in `/etc/ctt/modem-disabled`, but `authorized` is runtime state
  that resets to `1` whenever the module re-enumerates, and only boot-time
  `modem-boot-state.service` reconciled it — so a disabled modem that re-enumerated came back
  on the bus until the next reboot. New udev-activated `ctt-modem-reassert-off.service`
  re-applies the deauthorize on the `mdm0` add event. It and `ctt-modem-ecm-up.service` carry
  complementary `ConditionPathExists` on the marker, so exactly one runs per add event and the
  recovery path can never route over a modem the operator turned off.

- **The renewing `dhclient` survives the unit deactivating (`KillMode=process`).** It is
  daemonized into the unit's cgroup, so once `RemainAfterExit` was dropped the default
  `KillMode=control-group` would have reaped it at the end of every run — trading the
  boot-only bug for a fleet-wide loss of lease renewal. Caught on V30B0154C65F before the
  first timer tick could do it.

- **The timer uses `OnCalendar=*:0/5`, not `OnUnitActiveSec`.** The latter computes its next
  elapse from the triggered unit's last activation, so a unit stuck active stops the timer
  scheduling altogether (`Trigger: n/a`). That is not hypothetical: on the first deploy of
  this branch the pre-existing `active (exited)` state from the *old* unit definition
  swallowed the timer's start and killed the schedule.

- **Sensorgnome VAH telemetry no longer floods the journal and the syslog flat files.**
  `start-sensorgnome.sh`'s stdout is ~100% `VAH frames` / `VAH info` — 6 lines every 10 s.
  Measured on a field station: **149,706 of 149,709 `nohup[...]` lines were VAH, 78% of
  `/var/log/syslog` by line count**, and the same stream was duplicated into `daemon.log`
  *and* journald, at roughly 17 MB/day per sink. With journald on its default
  `SystemMaxUse` (10% of a 15 GB rootfs ≈ 1.5 GB, and already at 1.4 GB) that evicted every
  kernel message older than ~12 days — which is why the modem-reset cadence in
  investigations/2026-08-27 could not be established. The log noise was destroying the
  forensic record.

  `sensorgnome.service` now sends stdout straight to **`/var/log/ctt-sensorgnome.log`** via
  `StandardOutput=append:`, so the telemetry is still captured but never enters journald or
  rsyslog. `StandardError` stays on the journal, so `journalctl -u sensorgnome` still shows
  faults; the only stdout content that moves out of it is the 3-line "SensorGnome server
  listening on port N" banner, which is in the new file.

### Changed

- `install-systemd.sh` deploys `*.timer` as well as `*.service`. The glob was `*.service` only,
  so a timer added to `system/systemd/` would have silently never reached a station.

### Added

- **`system/logrotate/` + `install-logrotate.sh` OTA hook.** systemd never rotates an
  `append:` target, so the new log needs logrotate or it grows unbounded on a 15 GB card.
  `ctt-sensorgnome` rotates daily (`maxsize 20M` as a burst guard), keeps 7, compresses, and
  uses **`copytruncate` — which is required, not stylistic**: systemd holds the file open and
  never reopens it, so a rename-based rotation would leave it writing into the renamed inode
  forever. This is the repo's first logrotate config, hence the new hook; it follows the same
  `deploy_dir` pattern as `install-udev.sh`.

## [2.3.4] — 2026-07-31

### Fixed

- **A recycled or SIM-swapped Telit no longer strands on a stale APN (`ctt-modem-provision`
  0.3.3).** The Telit ECM provisioner returned as soon as the ECM session was bound and never
  checked the attach context, so a Telit carrying a wrong `CGDCONT` CID1 from a prior deployment
  (e.g. `internet.cxn` baked in, now paired with a Kore SIM) bound ECM to the wrong APN and the
  PDN stayed dead through every reboot — the Telit-side mirror of the Quectel cause-55/33 trap.
  The provisioner now runs the **shared attach-APN heal after the ECM bind** for *both* modem
  families: read `CGDCONT` CID1, rewrite a non-blank wrong APN via `CFUN=0` / `CGDCONT` / `CFUN=1`,
  and publish the dial APN — keyed on the SIM's IMSI home PLMN with a hardened ICCID issuer-prefix
  fallback. The carrier/APN logic and the rewrite routine move into the base `Modem`; modem AT
  commands are split into `at::` / `at::quectel::` / `at::telit::` namespaces. Hardware-verified on
  a Telit: a bad context survived a 0.3.2 boot, and 0.3.3 healed it (`internet.cxn` → `super`) at
  boot before ModemManager. The fleet pin `system/native/ctt-modem-provision.version` rolls to
  **0.3.3**.

### Changed

- **Release docs brought current.** Each native tool now carries a `DESCRIPTION` for its GitHub
  release notes; the image release-notes template calls out that the station runs a **SensorGnome**
  build feeding the **Motus** network; and the `lts_26_07` migration guide extends through v2.3.x
  (cellular provisioner maturation, SIM-aware APN self-heal, front-panel IP-dongle fix,
  `collect-diagnostics`, timeline to 2.3.3).

## [2.3.3] — 2026-07-30

### Added

- **`collect-diagnostics` is now an on-station CLI** (`/usr/local/sbin/collect-diagnostics`).
  `system/scripts/collect-diagnostics.sh` gathers a read-only bundle — identity, hardware,
  services, modem **+ SIM ICCID/IMSI**, and logs — as the `ctt` user (no sudo) and prints the
  `.tar.gz` path. It is the single source of truth for what a diagnostic bundle contains; the
  client-side SSH wrappers (Unix `.sh` / Windows `.ps1`, in the KB repo) become thin invokers.

### Fixed

- **OTA no longer clobbers a Quectel's `autoconnect` (cellular survives every update).**
  `deploy_dir` copied the repo `station-modem` profile wholesale, and its "preserve the
  runtime-owned keys" step only stripped them from the *diff*, not the installed file — so
  the repo's `autoconnect=false` overwrote the live value on any redeploy. It bit only
  Quectel because NetworkManager omits `autoconnect=true` (the default) from the keyfile, so
  "preserve the line if present" preserved nothing. `merge_preserved_keys` now reads an
  **absent** preserved key as the daemon default and omits it (never falling back to the
  source value); `install-network.sh` also re-runs `modem-datapath.sh` after the deploy to
  re-assert the per-modem policy. Verified on real NM 1.30.6 (absent line → `autoconnect: yes`)
  and on hardware. (PR #50.)
- **Application layer is now OTA-self-enabling, correctly ordered, and retries forever.**
  Boot-sequence hardening from the boot-sequence review: (1) `install-systemd.sh`'s
  `MUST_BE_ENABLED` now covers the Node/SensorGnome units (`station-hardware-server`,
  `station-radio-interface`, `station-web-interface`, `station-lcd-interface`,
  `station-boot`, `bootcount`, `sensorgnome`) — previously deployed as files but enabled only
  by Ansible/manufacturing, so a lost symlink or an Ansible-free image came up with **no app
  layer**. (2) `sensorgnome.service` now orders `After=ctt-board-detect.service
  bootcount.service` — the units that actually produce its two synchronous inputs
  (`/etc/ctt/station-id`, `/etc/bootcount`); the old `After=station-boot` rested on a stale
  premise (station-boot no longer writes `station-id`) and raced `bootcount`. Its malformed
  `WantedBy=…station-boot.service` is dropped. (3) The four long-running `station-*` services
  get `StartLimitIntervalSec=0` + `RestartSec=5`, so a transient boot-time crash-loop retries
  forever instead of hitting systemd's default 5-starts-in-10s give-up and leaving a headless
  station dark (matching the radio driver's policy).
- **Quectel APN is now selected from the SIM's IMSI, not its ICCID country code.**
  `ctt-modem-provision`'s Quectel driver mapped ICCID digits `[2:4] == "46"` to the Telenor
  APN and everything else to `super`. Telenor also ships SIMs in an **`8901` (US-numbered)
  ICCID range**, whose country code reads `01` — so a Telenor subscription was assigned
  `super`, and the network refused the data bearer with **3GPP cause 33
  (`option-unsubscribed`)**: the modem registered with good signal but carried no traffic,
  and it re-broke on every boot because the provisioner kept re-applying the wrong APN.

  Carrier identity now comes from the **IMSI's home PLMN** (`AT+CIMI`; MCC 240 / MNC 08 =
  Telenor Connexion), which names the *subscription*, with a hardened **ICCID issuer-prefix**
  match kept as a fallback for modems that will not report an IMSI. Extend `isTelenorImsi()` /
  `isTelenorIccid()` for new carriers rather than widening the rule. `provision-modem-apn.sh`'s mmcli fallback mirrors the
  same order, and now also refuses to guess from a truncated ICCID.

  Found on V2 station `F5C51E6B6AFA` and corroborated by the Telenor subscription-activity
  log (192 successful sessions on the correct APN over the preceding 8 days, stopping at the
  boot that stamped `super`). Correcting the APN restored the bearer on the first attempt.
  Hardware-verified end-to-end on a Quectel bench station: install 0.3.2 → break `CID1` to
  `super` → reboot → the boot guard recovered the attach context to `internet.cxn` **by IMSI
  PLMN 24008** and the bearer came back with no human touch.

- **ICCID fallback hardened to the Telenor issuer prefix.** When no IMSI is available, APN
  selection uses `isTelenorIccid()` — an ICCID starting `8946` or `890124008` (`8901` + the
  embedded Telenor PLMN `24008`) — not the 2-digit country code. Bare `8901` is a broad US
  range: fleet-validated 2026-07-30, **964 Kore SIMs** live there (`890126…`, `890124011/020`)
  and would have been mis-routed to `internet.cxn`; `890124008` is Telenor-exclusive. The rule
  classifies all **7,858 Telenor + 2,792 Kore** fleet ICCIDs with zero misclassification.

- **`station-modem` now retries forever instead of giving up after four attempts.** The
  profile left `autoconnect-retries` at NetworkManager's default (`-1`), which means **4
  attempts and then permanent surrender** — nothing on the station re-arms it, so a station
  whose modem is still doing a cold cell search at boot (>120 s is normal) stayed offline
  until the next reboot. Now pinned to `0`. Unlike `autoconnect`, `0` is not NM's default, so
  it is written to the keyfile and survives an `install-network` redeploy.

- **Cellular can no longer steal the default route.** `station-modem` now pins
  `ipv4.route-metric=700`, matching what `modem-ecm-up.sh` already does for the Telit path.
  Previously the metric was unset (`-1`), leaving NetworkManager to choose one.

### Changed

- **User-facing CLI symlinks are created by an OTA hook, not only by the Ansible image build.**
  New `install-scripts.sh` (post-merge) symlinks the shell CLIs — `station-id`, `program-radios`,
  `program-radio`, `update-station`, `bash-update-station`, `upload-station-data`,
  `collect-diagnostics` — into `/usr/local/sbin`, so an OTA self-heals a lost symlink and an image
  built without the legacy Ansible role still ships its CLIs. Moves CLI ownership into the
  monorepo (retiring that slice of the Ansible boot-path debt). Runs in image-bake mode too.
- `ctt-modem-provision` **0.3.2** built, tagged (`ctt-modem-provision-v0.3.2`) and published
  (armhf binary + `.sha256`); the fleet pin (`system/native/ctt-modem-provision.version`) is
  rolled to **0.3.2**, so stations pick it up on the next OTA.
- **All modem AT-command strings are centralized** in `native/lib/ctthw/modem/at_commands.h`
  (named constants + a `cgdcontDefine` builder), replacing inline literals across the Quectel,
  Telit, and modem-detect drivers — one authoritative place to find or change a command.

---

## [2.3.2] — 2026-07-29

### Fixed

- **The front-panel "IP Address" screen now shows USB-ethernet dongles.** The LCD menu
  matched only `eth*`/`wlan*` interface names, so a USB-ethernet adapter that enumerates
  under a predictable name (`enx<mac>`) or the legacy `usb0` displayed a blank IP despite
  having a valid address. The interface allowlist now also matches `enx*`/`usb0` (anchored,
  so virtual interfaces such as `veth*` that merely contain "eth" are excluded), and long
  `enx…` names get their own row before the address. The modem's point-to-point NAT (`mdm0`,
  `192.168.225.x`) and `ppp0` remain deliberately off the screen — they are not reachable
  addresses. (PR #48.)

## [2.3.1] — 2026-07-24

### Changed

- **`ctt-modem-provision` pinned to 0.3.1** across the fleet.
- **`/etc/ctt/station-image` is now stamped with the image build date** at CI build time
  (`build-image.yml`), instead of inheriting the frozen base-image cut date it was hand-set
  to. It is distinct from `/etc/ctt/station-software`, which records the last software-update
  time on every `update-station` run (build and OTA).

### Fixed

- **Native binaries now actually land in built images.** Since the native-tool pipeline was
  introduced, `install-native.sh` verified each fetched armhf binary by executing it for
  `--version` — which cannot run under the image build's qemu-arm emulation, so the check
  failed and the install was silently skipped, publishing images with **no** native binaries
  (modem provisioner, radio/blu drivers, board-detect). In `CTT_BUILD_MODE` the tool now
  trusts the checksum+pin and skips the exec smoke test, and the build fails loudly if a
  deploy hook errors, so a broken bake can never ship as a green build. A second silent
  failure — `nmcli connection reload` hard-failing in the chroot (no NetworkManager D-Bus) —
  is fixed by skipping runtime NM/udev reloads in build mode; the configs apply on first
  boot. (PRs #44, #46.)
- **Telit LE910Q1 RNDIS→ECM conversion completes in a single boot** (`ctt-modem-provision`
  0.3.0 → 0.3.1). A fresh/replacement Telit previously took two station reboots to converge —
  boot 1 switched the USB composition (`AT#USBCFG=1` + reboot) and deferred the ECM bind to
  the next boot, leaving `mdm0` down (no cellular) until then. The provisioner now waits for
  the modem to re-enumerate as ECM within the same boot, reopens the AT port, and completes
  the bind (`AT#ECM=1,0`) — running `Before=ModemManager` so the wait is uncontended, and
  failing open to the previous two-boot behavior if the port does not return in time.
  Hardware-validated on a fresh RNDIS Telit (switch → reboot → rebind in ~8 s); an
  already-provisioned modem stays a cheap read-only no-op.
- **BluSeries / 434-radio driver no longer fail-loops when its USB device is unplugged.**
  The `ctt-blu-driver@` / `ctt-radio-driver@` template units set `StartLimitIntervalSec=0`
  (never give up) but had only an ordering (`After=`) dependency on their device, so
  unplugging a receiver left the instance restarting every 2 s forever
  (`open serial /dev/ctt-…/chN: No such file or directory`, restart counter climbing).
  Added `BindsTo=` the `.device` unit so systemd **stops** the instance on removal (udev
  restarts it on re-attach), plus `ConditionPathExists=` as belt-and-suspenders against the
  unplug/settle-window race. The retry-forever behavior for a *present-but-glitching*
  receiver is preserved — the fix only distinguishes *absent* from *glitching*.
- **BluSeries detections poll no longer throws `TypeError: … reading 'forEach'` when a
  receiver stops responding.** On a timed-out detections poll (e.g. the FTDI dongle is
  present but the adapter board is disconnected) the scheduler delivers `data: undefined`;
  `blu-base-station.js` iterated it directly and threw every poll cycle. It now guards
  `Array.isArray(job.data)` before iterating, mirroring the existing VERSION-task guard.

## [2.3.0] — 2026-07-23

### Added

- **Native cellular modem provisioner extended to the Quectel EC25** (`ctt-modem-provision`
  0.2.0 → 0.3.0). Modem provisioning is refactored into a small, unit-tested `ctthw/modem`
  C++ module — an AT-port transport with one driver per modem family. For a Quectel, the
  tool keeps the LTE **attach APN** (`CGDCONT` CID1) matched to the SIM so it cannot diverge
  from the NetworkManager **dial APN**; that divergence is rejected by the network with 3GPP
  **cause 55** and leaves the modem *registered but passing no data*. It reads the SIM ICCID
  (`AT+QCCID`) and, only when CID1 carries a non-empty **wrong** APN, rewrites it
  (`CFUN=0` / `CGDCONT=1,"IP",<apn>` / `CFUN=1`); a blank CID1 (which attaches on the
  network-default APN) is left alone. Runs `Before=ModemManager`, idempotent and fail-open,
  so a stale or recycled attach context self-heals on the next boot. Verified against the
  Quectel AT Commands Manual V2.0 and on hardware. The Telit LE910Q1 ECM data-path
  provisioning is unchanged.

### Changed

- **`check-sim-id.sh` renamed to `provision-modem-apn.sh`** and reworked to consume
  `/run/ctt/modem-apn` (written by the native provisioner) as the single source for the dial
  APN — so the modem's attach APN and NetworkManager's dial APN share one origin and cannot
  diverge — keeping the previous `mmcli`-ICCID mapping as a fallback.
- New udev symlink `/dev/ctt-modem-at` for the Quectel EC25 AT control port (interface 02).
- The native-tool release workflow now publishes formatted Markdown release notes.

### Fixed

- **The modem now requests IPv4-only.** These M2M SIMs/APNs are provisioned IPv4-only, so a
  dual-stack (IPv4v6) bearer request made the modem attempt an IPv6 PDN the network refused
  (QMI `CallFailed` / `ip-version-mismatch`). Sets `ipv6.method=disabled` on the
  `station-modem` profile. (`gsm.ip-type` is not usable on NetworkManager 1.30 / Bullseye.)
- **First-time SensorGnome tag-database upload no longer fails** when there is no existing
  `SG_tag_database*` file to remove (`rm -f`).

## [2.2.4] — 2026-07-22

### Fixed

- **SensorGnome tag-database uploads now persist.** The `/upload-sg-tag-file` handler called
  `fs.writeFileSync()` but never imported `fs`, so every upload threw `ReferenceError: fs is
  not defined` — but only *after* it had already `rm`'d the existing `SG_tag_database*` file.
  Net effect: uploading a tag database deleted the current one and wrote nothing, leaving an
  empty/missing `SG_tag_database.sqlite` and the SensorGnome interface failing with
  `no such table: tags`. Adds the missing `import fs from 'fs'`. (PR #40)

## [2.2.3] — 2026-07-13

### Fixed

- **Radio MCUs with only a bootloader (no app) can now be flashed.** A blank/erased Feather
  32u4 enumerates as USB `239a:000c` instead of the app's `239a:800c`. The radio udev rule
  matched `800c` only, so a bootloader-mode board never got a `/dev/ctt-radio/chN` symlink —
  `program-radios` couldn't discover it, and the 1200-baud touch waited forever for a
  disconnect that never comes. Now the radio udev generator emits **three rules per channel**:
  - a **PID-agnostic identity** symlink (the physical port *is* the channel, in app *or*
    bootloader mode) — restoring discovery of a blank board;
  - a `CTT_RADIO_MODE=app|bootloader` property;
  - the per-channel driver launch **gated on the app PID (`800c`)** — so a board dropping to
    the bootloader mid-flash never relaunches the driver, and `avrdude` keeps the port.

  `program-radio.sh` reads the mode and either does the 1200-baud touch (app board) or flashes
  **directly** (bootloader board). Validated on a V3 station: a blank board flashed via the
  direct path, an app board via the touch path.
- **Disabling the cellular modem now actually disables it on ECM-mode Telit units.** The
  deployed Telit LE910Q1 enumerates as `1bc7:7021` (CDC-ECM), but `modem-power.sh` and
  `modem-boot-state.sh` matched only the RNDIS PID `1bc7:7020`. "Disable modem" wrote the
  intent marker but never deauthorized the device — it stayed `authorized=1`, ModemManager
  kept the modem, cellular kept passing traffic, and a "disabled" modem came back **fully on**
  after a reboot. Both scripts now match `7021` and `7020` (as `enable-modem`/`modem-wake`/
  `modem-datapath` already did). Hardware-validated: disable → `authorized=0` + ModemManager
  drops it; disable + reboot → stays off.
- **`station-hardware-server` `/sensor` returns the sensor snapshot again.** The root
  `/sensor` route was missing (404); re-added to serve `/run/ctt/sensors.json`.

### Changed

- **Radio flashing is now pure shell.** The 1200-baud touch is an `stty` step in
  `program-radio.sh` (hold at 1200 baud + `hupcl`, close → DTR drop), and `avrdude` does the
  write. The former native `ctt-radio-flash` tool is removed — nothing is cross-compiled for
  flashing.

## [2.2.2] — 2026-07-10

Replaces 2.2.1's first-boot resize mechanism, which did not actually complete on the CM3+
station image. Station software is otherwise functionally identical to 2.2.0/2.2.1.

### Fixed

- **First-boot rootfs expansion now actually completes — fail-safe and stateless.** 2.2.1
  restored the stock `init=…/init_resize.sh` cmdline hook, but on the CTT image its two-stage
  reboot dance (grow partition → reboot → `resize2fs_once` grows the fs) never finishes the
  filesystem grow: the extra boot-time reboots / service ordering leave a full-size partition
  with a ~3.2 GB filesystem (stations still booted ~96% full). 2.2.2 strips `init_resize` from
  `cmdline.txt` and hands expansion to **`ctt-firstboot-resize.service`**:
  - **fail-safe** — runs as a normal oneshot *after* the OS is up (not PID 1), so a failure
    leaves a booted, SSH-reachable station instead of an unbootable card;
  - **stateless** — decides purely from on-disk geometry (no marker / no `ConditionPathExists`),
    so a QAQC-booted-then-captured base image can't silently disable field expansion, and it
    self-heals;
  - **one pass, no reboot** — grows the partition (`sfdisk --no-reread -N` + `partx -u`) and the
    filesystem (`resize2fs`) using only base-image tools (what `growpart` does internally).
  - Validated end-to-end on a fresh CM3+ eMMC flash: the rootfs expands to fill the card on
    first boot.

## [2.2.1] — 2026-07-09

Image-pipeline fixes so CI-built images burn fast and expand correctly on first boot,
plus a license-metadata correction. The station software is functionally identical to 2.2.0.

### Fixed

- **Images burned ~3× too slowly.** `arm-runner`'s `optimize_image` zeroed free space but
  never truncated the padded image, so every CI image shipped ~6 GiB uncompressed — it
  compresses to ~886 MB `.xz`, but the imager writes the full 6 GiB (~30 min over the CM3+
  USB 2.0 link vs. the historical 5–10 min). The build now runs a real **PiShrink** (`-s`,
  truncate only) and purges apt/npm/log caches before shrinking (~6.3 GiB → ~3.6 GiB).
- **Stations booted 96% full — the rootfs never auto-expanded.** The base image had lost
  the standard Raspberry Pi first-boot resize hook (`init=…/init_resize.sh`, which
  self-deletes after first boot; a post-first-boot image had become a base), and a custom
  `rc.local` expand workaround looped forever instead of rebooting. The build now restores
  the stock `init_resize` hook in `cmdline.txt` and drops the `rc.local` hack, so the
  rootfs expands to fill the card on first boot (stock Pi OS behaviour).

### Changed

- **License metadata corrected to AGPL-3.0.** `LICENSE.txt` is GNU AGPL v3, but
  `package.json` and the README declared `ISC`. Set `package.json` to `AGPL-3.0-or-later`
  and updated the README to match `LICENSE.txt` — no change to the license itself.

## [2.2.0] — 2026-07-09

Migrates the Telit LE910Q1 cellular data path from RNDIS to CDC-ECM and makes
modem provisioning zero-touch at boot. RNDIS is deprecated in the Linux kernel and
is not manageable by ModemManager; ECM is standards-based and yields a clean,
MM-visible `mdm0` path. A modem is provisioned once (the NV state persists), and if
a fresh/replacement modem is ever fitted, an idempotent boot guard converts it
automatically — no manual step. Hardware-validated from ECM-provisioned,
RNDIS-provisioned, and factory (unbound) starting states.

### Added

- **`ctt-modem-provision.service` — idempotent ECM boot guard.** Runs
  `Before=ModemManager` for exclusive AT-port access (no MM/NM shutdown, so none of
  the old provisioner races). Read-only no-op on an already-provisioned modem;
  converts a fresh/swapped RNDIS modem to ECM over two boots (`AT#USBCFG=1` + reboot,
  then `AT#ECM=1,0`); re-asserts a lost bind. Fails open — never blocks boot.
- **`ctt-modem-ecm-up.service` + `modem-ecm-up.sh` — ECM data-path bring-up.**
  NetworkManager folds the ECM net port into the ModemManager modem and never DHCPs
  `mdm0`, so it is brought up out of band: `dhclient` on `mdm0` (the module serves
  `192.168.225.1` and leases `.2`, the Telit-documented handshake), then the default
  route is re-pinned to a high fallback metric (700) so cellular never preempts
  wired/Wi-Fi.

### Changed

- **Telit data path RNDIS → CDC-ECM.** `ctt-modem-provision` (0.2.0) provisions ECM
  (`AT#USBCFG=1` + `AT#ECM=1,0`) and migrates existing RNDIS units. udev rules
  dual-recognize `1bc7:7021` (ECM) alongside `1bc7:7020` (RNDIS, transitional) and
  rename the net device to `mdm0`; `modem-datapath`/`modem-wake`/`enable-modem`
  recognize `7021`.
- **systemd units invoke their scripts via `/bin/bash <script>`** instead of relying
  on the file's executable bit, which does not survive Git reliably on Windows.

### Fixed

- **`ctt-modem-ecm-up.service` failed `203/EXEC`.** `modem-ecm-up.sh` had been
  committed non-executable, so the data interface never came up on a clean deploy.
  The script is executable again and the unit invokes it via `bash`.
- **The ECM boot guard was deleted immediately after install.**
  `ctt-modem-provision.service` was still listed in the systemd `REMOVED` manifest
  from when the RNDIS auto-provisioner was retired, so the OTA installed the new
  guard and then removed it. Dropped the stale entry.

## [2.1.1] — 2026-07-08

CI/image-pipeline release: release tags now build immutable, versioned images.

### Changed

- **`build-image` auto-builds on a release-tag push (`v*.*.*`)** and serializes
  builds. Each build publishes an **immutable, version-named** artifact
  (`sensor-station-v<version>.img.xz`) rather than a bare-date name, and cuts a
  GitHub **pre-release** pointing at it. The `lts_26_07` image line is isolated under
  `images/lts_26_07/` so it never touches the current public LTS.

## [2.1.0] — 2026-07-08

Cellular modem robustness and the incremental CI image build.

### Added

- **`ctt-modem-wake.service` — modem power-state recovery at boot.** A Telit
  LE910Q1 in `ON_OFF#` shutdown (after a hard reset / VBAT loss) does not
  self-enumerate; this pulses `ON_OFF#` so it returns before ModemManager scans.
  No-op when the modem is already present or intent is OFF.
- **Incremental CI image build (`build-image`).** Loop-mounts the previous image
  under qemu-arm and runs `update-station.sh` inside it, then shrinks and publishes
  to S3 — the manual image process, automated.

### Fixed

- **Web-triggered `update-station` killed itself.** The dashboard spawns the updater
  inside `station-radio-interface`; restarting that service mid-run SIGKILLed the
  updater. The radio-interface restart is now the last action, and the updater runs
  in a decoupled transient unit.

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
