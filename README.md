# CTT Sensor Station Software

Software that runs on the **CTT Sensor Station** — a solar-powered, cellular-
connected wildlife radio-tracking base station built on a Raspberry Pi Compute
Module. The station listens for signals from animal-borne radio tags across
several radio technologies, logs the detections, and uploads them to a cloud
backend for researchers.

This monorepo holds the on-device application layer: a set of Node.js services,
a layer of small compiled C++ hardware tools, and the OS configuration (systemd
units, udev rules, boot and update scripts) that ties them together.

`v2.3.4` · Node.js (ES modules) + C++17 · Raspberry Pi OS (32-bit armhf)

---

## What it does

A station continuously:

- **Detects radio tags** on multiple receivers — 434 MHz CTT tags via Adafruit
  Feather receivers, plus support for other CTT radio products — and runs a
  separate tag-detection layer for Lotek/Motus tags via SDR dongles.
- **Logs detections and telemetry** to local storage as rotating CSV files.
- **Monitors itself** — GPS position/time, battery and solar voltages, board
  temperature, cellular signal — and surfaces this on a front-panel LCD, a local
  web dashboard, and periodic check-ins to a cloud backend.
- **Stays in the field unattended** — cellular uplink, an over-the-air (OTA)
  update mechanism, and a status-LED/LCD interface for in-field diagnostics.

---

## Architecture

Hardware bring-up and direct device I/O live in a native layer (compiled C++
tools started by systemd/udev). The Node.js services are **consumers** of that
layer: they read and write small, well-defined files and sockets under
`/run/ctt/` rather than touching the hardware directly. This keeps all shared-bus
(I2C) access behind a single arbitration layer and lets the application restart
without disturbing hardware state.

```
   ┌─────────────────────── native layer (C++ / systemd / udev) ───────────────────────┐
   │  ctt-board-detect   → /run/ctt/board.env        (board identity, each boot)        │
   │  ctt-sensors        → /run/ctt/sensors.json      (ADC voltages + temperature)      │
   │  ctt-radio-driver@N → /run/ctt/radios/chN.sock   (one per 434 MHz receiver)         │
   │  ctt-blu-driver@N   → /run/ctt/blu/chN.sock      (one per BluSeries receiver)        │
   │  ctt-leds           ← /run/ctt/leds              (status LED actuation)             │
   │  ctt-lcd            ← /run/ctt/lcd               (character-LCD actuation)          │
   └───────────────▲───────────────────────────────────────────────▲───────────────────┘
                   │ read/write file + socket contracts              │
   ┌───────────────┴───────────────────────────────────────────────┴───────────────────┐
   │  station-hardware-server   HTTP API for hardware I/O (sensors, GPS, modem, USB)     │
   │  station-radio-interface   radio acquisition, data pipeline, config, control (WS)   │
   │  station-interface         local web dashboard (auth, proxy, live data)             │
   │  station-lcd-interface     front-panel LCD menu + buttons                           │
   └────────────────────────────────────────────────────────────────────────────────────┘
                   │                                   │
              local storage  ───────────────►   cellular uplink ──► cloud backend
```

A separate tag-detection layer (SDR-based, for the Motus network) runs alongside
these services and writes to its own data directory; it lives in a companion
repository.

### Components

| Path | Component | Role |
|------|-----------|------|
| [src/station-hardware-server/](src/station-hardware-server/) | Hardware HTTP API | REST API (port 3000) for sensors, GPS, modem, USB, network |
| [src/station-radio-interface/](src/station-radio-interface/) | Radio interface | Radio acquisition, the CSV data pipeline, station config, and a WebSocket control channel (port 8001) |
| [src/station-interface/](src/station-interface/) | Web dashboard | Local web UI (port 80): auth, static assets, live data, proxy to the hardware API |
| [src/station-lcd-interface/](src/station-lcd-interface/) | LCD interface | Front-panel character-LCD menu system and GPIO buttons |
| [src/gps-client/](src/gps-client/) | GPS client | `gpsd` client helper shared by the services |
| [src/hardware/](src/hardware/) | Hardware libs | Legacy in-process hardware helpers (being superseded by the native layer) |
| [src/station-utils/](src/station-utils/) | Utilities | Shared helpers |
| [src/usb-storage-driver/](src/usb-storage-driver/) | USB storage | Detect/mount/unmount removable storage |
| [native/](native/) | Native tools | C++ build-kit: the `ctthw` hardware library and the `ctt-*` device tools |
| [system/](system/) | OS config | systemd units, udev rules, boot scripts, OTA update hooks, radio maps, migrations |
| [docs/](docs/) | Documentation | Additional reference material |

---

## Runtime contracts

The native layer and the Node services communicate only through these stable
interfaces. Documenting them here means a change's blast radius can be reasoned
about without reading every consumer.

| Interface | Producer | Consumers | Format |
|-----------|----------|-----------|--------|
| `/run/ctt/board.env` | `ctt-board-detect` (boot) | services + boot scripts + udev | `KEY=value` (board id, version, revision) |
| `/run/ctt/sensors.json` | `ctt-sensors` (daemon) | hardware-server `/sensor` | JSON snapshot (voltages, temperature) |
| `/run/ctt/radios/chN.sock` | `ctt-radio-driver@N` | radio-interface | AF_UNIX, NDJSON (one JSON object per line) |
| `/run/ctt/blu/chN.sock` | `ctt-blu-driver@N` | radio-interface | AF_UNIX, NDJSON (one JSON object per line) |
| `/run/ctt/leds` | radio-interface | `ctt-leds` | `key=value` desired LED state |
| `/run/ctt/lcd` | lcd-interface | `ctt-lcd` | 144-byte framebuffer (8 CGRAM glyphs + 80 cells) |
| `/etc/ctt/station-config.json` | web UI / radio-interface | services | JSON (persistent, UI-mutated) |
| HTTP `127.0.0.1:3000` | hardware-server | radio-interface, lcd-interface, web | REST |
| WebSocket `:8001` | radio-interface | web dashboard | JSON control + live data |
| `gpsd :2947` | system `gpsd` | services | gpsd protocol |

---

## Quick Start

The services run on the station as systemd units in production. For development,
each can be started directly:

```bash
npm install

npm run start-hardware-server   # hardware HTTP API (port 3000)
npm run start-radio-interface   # radio acquisition + data pipeline
npm run start-web-interface     # local web dashboard (port 80)
npm run start-lcd-interface     # front-panel LCD
```

The native C++ tools are built out of band and cross-compiled to armhf — see
[native/README.md](native/README.md). Stations fetch prebuilt, version-pinned
binaries rather than compiling on-device.

---

## Build & deployment model

- **Image build** — two paths. A base Raspberry Pi OS image is produced from
  infrastructure-as-code (Ansible) — the source of truth for building the *platform*
  from scratch on a new OS generation. On top of that, a CI workflow
  ([`build-image.yml`](.github/workflows/build-image.yml)) *incrementally* builds
  distributable images: it lays the current software onto the last image and
  publishes a date-stamped `.img.xz`. See [.github/workflows/README.md](.github/workflows/README.md).
- **OTA updates** — stations update in place by pulling this repository and
  running an update script that drives a modular hook system
  ([system/scripts/hooks/](system/scripts/)). Hooks deploy systemd units, udev
  rules, network profiles, and fetch the pinned native binaries. New deploy steps
  are added by dropping a script into the hook directory — no edit to the updater
  itself.
- **Native binaries** — each C++ tool is versioned independently; the fleet pins
  a version per tool ([system/native/](system/native/)) and the OTA hook fetches
  and verifies the matching prebuilt binary.

---

## Hardware

The station targets multiple board revisions (referred to as V2 and V3). Key
on-board devices the software interacts with:

| Subsystem | Device | Interface |
|-----------|--------|-----------|
| 434 MHz receivers | Adafruit Feather (ATmega32U4) | USB serial |
| BluSeries receivers | FTDI FT231X USB-UART (`0403:6015`) | USB serial (DTR must be de-asserted — see below) |
| Analog sensors (V3) | MAX11645 ADC, TMP411 temperature | I2C |
| Analog sensors (V2) | ADS7924 ADC, TMP102 temperature | I2C |
| Status LEDs / straps (V3) | SX1509B I/O expander | I2C |
| Board identity | I2C EEPROM with factory-unique serial | I2C |
| Real-time clock | MCP79412 (V3) / DS3231 (V2) | I2C |
| Front-panel display | HD44780 character LCD via PCF8574 backpack | I2C |
| GPS | u-blox / Quectel GNSS module | UART + PPS |
| Cellular | LTE modem (Telit / Quectel) | USB |
| WiFi (optional uplink) | RTL8811CU USB adapter | USB |

Chip-level detail and the full I2C map are documented in
[native/README.md](native/README.md).

**BluSeries DTR:** on newer BluSeries hardware the FT231X's DTR line is wired to
the receiver's reset. Opening a tty asserts DTR by default, which holds such a
receiver in reset — its LEDs light but it never answers VERSION/STATS. The blu
driver therefore de-asserts DTR after opening (`ctt-radio-driver --dtr clear`, set
in [ctt-blu-driver@.service](system/systemd/ctt-blu-driver@.service)); power is
from USB regardless of DTR, so clearing only releases reset. This needs
`ctt-radio-driver >= 0.3.0` — keep [the fleet pin](system/native/ctt-radio-driver.version)
at `>= 0.3.0` wherever the blu unit is deployed.

**Cellular data path (Telit CDC-ECM).** The Telit LE910Q1 self-NATs the cellular
context onto its CDC-ECM net port (modem-internal DHCP server at `192.168.225.1`). A
udev rule ([78-ctt-telit-net.rules](system/udev/78-ctt-telit-net.rules)) renames
that interface to a stable `mdm0` (off the `eth*` pool). Because ModemManager owns
the modem and NetworkManager never manages that net port, `mdm0` is brought up **out
of band by [`ctt-modem-ecm-up.service`](system/systemd/ctt-modem-ecm-up.service)**:
`dhclient` on `mdm0`, then the default route is re-pinned to a high fallback metric
so a wired/Wi-Fi uplink stays primary and cellular is the failover. The gsm/PPP
profile is deliberately kept from autodialing to avoid an `ESM_MULTIPLE_PDN`
collision with that context ([modem-datapath.sh](system/scripts/modem-datapath.sh)).
The modem is provisioned to ECM (`AT#USBCFG=1` + `AT#ECM=1,0`) once and re-checked
each boot by the idempotent [`ctt-modem-provision.service`](system/systemd/ctt-modem-provision.service)
guard, which converts a fresh/RNDIS modem automatically.

After a hard reset (VBAT loss) the Telit can come up in **ON_OFF# shutdown** —
absent from the USB bus, so it never self-enumerates. `ctt-board-detect`'s modem
boot chain assumed self-enumeration, so the station used to come up with no modem
until a manual `enable-modem`. [ctt-modem-wake.service](system/systemd/ctt-modem-wake.service)
([modem-wake.sh](system/scripts/modem-wake.sh)) closes that gap: at boot, when the
modem is intent-ON (no disable marker) but absent from the bus, it pulses the
ON_OFF# line (GPIO from `board.env`, fallback 23) so the Telit powers on and
enumerates; the normal chain then authorizes it and NetworkManager leases `mdm0`.
It no-ops when a modem is already present or the operator disable marker is set,
and needs no ON_OFF# pin on modems that self-power. Verified on v3r3, v3r0, and a
Telit-on-V2 board (all use GPIO 23).

---

## License

Licensed under the **GNU Affero General Public License v3.0 or later**
(`AGPL-3.0-or-later`). See [LICENSE.txt](LICENSE.txt).
