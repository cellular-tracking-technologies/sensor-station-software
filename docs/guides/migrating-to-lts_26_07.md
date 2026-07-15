# Migrating a SensorStation to the `lts_26_07` image (v2.2.x)

This is a **major upgrade** from the previous production LTS (**v1.7.0**, the `lts_24-06`
image line) to **v2.2.x** (`lts_26_07`) — a full 2.x rework, not a point update.
**Re-flashing the `lts_26_07` image is the recommended path.**

Two behavior changes to know before you start:

- **The modem ships OFF.** Enable it from the LCD menu or the web dashboard after first boot.
- **Updates no longer auto-reboot.** Reboots are operator-driven (LCD menu or explicit command).

For per-release detail, see [`CHANGELOG.md`](../../CHANGELOG.md). This guide is the
migration-oriented summary, organized by impact.

## At a glance

| | Old LTS (`lts_24-06`) | New LTS (`lts_26_07`) |
|---|---|---|
| App version | **v1.7.0** | **v2.2.x** |
| Cellular | Quectel EC25, QMI + ModemManager **PPP** | Telit LE910Q1, **CDC-ECM** (`mdm0`), zero-touch boot provisioning |
| Hardware I/O | in the Node app at boot | **native C++ tools** → `/run/ctt/` contracts; the app is a consumer |
| Driver delivery | compiled on-station | **prebuilt armhf binaries** fetched over OTA, per-tool version pins |
| Image pipeline | manual, date-named | **CI-built, immutable `v<version>` images** |

## What changed, by theme

### Native hardware/radio layer (breaking, v2.0.0)
Hardware bring-up and direct device I/O move **out of the Node app** into small compiled C++
tools started by systemd/udev; the Node services become consumers of stable file/socket
contracts under **`/run/ctt/`**.
- `ctt-board-detect` → `/run/ctt/board.env` (single runtime identity); `ctt-radio-driver@N`
  (434 MHz → `/run/ctt/radios/chN.sock`); `ctt-blu-driver@N` (BluSeries → `/run/ctt/blu/chN.sock`);
  `ctt-sensors` → `/run/ctt/sensors.json`; `ctt-leds`; `ctt-lcd`. (Radio firmware flashing is
  a shell script — `program-radio.sh` + `stty` + `avrdude` — not a native tool.)
- `ctt-device-config` applies one canonical per-board-revision `/boot/config.txt`.
- Front-panel buttons move to the kernel `gpio-keys`/evdev path.
- **Stations never compile** — drivers arrive as versioned, checksummed prebuilt binaries over OTA.

### Cellular: Quectel EC25 (QMI/PPP) → Telit LE910Q1 (RNDIS → ECM)
- **v1.8.0:** EC25/QMI/PPP → Telit **RNDIS** (`mdm0`, modem NAT); PPP path dropped; Quectel
  enable/disable moved to per-device USB authorize; radios identified by USB VID:PID.
- **v2.2.0:** RNDIS → **CDC-ECM** (kernel-supported, ModemManager-visible). Provisioning is
  **zero-touch** — an idempotent boot guard converts a fresh/swapped modem automatically and is a
  no-op on an already-provisioned one; `mdm0` comes up via DHCP with a high fallback route metric
  so cellular never preempts wired/Wi-Fi.
- A boot service pulses `ON_OFF#` so a Telit in shutdown (after a hard reset) self-recovers.
- **Modem NV persists across a reflash** — so after flashing there is **no manual provisioning step**.

### OTA + delivery
- Modular post-merge hooks (`system/scripts/hooks/post-merge.d/*.sh`): new subsystem deploys are a
  one-file drop-in. A `REMOVED` manifest propagates retired/renamed units.
- OTA is durable (`sync` after pull + hooks) and hardened (`--ff-only`, retry, abort-on-failure).

### Image build & first boot
- CI builds **immutable, versioned images** (`sensor-station-v<version>.img.xz`) and cuts a
  GitHub pre-release; images burn fast (PiShrink + cache purge) and the rootfs **auto-expands** to
  fill the eMMC on first boot (fail-safe, one pass).

### Front panel & services
- LCD boot/shutdown/updating splashes + a radio-fault banner; native re-init recovers a warm
  controller. Native `ctt-leds` / `ctt-sensors` (V3 **and** V2 sensor sets) with quieter logging.
  BluSeries receivers discovered via udev.

### Network reachability
- Wi-Fi power-save disabled (stations stayed unreachable when the USB Wi-Fi adapter slept);
  wired default-route metric pinned below cellular; Node-20 `localhost`→IPv4 fix; services launch
  via `node` directly for clean, fast restarts.

## How to migrate

### Recommended — re-flash the `lts_26_07` image
1. Flash the CM3+ eMMC via `rpiboot` — see
   **[Flashing the Compute Module](https://cellular-tracking-technologies.github.io/ctt_documentation/flashingComputeModule.html)**.
   Tip: use a **USB 2.0** host port (not USB 3.0) and a **USB-A→USB-C** cable for a fast, reliable
   burn; verify the published SHA256; keep the imager's verify step on.
2. First boot **auto-expands** the rootfs and comes up with the **modem off**.
3. The modem needs **no manual provisioning** — the ECM boot guard converts/verifies it
   automatically (and its NV state persists across the reflash anyway).
4. Enable the modem if used, confirm the station checks in.

### Alternative — in-place field upgrade (only if a station can't be reflashed)
[`system/migrations/`](../../system/migrations) provides a live, in-place upgrade (discard local
drift → cross to the new LTS branch → `update-station` → reboot). It is **safe-by-default and
requires `--force`**. Re-flashing remains the recommended upgrade; use in-place only for a fielded
station you can't physically reach.

## Post-migration checklist

- **Rootfs expanded:** `df -h /` shows the full eMMC (not ~3.2 GB / ~96 % full).
- **Services active:** `ctt-board-detect`, `ctt-sensors`, `ctt-leds`, `ctt-lcd`,
  `ctt-radio-driver@*`, `ctt-blu-driver@*`, `sensorgnome` (`systemctl is-active …`).
- **Runtime contracts present:** `/run/ctt/board.env`, `/run/ctt/sensors.json`, and sockets under
  `/run/ctt/radios/` and `/run/ctt/blu/`.
- **Radios detected**; **LCD** shows status.
- **Modem (if enabled):** `mdm0` up over ECM (`mmcli` sees it); cellular isn't preempting a wired
  or Wi-Fi uplink.
- **Station checks in** to the cloud.

## Version timeline (v1.7.0 → v2.2.2)

| Version | Theme |
|---|---|
| **1.7.0** | *(old LTS baseline)* v3.3 radio map; station-designation files |
| 1.8.0 | Telit **RNDIS** cellular + modular OTA hooks + adaptive `/modem` cache |
| **2.0.0** | **Native hardware/radio layer** (breaking) |
| 2.0.1 | Node-20 `localhost`→IPv4; OTA-from-dashboard fix |
| 2.1.0 | Modem wake-at-boot; incremental CI image build |
| 2.1.1 | Immutable, versioned images + pre-release |
| **2.2.0** | Cellular **RNDIS → CDC-ECM**, zero-touch provisioning |
| 2.2.1 | Fast burns (PiShrink); license metadata (AGPL-3.0) |
| **2.2.2** | Fail-safe, stateless first-boot resize |

See [`CHANGELOG.md`](../../CHANGELOG.md) for the full per-release detail.
